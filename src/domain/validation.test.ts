import { describe, expect, it, vi } from 'vitest';
import { createDemoData } from '@/data/demo';
import { bootstrapMutations } from '@/data/sync';
import { syncSchema } from '../../server/src/validation';
import { contactSchema, countedStockSchema, medicineDraftSchema, mutationSchema, parseQuantity, positiveQuantitySchema, profileNameSchema } from './validation';

vi.mock('@/data/api', () => ({ apiEnabled: false, apiRequest: vi.fn(), ApiError: class extends Error {} }));

describe('Společná validace klienta a API', () => {
  it.each(['1e309', 'Infinity', 'NaN', '', '0', '-1', '1000000.01', '1.001'])('odmítne neplatné balení %j před vytvořením mutace', (input) => {
    const data = createDemoData(), medication = data.medications[0]!, regimen = data.regimens[0]!;
    const packageSize = parseQuantity(input);
    const draft = { ...medication, packageSize, times: regimen.times, daysOfWeek: regimen.daysOfWeek };
    expect(positiveQuantitySchema.safeParse(packageSize).success).toBe(false);
    expect(medicineDraftSchema.safeParse(draft).success).toBe(false);
    const change = { id: 'test', entity: 'medication', createdAt: medication.createdAt, payload: {
      medication: { ...medication, packageSize }, regimen,
      inventory: { id: medication.id, medicationId: medication.id, kind: 'initial', quantity: packageSize, occurredAt: medication.createdAt },
    } };
    expect(mutationSchema.safeParse(change).success).toBe(false);
    expect(syncSchema.safeParse({ mutations: [change] }).success).toBe(false);
  });
  it('podporuje desetinnou čárku, hranice a odmítne neplatné přepočítání zásoby', () => {
    expect(positiveQuantitySchema.parse(parseQuantity(' 30,5 '))).toBe(30.5);
    expect(positiveQuantitySchema.parse(1_000_000)).toBe(1_000_000);
    expect(positiveQuantitySchema.parse(0.01)).toBe(0.01);
    expect(countedStockSchema.parse(0)).toBe(0);
    for (const value of [Infinity, NaN, -1, 1_000_001, 0.001]) expect(countedStockSchema.safeParse(value).success).toBe(false);
  });
  it('odmítne jméno o 121 znacích ve formuláři i v celé dávce a přijme opravený vstup', () => {
    const original = bootstrapMutations(createDemoData(), 'account')[0]!;
    const profile = original.payload as Record<string, unknown>;
    const invalid = { ...original, payload: { ...profile, displayName: 'A'.repeat(121) } };
    const valid = { ...original, payload: { ...profile, displayName: 'A'.repeat(120) } };
    expect(profileNameSchema.safeParse('A'.repeat(121)).success).toBe(false);
    expect(profileNameSchema.safeParse('   ').success).toBe(false);
    expect(mutationSchema.array().safeParse([valid, invalid]).success).toBe(false);
    expect(syncSchema.safeParse({ mutations: [valid, invalid], force: true }).success).toBe(false);
    expect(profileNameSchema.parse(' Jana ')).toBe('Jana');
    expect(mutationSchema.parse(valid).payload).toMatchObject({ displayName: 'A'.repeat(120) });
    expect(syncSchema.safeParse({ mutations: [valid] }).success).toBe(true);
  });
  it('chrání názvy léků, dávky a související kontaktní údaje stejnými limity', () => {
    const data = createDemoData(), medication = data.medications[0]!, regimen = data.regimens[0]!;
    const draft = { ...medication, times: regimen.times, daysOfWeek: regimen.daysOfWeek };
    expect(medicineDraftSchema.safeParse({ ...draft, name: 'A'.repeat(181) }).success).toBe(false);
    expect(medicineDraftSchema.safeParse({ ...draft, strength: 'A'.repeat(501) }).success).toBe(false);
    expect(medicineDraftSchema.safeParse({ ...draft, times: [{ ...regimen.times[0]!, amount: Infinity }] }).success).toBe(false);
    const contact = { id: medication.id, profileId: medication.profileId, name: 'A'.repeat(180), phone: '1'.repeat(50), email: 'a'.repeat(254) };
    expect(contactSchema.safeParse(contact).success).toBe(true);
    for (const [key, value] of [['name', 'A'.repeat(181)], ['phone', '1'.repeat(51)], ['email', 'a'.repeat(255)]]) {
      expect(contactSchema.safeParse({ ...contact, [key!]: value }).success).toBe(false);
    }
  });
  it('přijme beze ztráty stávající demo historii při výslovném importu', () => {
    const changes = bootstrapMutations(createDemoData(), 'account');
    expect(mutationSchema.array().parse(changes)).toHaveLength(changes.length);
    expect(syncSchema.safeParse({ mutations: changes }).success).toBe(true);
  });
});

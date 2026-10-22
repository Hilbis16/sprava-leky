import { describe,expect,it } from 'vitest';
import { createEmptyData } from '@/data/empty';
import { localDateKey } from '@/domain/schedule';
import type { AppData,Medication,RegimenRule } from '@/domain/types';
import { buildReminderPlan,MAX_DOSE_REMINDERS,MAX_STOCK_REMINDERS,reminderRefreshDelay } from './reminderPlan';

const now = new Date('2026-10-21T07:00:00');
const med: Medication = { id: 'm',profileId: 'p',name: 'Soukromý název léku',packageSize: 30,unit: 'tablet',prescription: true,active: true,createdAt: now.toISOString() };
const regimen: RegimenRule = { id: 'r',medicationId: 'm',effectiveFrom: '2026-10-01',daysOfWeek: [0,1,2,3,4,5,6],asNeeded: false,times: [{ id: 't',time: '08:00',amount: 1,period: 'morning' }] };
function data(rule: Partial<RegimenRule> = {},medicine: Partial<Medication> = {}): AppData {
  return { ...createEmptyData(),profiles: [{ id: 'p',displayName: 'Osoba',initials: 'O',color: '#147D64',timezone: 'Europe/Prague' }],
    medications: [{ ...med,...medicine }],regimens: [{ ...regimen,...rule }],notificationPreferences: { missedDoseDelayMinutes: 120,stockThresholdDays: [] } };
}

describe('Plán místních připomínek',() => {
  it('obnoví plán o půlnoci i před vyčerpáním kapacity během dne',() => {
    expect(reminderRefreshDelay(new Date('2026-10-21T23:59:30'))).toBe(31_000);
    expect(reminderRefreshDelay(now,new Date('2026-10-21T08:31:00').toISOString())).toBe(90*60*1000);
    expect(reminderRefreshDelay(now,new Date('2026-10-21T06:00:00').toISOString())).toBe(5000);
  });
  it('po skončení kúry nevytvoří žádnou připomínku',() => {
    expect(buildReminderPlan(data({ endsOn: '2026-10-20' }),now).reminders).toEqual([]);
  });
  it('zahrne poslední den včetně a nenaplánuje již uplynulý čas',() => {
    const last = data({ endsOn: '2026-10-21' });
    const plan = buildReminderPlan(last,now);
    expect(plan.reminders).toHaveLength(1);
    expect(plan.reminders[0]).toMatchObject({ kind: 'dose',at: new Date('2026-10-21T08:00:00') });
    expect(buildReminderPlan(last,new Date('2026-10-21T08:00:00')).reminders).toEqual([]);
  });
  it('omezenou kúru plánuje pouze konkrétními termíny v povolené dny',() => {
    const plan = buildReminderPlan(data({ endsOn: '2026-10-26',daysOfWeek: [1,5] }),now);
    expect(plan.reminders.map((r) => 'at' in r ? localDateKey(r.at) : 'weekly')).toEqual(['2026-10-23','2026-10-26']);
    expect(plan.refreshBefore).toBeUndefined();
  });
  it('před začátkem léčby nespouští týdenní opakování',() => {
    const plan = buildReminderPlan(data({ effectiveFrom: '2026-12-01' }),now);
    expect(plan.reminders.length).toBeGreaterThan(0);
    expect(plan.reminders.every((r) => 'at' in r && localDateKey(r.at) >= '2026-12-01')).toBe(true);
    expect(plan.refreshBefore).toBeDefined();
  });
  it('dlouhodobý rozvrh zachová a sdílí jedno upozornění pro stejný čas',() => {
    const input = data();
    input.medications.push({ ...med,id: 'm2' });
    input.regimens.push({ ...regimen,id: 'r2',medicationId: 'm2' });
    const plan = buildReminderPlan(input,now);
    expect(plan.reminders).toHaveLength(7);
    expect(plan.reminders.some((r) => !('at' in r) && r.weekday === 1)).toBe(true);
    expect(JSON.stringify(plan)).not.toContain(med.name);
    expect(plan.refreshBefore).toBeUndefined();
  });
  it('pro kúru ve stejném čase nevytváří druhé obecné upozornění',() => {
    const input = data();
    input.medications.push({ ...med,id: 'm2' });
    input.regimens.push({ ...regimen,id: 'r2',medicationId: 'm2',endsOn: '2026-10-23' });
    expect(buildReminderPlan(input,now).reminders).toHaveLength(7);
  });
  it('dlouhou kúru omezí společným rozpočtem a vrátí termín doplnění',() => {
    const input = data({ endsOn: '2028-12-31',times: ['08:00','14:00','20:00'].map((time) => ({ id: time,time,amount: 1,period: 'morning' })) });
    const plan = buildReminderPlan(input,now);
    expect(plan.reminders).toHaveLength(MAX_DOSE_REMINDERS);
    expect(plan.reminders.every((r) => 'at' in r && r.at > now && localDateKey(r.at) <= '2028-12-31')).toBe(true);
    const dates = plan.reminders.flatMap((r) => 'at' in r ? [r.at.getTime()] : []);
    expect(new Date(plan.refreshBefore!).getTime()).toBeGreaterThan(Math.max(...dates));
  });
  it('velké množství různých týdenních časů nepřekročí kapacitu',() => {
    const input = data({ times: Array.from({ length: 9 },(_,i) => ({ id: String(i),time: `${String(i+8).padStart(2,'0')}:00`,amount: 1,period: 'morning' })) });
    const plan = buildReminderPlan(input,now);
    expect(plan.reminders).toHaveLength(MAX_DOSE_REMINDERS);
    expect(plan.reminders.every((r) => 'at' in r)).toBe(true);
    expect(plan.refreshBefore).toBeDefined();
  });
  it('po sloučení časů při přechodu na letní čas zachová termín doplnění',() => {
    const start = new Date('2026-03-28T00:00:00');
    // Pojistka, že test neběží v UTC a skutečně obsahuje přechod CET → CEST.
    expect(start.getTimezoneOffset()).toBe(-60);
    expect(new Date('2026-03-30T00:00:00').getTimezoneOffset()).toBe(-120);
    const input = data({ effectiveFrom: '2026-03-28',endsOn: '2026-06-30',
      times: ['02:00','03:00','08:00'].map((time) => ({ id: time,time,amount: 1,period: 'morning' })) });
    const plan = buildReminderPlan(input,start);
    const dates = plan.reminders.flatMap((r) => 'at' in r ? [r.at.getTime()] : []);
    expect(dates).toHaveLength(MAX_DOSE_REMINDERS);
    expect(new Set(dates).size).toBe(MAX_DOSE_REMINDERS);
    expect(Math.max(...dates)).toBe(new Date('2026-04-15T08:00:00').getTime());
    expect(plan.refreshBefore).toBe(new Date('2026-04-16T02:00:00').toISOString());
    const refreshed = buildReminderPlan(input,new Date('2026-04-16T00:00:00'));
    expect(refreshed.reminders[0]).toMatchObject({ at: new Date(plan.refreshBefore!) });
    expect(new Date(refreshed.refreshBefore!).getTime()).toBeGreaterThan(new Date(plan.refreshBefore!).getTime());
  });
  it('po sloučení časů nehlásí doplnění pro již kompletní krátkou kúru',() => {
    const input = data({ effectiveFrom: '2026-03-28',endsOn: '2026-03-29',
      times: ['02:00','03:00','08:00'].map((time) => ({ id: time,time,amount: 1,period: 'morning' })) });
    const plan = buildReminderPlan(input,new Date('2026-03-28T00:00:00'));
    expect(plan.reminders).toHaveLength(5);
    expect(plan.refreshBefore).toBeUndefined();
  });
  it('omezuje i upozornění na zásoby a zachová jejich nejbližší termíny',() => {
    const input = data({ effectiveFrom: '2026-10-21' });
    input.medications = []; input.regimens = [];
    input.notificationPreferences.stockThresholdDays = [14,7];
    for (let i = 0; i < 20; i++) {
      const id = `m${i}`;
      input.medications.push({ ...med,id }); input.regimens.push({ ...regimen,id: `r${i}`,medicationId: id,effectiveFrom: '2026-10-21' });
      input.inventoryEvents.push({ id: `e${i}`,medicationId: id,kind: 'initial',quantity: 30+i,occurredAt: now.toISOString() });
    }
    const plan = buildReminderPlan(input,now);
    expect(plan.reminders.filter((r) => r.kind === 'stock')).toHaveLength(MAX_STOCK_REMINDERS);
    expect(plan.reminders.length).toBeLessThanOrEqual(MAX_DOSE_REMINDERS+MAX_STOCK_REMINDERS);
    expect(plan.refreshBefore).toBeDefined();
  });
  it('neplánuje neaktivní léky, léky dle potřeby ani chybějící profil',() => {
    expect(buildReminderPlan(data({}, { active: false }),now).reminders).toEqual([]);
    expect(buildReminderPlan(data({ asNeeded: true }),now).reminders).toEqual([]);
    expect(buildReminderPlan({ ...data(),profiles: [] },now).reminders).toEqual([]);
  });
});

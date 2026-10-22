import { beforeEach,describe,expect,it,vi } from 'vitest';
import { SchedulableTriggerInputTypes,type NotificationRequestInput } from 'expo-notifications';
import { createEmptyData } from '@/data/empty';
import type { AppData } from '@/domain/types';
import { reconcileLocalReminders } from './notifications.native';

const native = vi.hoisted(() => ({
  setNotificationHandler: vi.fn(),getAllScheduledNotificationsAsync: vi.fn(),getPermissionsAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),scheduleNotificationAsync: vi.fn(),setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { HIGH: 4 },SchedulableTriggerInputTypes: { DATE: 'date',WEEKLY: 'weekly' },
}));
vi.mock('expo-notifications',() => native);
vi.mock('expo-constants',() => ({ default: {} }));
vi.mock('react-native',() => ({ Platform: { OS: 'android' } }));
vi.mock('@/data/api',() => ({ apiEnabled: false,apiRequest: vi.fn() }));

let scheduled: Map<string,NotificationRequestInput>;
const now = new Date('2026-10-21T07:00:00');
const input = (): AppData => ({ ...createEmptyData(),profiles: [{ id: 'p',displayName: 'Osoba',initials: 'O',color: '#147D64',timezone: 'Europe/Prague' }],
  medications: [{ id: 'm',profileId: 'p',name: 'Soukromý lék',packageSize: 30,unit: 'tablet',prescription: true,active: true,createdAt: now.toISOString() }],
  regimens: [{ id: 'r',medicationId: 'm',effectiveFrom: '2026-10-01',endsOn: '2026-10-22',daysOfWeek: [0,1,2,3,4,5,6],asNeeded: false,times: [{ id: 't',time: '08:00',amount: 1,period: 'morning' }] }],
  notificationPreferences: { missedDoseDelayMinutes: 120,stockThresholdDays: [] } });
beforeEach(() => {
  vi.clearAllMocks(); scheduled = new Map();
  native.getAllScheduledNotificationsAsync.mockImplementation(async () => [...scheduled.values()]);
  native.getPermissionsAsync.mockResolvedValue({ granted: true });
  native.cancelScheduledNotificationAsync.mockImplementation(async (id: string) => { scheduled.delete(id); });
  native.scheduleNotificationAsync.mockImplementation(async (request: NotificationRequestInput) => {
    scheduled.set(request.identifier!,request); return request.identifier!;
  });
});
const legacy = () => scheduled.set('old-weekly',{ identifier: 'old-weekly',content: { data: { medicationId: 'm' } },trigger: { type: SchedulableTriggerInputTypes.WEEKLY,weekday: 4,hour: 8,minute: 0 } });

describe('Nativní obnova připomínek',() => {
  it('starý neomezený plán nahradí termíny pouze do konce kúry',async () => {
    legacy(); await reconcileLocalReminders(input(),now);
    expect(scheduled.has('old-weekly')).toBe(false);
    expect(scheduled.size).toBe(2);
    for (const request of scheduled.values()) {
      expect(request.trigger).toMatchObject({ type: 'date' });
      expect(JSON.stringify(request.content)).not.toContain('Soukromý lék');
    }
    expect(native.cancelScheduledNotificationAsync.mock.invocationCallOrder[0]).toBeLessThan(native.scheduleNotificationAsync.mock.invocationCallOrder[0]!);
  });
  it('po konci kúry odstraní starý plán i při zamítnutém oprávnění',async () => {
    legacy(); native.getPermissionsAsync.mockResolvedValue({ granted: false });
    const data = input(); data.regimens[0]!.endsOn = '2026-10-20';
    expect(await reconcileLocalReminders(data,now)).toEqual({ supported: true,permissionGranted: false });
    expect(scheduled.size).toBe(0); expect(native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('vyčistí neplatný plán ještě před případnou chybou kontroly oprávnění',async () => {
    legacy(); native.getPermissionsAsync.mockRejectedValueOnce(new Error('OS chyba'));
    await expect(reconcileLocalReminders(createEmptyData(),now)).rejects.toThrow('OS chyba');
    expect(scheduled.has('old-weekly')).toBe(false);
    await expect(reconcileLocalReminders(input(),now)).resolves.toMatchObject({ permissionGranted: true });
  });
  it('opakované otevření nepřidá duplicitní připomínky',async () => {
    await reconcileLocalReminders(input(),now); await reconcileLocalReminders(input(),now);
    expect(native.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(scheduled.size).toBe(2);
  });
  it('při návratu po skončení léčby zruší zbývající spravované termíny',async () => {
    await reconcileLocalReminders(input(),now);
    await reconcileLocalReminders(input(),new Date('2026-10-23T07:00:00'));
    expect(scheduled.size).toBe(0);
  });
  it('zkrácení kúry zachová poslední platný den a odstraní pozdější termín',async () => {
    await reconcileLocalReminders(input(),now);
    const shorter = input(); shorter.regimens[0]!.endsOn = '2026-10-21';
    await reconcileLocalReminders(shorter,now);
    expect(scheduled.size).toBe(1);
    expect((scheduled.values().next().value!.trigger as { date: Date }).date).toEqual(new Date('2026-10-21T08:00:00'));
  });
  it('posouvá omezený plán vpřed a doplní místo již uplynulých termínů',async () => {
    const long = input(); long.regimens[0]!.endsOn = '2028-12-31';
    const first = await reconcileLocalReminders(long,now);
    const tomorrow = new Date('2026-10-22T07:00:00');
    const next = await reconcileLocalReminders(long,tomorrow);
    expect(scheduled.size).toBe(56);
    expect(next!.refreshBefore! > first!.refreshBefore!).toBe(true);
    for (const request of scheduled.values()) expect((request.trigger as { date: Date }).date > tomorrow).toBe(true);
  });
  it('po částečném selhání OS naváže bez zdvojení již vytvořených termínů',async () => {
    native.scheduleNotificationAsync.mockImplementationOnce(async (request: NotificationRequestInput) => {
      scheduled.set(request.identifier!,request); return request.identifier!;
    }).mockRejectedValueOnce(new Error('Dočasná chyba'));
    await expect(reconcileLocalReminders(input(),now)).rejects.toThrow('Dočasná chyba');
    expect(scheduled.size).toBe(1);
    await reconcileLocalReminders(input(),now);
    expect(scheduled.size).toBe(2);
  });
  it('přenos z jiného zařízení promítne do již naplánovaných časů',async () => {
    await reconcileLocalReminders(input(),now);
    const updated = input(); updated.regimens[0]!.times[0]!.time = '10:00';
    await reconcileLocalReminders(updated,now);
    expect(scheduled.size).toBe(2);
    for (const request of scheduled.values()) expect((request.trigger as { date: Date }).date.getHours()).toBe(10);
  });
  it('při odhlášení vyčistí dávky a zásoby, jiné notifikace zachová',async () => {
    await reconcileLocalReminders(input(),now);
    scheduled.set('stock-old',{ identifier: 'stock-old',content: { data: { kind: 'stock' } },trigger: null });
    scheduled.set('unrelated',{ identifier: 'unrelated',content: { data: { kind: 'other' } },trigger: null });
    await reconcileLocalReminders(createEmptyData(),now);
    expect([...scheduled.keys()]).toEqual(['unrelated']);
  });
  it('souběžná úprava nebo odhlášení zvítězí nad rozpracovaným plánem',async () => {
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    native.getAllScheduledNotificationsAsync.mockImplementationOnce(async () => { await gate; return []; });
    const first = reconcileLocalReminders(input(),now);
    await Promise.resolve(); await Promise.resolve();
    const logout = reconcileLocalReminders(createEmptyData(),now);
    release(); await Promise.all([first,logout]);
    expect(scheduled.size).toBe(0);
  });
});

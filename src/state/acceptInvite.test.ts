import { describe, expect, it, vi } from 'vitest';
import { createDemoData } from '@/data/demo';
import type { AppData, PendingMutation } from '@/domain/types';
import { runInviteAcceptance } from './acceptInvite';

function fixture() {
  let current: AppData | null = createDemoData();
  const received = createDemoData();
  const actions = {
    getData: () => current,
    replaceData: vi.fn((data: AppData) => { current = data; }),
    setMessage: vi.fn(),
    receive: vi.fn(async (_token: string, _data: AppData, _account: string) => received),
    save: vi.fn(async (_data: AppData, _account: string) => {}),
  };
  return { actions, received, setCurrent: (data: AppData | null) => { current = data; } };
}

describe('Dokončení stavu přijetí rodinné pozvánky', () => {
  it.each(['Pozvánka již byla použita.', 'Server není dostupný.'])('ukončí průběhový stav při chybě: %s', async (message) => {
    const { actions } = fixture();
    const before = actions.getData();
    const error = new Error(message);
    actions.receive.mockRejectedValueOnce(error);
    await expect(runInviteAcceptance('token', 'account', actions)).rejects.toBe(error);
    expect(actions.setMessage.mock.calls.map(([message]) => message)).toEqual(['Připojuji rodinu…', 'Připojení rodiny se nepodařilo dokončit.']);
    expect(actions.getData()).toBe(before);
    expect(actions.replaceData).not.toHaveBeenCalled();
    expect(actions.save).not.toHaveBeenCalled();
  });
  it('nezačne připojování, dokud nejsou odeslané místní změny', async () => {
    const { actions, setCurrent } = fixture();
    setCurrent({ ...actions.getData()!, pendingMutations: [{ id: 'pending', entity: 'profile_remove', payload: { id: 'p' }, createdAt: new Date().toISOString() }] });
    await expect(runInviteAcceptance('token', 'account', actions)).rejects.toThrow('Nejprve synchronizujte');
    expect(actions.setMessage).not.toHaveBeenCalled();
    expect(actions.receive).not.toHaveBeenCalled();
  });
  it('nepřepisuje stav při chybějícím účtu nebo nenačtených datech', async () => {
    const { actions, setCurrent } = fixture();
    await expect(runInviteAcceptance('token', undefined, actions)).rejects.toThrow('přihlaste');
    setCurrent(null);
    await expect(runInviteAcceptance('token', 'account', actions)).rejects.toThrow('nejsou připravená');
    expect(actions.setMessage).not.toHaveBeenCalled();
    expect(actions.receive).not.toHaveBeenCalled();
  });
  it('oznámí úspěch až po uložení a zachová změny vzniklé během přenosu', async () => {
    const { actions, received, setCurrent } = fixture();
    const mutation: PendingMutation = { id: 'local', entity: 'profile', createdAt: new Date().toISOString(), payload: { ...received.profiles[0]!, displayName: 'Místní úprava během přenosu' } };
    actions.receive.mockImplementationOnce(async () => {
      setCurrent({ ...actions.getData()!, activeRole: 'senior', pendingMutations: [mutation], notificationPreferences: { missedDoseDelayMinutes: 240, stockThresholdDays: [3] } });
      return received;
    });
    actions.save.mockImplementationOnce(async () => {
      expect(actions.setMessage).toHaveBeenLastCalledWith('Připojuji rodinu…');
    });
    await runInviteAcceptance('token', 'account', actions);
    const next = actions.getData()!;
    expect(next.profiles[0]?.displayName).toBe('Místní úprava během přenosu');
    expect(next.pendingMutations).toEqual([mutation]);
    expect(next.activeRole).toBe('senior');
    expect(next.notificationPreferences.stockThresholdDays).toEqual([3]);
    expect(actions.save).toHaveBeenCalledExactlyOnceWith(next, 'account');
    expect(actions.setMessage).toHaveBeenLastCalledWith('Rodinný profil je připojený');
  });
  it('ukončí průběhový stav také při selhání lokálního zápisu', async () => {
    const { actions, received } = fixture();
    actions.save.mockRejectedValueOnce(new Error('Úložiště není dostupné.'));
    await expect(runInviteAcceptance('token', 'account', actions)).rejects.toThrow('Úložiště');
    expect(actions.getData()?.profiles).toEqual(received.profiles);
    expect(actions.setMessage).toHaveBeenLastCalledWith('Připojení rodiny se nepodařilo dokončit.');
  });
  it('po výpadku dovolí opakování a přepíše chybu úspěšným stavem', async () => {
    const { actions } = fixture();
    actions.receive.mockRejectedValueOnce(new Error('Výpadek'));
    await expect(runInviteAcceptance('token', 'account', actions)).rejects.toThrow('Výpadek');
    await runInviteAcceptance('token', 'account', actions);
    expect(actions.setMessage).toHaveBeenLastCalledWith('Rodinný profil je připojený');
    expect(actions.save).toHaveBeenCalledTimes(1);
  });
});

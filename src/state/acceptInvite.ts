import { applyMutation } from '@/domain/mutations';
import type { AppData } from '@/domain/types';

interface InviteAcceptance {
  getData: () => AppData | null;
  replaceData: (data: AppData) => void;
  setMessage: (message: string) => void;
  receive: (token: string, data: AppData, accountId: string) => Promise<AppData>;
  save: (data: AppData, accountId: string) => Promise<void>;
}

export async function runInviteAcceptance(token: string, accountId: string | undefined, actions: InviteAcceptance): Promise<void> {
  if (!accountId) throw new Error('Pro přijetí pozvánky se přihlaste.');
  const current = actions.getData();
  if (!current) throw new Error('Data aplikace ještě nejsou připravená.');
  // Předběžné odmítnutí nemění probíhající stav synchronizace.
  if (current.pendingMutations.length) throw new Error('Nejprve synchronizujte neodeslané změny.');
  actions.setMessage('Připojuji rodinu…');
  try {
    const received = await actions.receive(token, current, accountId);
    const latest = actions.getData() ?? current;
    const next = { ...latest.pendingMutations.reduce(applyMutation, received), pendingMutations: latest.pendingMutations,
      notificationPreferences: latest.notificationPreferences, activeRole: latest.activeRole };
    actions.replaceData(next);
    await actions.save(next, accountId);
    actions.setMessage('Rodinný profil je připojený');
  } catch (error) {
    actions.setMessage('Připojení rodiny se nepodařilo dokončit.');
    // Obrazovka zobrazí konkrétní důvod a dovolí opakování při výpadku.
    throw error;
  }
}

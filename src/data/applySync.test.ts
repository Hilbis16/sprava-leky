import { describe, expect, it } from 'vitest';

import type { DoseAction, PendingMutation } from '@/domain/types';
import { applySyncResult } from './applySync';
import { createDemoData } from './demo';

const doseAction = (occurrenceId: string, medicationId: string, profileId: string): DoseAction => ({
  id: `action-${occurrenceId}`, occurrenceId, medicationId, profileId, scheduledAt: '2026-10-15T06:00:00.000Z',
  amount: 1, status: 'taken', recordedAt: '2026-10-15T06:05:00.000Z', recordedBy: 'Pečující',
});

describe('applySyncResult', () => {
  it('zachová změny zaznamenané během synchronizace, když se nic nestáhlo', () => {
    const snapshot = createDemoData();
    const sent: PendingMutation = { id: 'sent', entity: 'prescriber', payload: snapshot.prescribers[0], createdAt: '2026-10-15T06:00:00.000Z' };
    const during: PendingMutation = { id: 'during', entity: 'prescriber', payload: snapshot.prescribers[0], createdAt: '2026-10-15T06:01:00.000Z' };
    const current = { ...snapshot, pendingMutations: [sent, during] };

    const next = applySyncResult(current, new Set(['sent']), {
      synced: true, remaining: [], syncedAt: '2026-10-15T06:02:00.000Z', message: 'ok',
    });

    expect(next.pendingMutations.map((item) => item.id)).toEqual(['during']);
    expect(next.lastSyncedAt).toBe('2026-10-15T06:02:00.000Z');
  });

  it('přehraje dávku potvrzenou během synchronizace přes stažená data', () => {
    const snapshot = createDemoData();
    const medication = snapshot.medications[0]!;
    const action = doseAction('occurrence-during-sync', medication.id, medication.profileId);
    const during: PendingMutation = { id: 'during', entity: 'dose_action', payload: action, createdAt: action.recordedAt };
    const current = { ...snapshot, activeRole: 'senior' as const, doseActions: [...snapshot.doseActions, action], pendingMutations: [during] };
    const pulled = { ...snapshot, pendingMutations: [] };

    const next = applySyncResult(current, new Set(), {
      synced: true, remaining: [], syncedAt: '2026-10-15T06:02:00.000Z', message: 'ok', data: pulled,
    });

    expect(next.doseActions.some((item) => item.occurrenceId === 'occurrence-during-sync')).toBe(true);
    expect(next.pendingMutations.map((item) => item.id)).toEqual(['during']);
    expect(next.activeRole).toBe('senior');
  });

  it('vrátí neodeslané změny zpět do fronty', () => {
    const snapshot = createDemoData();
    const failed: PendingMutation = { id: 'failed', entity: 'prescriber', payload: snapshot.prescribers[0], createdAt: '2026-10-15T06:00:00.000Z' };
    const current = { ...snapshot, pendingMutations: [failed] };

    const next = applySyncResult(current, new Set(['failed']), { synced: false, remaining: [failed], message: 'offline' });

    expect(next.pendingMutations).toEqual([failed]);
  });
});

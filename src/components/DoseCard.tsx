import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DoseOccurrence, Medication } from '@/domain/types';
import { colors } from '@/theme';
import { Button, Card, StatusPill } from './ui';

const unitLabel = (amount: number, unit: Medication['unit']) => {
  if (unit === 'capsule') return amount === 1 ? '1 kapsle' : `${amount} kapsle`;
  return amount === 0.5 ? '½ tablety' : amount === 1 ? '1 tableta' : `${amount} tablety`;
};

export function DoseCard({ occurrence, medication, senior = false, onAction, onUndo }: {
  occurrence: DoseOccurrence;
  medication: Medication;
  senior?: boolean;
  onAction: (status: 'taken' | 'skipped') => void;
  onUndo?: () => void;
}) {
  const time = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(occurrence.scheduledAt));
  const done = occurrence.status !== 'unconfirmed';
  return (
    <Card style={[styles.card, done && styles.cardDone]}>
      <View style={styles.icon}><Ionicons name="medical" size={24} color={colors.primary} /></View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.time, senior && styles.timeSenior]}>{time}</Text>
          {done ? <StatusPill label={occurrence.status === 'taken' ? 'Užito' : 'Vynecháno'} tone={occurrence.status === 'taken' ? 'safe' : 'neutral'} /> : null}
        </View>
        <Text style={[styles.name, senior && styles.nameSenior]}>{medication.name} {medication.strength}</Text>
        <Text style={[styles.amount, senior && styles.amountSenior]}>{unitLabel(occurrence.amount, medication.unit)}</Text>
        {medication.note ? <View style={styles.note}><Ionicons name="information-circle-outline" size={senior ? 20 : 16} color={colors.warning} /><Text style={[styles.noteText, senior && styles.noteSenior]}>{medication.note}</Text></View> : null}
        {!done ? (
          <View style={[styles.actions, senior && styles.actionsSenior]}>
            <Button label="Užil/a jsem" icon="checkmark" onPress={() => onAction('taken')} style={styles.actionMain} />
            <Button label="Neužil/a" variant="ghost" onPress={() => onAction('skipped')} />
          </View>
        ) : onUndo ? (
          <Button label="Opravit záznam" icon="arrow-undo-outline" variant="ghost" onPress={onUndo} style={styles.undo} accessibilityLabel={`Opravit záznam dávky ${medication.name}`} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, marginBottom: 12 }, cardDone: { opacity: 0.72 },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  time: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' }, timeSenior: { fontSize: 20 },
  name: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 4 }, nameSenior: { fontSize: 24, lineHeight: 30 },
  amount: { color: colors.muted, fontSize: 14, marginTop: 3 }, amountSenior: { fontSize: 18, lineHeight: 26 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 4 }, actionsSenior: { marginTop: 20, flexDirection: 'column', alignItems: 'stretch' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, noteText: { flex: 1, color: colors.warning, fontSize: 13, fontWeight: '700' }, noteSenior: { fontSize: 17 },
  actionMain: { flex: 1 }, undo: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 0 },
});

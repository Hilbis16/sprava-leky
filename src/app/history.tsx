import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, SectionTitle, StatusPill } from '@/components/ui';
import { adherenceByMedication, doseHistory, historyReport, type DayStatus } from '@/domain/history';
import { useAppState } from '@/state/AppState';
import { colors, radius } from '@/theme';

const DAYS = 30;
const statusStyle: Record<DayStatus, { background: string; label: string }> = {
  complete: { background: colors.primary, label: 'Vše užito' },
  partial: { background: '#E7A35C', label: 'Něco vynecháno' },
  missed: { background: colors.danger, label: 'Nepotvrzená dávka' },
  pending: { background: colors.primarySoft, label: 'Dávky teprve budou' },
  none: { background: '#E9EEEB', label: 'Bez dávek' },
};
const weekdayHeader = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const dayLabel = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
const timeLabel = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' });

export default function HistoryScreen() {
  const { data, setCurrentProfile } = useAppState();
  const [selected, setSelected] = useState<string | null>(null);
  if (!data) return null;
  const profile = data.profiles.find((item) => item.id === data.currentProfileId)!;
  const history = doseHistory(data.medications, data.regimens, data.doseActions, profile.id, DAYS);
  const summary = adherenceByMedication(history);
  const selectedDay = history.find((day) => day.date === selected) ?? history.at(-1)!;
  // Monday-first grid: pad the first week so columns line up with weekdays.
  const leading = (new Date(`${history[0]!.date}T12:00:00`).getDay() + 6) % 7;
  const medicationName = (id: string) => {
    const medication = data.medications.find((item) => item.id === id);
    return medication ? `${medication.name}${medication.strength ? ` ${medication.strength}` : ''}` : 'Lék';
  };

  return (
    <Screen>
      <View style={styles.top}><ProfileSwitcher profiles={data.profiles} currentId={profile.id} onChange={(id) => { setCurrentProfile(id); setSelected(null); }} /></View>
      <Text style={styles.lead}>Posledních {DAYS} dní podle potvrzení v aplikaci. Klepnutím na den zobrazíte jeho dávky.</Text>
      <Card>
        <View style={styles.grid}>
          {weekdayHeader.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
          {Array.from({ length: leading }, (_, index) => <View key={`pad-${index}`} style={styles.cell} />)}
          {history.map((day) => (
            <Pressable key={day.date} onPress={() => setSelected(day.date)} style={styles.cell}
              accessibilityRole="button" accessibilityLabel={`${dayLabel.format(new Date(`${day.date}T12:00:00`))}: ${statusStyle[day.status].label}`}>
              <View style={[styles.dot, { backgroundColor: statusStyle[day.status].background }, day.date === selectedDay.date && styles.dotSelected]}>
                <Text style={[styles.dotText, (day.status === 'none' || day.status === 'pending') && styles.dotTextDark]}>{Number(day.date.slice(8))}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <View style={styles.legend}>
          {(['complete', 'partial', 'missed', 'none'] as DayStatus[]).map((status) => (
            <View key={status} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: statusStyle[status].background }]} /><Text style={styles.legendText}>{statusStyle[status].label}</Text></View>
          ))}
        </View>
      </Card>

      <SectionTitle title={dayLabel.format(new Date(`${selectedDay.date}T12:00:00`))} />
      {selectedDay.entries.length === 0 ? <EmptyState icon="calendar-clear-outline" title="Žádné dávky" body="Na tento den nebylo nic naplánováno ani zaznamenáno." /> : (
        <Card>
          {selectedDay.entries.map((entry) => (
            <View key={`${entry.medicationId}${entry.scheduledAt}`} style={styles.entry}>
              <Text style={styles.entryTime}>{timeLabel.format(new Date(entry.scheduledAt))}</Text>
              <Text style={styles.entryName}>{medicationName(entry.medicationId)}</Text>
              <StatusPill label={entry.status === 'taken' ? 'Užito' : entry.status === 'skipped' ? 'Vynecháno' : entry.due ? 'Nepotvrzeno' : 'Čeká'}
                tone={entry.status === 'taken' ? 'safe' : entry.status === 'skipped' ? 'warning' : entry.due ? 'critical' : 'neutral'} />
            </View>
          ))}
        </Card>
      )}

      <SectionTitle title="Souhrn za období" />
      {summary.length === 0 ? <EmptyState icon="stats-chart-outline" title="Zatím bez záznamů" body="Souhrn se objeví po prvních naplánovaných dávkách." /> : (
        <Card>
          {summary.map((item) => {
            const total = item.taken + item.skipped + item.unconfirmed;
            return (
              <View key={item.medicationId} style={styles.summaryRow}>
                <View style={styles.flex}>
                  <Text style={styles.entryName}>{medicationName(item.medicationId)}</Text>
                  <Text style={styles.summaryMeta}>Užito {item.taken} z {total}{item.skipped ? ` · vynecháno ${item.skipped}` : ''}{item.unconfirmed ? ` · nepotvrzeno ${item.unconfirmed}` : ''}</Text>
                  <View style={styles.bar}><View style={[styles.barFill, { width: `${total ? (item.taken / total) * 100 : 0}%` }]} /></View>
                </View>
                <Text style={styles.percent}>{total ? Math.round((item.taken / total) * 100) : 0} %</Text>
              </View>
            );
          })}
        </Card>
      )}
      <Button label="Sdílet přehled pro lékaře" icon="share-outline" variant="secondary" disabled={!summary.length}
        onPress={() => void Share.share({ title: `Přehled užívání – ${profile.displayName}`, message: historyReport(profile, data.medications, history) })} style={styles.share} />
      <View style={styles.note}><Ionicons name="information-circle-outline" size={18} color={colors.muted} /><Text style={styles.noteText}>Přehled zobrazuje jen záznamy. Hodnocení léčby patří lékaři.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: 8 }, lead: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  dot: { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }, dotSelected: { borderWidth: 3, borderColor: colors.ink },
  dotText: { color: colors.white, fontSize: 13, fontWeight: '800' }, dotTextDark: { color: colors.muted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 4 }, legendText: { color: colors.muted, fontSize: 12 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  entryTime: { width: 48, color: colors.primaryDark, fontSize: 14, fontWeight: '800' }, entryName: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, flex: { flex: 1 },
  summaryMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  bar: { height: 6, borderRadius: 6, backgroundColor: '#E9EEEB', marginTop: 8, overflow: 'hidden' }, barFill: { height: 6, backgroundColor: colors.primary },
  percent: { color: colors.ink, fontSize: 18, fontWeight: '900', minWidth: 52, textAlign: 'right' },
  share: { marginTop: 16 }, note: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 }, noteText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
});

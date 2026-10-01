import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, Card, SectionTitle, StatusPill } from '@/components/ui';
import { forecastMedication, forecastTone } from '@/domain/forecast';
import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

export default function MedicineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, addStock } = useAppState();
  if (!data) return null;
  const medication = data.medications.find((item) => item.id === id);
  if (!medication) return <Screen><Text>Lék nebyl nalezen.</Text></Screen>;
  const regimen = data.regimens.find((item) => item.medicationId === medication.id);
  const forecast = forecastMedication(medication, regimen, data.inventoryEvents, data.doseActions);
  const tone = forecastTone(forecast.daysRemaining);
  const doseLabel = regimen?.times.map((dose) => `${dose.time} · ${dose.amount}`).join(', ') ?? 'Bez rozpisu';
  return (
    <Screen>
      <View style={styles.hero}><View style={styles.icon}><Ionicons name="medical" size={34} color={colors.primary} /></View><Text style={styles.title}>{medication.name}</Text><Text style={styles.strength}>{medication.strength}</Text><StatusPill label={medication.prescription ? 'Na předpis' : 'Volně prodejný'} tone="neutral" /></View>
      <Card style={styles.stockCard}><Text style={styles.caption}>ODHADOVANÁ ZÁSOBA</Text><View style={styles.stockRow}><Text style={styles.stock}>{forecast.estimatedStock}</Text><Text style={styles.unit}>{medication.unit === 'tablet' ? 'tablet' : 'kapslí'}</Text></View><Text style={styles.meta}>{forecast.daysRemaining === null ? 'Datum vyčerpání není k dispozici' : `Přibližně na ${forecast.daysRemaining} dní`}</Text><StatusPill label={tone === 'critical' ? 'Je čas řešit doplnění' : tone === 'warning' ? 'Blíží se upozornění' : 'Zásoba je v pořádku'} tone={tone === 'unknown' ? 'neutral' : tone} /><Button label={`Přidat celé balení (+${medication.packageSize})`} icon="add-circle-outline" onPress={() => { addStock(medication.id, medication.packageSize); Alert.alert('Hotovo', 'Nové balení bylo přidáno do zásoby.'); }} style={styles.refill} /></Card>
      <SectionTitle title="Dávkování" /><Card><InfoRow icon="time-outline" label="Denní časy" value={doseLabel} /><InfoRow icon="calendar-outline" label="Dny" value={regimen?.daysOfWeek.length === 7 ? 'Každý den' : 'Vybrané dny týdne'} /><InfoRow icon="cube-outline" label="Velikost balení" value={`${medication.packageSize} kusů`} /></Card>
      <SectionTitle title="Historie zásoby" />
      {data.inventoryEvents.filter((item) => item.medicationId === medication.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((event) => <Card key={event.id} style={styles.history}><View><Text style={styles.historyTitle}>{event.kind === 'initial' ? 'Počáteční balení' : event.kind === 'refill' ? 'Doplnění zásoby' : 'Ruční oprava'}</Text><Text style={styles.historyDate}>{new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' }).format(new Date(event.occurredAt))}</Text></View><Text style={styles.quantity}>+{event.quantity}</Text></Card>)}
    </Screen>
  );
}
function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) { return <View style={styles.info}><Ionicons name={icon} size={22} color={colors.primary} /><View style={styles.flex}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>; }
const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 14, paddingBottom: 20 }, icon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.ink, fontSize: 27, fontWeight: '900', marginTop: 12 }, strength: { color: colors.muted, fontSize: 16, marginTop: 3, marginBottom: 10 },
  stockCard: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: '#C4E4D8' }, caption: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, stockRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 6 }, stock: { color: colors.ink, fontSize: 44, fontWeight: '900' }, unit: { color: colors.muted, fontSize: 16 }, meta: { color: colors.muted, marginBottom: 11 }, refill: { width: '100%', marginTop: 16 },
  info: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, flex: { flex: 1 }, infoLabel: { color: colors.muted, fontSize: 12 }, infoValue: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  history: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingVertical: 14 }, historyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, historyDate: { color: colors.muted, fontSize: 12, marginTop: 3 }, quantity: { color: colors.primary, fontSize: 20, fontWeight: '900' },
});

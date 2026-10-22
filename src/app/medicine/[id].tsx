import { showMessage } from '@/components/message';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { confirmAction } from '@/components/confirm';
import { Screen } from '@/components/Screen';
import { Button, Card, SectionTitle, StatusPill } from '@/components/ui';
import { forecastMedication, forecastTone } from '@/domain/forecast';
import type { InventoryEvent } from '@/domain/types';
import { courseFinished, formatCzechDate } from '@/domain/schedule';
import { daysLabel } from '@/domain/weekdays';
import { countedStockSchema, parseQuantity, validationMessage } from '@/domain/validation';
import { useAppState } from '@/state/AppState';
import { colors, radius } from '@/theme';

const historyTitle: Record<InventoryEvent['kind'], string> = { initial: 'Počáteční balení', refill: 'Doplnění zásoby', correction: 'Oprava zásoby' };

export default function MedicineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, addStock, correctStock, deactivateMedicine,canEditProfile } = useAppState();
  const [counting, setCounting] = useState(false);
  const [counted, setCounted] = useState('');
  if (!data) return null;
  const medication = data.medications.find((item) => item.id === id);
  if (!medication) return <Screen><Text>Lék nebyl nalezen.</Text></Screen>;
  const editable = canEditProfile(medication.profileId);
  const regimen = data.regimens.find((item) => item.medicationId === medication.id);
  const forecast = forecastMedication(medication, regimen, data.inventoryEvents, data.doseActions);
  const tone = forecastTone(forecast.daysRemaining);
  const doseLabel = regimen?.times.map((dose) => `${dose.time} · ${dose.amount}`).join(', ') ?? 'Bez rozpisu';
  const unitLabel = medication.unit === 'tablet' ? 'tablet' : 'kapslí';

  const openCount = () => { setCounted(String(forecast.estimatedStock)); setCounting(true); };
  const saveCount = () => {
    const parsed = countedStockSchema.safeParse(parseQuantity(counted));
    if (!parsed.success) return showMessage('Zkontrolujte počet', validationMessage(parsed.error));
    if (!correctStock(medication.id, parsed.data)) return;
    setCounting(false);
  };
  const endMedication = async () => {
    const confirmed = await confirmAction('Ukončit užívání?', `${medication.name} zmizí z dnešního plánu i ze zásob a zruší se jeho připomínky. Historie zůstane zachovaná.`, 'Ukončit', true);
    if (!confirmed) return;
    deactivateMedicine(medication.id);
    router.back();
  };

  return (
    <Screen>
      <View style={styles.hero}><View style={styles.icon}><Ionicons name="medical" size={34} color={colors.primary} /></View><Text style={styles.title}>{medication.name}</Text><Text style={styles.strength}>{medication.strength}</Text><StatusPill label={!medication.active ? 'Užívání ukončeno' : medication.prescription ? 'Na předpis' : 'Volně prodejný'} tone="neutral" /></View>
      <Card style={styles.stockCard}>
        <Text style={styles.caption}>ODHADOVANÁ ZÁSOBA</Text>
        <View style={styles.stockRow}><Text style={styles.stock}>{forecast.estimatedStock}</Text><Text style={styles.unit}>{unitLabel}</Text></View>
        <Text style={styles.meta}>{forecast.daysRemaining === null ? 'Datum vyčerpání není k dispozici' : `Přibližně na ${forecast.daysRemaining} dní`}</Text>
        <StatusPill label={tone === 'critical' ? 'Je čas řešit doplnění' : tone === 'warning' ? 'Blíží se upozornění' : 'Zásoba je v pořádku'} tone={tone === 'unknown' ? 'neutral' : tone} />
        {medication.active && editable ? <>
          <Button label={`Přidat celé balení (+${medication.packageSize})`} icon="add-circle-outline" onPress={() => { if (addStock(medication.id, medication.packageSize)) showMessage('Hotovo', 'Nové balení bylo přidáno do zásoby.'); }} style={styles.refill} />
          <Button label="Spočítal/a jsem zásobu" icon="calculator-outline" variant="ghost" onPress={openCount} style={styles.fullWidth} />
        </> : null}
      </Card>
      <SectionTitle title="Dávkování" action={medication.active && editable ? <Button label="Upravit" icon="create-outline" variant="ghost" onPress={() => router.push({ pathname: '/medicine/new', params: { id: medication.id } })} /> : undefined} />
      <Card>
        <InfoRow icon="time-outline" label="Denní časy" value={doseLabel} />
        <InfoRow icon="calendar-outline" label="Dny" value={regimen ? daysLabel(regimen.daysOfWeek) : 'Bez rozpisu'} />
        <InfoRow icon="hourglass-outline" label="Délka léčby" value={regimen?.endsOn ? `${courseFinished(regimen) ? 'Skončila' : 'Do'} ${formatCzechDate(regimen.endsOn)}` : 'Dlouhodobě'} />
        {medication.note ? <InfoRow icon="information-circle-outline" label="Pokyny k užívání" value={medication.note} /> : null}
        <InfoRow icon="cube-outline" label="Velikost balení" value={`${medication.packageSize} kusů`} />
      </Card>
      <SectionTitle title="Historie zásoby" />
      {data.inventoryEvents.filter((item) => item.medicationId === medication.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((event) => (
        <Card key={event.id} style={styles.history}>
          <View style={styles.flex}>
            <Text style={styles.historyTitle}>{historyTitle[event.kind]}</Text>
            <Text style={styles.historyDate}>{new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' }).format(new Date(event.occurredAt))}{event.note ? ` · ${event.note}` : ''}</Text>
          </View>
          <Text style={[styles.quantity, event.quantity < 0 && styles.quantityNegative]}>{event.quantity > 0 ? `+${event.quantity}` : event.quantity}</Text>
        </Card>
      ))}
      {medication.active && editable ? <Button label="Ukončit užívání" icon="stop-circle-outline" variant="ghost" onPress={() => void endMedication()} style={styles.end} /> : null}
      <Modal visible={counting} transparent animationType="fade" onRequestClose={() => setCounting(false)}>
        <View style={styles.backdrop}>
          <Card style={styles.modal}>
            <Text style={styles.modalTitle}>Kolik kusů zbývá?</Text>
            <Text style={styles.modalBody}>Zadejte skutečně spočítaný počet. Aplikace podle něj opraví odhad zásoby.</Text>
            <TextInput value={counted} onChangeText={setCounted} keyboardType="decimal-pad" autoFocus selectTextOnFocus style={styles.input} accessibilityLabel={`Počet ${unitLabel}`} />
            <Button label="Uložit" icon="checkmark" onPress={saveCount} style={styles.fullWidth} />
            <Button label="Zrušit" variant="ghost" onPress={() => setCounting(false)} style={styles.fullWidth} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) { return <View style={styles.info}><Ionicons name={icon} size={22} color={colors.primary} /><View style={styles.flex}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>; }
const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 14, paddingBottom: 20 }, icon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.ink, fontSize: 27, fontWeight: '900', marginTop: 12 }, strength: { color: colors.muted, fontSize: 16, marginTop: 3, marginBottom: 10 },
  stockCard: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: '#C4E4D8' }, caption: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, stockRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 6 }, stock: { color: colors.ink, fontSize: 44, fontWeight: '900' }, unit: { color: colors.muted, fontSize: 16 }, meta: { color: colors.muted, marginBottom: 11 }, refill: { width: '100%', marginTop: 16 }, fullWidth: { width: '100%', marginTop: 8 },
  info: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, flex: { flex: 1 }, infoLabel: { color: colors.muted, fontSize: 12 }, infoValue: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  history: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9, paddingVertical: 14 }, historyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, historyDate: { color: colors.muted, fontSize: 12, marginTop: 3 }, quantity: { color: colors.primary, fontSize: 20, fontWeight: '900' }, quantityNegative: { color: colors.danger },
  end: { marginTop: 18 },
  backdrop: { flex: 1, padding: 20, backgroundColor: 'rgba(24,51,42,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '100%', maxWidth: 390, alignItems: 'center', padding: 24 },
  modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' }, modalBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  input: { width: '100%', height: 58, marginVertical: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, textAlign: 'center', color: colors.ink, fontSize: 26, fontWeight: '900' },
});

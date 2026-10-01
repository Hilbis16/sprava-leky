import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, SectionTitle, StatusPill } from '@/components/ui';
import { forecastMedication, forecastTone } from '@/domain/forecast';
import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

export default function StockScreen() {
  const { data, addStock } = useAppState();
  if (!data) return null;
  const meds = data.medications.filter((med) => med.profileId === data.currentProfileId && med.active);
  return (
    <Screen>
      <View style={styles.header}><View><Text style={styles.eyebrow}>PŘEHLED</Text><Text style={styles.title}>Zásoby léků</Text></View><Button label="Přidat" icon="add" onPress={() => router.push('/medicine/new')} /></View>
      <Text style={styles.lead}>Odhad vychází z rozpisu a zaznamenaných doplnění. Nepotvrzené dávky se počítají jako užité.</Text>
      <SectionTitle title={`${meds.length} aktivní ${meds.length === 1 ? 'lék' : meds.length < 5 ? 'léky' : 'léků'}`} />
      {meds.length === 0 ? <EmptyState icon="file-tray-outline" title="Zatím žádné zásoby" body="Přidejte první lék a jeho balení." /> : meds.map((medication) => {
        const regimen = data.regimens.find((item) => item.medicationId === medication.id);
        const forecast = forecastMedication(medication, regimen, data.inventoryEvents, data.doseActions);
        const tone = forecastTone(forecast.daysRemaining);
        const shortage = forecast.shortageAt ? new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long' }).format(new Date(forecast.shortageAt)) : 'bez odhadu';
        return (
          <Pressable key={medication.id} onPress={() => router.push(`/medicine/${medication.id}`)}>
            <Card style={styles.medCard}>
              <View style={styles.medTop}>
                <View style={styles.medIcon}><Ionicons name={medication.unit === 'capsule' ? 'ellipse' : 'medical'} size={22} color={colors.primary} /></View>
                <View style={styles.medBody}><Text style={styles.medName}>{medication.name}</Text><Text style={styles.medStrength}>{medication.strength ?? 'Bez uvedené síly'}</Text></View>
                <StatusPill tone={tone === 'unknown' ? 'neutral' : tone} label={forecast.daysRemaining === null ? 'Dle potřeby' : `${forecast.daysRemaining} dní`} />
              </View>
              <View style={styles.stockRow}><Text style={styles.stockNumber}>{forecast.estimatedStock}</Text><Text style={styles.stockUnit}>{medication.unit === 'tablet' ? 'tablet zbývá' : 'kapslí zbývá'}</Text></View>
              <Text style={styles.shortage}>{forecast.shortageAt ? `První nepokrytá dávka: ${shortage}` : 'Datum vyčerpání nelze určit'}</Text>
              <View style={styles.actions}>
                <Button label={`Přidat balení (+${medication.packageSize})`} variant="secondary" icon="add-circle-outline" onPress={() => {
                  addStock(medication.id, medication.packageSize);
                  Alert.alert('Zásoba doplněna', `Přidáno ${medication.packageSize} ${medication.unit === 'tablet' ? 'tablet' : 'kapslí'}.`);
                }} style={styles.refill} />
                <Ionicons name="chevron-forward" size={22} color={colors.muted} />
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, title: { color: colors.ink, fontSize: 30, fontWeight: '900', marginTop: 3 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 18 }, medCard: { marginBottom: 13 },
  medTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, medIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  medBody: { flex: 1 }, medName: { color: colors.ink, fontSize: 18, fontWeight: '800' }, medStrength: { color: colors.muted, fontSize: 13, marginTop: 2 },
  stockRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 18 }, stockNumber: { color: colors.ink, fontSize: 30, fontWeight: '900' }, stockUnit: { color: colors.muted, fontSize: 14 },
  shortage: { color: colors.muted, fontSize: 13, marginTop: 3 }, actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }, refill: { flex: 1 },
});

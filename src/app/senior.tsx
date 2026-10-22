import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DoseCard } from '@/components/DoseCard';
import { NoProfiles } from '@/components/NoProfiles';
import { PinDialog } from '@/components/PinDialog';
import { EmptyState } from '@/components/ui';
import { getSeniorPin } from '@/data/pinStore';
import { todayOccurrences } from '@/domain/schedule';
import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

export default function SeniorScreen() {
  const { data, recordDose, undoDose, setActiveRole,reminderWarning,reminderRefreshBefore } = useAppState();
  const [pin, setPin] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => { void getSeniorPin().then(setPin); }, []);
  // The Android back button must not leave the mode past the PIN.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);
  if (!data) return null;
  // Navigation follows the stored role, so leaving and a restart behave the same.
  if (data.activeRole !== 'senior') return <Redirect href="/(tabs)" />;
  const leave = () => setActiveRole('caregiver');
  const profile = data.profiles.find((item) => item.id === data.currentProfileId);
  if (!profile) return <NoProfiles />;
  const occurrences = todayOccurrences(data.medications, data.regimens, data.doseActions, profile.id);
  const remaining = occurrences.filter((item) => item.status === 'unconfirmed').length;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View><Text style={styles.hello}>Dobrý den,</Text><Text style={styles.name}>{profile.displayName.split(' ')[0]}</Text></View>
        <Pressable style={styles.close} onPress={() => (pin ? setAsking(true) : leave())} accessibilityLabel="Zavřít režim seniora"><Ionicons name="close" size={28} color={colors.ink} /></Pressable>
      </View>
      <View style={styles.summary}>
        <Ionicons name={remaining === 0 ? 'checkmark-circle' : 'time'} size={34} color={remaining === 0 ? colors.primary : colors.warning} />
        <Text style={styles.summaryText}>{remaining === 0 ? 'Všechny dnešní léky jsou potvrzené.' : `Dnes zbývá ${remaining} ${remaining === 1 ? 'dávka' : remaining < 5 ? 'dávky' : 'dávek'}.`}</Text>
      </View>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {occurrences.length === 0 ? <EmptyState icon="sunny-outline" title="Dnes máte volno" body="Na dnešek nejsou naplánované žádné léky." /> : occurrences.map((occurrence) => {
          const medication = data.medications.find((item) => item.id === occurrence.medicationId)!;
          return <DoseCard key={occurrence.id} occurrence={occurrence} medication={medication} senior onAction={(status) => recordDose(occurrence, status)} onUndo={() => undoDose(occurrence)} />;
        })}
      </ScrollView>
      <Text style={styles.help} accessibilityRole={reminderWarning ? 'alert' : undefined}>{reminderWarning ?? (reminderRefreshBefore
        ? `Další připomínky doplníte otevřením aplikace před ${new Date(reminderRefreshBefore).toLocaleString('cs-CZ',{ dateStyle: 'short',timeStyle: 'short' })}.`
        : 'Potřebujete pomoc? Zavolejte svému pečujícímu.')}</Text>
      <PinDialog visible={asking} title="Odchod z režimu seniora" body="Zadejte PIN pečujícího." submitLabel="Odemknout"
        onSubmit={(entered) => { if (entered !== pin) return 'Nesprávný PIN.'; setAsking(false); leave(); }} onCancel={() => setAsking(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 18 },
  header: { paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, hello: { color: colors.muted, fontSize: 19 }, name: { color: colors.ink, fontSize: 34, lineHeight: 40, fontWeight: '900' },
  close: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  summary: { marginTop: 24, backgroundColor: colors.primarySoft, borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, summaryText: { flex: 1, color: colors.ink, fontSize: 19, lineHeight: 26, fontWeight: '800' },
  content: { marginTop: 18, flex: 1 }, contentInner: { paddingBottom: 12 }, help: { color: colors.muted, fontSize: 15, textAlign: 'center', paddingVertical: 18 },
});

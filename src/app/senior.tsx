import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DoseCard } from '@/components/DoseCard';
import { EmptyState } from '@/components/ui';
import { todayOccurrences } from '@/domain/schedule';
import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

export default function SeniorScreen() {
  const { data, recordDose, undoDose, setActiveRole } = useAppState();
  if (!data) return null;
  const profile = data.profiles.find((item) => item.id === data.currentProfileId)!;
  const occurrences = todayOccurrences(data.medications, data.regimens, data.doseActions, profile.id);
  const remaining = occurrences.filter((item) => item.status === 'unconfirmed').length;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View><Text style={styles.hello}>Dobrý den,</Text><Text style={styles.name}>{profile.displayName.split(' ')[0]}</Text></View>
        <Pressable style={styles.close} onPress={() => { setActiveRole('caregiver'); router.back(); }} accessibilityLabel="Zavřít režim seniora"><Ionicons name="close" size={28} color={colors.ink} /></Pressable>
      </View>
      <View style={styles.summary}>
        <Ionicons name={remaining === 0 ? 'checkmark-circle' : 'time'} size={34} color={remaining === 0 ? colors.primary : colors.warning} />
        <Text style={styles.summaryText}>{remaining === 0 ? 'Všechny dnešní léky jsou potvrzené.' : `Dnes zbývá ${remaining} ${remaining === 1 ? 'dávka' : remaining < 5 ? 'dávky' : 'dávek'}.`}</Text>
      </View>
      <View style={styles.content}>
        {occurrences.length === 0 ? <EmptyState icon="sunny-outline" title="Dnes máte volno" body="Na dnešek nejsou naplánované žádné léky." /> : occurrences.map((occurrence) => {
          const medication = data.medications.find((item) => item.id === occurrence.medicationId)!;
          return <DoseCard key={occurrence.id} occurrence={occurrence} medication={medication} senior onAction={(status) => recordDose(occurrence, status)} onUndo={() => undoDose(occurrence)} />;
        })}
      </View>
      <Text style={styles.help}>Potřebujete pomoc? Zavolejte svému pečujícímu.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 18 },
  header: { paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, hello: { color: colors.muted, fontSize: 19 }, name: { color: colors.ink, fontSize: 34, lineHeight: 40, fontWeight: '900' },
  close: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  summary: { marginTop: 24, backgroundColor: colors.primarySoft, borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, summaryText: { flex: 1, color: colors.ink, fontSize: 19, lineHeight: 26, fontWeight: '800' },
  content: { marginTop: 18, flex: 1 }, help: { color: colors.muted, fontSize: 15, textAlign: 'center', paddingVertical: 18 },
});

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DoseCard } from '@/components/DoseCard';
import { NoProfiles } from '@/components/NoProfiles';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, SectionTitle, StatusPill } from '@/components/ui';
import { forecastMedication, forecastTone } from '@/domain/forecast';
import { courseFinished, todayOccurrences } from '@/domain/schedule';
import { useAppState } from '@/state/AppState';
import { colors, radius } from '@/theme';

const dateLabel = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

export default function TodayScreen() {
  const { data, setCurrentProfile, recordDose, undoDose, syncMessage,canEditProfile } = useAppState();
  if (!data) return null;
  const profile = data.profiles.find((item) => item.id === data.currentProfileId);
  if (!profile) return <NoProfiles />;
  const occurrences = todayOccurrences(data.medications, data.regimens, data.doseActions, profile.id);
  const done = occurrences.filter((item) => item.status !== 'unconfirmed').length;
  const runningLow = data.medications
    .filter((medication) => medication.profileId === profile.id && medication.active)
    .flatMap((medication) => {
      const regimen = data.regimens.find((item) => item.medicationId === medication.id);
      if (courseFinished(regimen)) return [];
      const { daysRemaining } = forecastMedication(medication, regimen, data.inventoryEvents, data.doseActions);
      const tone = forecastTone(daysRemaining);
      return tone === 'critical' || tone === 'warning' ? [{ medication, daysRemaining: daysRemaining!, tone }] : [];
    })
    .sort((left, right) => left.daysRemaining - right.daysRemaining);
  const periods = [
    { key: 'morning', title: 'Ráno', icon: 'sunny-outline' as const },
    { key: 'afternoon', title: 'Odpoledne', icon: 'partly-sunny-outline' as const },
    { key: 'evening', title: 'Večer', icon: 'moon-outline' as const },
  ];

  return (
    <Screen>
      <View style={styles.topbar}>
        <ProfileSwitcher profiles={data.profiles} currentId={profile.id} onChange={setCurrentProfile} />
        {canEditProfile(profile.id) ? <Pressable style={styles.addIcon} onPress={() => router.push('/medicine/new')} accessibilityLabel="Přidat lék"><Ionicons name="add" size={27} color={colors.white} /></Pressable> : null}
      </View>
      <View style={styles.headingRow}>
        <View><Text style={styles.eyebrow}>{dateLabel.format(new Date())}</Text><Text style={styles.title}>Dnešní léky</Text></View>
        <StatusPill label={`${done}/${occurrences.length} hotovo`} tone={done === occurrences.length && occurrences.length > 0 ? 'safe' : 'neutral'} />
      </View>
      <Card style={styles.progressCard}>
        <View style={styles.progressIcon}><Ionicons name={done === occurrences.length && occurrences.length > 0 ? 'checkmark' : 'heart'} size={25} color={colors.primary} /></View>
        <View style={styles.progressBody}>
          <Text style={styles.progressTitle}>{occurrences.length === 0 ? 'Dnes není naplánovaná žádná dávka' : done === occurrences.length ? 'Dnešní plán je splněný' : `Zbývá potvrdit ${occurrences.length - done} ${occurrences.length - done === 1 ? 'dávku' : 'dávky'}`}</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${occurrences.length ? (done / occurrences.length) * 100 : 0}%` }]} /></View>
          <Text style={styles.sync}>{syncMessage}</Text>
        </View>
      </Card>
      {runningLow.length ? (
        <Pressable onPress={() => router.push('/stock')} accessibilityRole="button">
          <Card style={[styles.lowCard, runningLow[0]!.tone === 'critical' && styles.lowCardCritical]}>
            <Ionicons name="alert-circle-outline" size={24} color={runningLow[0]!.tone === 'critical' ? colors.danger : colors.warning} />
            <View style={styles.progressBody}>
              <Text style={styles.progressTitle}>{runningLow.length === 1 ? 'Dochází lék' : `Dochází ${runningLow.length} léky`}</Text>
              <Text style={styles.lowText}>{runningLow.map((item) => `${item.medication.name} (${item.daysRemaining} ${item.daysRemaining === 1 ? 'den' : item.daysRemaining > 1 && item.daysRemaining < 5 ? 'dny' : 'dní'})`).join(', ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        </Pressable>
      ) : null}
      {occurrences.length === 0 ? <EmptyState icon="calendar-clear-outline" title="Volný den" body="Jakmile přidáte lék s dnešním dávkováním, objeví se tady." /> : periods.map((period) => {
        const items = occurrences.filter((item) => item.period === period.key);
        if (!items.length) return null;
        return (
          <View key={period.key} style={styles.period}>
            <SectionTitle title={period.title} action={<Ionicons name={period.icon} size={22} color={colors.warning} />} />
            {items.map((occurrence) => {
              const medication = data.medications.find((item) => item.id === occurrence.medicationId)!;
              return <DoseCard key={occurrence.id} occurrence={occurrence} medication={medication} onAction={(status) => recordDose(occurrence, status)} onUndo={() => undoDose(occurrence)} />;
            })}
          </View>
        );
      })}
      {canEditProfile(profile.id) ? <Button label="Přidat další lék" icon="add-circle-outline" variant="secondary" onPress={() => router.push('/medicine/new')} style={styles.addButton} /> : null}
      <Button label="Historie užívání" icon="calendar-outline" variant="ghost" onPress={() => router.push('/history')} style={styles.historyButton} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  addIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  headingRow: { marginTop: 24, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: colors.primary, fontSize: 13, fontWeight: '800', textTransform: 'capitalize', letterSpacing: 0.3 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', marginTop: 2 },
  progressCard: { backgroundColor: colors.primarySoft, borderColor: '#C5E5D8', flexDirection: 'row', gap: 13, marginBottom: 16 },
  progressIcon: { width: 45, height: 45, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  progressBody: { flex: 1 }, progressTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  track: { height: 7, borderRadius: 9, backgroundColor: '#C7DDD5', overflow: 'hidden', marginTop: 10 }, fill: { height: 7, borderRadius: 9, backgroundColor: colors.primary },
  sync: { color: colors.muted, fontSize: 11, marginTop: 7 }, period: { marginTop: 10 }, addButton: { marginTop: 16 }, historyButton: { marginTop: 6 },
  lowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, backgroundColor: colors.peach, borderColor: '#F3D2B8' },
  lowCardCritical: { backgroundColor: colors.dangerSoft, borderColor: '#F2C4C4' }, lowText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
});

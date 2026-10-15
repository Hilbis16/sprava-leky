import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, SectionTitle, StatusPill } from '@/components/ui';
import { forecastMedication } from '@/domain/forecast';
import { buildRxRequestMessage } from '@/domain/rxRequest';
import { courseFinished } from '@/domain/schedule';
import type { Medication } from '@/domain/types';
import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

const statusLabel = { draft: 'Připraveno', sent: 'Odesláno', completed: 'Vyřízeno', dismissed: 'Zrušeno' } as const;

export default function RequestsScreen() {
  const { data, saveRxRequest, updateRxRequestStatus } = useAppState();
  if (!data) return null;
  const profile = data.profiles.find((item) => item.id === data.currentProfileId)!;
  const doctor = data.prescribers.find((item) => item.profileId === profile.id && (item.kind ?? 'doctor') === 'doctor');
  const prescriptionMeds = data.medications.filter((item) => item.profileId === profile.id && item.prescription && item.active
    && !courseFinished(data.regimens.find((regimen) => regimen.medicationId === item.id)));
  const requests = data.rxRequests.filter((item) => item.profileId === profile.id && item.status !== 'dismissed');

  const prepare = async (medication: Medication, channel: 'sms' | 'email' | 'share') => {
    const regimen = data.regimens.find((item) => item.medicationId === medication.id);
    const forecast = forecastMedication(medication, regimen, data.inventoryEvents, data.doseActions);
    const message = buildRxRequestMessage({ profile, medication, prescriber: doctor, shortageAt: forecast.shortageAt });
    const id = saveRxRequest({ medicationId: medication.id, message, channel });
    try {
      if (channel === 'sms' && doctor?.phone) await Linking.openURL(`sms:${doctor.phone}?body=${encodeURIComponent(message)}`);
      else if (channel === 'email' && doctor?.email) await Linking.openURL(`mailto:${doctor.email}?subject=${encodeURIComponent(`Žádost o eRecept – ${medication.name}`)}&body=${encodeURIComponent(message)}`);
      else await Share.share({ message, title: `Žádost o eRecept – ${medication.name}` });
      Alert.alert('Je zpráva odeslaná?', 'Operační systém nám výsledek odeslání nesdělí. Označte stav ručně.', [
        { text: 'Zatím ne', style: 'cancel' },
        { text: 'Ano, odesláno', onPress: () => updateRxRequestStatus(id, 'sent') },
      ]);
    } catch { /* User can return and retry from the saved draft. */ }
  };

  return (
    <Screen>
      <View style={styles.header}><Text style={styles.eyebrow}>E-RECEPT</Text><Text style={styles.title}>Žádosti lékaři</Text><Text style={styles.lead}>Aplikace připraví zprávu. Odeslání i reakci lékaře vždy potvrzujete vy.</Text></View>
      <SectionTitle title="Aktivní žádosti" />
      {requests.length === 0 ? <EmptyState icon="checkmark-done-circle-outline" title="Žádná čekající žádost" body="Až bude lék docházet, připravíte žádost jedním klepnutím níže." /> : requests.map((request) => {
        const medication = data.medications.find((item) => item.id === request.medicationId);
        return (
          <Card key={request.id} style={styles.requestCard}>
            <View style={styles.requestTop}><View><Text style={styles.requestName}>{medication?.name}</Text><Text style={styles.requestDate}>Vytvořeno {new Intl.DateTimeFormat('cs-CZ').format(new Date(request.createdAt))}</Text></View><StatusPill label={statusLabel[request.status]} tone={request.status === 'completed' ? 'safe' : request.status === 'sent' ? 'warning' : 'neutral'} /></View>
            <Text numberOfLines={3} style={styles.message}>{request.message}</Text>
            <View style={styles.buttonRow}>
              {request.status === 'draft' ? <Button label="Označit odeslané" variant="secondary" onPress={() => updateRxRequestStatus(request.id, 'sent')} style={styles.flex} /> : null}
              {request.status === 'sent' ? <Button label="Vyřízeno" icon="checkmark" onPress={() => updateRxRequestStatus(request.id, 'completed')} style={styles.flex} /> : null}
            </View>
          </Card>
        );
      })}
      <SectionTitle title="Připravit novou" />
      {!doctor?.phone && !doctor?.email ? (
        <Card style={styles.medCard}>
          <View style={styles.medRow}><View style={styles.icon}><Ionicons name="person-add-outline" size={22} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.medName}>Chybí kontakt na lékaře</Text><Text style={styles.medMeta}>S telefonem nebo e-mailem připravíte žádost jako SMS či e-mail. Jinak ji můžete jen sdílet.</Text></View></View>
          <Button label="Doplnit kontakt" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/profile/[id]', params: { id: profile.id } })} style={styles.contactButton} />
        </Card>
      ) : null}
      {prescriptionMeds.map((medication) => {
        const regimen = data.regimens.find((item) => item.medicationId === medication.id);
        const forecast = forecastMedication(medication, regimen, data.inventoryEvents, data.doseActions);
        return (
          <Card key={medication.id} style={styles.medCard}>
            <View style={styles.medRow}><View style={styles.icon}><Ionicons name="document-text-outline" size={22} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.medName}>{medication.name} {medication.strength}</Text><Text style={styles.medMeta}>{forecast.daysRemaining === null ? 'Bez odhadu' : `Zásoba asi na ${forecast.daysRemaining} dní`}</Text></View></View>
            <View style={styles.channelRow}>
              {doctor?.phone ? <Button label="SMS" icon="chatbubble-outline" variant="secondary" onPress={() => void prepare(medication, 'sms')} style={styles.flex} /> : null}
              {doctor?.email ? <Button label="E-mail" icon="mail-outline" variant="secondary" onPress={() => void prepare(medication, 'email')} style={styles.flex} /> : null}
              <Button label="Sdílet" icon="share-outline" variant="ghost" onPress={() => void prepare(medication, 'share')} style={styles.flex} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 14, marginBottom: 20 }, eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '900', marginTop: 3 }, lead: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  requestCard: { marginBottom: 12 }, requestTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, requestName: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  requestDate: { color: colors.muted, fontSize: 12, marginTop: 3 }, message: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 12 }, buttonRow: { flexDirection: 'row', marginTop: 14 },
  medCard: { marginBottom: 12 }, medRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 }, medName: { color: colors.ink, fontSize: 16, fontWeight: '800' }, medMeta: { color: colors.muted, fontSize: 13, marginTop: 3 },
  channelRow: { flexDirection: 'row', gap: 6, marginTop: 16 }, contactButton: { marginTop: 14 },
});

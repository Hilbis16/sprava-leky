import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { PinDialog } from '@/components/PinDialog';
import { Screen } from '@/components/Screen';
import { Avatar, Button, Card, SectionTitle, StatusPill } from '@/components/ui';
import { createFamilyInvite, type FamilyInvite, type InviteRole } from '@/data/invites';
import { getSeniorPin, setSeniorPin } from '@/data/pinStore';
import { cloudEnabled } from '@/data/supabase';
import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

export default function FamilyScreen() {
  const { data, syncMessage, syncNow, resetDemo, setActiveRole } = useAppState();
  const [invite, setInvite] = useState<FamilyInvite | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pinStep, setPinStep] = useState<'none' | 'beforeSenior' | 'change'>('none');
  useEffect(() => { void getSeniorPin().then((pin) => setHasPin(Boolean(pin))); }, []);
  if (!data) return null;
  // The tabs layout redirects to /senior once the role is stored.
  const enterSeniorMode = () => { setPinStep('none'); setActiveRole('senior'); };
  const storePin = async (pin: string | null) => { await setSeniorPin(pin); setHasPin(Boolean(pin)); };
  const currentProfile = data.profiles.find((profile) => profile.id === data.currentProfileId) ?? data.profiles[0];

  const openInvite = async (role: InviteRole) => {
    if (!currentProfile) return;
    if (!cloudEnabled) {
      Alert.alert('Pozvánky potřebují cloud', 'Doplňte Supabase proměnné a spusťte migrace. Lokální demo zůstává plně funkční bez účtu.');
      return;
    }
    setInviteBusy(true);
    try {
      setInvite(await createFamilyInvite(currentProfile.id, role));
    } catch (error) {
      Alert.alert('Pozvánku se nepodařilo vytvořit', error instanceof Error ? error.message : 'Zkuste to prosím znovu.');
    } finally {
      setInviteBusy(false);
    }
  };

  const shareInvite = async () => {
    if (!invite || !currentProfile) return;
    await Share.share({
      title: 'Pozvánka do Moje léky',
      message: `Připojte se ke správě léků pro ${currentProfile.displayName}. Otevřete tento odkaz v aplikaci Moje léky: ${invite.url}`,
    });
  };

  return (
    <Screen>
      <View style={styles.header}><Text style={styles.eyebrow}>RODINNÝ PŘEHLED</Text><Text style={styles.title}>Rodina a zařízení</Text></View>
      <Card style={styles.modeCard}>
        <View style={styles.modeIcon}><Ionicons name="accessibility-outline" size={27} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={styles.modeTitle}>Režim pro seniora</Text><Text style={styles.modeBody}>Velké písmo, jen dnešní rozvrh a potvrzení dávky.</Text></View>
        <Button label="Otevřít" variant="secondary" onPress={() => (hasPin ? enterSeniorMode() : setPinStep('beforeSenior'))} />
      </Card>
      <SectionTitle title="Spravované osoby" />
      {data.profiles.map((profile) => {
        const members = data.memberships.filter((item) => item.profileId === profile.id);
        const medCount = data.medications.filter((item) => item.profileId === profile.id && item.active).length;
        return (
          <Pressable key={profile.id} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: profile.id } })} accessibilityRole="button" accessibilityLabel={`Upravit ${profile.displayName}`}>
            <Card style={styles.personCard}>
              <Avatar initials={profile.initials} color={profile.color} size={52} />
              <View style={styles.flex}><Text style={styles.personName}>{profile.displayName}</Text><Text style={styles.personMeta}>{medCount} {medCount === 1 ? 'lék' : medCount > 1 && medCount < 5 ? 'léky' : 'léků'} · {members.length} {members.length === 1 ? 'člen' : members.length > 1 && members.length < 5 ? 'členové' : 'členů'} rodiny</Text></View>
              {profile.id === data.currentProfileId ? <StatusPill label="Vybraná" tone="safe" /> : null}
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Card>
          </Pressable>
        );
      })}
      <Button label="Přidat osobu" icon="person-add-outline" variant="ghost" onPress={() => router.push({ pathname: '/profile/[id]', params: { id: 'new' } })} style={styles.addPerson} />
      <View style={styles.inviteActions}>
        <Button label="Pozvat pečujícího" icon="person-add-outline" variant="secondary" disabled={inviteBusy} onPress={() => void openInvite('caregiver')} style={styles.flex} />
        <Button label="Připojit seniora" icon="qr-code-outline" variant="secondary" disabled={inviteBusy} onPress={() => void openInvite('senior')} style={styles.flex} />
      </View>
      <SectionTitle title="Synchronizace" />
      <Card>
        <View style={styles.settingRow}><Ionicons name={cloudEnabled ? 'cloud-done-outline' : 'phone-portrait-outline'} size={25} color={colors.primary} /><View style={styles.flex}><Text style={styles.settingTitle}>{cloudEnabled ? 'EU cloud je připojený' : 'Lokální demo režim'}</Text><Text style={styles.settingBody}>{syncMessage}</Text></View></View>
        <Button label="Synchronizovat nyní" icon="sync-outline" onPress={() => void syncNow()} style={styles.syncButton} />
      </Card>
      <SectionTitle title="Nastavení pilotu" />
      <Card>
        <View style={styles.settingRow}><Ionicons name="notifications-outline" size={24} color={colors.primary} /><View style={styles.flex}><Text style={styles.settingTitle}>Upozornění na nepotvrzenou dávku</Text><Text style={styles.settingBody}>{cloudEnabled ? `Pečujícím po ${data.notificationPreferences.missedDoseDelayMinutes / 60} hodinách, bez názvu léku` : 'Funguje po připojení EU cloudu'}</Text></View></View>
        <View style={styles.divider} />
        <Pressable style={styles.settingRow} onPress={() => setPinStep('change')} accessibilityRole="button">
          <Ionicons name="keypad-outline" size={24} color={colors.primary} />
          <View style={styles.flex}><Text style={styles.settingTitle}>PIN režimu seniora</Text><Text style={styles.settingBody}>{hasPin ? 'Nastaven · klepnutím změníte' : 'Nenastaven · senior může režim opustit sám'}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={styles.divider} />
        <View style={styles.settingRow}><Ionicons name="lock-closed-outline" size={24} color={colors.primary} /><View style={styles.flex}><Text style={styles.settingTitle}>Soukromí</Text><Text style={styles.settingBody}>Fotografie pro OCR zůstávají v zařízení.</Text></View></View>
      </Card>
      <Button label="Obnovit demo data" variant="ghost" onPress={() => Alert.alert('Obnovit demo?', 'Vaše lokální změny budou nahrazeny ukázkovými daty.', [{ text: 'Zrušit', style: 'cancel' }, { text: 'Obnovit', style: 'destructive', onPress: () => void resetDemo() }])} style={styles.reset} />
      <PinDialog visible={pinStep !== 'none'}
        title={pinStep === 'beforeSenior' ? 'Zamknout režim seniora?' : hasPin ? 'Změnit PIN' : 'Nastavit PIN'}
        body="Režim seniora pak půjde opustit jen po zadání PINu, takže senior omylem nezmění nastavení. PIN zůstává jen v tomto zařízení."
        submitLabel={pinStep === 'beforeSenior' ? 'Nastavit a otevřít' : 'Uložit PIN'}
        onSubmit={async (pin) => { await storePin(pin); if (pinStep === 'beforeSenior') enterSeniorMode(); else setPinStep('none'); }}
        onCancel={() => setPinStep('none')}
        extraAction={pinStep === 'beforeSenior'
          ? { label: 'Otevřít bez PINu', onPress: enterSeniorMode }
          : hasPin ? { label: 'Zrušit PIN', onPress: () => { void storePin(null); setPinStep('none'); } } : undefined} />
      <Modal visible={Boolean(invite)} transparent animationType="fade" onRequestClose={() => setInvite(null)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.inviteModal}>
            <View style={styles.inviteIcon}><Ionicons name="people-outline" size={27} color={colors.primary} /></View>
            <Text style={styles.inviteTitle}>{invite?.role === 'senior' ? 'Připojit seniorův telefon' : 'Pozvat pečujícího'}</Text>
            <Text style={styles.inviteBody}>Naskenujte QR kód druhým telefonem. Pozvánka je jednorázová a vyprší {invite ? new Date(invite.expiresAt).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }) : ''}.</Text>
            {invite ? <View style={styles.qrWrap}><QRCode value={invite.url} size={210} color={colors.ink} backgroundColor={colors.white} /></View> : null}
            <Button label="Sdílet bezpečný odkaz" icon="share-social-outline" onPress={() => void shareInvite()} style={styles.fullWidth} />
            <Button label="Zavřít" variant="ghost" onPress={() => setInvite(null)} style={styles.fullWidth} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 14, marginBottom: 20 }, eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, title: { color: colors.ink, fontSize: 30, fontWeight: '900', marginTop: 3 },
  modeCard: { backgroundColor: colors.primarySoft, borderColor: '#C3E4D7', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  modeIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' }, modeBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, flex: { flex: 1 },
  personCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 11 }, personName: { color: colors.ink, fontSize: 17, fontWeight: '800' }, personMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 13 }, settingTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, settingBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  syncButton: { marginTop: 16 }, divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 }, reset: { marginTop: 18 },
  addPerson: { marginBottom: 6 },
  inviteActions: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  modalBackdrop: { flex: 1, padding: 20, backgroundColor: 'rgba(24,51,42,0.55)', alignItems: 'center', justifyContent: 'center' },
  inviteModal: { width: '100%', maxWidth: 390, alignItems: 'center', padding: 24 },
  inviteIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  inviteTitle: { color: colors.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  inviteBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  qrWrap: { padding: 14, backgroundColor: colors.white, borderRadius: 18, marginVertical: 20, borderWidth: 1, borderColor: colors.border },
  fullWidth: { width: '100%', marginTop: 8 },
});

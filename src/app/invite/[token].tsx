import { showMessage } from '@/components/message';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, Card } from '@/components/ui';
import { apiEnabled } from '@/data/api';
import { useAuth } from '@/state/AuthState';
import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

export default function AcceptInviteScreen() {
  const { user,setDemo } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const { acceptFamilyInvite } = useAppState();
  const [busy, setBusy] = useState(false);
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const accept = async () => {
    if (!token) {
      showMessage('Neplatná pozvánka', 'V odkazu chybí bezpečnostní token.');
      return;
    }
    setBusy(true);
    try {
      await acceptFamilyInvite(token);
      router.replace('/family');
      showMessage('Hotovo', 'Rodinný profil byl připojený k tomuto zařízení.');
    } catch (error) {
      showMessage('Pozvánku nelze přijmout', error instanceof Error ? error.message : 'Pozvánka mohla vypršet nebo už byla použitá.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen}>
      <Card style={styles.card}>
        <View style={styles.icon}><Ionicons name="people" size={34} color={colors.primary} /></View>
        <Text style={styles.title}>Rodinná pozvánka</Text>
        <Text style={styles.body}>Po potvrzení uvidíte sdílený přehled léků, zásob a žádostí. Pozvánku lze použít pouze jednou.</Text>
        {!apiEnabled ? <View style={styles.warning}><Ionicons name="cloud-offline-outline" size={20} color={colors.warning} /><Text style={styles.warningText}>Tato instalace zatím nemá připojenou službu.</Text></View> : null}
        {!user && apiEnabled ? <Button label="Přihlásit se pro přijetí" onPress={() => setDemo(false)} style={styles.button} /> : null}
        <Button label={busy ? 'Připojuji…' : 'Přijmout pozvánku'} icon="checkmark-circle-outline" disabled={busy || !apiEnabled || !user || !token} onPress={() => void accept()} style={styles.button} />
        <Button label="Zpět do aplikace" variant="ghost" onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center' },
  card: { alignItems: 'center', padding: 26 },
  icon: { width: 66, height: 66, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: colors.ink, fontSize: 27, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 10, maxWidth: 360 },
  warning: { marginTop: 18, borderRadius: 14, backgroundColor: colors.peach, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  warningText: { color: colors.warning, fontSize: 13, fontWeight: '700', flex: 1 },
  button: { alignSelf: 'stretch', marginTop: 22 },
});

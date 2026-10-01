import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { normalizeEreceptId } from '@/domain/erecept';
import { colors, radius } from '@/theme';

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [manual, setManual] = useState('');
  const accept = (raw: string) => {
    const id = normalizeEreceptId(raw);
    if (!id) { setLocked(false); Alert.alert('Tohle nevypadá jako eRecept', 'Očekáváme 12 písmen a číslic. Můžete je zadat ručně.'); return; }
    router.replace({ pathname: '/medicine/new', params: { ereceptId: id } });
  };
  if (!permission) return <View style={styles.center}><Text>Ověřuji fotoaparát…</Text></View>;
  return (
    <View style={styles.container}>
      {permission.granted ? (
        <View style={styles.cameraWrap}>
          <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={locked ? undefined : ({ data }) => { setLocked(true); accept(data); }} />
          <View style={styles.overlay}><View style={styles.scanBox} /><Text style={styles.guide}>Umístěte QR kód doprostřed rámečku</Text></View>
        </View>
      ) : <View style={styles.permission}><Text style={styles.permissionTitle}>Fotoaparát není povolen</Text><Text style={styles.permissionBody}>Můžete ho povolit, nebo zadat 12místný kód ručně.</Text><Button label="Povolit fotoaparát" icon="camera-outline" onPress={() => void requestPermission()} /></View>}
      <View style={styles.manual}><Text style={styles.manualTitle}>Nebo zadejte kód ručně</Text><TextInput value={manual} onChangeText={setManual} autoCapitalize="characters" placeholder="XXXX XXXX XXXX" placeholderTextColor="#91A099" style={styles.input} maxLength={16} /><Button label="Použít kód" onPress={() => accept(manual)} disabled={!manual.trim()} /></View>
      <Text style={styles.note}>QR ukládá pouze identifikátor. Název, balení a dávkování doplníte a potvrdíte v dalším kroku.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, padding: 18 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraWrap: { height: 330, borderRadius: 24, overflow: 'hidden', backgroundColor: '#16231F' }, overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.12)' }, scanBox: { width: 210, height: 210, borderWidth: 3, borderColor: colors.white, borderRadius: 24 }, guide: { color: colors.white, fontSize: 15, fontWeight: '800', marginTop: 18, textShadowColor: '#000', textShadowRadius: 8 },
  permission: { padding: 24, borderRadius: 24, backgroundColor: colors.surface, gap: 12 }, permissionTitle: { color: colors.ink, fontSize: 21, fontWeight: '900' }, permissionBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  manual: { marginTop: 18, gap: 10 }, manualTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' }, input: { height: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 16, color: colors.ink, fontSize: 19, fontWeight: '800', letterSpacing: 1 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16 },
});

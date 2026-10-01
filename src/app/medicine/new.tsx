import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, Card } from '@/components/ui';
import { normalizeEreceptId } from '@/domain/erecept';
import type { DayPeriod, DoseUnit } from '@/domain/types';
// Metro selects ocr.native.ts or ocr.web.ts for the target platform.
// eslint-disable-next-line import/no-unresolved
import { recognizeMedicineBox } from '@/services/ocr';
import { useAppState } from '@/state/AppState';
import { colors, radius } from '@/theme';

const periodDefaults: Record<DayPeriod, string> = { morning: '08:00', afternoon: '14:00', evening: '20:00' };
const periodLabels: Record<DayPeriod, string> = { morning: 'Ráno', afternoon: 'Odpoledne', evening: 'Večer' };

export default function AddMedicineScreen() {
  const params = useLocalSearchParams<{ ereceptId?: string }>();
  const { data, addMedicine } = useAppState();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [packageSize, setPackageSize] = useState('30');
  const [unit, setUnit] = useState<DoseUnit>('tablet');
  const [prescription, setPrescription] = useState(Boolean(params.ereceptId));
  const [ereceptId, setEreceptId] = useState(normalizeEreceptId(params.ereceptId ?? '') ?? '');
  const [daysMode, setDaysMode] = useState<'daily' | 'mwf'>('daily');
  const [periods, setPeriods] = useState<Record<DayPeriod, { enabled: boolean; amount: number }>>({
    morning: { enabled: true, amount: 1 }, afternoon: { enabled: false, amount: 1 }, evening: { enabled: false, amount: 1 },
  });
  const [ocrBusy, setOcrBusy] = useState(false);
  const profile = data?.profiles.find((item) => item.id === data.currentProfileId);
  const times = useMemo(() => (Object.keys(periods) as DayPeriod[]).filter((key) => periods[key].enabled).map((key) => ({ period: key, time: periodDefaults[key], amount: periods[key].amount })), [periods]);
  if (!data || !profile) return null;

  const captureBox = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert('Fotoaparát není povolen', 'Lék můžete zadat ručně, nebo povolit fotoaparát v nastavení telefonu.');
      const image = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true });
      if (image.canceled || !image.assets[0]) return;
      setOcrBusy(true);
      const result = await recognizeMedicineBox(image.assets[0].uri);
      if (result.suggestedName) setName(result.suggestedName);
      if (result.suggestedStrength) setStrength(result.suggestedStrength);
      if (result.suggestedPackageSize) setPackageSize(String(result.suggestedPackageSize));
      Alert.alert('Text byl rozpoznán', 'Před pokračováním prosím všechny údaje zkontrolujte.');
    } catch (error) {
      Alert.alert('Rozpoznání se nezdařilo', error instanceof Error ? error.message : 'Použijte ruční zadání.');
    } finally { setOcrBusy(false); }
  };

  const next = () => {
    if (step === 1 && !name.trim()) return Alert.alert('Doplňte název', 'Název léku je povinný.');
    if (step === 2 && (!Number(packageSize) || Number(packageSize) <= 0 || times.length === 0)) return Alert.alert('Zkontrolujte údaje', 'Zadejte počet kusů a vyberte alespoň jednu denní dávku.');
    setStep((value) => Math.min(3, value + 1));
  };

  const save = async () => {
    const id = await addMedicine({
      profileId: profile.id, name, strength, packageSize: Number(packageSize), unit, prescription,
      ereceptId: normalizeEreceptId(ereceptId) ?? undefined,
      times, daysOfWeek: daysMode === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [1, 3, 5],
    });
    router.replace(`/medicine/${id}`);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.progressRow}>{[1, 2, 3].map((item) => <View key={item} style={[styles.progressDot, item <= step && styles.progressDotActive]} />)}</View>
        <Text style={styles.kicker}>KROK {step} ZE 3</Text>
        {step === 1 ? <>
          <Text style={styles.title}>Který lék přidáváte?</Text><Text style={styles.lead}>Foto údaje pouze předvyplní. Uloží se až po vaší kontrole.</Text>
          <View style={styles.captureRow}>
            <Button label={ocrBusy ? 'Rozpoznávám…' : 'Vyfotit krabičku'} icon="camera-outline" onPress={() => void captureBox()} disabled={ocrBusy} style={styles.capture} />
            <Button label="QR eRecept" icon="qr-code-outline" variant="secondary" onPress={() => router.push('/scanner')} style={styles.capture} />
          </View>
          <Field label="Název léku" value={name} onChangeText={setName} placeholder="např. Atorvastatin" autoFocus />
          <Field label="Síla" value={strength} onChangeText={setStrength} placeholder="např. 20 mg" />
          <Field label="ID eReceptu (volitelné)" value={ereceptId} onChangeText={setEreceptId} placeholder="XXXX XXXX XXXX" autoCapitalize="characters" />
          <Text style={styles.hint}><Ionicons name="shield-checkmark-outline" size={15} /> Fotografie se zpracuje v telefonu a neukládá se do cloudu.</Text>
        </> : null}
        {step === 2 ? <>
          <Text style={styles.title}>Balení a dávkování</Text><Text style={styles.lead}>Každý lék má vlastní počet kusů a vlastní rozvrh.</Text>
          <Field label="Počet kusů v balení" value={packageSize} onChangeText={setPackageSize} keyboardType="decimal-pad" placeholder="30" />
          <Text style={styles.label}>Jednotka</Text>
          <View style={styles.segment}><Choice label="Tablety" selected={unit === 'tablet'} onPress={() => setUnit('tablet')} /><Choice label="Kapsle" selected={unit === 'capsule'} onPress={() => setUnit('capsule')} /></View>
          <View style={styles.switchRow}><View><Text style={styles.labelNoMargin}>Lék na předpis</Text><Text style={styles.small}>Umožní připravit žádost lékaři</Text></View><Switch value={prescription} onValueChange={setPrescription} trackColor={{ true: colors.primary }} /></View>
          <Text style={styles.label}>Které dny?</Text>
          <View style={styles.segment}><Choice label="Každý den" selected={daysMode === 'daily'} onPress={() => setDaysMode('daily')} /><Choice label="Po · St · Pá" selected={daysMode === 'mwf'} onPress={() => setDaysMode('mwf')} /></View>
          <Text style={styles.label}>Denní dávky</Text>
          {(Object.keys(periods) as DayPeriod[]).map((period) => (
            <Card key={period} style={[styles.periodCard, periods[period].enabled && styles.periodCardActive]}>
              <Pressable style={styles.periodToggle} onPress={() => setPeriods((current) => ({ ...current, [period]: { ...current[period], enabled: !current[period].enabled } }))}>
                <Ionicons name={periods[period].enabled ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={periods[period].enabled ? colors.primary : colors.muted} />
                <View style={styles.flex}><Text style={styles.periodName}>{periodLabels[period]}</Text><Text style={styles.small}>{periodDefaults[period]}</Text></View>
              </Pressable>
              {periods[period].enabled ? <View style={styles.amountRow}><Text style={styles.small}>Množství</Text><Button label="−" variant="ghost" onPress={() => setPeriods((current) => ({ ...current, [period]: { ...current[period], amount: Math.max(unit === 'tablet' ? 0.5 : 1, current[period].amount - (unit === 'tablet' ? 0.5 : 1)) } }))} /><Text style={styles.amount}>{periods[period].amount}</Text><Button label="+" variant="ghost" onPress={() => setPeriods((current) => ({ ...current, [period]: { ...current[period], amount: current[period].amount + (unit === 'tablet' ? 0.5 : 1) } }))} /></View> : null}
            </Card>
          ))}
        </> : null}
        {step === 3 ? <>
          <Text style={styles.title}>Poslední kontrola</Text><Text style={styles.lead}>Aplikace dávkování neurčuje. Potvrďte, že odpovídá pokynům lékaře.</Text>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryIcon}><Ionicons name="medical" size={29} color={colors.primary} /></View>
            <Text style={styles.summaryName}>{name} {strength}</Text>
            <SummaryRow label="Pro koho" value={profile.displayName} />
            <SummaryRow label="Balení" value={`${packageSize} ${unit === 'tablet' ? 'tablet' : 'kapslí'}`} />
            <SummaryRow label="Dny" value={daysMode === 'daily' ? 'Každý den' : 'Pondělí, středa, pátek'} />
            <SummaryRow label="Dávky" value={times.map((time) => `${time.time} · ${time.amount}`).join(', ')} />
            <SummaryRow label="Typ" value={prescription ? 'Na předpis' : 'Volně prodejný'} />
          </Card>
          <View style={styles.notice}><Ionicons name="information-circle-outline" size={22} color={colors.warning} /><Text style={styles.noticeText}>Při nejasnostech dávkování vždy ověřte u lékaře nebo lékárníka.</Text></View>
        </> : null}
        <View style={styles.footer}>{step > 1 ? <Button label="Zpět" variant="ghost" onPress={() => setStep((value) => value - 1)} style={styles.flex} /> : null}<Button label={step === 3 ? 'Uložit lék' : 'Pokračovat'} icon={step === 3 ? 'checkmark' : 'arrow-forward'} onPress={step === 3 ? () => void save() : next} style={styles.flex} /></View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor="#91A099" /></View>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceActive]}><Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text></Pressable>; }
function SummaryRow({ label, value }: { label: string; value: string }) { return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, progressRow: { flexDirection: 'row', gap: 7, paddingTop: 8, marginBottom: 18 }, progressDot: { flex: 1, height: 6, borderRadius: 6, backgroundColor: colors.border }, progressDotActive: { backgroundColor: colors.primary },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '900', marginTop: 5 }, lead: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  captureRow: { flexDirection: 'row', gap: 8, marginBottom: 14 }, capture: { flex: 1 }, field: { marginBottom: 13 }, label: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 7, marginTop: 7 }, labelNoMargin: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  input: { minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 15, color: colors.ink, fontSize: 17 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 }, segment: { flexDirection: 'row', backgroundColor: '#E9EEEB', padding: 4, borderRadius: radius.md, marginBottom: 11 }, choice: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, choiceActive: { backgroundColor: colors.surface }, choiceText: { color: colors.muted, fontSize: 14, fontWeight: '700' }, choiceTextActive: { color: colors.primaryDark },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, borderRadius: radius.md, marginVertical: 12 }, small: { color: colors.muted, fontSize: 12, marginTop: 2 },
  periodCard: { padding: 14, marginBottom: 9, shadowOpacity: 0 }, periodCardActive: { borderColor: '#9DD2BE', backgroundColor: '#F9FFFC' }, periodToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 }, periodName: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 8, gap: 4 }, amount: { minWidth: 34, color: colors.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  summaryCard: { alignItems: 'center' }, summaryIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, summaryName: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 10, marginBottom: 14 }, summaryRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 15, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }, summaryLabel: { color: colors.muted, fontSize: 13 }, summaryValue: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  notice: { flexDirection: 'row', gap: 10, backgroundColor: colors.peach, padding: 14, borderRadius: radius.md, marginTop: 14 }, noticeText: { flex: 1, color: colors.warning, fontSize: 13, lineHeight: 19 }, footer: { flexDirection: 'row', gap: 8, marginTop: 24 },
});

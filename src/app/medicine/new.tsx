import { showMessage } from '@/components/message';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, Card } from '@/components/ui';
import { formatEreceptId, normalizeEreceptId } from '@/domain/erecept';
import { formatCzechDate, localDateKey, normalizeTime, parseCzechDate } from '@/domain/schedule';
import type { DayPeriod, DoseUnit } from '@/domain/types';
import { limits, medicineDetailsSchema, medicineDraftSchema, parseQuantity, positiveQuantitySchema, validationMessage } from '@/domain/validation';
import { daysLabel, everyDay, weekDays } from '@/domain/weekdays';
// Metro selects ocr.native.ts or ocr.web.ts for the target platform.
// eslint-disable-next-line import/no-unresolved
import { recognizeMedicineBox } from '@/services/ocr';
import { useAppState } from '@/state/AppState';
import { colors, radius } from '@/theme';

const periodDefaults: Record<DayPeriod, string> = { morning: '08:00', afternoon: '14:00', evening: '20:00' };
const periodLabels: Record<DayPeriod, string> = { morning: 'Ráno', afternoon: 'Odpoledne', evening: 'Večer' };
const allPeriods: DayPeriod[] = ['morning', 'afternoon', 'evening'];

type PeriodState = { enabled: boolean; amount: number; time: string };

export default function AddMedicineScreen() {
  const params = useLocalSearchParams<{ ereceptId?: string; id?: string }>();
  const { data, addMedicine, updateMedicine,canEditProfile } = useAppState();
  const editing = params.id ? data?.medications.find((item) => item.id === params.id) : undefined;
  const editingRegimen = editing ? data?.regimens.find((item) => item.medicationId === editing.id) : undefined;
  const [step, setStep] = useState(1);
  const [name, setName] = useState(editing?.name ?? '');
  const [strength, setStrength] = useState(editing?.strength ?? '');
  const [packageSize, setPackageSize] = useState(String(editing?.packageSize ?? 30));
  const [unit, setUnit] = useState<DoseUnit>(editing?.unit ?? 'tablet');
  const [prescription, setPrescription] = useState(editing?.prescription ?? Boolean(params.ereceptId));
  const [ereceptId, setEreceptId] = useState(editing?.ereceptId ? formatEreceptId(editing.ereceptId) : normalizeEreceptId(params.ereceptId ?? '') ?? '');
  const [days, setDays] = useState<number[]>(editingRegimen?.daysOfWeek ?? everyDay);
  const [note, setNote] = useState(editing?.note ?? '');
  const [limited, setLimited] = useState(Boolean(editingRegimen?.endsOn));
  const [endDate, setEndDate] = useState(editingRegimen?.endsOn ? formatCzechDate(editingRegimen.endsOn) : '');
  const [periods, setPeriods] = useState<Record<DayPeriod, PeriodState>>(() => Object.fromEntries(allPeriods.map((period) => {
    const existing = editingRegimen?.times.find((item) => item.period === period);
    return [period, existing
      ? { enabled: true, amount: existing.amount, time: existing.time }
      : { enabled: !editingRegimen && period === 'morning', amount: 1, time: periodDefaults[period] }];
  })) as Record<DayPeriod, PeriodState>);
  const [ocrBusy, setOcrBusy] = useState(false);
  const profile = data?.profiles.find((item) => item.id === (editing?.profileId ?? data.currentProfileId));
  const times = useMemo(() => allPeriods.filter((key) => periods[key].enabled)
    .map((key) => ({ period: key, time: normalizeTime(periods[key].time) ?? periods[key].time, amount: periods[key].amount }))
    .sort((left, right) => left.time.localeCompare(right.time)), [periods]);
  if (!data || !profile) return null;
  if (!canEditProfile(profile.id)) return <Screen><Text>Úpravy léků jsou dostupné vlastníkovi a pečujícím.</Text></Screen>;
  const setPeriod = (period: DayPeriod, change: Partial<PeriodState>) =>
    setPeriods((current) => ({ ...current, [period]: { ...current[period], ...change } }));
  const toggleDay = (day: number) => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());

  const captureBox = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return showMessage('Fotoaparát není povolen', 'Lék můžete zadat ručně, nebo povolit fotoaparát v nastavení telefonu.');
      const image = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true });
      if (image.canceled || !image.assets[0]) return;
      setOcrBusy(true);
      const result = await recognizeMedicineBox(image.assets[0].uri);
      if (result.suggestedName) setName(result.suggestedName);
      if (result.suggestedStrength) setStrength(result.suggestedStrength);
      if (result.suggestedPackageSize) setPackageSize(String(result.suggestedPackageSize));
      showMessage('Text byl rozpoznán', 'Před pokračováním prosím všechny údaje zkontrolujte.');
    } catch (error) {
      showMessage('Rozpoznání se nezdařilo', error instanceof Error ? error.message : 'Použijte ruční zadání.');
    } finally { setOcrBusy(false); }
  };

  const next = () => {
    const details = medicineDetailsSchema.safeParse({ name, strength, note });
    if (step === 1 && !details.success) return showMessage('Zkontrolujte údaje', validationMessage(details.error));
    if (step === 1 && ereceptId.trim() && !normalizeEreceptId(ereceptId)) return showMessage('Zkontrolujte eRecept', 'Identifikátor eReceptu musí mít 12 písmen nebo číslic.');
    const quantity = positiveQuantitySchema.safeParse(parseQuantity(packageSize));
    if (step === 2 && !quantity.success) return showMessage('Zkontrolujte počet', validationMessage(quantity.error));
    if (step === 2 && times.length === 0) return showMessage('Vyberte dávku', 'Vyberte alespoň jednu denní dávku.');
    if (step === 2 && times.some((time) => !positiveQuantitySchema.safeParse(time.amount).success)) return showMessage('Zkontrolujte množství', 'Množství dávky musí být kladné, nejvýše 1 000 000 a mít nejvýše dvě desetinná místa.');
    if (step === 2 && days.length === 0) return showMessage('Vyberte dny', 'Lék musí mít alespoň jeden den v týdnu.');
    if (step === 2 && times.some((time) => !normalizeTime(time.time))) return showMessage('Neplatný čas', 'Čas zadejte ve tvaru 08:00.');
    if (step === 2 && new Set(times.map((time) => time.time)).size !== times.length) return showMessage('Stejný čas', 'Dvě dávky nemohou mít stejný čas.');
    if (step === 2 && limited && !parseCzechDate(endDate)) return showMessage('Zkontrolujte datum', 'Poslední den léčby zadejte ve tvaru 31. 12. 2026.');
    if (step === 2 && limited && parseCzechDate(endDate)! < localDateKey(new Date())) return showMessage('Datum je v minulosti', 'Poslední den léčby nemůže být dříve než dnes.');
    setStep((value) => Math.min(3, value + 1));
  };

  const save = async () => {
    const draft = {
      profileId: profile.id, name, strength, packageSize: parseQuantity(packageSize), unit, prescription,
      ereceptId: normalizeEreceptId(ereceptId) ?? undefined, times, daysOfWeek: days,
      note, endsOn: limited ? parseCzechDate(endDate) ?? undefined : undefined,
    };
    const parsed = medicineDraftSchema.safeParse(draft);
    if (!parsed.success) return showMessage('Změnu nelze uložit', validationMessage(parsed.error));
    if (editing) {
      if (!updateMedicine(editing.id, parsed.data)) return;
      router.back();
      return;
    }
    const id = await addMedicine(parsed.data);
    if (id) router.replace(`/medicine/${id}`);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Stack.Screen options={{ title: editing ? 'Upravit lék' : 'Přidat lék' }} />
        <View style={styles.progressRow}>{[1, 2, 3].map((item) => <View key={item} style={[styles.progressDot, item <= step && styles.progressDotActive]} />)}</View>
        <Text style={styles.kicker}>KROK {step} ZE 3</Text>
        {step === 1 ? <>
          <Text style={styles.title}>{editing ? 'Údaje o léku' : 'Který lék přidáváte?'}</Text><Text style={styles.lead}>Foto údaje pouze předvyplní. Uloží se až po vaší kontrole.</Text>
          <View style={styles.captureRow}>
            <Button label={ocrBusy ? 'Rozpoznávám…' : 'Vyfotit krabičku'} icon="camera-outline" onPress={() => void captureBox()} disabled={ocrBusy} style={styles.capture} />
            <Button label="QR eRecept" icon="qr-code-outline" variant="secondary" onPress={() => router.push('/scanner')} style={styles.capture} />
          </View>
          <Field label="Název léku" value={name} onChangeText={setName} placeholder="např. Atorvastatin" maxLength={limits.medicationName} autoFocus />
          <Field label="Síla" value={strength} onChangeText={setStrength} placeholder="např. 20 mg" maxLength={limits.text} />
          <Field label="Pokyny k užívání (nepovinné)" value={note} onChangeText={setNote} placeholder="např. nalačno, zapít vodou" maxLength={200} />
          <Field label="ID eReceptu (volitelné)" value={ereceptId} onChangeText={setEreceptId} placeholder="XXXX XXXX XXXX" autoCapitalize="characters" />
          <Text style={styles.hint}><Ionicons name="shield-checkmark-outline" size={15} /> Fotografie se zpracuje v telefonu a neukládá se do cloudu.</Text>
        </> : null}
        {step === 2 ? <>
          <Text style={styles.title}>Balení a dávkování</Text><Text style={styles.lead}>Každý lék má vlastní počet kusů a vlastní rozvrh.</Text>
          <Field label="Počet kusů v balení" value={packageSize} onChangeText={setPackageSize} keyboardType="decimal-pad" placeholder="30" />
          {editing ? <Text style={styles.hint}>Změna velikosti balení neovlivní současnou zásobu. Projeví se při dalším doplnění.</Text> : null}
          <Text style={styles.label}>Jednotka</Text>
          <View style={styles.segment}><Choice label="Tablety" selected={unit === 'tablet'} onPress={() => setUnit('tablet')} /><Choice label="Kapsle" selected={unit === 'capsule'} onPress={() => setUnit('capsule')} /></View>
          <View style={styles.switchRow}><View><Text style={styles.labelNoMargin}>Lék na předpis</Text><Text style={styles.small}>Umožní připravit žádost lékaři</Text></View><Switch value={prescription} onValueChange={setPrescription} trackColor={{ true: colors.primary }} /></View>
          <Text style={styles.label}>Které dny?</Text>
          <View style={styles.dayRow}>
            {weekDays.map((item) => (
              <Pressable key={item.day} onPress={() => toggleDay(item.day)} style={[styles.day, days.includes(item.day) && styles.dayActive]}
                accessibilityRole="checkbox" accessibilityState={{ checked: days.includes(item.day) }} accessibilityLabel={item.long}>
                <Text style={[styles.dayText, days.includes(item.day) && styles.dayTextActive]}>{item.short}</Text>
              </Pressable>
            ))}
          </View>
          {days.length !== 7 ? <Pressable onPress={() => setDays(everyDay)}><Text style={styles.link}>Vybrat každý den</Text></Pressable> : null}
          <Text style={styles.label}>Jak dlouho?</Text>
          <View style={styles.segment}><Choice label="Dlouhodobě" selected={!limited} onPress={() => setLimited(false)} /><Choice label="Do data (kúra)" selected={limited} onPress={() => setLimited(true)} /></View>
          {limited ? <Field label="Poslední den léčby" value={endDate} onChangeText={setEndDate} placeholder="např. 24. 10. 2026" keyboardType="numbers-and-punctuation" /> : null}
          <Text style={styles.label}>Denní dávky</Text>
          {allPeriods.map((period) => {
            const state = periods[period];
            const amountStep = unit === 'tablet' ? 0.5 : 1;
            const timeValid = Boolean(normalizeTime(state.time));
            return (
              <Card key={period} style={[styles.periodCard, state.enabled && styles.periodCardActive]}>
                <Pressable style={styles.periodToggle} onPress={() => setPeriod(period, { enabled: !state.enabled })}
                  accessibilityRole="checkbox" accessibilityState={{ checked: state.enabled }}>
                  <Ionicons name={state.enabled ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={state.enabled ? colors.primary : colors.muted} />
                  <View style={styles.flex}><Text style={styles.periodName}>{periodLabels[period]}</Text><Text style={styles.small}>{normalizeTime(state.time) ?? state.time}</Text></View>
                </Pressable>
                {state.enabled ? <>
                  <View style={styles.amountRow}>
                    <Text style={styles.small}>Čas</Text>
                    <TextInput value={state.time} onChangeText={(time) => setPeriod(period, { time })}
                      onBlur={() => setPeriod(period, { time: normalizeTime(state.time) ?? state.time })}
                      keyboardType="numbers-and-punctuation" maxLength={5} placeholder={periodDefaults[period]} placeholderTextColor="#91A099"
                      style={[styles.timeInput, !timeValid && styles.timeInputInvalid]} accessibilityLabel={`Čas dávky – ${periodLabels[period]}`} />
                  </View>
                  <View style={styles.amountRow}><Text style={styles.small}>Množství</Text><Button label="−" variant="ghost" onPress={() => setPeriod(period, { amount: Math.max(amountStep, state.amount - amountStep) })} /><Text style={styles.amount}>{state.amount}</Text><Button label="+" variant="ghost" onPress={() => setPeriod(period, { amount: state.amount + amountStep })} /></View>
                </> : null}
              </Card>
            );
          })}
        </> : null}
        {step === 3 ? <>
          <Text style={styles.title}>Poslední kontrola</Text><Text style={styles.lead}>Aplikace dávkování neurčuje. Potvrďte, že odpovídá pokynům lékaře.{editing ? ' Změněný rozpis platí od dnešního dne.' : ''}</Text>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryIcon}><Ionicons name="medical" size={29} color={colors.primary} /></View>
            <Text style={styles.summaryName}>{name} {strength}</Text>
            <SummaryRow label="Pro koho" value={profile.displayName} />
            <SummaryRow label="Balení" value={`${packageSize} ${unit === 'tablet' ? 'tablet' : 'kapslí'}`} />
            <SummaryRow label="Dny" value={daysLabel(days)} />
            <SummaryRow label="Délka" value={limited && parseCzechDate(endDate) ? `Do ${formatCzechDate(parseCzechDate(endDate)!)}` : 'Dlouhodobě'} />
            {note.trim() ? <SummaryRow label="Pokyny" value={note.trim()} /> : null}
            <SummaryRow label="Dávky" value={times.map((time) => `${time.time} · ${time.amount}`).join(', ')} />
            <SummaryRow label="Typ" value={prescription ? 'Na předpis' : 'Volně prodejný'} />
          </Card>
          <View style={styles.notice}><Ionicons name="information-circle-outline" size={22} color={colors.warning} /><Text style={styles.noticeText}>Při nejasnostech dávkování vždy ověřte u lékaře nebo lékárníka.</Text></View>
        </> : null}
        <View style={styles.footer}>{step > 1 ? <Button label="Zpět" variant="ghost" onPress={() => setStep((value) => value - 1)} style={styles.flex} /> : null}<Button label={step === 3 ? (editing ? 'Uložit změny' : 'Uložit lék') : 'Pokračovat'} icon={step === 3 ? 'checkmark' : 'arrow-forward'} onPress={step === 3 ? () => void save() : next} style={styles.flex} /></View>
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
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  day: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary }, dayText: { color: colors.muted, fontSize: 14, fontWeight: '800' }, dayTextActive: { color: colors.white },
  link: { color: colors.primaryDark, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  timeInput: { width: 86, minHeight: 42, marginLeft: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, textAlign: 'center', color: colors.ink, fontSize: 17, fontWeight: '800' },
  timeInputInvalid: { borderColor: colors.danger },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 8, gap: 4 }, amount: { minWidth: 34, color: colors.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  summaryCard: { alignItems: 'center' }, summaryIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, summaryName: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 10, marginBottom: 14 }, summaryRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 15, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }, summaryLabel: { color: colors.muted, fontSize: 13 }, summaryValue: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  notice: { flexDirection: 'row', gap: 10, backgroundColor: colors.peach, padding: 14, borderRadius: radius.md, marginTop: 14 }, noticeText: { flex: 1, color: colors.warning, fontSize: 13, lineHeight: 19 }, footer: { flexDirection: 'row', gap: 8, marginTop: 24 },
});

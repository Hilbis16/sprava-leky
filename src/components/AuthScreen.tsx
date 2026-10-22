import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Screen } from './Screen';
import { Button, Card } from './ui';
import { useAuth } from '@/state/AuthState';
import { colors } from '@/theme';

export function AuthScreen() {
  const { requestCode,verifyCode,setDemo } = useAuth();
  const [email,setEmail] = useState(''); const [name,setName] = useState(''); const [otp,setOtp] = useState('');
  const [sent,setSent] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const [cooldown,setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown-1),1000); return () => clearTimeout(timer); },[cooldown]);
  const act = async (verify: boolean) => {
    setBusy(true); setError('');
    try {
      if (verify) await verifyCode(email,otp,name);
      else { await requestCode(email); setSent(true); setCooldown(60); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Server není dostupný. Zkuste to znovu.'); }
    finally { setBusy(false); }
  };
  return <Screen contentStyle={styles.screen}><Card>
    <Text style={styles.title}>Moje léky</Text>
    <Text style={styles.body}>Přihlaste se kódem z e-mailu. Pokud účet ještě nemáte, po ověření ho vytvoříme.</Text>
    <Field label="E-mail" value={email} onChangeText={(text) => { setEmail(text); setSent(false); setOtp(''); }} keyboardType="email-address" autoCapitalize="none" />
    <Field label="Vaše jméno (pro nový účet)" value={name} onChangeText={setName} />
    {sent ? <><Text style={styles.body}>Kód jsme odeslali. Platí pět minut; zkontrolujte také nevyžádanou poštu.</Text>
      <Field label="Šestimístný kód" value={otp} onChangeText={(text) => setOtp(text.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" />
      <Button label={busy ? 'Ověřuji…' : 'Přihlásit'} disabled={busy || otp.length !== 6} onPress={() => void act(true)} />
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.gap}><Button label={sent ? cooldown ? `Nový kód za ${cooldown} s` : 'Poslat nový kód' : busy ? 'Odesílám…' : 'Poslat přihlašovací kód'} disabled={busy || cooldown>0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} variant={sent ? 'secondary' : 'primary'} onPress={() => void act(false)} /></View>
    <Button label="Vyzkoušet demo bez účtu" variant="ghost" disabled={busy} onPress={() => setDemo(true)} />
  </Card></Screen>;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1,justifyContent: 'center',maxWidth: 520,width: '100%',alignSelf: 'center' },title: { fontSize: 30,fontWeight: '900',color: colors.ink },body: { color: colors.muted,lineHeight: 22,marginVertical: 14 },error: { color: colors.warning,marginVertical: 12 },gap: { marginTop: 12 } });

function Field({ label,...props }: TextInputProps & { label: string }) {
  return <View style={{ marginBottom: 16 }}><Text style={{ color: colors.ink,fontWeight: '700',marginBottom: 6 }}>{label}</Text>
    <TextInput {...props} accessibilityLabel={label} style={{ borderWidth: 1,borderColor: colors.border,borderRadius: 12,padding: 12,color: colors.ink,fontSize: 16 }} />
  </View>;
}

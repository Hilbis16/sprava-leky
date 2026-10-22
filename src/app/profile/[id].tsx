import { showMessage } from '@/components/message';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { confirmAction } from '@/components/confirm';
import { Screen } from '@/components/Screen';
import { Avatar, Button, Card, SectionTitle } from '@/components/ui';
import type { PrescriberContact } from '@/domain/types';
import { contactSchema, limits, profileNameSchema, validationMessage } from '@/domain/validation';
import { useAppState } from '@/state/AppState';
import { colors, radius } from '@/theme';

const palette = ['#147D64', '#B85C18', '#2F6FB0', '#8A4FB5', '#B83A6B', '#5C6B2E'];
type ContactKind = NonNullable<PrescriberContact['kind']>;
const contactLabels: Record<ContactKind, { title: string; placeholder: string }> = {
  doctor: { title: 'Praktický lékař', placeholder: 'např. MUDr. Eva Veselá' },
  pharmacy: { title: 'Lékárna', placeholder: 'např. Lékárna U Anděla' },
};

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, saveProfile, removeProfile,canEditProfile } = useAppState();
  const profile = id === 'new' ? undefined : data?.profiles.find((item) => item.id === id);
  const [name, setName] = useState(profile?.displayName ?? '');
  const [color, setColor] = useState(profile?.color ?? palette[0]!);
  if (!data) return null;
  if (id !== 'new' && !profile) return <Screen><Text style={styles.body}>Osoba nebyla nalezena.</Text></Screen>;
  const editable = !profile || canEditProfile(profile.id);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?';

  const save = () => {
    const parsed = profileNameSchema.safeParse(name);
    if (!parsed.success) return showMessage('Zkontrolujte jméno', validationMessage(parsed.error));
    const savedId = saveProfile({ id: profile?.id, displayName: parsed.data, color });
    if (!savedId) return;
    if (!profile) router.replace({ pathname: '/profile/[id]', params: { id: savedId } });
    else showMessage('Uloženo', 'Údaje osoby byly uloženy.');
  };
  const remove = async () => {
    if (!profile) return;
    const confirmed = await confirmAction('Odebrat osobu?', `${profile.displayName} zmizí z aplikace i se všemi léky, zásobami a historií. V rodinném cloudu ji tím smaže vlastník; ostatní se jen odpojí.`, 'Odebrat', true);
    if (!confirmed) return;
    removeProfile(profile.id);
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: profile ? 'Osoba a kontakty' : 'Přidat osobu' }} />
      <View style={styles.hero}><Avatar initials={initials} color={color} size={68} /></View>
      <Text style={styles.label}>Jméno</Text>
      <TextInput editable={editable} value={name} onChangeText={setName} maxLength={limits.profileName} placeholder="např. Jana Nováková" placeholderTextColor="#91A099" style={styles.input} autoFocus={!profile} />
      <Text style={styles.label}>Barva</Text>
      <View style={styles.palette}>
        {palette.map((swatch) => (
          <Pressable key={swatch} disabled={!editable} onPress={() => setColor(swatch)} style={[styles.swatch, { backgroundColor: swatch }, color === swatch && styles.swatchActive]}
            accessibilityRole="radio" accessibilityState={{ selected: color === swatch }} accessibilityLabel={`Barva ${swatch}`}>
            {color === swatch ? <Ionicons name="checkmark" size={22} color={colors.white} /> : null}
          </Pressable>
        ))}
      </View>
      {editable ? <Button label={profile ? 'Uložit změny' : 'Přidat osobu'} icon="checkmark" onPress={save} style={styles.save} /> : <Text style={styles.hint}>Údaje upravuje vlastník nebo pečující.</Text>}
      {profile ? <>
        <ContactCard profileId={profile.id} kind="doctor" />
        <ContactCard profileId={profile.id} kind="pharmacy" />
        {data.profiles.length > 1
          ? <Button label="Odebrat osobu" icon="trash-outline" variant="ghost" onPress={() => void remove()} style={styles.remove} />
          : <Text style={styles.hint}>Poslední osobu nelze odebrat.</Text>}
      </> : <Text style={styles.hint}>Kontakty na lékaře a lékárnu doplníte po přidání osoby.</Text>}
    </Screen>
  );
}

function ContactCard({ profileId, kind }: { profileId: string; kind: ContactKind }) {
  const { data, saveContact, removeContact,canEditProfile } = useAppState();
  const contact = data?.prescribers.find((item) => item.profileId === profileId && (item.kind ?? 'doctor') === kind);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const labels = contactLabels[kind];

  const startEdit = () => { setName(contact?.name ?? ''); setPhone(contact?.phone ?? ''); setEmail(contact?.email ?? ''); setEditing(true); };
  const save = () => {
    const parsed = contactSchema.omit({ id: true, profileId: true }).safeParse({ kind, name: name.trim(), phone: phone.trim(), email: email.trim() });
    if (!parsed.success) return showMessage('Zkontrolujte kontakt', validationMessage(parsed.error));
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return showMessage('Zkontrolujte e-mail', 'E-mailová adresa nevypadá správně.');
    if (!saveContact({ id: contact?.id, profileId, ...parsed.data })) return;
    setEditing(false);
  };
  const remove = async () => {
    if (!contact || !(await confirmAction('Odebrat kontakt?', contact.name, 'Odebrat', true))) return;
    removeContact(contact.id);
    setEditing(false);
  };

  return (
    <>
      <SectionTitle title={labels.title} action={!editing && canEditProfile(profileId) ? <Button label={contact ? 'Upravit' : 'Přidat'} icon={contact ? 'create-outline' : 'add'} variant="ghost" onPress={startEdit} /> : undefined} />
      <Card style={styles.contactCard}>
        {editing ? <>
          <TextInput value={name} onChangeText={setName} maxLength={limits.contactName} placeholder={labels.placeholder} placeholderTextColor="#91A099" style={styles.input} accessibilityLabel="Jméno nebo název" />
          <TextInput value={phone} onChangeText={setPhone} maxLength={limits.phone} placeholder="Telefon" placeholderTextColor="#91A099" keyboardType="phone-pad" style={styles.input} accessibilityLabel="Telefon" />
          <TextInput value={email} onChangeText={setEmail} maxLength={limits.email} placeholder="E-mail (nepovinné)" placeholderTextColor="#91A099" keyboardType="email-address" autoCapitalize="none" style={styles.input} accessibilityLabel="E-mail" />
          <View style={styles.row}>
            <Button label="Uložit" icon="checkmark" onPress={save} style={styles.flex} />
            <Button label="Zrušit" variant="ghost" onPress={() => setEditing(false)} />
          </View>
          {contact ? <Button label="Odebrat kontakt" variant="ghost" onPress={() => void remove()} /> : null}
        </> : contact ? <>
          <Text style={styles.contactName}>{contact.name}</Text>
          {contact.phone ? <Text style={styles.contactMeta}>{contact.phone}</Text> : null}
          {contact.email ? <Text style={styles.contactMeta}>{contact.email}</Text> : null}
          <View style={styles.row}>
            {contact.phone ? <Button label="Zavolat" icon="call-outline" variant="secondary" onPress={() => void Linking.openURL(`tel:${contact.phone}`)} style={styles.flex} /> : null}
            {contact.email ? <Button label="E-mail" icon="mail-outline" variant="secondary" onPress={() => void Linking.openURL(`mailto:${contact.email}`)} style={styles.flex} /> : null}
          </View>
        </> : <Text style={styles.contactMeta}>{kind === 'doctor' ? 'Kontakt na lékaře potřebujete pro žádosti o eRecept.' : 'Zatím bez kontaktu.'}</Text>}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 14, paddingBottom: 6 }, body: { color: colors.ink, fontSize: 15 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 7, marginTop: 12 },
  input: { minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 15, color: colors.ink, fontSize: 17, marginBottom: 8 },
  palette: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, swatchActive: { borderWidth: 3, borderColor: colors.ink },
  save: { marginTop: 20, marginBottom: 12 }, remove: { marginTop: 18 }, hint: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 18 },
  contactCard: { marginBottom: 8 }, contactName: { color: colors.ink, fontSize: 17, fontWeight: '800' }, contactMeta: { color: colors.muted, fontSize: 14, marginTop: 3 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 }, flex: { flex: 1 },
});

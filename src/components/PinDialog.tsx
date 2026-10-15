import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius } from '@/theme';
import { Button, Card } from './ui';

/**
 * Asks for a 4–6 digit PIN. `onSubmit` returns an error message to keep the
 * dialog open, or nothing to accept the PIN.
 */
export function PinDialog({ visible, title, body, submitLabel, onSubmit, onCancel, extraAction }: {
  visible: boolean;
  title: string;
  body: string;
  submitLabel: string;
  onSubmit: (pin: string) => string | void | Promise<string | void>;
  onCancel: () => void;
  extraAction?: { label: string; onPress: () => void };
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const reset = () => { setPin(''); setError(''); };
  const cancel = () => { reset(); onCancel(); };

  const submit = async () => {
    if (!/^\d{4,6}$/.test(pin)) { setError('PIN má 4 až 6 číslic.'); return; }
    const message = await onSubmit(pin);
    if (message) { setError(message); setPin(''); } else reset();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <View style={styles.icon}><Ionicons name="lock-closed-outline" size={26} color={colors.primary} /></View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <TextInput value={pin} onChangeText={(value) => { setPin(value.replace(/\D/g, '')); setError(''); }} onSubmitEditing={() => void submit()}
            keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus style={styles.input} accessibilityLabel="PIN" />
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button label={submitLabel} icon="checkmark" onPress={() => void submit()} style={styles.full} />
          {extraAction ? <Button label={extraAction.label} variant="secondary" onPress={() => { reset(); extraAction.onPress(); }} style={styles.full} /> : null}
          <Button label="Zrušit" variant="ghost" onPress={cancel} style={styles.full} />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 20, backgroundColor: 'rgba(24,51,42,0.55)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 390, alignItems: 'center', padding: 24 },
  icon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  input: { width: '100%', height: 60, marginTop: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, textAlign: 'center', color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: 8 },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 },
  full: { width: '100%', marginTop: 8 },
});

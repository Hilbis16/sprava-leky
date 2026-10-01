import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';

import { colors, radius, shadow } from '@/theme';

export function ScreenLoader() {
  return (
    <View style={styles.loader} accessibilityRole="progressbar">
      <View style={styles.logoMark}><Ionicons name="medkit" size={28} color={colors.white} /></View>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.loaderText}>Připravuji vaše léky…</Text>
    </View>
  );
}

export function Card({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label, onPress, icon, variant = 'primary', disabled, style, accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const buttonStyle = variant === 'primary' ? styles.buttonPrimary
    : variant === 'danger' ? styles.buttonDanger
      : variant === 'ghost' ? styles.buttonGhost : styles.buttonSecondary;
  const textStyle = variant === 'primary' || variant === 'danger' ? styles.buttonTextLight : styles.buttonTextDark;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonStyle, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      {icon ? <Ionicons name={icon} size={20} color={(textStyle as TextStyle).color as string} /> : null}
      <Text style={[styles.buttonText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'safe' | 'warning' | 'critical' | 'neutral' }) {
  const toneStyle = tone === 'safe' ? styles.pillSafe : tone === 'warning' ? styles.pillWarning
    : tone === 'critical' ? styles.pillCritical : styles.pillNeutral;
  const toneText = tone === 'safe' ? styles.pillSafeText : tone === 'warning' ? styles.pillWarningText
    : tone === 'critical' ? styles.pillCriticalText : styles.pillNeutralText;
  return <View style={[styles.pill, toneStyle]}><Text style={[styles.pillText, toneText]}>{label}</Text></View>;
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{title}</Text>{action}</View>;
}

export function Avatar({ initials, color, size = 44 }: { initials: string; color: string; size?: number }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={26} color={colors.primary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.canvas },
  logoMark: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  loaderText: { color: colors.muted, fontSize: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, ...shadow },
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#B9DED0' },
  buttonDanger: { backgroundColor: colors.danger },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextLight: { color: colors.white },
  buttonTextDark: { color: colors.primaryDark },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillSafe: { backgroundColor: colors.primarySoft }, pillSafeText: { color: colors.primaryDark },
  pillWarning: { backgroundColor: colors.peach }, pillWarningText: { color: colors.warning },
  pillCritical: { backgroundColor: colors.dangerSoft }, pillCriticalText: { color: colors.danger },
  pillNeutral: { backgroundColor: '#EFF2F0' }, pillNeutralText: { color: colors.muted },
  sectionRow: { marginTop: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: '800' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginBottom: 12 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
});

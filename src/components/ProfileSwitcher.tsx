import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CareProfile } from '@/domain/types';
import { colors, radius } from '@/theme';
import { Avatar } from './ui';

export function ProfileSwitcher({ profiles, currentId, onChange }: { profiles: CareProfile[]; currentId: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = profiles.find((profile) => profile.id === currentId) ?? profiles[0];
  if (!current) return null;
  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Změnit spravovanou osobu">
        <Avatar initials={current.initials} color={current.color} size={38} />
        <View style={styles.triggerText}><Text style={styles.caption}>Spravuji léky pro</Text><Text style={styles.name}>{current.displayName}</Text></View>
        <Ionicons name="chevron-down" size={20} color={colors.muted} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Vyberte osobu</Text>
            {profiles.map((profile) => (
              <Pressable key={profile.id} style={[styles.option, profile.id === currentId && styles.optionActive]} onPress={() => { onChange(profile.id); setOpen(false); }}>
                <Avatar initials={profile.initials} color={profile.color} />
                <Text style={styles.optionName}>{profile.displayName}</Text>
                {profile.id === currentId ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 },
  triggerText: { flex: 1 }, caption: { color: colors.muted, fontSize: 12 }, name: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(14,32,26,0.38)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 38, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 8 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800', marginBottom: 10 },
  option: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
  optionActive: { backgroundColor: colors.primarySoft }, optionName: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' },
});

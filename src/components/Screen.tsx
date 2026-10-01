import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme';

export function Screen({ children, contentStyle }: React.PropsWithChildren<{ contentStyle?: ViewStyle }>) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 110 }, inner: { width: '100%', maxWidth: 760, alignSelf: 'center' },
});

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenLoader } from '@/components/ui';
import { AppStateProvider, useAppState } from '@/state/AppState';
import { colors } from '@/theme';

function Navigation() {
  const { ready } = useAppState();
  if (!ready) return <ScreenLoader />;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.canvas }, headerShadowVisible: false, headerTintColor: colors.ink, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="medicine/new" options={{ title: 'Přidat lék', presentation: 'modal' }} />
        <Stack.Screen name="medicine/[id]" options={{ title: 'Detail léku' }} />
        <Stack.Screen name="scanner" options={{ title: 'Skenovat eRecept', presentation: 'modal' }} />
        <Stack.Screen name="invite/[token]" options={{ title: 'Rodinná pozvánka' }} />
        <Stack.Screen name="senior" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return <SafeAreaProvider><AppStateProvider><Navigation /></AppStateProvider></SafeAreaProvider>;
}

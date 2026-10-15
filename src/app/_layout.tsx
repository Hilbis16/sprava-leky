import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenLoader } from '@/components/ui';
import { AppStateProvider, useAppState } from '@/state/AppState';
// Metro selects notifications.native.ts or notifications.web.ts.
// eslint-disable-next-line import/no-unresolved
import { subscribeToNotificationRoutes } from '@/services/notifications';
import { colors } from '@/theme';

function Navigation() {
  const { ready, data } = useAppState();
  const seniorMode = data?.activeRole === 'senior';
  useEffect(() => {
    if (!ready || seniorMode) return;
    return subscribeToNotificationRoutes((route) => router.push(route as never));
  }, [ready, seniorMode]);
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
        <Stack.Screen name="senior" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="history" options={{ title: 'Historie užívání' }} />
        <Stack.Screen name="profile/[id]" options={{ title: 'Osoba a kontakty' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return <SafeAreaProvider><AppStateProvider><Navigation /></AppStateProvider></SafeAreaProvider>;
}

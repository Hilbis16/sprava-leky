import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

import { Button, ScreenLoader } from '@/components/ui';
import { AppStateProvider, useAppState } from '@/state/AppState';
import { AuthProvider, useAuth } from '@/state/AuthState';
import { AuthScreen } from '@/components/AuthScreen';
// Metro selects notifications.native.ts or notifications.web.ts.
// eslint-disable-next-line import/no-unresolved
import { subscribeToNotificationRoutes } from '@/services/notifications';
import { colors } from '@/theme';

function Navigation() {
  const { ready, data,loadError,retryLoad,syncMessage } = useAppState();
  const seniorMode = data?.activeRole === 'senior';
  useEffect(() => {
    if (!ready || seniorMode) return;
    return subscribeToNotificationRoutes((route) => router.push(route as never));
  }, [ready, seniorMode]);
  if (loadError) return <View style={{ flex: 1,justifyContent: 'center',padding: 24,gap: 16 }}><Text>{syncMessage}</Text><Button label="Zkusit načíst znovu" onPress={retryLoad} /></View>;
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
  return <SafeAreaProvider><AuthProvider><AccountApp /></AuthProvider></SafeAreaProvider>;
}

function AccountApp() {
  const { user,ready,demo } = useAuth();
  if (!ready) return <ScreenLoader />;
  if (!user && !demo) return <AuthScreen />;
  return <AppStateProvider key={user?.id ?? 'local'}><Navigation /></AppStateProvider>;
}

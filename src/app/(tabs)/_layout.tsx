import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { useAppState } from '@/state/AppState';
import { colors } from '@/theme';

function TodayIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name="today-outline" color={color} size={size} />; }
function StockIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name="file-tray-stacked-outline" color={color} size={size} />; }
function RequestsIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name="chatbox-ellipses-outline" color={color} size={size} />; }
function FamilyIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name="people-outline" color={color} size={size} />; }

export default function TabsLayout() {
  // A device left in senior mode reopens there after a restart.
  const { data } = useAppState();
  if (data?.activeRole === 'senior') return <Redirect href="/senior" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { height: 76, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.surface, borderTopColor: colors.border },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Dnes', tabBarIcon: TodayIcon }} />
      <Tabs.Screen name="stock" options={{ title: 'Zásoby', tabBarIcon: StockIcon }} />
      <Tabs.Screen name="requests" options={{ title: 'Žádosti', tabBarIcon: RequestsIcon }} />
      <Tabs.Screen name="family" options={{ title: 'Rodina', tabBarIcon: FamilyIcon }} />
    </Tabs>
  );
}

import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Screen } from './Screen';
import { Button, Card } from './ui';
import { colors } from '@/theme';

export function NoProfiles() {
  return <Screen><Card><Text style={{ fontSize: 24,fontWeight: '800',color: colors.ink }}>Začněte první osobou</Text>
    <Text style={{ color: colors.muted,lineHeight: 22,marginVertical: 16 }}>Přidejte osobu, o kterou pečujete, nebo přijměte rodinnou pozvánku. Nový účet neobsahuje ukázkové léky.</Text>
    <Button label="Přidat osobu" icon="person-add-outline" onPress={() => router.push({ pathname: '/profile/[id]',params: { id: 'new' } })} />
    <View style={{ marginTop: 12 }}><Button label="Účet a rodina" variant="secondary" onPress={() => router.push('/family')} /></View>
  </Card></Screen>;
}

// Bottom tab bar. The "(tabs)" folder name is in parentheses so it groups
// screens without adding "/tabs" to their URLs.
// Labels only for now: it avoids adding an icon library dependency.

import { Tabs } from 'expo-router';
import { colors, fontSize } from '../../constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: fontSize.md, fontWeight: '600' },
        tabBarLabelPosition: 'beside-icon',
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
    </Tabs>
  );
}

// Bottom tab bar. The "(tabs)" folder name is in parentheses so it groups
// screens without adding "/tabs" to their URLs.
// Each tab has a thin outline icon (TabIcon, drawn with react-native-svg) with
// a small label under it. The selected tab uses the brand colour, the rest grey.

import { Tabs } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { TabIcon } from '../../components/TabIcon';
import { colors, fontSize, spacing } from '../../constants/theme';

/** The ⓘ on the Given & Taken title bar: explains why these totals are kept apart. */
function GivenTakenInfo() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="About money given and taken"
      hitSlop={12}
      onPress={() =>
        Alert.alert(
          'Money given and taken',
          'Not counted as spending or income. It only shows what people have to return to you, and what you have to return to them.',
        )
      }
      style={({ pressed }) => [styles.info, pressed && styles.pressed]}
    >
      <Text style={styles.infoText}>ⓘ</Text>
    </Pressable>
  );
}

/** tabBarIcon for a tab: React Navigation passes the colour for selected / not selected. */
function iconFor(name) {
  const Icon = ({ color }) => <TabIcon name={name} color={color} size={22} />;
  Icon.displayName = `TabIcon(${name})`;
  return Icon;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelPosition: 'below-icon',
        // Small and light so the icons lead, and "Given & Taken" fits on narrow phones.
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '500' },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Two separate areas: everyday expenses and income, and money given to or taken from people. */}
      <Tabs.Screen name="index" options={{ title: 'Expenses', tabBarIcon: iconFor('expenses') }} />
      <Tabs.Screen
        name="given-taken"
        options={{
          title: 'Given & Taken',
          headerTitle: 'Money Given and Taken',
          headerRight: GivenTakenInfo,
          tabBarIcon: iconFor('givenTaken'),
        }}
      />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: iconFor('reports') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: iconFor('more') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  info: { paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.6 },
  infoText: { fontSize: fontSize.xl, color: colors.textMuted },
});

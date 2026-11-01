import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { MAX_CATEGORY_NAME_LENGTH } from '../domain/validation';
import { Button } from './Button';
import { CategoryIcon } from './CategoryIcon';
import { TextField } from './TextField';

/** One category to tap: its icon and short name; teal when selected. */
function Cell({ label, selected, onPress, children }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.cell, selected && styles.cellSelected]}
    >
      {children}
      <Text style={[styles.cellText, selected && styles.cellTextSelected]} numberOfLines={1}>
        {label.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

/**
 * Categories as one row of icons you scroll sideways; the last one is "+ New"
 * to add your own (it is saved, then selected).
 * onCreate(name) should save the category and return it, or throw with a message
 * (empty or duplicate names are refused there).
 */
export function CategoryIconRow({ categories, selectedId, onSelect, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState(null);
  const [saving, setSaving] = useState(false);

  function closeNewCategory() {
    setCreating(false);
    setNewName('');
    setCreateError(null);
  }

  async function handleCreate() {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const category = await onCreate(newName);
      onSelect(category.id);
      closeNewCategory();
    } catch (error) {
      setCreateError(error.message || 'Could not add the category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {categories.map((category) => {
          const selected = category.id === selectedId;
          return (
            <Cell key={category.id} label={category.name} selected={selected} onPress={() => onSelect(category.id)}>
              <CategoryIcon
                categoryName={category.name}
                showBadge={false}
                color={selected ? colors.primary : colors.textMuted}
              />
            </Cell>
          );
        })}
        <Cell label="New" selected={creating} onPress={() => setCreating(true)}>
          <View style={styles.newCircle}>
            <Text style={styles.newPlus}>+</Text>
          </View>
        </Cell>
      </ScrollView>

      {creating ? (
        <View style={styles.newRow}>
          <TextField
            value={newName}
            onChangeText={(text) => {
              setNewName(text);
              setCreateError(null);
            }}
            placeholder="New category name"
            maxLength={MAX_CATEGORY_NAME_LENGTH}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            error={createError}
            style={styles.newInput}
            accessibilityLabel="New category name"
          />
          <Button label="Add" onPress={handleCreate} loading={saving} />
          <Button label="Cancel" variant="secondary" onPress={closeNewCategory} />
        </View>
      ) : null}
      {createError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {createError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { gap: spacing.xs },
  cell: { width: 76, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.md },
  cellSelected: { backgroundColor: colors.primarySoft },
  cellText: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 2 },
  cellTextSelected: { color: colors.primary, fontWeight: '700' },
  newCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  newPlus: { fontSize: fontSize.xl, color: colors.primary, lineHeight: 24 },
  newRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  newInput: { flex: 1 },
  error: { fontSize: fontSize.sm, color: colors.danger },
});

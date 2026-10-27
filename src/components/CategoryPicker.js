import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../constants/theme';
import { pickVisibleCategories } from '../domain/transactionForm';
import { MAX_CATEGORY_NAME_LENGTH } from '../domain/validation';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';

/**
 * Shows the most relevant categories first, with "More" to reveal the rest
 * and "+ New category" to add a custom one.
 * onCreate(name) should save the category and return it, or throw with a message.
 */
export function CategoryPicker({ categories, selectedId, onSelect, onCreate }) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState(null);
  const [saving, setSaving] = useState(false);

  const shown = expanded ? categories : pickVisibleCategories(categories, selectedId);
  const hiddenCount = categories.length - shown.length;

  function closeNewCategory() {
    setCreating(false);
    setNewName('');
    setCreateError(null);
  }

  function collapse() {
    setExpanded(false);
    closeNewCategory();
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
      <View style={styles.chips}>
        {shown.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            selected={selectedId === category.id}
            onPress={() => onSelect(category.id)}
          />
        ))}
        {hiddenCount > 0 ? <Chip label={`More (${hiddenCount})`} onPress={() => setExpanded(true)} /> : null}
        {expanded && !creating ? <Chip label="+ New category" onPress={() => setCreating(true)} /> : null}
        {expanded ? <Chip label="Show fewer" onPress={collapse} /> : null}
      </View>

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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  newRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  newInput: { flex: 1 },
  error: { fontSize: fontSize.sm, color: colors.danger },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';
import { MAX_CATEGORY_NAME_LENGTH } from '../../domain/validation';
import { ChoiceCell } from '../basics/ChoiceCell';
import { SideScrollRow } from '../basics/SideScrollRow';
import { CategoryIcon } from '../icons/CategoryIcon';
import { ICONS, OutlineIcon } from '../icons/icons';
import { AddNameBox } from './AddNameBox';

/**
 * Categories as one row of icons you scroll sideways; the last one is "+ New"
 * to add your own (it is saved, then selected).
 * onCreate(name) should save the category and return it, or throw with a message
 * (empty or duplicate names are refused there).
 */
export function CategoryIconRow({ categories, selectedId, onSelect, onCreate }) {
  const [addingNew, setAddingNew] = useState(false);

  async function addCategory(name) {
    const category = await onCreate(name);
    onSelect(category.id);
    setAddingNew(false);
  }

  return (
    <View style={styles.container}>
      <SideScrollRow style={styles.row}>
        {categories.map((category) => {
          const selected = category.id === selectedId;
          return (
            <ChoiceCell
              key={category.id}
              label={category.name.split(' ')[0]}
              spokenLabel={category.name}
              selected={selected}
              onPress={() => onSelect(category.id)}
            >
              <CategoryIcon categoryName={category.name} small color={selected ? colors.primary : colors.textMuted} />
            </ChoiceCell>
          );
        })}
        <ChoiceCell label="New" selected={addingNew} onPress={() => setAddingNew(true)}>
          <View style={styles.newCircle}>
            <OutlineIcon draw={ICONS.plus} color={colors.primary} />
          </View>
        </ChoiceCell>
      </SideScrollRow>

      {addingNew ? (
        <AddNameBox
          placeholder="New category name"
          spokenLabel="New category name"
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          failText="Could not add the category."
          onAdd={addCategory}
          onCancel={() => setAddingNew(false)}
          style={styles.container}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { gap: spacing.xs },
  // Like IconInCircle's dashed look, but with no grey fill.
  newCircle: {
    minWidth: 28,
    minHeight: 28,
    maxWidth: 36,
    maxHeight: 36,
    padding: spacing.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
});

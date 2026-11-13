import { StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/theme';
import { TextField } from '../basics/TextField';
import { FilterButton } from './FilterSheet';

// Below this many items the list fits on a screen, so no search box is shown.
const SEARCH_FROM = 6;

/**
 * Search box on the left, Filters button on the right (alone when the list is short).
 * itemCount: how many items the search would go through.
 */
export function SearchFilterBar({ itemCount, search, onSearch, placeholder, filterCount, onOpenFilters }) {
  // Stays while it has text, so a search you typed can always be seen and cleared.
  const showSearch = itemCount >= SEARCH_FROM || Boolean(search.trim());
  return (
    <View style={styles.line}>
      {showSearch ? (
        <TextField
          value={search}
          onChangeText={onSearch}
          placeholder={placeholder}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={placeholder}
          style={styles.search}
        />
      ) : null}
      <FilterButton count={filterCount} onPress={onOpenFilters} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  search: { flex: 1 },
});

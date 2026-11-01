import { colors } from '../constants/theme';
import { SwipeableRow } from './SwipeableRow';
import { TransactionRow } from './TransactionRow';

/**
 * A TransactionRow you can swipe:
 *   swipe right -> Edit button, swipe left -> Delete button (red).
 * Tapping the button does the action; Delete still asks for confirmation
 * (onDelete should confirm). Tap the row to edit and long-press to delete
 * also keep working, which is what screen readers use.
 * note, variant: passed to TransactionRow (variant="simple" for expenses and income lists).
 * background: the colour behind the row, so the buttons stay hidden until swiped.
 */
export function SwipeableTransactionRow({ transaction, onEdit, onDelete, note, variant, background = colors.surface }) {
  return (
    <SwipeableRow
      background={background}
      leftAction={{ label: 'Edit', color: colors.primary, onPress: () => onEdit(transaction) }}
      rightAction={{ label: 'Delete', color: colors.danger, onPress: () => onDelete(transaction) }}
    >
      <TransactionRow
        transaction={transaction}
        note={note}
        variant={variant}
        onPress={() => onEdit(transaction)}
        onLongPress={() => onDelete(transaction)}
      />
    </SwipeableRow>
  );
}

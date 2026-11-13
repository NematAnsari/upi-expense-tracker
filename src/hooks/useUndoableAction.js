import { useCallback, useState } from 'react';
import { showError } from '../utils/notify';

/**
 * Runs one action at a time (no double taps) and offers Undo for it in an UndoBar.
 * `reload` runs after every action and undo, so the list shows the change.
 */
export function useUndoableAction(reload) {
  const [busy, setBusy] = useState(false);
  // { message, undo } for the UndoBar, or null.
  const [undoAction, setUndoAction] = useState(null);
  const hideUndo = useCallback(() => setUndoAction(null), []);

  /** hasPartial(): true when the action failed after changing something, so Undo is still offered. */
  async function runWithUndo(action, undo, message, hasPartial) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await action();
      setUndoAction({ message, undo });
    } catch (actionError) {
      const partial = Boolean(hasPartial?.());
      showError('Something went wrong', actionError, partial ? '\n\nThe payments already added can be undone.' : '');
      if (partial) {
        setUndoAction({ message: 'Stopped partway. Undo removes the ones added.', undo });
      }
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function handleUndo() {
    const action = undoAction;
    setUndoAction(null);
    if (!action) {
      return;
    }
    try {
      await action.undo();
    } catch (undoError) {
      showError('Could not undo', undoError);
    } finally {
      reload();
    }
  }

  return { busy, undoAction, runWithUndo, handleUndo, hideUndo };
}

import { useEffect, useState } from 'react';

/**
 * Runs `load` whenever it changes and returns its latest result.
 * Wrap `load` in useCallback. Out-of-date results (e.g. from an earlier
 * keystroke) are ignored. Errors are logged and leave the previous value.
 */
export function useAsyncValue(load, initialValue) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    let active = true;
    load()
      .then((result) => {
        if (active) {
          setValue(result);
        }
      })
      .catch((error) => console.error(error));
    return () => {
      active = false;
    };
  }, [load]);

  return value;
}

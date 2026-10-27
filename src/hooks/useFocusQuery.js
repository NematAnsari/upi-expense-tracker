import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Runs `loader` every time the screen comes into view, and again whenever
 * `loader` changes (wrap it in useCallback with its inputs as dependencies).
 * Reloading on focus keeps screens current after you add, edit or delete
 * an expense on another screen.
 */
export function useFocusQuery(loader) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    // Ignore results that arrive after the screen lost focus or the filters changed.
    let active = true;
    setLoading(true);
    loader()
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          console.error(loadError);
          setError(loadError);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loader]);

  useFocusEffect(load);

  return { data, error, loading, reload: load };
}

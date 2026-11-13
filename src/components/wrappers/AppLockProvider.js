import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Path } from 'react-native-svg';
import { ICONS, OutlineIcon } from '../icons/icons';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { PHONE_KEYS, getPhoneSetting, setPhoneSetting } from '../../db/phoneSettings';
import { Button } from '../basics/Button';

// Away from the app for this long, and it locks again.
const LOCK_AFTER_MS = 60 * 1000;

const AppLockContext = createContext({ enabled: false, setEnabled: async () => {} });

/** { enabled, setEnabled(on) } for the App lock screen. setEnabled throws with a message to show. */
export function useAppLock() {
  return useContext(AppLockContext);
}

/** Asks for the phone's own unlock: fingerprint or face, or its PIN, pattern or password. */
async function askPhoneUnlock(promptMessage) {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
  return result.success;
}

/** The shared padlock with a keyhole, for the lock screen. */
function lockWithKeyhole(color, width) {
  return (
    <>
      {ICONS.lock(color, width)}
      <Path d="M12 14.5v2.5" stroke={color} strokeWidth={width} strokeLinecap="round" />
    </>
  );
}

/**
 * Wraps the app. With the lock switched on (More → App lock), the app opens
 * behind a lock screen and asks for the phone's own unlock; it locks again
 * after a minute away. Nothing new to remember: whoever can unlock the phone
 * can unlock the app. The screens stay loaded underneath, so you come back to
 * where you were.
 */
export function AppLockProvider({ children }) {
  const db = useSQLiteContext();
  // null until the setting is read, so nothing shows before we know.
  const [enabled, setLockOn] = useState(null);
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const leftAppAt = useRef(null);

  const unlock = useCallback(async () => {
    setUnlocking(true);
    try {
      if (await askPhoneUnlock('Unlock Expense Tracker')) {
        setLocked(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setUnlocking(false);
    }
  }, []);

  // Locks and asks straight away. After a cancel, the Unlock button asks again.
  const lockNow = useCallback(() => {
    setLocked(true);
    unlock();
  }, [unlock]);

  useEffect(() => {
    let active = true;
    getPhoneSetting(db, PHONE_KEYS.appLock)
      .then((value) => {
        if (!active) {
          return;
        }
        setLockOn(value === '1');
        if (value === '1') {
          lockNow();
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setLockOn(false);
        }
      });
    return () => {
      active = false;
    };
  }, [db, lockNow]);

  // Lock again after a minute away from the app.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAppAt.current = Date.now();
      } else if (state === 'active') {
        if (leftAppAt.current != null && Date.now() - leftAppAt.current >= LOCK_AFTER_MS) {
          lockNow();
        }
        leftAppAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [enabled, lockNow]);

  const setEnabled = useCallback(
    async (on) => {
      if (on) {
        const level = await LocalAuthentication.getEnrolledLevelAsync();
        if (level === LocalAuthentication.SecurityLevel.NONE) {
          throw new Error('Set a screen lock (PIN, pattern or fingerprint) in your phone settings first.');
        }
      }
      // Confirm it is you, both to switch it on and to switch it off.
      if (!(await askPhoneUnlock(on ? 'Confirm to turn on App lock' : 'Confirm to turn off App lock'))) {
        return false;
      }
      await setPhoneSetting(db, PHONE_KEYS.appLock, on ? '1' : '');
      setLockOn(on);
      return true;
    },
    [db],
  );

  // Covered until the setting is read, and while locked.
  const showCover = enabled === null || locked;
  return (
    <AppLockContext.Provider value={{ enabled: Boolean(enabled), setEnabled }}>
      <View style={styles.fill} importantForAccessibility={showCover ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {showCover ? (
        <View style={styles.cover}>
          {locked ? (
            <>
              <OutlineIcon draw={lockWithKeyhole} color={colors.primary} size={36} />
              <Text style={styles.title}>Expense Tracker is locked</Text>
              <Text style={styles.note}>Use your fingerprint, or your phone&apos;s PIN, pattern or password.</Text>
              <Button label="Unlock" onPress={unlock} loading={unlocking} style={styles.button} />
            </>
          ) : null}
        </View>
      ) : null}
    </AppLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  note: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: spacing.md, borderRadius: radius.md },
});

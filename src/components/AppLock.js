import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { DEVICE_KEYS, getDeviceSetting, setDeviceSetting } from '../db/deviceSettings';
import { Button } from './Button';

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

function LockIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" accessible={false}>
      <Rect x={5} y={10.5} width={14} height={10} rx={2} stroke={colors.primary} strokeWidth={1.7} fill="none" />
      <Path
        d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"
        stroke={colors.primary}
        strokeWidth={1.7}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
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
  const [enabled, setEnabledState] = useState(null);
  const [locked, setLocked] = useState(false);
  const [asking, setAsking] = useState(false);
  const leftAt = useRef(null);

  const unlock = useCallback(async () => {
    setAsking(true);
    try {
      if (await askPhoneUnlock('Unlock Expense Tracker')) {
        setLocked(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setAsking(false);
    }
  }, []);

  // Locks and asks straight away. After a cancel, the Unlock button asks again.
  const lockNow = useCallback(() => {
    setLocked(true);
    unlock();
  }, [unlock]);

  useEffect(() => {
    let active = true;
    getDeviceSetting(db, DEVICE_KEYS.appLock)
      .then((value) => {
        if (!active) {
          return;
        }
        setEnabledState(value === '1');
        if (value === '1') {
          lockNow();
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setEnabledState(false);
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
        leftAt.current = Date.now();
      } else if (state === 'active') {
        if (leftAt.current != null && Date.now() - leftAt.current >= LOCK_AFTER_MS) {
          lockNow();
        }
        leftAt.current = null;
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
      await setDeviceSetting(db, DEVICE_KEYS.appLock, on ? '1' : '');
      setEnabledState(on);
      return true;
    },
    [db],
  );

  const covered = enabled === null || locked;
  return (
    <AppLockContext.Provider value={{ enabled: Boolean(enabled), setEnabled }}>
      <View style={styles.fill} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {covered ? (
        <View style={styles.cover}>
          {locked ? (
            <>
              <LockIcon />
              <Text style={styles.title}>Expense Tracker is locked</Text>
              <Text style={styles.note}>Use your fingerprint, or your phone&apos;s PIN, pattern or password.</Text>
              <Button label="Unlock" onPress={unlock} loading={asking} style={styles.button} />
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

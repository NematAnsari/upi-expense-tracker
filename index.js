// Expo Router reads screens from src/app/. This entry file just hands control to it.
// The nightly backup task must be defined before anything else runs: Android
// can start the app only to run it, without opening a screen.
import './src/services/autoBackupTask';
import 'expo-router/entry';

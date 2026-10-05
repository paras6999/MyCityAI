import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

// SecureStore (Keychain/Keystore) on phones; localStorage on web, where SecureStore is unavailable.
// Every access is guarded: storage can be blocked (private mode) and the app must still work.

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return Platform.OS === 'web' ? localStorage.getItem(key) : await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') localStorage.setItem(key, value)
      else await SecureStore.setItemAsync(key, value)
    } catch {
      // Ignore: the value simply will not survive a restart.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') localStorage.removeItem(key)
      else await SecureStore.deleteItemAsync(key)
    } catch {
      // Ignore.
    }
  },
}

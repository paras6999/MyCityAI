import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { authApi } from '../api/auth'
import { USE_MOCKS } from '../config'

// Push delivery follows docs/API.md §10.2: Expo push token -> POST /auth/device-token.
// Remote push does not work on web or in an Android Expo Go build; every failure is silent
// because the in-app notification list works without push.

let registeredToken: string | null = null

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
})

export async function pushPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  try {
    return (await Notifications.getPermissionsAsync()).granted
  } catch {
    return false
  }
}

export async function registerForPush(ask: boolean): Promise<boolean> {
  if (Platform.OS === 'web' || USE_MOCKS) return false
  try {
    let permission = await Notifications.getPermissionsAsync()
    if (!permission.granted && ask) permission = await Notifications.requestPermissionsAsync()
    if (!permission.granted) return false
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Complaint updates', importance: Notifications.AndroidImportance.DEFAULT })
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    await authApi.registerDevice(data, Platform.OS === 'ios' ? 'ios' : 'android')
    registeredToken = data
    return true
  } catch {
    return false
  }
}

/** Call before logging out so the phone stops receiving this citizen's notifications. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return
  try {
    await authApi.unregisterDevice(registeredToken, Platform.OS === 'ios' ? 'ios' : 'android')
  } catch {
    // Best effort.
  }
  registeredToken = null
}

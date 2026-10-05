import * as ImagePicker from 'expo-image-picker'
import type { PickedPhoto } from '../api/types'

export const PHOTO_MAX_MB = 8 // shared/constants.json limits.photo_max_mb

export type PhotoFailure = 'permission' | 'type' | 'size'
export class PhotoError extends Error {
  constructor(public reason: PhotoFailure) {
    super(reason)
  }
}

function mimeOf(asset: ImagePicker.ImagePickerAsset): PickedPhoto['mimeType'] | null {
  const hint = (asset.mimeType ?? asset.uri.split('?')[0].split('.').pop() ?? '').toLowerCase()
  if (hint.includes('png')) return 'image/png'
  if (hint.includes('jpeg') || hint.includes('jpg')) return 'image/jpeg'
  return null
}

/**
 * Takes a live photo with the camera. The backend requires complaint photos to be taken on the spot
 * (docs/API.md §5.6), so there is deliberately no gallery option. EXIF is kept so the server can read
 * the capture time and GPS. Returns null if the citizen cancelled.
 */
export async function takePhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) throw new PhotoError('permission')

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, exif: true })
  if (result.canceled || !result.assets[0]) return null

  const asset = result.assets[0]
  const mimeType = mimeOf(asset)
  if (!mimeType) throw new PhotoError('type')
  if (asset.fileSize && asset.fileSize > PHOTO_MAX_MB * 1024 * 1024) throw new PhotoError('size')
  return {
    uri: asset.uri,
    mimeType,
    fileName: asset.fileName ?? `photo.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
    sizeBytes: asset.fileSize,
    capturedAt: new Date().toISOString(),
  }
}

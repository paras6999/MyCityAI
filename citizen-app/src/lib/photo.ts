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

/** Returns null if the citizen cancelled; throws PhotoError for permission/type/size problems. */
export async function pickPhoto(source: 'camera' | 'gallery'): Promise<PickedPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) throw new PhotoError('permission')

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false }
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
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
  }
}

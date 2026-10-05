import * as Location from 'expo-location'

export interface Fix {
  lat: number
  lng: number
  address: string | null
}

export type LocationFailure = 'denied' | 'failed'
export class LocationError extends Error {
  constructor(public reason: LocationFailure) {
    super(reason)
  }
}

export async function reverseAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
    if (!place) return null
    const parts = [place.name, place.street, place.district ?? place.subregion, place.city].filter(
      (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index,
    )
    return parts.length ? parts.join(', ') : null
  } catch {
    return null // not supported on web, or the geocoder is unavailable
  }
}

export async function getCurrentFix(): Promise<Fix> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (!permission.granted) throw new LocationError('denied')
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    const { latitude: lat, longitude: lng } = position.coords
    return { lat, lng, address: await reverseAddress(lat, lng) }
  } catch {
    throw new LocationError('failed')
  }
}

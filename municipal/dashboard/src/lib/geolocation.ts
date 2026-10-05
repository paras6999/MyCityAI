export interface Position {
  lat: number
  lng: number
  accuracyM: number
}

/**
 * Current device position (high accuracy), or null if the user refused, it timed out, or the
 * browser has no geolocation. Browsers only allow this on HTTPS (or localhost).
 */
export function currentPosition(timeoutMs = 15000): Promise<Position | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

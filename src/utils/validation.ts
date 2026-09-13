export function isValidOriginalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    return true
  } catch {
    return false
  }
}

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
}

export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180
}

export function isValidRadius(radius: number): boolean {
  return Number.isFinite(radius) && radius > 0 && radius <= 50000
}

export function isValidAccuracy(accuracy: number): boolean {
  return Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 10000
}
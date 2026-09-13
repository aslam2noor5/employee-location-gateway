import L from 'leaflet'

/**
 * مكتبة الخرائط تستخدم Leaflet + OpenStreetMap
 * مجانية بالكامل ولا تتطلب أي مفتاح API.
 */

/** OpenStreetMap tile layer (free, no API key required). */
export function osmTileLayer(): L.TileLayer {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  })
}

/** SVG pin markup used by the map markers. */
export function pinSvg(color: string, background = '#ffffff', label?: string): string {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
    <path d="M18 1C9.4 1 2.5 7.9 2.5 16.5c0 11.6 15.5 28 15.5 28s15.5-16.4 15.5-28C33.5 7.9 26.6 1 18 1z"
      fill="${color}" stroke="#333" stroke-width="1.5"/>
    <circle cx="18" cy="16.5" r="8" fill="${background}"/>
    ${
      label
        ? `<text x="18" y="20" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#333">${label}</text>`
        : ''
    }
  </svg>`
}

/** Leaflet div icon built from the SVG pin. */
export function pinIcon(color: string, label?: string, background = '#ffffff'): L.DivIcon {
  return L.divIcon({
    className: '',
    html: pinSvg(color, background, label),
    iconSize: [36, 46],
    iconAnchor: [18, 44],
    popupAnchor: [0, -40],
  })
}

export const STATUS_PIN_COLORS: Record<string, string> = {
  inside: '#10b981',
  outside: '#ef4444',
  low_accuracy: '#f59e0b',
  location_denied: '#f97316',
  expired_link: '#64748b',
  invalid_link: '#64748b',
  already_used: '#8b5cf6',
  disabled_link: '#64748b',
  error: '#ef4444',
}
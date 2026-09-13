import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { osmTileLayer, pinIcon } from '@/lib/maps'
import type { Workplace } from '@/types'

interface WorkplaceMapProps {
  workplace: Workplace
  className?: string
}

export function WorkplaceMap({ workplace, className = 'h-80' }: WorkplaceMapProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView(
      [workplace.latitude, workplace.longitude],
      16,
    )
    osmTileLayer().addTo(map)

    L.marker([workplace.latitude, workplace.longitude], { icon: pinIcon('#1d4ed8', 'م') }).addTo(map)
    L.circle([workplace.latitude, workplace.longitude], {
      radius: workplace.allowed_radius,
      color: '#10b981',
      opacity: 0.8,
      weight: 2,
      fillColor: '#10b981',
      fillOpacity: 0.15,
    }).addTo(map)

    map.invalidateSize()

    return () => {
      map.remove()
    }
  }, [workplace.latitude, workplace.longitude, workplace.allowed_radius])

  return <div ref={ref} className={className} dir="ltr" />
}
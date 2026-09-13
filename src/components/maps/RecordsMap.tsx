import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { osmTileLayer, pinIcon, STATUS_PIN_COLORS } from '@/lib/maps'
import { formatTime, attendanceStatusText } from '@/utils/formatters'
import type { AttendanceRecord, Workplace } from '@/types'

interface RecordsMapProps {
  workplaces: Workplace[]
  records: AttendanceRecord[]
  className?: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[ch] ?? ch
  })
}

export function RecordsMap({ workplaces, records, className = 'h-[600px]' }: RecordsMapProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current, { scrollWheelZoom: false })
    osmTileLayer().addTo(map)

    const points: [number, number][] = [
      ...workplaces.map((w) => [w.latitude, w.longitude] as [number, number]),
      ...records
        .filter((r) => r.latitude !== null && r.longitude !== null)
        .map((r) => [r.latitude as number, r.longitude as number] as [number, number]),
    ]

    if (points.length === 1) {
      map.setView(points[0], 14)
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points))
    } else {
      map.setView([30.0444, 31.2357], 6)
    }

    for (const wp of workplaces) {
      L.marker([wp.latitude, wp.longitude], { icon: pinIcon('#1d4ed8', 'م') })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:Tahoma;min-width:180px">
            <strong>${escapeHtml(wp.name)}</strong><br/>
            النطاق: ${wp.allowed_radius} متر
          </div>`,
        )
      L.circle([wp.latitude, wp.longitude], {
        radius: wp.allowed_radius,
        color: '#1d4ed8',
        opacity: 0.6,
        weight: 2,
        fillColor: '#1d4ed8',
        fillOpacity: 0.08,
      }).addTo(map)
    }

    for (const rec of records) {
      if (rec.latitude === null || rec.longitude === null) continue
      const color = STATUS_PIN_COLORS[rec.attendance_status] ?? '#64748b'
      L.marker([rec.latitude, rec.longitude], { icon: pinIcon(color, 'س') })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:Tahoma;min-width:200px">
            <strong>${escapeHtml(rec.employee?.name ?? 'موظف')}</strong><br/>
            الرقم الوظيفي: ${escapeHtml(rec.employee?.employee_number ?? '—')}<br/>
            الوقت: ${formatTime(rec.created_at)}<br/>
            المسافة: ${rec.distance_meters !== null ? `${Math.round(rec.distance_meters)} متر` : '—'}<br/>
            دقة GPS: ${rec.accuracy !== null ? `${Math.round(rec.accuracy)} متر` : '—'}<br/>
            الحالة: ${attendanceStatusText(rec.attendance_status)}<br/>
            مستوى التحقق: ${rec.verification_level ?? '—'}
          </div>`,
        )
    }

    map.invalidateSize()

    return () => {
      map.remove()
    }
  }, [workplaces, records])

  return <div ref={ref} className={className} dir="ltr" />
}
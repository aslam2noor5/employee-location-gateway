import { useEffect, useState } from 'react'
import { Card, CardBody, CardHeader, PageLoading } from '@/components/ui/Card'
import { RecordsMap } from '@/components/maps/RecordsMap'
import { getWorkplaces } from '@/services/workplace.service'
import { getRecords } from '@/services/attendance.service'
import type { AttendanceRecord, Workplace } from '@/types'

export function MapPage() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getWorkplaces(),
      getRecords({ limit: 200 }),
    ])
      .then(([wp, rec]) => {
        setWorkplaces(wp)
        setRecords(rec.data)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الخريطة</h1>
          <p className="mt-1 text-sm text-slate-500">مقرات العمل ونطاقاتها ومواقع التسجيلات</p>
        </div>
      </div>

      <Card>
        <CardHeader title="الخريطة التفاعلية" subtitle="الأزرق: المقرات ونطاقها • الأخضر: داخل النطاق • الأحمر: خارج النطاق" />
        <CardBody className="px-0 py-0">
          {loading ? (
            <PageLoading />
          ) : (
            <div className="p-4">
              <RecordsMap workplaces={workplaces} records={records} />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
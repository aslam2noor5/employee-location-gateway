export type UserRole = 'admin'

export type EmployeeStatus = 'active' | 'disabled'

export type WorkplaceStatus = 'active' | 'disabled'

export type LinkType = 'single_use' | 'multi_use'

export type LinkStatus = 'active' | 'used' | 'disabled' | 'expired'

export type AttendanceStatus =
  | 'inside'
  | 'outside'
  | 'low_accuracy'
  | 'location_denied'
  | 'expired_link'
  | 'invalid_link'
  | 'already_used'
  | 'disabled_link'
  | 'error'

export type VerificationLevel = 'high' | 'medium' | 'low'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Employee {
  id: string
  name: string
  employee_number: string
  phone: string | null
  department: string | null
  status: EmployeeStatus
  created_at: string
  updated_at: string
}

export interface Workplace {
  id: string
  name: string
  latitude: number
  longitude: number
  allowed_radius: number
  min_accuracy: number
  status: WorkplaceStatus
  created_at: string
  updated_at: string
}

export interface AttendanceLink {
  id: string
  employee_id: string
  workplace_id: string
  token_hash: string
  original_url: string
  link_type: LinkType
  expires_at: string | null
  usage_count: number
  max_usage_count: number | null
  status: LinkStatus
  created_at: string
  updated_at: string
  employee?: Pick<Employee, 'id' | 'name' | 'employee_number'> | null
  workplace?: Pick<Workplace, 'id' | 'name'> | null
}

export interface AttendanceRecord {
  id: string
  employee_id: string
  link_id: string
  workplace_id: string | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  distance_meters: number | null
  attendance_status: AttendanceStatus
  verification_level: VerificationLevel | null
  client_timestamp: string | null
  server_timestamp: string
  ip_address: string | null
  user_agent: string | null
  risk_flags: string[]
  created_at: string
  employee?: Pick<Employee, 'id' | 'name' | 'employee_number' | 'department'> | null
  workplace?: Pick<Workplace, 'id' | 'name'> | null
  link?: Pick<AttendanceLink, 'id' | 'token_hash' | 'original_url' | 'link_type'> | null
}

export type RiskFlag =
  | 'high_accuracy_uncertainty'
  | 'client_server_time_skew'
  | 'excessive_attempts_same_token'
  | 'repeated_failed_attempts'
  | 'invalid_token_attempt'
  | 'abnormally_fast_repeat'
  | 'outside_radius'

export interface AppSettings {
  allow_outside_redirect: boolean
  global_min_accuracy: number
}

export interface DashboardStats {
  totalEmployees: number
  todayCheckins: number
  insideCount: number
  outsideCount: number
  lowAccuracyCount: number
  activeLinks: number
  expiredLinks: number
  recentRecords: AttendanceRecord[]
}

export interface GeoPosition {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

export interface ValidateAttendanceResponse {
  success: boolean
  message: string
  status?: string
  original_url?: string
  attendance?: {
    id: string
    distance_meters: number | null
    attendance_status: string
    verification_level: string | null
    server_timestamp: string
  }
}
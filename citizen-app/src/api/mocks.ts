// In-memory backend for EXPO_PUBLIC_USE_MOCKS=true. Shapes follow docs/API.md exactly, so switching to
// the real backend only means changing the env flag. Never imported for real traffic.
import type { MultipartBody, RequestOptions } from './client'
import { ApiError } from './client'
import type {
  AnalyzeResult, Category, Complaint, Department, PriorityLevel, Status, TimelineEvent, User, Ward,
} from './types'

const LATENCY_MS = 450
const DEV_OTP = '123456'
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const hoursAhead = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

const DEPARTMENTS: Record<string, { department: Department; sla: number }> = {
  pothole: { department: 'roads', sla: 48 },
  road_damage: { department: 'roads', sla: 72 },
  garbage: { department: 'waste', sla: 24 },
  no_water_supply: { department: 'water', sla: 12 },
  water_leakage: { department: 'water', sla: 24 },
  streetlight: { department: 'electricity', sla: 72 },
  drainage_overflow: { department: 'drainage', sla: 24 },
  other: { department: 'other', sla: 72 },
}

const wards: Ward[] = [
  { id: 1, number: 1, name: 'Ward 1 – Central', rep_user_id: null },
  { id: 2, number: 2, name: 'Ward 2 – North', rep_user_id: null },
  { id: 3, number: 3, name: 'Ward 3 – South', rep_user_id: null },
]

// Persisted (web only) so a page reload keeps the mock session.
const USER_KEY = 'mycityai.mock_user'
function loadUser(): User | null {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}
function saveUser(next: User | null) {
  user = next
  try {
    if (next) globalThis.localStorage?.setItem(USER_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
let user: User | null = loadUser()
let nextId = 100
const db: { complaints: Complaint[]; timelines: Record<number, TimelineEvent[]> } = { complaints: [], timelines: {} }

function level(score: number): PriorityLevel {
  return score >= 90 ? 'critical' : score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
}

function event(complaintId: number, id: number, type: string, hours: number, to?: Status, note?: string): TimelineEvent {
  return {
    id, complaint_id: complaintId, type, from_status: null, to_status: to ?? null, note: note ?? null,
    actor: type === 'created' ? null : { id: 9, name: 'Municipal Office', role: 'officer' },
    created_at: hoursAgo(hours),
  }
}

function seed(lat: number, lng: number) {
  if (db.complaints.length) return
  const make = (id: number, category: Category, status: Status, score: number, hours: number, text: string, addr: string, dLat: number, dLng: number): Complaint => {
    const info = DEPARTMENTS[category]
    return {
      id, code: `MCA-2026-${String(id).padStart(5, '0')}`, source: 'citizen_app', description: text, category,
      department: info.department, location: { lat: lat + dLat, lng: lng + dLng, address: addr, ward_id: 1 },
      photo_url: null, status, priority_score: score, priority_level: level(score),
      ai: { category_confidence: 0.91, summary: text },
      duplicate_count: id === 41 ? 12 : 1, merged_into_id: null,
      assigned_to: status === 'new' ? null : { name: 'R. Patil' }, sla_hours: info.sla,
      sla_due_at: hoursAhead(info.sla - hours), proof: null, feedback: null,
      created_at: hoursAgo(hours), updated_at: hoursAgo(Math.max(hours - 2, 0.2)),
    }
  }
  db.complaints = [
    make(43, 'garbage', 'new', 55, 3, 'Garbage pile not collected for three days.', 'Market Road', 0.001, 0.0008),
    make(42, 'streetlight', 'in_progress', 48, 30, 'Streetlight pole 14 is not working at night.', 'Lake View Lane', -0.002, 0.001),
    make(41, 'pothole', 'assigned', 78, 52, 'Large pothole near the school entrance.', 'School Road', 0.0006, -0.002),
    make(40, 'drainage_overflow', 'resolved', 62, 120, 'Drain overflowing onto the footpath.', 'Station Road', -0.001, -0.001),
  ]
  const flow: [number, Status[]][] = [[43, []], [42, ['assigned', 'in_progress']], [41, ['assigned']], [40, ['assigned', 'in_progress', 'resolved']]]
  for (const [id, steps] of flow) {
    const c = db.complaints.find((x) => x.id === id)!
    const age = Math.round((Date.now() - new Date(c.created_at).getTime()) / 3_600_000)
    const events = [event(id, id * 10 + 1, 'created', age, 'new'), event(id, id * 10 + 2, 'classified', age - 0.1)]
    steps.forEach((s, i) => events.push(event(id, id * 10 + 3 + i, s === 'assigned' ? 'assigned' : 'status_changed', Math.max(age - 2 - i * 6, 0.5), s)))
    db.timelines[id] = events
  }
}

const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS))
const requireUser = (): User => {
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Missing bearer token')
  return user
}
const notFound = () => new ApiError(404, 'COMPLAINT_NOT_FOUND', 'Complaint not found')

function tokenResponse(u: User) {
  return { access_token: 'mock-access', refresh_token: 'mock-refresh', token_type: 'bearer' as const, expires_in: 3600, user: u }
}

function field(body: MultipartBody | undefined, name: string): string | undefined {
  return body?.fields[name]
}

export async function mockRequest<T>(method: string, path: string, options: RequestOptions): Promise<T> {
  await wait()
  const route = `${method} ${path}`
  const json = (options.json ?? {}) as Record<string, any>

  if (route === 'POST /auth/otp/request') return { sent: true, expires_in: 300 } as T
  if (route === 'POST /auth/otp/verify') {
    if (json.otp !== DEV_OTP) throw new ApiError(400, 'OTP_INVALID', 'Incorrect OTP')
    const isNew = !user || user.phone !== json.phone
    if (isNew) saveUser({ id: 1, name: null, phone: json.phone, role: 'citizen', department: null, ward_id: null, language: 'en', created_at: hoursAgo(1) })
    return { ...tokenResponse(user!), is_new_user: isNew } as T
  }
  if (route === 'POST /auth/refresh') return tokenResponse(requireUser()) as T
  if (route === 'GET /wards') return { items: wards } as T
  if (route === 'GET /auth/me') return requireUser() as T
  if (route === 'PATCH /auth/me') {
    saveUser({ ...requireUser(), ...json } as User)
    return user as T
  }
  if (path === '/auth/device-token') return undefined as T

  requireUser()
  if (route === 'GET /citizen/home') {
    seed(16.705, 74.243)
    const open = db.complaints.filter((c) => !['resolved', 'closed', 'rejected', 'merged'].includes(c.status)).length
    const ward = wards.find((w) => w.id === user!.ward_id)
    return {
      open_complaints: open,
      recent_complaints: db.complaints.slice(0, 3),
      announcements: [],
      ward: ward ? { id: ward.id, number: ward.number, name: ward.name } : null,
    } as T
  }
  if (route === 'GET /citizen/complaints') {
    seed(16.705, 74.243)
    const page = Number(options.query?.page ?? 1)
    const size = Number(options.query?.page_size ?? 20)
    const filtered = db.complaints.filter((c) => !options.query?.status || c.status === options.query.status)
    return { items: filtered.slice((page - 1) * size, page * size), page, page_size: size, total: filtered.length } as T
  }
  const detail = path.match(/^\/citizen\/complaints\/(\d+)(\/timeline)?$/)
  if (method === 'GET' && detail) {
    const complaint = db.complaints.find((c) => c.id === Number(detail[1]))
    if (!complaint) throw notFound()
    return (detail[2] ? { items: db.timelines[complaint.id] ?? [] } : complaint) as T
  }
  if (route === 'POST /citizen/complaints/analyze') {
    const lat = Number(field(options.multipart, 'lat'))
    const lng = Number(field(options.multipart, 'lng'))
    seed(lat, lng)
    const near = db.complaints.find((c) => c.category === 'pothole')!
    const result: AnalyzeResult = {
      suggested_category: 'pothole', department: 'roads', confidence: 0.92, priority_level: 'high',
      summary: 'Large pothole on the road surface', is_civic_issue: true,
      detections: [{ label: 'pothole', confidence: 0.91, box: [0.33, 0.68, 0.59, 0.87] }],
      nearby_duplicates: [{ id: near.id, code: near.code, category: near.category, distance_m: 18, status: near.status }],
      active_announcement: null,
    }
    return result as T
  }
  if (route === 'POST /citizen/complaints') {
    const m = options.multipart
    const lat = Number(field(m, 'lat'))
    const lng = Number(field(m, 'lng'))
    seed(lat, lng)
    const category = (field(m, 'category') as Category | undefined) ?? 'other'
    const info = DEPARTMENTS[category] ?? DEPARTMENTS.other
    const id = nextId++
    const complaint: Complaint = {
      id, code: `MCA-2026-${String(id).padStart(5, '0')}`, source: 'citizen_app', description: field(m, 'description') ?? null,
      category, department: info.department, location: { lat, lng, address: field(m, 'address') ?? null, ward_id: user!.ward_id },
      photo_url: m?.file?.photo.uri ?? null, status: 'new', priority_score: 70, priority_level: 'high',
      ai: { category_confidence: 0.92, summary: 'Large pothole on the road surface' }, duplicate_count: 1,
      merged_into_id: null, assigned_to: null, sla_hours: info.sla, sla_due_at: hoursAhead(info.sla),
      proof: null, feedback: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    db.complaints.unshift(complaint)
    db.timelines[id] = [event(id, id * 10 + 1, 'created', 0, 'new'), event(id, id * 10 + 2, 'classified', 0)]
    return complaint as T
  }
  throw new ApiError(404, 'NOT_FOUND', `Mock: no handler for ${route}`)
}

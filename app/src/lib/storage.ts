import type { Category, Item, Store, Trip } from '../types'
import { CATEGORIES } from '../types'

const KEY = 'travel-planner:v1'
const EMPTY: Store = { version: 1, trips: [] }

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

function toItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.date !== 'string' || typeof r.title !== 'string') return null
  const category = (typeof r.category === 'string' && r.category in CATEGORIES ? r.category : 'etc') as Category
  return {
    id: r.id,
    date: r.date,
    time: str(r.time),
    title: r.title,
    place: str(r.place),
    note: str(r.note),
    cost: num(r.cost),
    category,
  }
}

function toTrip(raw: unknown): Trip | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.startDate !== 'string' || typeof r.endDate !== 'string') return null
  const items = Array.isArray(r.items) ? r.items.map(toItem).filter((i): i is Item => i !== null) : []
  return {
    id: r.id,
    name: str(r.name, '이름 없는 여행'),
    destination: str(r.destination),
    startDate: r.startDate,
    endDate: r.endDate,
    budget: num(r.budget),
    items,
    createdAt: str(r.createdAt, new Date(0).toISOString()),
  }
}

/** 저장된 JSON(또는 가져온 백업 파일)을 검증해서 Store로 바꾼다. 형식이 틀리면 null. */
export function parseStore(json: string): Store | null {
  try {
    const raw: unknown = JSON.parse(json)
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    if (r.version !== 1 || !Array.isArray(r.trips)) return null
    return { version: 1, trips: r.trips.map(toTrip).filter((t): t is Trip => t !== null) }
  } catch {
    return null
  }
}

export function loadStore(): Store {
  try {
    const json = localStorage.getItem(KEY)
    if (!json) return EMPTY
    const parsed = parseStore(json)
    if (parsed) return parsed
    // 읽을 수 없는 데이터를 빈 상태로 덮어쓰기 전에 원본을 따로 남겨 둔다.
    localStorage.setItem(`${KEY}:corrupt-backup`, json)
    return EMPTY
  } catch {
    return EMPTY
  }
}

/** 저장에 실패하면(용량 초과, 사생활 보호 모드 등) false. */
export function saveStore(store: Store): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

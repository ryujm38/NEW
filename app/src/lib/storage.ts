import type { Category, Expense, Flight, Idea, Item, LedgerCategory, PackingItem, ShoppingItem, Stay, Store, Trip } from '../types'
import { CATEGORIES, LEDGER_CATEGORIES } from '../types'
import { findCountry, inferCountry } from './countries'

const KEY = 'travel-planner:v1'
const EMPTY: Store = { version: 1, trips: [] }

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
const bool = (v: unknown): boolean => v === true
const rec = (raw: unknown): Record<string, unknown> | null => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null)
const list = <T>(raw: unknown, convert: (x: unknown) => T | null): T[] =>
  Array.isArray(raw) ? raw.map(convert).filter((x): x is T => x !== null) : []

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
    done: bool(r.done),
  }
}

function toFlight(raw: unknown): Flight | null {
  const r = rec(raw)
  if (!r || typeof r.id !== 'string' || typeof r.departDate !== 'string') return null
  return {
    id: r.id,
    flightNo: str(r.flightNo),
    from: str(r.from),
    to: str(r.to),
    departDate: r.departDate,
    departTime: str(r.departTime),
    arriveDate: str(r.arriveDate, r.departDate),
    arriveTime: str(r.arriveTime),
    cost: num(r.cost),
    note: str(r.note),
  }
}

function toStay(raw: unknown): Stay | null {
  const r = rec(raw)
  if (!r || typeof r.id !== 'string' || typeof r.checkIn !== 'string' || typeof r.checkOut !== 'string') return null
  return {
    id: r.id,
    name: str(r.name, '이름 없는 숙소'),
    address: str(r.address),
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    cost: num(r.cost),
    note: str(r.note),
  }
}

function toShopping(raw: unknown): ShoppingItem | null {
  const r = rec(raw)
  if (!r || typeof r.id !== 'string' || typeof r.name !== 'string') return null
  return { id: r.id, name: r.name, where: str(r.where), price: num(r.price), bought: bool(r.bought) }
}

function toIdea(raw: unknown): Idea | null {
  const r = rec(raw)
  if (!r || typeof r.id !== 'string' || typeof r.title !== 'string') return null
  const category = (typeof r.category === 'string' && r.category in CATEGORIES ? r.category : 'sight') as Category
  return { id: r.id, title: r.title, place: str(r.place), category, note: str(r.note), cost: num(r.cost) }
}

function toPacking(raw: unknown): PackingItem | null {
  const r = rec(raw)
  if (!r || typeof r.id !== 'string' || typeof r.name !== 'string') return null
  return { id: r.id, name: r.name, packed: bool(r.packed) }
}

const positive = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback)
const currencyCode = (v: unknown): string | null => (typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null)

function toExpense(raw: unknown): Expense | null {
  const r = rec(raw)
  if (!r || typeof r.id !== 'string' || typeof r.date !== 'string' || typeof r.title !== 'string') return null
  const category = (typeof r.category === 'string' && r.category in LEDGER_CATEGORIES ? r.category : 'etc') as LedgerCategory
  return {
    id: r.id,
    date: r.date,
    title: r.title,
    category,
    amount: num(r.amount),
    currency: currencyCode(r.currency) ?? 'KRW',
    rate: positive(r.rate, 1),
    sourceId: str(r.sourceId),
  }
}

function toTrip(raw: unknown): Trip | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.startDate !== 'string' || typeof r.endDate !== 'string') return null
  const destination = str(r.destination)
  // 나라가 없는 예전 데이터는 여행지에 나라 이름이 들어 있으면(예: '대만') 그 나라로, 아니면 국내로 본다.
  const country = (typeof r.country === 'string' && findCountry(r.country) ? findCountry(r.country) : inferCountry(destination)) ?? findCountry('KR')!
  const currency = currencyCode(r.currency) ?? country.currency
  return {
    id: r.id,
    name: str(r.name, '이름 없는 여행'),
    destination,
    country: country.code,
    startDate: r.startDate,
    endDate: r.endDate,
    budget: num(r.budget),
    travelers: Math.min(99, Math.max(1, Math.round(positive(r.travelers, 1)))),
    currency,
    rate: currency === 'KRW' ? 1 : num(r.rate),
    rateUpdatedAt: str(r.rateUpdatedAt),
    rateSource: str(r.rateSource),
    items: list(r.items, toItem),
    flights: list(r.flights, toFlight),
    stays: list(r.stays, toStay),
    shopping: list(r.shopping, toShopping),
    ideas: list(r.ideas, toIdea),
    packing: list(r.packing, toPacking),
    expenses: list(r.expenses, toExpense),
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

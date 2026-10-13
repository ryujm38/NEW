import type { Category, Expense, LedgerCategory, Trip } from '../types'
import { toKrw } from './fx'
import { eachDate, newId } from './trip'

export const LEDGER_KEYS: LedgerCategory[] = ['flight', 'stay', 'food', 'move', 'sight', 'shopping', 'etc']

/** 일정 분류 → 가계부 분류 */
const FROM_ITEM: Record<Category, LedgerCategory> = { sight: 'sight', food: 'food', move: 'move', stay: 'stay', etc: 'etc' }

export const krwOf = (e: Pick<Expense, 'amount' | 'rate'>): number => toKrw(e.amount, e.rate)

const emptyByCategory = (): Record<LedgerCategory, number> => ({ flight: 0, stay: 0, food: 0, move: 0, sight: 0, shopping: 0, etc: 0 })

export function actualByCategory(expenses: Expense[]): Record<LedgerCategory, number> {
  const out = emptyByCategory()
  for (const e of expenses) out[e.category] += krwOf(e)
  return out
}

export const actualTotal = (expenses: Expense[]): number => expenses.reduce((sum, e) => sum + krwOf(e), 0)

/** 계획해 둔 비용을 가계부 분류별로 합친다(쇼핑은 예상 가격). */
export function plannedByCategory(trip: Pick<Trip, 'flights' | 'stays' | 'items' | 'shopping'>): Record<LedgerCategory, number> {
  const out = emptyByCategory()
  for (const f of trip.flights) out.flight += f.cost
  for (const s of trip.stays) out.stay += s.cost
  for (const i of trip.items) out[FROM_ITEM[i.category]] += i.cost
  for (const s of trip.shopping) out.shopping += s.price
  return out
}

export interface PlannedSource {
  id: string
  title: string
  category: LedgerCategory
  /** 원화 금액 */
  amount: number
  /** 기록할 때 기본으로 쓸 날짜. 모르면 빈 문자열 */
  date: string
}

/** 계획에는 있는데 아직 가계부에 기록하지 않은 항목(항공·숙소·비용이 있는 일정·산 쇼핑). */
export function unrecordedPlanned(trip: Pick<Trip, 'flights' | 'stays' | 'items' | 'shopping' | 'expenses'>): PlannedSource[] {
  const recorded = new Set(trip.expenses.map((e) => e.sourceId).filter(Boolean))
  const out: PlannedSource[] = []
  for (const f of trip.flights) {
    if (f.cost > 0 && !recorded.has(f.id)) out.push({ id: f.id, title: `항공 ${f.from} → ${f.to}`, category: 'flight', amount: f.cost, date: f.departDate })
  }
  for (const s of trip.stays) {
    if (s.cost > 0 && !recorded.has(s.id)) out.push({ id: s.id, title: `숙소 ${s.name}`, category: 'stay', amount: s.cost, date: s.checkIn })
  }
  for (const i of trip.items) {
    if (i.cost > 0 && !recorded.has(i.id)) out.push({ id: i.id, title: i.title, category: FROM_ITEM[i.category], amount: i.cost, date: i.date })
  }
  for (const s of trip.shopping) {
    if (s.bought && s.price > 0 && !recorded.has(s.id)) out.push({ id: s.id, title: s.name, category: 'shopping', amount: s.price, date: '' })
  }
  return out
}

/** 계획한 비용을 원화 지출로 옮긴다. */
export function expenseFromPlanned(src: PlannedSource, fallbackDate: string): Expense {
  return { id: newId(), date: src.date || fallbackDate, title: src.title, category: src.category, amount: src.amount, currency: 'KRW', rate: 1, sourceId: src.id }
}

/**
 * 지출을 기록할 때의 환율(1 외화 = N원)을 정한다.
 * 원화면 1, 카드 청구 금액(원)을 알면 그 금액에서 역산(정확한 값), 아니면 여행의 현재 환율. 모르면 null.
 */
export function rateForExpense(currency: string, amount: number, krwPaid: number, tripRate: number): number | null {
  if (currency === 'KRW') return 1
  if (krwPaid > 0 && amount > 0) return krwPaid / amount
  return tripRate > 0 ? tripRate : null
}

/** 오늘이 여행 기간 안이면 오늘, 아니면 여행 첫날 */
export function defaultExpenseDate(trip: Pick<Trip, 'startDate' | 'endDate'>, today: string): string {
  return eachDate(trip.startDate, trip.endDate).includes(today) ? today : trip.startDate
}

export const perPerson = (total: number, travelers: number): number => Math.round(total / Math.max(1, travelers))

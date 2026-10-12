import type { Flight, Item, Trip } from '../types'
import { CATEGORIES } from '../types'

const DAY_MS = 86_400_000
export const MAX_TRIP_DAYS = 60
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 날짜는 UTC 자정 기준으로만 계산해서 시간대·서머타임 영향을 받지 않게 한다.
function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function eachDate(start: string, end: string): string[] {
  const s = parse(start)
  const e = parse(end)
  if (!(e >= s)) return []
  const out: string[] = []
  for (let t = s; t <= e && out.length < MAX_TRIP_DAYS; t += DAY_MS) out.push(format(t))
  return out
}

export function validateDates(start: string, end: string): string | null {
  if (!start || !end) return '출발일과 도착일을 입력해 주세요.'
  if (Number.isNaN(parse(start)) || Number.isNaN(parse(end))) return '날짜 형식이 올바르지 않아요.'
  if (parse(end) < parse(start)) return '도착일은 출발일보다 빠를 수 없어요.'
  if ((parse(end) - parse(start)) / DAY_MS + 1 > MAX_TRIP_DAYS) {
    return `여행 기간은 최대 ${MAX_TRIP_DAYS}일까지 지원해요.`
  }
  return null
}

export function dateLabel(date: string): string {
  const ms = parse(date)
  const d = new Date(ms)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WEEKDAYS[d.getUTCDay()]})`
}

export function newId(): string {
  // http(비보안) 환경에서는 randomUUID가 없을 수 있다.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function itemsForDate(items: Item[], date: string): Item[] {
  return items.filter((i) => i.date === date)
}

export function totalCost(items: Item[]): number {
  return items.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0)
}

/** 같은 날짜 안에서 위(-1)/아래(1)로 한 칸 옮긴다. 끝이면 그대로 돌려준다. */
export function moveItem(items: Item[], id: string, dir: -1 | 1): Item[] {
  const from = items.findIndex((i) => i.id === id)
  if (from < 0) return items
  const date = items[from].date
  let to = from + dir
  while (to >= 0 && to < items.length && items[to].date !== date) to += dir
  if (to < 0 || to >= items.length) return items
  const next = items.slice()
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/** 하루치 일정을 시간순으로 정렬한다. 시간이 비어 있는 일정은 뒤로 보낸다. 다른 날짜의 위치는 건드리지 않는다. */
export function sortDayByTime(items: Item[], date: string): Item[] {
  const slots: number[] = []
  items.forEach((it, idx) => {
    if (it.date === date) slots.push(idx)
  })
  const sorted = slots
    .map((idx) => items[idx])
    .sort((a, b) => {
      if (a.time === b.time) return 0
      if (!a.time) return 1
      if (!b.time) return -1
      return a.time < b.time ? -1 : 1
    })
  const next = items.slice()
  slots.forEach((idx, n) => {
    next[idx] = sorted[n]
  })
  return next
}

/** 여행 기간을 바꿨을 때 범위 밖이 된 일정을 가장 가까운 날짜로 옮긴다. */
export function clampItems(items: Item[], start: string, end: string): Item[] {
  if (validateDates(start, end)) return items
  return items.map((i) => {
    if (i.date < start) return { ...i, date: start }
    if (i.date > end) return { ...i, date: end }
    return i
  })
}

export function formatWon(n: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(n))}원`
}

export function mapLinks(item: Pick<Item, 'place' | 'title'>, destination: string) {
  const q = encodeURIComponent([item.place || item.title, destination].filter(Boolean).join(' '))
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    naver: `https://map.naver.com/p/search/${q}`,
  }
}

export function nights(checkIn: string, checkOut: string): number {
  return Math.round((parse(checkOut) - parse(checkIn)) / DAY_MS)
}

export function sumBy<T>(list: T[], pick: (t: T) => number): number {
  return list.reduce((sum, t) => {
    const v = pick(t)
    return sum + (Number.isFinite(v) ? v : 0)
  }, 0)
}

export interface Breakdown {
  flights: number
  stays: number
  activities: number
  shopping: number
  total: number
}

/** 항공·숙소·일정·쇼핑 비용과 합계. 쇼핑은 예상 가격 기준이다. */
export function budgetBreakdown(trip: Pick<Trip, 'flights' | 'stays' | 'items' | 'shopping'>): Breakdown {
  const flights = sumBy(trip.flights, (f) => f.cost)
  const stays = sumBy(trip.stays, (s) => s.cost)
  const activities = sumBy(trip.items, (i) => i.cost)
  const shopping = sumBy(trip.shopping, (s) => s.price)
  return { flights, stays, activities, shopping, total: flights + stays + activities + shopping }
}

export function completion(items: Item[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length }
}

export interface DayEvent {
  kind: 'flight' | 'stay'
  label: string
  time: string
  sort: string
}

/** 항공·숙소 정보에서 자동으로 만든, 그 날짜의 고정 일정(출발, 도착, 체크인, 체크아웃). */
export function dayEvents(trip: Pick<Trip, 'flights' | 'stays'>, date: string): DayEvent[] {
  const out: DayEvent[] = []
  for (const f of trip.flights) {
    const route = `${f.from || '?'} → ${f.to || '?'}${f.flightNo ? ` (${f.flightNo})` : ''}`
    if (f.departDate === date) {
      const sameDayArrival = f.arriveDate === f.departDate && f.arriveTime
      out.push({
        kind: 'flight',
        label: `항공 ${route}${sameDayArrival ? ` · ${f.arriveTime} 도착` : ''}`,
        time: f.departTime,
        sort: f.departTime || '12:00',
      })
    }
    if (f.arriveDate && f.arriveDate !== f.departDate && f.arriveDate === date) {
      out.push({ kind: 'flight', label: `항공 도착 ${f.to || '?'}`, time: f.arriveTime, sort: f.arriveTime || '12:00' })
    }
  }
  for (const s of trip.stays) {
    if (s.checkOut === date) out.push({ kind: 'stay', label: `숙소 체크아웃 · ${s.name}`, time: '', sort: '10:00' })
    if (s.checkIn === date) out.push({ kind: 'stay', label: `숙소 체크인 · ${s.name}`, time: '', sort: '15:00' })
  }
  return out.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
}

/** 여행 기간 중 어떤 숙소로도 덮이지 않는 밤(체크인 날짜 이상, 체크아웃 날짜 미만). */
export function uncoveredNights(trip: Pick<Trip, 'startDate' | 'endDate' | 'stays'>): string[] {
  const days = eachDate(trip.startDate, trip.endDate)
  return days.slice(0, -1).filter((d) => !trip.stays.some((s) => s.checkIn <= d && d < s.checkOut))
}

/** 연속된 날짜를 [시작, 끝] 구간으로 묶는다. 입력은 오름차순이어야 한다. */
export function groupRanges(dates: string[]): [string, string][] {
  const out: [string, string][] = []
  for (const d of dates) {
    const last = out[out.length - 1]
    if (last && parse(d) - parse(last[1]) === DAY_MS) last[1] = d
    else out.push([d, d])
  }
  return out
}

export function sortFlights(flights: Flight[]): Flight[] {
  const key = (f: Flight) => `${f.departDate} ${f.departTime || '99:99'}`
  return flights.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

export interface RoundTripInput {
  from: string
  to: string
  outFlightNo: string
  retFlightNo: string
  outTime: string
  retTime: string
  /** 왕복 총액. 가는 편과 오는 편에 반씩 나눠 기록한다. */
  total: number
}

/** 왕복 항공권 한 번에 입력: 가는 편은 출발일, 오는 편은 도착일에 날짜를 맞춘다. */
export function makeRoundTrip(inp: RoundTripInput, startDate: string, endDate: string): Flight[] {
  const outCost = Math.floor(inp.total / 2)
  const base = { arriveTime: '', note: '' }
  return [
    { id: newId(), flightNo: inp.outFlightNo, from: inp.from, to: inp.to, departDate: startDate, departTime: inp.outTime, arriveDate: startDate, cost: outCost, ...base },
    { id: newId(), flightNo: inp.retFlightNo, from: inp.to, to: inp.from, departDate: endDate, departTime: inp.retTime, arriveDate: endDate, cost: inp.total - outCost, ...base },
  ]
}

/** 메신저로 공유하기 좋은 일정 텍스트 */
export function formatItinerary(trip: Trip): string {
  const lines: string[] = [`✈️ ${trip.name} (${trip.destination})`, `${trip.startDate} ~ ${trip.endDate}`]

  if (trip.flights.length > 0) {
    lines.push('', '[항공]')
    for (const f of sortFlights(trip.flights)) {
      const parts = [`${f.departDate} ${f.departTime || '--:--'}`, `${f.from || '?'} → ${f.to || '?'}`]
      if (f.flightNo) parts.push(`(${f.flightNo})`)
      if (f.cost) parts.push(formatWon(f.cost))
      lines.push(`  ${parts.join(' ')}`)
    }
  }
  if (trip.stays.length > 0) {
    lines.push('', '[숙소]')
    for (const s of trip.stays) {
      const parts = [s.name, `${s.checkIn} ~ ${s.checkOut} (${nights(s.checkIn, s.checkOut)}박)`]
      if (s.address) parts.push(`@ ${s.address}`)
      if (s.cost) parts.push(formatWon(s.cost))
      lines.push(`  ${parts.join(' ')}`)
    }
  }

  eachDate(trip.startDate, trip.endDate).forEach((date, idx) => {
    lines.push('', `Day ${idx + 1} · ${dateLabel(date)}`)
    for (const e of dayEvents(trip, date)) lines.push(`  ${e.time ? `${e.time} ` : ''}${e.label}`)
    const day = itemsForDate(trip.items, date)
    if (day.length === 0 && dayEvents(trip, date).length === 0) lines.push('  (일정 없음)')
    for (const it of day) {
      const parts = [it.done ? '✔' : '', it.time || '--:--', it.title].filter(Boolean)
      if (it.place) parts.push(`@ ${it.place}`)
      if (it.cost) parts.push(`(${formatWon(it.cost)})`)
      lines.push(`  ${parts.join(' ')} [${CATEGORIES[it.category]}]`)
    }
  })

  if (trip.shopping.length > 0) {
    lines.push('', '[쇼핑]')
    for (const s of trip.shopping) {
      const parts = [s.bought ? '✔' : '-', s.name]
      if (s.where) parts.push(`@ ${s.where}`)
      if (s.price) parts.push(`(${formatWon(s.price)})`)
      lines.push(`  ${parts.join(' ')}`)
    }
  }

  const { total } = budgetBreakdown(trip)
  if (total > 0) lines.push('', `총 예상 비용: ${formatWon(total)}`)
  return lines.join('\n')
}

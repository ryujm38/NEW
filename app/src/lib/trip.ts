import type { Item, Trip } from '../types'
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

/** 메신저로 공유하기 좋은 일정 텍스트 */
export function formatItinerary(trip: Trip): string {
  const lines: string[] = [`✈️ ${trip.name} (${trip.destination})`, `${trip.startDate} ~ ${trip.endDate}`]
  eachDate(trip.startDate, trip.endDate).forEach((date, idx) => {
    lines.push('', `Day ${idx + 1} · ${dateLabel(date)}`)
    const day = itemsForDate(trip.items, date)
    if (day.length === 0) lines.push('  (일정 없음)')
    for (const it of day) {
      const parts = [it.time || '--:--', it.title]
      if (it.place) parts.push(`@ ${it.place}`)
      if (it.cost) parts.push(`(${formatWon(it.cost)})`)
      lines.push(`  ${parts.join(' ')} [${CATEGORIES[it.category]}]`)
    }
  })
  const total = totalCost(trip.items)
  if (total > 0) lines.push('', `총 예상 비용: ${formatWon(total)}`)
  return lines.join('\n')
}

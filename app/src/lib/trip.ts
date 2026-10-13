import type { Flight, Idea, Item, Stay, Trip } from '../types'
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

// ---------------------------------------------------------------------------
// 여행 캘린더
// ---------------------------------------------------------------------------

/** 0(일)~6(토) */
export function weekdayOf(date: string): number {
  return new Date(parse(date)).getUTCDay()
}

/**
 * 여행 기간만 달력(일~토) 모양의 주 단위 행으로 만든다. 첫 주 앞과 마지막 주 뒤의 기간 밖 칸은 null.
 * 1주 여행이 일요일에 시작하면 1행, 2주 여행이 수요일에 시작하면 3행이 된다.
 */
export function calendarWeeks(start: string, end: string): (string | null)[][] {
  const days = eachDate(start, end)
  if (days.length === 0) return []
  const cells: (string | null)[] = [...new Array<null>(weekdayOf(days[0])).fill(null), ...days]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** '2026년 11월' 또는 달이 바뀌면 '2026년 11월 ~ 12월'(해가 바뀌면 연도도 표시) */
export function monthLabel(start: string, end: string): string {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  if (sy === ey && sm === em) return `${sy}년 ${sm}월`
  return sy === ey ? `${sy}년 ${sm}월 ~ ${em}월` : `${sy}년 ${sm}월 ~ ${ey}년 ${em}월`
}

export interface DaySummary {
  items: number
  done: number
  /** 그날 출발하거나 도착하는 항공 수 */
  flights: number
  checkIns: number
  checkOuts: number
}

export function daySummary(trip: Pick<Trip, 'items' | 'flights' | 'stays'>, date: string): DaySummary {
  const day = itemsForDate(trip.items, date)
  return {
    items: day.length,
    done: day.filter((i) => i.done).length,
    flights: trip.flights.filter((f) => f.departDate === date || f.arriveDate === date).length,
    checkIns: trip.stays.filter((s) => s.checkIn === date).length,
    checkOuts: trip.stays.filter((s) => s.checkOut === date).length,
  }
}

/** 사용자의 현지 시간 기준 오늘 날짜(yyyy-mm-dd) */
export function todayString(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// ---------------------------------------------------------------------------
// 등록한 항공·숙소를 일정 짤 때 꺼내 쓰는 장치들
// ---------------------------------------------------------------------------

/** 도착 후 입국·수하물·이동에 쓰는 시간(분). 이 시간이 지난 뒤부터 일정을 잡는 것을 권장한다. */
export const ARRIVE_BUFFER_MIN = 60
/** 출발 전에 공항에 도착해야 하는 시간(분). */
export const DEPART_BUFFER_MIN = 120
/** 구글지도 경로 링크가 받을 수 있는 경유지 수 */
export const MAX_WAYPOINTS = 9

/** 'HH:MM'에 분을 더한다. 하루(00:00~23:59) 안으로 자른다. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export interface DayAnchors {
  /** 그날 아침에 머문 숙소(전날 밤 숙소). 도착일이면 없다. */
  start?: Stay
  /** 그날 밤에 묵을 숙소. 마지막 날이면 없다. */
  end?: Stay
}

export function dayAnchors(trip: Pick<Trip, 'stays'>, date: string): DayAnchors {
  const byCheckIn = trip.stays.slice().sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))
  return {
    start: byCheckIn.find((s) => s.checkIn < date && date <= s.checkOut),
    end: byCheckIn.find((s) => s.checkIn <= date && date < s.checkOut),
  }
}

const stayQuery = (s: Stay, destination: string) => [s.name, s.address || destination].filter(Boolean).join(' ')

export interface DayRoute {
  url: string
  /** 경로에 들어간 지점 수(출발·경유·도착 포함) */
  stops: number
  /** 경유지가 너무 많아 일부를 뺐으면 true */
  truncated: boolean
}

/**
 * 그날 아직 하지 않은 일정의 장소들을 숙소 기점으로 이은 구글지도 경로 링크.
 * 장소가 적힌 일정이 하나도 없으면 null.
 */
export function routeUrl(
  trip: Pick<Trip, 'items' | 'stays' | 'destination'>,
  date: string,
  options: { returnToStay?: boolean } = {},
): DayRoute | null {
  const stops = trip.items
    .filter((i) => i.date === date && !i.done && i.place.trim())
    .map((i) => [i.place.trim(), trip.destination].filter(Boolean).join(' '))
  if (stops.length === 0) return null

  const { start, end } = dayAnchors(trip, date)
  const raw = [
    ...(start ? [stayQuery(start, trip.destination)] : []),
    ...stops,
    ...(options.returnToStay && end ? [stayQuery(end, trip.destination)] : []),
  ]
  // 같은 지점이 연달아 나오면(예: 숙소에서 출발해 숙소가 목적지인 일정) 이동이 아니므로 합친다.
  const points = raw.filter((p, i) => p !== raw[i - 1])
  if (points.length < 2) return null

  const origin = points[0]
  const destination = points[points.length - 1]
  const middle = points.slice(1, -1)
  const waypoints = middle.slice(0, MAX_WAYPOINTS)
  const params = new URLSearchParams({ api: '1', origin, destination })
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'))
  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    stops: 2 + waypoints.length,
    truncated: middle.length > MAX_WAYPOINTS,
  }
}

export interface DayWindow {
  /** 이 시각 이후에 일정을 잡는 것을 권장. 비어 있으면 제한 없음 */
  from: string
  /** 이 시각 전에 일정을 끝내는 것을 권장. 비어 있으면 제한 없음 */
  to: string
  fromNote: string
  toNote: string
}

/**
 * 항공 시간으로 계산한 그날의 일정 가능 시간대.
 * - 다른 날 도착하는 항공은 도착일에, 출발은 출발일에 적용한다.
 * - 같은 날 출발·도착하는 항공은 첫날이면 도착만, 마지막 날이면 출발만 적용한다(첫날 출발지·마지막 날 도착지는 일정과 무관).
 * 시간이 적힌 항공이 없으면 null.
 */
export function dayWindow(trip: Pick<Trip, 'flights' | 'startDate' | 'endDate'>, date: string): DayWindow | null {
  let arrival = ''
  let departure = ''
  for (const f of trip.flights) {
    const sameDay = f.departDate === f.arriveDate
    if (f.arriveDate === date && f.arriveTime && (!sameDay || date === trip.startDate)) {
      if (f.arriveTime > arrival) arrival = f.arriveTime
    }
    if (f.departDate === date && f.departTime && (!sameDay || date === trip.endDate)) {
      if (!departure || f.departTime < departure) departure = f.departTime
    }
  }
  if (!arrival && !departure) return null
  return {
    from: arrival ? addMinutes(arrival, ARRIVE_BUFFER_MIN) : '',
    to: departure ? addMinutes(departure, -DEPART_BUFFER_MIN) : '',
    fromNote: arrival ? `도착 ${arrival} + ${ARRIVE_BUFFER_MIN / 60}시간` : '',
    toNote: departure ? `출발 ${departure} − ${DEPART_BUFFER_MIN / 60}시간` : '',
  }
}

/** 같은 시간(비어 있지 않은)에 잡힌 일정들을 시간별로 묶어 돌려준다. 2개 이상인 것만. */
export function duplicateTimes(items: Item[]): { time: string; titles: string[] }[] {
  const byTime = new Map<string, string[]>()
  for (const i of items) {
    if (!i.time) continue
    byTime.set(i.time, [...(byTime.get(i.time) ?? []), i.title])
  }
  return [...byTime.entries()].filter(([, titles]) => titles.length > 1).map(([time, titles]) => ({ time, titles }))
}

/** 그날 일정에서 확인이 필요한 점들(항공 시간과 어긋남, 같은 시간에 겹침). */
export function dayWarnings(trip: Pick<Trip, 'items' | 'flights' | 'startDate' | 'endDate'>, date: string): string[] {
  const day = itemsForDate(trip.items, date)
  const out: string[] = []
  const win = dayWindow(trip, date)
  if (win) {
    for (const i of day) {
      if (!i.time || i.done) continue
      if (win.from && i.time < win.from) out.push(`'${i.title}' ${i.time}: ${win.from} 이후가 좋아요 (${win.fromNote})`)
      else if (win.to && i.time > win.to) out.push(`'${i.title}' ${i.time}: ${win.to} 전에 끝내는 게 좋아요 (${win.toNote})`)
    }
  }
  for (const d of duplicateTimes(day)) out.push(`${d.time}에 일정 ${d.titles.length}개가 겹쳐요: ${d.titles.join(', ')}`)
  return out
}

export interface PlaceSuggestion {
  label: string
  place: string
}

/** 일정 추가 폼에서 눌러서 채울 수 있게, 그날 등록된 숙소와 공항을 장소 후보로 만든다. */
export function placeSuggestions(trip: Pick<Trip, 'stays' | 'flights'>, date: string): PlaceSuggestion[] {
  const out: PlaceSuggestion[] = []
  const { start, end } = dayAnchors(trip, date)
  for (const s of [start, end]) if (s) out.push({ label: `숙소 · ${s.name}`, place: s.name })
  for (const f of trip.flights) {
    if (f.departDate === date && f.from) out.push({ label: `출발 · ${f.from}`, place: f.from })
    if (f.arriveDate === date && f.to) out.push({ label: `도착 · ${f.to}`, place: f.to })
  }
  const seen = new Set<string>()
  return out.filter((x) => !seen.has(x.place) && seen.add(x.place))
}

/** 후보지를 해당 날짜의 일정으로 옮긴다. 시간은 비워 둔다. */
export function ideaToItem(idea: Idea, date: string): Item {
  return {
    id: newId(),
    date,
    time: '',
    title: idea.title,
    place: idea.place,
    note: idea.note,
    cost: idea.cost,
    category: idea.category,
    done: false,
  }
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

  if (trip.ideas.length > 0) {
    lines.push('', '[후보지]')
    for (const i of trip.ideas) lines.push(`  - ${i.title}${i.place ? ` @ ${i.place}` : ''}`)
  }
  if (trip.packing.length > 0) {
    lines.push('', '[준비물]')
    for (const p of trip.packing) lines.push(`  ${p.packed ? '✔' : '-'} ${p.name}`)
  }
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

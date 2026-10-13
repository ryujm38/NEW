import { describe, expect, it } from 'vitest'
import type { Flight, Idea, Item, Stay, Trip } from '../types'
import { parseStore } from './storage'
import {
  MAX_TRIP_DAYS,
  MAX_WAYPOINTS,
  addMinutes,
  budgetBreakdown,
  calendarWeeks,
  clampItems,
  completion,
  dateLabel,
  dayAnchors,
  dayEvents,
  dayWarnings,
  dayWindow,
  daySummary,
  duplicateTimes,
  eachDate,
  formatItinerary,
  formatWon,
  groupRanges,
  ideaToItem,
  makeRoundTrip,
  mapLinks,
  monthLabel,
  moveItem,
  nights,
  placeSuggestions,
  routeUrl,
  sortDayByTime,
  sortFlights,
  todayString,
  totalCost,
  uncoveredNights,
  validateDates,
  weekdayOf,
} from './trip'

const item = (id: string, date: string, time = '', cost = 0): Item => ({
  id,
  date,
  time,
  title: id,
  place: '',
  note: '',
  cost,
  category: 'etc',
  done: false,
})

const flight = (over: Partial<Flight> = {}): Flight => ({
  id: 'f',
  flightNo: '',
  from: 'ICN',
  to: 'CJU',
  departDate: '2026-11-05',
  departTime: '',
  arriveDate: '2026-11-05',
  arriveTime: '',
  cost: 0,
  note: '',
  ...over,
})

const stay = (over: Partial<Stay> = {}): Stay => ({
  id: 's',
  name: '제주호텔',
  address: '',
  checkIn: '2026-11-05',
  checkOut: '2026-11-07',
  cost: 0,
  note: '',
  ...over,
})

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't',
  name: '제주 여행',
  destination: '제주',
  startDate: '2026-11-05',
  endDate: '2026-11-08',
  budget: 0,
  items: [],
  flights: [],
  stays: [],
  shopping: [],
  ideas: [],
  packing: [],
  createdAt: '',
  ...over,
})

describe('eachDate', () => {
  it('월 경계를 넘는 기간을 만든다', () => {
    expect(eachDate('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })
  it('윤일을 포함한다', () => {
    expect(eachDate('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })
  it('당일치기는 하루', () => {
    expect(eachDate('2026-10-12', '2026-10-12')).toEqual(['2026-10-12'])
  })
  it('역순이거나 잘못된 날짜면 빈 배열', () => {
    expect(eachDate('2026-10-12', '2026-10-11')).toEqual([])
    expect(eachDate('', '')).toEqual([])
    expect(eachDate('abc', '2026-10-11')).toEqual([])
  })
  it('최대 일수를 넘기지 않는다', () => {
    expect(eachDate('2026-01-01', '2030-01-01')).toHaveLength(MAX_TRIP_DAYS)
  })
})

describe('validateDates', () => {
  it('정상 범위는 null', () => expect(validateDates('2026-10-12', '2026-10-15')).toBeNull())
  it('빈 값, 역순, 너무 긴 기간을 거른다', () => {
    expect(validateDates('', '2026-10-15')).not.toBeNull()
    expect(validateDates('2026-10-15', '2026-10-12')).not.toBeNull()
    expect(validateDates('2026-01-01', '2026-12-31')).not.toBeNull()
  })
  it('정확히 최대 일수는 허용한다', () => {
    expect(validateDates('2026-01-01', '2026-03-01')).toBeNull() // 60일
    expect(validateDates('2026-01-01', '2026-03-02')).not.toBeNull() // 61일
  })
})

describe('dateLabel', () => {
  it('요일을 붙인다', () => expect(dateLabel('2026-10-12')).toBe('10/12 (월)'))
})

describe('totalCost / formatWon', () => {
  it('비용을 합산한다', () => expect(totalCost([item('a', 'd', '', 1000), item('b', 'd', '', 2500)])).toBe(3500))
  it('빈 목록은 0', () => expect(totalCost([])).toBe(0))
  it('원 단위로 표시한다', () => expect(formatWon(1234567)).toBe('1,234,567원'))
})

describe('moveItem', () => {
  const items = [item('a', '1'), item('b', '2'), item('c', '1'), item('d', '1')]
  it('같은 날짜의 다음 일정과 자리를 바꾼다 (다른 날짜를 건너뜀)', () => {
    expect(moveItem(items, 'a', 1).map((i) => i.id)).toEqual(['c', 'b', 'a', 'd'])
  })
  it('위로도 옮긴다', () => {
    expect(moveItem(items, 'd', -1).map((i) => i.id)).toEqual(['a', 'b', 'd', 'c'])
  })
  it('하루의 맨 위/아래에서는 그대로', () => {
    expect(moveItem(items, 'a', -1)).toBe(items)
    expect(moveItem(items, 'd', 1)).toBe(items)
    expect(moveItem(items, 'b', 1)).toBe(items)
  })
  it('없는 id는 그대로', () => expect(moveItem(items, 'zzz', 1)).toBe(items))
})

describe('sortDayByTime', () => {
  it('시간순으로 정렬하고 시간 없는 일정은 뒤로 보낸다', () => {
    const items = [item('x', '1', '15:00'), item('other', '2', '09:00'), item('y', '1'), item('z', '1', '08:30')]
    expect(sortDayByTime(items, '1').map((i) => i.id)).toEqual(['z', 'other', 'x', 'y'])
  })
})

describe('clampItems', () => {
  it('범위 밖 일정을 가장 가까운 날짜로 옮긴다', () => {
    const items = [item('a', '2026-10-10'), item('b', '2026-10-13'), item('c', '2026-10-20')]
    expect(clampItems(items, '2026-10-12', '2026-10-14').map((i) => i.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ])
  })
  it('기간이 잘못됐으면 건드리지 않는다', () => {
    const items = [item('a', '2026-10-10')]
    expect(clampItems(items, '2026-10-14', '2026-10-12')).toBe(items)
  })
})

describe('mapLinks', () => {
  it('장소와 여행지를 검색어로 인코딩한다', () => {
    const l = mapLinks({ place: '성산일출봉', title: '일출' }, '제주')
    expect(l.google).toContain(encodeURIComponent('성산일출봉 제주'))
    expect(l.naver).toContain(encodeURIComponent('성산일출봉 제주'))
  })
  it('장소가 없으면 제목을 쓴다', () => {
    expect(mapLinks({ place: '', title: '흑돼지' }, '제주').google).toContain(encodeURIComponent('흑돼지 제주'))
  })
})

describe('formatItinerary', () => {
  it('일차별로 텍스트를 만든다', () => {
    const t = trip({
      name: '제주 봄여행',
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      items: [{ ...item('a', '2026-10-12', '09:00', 15000), title: '아침식사', place: '해장국집', category: 'food' }],
    })
    const text = formatItinerary(t)
    expect(text).toContain('Day 1 · 10/12 (월)')
    expect(text).toContain('09:00 아침식사 @ 해장국집 (15,000원) [식사]')
    expect(text).toContain('Day 2 · 10/13 (화)')
    expect(text).toContain('(일정 없음)')
    expect(text).toContain('총 예상 비용: 15,000원')
  })
})

describe('parseStore', () => {
  it('정상 데이터를 읽는다', () => {
    const s = parseStore(
      JSON.stringify({
        version: 1,
        trips: [{ id: 't', name: 'n', destination: 'd', startDate: '2026-10-12', endDate: '2026-10-13', budget: 100, items: [] }],
      }),
    )
    expect(s?.trips).toHaveLength(1)
    expect(s?.trips[0].budget).toBe(100)
  })
  it('깨진 JSON, 다른 버전, 잘못된 모양은 null', () => {
    expect(parseStore('{not json')).toBeNull()
    expect(parseStore('null')).toBeNull()
    expect(parseStore(JSON.stringify({ version: 2, trips: [] }))).toBeNull()
    expect(parseStore(JSON.stringify({ version: 1, trips: 'x' }))).toBeNull()
  })
  it('망가진 항목은 버리고 나머지는 살린다', () => {
    const s = parseStore(
      JSON.stringify({
        version: 1,
        trips: [
          null,
          { id: 't', startDate: '2026-10-12', endDate: '2026-10-13', items: [null, { id: 'i', date: '2026-10-12', title: 'ok', cost: -5, category: 'weird' }] },
        ],
      }),
    )
    expect(s?.trips).toHaveLength(1)
    expect(s?.trips[0].items).toHaveLength(1)
    expect(s?.trips[0].items[0].cost).toBe(0)
    expect(s?.trips[0].items[0].category).toBe('etc')
  })
})

describe('nights', () => {
  it('체크인과 체크아웃 사이 박 수', () => {
    expect(nights('2026-11-05', '2026-11-07')).toBe(2)
    expect(nights('2026-10-31', '2026-11-02')).toBe(2)
    expect(nights('2026-11-05', '2026-11-05')).toBe(0)
  })
})

describe('budgetBreakdown', () => {
  it('항공·숙소·일정·쇼핑을 나눠서 합산한다', () => {
    const b = budgetBreakdown(
      trip({
        flights: [flight({ cost: 200000 }), flight({ id: 'g', cost: 180000 })],
        stays: [stay({ cost: 300000 })],
        items: [item('a', '2026-11-05', '', 50000)],
        shopping: [{ id: 'x', name: '초콜릿', where: '', price: 20000, bought: false }],
      }),
    )
    expect(b).toEqual({ flights: 380000, stays: 300000, activities: 50000, shopping: 20000, total: 750000 })
  })
  it('비어 있으면 모두 0', () => {
    expect(budgetBreakdown(trip()).total).toBe(0)
  })
})

describe('completion', () => {
  it('완료 개수를 센다', () => {
    const items = [item('a', 'd'), { ...item('b', 'd'), done: true }, { ...item('c', 'd'), done: true }]
    expect(completion(items)).toEqual({ done: 2, total: 3 })
    expect(completion([])).toEqual({ done: 0, total: 0 })
  })
})

describe('dayEvents', () => {
  const t = trip({
    flights: [
      flight({ id: 'out', flightNo: 'KE1201', departTime: '10:30', arriveTime: '11:40' }),
      flight({ id: 'ret', from: 'CJU', to: 'ICN', departDate: '2026-11-08', arriveDate: '2026-11-08', departTime: '19:00' }),
    ],
    stays: [stay({ checkIn: '2026-11-05', checkOut: '2026-11-08' })],
  })
  it('출발일에는 항공과 체크인이 시간순으로 나온다', () => {
    const e = dayEvents(t, '2026-11-05')
    expect(e.map((x) => x.label)).toEqual(['항공 ICN → CJU (KE1201) · 11:40 도착', '숙소 체크인 · 제주호텔'])
    expect(e[0].time).toBe('10:30')
  })
  it('마지막 날에는 체크아웃이 항공보다 앞선다', () => {
    expect(dayEvents(t, '2026-11-08').map((x) => x.label)).toEqual(['숙소 체크아웃 · 제주호텔', '항공 CJU → ICN'])
  })
  it('아무 일도 없는 날은 빈 배열', () => {
    expect(dayEvents(t, '2026-11-06')).toEqual([])
  })
  it('다음 날 도착하는 항공은 도착일에도 표시된다', () => {
    const red = trip({ flights: [flight({ departDate: '2026-11-05', departTime: '23:50', arriveDate: '2026-11-06', arriveTime: '06:10' })] })
    expect(dayEvents(red, '2026-11-06').map((x) => x.label)).toEqual(['항공 도착 CJU'])
    expect(dayEvents(red, '2026-11-05')[0].label).toBe('항공 ICN → CJU')
  })
})

describe('uncoveredNights / groupRanges', () => {
  it('숙소가 하나도 없으면 모든 밤이 비어 있다 (마지막 날 밤은 제외)', () => {
    expect(uncoveredNights(trip())).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
  })
  it('체크아웃 날짜의 밤은 덮이지 않은 것으로 본다', () => {
    const t = trip({ stays: [stay({ checkIn: '2026-11-05', checkOut: '2026-11-07' })] })
    expect(uncoveredNights(t)).toEqual(['2026-11-07'])
  })
  it('숙소 두 곳이 이어지면 빈 밤이 없다', () => {
    const t = trip({ stays: [stay({ checkOut: '2026-11-06' }), stay({ id: 's2', checkIn: '2026-11-06', checkOut: '2026-11-08' })] })
    expect(uncoveredNights(t)).toEqual([])
  })
  it('당일치기는 밤이 없다', () => {
    expect(uncoveredNights(trip({ startDate: '2026-11-05', endDate: '2026-11-05' }))).toEqual([])
  })
  it('연속된 날짜를 구간으로 묶는다', () => {
    expect(groupRanges(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-04'])).toEqual([
      ['2026-10-30', '2026-11-01'],
      ['2026-11-04', '2026-11-04'],
    ])
    expect(groupRanges([])).toEqual([])
  })
})

describe('makeRoundTrip / sortFlights', () => {
  it('가는 편은 출발일, 오는 편은 도착일에 맞추고 출발지와 도착지를 뒤집는다', () => {
    const [out, ret] = makeRoundTrip(
      { from: 'ICN', to: 'CJU', outFlightNo: 'KE1', retFlightNo: 'KE2', outTime: '09:00', retTime: '20:00', total: 100001 },
      '2026-11-05',
      '2026-11-08',
    )
    expect([out.from, out.to, out.departDate, out.departTime, out.flightNo]).toEqual(['ICN', 'CJU', '2026-11-05', '09:00', 'KE1'])
    expect([ret.from, ret.to, ret.departDate, ret.departTime, ret.flightNo]).toEqual(['CJU', 'ICN', '2026-11-08', '20:00', 'KE2'])
    expect(out.cost + ret.cost).toBe(100001)
    expect(out.id).not.toBe(ret.id)
  })
  it('날짜와 시간 순으로 정렬한다 (시간 없는 항공은 그날 맨 뒤)', () => {
    const sorted = sortFlights([
      flight({ id: 'c', departDate: '2026-11-08', departTime: '10:00' }),
      flight({ id: 'b', departDate: '2026-11-05', departTime: '' }),
      flight({ id: 'a', departDate: '2026-11-05', departTime: '08:00' }),
    ])
    expect(sorted.map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('formatItinerary (항공·숙소·쇼핑)', () => {
  it('항공, 숙소, 쇼핑, 완료 표시를 포함한다', () => {
    const t = trip({
      flights: [flight({ flightNo: 'KE1201', departTime: '10:30', cost: 100000 })],
      stays: [stay({ address: '제주시', cost: 200000 })],
      items: [{ ...item('a', '2026-11-05', '12:00'), title: '점심', done: true }],
      shopping: [
        { id: 'x', name: '감귤초콜릿', where: '공항', price: 12000, bought: true },
        { id: 'y', name: '한라봉', where: '', price: 0, bought: false },
      ],
    })
    const text = formatItinerary(t)
    expect(text).toContain('[항공]')
    expect(text).toContain('2026-11-05 10:30 ICN → CJU (KE1201) 100,000원')
    expect(text).toContain('제주호텔 2026-11-05 ~ 2026-11-07 (2박) @ 제주시 200,000원')
    expect(text).toContain('✔ 12:00 점심')
    expect(text).toContain('✔ 감귤초콜릿 @ 공항 (12,000원)')
    expect(text).toContain('- 한라봉')
    expect(text).toContain('총 예상 비용: 312,000원')
  })
})

describe('parseStore: 이전 버전 데이터 호환', () => {
  it('항공·숙소·쇼핑·done이 없는 예전 데이터도 기본값으로 읽는다', () => {
    const s = parseStore(
      JSON.stringify({
        version: 1,
        trips: [
          { id: 't', startDate: '2026-10-12', endDate: '2026-10-13', items: [{ id: 'i', date: '2026-10-12', title: 'old' }] },
        ],
      }),
    )
    const t = s?.trips[0]
    expect(t?.flights).toEqual([])
    expect(t?.stays).toEqual([])
    expect(t?.shopping).toEqual([])
    expect(t?.items[0].done).toBe(false)
  })
  it('새 필드를 검증해서 읽고 망가진 항목은 버린다', () => {
    const s = parseStore(
      JSON.stringify({
        version: 1,
        trips: [
          {
            id: 't',
            startDate: '2026-10-12',
            endDate: '2026-10-13',
            items: [{ id: 'i', date: '2026-10-12', title: 'x', done: true }],
            flights: [{ id: 'f', departDate: '2026-10-12', from: 'ICN', cost: 5 }, { id: 'bad' }, null],
            stays: [{ id: 's', checkIn: '2026-10-12', checkOut: '2026-10-13', name: 'H' }, { id: 'bad', checkIn: 3 }],
            shopping: [{ id: 'p', name: '라면', price: -3, bought: true }, { id: 'bad' }],
          },
        ],
      }),
    )
    const t = s?.trips[0]
    expect(t?.items[0].done).toBe(true)
    expect(t?.flights).toHaveLength(1)
    expect(t?.flights[0].arriveDate).toBe('2026-10-12')
    expect(t?.stays).toHaveLength(1)
    expect(t?.shopping).toEqual([{ id: 'p', name: '라면', where: '', price: 0, bought: true }])
  })
})

describe('addMinutes', () => {
  it('시간을 더하고 빼며 하루 안으로 자른다', () => {
    expect(addMinutes('11:40', 60)).toBe('12:40')
    expect(addMinutes('19:00', -120)).toBe('17:00')
    expect(addMinutes('23:30', 90)).toBe('23:59')
    expect(addMinutes('01:00', -120)).toBe('00:00')
  })
})

describe('dayAnchors', () => {
  const t = trip({
    stays: [
      stay({ id: 'a', name: 'A호텔', checkIn: '2026-11-05', checkOut: '2026-11-07' }),
      stay({ id: 'b', name: 'B게하', checkIn: '2026-11-07', checkOut: '2026-11-08' }),
    ],
  })
  it('도착일은 아침 숙소가 없고 밤 숙소만 있다', () => {
    const a = dayAnchors(t, '2026-11-05')
    expect(a.start).toBeUndefined()
    expect(a.end?.name).toBe('A호텔')
  })
  it('중간 날은 전날 밤 숙소에서 시작해 같은 숙소로 끝난다', () => {
    const a = dayAnchors(t, '2026-11-06')
    expect([a.start?.name, a.end?.name]).toEqual(['A호텔', 'A호텔'])
  })
  it('숙소를 옮기는 날은 이전 숙소에서 시작해 새 숙소에서 끝난다', () => {
    const a = dayAnchors(t, '2026-11-07')
    expect([a.start?.name, a.end?.name]).toEqual(['A호텔', 'B게하'])
  })
  it('마지막 날은 밤 숙소가 없다', () => {
    const a = dayAnchors(t, '2026-11-08')
    expect([a.start?.name, a.end]).toEqual(['B게하', undefined])
  })
})

describe('routeUrl', () => {
  const place = (id: string, date: string, p: string, over: Partial<Item> = {}): Item => ({ ...item(id, date), place: p, ...over })
  const t = trip({
    destination: '제주',
    stays: [stay({ name: '제주호텔', checkIn: '2026-11-05', checkOut: '2026-11-07' })],
    items: [place('a', '2026-11-06', '성산일출봉'), place('b', '2026-11-06', '우도'), place('c', '2026-11-06', '')],
  })
  const parse = (url: string) => new URL(url).searchParams

  it('숙소에서 출발해 장소들을 지나 숙소로 돌아오는 경로', () => {
    const r = routeUrl(t, '2026-11-06', { returnToStay: true })
    const q = parse(r!.url)
    expect(q.get('origin')).toBe('제주호텔 제주')
    expect(q.get('waypoints')).toBe('성산일출봉 제주|우도 제주')
    expect(q.get('destination')).toBe('제주호텔 제주')
    expect(r!.stops).toBe(4)
    expect(r!.truncated).toBe(false)
  })
  it('복귀를 끄면 마지막 장소가 도착지', () => {
    const q = parse(routeUrl(t, '2026-11-06')!.url)
    expect(q.get('destination')).toBe('우도 제주')
    expect(q.get('waypoints')).toBe('성산일출봉 제주')
  })
  it('장소가 없는 일정은 경로에서 빠지고, 장소가 하나도 없으면 null', () => {
    expect(routeUrl(t, '2026-11-05')).toBeNull()
    const none = trip({ items: [place('x', '2026-11-06', '')] })
    expect(routeUrl(none, '2026-11-06')).toBeNull()
  })
  it('완료한 일정은 남은 경로에서 제외', () => {
    const done = trip({ ...t, items: [place('a', '2026-11-06', '성산일출봉', { done: true }), place('b', '2026-11-06', '우도')] })
    const q = parse(routeUrl(done, '2026-11-06')!.url)
    expect(q.get('origin')).toBe('제주호텔 제주')
    expect(q.get('destination')).toBe('우도 제주')
    expect(q.get('waypoints')).toBeNull()
  })
  it('숙소가 없고 장소가 하나뿐이면 경로를 만들 수 없다', () => {
    expect(routeUrl(trip({ items: [place('a', '2026-11-06', '우도')] }), '2026-11-06')).toBeNull()
  })
  it('도착일은 첫 장소에서 시작해 밤 숙소에서 끝난다', () => {
    const arrive = trip({ ...t, items: [place('a', '2026-11-05', '용두암')] })
    const q = parse(routeUrl(arrive, '2026-11-05', { returnToStay: true })!.url)
    expect(q.get('origin')).toBe('용두암 제주')
    expect(q.get('destination')).toBe('제주호텔 제주')
  })
  it('이동이 없는 경로(숙소 → 같은 숙소)는 만들지 않는다', () => {
    const atHotel = trip({ ...t, items: [place('a', '2026-11-05', '제주호텔')] })
    expect(routeUrl(atHotel, '2026-11-05', { returnToStay: true })).toBeNull()
    // 숙소에서 출발해 같은 곳을 두 번 적어도 연속 중복은 합쳐진다
    const dup = trip({ ...t, items: [place('a', '2026-11-06', '우도'), place('b', '2026-11-06', '우도')] })
    expect(parse(routeUrl(dup, '2026-11-06')!.url).get('waypoints')).toBeNull()
    expect(routeUrl(dup, '2026-11-06')!.stops).toBe(2)
  })
  it('경유지가 너무 많으면 최대 개수까지만 넣고 알린다', () => {
    const many = trip({ destination: '제주', items: Array.from({ length: 14 }, (_, i) => place(`p${i}`, '2026-11-06', `장소${i}`)) })
    const r = routeUrl(many, '2026-11-06')!
    expect(parse(r.url).get('waypoints')!.split('|')).toHaveLength(MAX_WAYPOINTS)
    expect(r.truncated).toBe(true)
  })
  it('한글과 공백, 특수문자가 안전하게 인코딩된다', () => {
    const t2 = trip({ destination: '제주', items: [place('a', '2026-11-06', 'A&B 카페'), place('b', '2026-11-06', '카페 #2')] })
    const q = parse(routeUrl(t2, '2026-11-06')!.url)
    expect(q.get('origin')).toBe('A&B 카페 제주')
    expect(q.get('destination')).toBe('카페 #2 제주')
  })
})

describe('dayWindow', () => {
  const base = { startDate: '2026-11-05', endDate: '2026-11-08' }
  it('첫날 같은 날 도착: 도착 1시간 뒤부터', () => {
    const w = dayWindow({ ...base, flights: [flight({ departTime: '10:30', arriveTime: '11:40' })] }, '2026-11-05')
    expect(w).toMatchObject({ from: '12:40', to: '' })
    expect(w?.fromNote).toBe('도착 11:40 + 1시간')
  })
  it('마지막 날 같은 날 출발: 출발 2시간 전까지', () => {
    const ret = flight({ from: 'CJU', to: 'ICN', departDate: '2026-11-08', arriveDate: '2026-11-08', departTime: '19:00', arriveTime: '20:10' })
    const w = dayWindow({ ...base, flights: [ret] }, '2026-11-08')
    expect(w).toMatchObject({ from: '', to: '17:00' })
  })
  it('같은 날 출발·도착이라도 첫날의 출발, 마지막 날의 도착은 무시한다', () => {
    const out = flight({ departTime: '10:30', arriveTime: '11:40' })
    expect(dayWindow({ ...base, flights: [out] }, '2026-11-05')?.to).toBe('')
    const ret = flight({ departDate: '2026-11-08', arriveDate: '2026-11-08', departTime: '19:00', arriveTime: '20:10' })
    expect(dayWindow({ ...base, flights: [ret] }, '2026-11-08')?.from).toBe('')
  })
  it('다른 날 도착하는 항공은 도착일에, 출발은 출발일에 적용', () => {
    const red = flight({ departDate: '2026-11-05', departTime: '23:50', arriveDate: '2026-11-06', arriveTime: '06:10' })
    const f = { ...base, flights: [red] }
    expect(dayWindow(f, '2026-11-06')).toMatchObject({ from: '07:10', to: '' })
    expect(dayWindow(f, '2026-11-05')).toMatchObject({ from: '', to: '21:50' })
  })
  it('시간이 적힌 항공이 없거나 관련 없는 날은 null', () => {
    expect(dayWindow({ ...base, flights: [flight()] }, '2026-11-05')).toBeNull()
    expect(dayWindow({ ...base, flights: [flight({ departTime: '10:30', arriveTime: '11:40' })] }, '2026-11-06')).toBeNull()
    expect(dayWindow({ ...base, flights: [] }, '2026-11-05')).toBeNull()
  })
})

describe('duplicateTimes / dayWarnings', () => {
  it('같은 시간 일정을 묶는다 (시간 없는 건 제외)', () => {
    const items = [item('a', 'd', '10:00'), item('b', 'd', '10:00'), item('c', 'd', '11:00'), item('d', 'd'), item('e', 'd')]
    expect(duplicateTimes(items)).toEqual([{ time: '10:00', titles: ['a', 'b'] }])
  })
  it('도착 시간보다 이른 일정과 같은 시간 일정에 경고', () => {
    const t = trip({
      flights: [flight({ departTime: '10:30', arriveTime: '11:40' })],
      items: [item('성산', '2026-11-05', '11:00'), item('점심', '2026-11-05', '13:00'), item('카페', '2026-11-05', '13:00')],
    })
    const w = dayWarnings(t, '2026-11-05')
    expect(w).toHaveLength(2)
    expect(w[0]).toContain("'성산' 11:00")
    expect(w[0]).toContain('12:40 이후')
    expect(w[1]).toContain('13:00에 일정 2개가 겹쳐요')
  })
  it('출발 2시간 전 이후 일정에 경고하고, 완료한 일정은 무시한다', () => {
    const ret = flight({ departDate: '2026-11-08', arriveDate: '2026-11-08', departTime: '19:00', arriveTime: '20:10' })
    const t = trip({
      flights: [ret],
      items: [item('쇼핑', '2026-11-08', '18:00'), { ...item('식사', '2026-11-08', '18:30'), done: true }],
    })
    const w = dayWarnings(t, '2026-11-08')
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('17:00 전에 끝내는 게 좋아요')
  })
  it('문제가 없으면 빈 배열', () => {
    expect(dayWarnings(trip({ items: [item('a', '2026-11-06', '10:00')] }), '2026-11-06')).toEqual([])
  })
})

describe('placeSuggestions / ideaToItem', () => {
  it('그날의 숙소와 공항을 장소 후보로 만든다 (중복 제거)', () => {
    const t = trip({
      stays: [stay({ name: '제주호텔', checkIn: '2026-11-05', checkOut: '2026-11-07' })],
      flights: [flight({ from: '인천(ICN)', to: '제주(CJU)' })],
    })
    expect(placeSuggestions(t, '2026-11-05').map((x) => x.label)).toEqual(['숙소 · 제주호텔', '출발 · 인천(ICN)', '도착 · 제주(CJU)'])
    expect(placeSuggestions(t, '2026-11-06').map((x) => x.label)).toEqual(['숙소 · 제주호텔'])
    expect(placeSuggestions(trip(), '2026-11-06')).toEqual([])
  })
  it('후보지를 일정으로 옮기면 내용이 이어지고 새 id를 받는다', () => {
    const idea: Idea = { id: 'idea1', title: '우도', place: '우도 선착장', category: 'sight', note: '배 시간 확인', cost: 5000 }
    const it = ideaToItem(idea, '2026-11-06')
    expect(it).toMatchObject({ date: '2026-11-06', time: '', title: '우도', place: '우도 선착장', note: '배 시간 확인', cost: 5000, category: 'sight', done: false })
    expect(it.id).not.toBe('idea1')
  })
})

describe('formatItinerary (후보지·준비물)', () => {
  it('후보지와 준비물을 포함한다', () => {
    const t = trip({
      ideas: [{ id: 'i', title: '우도', place: '우도 선착장', category: 'sight', note: '', cost: 0 }],
      packing: [{ id: 'p', name: '여권', packed: true }, { id: 'q', name: '충전기', packed: false }],
    })
    const text = formatItinerary(t)
    expect(text).toContain('[후보지]')
    expect(text).toContain('- 우도 @ 우도 선착장')
    expect(text).toContain('✔ 여권')
    expect(text).toContain('- 충전기')
  })
})

describe('parseStore: 후보지·준비물', () => {
  it('없으면 빈 배열, 있으면 검증해서 읽는다', () => {
    const old = parseStore(JSON.stringify({ version: 1, trips: [{ id: 't', startDate: '2026-10-12', endDate: '2026-10-13' }] }))
    expect(old?.trips[0].ideas).toEqual([])
    expect(old?.trips[0].packing).toEqual([])
    const s = parseStore(
      JSON.stringify({
        version: 1,
        trips: [
          {
            id: 't',
            startDate: '2026-10-12',
            endDate: '2026-10-13',
            ideas: [{ id: 'i', title: '우도', category: 'weird', cost: -1 }, { id: 'bad' }],
            packing: [{ id: 'p', name: '여권', packed: true }, { name: 'no id' }],
          },
        ],
      }),
    )
    expect(s?.trips[0].ideas).toEqual([{ id: 'i', title: '우도', place: '', category: 'sight', note: '', cost: 0 }])
    expect(s?.trips[0].packing).toEqual([{ id: 'p', name: '여권', packed: true }])
  })
})

describe('weekdayOf / calendarWeeks', () => {
  it('요일을 구한다 (일=0)', () => {
    expect(weekdayOf('2026-11-08')).toBe(0)
    expect(weekdayOf('2026-11-05')).toBe(4)
    expect(weekdayOf('2028-02-29')).toBe(2)
  })
  it('일요일에 시작하는 1주 여행은 1행, 빈 칸이 없다', () => {
    const w = calendarWeeks('2026-11-08', '2026-11-14')
    expect(w).toHaveLength(1)
    expect(w[0]).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
  })
  it('목요일에 시작하는 4일 여행은 앞뒤를 빈 칸으로 채운 1행', () => {
    const w = calendarWeeks('2026-11-05', '2026-11-08')
    expect(w).toEqual([[null, null, null, null, '2026-11-05', '2026-11-06', '2026-11-07'], ['2026-11-08', null, null, null, null, null, null]])
  })
  it('주 시작에 맞춘 2주 여행은 2행', () => {
    expect(calendarWeeks('2026-11-08', '2026-11-21')).toHaveLength(2)
  })
  it('중간에 시작하는 2주 여행은 3행이고 모든 날짜가 정확히 한 번씩 들어간다', () => {
    const w = calendarWeeks('2026-11-05', '2026-11-18')
    expect(w).toHaveLength(3)
    const filled = w.flat().filter((d): d is string => d !== null)
    expect(filled).toEqual(eachDate('2026-11-05', '2026-11-18'))
    expect(w.every((row) => row.length === 7)).toBe(true)
  })
  it('월 경계를 넘어도 이어진다', () => {
    const filled = calendarWeeks('2026-10-30', '2026-11-03').flat().filter(Boolean)
    expect(filled).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'])
  })
  it('잘못된 기간은 빈 배열', () => {
    expect(calendarWeeks('2026-11-08', '2026-11-01')).toEqual([])
  })
})

describe('monthLabel', () => {
  it('같은 달 / 달이 바뀜 / 해가 바뀜', () => {
    expect(monthLabel('2026-11-05', '2026-11-18')).toBe('2026년 11월')
    expect(monthLabel('2026-11-28', '2026-12-04')).toBe('2026년 11월 ~ 12월')
    expect(monthLabel('2026-12-28', '2027-01-04')).toBe('2026년 12월 ~ 2027년 1월')
  })
})

describe('daySummary / todayString', () => {
  const t = trip({
    flights: [flight({ id: 'f1' }), flight({ id: 'f2', departDate: '2026-11-08', arriveDate: '2026-11-09' })],
    stays: [stay({ checkIn: '2026-11-05', checkOut: '2026-11-07' })],
    items: [item('a', '2026-11-05'), { ...item('b', '2026-11-05'), done: true }, item('c', '2026-11-06')],
  })
  it('그날의 일정 수, 완료 수, 항공, 체크인·체크아웃을 센다', () => {
    expect(daySummary(t, '2026-11-05')).toEqual({ items: 2, done: 1, flights: 1, checkIns: 1, checkOuts: 0 })
    expect(daySummary(t, '2026-11-07')).toEqual({ items: 0, done: 0, flights: 0, checkIns: 0, checkOuts: 1 })
  })
  it('출발과 도착이 다른 날이면 두 날 모두에 항공이 표시된다', () => {
    expect(daySummary(t, '2026-11-08').flights).toBe(1)
    expect(daySummary(t, '2026-11-09').flights).toBe(1)
  })
  it('아무것도 없는 날', () => {
    expect(daySummary(t, '2026-11-20')).toEqual({ items: 0, done: 0, flights: 0, checkIns: 0, checkOuts: 0 })
  })
  it('같은 날 출발·도착하는 항공은 한 번만 센다', () => {
    expect(daySummary(trip({ flights: [flight()] }), '2026-11-05').flights).toBe(1)
  })
  it('오늘 날짜를 현지 기준으로 만든다', () => {
    expect(todayString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayString(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
})

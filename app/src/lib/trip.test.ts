import { describe, expect, it } from 'vitest'
import type { Flight, Item, Stay, Trip } from '../types'
import { parseStore } from './storage'
import {
  MAX_TRIP_DAYS,
  budgetBreakdown,
  clampItems,
  completion,
  dateLabel,
  dayEvents,
  eachDate,
  formatItinerary,
  formatWon,
  groupRanges,
  makeRoundTrip,
  mapLinks,
  moveItem,
  nights,
  sortDayByTime,
  sortFlights,
  totalCost,
  uncoveredNights,
  validateDates,
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

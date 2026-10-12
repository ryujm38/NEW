import { describe, expect, it } from 'vitest'
import type { Item, Trip } from '../types'
import { parseStore } from './storage'
import {
  MAX_TRIP_DAYS,
  clampItems,
  dateLabel,
  eachDate,
  formatItinerary,
  formatWon,
  mapLinks,
  moveItem,
  sortDayByTime,
  totalCost,
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
    const trip: Trip = {
      id: 't',
      name: '제주 봄여행',
      destination: '제주',
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      budget: 0,
      createdAt: '',
      items: [{ ...item('a', '2026-10-12', '09:00', 15000), title: '아침식사', place: '해장국집', category: 'food' }],
    }
    const text = formatItinerary(trip)
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

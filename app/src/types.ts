export const CATEGORIES = {
  sight: '관광',
  food: '식사',
  move: '이동',
  stay: '숙소',
  etc: '기타',
} as const

export type Category = keyof typeof CATEGORIES

export interface Item {
  id: string
  /** yyyy-mm-dd */
  date: string
  /** HH:MM, 비어 있으면 시간 미정 */
  time: string
  title: string
  place: string
  note: string
  cost: number
  category: Category
  /** 여행 중에 소화한 일정은 체크해서 완료 처리한다 */
  done: boolean
}

export interface Flight {
  id: string
  /** 편명 (예: KE1201), 비워도 된다 */
  flightNo: string
  from: string
  to: string
  /** yyyy-mm-dd */
  departDate: string
  /** HH:MM, 비어 있으면 미정 */
  departTime: string
  /** yyyy-mm-dd, 출발일과 같으면 당일 도착 */
  arriveDate: string
  arriveTime: string
  cost: number
  note: string
}

export interface Stay {
  id: string
  name: string
  address: string
  /** yyyy-mm-dd */
  checkIn: string
  /** yyyy-mm-dd */
  checkOut: string
  /** 숙박 전체 금액 */
  cost: number
  note: string
}

export interface ShoppingItem {
  id: string
  name: string
  /** 구매처 */
  where: string
  /** 예상 가격 */
  price: number
  bought: boolean
}

export interface Trip {
  id: string
  name: string
  destination: string
  /** yyyy-mm-dd */
  startDate: string
  /** yyyy-mm-dd */
  endDate: string
  /** 0이면 예산 미설정 */
  budget: number
  /** 배열 순서가 하루 안의 표시 순서다 */
  items: Item[]
  flights: Flight[]
  stays: Stay[]
  shopping: ShoppingItem[]
  createdAt: string
}

export interface Store {
  version: 1
  trips: Trip[]
}

/** 여행 만들기·보기 단계. 순서가 곧 진행 순서다. */
export const STEPS = [
  { key: 'basic', label: '기본' },
  { key: 'flights', label: '항공' },
  { key: 'stays', label: '숙소' },
  { key: 'plan', label: '일정' },
  { key: 'shopping', label: '쇼핑' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

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

/** 아직 날짜를 정하지 않은 후보지. 일정에 넣으면 Item이 된다. */
export interface Idea {
  id: string
  title: string
  place: string
  category: Category
  note: string
  cost: number
}

export interface PackingItem {
  id: string
  name: string
  packed: boolean
}

/** 가계부 분류. 일정 분류(Category)와 항공·숙소·쇼핑을 합친 것이다. */
export const LEDGER_CATEGORIES = {
  flight: '항공',
  stay: '숙소',
  food: '식사',
  move: '교통',
  sight: '관광',
  shopping: '쇼핑',
  etc: '기타',
} as const

export type LedgerCategory = keyof typeof LEDGER_CATEGORIES

/** 여행 중에 실제로 쓴 돈 한 건 */
export interface Expense {
  id: string
  /** yyyy-mm-dd */
  date: string
  title: string
  category: LedgerCategory
  /** currency 단위의 금액 */
  amount: number
  /** 'KRW' 또는 여행의 현지 통화 */
  currency: string
  /** 기록할 때의 환율(1 currency = rate 원). 원화면 1. 나중에 환율이 바뀌어도 이 지출은 그대로다. */
  rate: number
  /** 계획에서 가져온 지출이면 원래 항목(항공·숙소·일정·쇼핑)의 id. 직접 입력이면 빈 문자열 */
  sourceId: string
}

export interface Trip {
  id: string
  name: string
  destination: string
  /** yyyy-mm-dd */
  startDate: string
  /** yyyy-mm-dd */
  endDate: string
  /** 나라 코드(ISO 3166-1 alpha-2). 'KR'이면 국내 여행 */
  country: string
  /** 0이면 예산 미설정. 원화 */
  budget: number
  /** 여행 인원. 1인당 비용 계산에 쓴다 */
  travelers: number
  /** 현지 통화 코드. 국내 여행이면 'KRW' */
  currency: string
  /** 1 currency = rate 원. 0이면 아직 모름 */
  rate: number
  /** 환율을 받아온(입력한) 시각 ISO. 모르면 빈 문자열 */
  rateUpdatedAt: string
  /** 'manual'(직접 입력) 또는 받아온 곳의 도메인. 모르면 빈 문자열 */
  rateSource: string
  /** 배열 순서가 하루 안의 표시 순서다 */
  items: Item[]
  flights: Flight[]
  stays: Stay[]
  shopping: ShoppingItem[]
  ideas: Idea[]
  packing: PackingItem[]
  expenses: Expense[]
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
  { key: 'prep', label: '준비' },
  { key: 'ledger', label: '가계부' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

/** 여행 안의 화면. 'overview'는 들어가자마자 보이는 캘린더, 나머지는 세부 단계. */
export type ViewKey = StepKey | 'overview'

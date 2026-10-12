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
  createdAt: string
}

export interface Store {
  version: 1
  trips: Trip[]
}

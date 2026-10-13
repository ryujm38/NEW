import type { Trip } from '../../types'
import { PackingList } from './PackingList'
import { ShoppingStep } from './ShoppingStep'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

/** 떠나기 전 준비물과 여행지에서 살 쇼핑 목록 */
export function PrepStep({ trip, onChange }: Props) {
  return (
    <section className="prep" aria-label="준비">
      <h2>준비</h2>
      <PackingList trip={trip} onChange={onChange} />
      <ShoppingStep trip={trip} onChange={onChange} />
    </section>
  )
}

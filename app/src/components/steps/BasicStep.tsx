import { clampItems } from '../../lib/trip'
import type { Trip } from '../../types'
import { BudgetSummary } from '../BudgetSummary'
import { TripForm } from '../TripForm'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
  /** 저장하고 다음 단계로 */
  onNext: () => void
}

export function BasicStep({ trip, onChange, onNext }: Props) {
  return (
    <section aria-label="기본 정보">
      <h2>기본 정보</h2>
      <TripForm
        initial={trip}
        submitLabel="저장하고 다음 →"
        onSubmit={(v) => {
          // 기간을 줄이면 범위 밖이 된 일정을 가장 가까운 날짜로 옮긴다.
          onChange((t) => ({ ...t, ...v, items: clampItems(t.items, v.startDate, v.endDate) }))
          onNext()
        }}
      />
      <BudgetSummary trip={trip} detailed />
    </section>
  )
}

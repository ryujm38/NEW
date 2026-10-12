import { budgetBreakdown, formatWon } from '../lib/trip'
import type { Trip } from '../types'

interface Props {
  trip: Trip
  /** true면 항목별 내역까지 보여준다 */
  detailed?: boolean
}

export function BudgetSummary({ trip, detailed }: Props) {
  const b = budgetBreakdown(trip)
  const over = trip.budget > 0 && b.total > trip.budget
  const percent = trip.budget > 0 ? Math.min(100, Math.round((b.total / trip.budget) * 100)) : 0

  return (
    <section className="card" aria-label="예산">
      <div className="budget-line">
        <span>예상 비용</span>
        <strong className={over ? 'over' : ''}>{formatWon(b.total)}</strong>
      </div>
      {trip.budget > 0 ? (
        <>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="예산 사용률">
            <div className={over ? 'fill over' : 'fill'} style={{ width: `${percent}%` }} />
          </div>
          <p className={over ? 'error' : 'muted'}>
            {over
              ? `예산(${formatWon(trip.budget)})을 ${formatWon(b.total - trip.budget)} 초과했어요.`
              : `예산 ${formatWon(trip.budget)} 중 ${percent}% · ${formatWon(trip.budget - b.total)} 남음`}
          </p>
        </>
      ) : (
        <p className="muted">'기본' 단계에서 총 예산을 입력하면 사용률을 보여 드려요.</p>
      )}
      {detailed && (
        <dl className="breakdown">
          <div>
            <dt>항공</dt>
            <dd>{formatWon(b.flights)}</dd>
          </div>
          <div>
            <dt>숙소</dt>
            <dd>{formatWon(b.stays)}</dd>
          </div>
          <div>
            <dt>일정</dt>
            <dd>{formatWon(b.activities)}</dd>
          </div>
          <div>
            <dt>쇼핑(예상)</dt>
            <dd>{formatWon(b.shopping)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}

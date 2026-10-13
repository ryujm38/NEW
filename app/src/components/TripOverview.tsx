import { actualTotal } from '../lib/ledger'
import { budgetBreakdown, formatWon } from '../lib/trip'
import type { StepKey, Trip } from '../types'
import { TripCalendar } from './TripCalendar'

interface Props {
  trip: Trip
  onOpen: (step: StepKey, day?: string) => void
  /** 도우미(Claude 등)에게 물어볼 때 붙여 넣을 요약 복사 */
  onCopyForAssistant: () => void
}

/** 여행에 들어가면 처음 보이는 화면: 기간만큼의 캘린더와 세부 페이지로 들어가는 입구. */
export function TripOverview({ trip, onOpen, onCopyForAssistant }: Props) {
  const total = budgetBreakdown(trip).total
  const prepCount = trip.shopping.length + trip.packing.length
  // 아직 아무것도 채우지 않은 새 여행
  const isEmpty = trip.flights.length === 0 && trip.stays.length === 0 && trip.items.length === 0

  const entries: { key: StepKey; label: string; value: string }[] = [
    { key: 'flights', label: '항공', value: trip.flights.length > 0 ? `${trip.flights.length}건` : '등록하기' },
    { key: 'stays', label: '숙소', value: trip.stays.length > 0 ? `${trip.stays.length}곳` : '등록하기' },
    { key: 'plan', label: '일정', value: trip.items.length > 0 ? `${trip.items.length}개 · 전체 보기` : '짜기' },
    { key: 'prep', label: '준비', value: prepCount > 0 ? `${prepCount}개` : '준비하기' },
    { key: 'ledger', label: '가계부', value: trip.expenses.length > 0 ? `지출 ${formatWon(actualTotal(trip.expenses))}` : '기록하기' },
    { key: 'basic', label: '기본 정보', value: total > 0 ? `예상 ${formatWon(total)}` : '수정' },
  ]

  return (
    <section aria-label="여행 개요">
      <TripCalendar trip={trip} onPick={(date) => onOpen('plan', date)} />
      <p className="muted">날짜를 누르면 그날 일정으로, 아래 버튼을 누르면 세부 페이지로 들어가요.</p>
      {isEmpty && (
        <div className="card guide" role="note">
          <strong>여행 준비를 시작해 볼까요?</strong>
          <p className="muted">항공권 → 숙소 → 일정 → 준비 순서로 채우면 편해요. 하나씩 건너뛰어도 돼요.</p>
          <button className="primary" onClick={() => onOpen('flights')}>
            항공권부터 등록하기
          </button>
        </div>
      )}
      <div className="entry-grid">
        {entries.map((e) => (
          <button key={e.key} className="entry" onClick={() => onOpen(e.key)}>
            <strong>{e.label}</strong>
            <span className="muted">{e.value}</span>
          </button>
        ))}
      </div>
      <div className="assist">
        <button className="ghost" onClick={onCopyForAssistant}>
          Claude에게 물어보기용 요약 복사
        </button>
        <p className="muted">나라·도시·숙소·일정을 한 번에 복사해요. 대화창에 붙여 넣고 궁금한 걸 이어서 물어보세요.</p>
      </div>
    </section>
  )
}

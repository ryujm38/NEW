import { useEffect, useState } from 'react'
import { eachDate, formatForAssistant, formatItinerary } from '../lib/trip'
import type { StepKey, Trip, ViewKey } from '../types'
import { BudgetSummary } from './BudgetSummary'
import { ConfirmButton } from './ConfirmButton'
import { BasicStep } from './steps/BasicStep'
import { FlightsStep } from './steps/FlightsStep'
import { LedgerStep } from './steps/LedgerStep'
import { PlanStep } from './steps/PlanStep'
import { PrepStep } from './steps/PrepStep'
import { StaysStep } from './steps/StaysStep'
import { StepNav } from './StepNav'
import { Stepper } from './Stepper'
import { TripOverview } from './TripOverview'

interface Props {
  trip: Trip
  /** 'overview'면 캘린더, 아니면 세부 단계 */
  view: ViewKey
  /** 일정 화면에서 바로 보여줄 날짜 */
  day?: string
  onView: (view: ViewKey, day?: string) => void
  onChange: (fn: (t: Trip) => Trip) => void
  onBack: () => void
  onDelete: () => void
}

export function TripView({ trip, view, day, onView, onChange, onBack, onDelete }: Props) {
  const [notice, setNotice] = useState('')
  // 공유 시트와 클립보드가 모두 막혔을 때 직접 복사할 수 있게 보여주는 텍스트
  const [shareText, setShareText] = useState<string | null>(null)

  // 화면을 옮기면 맨 위에서 시작한다. 특정 날짜로 가는 경우에는 일정 화면이 그 날짜로 스크롤한다.
  useEffect(() => {
    if (!day) window.scrollTo({ top: 0 })
  }, [view, day])

  // 공유 시트(지원하면) → 클립보드 → 직접 복사할 수 있는 글상자 순서로 시도한다.
  const deliver = async (text: string, copiedMessage: string, useShareSheet: boolean) => {
    try {
      if (useShareSheet && navigator.share) {
        await navigator.share({ title: trip.name, text })
        return
      }
    } catch (e) {
      // 사용자가 공유 창을 닫은 경우는 오류로 보지 않는다. 그 외(권한 거부 등)는 복사로 넘어간다.
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareText(null)
      setNotice(copiedMessage)
    } catch {
      setShareText(text)
      setNotice('자동 복사가 막혀 있어요. 아래 내용을 직접 복사해 주세요.')
    }
  }
  const share = () => deliver(formatItinerary(trip), '일정을 클립보드에 복사했어요.', true)
  const copyForAssistant = () => deliver(formatForAssistant(trip), '물어보기용 요약을 복사했어요. 대화창에 붙여 넣고 궁금한 걸 이어서 물어보세요.', false)

  const days = eachDate(trip.startDate, trip.endDate).length
  const emptyStep: Record<StepKey, boolean> = {
    basic: false,
    flights: trip.flights.length === 0,
    stays: trip.stays.length === 0,
    plan: trip.items.length === 0,
    prep: trip.shopping.length === 0 && trip.packing.length === 0,
    ledger: trip.expenses.length === 0,
  }
  const step = view === 'overview' ? null : view

  return (
    <main className="page">
      <header className="topbar">
        {step ? (
          <button className="ghost" onClick={() => onView('overview')} aria-label="캘린더로">
            ← 캘린더
          </button>
        ) : (
          <button className="ghost" onClick={onBack} aria-label="여행 목록으로">
            ← 목록
          </button>
        )}
        <div className="topbar-actions">
          <button className="ghost" onClick={share}>
            공유
          </button>
          <ConfirmButton label="삭제" prompt="이 여행을 삭제할까요? 되돌릴 수 없어요." onConfirm={onDelete} />
        </div>
      </header>

      <h1>{trip.name}</h1>
      <p className="muted">
        {trip.destination} · {trip.startDate} ~ {trip.endDate} ({days}일)
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
      {notice && <p className="notice">{notice}</p>}
      {shareText && (
        <textarea className="export-box" readOnly rows={8} value={shareText} aria-label="공유할 일정 텍스트" onFocus={(e) => e.currentTarget.select()} />
      )}

      {!step && <TripOverview trip={trip} onOpen={(s, d) => onView(s, d)} onCopyForAssistant={copyForAssistant} />}

      {step && (
        <>
          <Stepper trip={trip} step={step} onStep={(s) => onView(s)} />
          {step !== 'basic' && step !== 'plan' && step !== 'ledger' && <BudgetSummary trip={trip} />}

          {step === 'basic' && <BasicStep trip={trip} onChange={onChange} onNext={() => onView('flights')} />}
          {step === 'flights' && <FlightsStep trip={trip} onChange={onChange} />}
          {step === 'stays' && <StaysStep trip={trip} onChange={onChange} />}
          {step === 'plan' && <PlanStep trip={trip} onChange={onChange} focusDay={day} />}
          {step === 'prep' && <PrepStep trip={trip} onChange={onChange} />}
          {step === 'ledger' && <LedgerStep trip={trip} onChange={onChange} />}

          {step !== 'basic' && <StepNav step={step} onStep={(s) => onView(s)} empty={emptyStep[step]} />}
        </>
      )}
    </main>
  )
}

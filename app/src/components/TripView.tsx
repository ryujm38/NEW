import { useEffect, useState } from 'react'
import { eachDate, formatItinerary } from '../lib/trip'
import type { StepKey, Trip } from '../types'
import { BudgetSummary } from './BudgetSummary'
import { ConfirmButton } from './ConfirmButton'
import { BasicStep } from './steps/BasicStep'
import { FlightsStep } from './steps/FlightsStep'
import { PlanStep } from './steps/PlanStep'
import { ShoppingStep } from './steps/ShoppingStep'
import { StaysStep } from './steps/StaysStep'
import { StepNav } from './StepNav'
import { Stepper } from './Stepper'

interface Props {
  trip: Trip
  step: StepKey
  onStep: (step: StepKey) => void
  onChange: (fn: (t: Trip) => Trip) => void
  onBack: () => void
  onDelete: () => void
}

export function TripView({ trip, step, onStep, onChange, onBack, onDelete }: Props) {
  const [notice, setNotice] = useState('')
  // 공유 시트와 클립보드가 모두 막혔을 때 직접 복사할 수 있게 보여주는 텍스트
  const [shareText, setShareText] = useState<string | null>(null)

  // 단계를 옮기면 맨 위에서 시작한다.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const share = async () => {
    const text = formatItinerary(trip)
    try {
      if (navigator.share) {
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
      setNotice('일정을 클립보드에 복사했어요.')
    } catch {
      setShareText(text)
      setNotice('자동 복사가 막혀 있어요. 아래 내용을 직접 복사해 주세요.')
    }
  }

  const days = eachDate(trip.startDate, trip.endDate).length
  const emptyStep: Record<StepKey, boolean> = {
    basic: false,
    flights: trip.flights.length === 0,
    stays: trip.stays.length === 0,
    plan: trip.items.length === 0,
    shopping: trip.shopping.length === 0,
  }

  return (
    <main className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack} aria-label="여행 목록으로">
          ← 목록
        </button>
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

      <Stepper trip={trip} step={step} onStep={onStep} />
      {step !== 'basic' && <BudgetSummary trip={trip} />}

      {step === 'basic' && <BasicStep trip={trip} onChange={onChange} onNext={() => onStep('flights')} />}
      {step === 'flights' && <FlightsStep trip={trip} onChange={onChange} />}
      {step === 'stays' && <StaysStep trip={trip} onChange={onChange} />}
      {step === 'plan' && <PlanStep trip={trip} onChange={onChange} />}
      {step === 'shopping' && <ShoppingStep trip={trip} onChange={onChange} />}

      {step !== 'basic' && <StepNav step={step} onStep={onStep} empty={emptyStep[step]} />}
    </main>
  )
}

import { useEffect, useRef } from 'react'
import { STEPS, type StepKey, type Trip } from '../types'

function count(trip: Trip, key: StepKey): number {
  switch (key) {
    case 'flights':
      return trip.flights.length
    case 'stays':
      return trip.stays.length
    case 'plan':
      return trip.items.length
    case 'shopping':
      return trip.shopping.length
    default:
      return 0
  }
}

interface Props {
  trip: Trip
  step: StepKey
  onStep: (step: StepKey) => void
}

/** 계획 단계 탭. 순서대로 진행해도 되고, 아무 탭이나 눌러 바로 수정해도 된다. */
export function Stepper({ trip, step, onStep }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null)

  // 아주 좁은 화면에서 탭이 넘칠 때도 현재 단계가 보이도록 가로로만 스크롤한다.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [step])

  return (
    <nav aria-label="여행 계획 단계">
      <ol className="stepper">
        {STEPS.map((s, i) => {
          const n = count(trip, s.key)
          const active = s.key === step
          const filled = s.key === 'basic' || n > 0
          return (
            <li key={s.key}>
              <button
                ref={active ? activeRef : undefined}
                className={`step${active ? ' active' : ''}${filled ? ' filled' : ''}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => onStep(s.key)}
              >
                <span className="step-no" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="step-label">{s.label}</span>
                {n > 0 && <span className="step-count">{n}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

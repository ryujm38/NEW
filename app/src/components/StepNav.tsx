import { STEPS, type StepKey } from '../types'

interface Props {
  step: StepKey
  onStep: (step: StepKey) => void
  /** 이 단계에 입력한 게 없으면 '건너뛰기'로 보여준다 */
  empty?: boolean
}

export function StepNav({ step, onStep, empty }: Props) {
  const i = STEPS.findIndex((s) => s.key === step)
  const prev = STEPS[i - 1]
  const next = STEPS[i + 1]

  return (
    <div className="step-nav">
      {empty && next && <p className="muted">비워 두고 넘어가도 돼요. 나중에 위쪽 탭에서 언제든 추가할 수 있어요.</p>}
      <div className="row actions between">
        {prev ? (
          <button className="ghost" onClick={() => onStep(prev.key)}>
            ← {prev.label}
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button className="primary" onClick={() => onStep(next.key)}>
            {empty ? '건너뛰기' : '다음'}: {next.label} →
          </button>
        ) : (
          <button className="primary" onClick={() => onStep('plan')}>
            일정 보기
          </button>
        )}
      </div>
    </div>
  )
}

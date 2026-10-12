import { useState } from 'react'

interface Props {
  label: string
  prompt: string
  confirmLabel?: string
  onConfirm: () => void
}

/** window.confirm 대신 쓰는 인라인 2단계 확인. 일부 환경(임베디드 뷰어)에서는 confirm()이 항상 false라서 쓰지 않는다. */
export function ConfirmButton({ label, prompt, confirmLabel = '삭제', onConfirm }: Props) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button className="ghost danger" onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="confirm" role="group" aria-label={prompt}>
      <span className="confirm-text">{prompt}</span>
      <button className="ghost" onClick={() => setArmed(false)} autoFocus>
        취소
      </button>
      <button
        className="danger-solid"
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
    </span>
  )
}

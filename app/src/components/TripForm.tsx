import { useState } from 'react'
import { validateDates } from '../lib/trip'

export interface TripFormValues {
  name: string
  destination: string
  startDate: string
  endDate: string
  budget: number
}

interface Props {
  initial?: TripFormValues
  submitLabel: string
  onSubmit: (values: TripFormValues) => void
  onCancel: () => void
}

export function TripForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [destination, setDestination] = useState(initial?.destination ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [budget, setBudget] = useState(initial?.budget ? String(initial.budget) : '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const dateError = validateDates(startDate, endDate)
    if (!destination.trim()) return setError('여행지를 입력해 주세요.')
    if (dateError) return setError(dateError)
    const budgetNum = budget === '' ? 0 : Number(budget)
    if (!Number.isFinite(budgetNum) || budgetNum < 0) return setError('예산은 0 이상의 숫자로 입력해 주세요.')
    onSubmit({
      name: name.trim() || `${destination.trim()} 여행`,
      destination: destination.trim(),
      startDate,
      endDate,
      budget: budgetNum,
    })
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        여행지
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="예: 제주, 도쿄" autoFocus />
      </label>
      <label>
        여행 이름 (선택)
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="비워 두면 '여행지 여행'" />
      </label>
      <div className="row">
        <label>
          출발일
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
            }}
          />
        </label>
        <label>
          도착일
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <label>
        총 예산 (원, 선택)
        <input type="number" inputMode="numeric" min="0" step="1000" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row actions">
        <button type="button" className="ghost" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

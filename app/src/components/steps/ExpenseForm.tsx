import { useState } from 'react'
import { toKrw } from '../../lib/fx'
import { rateForExpense } from '../../lib/ledger'
import { formatWon, newId } from '../../lib/trip'
import { LEDGER_CATEGORIES, type Expense, type LedgerCategory, type Trip } from '../../types'

interface Props {
  trip: Pick<Trip, 'currency' | 'rate'>
  initial?: Expense
  defaultDate: string
  submitLabel: string
  /** 추가 모드: 저장하고 나서도 입력창을 열어 두고 내용·금액만 비운다(연속 입력) */
  keepOpen?: boolean
  onSubmit: (expense: Expense) => void
  onCancel: () => void
}

export function ExpenseForm({ trip, initial, defaultDate, submitLabel, keepOpen, onSubmit, onCancel }: Props) {
  const foreignCode = trip.currency !== 'KRW' ? trip.currency : null
  const [title, setTitle] = useState(initial?.title ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? foreignCode ?? 'KRW')
  const [category, setCategory] = useState<LedgerCategory>(initial?.category ?? 'food')
  const [date, setDate] = useState(initial?.date ?? defaultDate)
  const [krwPaid, setKrwPaid] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 이미 기록한 외화 지출을 고칠 때는 기록 당시 환율을 그대로 쓴다.
  const sameAsInitial = initial !== undefined && initial.currency === currency
  const amountNum = Number(amount)
  const paidNum = krwPaid === '' ? 0 : Number(krwPaid)
  const resolvedRate = (): number | null => {
    if (paidNum > 0 && amountNum > 0 && currency !== 'KRW') return paidNum / amountNum
    return sameAsInitial && initial ? initial.rate : rateForExpense(currency, amountNum, 0, trip.rate)
  }
  const rate = resolvedRate()
  const foreign = currency !== 'KRW'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('내용을 입력해 주세요.')
    if (!Number.isFinite(amountNum) || amountNum <= 0) return setError('금액은 0보다 큰 숫자로 입력해 주세요.')
    if (!date) return setError('날짜를 입력해 주세요.')
    if (krwPaid !== '' && (!Number.isFinite(paidNum) || paidNum <= 0)) return setError('카드 청구 금액은 0보다 큰 숫자로 입력해 주세요.')
    if (rate === null) return setError('환율을 먼저 입력해 주세요. 위쪽 환율 칸에서 받아오거나 직접 입력할 수 있어요.')
    setError(null)
    onSubmit({ id: initial?.id ?? newId(), date, title: title.trim(), category, amount: amountNum, currency, rate, sourceId: initial?.sourceId ?? '' })
    if (keepOpen) {
      setTitle('')
      setAmount('')
      setKrwPaid('')
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      <label>
        내용
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 라멘, 지하철, 기념품" autoFocus />
      </label>
      <div className="row">
        <label>
          금액
          <input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {foreignCode && (
          <label>
            통화
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value={foreignCode}>{foreignCode}</option>
              <option value="KRW">KRW (원)</option>
            </select>
          </label>
        )}
      </div>
      {foreign && amountNum > 0 && (
        <p className="muted" aria-live="polite">
          {rate ? `≈ ${formatWon(toKrw(amountNum, rate))}` : '환율을 먼저 입력해 주세요.'}
        </p>
      )}
      <div className="row">
        <label>
          분류
          <select value={category} onChange={(e) => setCategory(e.target.value as LedgerCategory)}>
            {Object.entries(LEDGER_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          날짜
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {foreign && (
        <label>
          카드 청구 금액 (원, 아는 경우)
          <input type="number" inputMode="numeric" min="0" value={krwPaid} onChange={(e) => setKrwPaid(e.target.value)} />
          <span className="hint">알면 이 금액으로 정확한 환율을 계산해서 기록해요.</span>
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row actions">
        <button type="button" className="ghost" onClick={onCancel}>
          {keepOpen ? '닫기' : '취소'}
        </button>
        <button type="submit" className="primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

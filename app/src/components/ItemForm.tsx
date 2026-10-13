import { useState } from 'react'
import type { PlaceSuggestion } from '../lib/trip'
import type { Category, Item } from '../types'
import { CATEGORIES } from '../types'

export type ItemValues = Pick<Item, 'time' | 'title' | 'place' | 'note' | 'cost' | 'category'>

interface Props {
  initial?: ItemValues
  submitLabel: string
  /** 등록한 숙소·공항 등을 눌러서 장소로 채우는 후보 */
  suggestions?: PlaceSuggestion[]
  /** 후보지처럼 시간이 없는 항목에서는 시간 입력을 숨긴다 */
  hideTime?: boolean
  onSubmit: (values: ItemValues) => void
  onCancel: () => void
}

export function ItemForm({ initial, submitLabel, suggestions, hideTime, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [place, setPlace] = useState(initial?.place ?? '')
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost) : '')
  const [category, setCategory] = useState<Category>(initial?.category ?? 'sight')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('일정 제목을 입력해 주세요.')
    const costNum = cost === '' ? 0 : Number(cost)
    if (!Number.isFinite(costNum) || costNum < 0) return setError('비용은 0 이상의 숫자로 입력해 주세요.')
    onSubmit({ title: title.trim(), time, place: place.trim(), note: note.trim(), cost: costNum, category })
  }

  return (
    <form className="form item-form" onSubmit={submit}>
      <label>
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 성산일출봉" autoFocus />
      </label>
      <div className="row">
        {!hideTime && (
          <label>
            시간
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        )}
        <label>
          분류
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        장소 (지도 링크에 사용)
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="예: 성산일출봉 매표소" />
      </label>
      {suggestions && suggestions.length > 0 && (
        <div className="chips" role="group" aria-label="등록한 숙소·공항에서 불러오기">
          <span className="muted">불러오기</span>
          {suggestions.map((sg) => (
            <button type="button" className="chip" key={sg.place} onClick={() => setPlace(sg.place)}>
              {sg.label}
            </button>
          ))}
        </div>
      )}
      <label>
        비용 (원)
        <input type="number" inputMode="numeric" min="0" step="100" value={cost} onChange={(e) => setCost(e.target.value)} />
      </label>
      <label>
        메모
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
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

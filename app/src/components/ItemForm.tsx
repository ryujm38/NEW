import { useState } from 'react'
import type { Category, Item } from '../types'
import { CATEGORIES } from '../types'

export type ItemValues = Pick<Item, 'time' | 'title' | 'place' | 'note' | 'cost' | 'category'>

interface Props {
  initial?: ItemValues
  submitLabel: string
  onSubmit: (values: ItemValues) => void
  onCancel: () => void
}

export function ItemForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
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
        <label>
          시간
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
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

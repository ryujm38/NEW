import { useState } from 'react'
import { dateLabel, formatWon, ideaToItem, newId } from '../lib/trip'
import type { Idea, Trip } from '../types'
import { CATEGORIES } from '../types'
import { ConfirmButton } from './ConfirmButton'
import { ItemForm, type ItemValues } from './ItemForm'
import { QuickAdd } from './QuickAdd'

interface Props {
  trip: Trip
  dates: string[]
  onChange: (fn: (t: Trip) => Trip) => void
}

function IdeaCard({ idea, dates, onMove, onEdit, onRemove }: { idea: Idea; dates: string[]; onMove: (date: string) => void; onEdit: () => void; onRemove: () => void }) {
  const [date, setDate] = useState(dates[0] ?? '')
  const value = dates.includes(date) ? date : (dates[0] ?? '')

  return (
    <>
      <div className="item-body">
        <strong>{idea.title}</strong>
        <span className={`tag tag-${idea.category}`}>{CATEGORIES[idea.category]}</span>
        {idea.place && <div className="muted">📍 {idea.place}</div>}
        {idea.note && <div className="muted note">{idea.note}</div>}
        {idea.cost > 0 && <div className="cost">{formatWon(idea.cost)}</div>}
      </div>
      <div className="item-actions">
        <select className="day-select" aria-label={`${idea.title} 넣을 날짜`} value={value} onChange={(e) => setDate(e.target.value)}>
          {dates.map((d, i) => (
            <option key={d} value={d}>
              Day {i + 1} · {dateLabel(d)}
            </option>
          ))}
        </select>
        <button className="primary" onClick={() => onMove(value)} disabled={!value}>
          일정에 넣기
        </button>
        <span className="spacer" />
        <button className="ghost" onClick={onEdit}>
          수정
        </button>
        <ConfirmButton label="삭제" prompt={`'${idea.title}' 삭제?`} onConfirm={onRemove} />
      </div>
    </>
  )
}

/** 날짜를 정하기 전에 가고 싶은 곳을 모아 두는 곳. 날짜를 골라 일정으로 옮긴다. */
export function IdeasPanel({ trip, dates, onChange }: Props) {
  const [editing, setEditing] = useState<string | null>(null)

  const move = (idea: Idea, date: string) =>
    onChange((t) => ({ ...t, ideas: t.ideas.filter((i) => i.id !== idea.id), items: [...t.items, ideaToItem(idea, date)] }))

  const save = (id: string, v: ItemValues) => {
    onChange((t) => ({
      ...t,
      ideas: t.ideas.map((i) => (i.id === id ? { ...i, title: v.title, place: v.place, note: v.note, cost: v.cost, category: v.category } : i)),
    }))
    setEditing(null)
  }

  return (
    <section className="ideas" aria-label="후보지 보관함">
      <h3>
        후보지 보관함 <span className="muted">{trip.ideas.length}</span>
      </h3>
      <p className="muted">가고 싶은 곳을 먼저 모아 두고, 날짜를 골라 일정에 넣으세요. 넣으면 보관함에서는 빠져요.</p>

      <QuickAdd
        label="후보지 이름"
        placeholder="가고 싶은 곳"
        onAdd={(title) =>
          onChange((t) => ({ ...t, ideas: [...t.ideas, { id: newId(), title, place: '', category: 'sight', note: '', cost: 0 }] }))
        }
      />

      <ul className="items">
        {trip.ideas.map((idea) => (
          <li key={idea.id} className="card item">
            {editing === idea.id ? (
              <ItemForm
                initial={{ ...idea, time: '' }}
                hideTime
                submitLabel="저장"
                onCancel={() => setEditing(null)}
                onSubmit={(v) => save(idea.id, v)}
              />
            ) : (
              <IdeaCard
                idea={idea}
                dates={dates}
                onMove={(date) => move(idea, date)}
                onEdit={() => setEditing(idea.id)}
                onRemove={() => onChange((t) => ({ ...t, ideas: t.ideas.filter((i) => i.id !== idea.id) }))}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

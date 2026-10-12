import { useState } from 'react'
import {
  clampItems,
  dateLabel,
  eachDate,
  formatItinerary,
  formatWon,
  itemsForDate,
  mapLinks,
  moveItem,
  newId,
  sortDayByTime,
  totalCost,
} from '../lib/trip'
import type { Trip } from '../types'
import { CATEGORIES } from '../types'
import { ConfirmButton } from './ConfirmButton'
import { ItemForm, type ItemValues } from './ItemForm'
import { TripForm } from './TripForm'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
  onBack: () => void
  onDelete: () => void
}

export function TripView({ trip, onChange, onBack, onDelete }: Props) {
  const [editingTrip, setEditingTrip] = useState(false)
  // 'new:<date>' 이면 해당 날짜에 추가 중, 그 외에는 수정 중인 item id
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  // 공유 시트와 클립보드가 모두 막혔을 때 직접 복사할 수 있게 보여주는 텍스트
  const [shareText, setShareText] = useState<string | null>(null)

  const dates = eachDate(trip.startDate, trip.endDate)
  const total = totalCost(trip.items)
  const overBudget = trip.budget > 0 && total > trip.budget
  const percent = trip.budget > 0 ? Math.min(100, Math.round((total / trip.budget) * 100)) : 0

  const addItem = (date: string, v: ItemValues) => {
    onChange((t) => ({ ...t, items: [...t.items, { id: newId(), date, ...v }] }))
    setEditing(null)
  }
  const saveItem = (id: string, v: ItemValues) => {
    onChange((t) => ({ ...t, items: t.items.map((i) => (i.id === id ? { ...i, ...v } : i)) }))
    setEditing(null)
  }
  const removeItem = (id: string) => {
    onChange((t) => ({ ...t, items: t.items.filter((i) => i.id !== id) }))
  }

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
          <button className="ghost" onClick={() => setEditingTrip((v) => !v)}>
            수정
          </button>
          <ConfirmButton label="삭제" prompt="이 여행을 삭제할까요? 되돌릴 수 없어요." onConfirm={onDelete} />
        </div>
      </header>

      <h1>{trip.name}</h1>
      <p className="muted">
        {trip.destination} · {trip.startDate} ~ {trip.endDate} ({dates.length}일)
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
      {notice && <p className="notice">{notice}</p>}
      {shareText && (
        <textarea className="export-box" readOnly rows={8} value={shareText} aria-label="공유할 일정 텍스트" onFocus={(e) => e.currentTarget.select()} />
      )}

      {editingTrip && (
        <TripForm
          initial={trip}
          submitLabel="저장"
          onCancel={() => setEditingTrip(false)}
          onSubmit={(v) => {
            onChange((t) => ({ ...t, ...v, items: clampItems(t.items, v.startDate, v.endDate) }))
            setEditingTrip(false)
          }}
        />
      )}

      <section className="card" aria-label="예산">
        <div className="budget-line">
          <span>예상 비용</span>
          <strong className={overBudget ? 'over' : ''}>{formatWon(total)}</strong>
        </div>
        {trip.budget > 0 ? (
          <>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="예산 사용률">
              <div className={overBudget ? 'fill over' : 'fill'} style={{ width: `${percent}%` }} />
            </div>
            <p className={overBudget ? 'error' : 'muted'}>
              {overBudget
                ? `예산(${formatWon(trip.budget)})을 ${formatWon(total - trip.budget)} 초과했어요.`
                : `예산 ${formatWon(trip.budget)} 중 ${percent}% · ${formatWon(trip.budget - total)} 남음`}
            </p>
          </>
        ) : (
          <p className="muted">수정 메뉴에서 총 예산을 입력하면 사용률을 보여 드려요.</p>
        )}
      </section>

      <div className="days">
      {dates.map((date, idx) => {
        const day = itemsForDate(trip.items, date)
        const adding = editing === `new:${date}`
        return (
          <section className="day" key={date} aria-label={`${idx + 1}일차`}>
            <div className="day-head">
              <h2>
                Day {idx + 1} <span className="muted">{dateLabel(date)}</span>
              </h2>
              <span className="muted">{formatWon(totalCost(day))}</span>
            </div>

            {day.length === 0 && !adding && <p className="muted empty">아직 일정이 없어요.</p>}

            <ul className="items">
              {day.map((item, i) => {
                const links = mapLinks(item, trip.destination)
                return (
                  <li key={item.id} className="card item">
                    {editing === item.id ? (
                      <ItemForm initial={item} submitLabel="저장" onCancel={() => setEditing(null)} onSubmit={(v) => saveItem(item.id, v)} />
                    ) : (
                      <>
                        <div className="item-main">
                          <span className="time">{item.time || '--:--'}</span>
                          <div className="item-body">
                            <strong>{item.title}</strong>
                            <span className={`tag tag-${item.category}`}>{CATEGORIES[item.category]}</span>
                            {item.place && <div className="muted">📍 {item.place}</div>}
                            {item.note && <div className="muted note">{item.note}</div>}
                            {item.cost > 0 && <div className="cost">{formatWon(item.cost)}</div>}
                          </div>
                        </div>
                        <div className="item-actions">
                          <a href={links.naver} target="_blank" rel="noreferrer noopener">
                            네이버지도
                          </a>
                          <a href={links.google} target="_blank" rel="noreferrer noopener">
                            구글지도
                          </a>
                          <span className="spacer" />
                          <button className="icon" aria-label={`${item.title} 위로`} disabled={i === 0} onClick={() => onChange((t) => ({ ...t, items: moveItem(t.items, item.id, -1) }))}>
                            ↑
                          </button>
                          <button className="icon" aria-label={`${item.title} 아래로`} disabled={i === day.length - 1} onClick={() => onChange((t) => ({ ...t, items: moveItem(t.items, item.id, 1) }))}>
                            ↓
                          </button>
                          <button className="ghost" onClick={() => setEditing(item.id)}>
                            수정
                          </button>
                          <ConfirmButton label="삭제" prompt={`'${item.title}' 삭제?`} onConfirm={() => removeItem(item.id)} />
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>

            {adding ? (
              <div className="card">
                <ItemForm submitLabel="추가" onCancel={() => setEditing(null)} onSubmit={(v) => addItem(date, v)} />
              </div>
            ) : (
              <div className="row actions">
                <button className="ghost" onClick={() => setEditing(`new:${date}`)}>
                  + 일정 추가
                </button>
                {day.length > 1 && (
                  <button className="ghost" onClick={() => onChange((t) => ({ ...t, items: sortDayByTime(t.items, date) }))}>
                    시간순 정렬
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}
      </div>
    </main>
  )
}

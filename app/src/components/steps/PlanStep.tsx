import { useState } from 'react'
import {
  completion,
  dateLabel,
  dayEvents,
  eachDate,
  formatWon,
  itemsForDate,
  mapLinks,
  moveItem,
  newId,
  sortDayByTime,
  totalCost,
} from '../../lib/trip'
import type { Trip } from '../../types'
import { CATEGORIES } from '../../types'
import { ConfirmButton } from '../ConfirmButton'
import { ItemForm, type ItemValues } from '../ItemForm'
import { QuickAdd } from '../QuickAdd'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

export function PlanStep({ trip, onChange }: Props) {
  // 'new:<date>' 이면 해당 날짜에 자세히 추가 중, 그 외에는 수정 중인 item id
  const [editing, setEditing] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)

  const dates = eachDate(trip.startDate, trip.endDate)
  const all = completion(trip.items)

  const addItem = (date: string, v: ItemValues) => {
    onChange((t) => ({ ...t, items: [...t.items, { id: newId(), date, done: false, ...v }] }))
    setEditing(null)
  }
  const quickAdd = (date: string, title: string) =>
    addItem(date, { title, time: '', place: '', note: '', cost: 0, category: 'sight' })

  const saveItem = (id: string, v: ItemValues) => {
    onChange((t) => ({ ...t, items: t.items.map((i) => (i.id === id ? { ...i, ...v } : i)) }))
    setEditing(null)
  }
  const toggleDone = (id: string) =>
    onChange((t) => ({ ...t, items: t.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }))

  return (
    <section aria-label="일정">
      <h2>일정</h2>
      <div className="plan-head">
        <p className="muted">
          {all.total > 0 ? `전체 ${all.total}개 중 ${all.done}개 완료` : '이름만 적고 Enter를 누르면 바로 추가돼요. 시간·장소·비용은 나중에 채워도 돼요.'}
        </p>
        {all.done > 0 && (
          <label className="switch">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            완료한 일정 숨기기
          </label>
        )}
      </div>

      <div className="days">
        {dates.map((date, idx) => {
          const day = itemsForDate(trip.items, date)
          const events = dayEvents(trip, date)
          const visible = hideDone ? day.filter((i) => !i.done) : day
          const progress = completion(day)
          const adding = editing === `new:${date}`
          return (
            <section className="day" key={date} aria-label={`${idx + 1}일차`}>
              <div className="day-head">
                <h3>
                  Day {idx + 1} <span className="muted">{dateLabel(date)}</span>
                </h3>
                <span className="muted">
                  {progress.total > 0 && `${progress.done}/${progress.total} 완료 · `}
                  {formatWon(totalCost(day))}
                </span>
              </div>

              {events.length > 0 && (
                <ul className="events" aria-label="항공·숙소 자동 일정">
                  {events.map((e, i) => (
                    <li key={i} className={`event event-${e.kind}`}>
                      <span className="time">{e.time || '--:--'}</span>
                      <span>{e.label}</span>
                    </li>
                  ))}
                </ul>
              )}

              {day.length === 0 && events.length === 0 && !adding && <p className="muted empty">아직 일정이 없어요.</p>}
              {day.length > 0 && visible.length === 0 && <p className="muted empty">이 날 일정을 모두 마쳤어요.</p>}

              <ul className="items">
                {visible.map((item, i) => {
                  const links = mapLinks(item, trip.destination)
                  return (
                    <li key={item.id} className={`card item${item.done ? ' done' : ''}`}>
                      {editing === item.id ? (
                        <ItemForm initial={item} submitLabel="저장" onCancel={() => setEditing(null)} onSubmit={(v) => saveItem(item.id, v)} />
                      ) : (
                        <>
                          <div className="item-main">
                            <input
                              type="checkbox"
                              className="check"
                              checked={item.done}
                              onChange={() => toggleDone(item.id)}
                              aria-label={`${item.title} 완료`}
                            />
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
                            <button
                              className="icon"
                              aria-label={`${item.title} 위로`}
                              disabled={hideDone || i === 0}
                              onClick={() => onChange((t) => ({ ...t, items: moveItem(t.items, item.id, -1) }))}
                            >
                              ↑
                            </button>
                            <button
                              className="icon"
                              aria-label={`${item.title} 아래로`}
                              disabled={hideDone || i === visible.length - 1}
                              onClick={() => onChange((t) => ({ ...t, items: moveItem(t.items, item.id, 1) }))}
                            >
                              ↓
                            </button>
                            <button className="ghost" onClick={() => setEditing(item.id)}>
                              수정
                            </button>
                            <ConfirmButton
                              label="삭제"
                              prompt={`'${item.title}' 삭제?`}
                              onConfirm={() => onChange((t) => ({ ...t, items: t.items.filter((x) => x.id !== item.id) }))}
                            />
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
                <>
                  <QuickAdd label={`${idx + 1}일차 일정 이름`} placeholder="일정 이름 입력 후 Enter" onAdd={(title) => quickAdd(date, title)} />
                  <div className="row actions">
                    <button className="ghost" onClick={() => setEditing(`new:${date}`)}>
                      자세히 추가
                    </button>
                    {day.length > 1 && (
                      <button className="ghost" onClick={() => onChange((t) => ({ ...t, items: sortDayByTime(t.items, date) }))}>
                        시간순 정렬
                      </button>
                    )}
                    {progress.done > 0 && (
                      <ConfirmButton
                        label={`완료 ${progress.done}개 삭제`}
                        prompt={`완료한 ${progress.done}개를 삭제할까요?`}
                        onConfirm={() => onChange((t) => ({ ...t, items: t.items.filter((i) => !(i.date === date && i.done)) }))}
                      />
                    )}
                  </div>
                </>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}

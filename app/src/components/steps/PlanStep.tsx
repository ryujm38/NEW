import { useEffect, useState } from 'react'
import {
  completion,
  dateLabel,
  dayEvents,
  dayWarnings,
  dayWindow,
  eachDate,
  formatWon,
  itemsForDate,
  mapLinks,
  moveItem,
  newId,
  placeSuggestions,
  routeUrl,
  sortDayByTime,
  totalCost,
} from '../../lib/trip'
import type { Trip } from '../../types'
import { CATEGORIES } from '../../types'
import { ConfirmButton } from '../ConfirmButton'
import { IdeasPanel } from '../IdeasPanel'
import { ItemForm, type ItemValues } from '../ItemForm'
import { QuickAdd } from '../QuickAdd'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
  /** 캘린더에서 날짜를 눌러 들어왔을 때 바로 보여줄 날짜 */
  focusDay?: string
}

const dayId = (date: string) => `day-${date}`

export function PlanStep({ trip, onChange, focusDay }: Props) {
  // 'new:<date>' 이면 해당 날짜에 자세히 추가 중, 그 외에는 수정 중인 item id
  const [editing, setEditing] = useState<string | null>(null)
  // 동작 버튼(지도·순서·수정·삭제)을 펼친 일정
  const [openId, setOpenId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [returnToStay, setReturnToStay] = useState(true)
  const [ideasOpen, setIdeasOpen] = useState(trip.ideas.length > 0)

  const dates = eachDate(trip.startDate, trip.endDate)
  const all = completion(trip.items)

  // 캘린더에서 날짜를 눌러 들어오면 그 날짜가 맨 위에 오도록 스크롤한다.
  useEffect(() => {
    if (focusDay) document.getElementById(dayId(focusDay))?.scrollIntoView({ block: 'start' })
  }, [focusDay])

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
        <div className="plan-toggles">
          {all.done > 0 && (
            <label className="switch">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
              완료한 일정 숨기기
            </label>
          )}
          {trip.stays.length > 0 && (
            <label className="switch">
              <input type="checkbox" checked={returnToStay} onChange={(e) => setReturnToStay(e.target.checked)} />
              경로에 숙소 복귀 포함
            </label>
          )}
        </div>
      </div>

      {dates.length > 1 && (
        <nav className="dayjump" aria-label="날짜로 이동">
          {dates.map((date, idx) => (
            <button
              key={date}
              className="chip"
              aria-label={`${idx + 1}일차로 이동`}
              onClick={() => document.getElementById(dayId(date))?.scrollIntoView({ block: 'start' })}
            >
              {idx + 1}
            </button>
          ))}
        </nav>
      )}

      <details className="ideas-wrap" open={ideasOpen} onToggle={(e) => setIdeasOpen(e.currentTarget.open)}>
        <summary>후보지 보관함 ({trip.ideas.length})</summary>
        <IdeasPanel trip={trip} dates={dates} onChange={onChange} />
      </details>

      <div className="days">
        {dates.map((date, idx) => {
          const day = itemsForDate(trip.items, date)
          const events = dayEvents(trip, date)
          const visible = hideDone ? day.filter((i) => !i.done) : day
          const progress = completion(day)
          const adding = editing === `new:${date}`
          const win = dayWindow(trip, date)
          const warnings = dayWarnings(trip, date)
          const route = routeUrl(trip, date, { returnToStay })
          return (
            <section className="day" id={dayId(date)} key={date} aria-label={`${idx + 1}일차`}>
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

              {win && (
                <p className="muted window">
                  일정 가능 시간 {win.from || '처음'} ~ {win.to || '밤'} ({[win.fromNote, win.toNote].filter(Boolean).join(', ')})
                </p>
              )}
              {warnings.length > 0 && (
                <ul className="warns" aria-label="확인이 필요한 일정">
                  {warnings.map((w) => (
                    <li key={w} className="warn">
                      {w}
                    </li>
                  ))}
                </ul>
              )}

              {day.length === 0 && events.length === 0 && !adding && <p className="muted empty">아직 일정이 없어요.</p>}
              {day.length > 0 && visible.length === 0 && <p className="muted empty">이 날 일정을 모두 마쳤어요.</p>}

              <ul className="items">
                {visible.map((item, i) => {
                  const links = mapLinks(item, trip.destination)
                  const open = openId === item.id
                  return (
                    <li key={item.id} className={`card item compact${item.done ? ' done' : ''}`}>
                      {editing === item.id ? (
                        <ItemForm
                          initial={item}
                          suggestions={placeSuggestions(trip, item.date)}
                          submitLabel="저장"
                          onCancel={() => setEditing(null)}
                          onSubmit={(v) => saveItem(item.id, v)}
                        />
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
                              {(item.place || item.cost > 0) && (
                                <div className="muted item-meta">
                                  {item.place && <span>📍 {item.place}</span>}
                                  {item.cost > 0 && <span className="cost">{formatWon(item.cost)}</span>}
                                </div>
                              )}
                              {open && item.note && <div className="muted note">{item.note}</div>}
                            </div>
                            <button
                              className="icon more"
                              aria-label={`${item.title} 더보기`}
                              aria-expanded={open}
                              onClick={() => setOpenId(open ? null : item.id)}
                            >
                              ⋯
                            </button>
                          </div>
                          {open && (
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
                              <button
                                className="ghost"
                                onClick={() => {
                                  setEditing(item.id)
                                  setOpenId(null)
                                }}
                              >
                                수정
                              </button>
                              <ConfirmButton
                                label="삭제"
                                prompt={`'${item.title}' 삭제?`}
                                onConfirm={() => onChange((t) => ({ ...t, items: t.items.filter((x) => x.id !== item.id) }))}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>

              {adding ? (
                <div className="card">
                  <ItemForm
                    submitLabel="추가"
                    suggestions={placeSuggestions(trip, date)}
                    onCancel={() => setEditing(null)}
                    onSubmit={(v) => addItem(date, v)}
                  />
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
                    {route && (
                      <a className="linkbtn" href={route.url} target="_blank" rel="noreferrer noopener">
                        경로 보기 ({route.stops}곳)
                      </a>
                    )}
                    {progress.done > 0 && (
                      <ConfirmButton
                        label={`완료 ${progress.done}개 삭제`}
                        prompt={`완료한 ${progress.done}개를 삭제할까요?`}
                        onConfirm={() => onChange((t) => ({ ...t, items: t.items.filter((i) => !(i.date === date && i.done)) }))}
                      />
                    )}
                  </div>
                  {route?.truncated && <p className="muted">경유지는 9곳까지만 경로에 반영돼요.</p>}
                </>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}

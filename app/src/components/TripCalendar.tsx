import { calendarWeeks, dateLabel, dayEvents, daySummary, itemsForDate, monthLabel, todayString } from '../lib/trip'
import type { Trip } from '../types'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MAX_LINES = 3

interface Props {
  trip: Trip
  onPick: (date: string) => void
}

/** 여행 기간만 보여주는 달력. 날짜를 누르면 그날 일정으로 이동한다. */
export function TripCalendar({ trip, onPick }: Props) {
  const weeks = calendarWeeks(trip.startDate, trip.endDate)
  const today = todayString()
  const dayNumber = (date: string) => Number(date.slice(8))

  return (
    <section className="calendar" aria-label="여행 캘린더">
      <h2 className="cal-title">{monthLabel(trip.startDate, trip.endDate)}</h2>
      <div className="cal-head" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="cal-grid">
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`blank-${i}`} className="cal-blank" aria-hidden="true" />

          const dayNo = Math.round((Date.parse(date) - Date.parse(trip.startDate)) / 86_400_000) + 1
          const s = daySummary(trip, date)
          // 여행 첫날과 매달 1일에는 월/일로, 나머지는 일 숫자만 보여준다.
          const showMonth = date === trip.startDate || dayNumber(date) === 1
          const dateText = showMonth ? `${Number(date.slice(5, 7))}/${dayNumber(date)}` : String(dayNumber(date))
          const lines = [
            ...dayEvents(trip, date).map((e) => e.label),
            ...itemsForDate(trip.items, date).map((it) => `${it.time ? `${it.time} ` : ''}${it.title}`),
          ]
          const parts = [
            `Day ${dayNo}, ${dateLabel(date)}`,
            s.items > 0 ? `일정 ${s.items}개${s.done > 0 ? ` 중 ${s.done}개 완료` : ''}` : '일정 없음',
            ...(s.flights > 0 ? ['항공'] : []),
            ...(s.checkIns > 0 ? ['체크인'] : []),
            ...(s.checkOuts > 0 ? ['체크아웃'] : []),
          ]
          const allDone = s.items > 0 && s.done === s.items

          return (
            <button
              key={date}
              className={`cal-cell${date === today ? ' today' : ''}${allDone ? ' all-done' : ''}`}
              aria-label={parts.join(', ')}
              aria-current={date === today ? 'date' : undefined}
              onClick={() => onPick(date)}
            >
              <span className="cal-date">{dateText}</span>
              <span className="cal-dayno">Day {dayNo}</span>
              <span className="cal-marks" aria-hidden="true">
                {s.flights > 0 && <i className="dot dot-flight" />}
                {(s.checkIns > 0 || s.checkOuts > 0) && <i className="dot dot-stay" />}
                {s.items > 0 && (
                  <b className="cal-count">{s.done > 0 ? `${s.done}/${s.items}` : s.items}</b>
                )}
              </span>
              {lines.length > 0 && (
                <span className="cal-lines" aria-hidden="true">
                  {lines.slice(0, MAX_LINES).map((l, idx) => (
                    <span key={idx}>{l}</span>
                  ))}
                  {lines.length > MAX_LINES && <span className="muted">+{lines.length - MAX_LINES}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="cal-legend muted">
        <i className="dot dot-flight" /> 항공 <i className="dot dot-stay" /> 체크인·체크아웃 · 숫자는 일정 수(완료/전체)
      </p>
    </section>
  )
}

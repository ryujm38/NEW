import { useState } from 'react'
import { dateLabel, formatWon, makeRoundTrip, newId, sortFlights, type RoundTripInput } from '../../lib/trip'
import type { Flight, Trip } from '../../types'
import { ConfirmButton } from '../ConfirmButton'

type FlightValues = Omit<Flight, 'id'>

interface FormProps {
  initial?: Flight
  defaultDate: string
  submitLabel: string
  onSubmit: (v: FlightValues) => void
  onCancel: () => void
}

function FlightForm({ initial, defaultDate, submitLabel, onSubmit, onCancel }: FormProps) {
  const [from, setFrom] = useState(initial?.from ?? '')
  const [to, setTo] = useState(initial?.to ?? '')
  const [flightNo, setFlightNo] = useState(initial?.flightNo ?? '')
  const [departDate, setDepartDate] = useState(initial?.departDate ?? defaultDate)
  const [departTime, setDepartTime] = useState(initial?.departTime ?? '')
  // 비워 두면 출발일과 같은 날 도착
  const [arriveDate, setArriveDate] = useState(initial && initial.arriveDate !== initial.departDate ? initial.arriveDate : '')
  const [arriveTime, setArriveTime] = useState(initial?.arriveTime ?? '')
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost) : '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!from.trim() || !to.trim()) return setError('출발지와 도착지를 입력해 주세요.')
    if (!departDate) return setError('출발 날짜를 입력해 주세요.')
    if (arriveDate && arriveDate < departDate) return setError('도착일은 출발일보다 빠를 수 없어요.')
    const costNum = cost === '' ? 0 : Number(cost)
    if (!Number.isFinite(costNum) || costNum < 0) return setError('비용은 0 이상의 숫자로 입력해 주세요.')
    onSubmit({
      flightNo: flightNo.trim(),
      from: from.trim(),
      to: to.trim(),
      departDate,
      departTime,
      arriveDate: arriveDate || departDate,
      arriveTime,
      cost: costNum,
      note: note.trim(),
    })
  }

  return (
    <form className="form card" onSubmit={submit}>
      <div className="row">
        <label>
          출발지
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="예: 인천(ICN)" autoFocus />
        </label>
        <label>
          도착지
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="예: 제주(CJU)" />
        </label>
      </div>
      <label>
        편명 (선택)
        <input value={flightNo} onChange={(e) => setFlightNo(e.target.value)} placeholder="예: KE1201" />
      </label>
      <div className="row">
        <label>
          출발 날짜
          <input type="date" value={departDate} onChange={(e) => setDepartDate(e.target.value)} />
        </label>
        <label>
          출발 시간
          <input type="time" value={departTime} onChange={(e) => setDepartTime(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          도착 날짜 (다른 날일 때만)
          <input type="date" value={arriveDate} min={departDate} onChange={(e) => setArriveDate(e.target.value)} />
        </label>
        <label>
          도착 시간
          <input type="time" value={arriveTime} onChange={(e) => setArriveTime(e.target.value)} />
        </label>
      </div>
      <label>
        비용 (원)
        <input type="number" inputMode="numeric" min="0" step="1000" value={cost} onChange={(e) => setCost(e.target.value)} />
      </label>
      <label>
        메모
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예약번호, 수하물 등" />
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

interface RoundTripFormProps {
  trip: Trip
  onSubmit: (v: RoundTripInput) => void
  onCancel: () => void
}

function RoundTripForm({ trip, onSubmit, onCancel }: RoundTripFormProps) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(trip.destination)
  const [outFlightNo, setOutFlightNo] = useState('')
  const [outTime, setOutTime] = useState('')
  const [retFlightNo, setRetFlightNo] = useState('')
  const [retTime, setRetTime] = useState('')
  const [total, setTotal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!from.trim() || !to.trim()) return setError('출발지와 도착지를 입력해 주세요.')
    const totalNum = total === '' ? 0 : Number(total)
    if (!Number.isFinite(totalNum) || totalNum < 0) return setError('비용은 0 이상의 숫자로 입력해 주세요.')
    onSubmit({ from: from.trim(), to: to.trim(), outFlightNo: outFlightNo.trim(), retFlightNo: retFlightNo.trim(), outTime, retTime, total: totalNum })
  }

  return (
    <form className="form card" onSubmit={submit}>
      <p className="muted">
        가는 편은 {dateLabel(trip.startDate)}, 오는 편은 {dateLabel(trip.endDate)}로 만들어요. 날짜는 나중에 고칠 수 있어요.
      </p>
      <div className="row">
        <label>
          출발지
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="예: 인천(ICN)" autoFocus />
        </label>
        <label>
          도착지
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="예: 제주(CJU)" />
        </label>
      </div>
      <div className="row">
        <label>
          가는 편 출발 시간
          <input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
        </label>
        <label>
          가는 편 편명 (선택)
          <input value={outFlightNo} onChange={(e) => setOutFlightNo(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          오는 편 출발 시간
          <input type="time" value={retTime} onChange={(e) => setRetTime(e.target.value)} />
        </label>
        <label>
          오는 편 편명 (선택)
          <input value={retFlightNo} onChange={(e) => setRetFlightNo(e.target.value)} />
        </label>
      </div>
      <label>
        왕복 총 비용 (원, 선택)
        <input type="number" inputMode="numeric" min="0" step="1000" value={total} onChange={(e) => setTotal(e.target.value)} />
      </label>
      <p className="muted">총 비용은 가는 편과 오는 편에 반씩 나눠 기록해요.</p>
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
          왕복 2건 추가
        </button>
      </div>
    </form>
  )
}

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

export function FlightsStep({ trip, onChange }: Props) {
  // 'roundtrip' | 'new' | 수정 중인 항공 id | null
  const [mode, setMode] = useState<string | null>(trip.flights.length === 0 ? 'roundtrip' : null)
  const inRange = (d: string) => d >= trip.startDate && d <= trip.endDate

  const add = (v: FlightValues) => {
    onChange((t) => ({ ...t, flights: [...t.flights, { id: newId(), ...v }] }))
    setMode(null)
  }
  const save = (id: string, v: FlightValues) => {
    onChange((t) => ({ ...t, flights: t.flights.map((f) => (f.id === id ? { ...f, ...v } : f)) }))
    setMode(null)
  }

  return (
    <section aria-label="항공권">
      <h2>항공권</h2>
      <p className="muted">등록하면 해당 날짜 일정 맨 위에 출발·도착 시간이 자동으로 나와요.</p>

      <ul className="items">
        {sortFlights(trip.flights).map((f) => (
          <li key={f.id} className="card item">
            {mode === f.id ? (
              <FlightForm initial={f} defaultDate={trip.startDate} submitLabel="저장" onCancel={() => setMode(null)} onSubmit={(v) => save(f.id, v)} />
            ) : (
              <>
                <div className="item-body">
                  <strong>
                    {f.from} → {f.to}
                  </strong>
                  {f.flightNo && <span className="tag">{f.flightNo}</span>}
                  <div className="muted">
                    {dateLabel(f.departDate)} {f.departTime || '시간 미정'}
                    {(f.arriveDate !== f.departDate || f.arriveTime) &&
                      ` → ${f.arriveDate !== f.departDate ? `${dateLabel(f.arriveDate)} ` : ''}${f.arriveTime || ''}`}
                  </div>
                  {!inRange(f.departDate) && <div className="warn">여행 기간 밖의 날짜예요. 일정에는 표시되지 않아요.</div>}
                  {f.note && <div className="muted note">{f.note}</div>}
                  {f.cost > 0 && <div className="cost">{formatWon(f.cost)}</div>}
                </div>
                <div className="item-actions">
                  <span className="spacer" />
                  <button className="ghost" onClick={() => setMode(f.id)}>
                    수정
                  </button>
                  <ConfirmButton
                    label="삭제"
                    prompt={`${f.from} → ${f.to} 삭제?`}
                    onConfirm={() => onChange((t) => ({ ...t, flights: t.flights.filter((x) => x.id !== f.id) }))}
                  />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {mode === 'roundtrip' && (
        <RoundTripForm
          trip={trip}
          onCancel={() => setMode(null)}
          onSubmit={(v) => {
            onChange((t) => ({ ...t, flights: [...t.flights, ...makeRoundTrip(v, t.startDate, t.endDate)] }))
            setMode(null)
          }}
        />
      )}
      {mode === 'new' && <FlightForm defaultDate={trip.startDate} submitLabel="추가" onCancel={() => setMode(null)} onSubmit={add} />}

      {mode === null && (
        <div className="row actions">
          <button className="ghost" onClick={() => setMode('new')}>
            + 편도·직접 입력
          </button>
          <button className="ghost" onClick={() => setMode('roundtrip')}>
            + 왕복 한 번에
          </button>
        </div>
      )}
    </section>
  )
}

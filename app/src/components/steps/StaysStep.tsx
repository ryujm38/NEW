import { useState } from 'react'
import { dateLabel, formatWon, groupRanges, newId, nights, uncoveredNights } from '../../lib/trip'
import type { Stay, Trip } from '../../types'
import { ConfirmButton } from '../ConfirmButton'

type StayValues = Omit<Stay, 'id'>

interface FormProps {
  initial?: Stay
  defaultCheckIn: string
  defaultCheckOut: string
  submitLabel: string
  onSubmit: (v: StayValues) => void
  onCancel: () => void
}

function StayForm({ initial, defaultCheckIn, defaultCheckOut, submitLabel, onSubmit, onCancel }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? defaultCheckIn)
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? defaultCheckOut)
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost) : '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const nightCount = checkIn && checkOut && checkOut >= checkIn ? nights(checkIn, checkOut) : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('숙소 이름을 입력해 주세요.')
    if (!checkIn || !checkOut) return setError('체크인과 체크아웃 날짜를 입력해 주세요.')
    if (checkOut < checkIn) return setError('체크아웃은 체크인보다 빠를 수 없어요.')
    const costNum = cost === '' ? 0 : Number(cost)
    if (!Number.isFinite(costNum) || costNum < 0) return setError('비용은 0 이상의 숫자로 입력해 주세요.')
    onSubmit({ name: name.trim(), address: address.trim(), checkIn, checkOut, cost: costNum, note: note.trim() })
  }

  return (
    <form className="form card" onSubmit={submit}>
      <label>
        숙소 이름
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 제주 오션뷰 호텔" autoFocus />
      </label>
      <div className="row">
        <label>
          체크인
          <input
            type="date"
            value={checkIn}
            onChange={(e) => {
              setCheckIn(e.target.value)
              if (!checkOut || checkOut < e.target.value) setCheckOut(e.target.value)
            }}
          />
        </label>
        <label>
          체크아웃
          <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
      </div>
      {nightCount !== null && <p className="muted">{nightCount}박</p>}
      <label>
        주소 (선택, 지도 링크에 사용)
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label>
        숙박 총 비용 (원)
        <input type="number" inputMode="numeric" min="0" step="1000" value={cost} onChange={(e) => setCost(e.target.value)} />
      </label>
      <label>
        메모
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예약번호, 조식 여부 등" />
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

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

export function StaysStep({ trip, onChange }: Props) {
  // 'new' | 수정 중인 숙소 id | null
  const [mode, setMode] = useState<string | null>(trip.stays.length === 0 ? 'new' : null)

  const gaps = trip.stays.length > 0 ? groupRanges(uncoveredNights(trip)) : []
  const sorted = trip.stays.slice().sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))

  // 첫 숙소는 여행 전체 기간으로, 이후에는 이미 덮인 날 다음부터를 기본값으로 채운다.
  const nextStart = sorted.length > 0 ? sorted[sorted.length - 1].checkOut : trip.startDate
  const defaultCheckIn = nextStart < trip.endDate ? nextStart : trip.startDate

  return (
    <section aria-label="숙소">
      <h2>숙소</h2>
      <p className="muted">체크인·체크아웃 날짜가 일정에 자동으로 표시되고, 숙소가 비는 밤을 알려 드려요.</p>

      {gaps.length > 0 && (
        <p className="warn" role="status">
          숙소가 없는 밤이 있어요:{' '}
          {gaps.map(([from, to]) => (from === to ? dateLabel(from) : `${dateLabel(from)} ~ ${dateLabel(to)}`)).join(', ')}
        </p>
      )}

      <ul className="items">
        {sorted.map((s) => (
          <li key={s.id} className="card item">
            {mode === s.id ? (
              <StayForm
                initial={s}
                defaultCheckIn={trip.startDate}
                defaultCheckOut={trip.endDate}
                submitLabel="저장"
                onCancel={() => setMode(null)}
                onSubmit={(v) => {
                  onChange((t) => ({ ...t, stays: t.stays.map((x) => (x.id === s.id ? { ...x, ...v } : x)) }))
                  setMode(null)
                }}
              />
            ) : (
              <>
                <div className="item-body">
                  <strong>{s.name}</strong>
                  <div className="muted">
                    {dateLabel(s.checkIn)} ~ {dateLabel(s.checkOut)} · {nights(s.checkIn, s.checkOut)}박
                  </div>
                  {s.address && <div className="muted">{s.address}</div>}
                  {s.note && <div className="muted note">{s.note}</div>}
                  {s.cost > 0 && <div className="cost">{formatWon(s.cost)}</div>}
                </div>
                <div className="item-actions">
                  <a
                    href={`https://map.naver.com/p/search/${encodeURIComponent([s.name, s.address].filter(Boolean).join(' '))}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    네이버지도
                  </a>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name, s.address].filter(Boolean).join(' '))}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    구글지도
                  </a>
                  <span className="spacer" />
                  <button className="ghost" onClick={() => setMode(s.id)}>
                    수정
                  </button>
                  <ConfirmButton
                    label="삭제"
                    prompt={`'${s.name}' 삭제?`}
                    onConfirm={() => onChange((t) => ({ ...t, stays: t.stays.filter((x) => x.id !== s.id) }))}
                  />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {mode === 'new' && (
        <StayForm
          defaultCheckIn={defaultCheckIn}
          defaultCheckOut={trip.endDate}
          submitLabel="추가"
          onCancel={() => setMode(null)}
          onSubmit={(v) => {
            onChange((t) => ({ ...t, stays: [...t.stays, { id: newId(), ...v }] }))
            setMode(null)
          }}
        />
      )}
      {mode === null && (
        <div className="row actions">
          <button className="ghost" onClick={() => setMode('new')}>
            + 숙소 추가
          </button>
        </div>
      )}
    </section>
  )
}

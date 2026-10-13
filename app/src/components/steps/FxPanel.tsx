import { useEffect, useRef, useState } from 'react'
import { fetchRate, isStale, rateLabel, unitFor } from '../../lib/fx'
import type { Trip } from '../../types'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

function stamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 현지 통화의 환율을 자동으로 받아오거나 직접 입력한다. */
export function FxPanel({ trip, onChange }: Props) {
  const code = trip.currency
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState('')
  const unit = unitFor(code, trip.rate)

  // 최신 값을 effect와 이벤트 핸들러에서 같이 쓰기 위한 참조
  const latest = useRef({ code, onChange })
  latest.current = { code, onChange }

  const refresh = async () => {
    const { code: want, onChange: update } = latest.current
    setStatus('loading')
    try {
      const q = await fetchRate(want)
      // 받는 동안 통화가 바뀌었다면 버린다.
      update((t) => (t.currency === want ? { ...t, rate: q.rate, rateUpdatedAt: q.updatedAt, rateSource: q.source } : t))
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  // 들어올 때 환율이 없거나 오래됐으면 한 번 자동으로 시도한다(직접 입력한 환율은 건드리지 않는다).
  useEffect(() => {
    if (trip.rateSource !== 'manual' && (trip.rate <= 0 || isStale(trip.rateUpdatedAt))) void refresh()
    // 화면에 들어올 때 한 번만
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyManual = (e: React.FormEvent) => {
    e.preventDefault()
    const won = Number(manual)
    if (!Number.isFinite(won) || won <= 0) return setManualError('0보다 큰 숫자로 입력해 주세요.')
    setManualError('')
    onChange((t) => ({ ...t, rate: won / unit, rateUpdatedAt: new Date().toISOString(), rateSource: 'manual' }))
    setManual('')
    setManualOpen(false)
  }

  const source = trip.rateSource === 'manual' ? '직접 입력' : trip.rateSource ? `자동 · ${trip.rateSource}` : ''
  const when = trip.rateUpdatedAt ? stamp(trip.rateUpdatedAt) : ''

  return (
    <section className="card fx" aria-label="환율">
      <div className="fx-line">
        <strong>{rateLabel(code, trip.rate)}</strong>
        {(source || when) && <span className="muted">{[source, when && `${when} 기준`].filter(Boolean).join(' · ')}</span>}
      </div>
      <div className="row actions">
        <button className="ghost" onClick={refresh} disabled={status === 'loading'}>
          {status === 'loading' ? '불러오는 중…' : '환율 자동으로 받아오기'}
        </button>
        <button className="ghost" onClick={() => setManualOpen((o) => !o)} aria-expanded={manualOpen}>
          직접 입력
        </button>
      </div>
      {manualOpen && (
        <form className="form fx-manual" onSubmit={applyManual}>
          <label>
            {unit.toLocaleString('ko-KR')} {code} = ? 원
            <input type="number" inputMode="decimal" step="any" min="0" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="예: 926" autoFocus />
          </label>
          {manualError && (
            <p className="error" role="alert">
              {manualError}
            </p>
          )}
          <div className="row actions">
            <button type="submit" className="primary">
              적용
            </button>
          </div>
        </form>
      )}
      {status === 'error' && (
        <p className="warn" role="alert">
          자동으로 받아오지 못했어요. 인터넷에 연결돼 있지 않거나 이 화면에서 외부 접속이 막혀 있을 수 있어요. 환율을 직접 입력해 주세요.
        </p>
      )}
      <p className="muted">지출을 기록하는 순간의 환율이 그 지출에 고정돼요. 실제 환전·카드 환율과는 다를 수 있어요.</p>
      {trip.rateSource === 'open.er-api.com' && (
        <p className="muted">
          환율 제공: <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer noopener">Exchange Rate API</a>
        </p>
      )}
    </section>
  )
}

import { useRef, useState } from 'react'
import { parseStore } from '../lib/storage'
import { eachDate, formatWon, newId, totalCost } from '../lib/trip'
import type { Store, Trip } from '../types'
import { TripForm, type TripFormValues } from './TripForm'

interface Props {
  store: Store
  saveFailed: boolean
  onOpen: (id: string) => void
  onCreate: (trip: Trip) => void
  onReplaceAll: (store: Store) => void
}

export function TripList({ store, saveFailed, onOpen, onCreate, onReplaceAll }: Props) {
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const create = (v: TripFormValues) => {
    const trip: Trip = { id: newId(), ...v, items: [], createdAt: new Date().toISOString() }
    onCreate(trip)
    setCreating(false)
    onOpen(trip.id)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `travel-planner-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    const parsed = parseStore(await file.text())
    if (!parsed) return setMessage('백업 파일 형식이 올바르지 않아요.')
    if (!window.confirm(`현재 여행 ${store.trips.length}개를 지우고 백업의 여행 ${parsed.trips.length}개로 바꿀까요?`)) return
    onReplaceAll(parsed)
    setMessage(`여행 ${parsed.trips.length}개를 불러왔어요.`)
  }

  return (
    <main className="page">
      <h1>내 여행</h1>
      <p className="muted">일정과 예산, 지도 링크를 한곳에서. 데이터는 이 기기에 저장돼요.</p>

      {saveFailed && (
        <p className="error" role="alert">
          저장 공간에 쓰지 못했어요. 지금 입력한 내용은 앱을 닫으면 사라질 수 있어요. 아래 '백업 내보내기'로 보관해 주세요.
        </p>
      )}

      {creating ? (
        <TripForm submitLabel="만들기" onCancel={() => setCreating(false)} onSubmit={create} />
      ) : (
        <button className="primary block" onClick={() => setCreating(true)}>
          + 새 여행 만들기
        </button>
      )}

      {store.trips.length === 0 && !creating && <p className="empty muted">아직 여행이 없어요. 첫 여행을 만들어 보세요.</p>}

      <ul className="trips">
        {store.trips.map((t) => (
          <li key={t.id}>
            <button className="card trip-card" onClick={() => onOpen(t.id)}>
              <strong>{t.name}</strong>
              <span className="muted">
                {t.destination} · {t.startDate} ~ {t.endDate} ({eachDate(t.startDate, t.endDate).length}일)
              </span>
              <span className="muted">
                일정 {t.items.length}개 · {formatWon(totalCost(t.items))}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <footer className="backup">
        <button className="ghost" onClick={exportJson} disabled={store.trips.length === 0}>
          백업 내보내기
        </button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>
          백업 불러오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importJson(f)
            e.target.value = ''
          }}
        />
        {message && (
          <p className="muted" role="status">
            {message}
          </p>
        )}
      </footer>
    </main>
  )
}

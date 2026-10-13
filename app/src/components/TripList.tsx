import { useRef, useState } from 'react'
import { parseStore } from '../lib/storage'
import { budgetBreakdown, eachDate, formatWon, newId } from '../lib/trip'
import type { StepKey, Store, Trip } from '../types'
import { TripForm, type TripFormValues } from './TripForm'

interface Props {
  store: Store
  saveFailed: boolean
  onOpen: (id: string, step?: StepKey) => void
  onCreate: (trip: Trip) => void
  onReplaceAll: (store: Store) => void
}

export function TripList({ store, saveFailed, onOpen, onCreate, onReplaceAll }: Props) {
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  // 불러올 백업을 파싱한 뒤, 현재 데이터를 덮어써도 되는지 사용자가 확인할 때까지 들고 있는다.
  const [pendingImport, setPendingImport] = useState<Store | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLTextAreaElement>(null)

  const create = (v: TripFormValues) => {
    const trip: Trip = { id: newId(), ...v, items: [], flights: [], stays: [], shopping: [], ideas: [], packing: [], createdAt: new Date().toISOString() }
    onCreate(trip)
    setCreating(false)
    // 새 여행도 캘린더가 먼저 보인다. 비어 있으면 거기서 항공권부터 등록하도록 안내한다.
    onOpen(trip.id)
  }

  const toggleExport = () => setExportText((cur) => (cur === null ? JSON.stringify(store, null, 2) : null))

  // 임베디드 뷰어에서는 다운로드가 막혀 있어서, 복사와 파일 저장을 둘 다 제공한다.
  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText ?? '')
      setMessage('백업 내용을 복사했어요.')
    } catch {
      exportRef.current?.select()
      setMessage('자동 복사가 막혀 있어요. 선택된 내용을 직접 복사해 주세요.')
    }
  }

  const saveExportFile = () => {
    const blob = new Blob([exportText ?? ''], { type: 'application/json' })
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
    setMessage('')
    setPendingImport(parsed)
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
                일정 {t.items.length}개 · {formatWon(budgetBreakdown(t).total)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <footer className="backup">
        <button className="ghost" onClick={toggleExport} disabled={store.trips.length === 0 && exportText === null}>
          {exportText === null ? '백업 내보내기' : '백업 닫기'}
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

        {exportText !== null && (
          <div className="export-panel">
            <textarea
              ref={exportRef}
              className="export-box"
              readOnly
              rows={8}
              value={exportText}
              aria-label="백업 데이터"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="row actions">
              {/* 임베디드 뷰어(단일 파일 빌드)는 다운로드를 막아서 눌러도 아무 일도 없다. 그쪽에서는 복사만 보여준다. */}
              {!import.meta.env.VITE_EMBEDDED && (
                <button className="ghost" onClick={saveExportFile}>
                  파일로 저장
                </button>
              )}
              <button className="primary" onClick={copyExport}>
                복사
              </button>
            </div>
          </div>
        )}

        {pendingImport && (
          <div className="card export-panel" role="alertdialog" aria-label="백업 불러오기 확인">
            <p>
              현재 여행 {store.trips.length}개를 지우고 백업의 여행 {pendingImport.trips.length}개로 바꿀까요?
            </p>
            <div className="row actions">
              <button className="ghost" onClick={() => setPendingImport(null)} autoFocus>
                취소
              </button>
              <button
                className="danger-solid"
                onClick={() => {
                  onReplaceAll(pendingImport)
                  setMessage(`여행 ${pendingImport.trips.length}개를 불러왔어요.`)
                  setPendingImport(null)
                }}
              >
                바꾸기
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="muted" role="status">
            {message}
          </p>
        )}
      </footer>
    </main>
  )
}

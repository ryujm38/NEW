import { useCallback, useEffect, useState } from 'react'
import { loadStore, saveStore } from './lib/storage'
import type { Store, Trip } from './types'

export function useStore() {
  const [store, setStore] = useState<Store>(loadStore)
  const [saveFailed, setSaveFailed] = useState(false)

  // localStorage(외부 시스템)와 동기화하고, 저장 실패 여부만 화면에 알린다.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setSaveFailed(!saveStore(store))
  }, [store])

  const replaceAll = useCallback((next: Store) => setStore(next), [])

  const addTrip = useCallback((trip: Trip) => {
    setStore((s) => ({ ...s, trips: [trip, ...s.trips] }))
  }, [])

  const updateTrip = useCallback((id: string, fn: (t: Trip) => Trip) => {
    setStore((s) => ({ ...s, trips: s.trips.map((t) => (t.id === id ? fn(t) : t)) }))
  }, [])

  const deleteTrip = useCallback((id: string) => {
    setStore((s) => ({ ...s, trips: s.trips.filter((t) => t.id !== id) }))
  }, [])

  return { store, saveFailed, replaceAll, addTrip, updateTrip, deleteTrip }
}

/** 해시 기반 라우팅: #/trip/<id>. 뒤로가기 버튼이 모바일에서 그대로 동작한다. */
export function useTripRoute(): [string | null, (id: string | null) => void] {
  const read = () => {
    const m = /^#\/trip\/(.+)$/.exec(window.location.hash)
    return m ? decodeURIComponent(m[1]) : null
  }
  const [id, setId] = useState<string | null>(read)

  useEffect(() => {
    const onChange = () => setId(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const go = useCallback((next: string | null) => {
    window.location.hash = next ? `/trip/${encodeURIComponent(next)}` : '/'
  }, [])

  return [id, go]
}

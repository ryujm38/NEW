import { useCallback, useEffect, useState } from 'react'
import { loadStore, saveStore } from './lib/storage'
import { STEPS, type StepKey, type Store, type Trip } from './types'

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

export interface TripRoute {
  id: string
  step: StepKey
}

/** 해시 기반 라우팅: #/trip/<id>/<단계>. 뒤로가기 버튼이 모바일에서 그대로 동작한다. 단계를 생략하면 '일정'. */
function readRoute(): TripRoute | null {
  const m = /^#\/trip\/([^/]+)(?:\/([a-z]+))?$/.exec(window.location.hash)
  if (!m) return null
  const step = STEPS.find((s) => s.key === m[2])?.key ?? 'plan'
  return { id: decodeURIComponent(m[1]), step }
}

const sameRoute = (a: TripRoute | null, b: TripRoute | null) => a?.id === b?.id && a?.step === b?.step

export function useTripRoute(): [TripRoute | null, (id: string | null, step?: StepKey) => void] {
  const [route, setRoute] = useState<TripRoute | null>(readRoute)

  useEffect(() => {
    const onChange = () => setRoute((prev) => {
      const next = readRoute()
      return sameRoute(prev, next) ? prev : next
    })
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const go = useCallback((id: string | null, step: StepKey = 'plan') => {
    setRoute(id ? { id, step } : null)
    try {
      window.location.hash = id ? `/trip/${encodeURIComponent(id)}/${step}` : '/'
    } catch {
      // 주소 해시를 바꿀 수 없는 환경(임베디드 뷰어)에서도 화면 전환은 동작해야 한다.
    }
  }, [])

  return [route, go]
}

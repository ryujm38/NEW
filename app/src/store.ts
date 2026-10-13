import { useCallback, useEffect, useState } from 'react'
import { loadStore, saveStore } from './lib/storage'
import { STEPS, type Store, type Trip, type ViewKey } from './types'

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
  step: ViewKey
  /** 일정 화면에서 바로 보여줄 날짜(yyyy-mm-dd) */
  day?: string
}

/**
 * 해시 기반 라우팅. 뒤로가기 버튼이 모바일에서 그대로 동작한다.
 *   #/trip/<id>                  캘린더(개요)
 *   #/trip/<id>/<단계>            세부 단계
 *   #/trip/<id>/plan/<yyyy-mm-dd> 일정 화면에서 그 날짜로 이동
 */
function readRoute(): TripRoute | null {
  const m = /^#\/trip\/([^/]+)(?:\/([a-z]+)(?:\/(\d{4}-\d{2}-\d{2}))?)?$/.exec(window.location.hash)
  if (!m) return null
  const step: ViewKey = STEPS.find((s) => s.key === m[2])?.key ?? 'overview'
  return { id: decodeURIComponent(m[1]), step, day: step === 'plan' ? m[3] : undefined }
}

const sameRoute = (a: TripRoute | null, b: TripRoute | null) => a?.id === b?.id && a?.step === b?.step && a?.day === b?.day

export function useTripRoute(): [TripRoute | null, (id: string | null, step?: ViewKey, day?: string) => void] {
  const [route, setRoute] = useState<TripRoute | null>(readRoute)

  useEffect(() => {
    const onChange = () =>
      setRoute((prev) => {
        const next = readRoute()
        return sameRoute(prev, next) ? prev : next
      })
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const go = useCallback((id: string | null, step: ViewKey = 'overview', day?: string) => {
    setRoute(id ? { id, step, day: step === 'plan' ? day : undefined } : null)
    try {
      const path = step === 'overview' ? '' : `/${step}${step === 'plan' && day ? `/${day}` : ''}`
      window.location.hash = id ? `/trip/${encodeURIComponent(id)}${path}` : '/'
    } catch {
      // 주소 해시를 바꿀 수 없는 환경(임베디드 뷰어)에서도 화면 전환은 동작해야 한다.
    }
  }, [])

  return [route, go]
}

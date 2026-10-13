import { TripList } from './components/TripList'
import { TripView } from './components/TripView'
import { useStore, useTripRoute } from './store'

export default function App() {
  const { store, saveFailed, replaceAll, addTrip, updateTrip, deleteTrip } = useStore()
  const [route, go] = useTripRoute()
  const trip = route ? store.trips.find((t) => t.id === route.id) : undefined

  if (route && !trip) {
    return (
      <main className="page">
        <h1>여행을 찾을 수 없어요</h1>
        <p className="muted">삭제됐거나 다른 기기에서 만든 여행일 수 있어요.</p>
        <button className="primary" onClick={() => go(null)}>
          목록으로
        </button>
      </main>
    )
  }

  if (route && trip) {
    return (
      <TripView
        trip={trip}
        view={route.step}
        day={route.day}
        onView={(view, day) => go(trip.id, view, day)}
        onChange={(fn) => updateTrip(trip.id, fn)}
        onBack={() => go(null)}
        onDelete={() => {
          deleteTrip(trip.id)
          go(null)
        }}
      />
    )
  }

  return <TripList store={store} saveFailed={saveFailed} onOpen={go} onCreate={addTrip} onReplaceAll={replaceAll} />
}

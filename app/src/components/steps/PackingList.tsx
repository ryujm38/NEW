import { useState } from 'react'
import { newId } from '../../lib/trip'
import { isDomestic } from '../../lib/countries'
import { packingPresetsFor } from '../../lib/presets'
import type { Trip } from '../../types'
import { ConfirmButton } from '../ConfirmButton'
import { QuickAdd } from '../QuickAdd'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

export function PackingList({ trip, onChange }: Props) {
  // 처음에 목록이 비어 있으면 펼쳐서 보여주고, 이후에는 사용자가 연 상태를 그대로 둔다(칩을 누를 때마다 닫히지 않게).
  const [presetsOpen, setPresetsOpen] = useState(trip.packing.length === 0)
  const have = new Set(trip.packing.map((p) => p.name))
  const packedCount = trip.packing.filter((p) => p.packed).length
  const groups = packingPresetsFor(isDomestic(trip.country)).map((g) => ({ ...g, items: g.items.filter((n) => !have.has(n)) })).filter((g) => g.items.length > 0)
  const remainingPresets = groups.reduce((n, g) => n + g.items.length, 0)

  const add = (name: string) => onChange((t) => ({ ...t, packing: [...t.packing, { id: newId(), name, packed: false }] }))
  const toggle = (id: string) =>
    onChange((t) => ({ ...t, packing: t.packing.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p)) }))

  return (
    <section aria-label="준비물 체크리스트">
      <h3>준비물 체크리스트</h3>
      <p className="muted">
        {trip.packing.length > 0 ? `챙긴 것 ${packedCount}/${trip.packing.length}` : '떠나기 전에 챙길 것을 적고, 챙겼으면 체크하세요.'}
      </p>

      <QuickAdd label="준비물 이름" placeholder="챙길 것" onAdd={(name) => add(name)} />

      {remainingPresets > 0 && (
        <details className="presets" open={presetsOpen} onToggle={(e) => setPresetsOpen(e.currentTarget.open)}>
          <summary>자주 챙기는 것 ({remainingPresets})</summary>
          {groups.map((g) => (
            <div key={g.group} className="chips" role="group" aria-label={g.group}>
              <span className="muted">{g.group}</span>
              {g.items.map((name) => (
                <button key={name} type="button" className="chip" onClick={() => add(name)}>
                  + {name}
                </button>
              ))}
            </div>
          ))}
        </details>
      )}

      <ul className="items">
        {trip.packing.map((p) => (
          <li key={p.id} className={`card item${p.packed ? ' done' : ''}`}>
            <div className="item-main">
              <input type="checkbox" className="check" checked={p.packed} onChange={() => toggle(p.id)} aria-label={`${p.name} 챙김`} />
              <div className="item-body">
                <strong>{p.name}</strong>
              </div>
              <span className="spacer" />
              <ConfirmButton
                label="삭제"
                prompt={`'${p.name}' 삭제?`}
                onConfirm={() => onChange((t) => ({ ...t, packing: t.packing.filter((x) => x.id !== p.id) }))}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

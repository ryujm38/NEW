import { useState } from 'react'
import { formatWon, newId, sumBy } from '../../lib/trip'
import type { ShoppingItem, Trip } from '../../types'
import { ConfirmButton } from '../ConfirmButton'
import { QuickAdd } from '../QuickAdd'

type ShoppingValues = Pick<ShoppingItem, 'name' | 'where' | 'price'>

function ShoppingForm({ initial, onSubmit, onCancel }: { initial: ShoppingItem; onSubmit: (v: ShoppingValues) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial.name)
  const [where, setWhere] = useState(initial.where)
  const [price, setPrice] = useState(initial.price ? String(initial.price) : '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('물건 이름을 입력해 주세요.')
    const p = price === '' ? 0 : Number(price)
    if (!Number.isFinite(p) || p < 0) return setError('가격은 0 이상의 숫자로 입력해 주세요.')
    onSubmit({ name: name.trim(), where: where.trim(), price: p })
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        물건
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="row">
        <label>
          구매처 (선택)
          <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="예: 올리브영, 공항 면세점" />
        </label>
        <label>
          예상 가격 (원)
          <input type="number" inputMode="numeric" min="0" step="100" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
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
          저장
        </button>
      </div>
    </form>
  )
}

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

export function ShoppingStep({ trip, onChange }: Props) {
  const [editing, setEditing] = useState<string | null>(null)

  const planned = sumBy(trip.shopping, (s) => s.price)
  const spent = sumBy(
    trip.shopping.filter((s) => s.bought),
    (s) => s.price,
  )
  const left = trip.shopping.filter((s) => !s.bought).length
  const boughtCount = trip.shopping.length - left
  // 아직 못 산 것을 위에, 산 것은 아래로 보낸다. 같은 그룹 안에서는 입력한 순서를 유지한다.
  const ordered = [...trip.shopping.filter((s) => !s.bought), ...trip.shopping.filter((s) => s.bought)]

  const toggle = (id: string) =>
    onChange((t) => ({ ...t, shopping: t.shopping.map((s) => (s.id === id ? { ...s, bought: !s.bought } : s)) }))

  return (
    <section aria-label="쇼핑 목록">
      <h2>쇼핑 목록</h2>
      <p className="muted">살 물건을 적어 두고, 샀으면 체크하세요. 예상 가격은 예산에 합산돼요.</p>

      <QuickAdd
        label="쇼핑 물건 이름"
        placeholder="사야 할 물건"
        withPrice
        onAdd={(name, price) => onChange((t) => ({ ...t, shopping: [...t.shopping, { id: newId(), name, where: '', price, bought: false }] }))}
      />

      {trip.shopping.length > 0 && (
        <p className="muted">
          남은 것 {left}개 · 예상 {formatWon(planned)} · 산 것 {boughtCount}개 {formatWon(spent)}
        </p>
      )}

      <ul className="items">
        {ordered.map((s) => (
          <li key={s.id} className={`card item${s.bought ? ' done' : ''}`}>
            {editing === s.id ? (
              <ShoppingForm
                initial={s}
                onCancel={() => setEditing(null)}
                onSubmit={(v) => {
                  onChange((t) => ({ ...t, shopping: t.shopping.map((x) => (x.id === s.id ? { ...x, ...v } : x)) }))
                  setEditing(null)
                }}
              />
            ) : (
              <>
                <div className="item-main">
                  <input type="checkbox" className="check" checked={s.bought} onChange={() => toggle(s.id)} aria-label={`${s.name} 구매 완료`} />
                  <div className="item-body">
                    <strong>{s.name}</strong>
                    {s.where && <div className="muted">{s.where}</div>}
                    {s.price > 0 && <div className="cost">{formatWon(s.price)}</div>}
                  </div>
                </div>
                <div className="item-actions">
                  <span className="spacer" />
                  <button className="ghost" onClick={() => setEditing(s.id)}>
                    수정
                  </button>
                  <ConfirmButton
                    label="삭제"
                    prompt={`'${s.name}' 삭제?`}
                    onConfirm={() => onChange((t) => ({ ...t, shopping: t.shopping.filter((x) => x.id !== s.id) }))}
                  />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {boughtCount > 0 && (
        <div className="row actions">
          <ConfirmButton
            label={`산 것 ${boughtCount}개 삭제`}
            prompt={`산 ${boughtCount}개를 목록에서 삭제할까요?`}
            onConfirm={() => onChange((t) => ({ ...t, shopping: t.shopping.filter((s) => !s.bought) }))}
          />
        </div>
      )}
    </section>
  )
}

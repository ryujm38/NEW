import { useState } from 'react'
import {
  actualByCategory,
  actualTotal,
  defaultExpenseDate,
  expenseFromPlanned,
  krwOf,
  LEDGER_KEYS,
  perPerson,
  plannedByCategory,
  unrecordedPlanned,
} from '../../lib/ledger'
import { budgetBreakdown, dateLabel, formatWon, todayString } from '../../lib/trip'
import { LEDGER_CATEGORIES, type Expense, type Trip } from '../../types'
import { ConfirmButton } from '../ConfirmButton'
import { ExpenseForm } from './ExpenseForm'
import { FxPanel } from './FxPanel'

interface Props {
  trip: Trip
  onChange: (fn: (t: Trip) => Trip) => void
}

const fmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 })
const signed = (n: number) => (n > 0 ? `+${formatWon(n)}` : n < 0 ? `-${formatWon(-n)}` : '0원')

export function LedgerStep({ trip, onChange }: Props) {
  // 'new' | 수정 중인 지출 id | null
  const [mode, setMode] = useState<string | null>(trip.expenses.length === 0 ? 'new' : null)
  const foreign = trip.currency !== 'KRW'
  const defaultDate = defaultExpenseDate(trip, todayString())

  const actual = actualTotal(trip.expenses)
  const planned = budgetBreakdown(trip).total
  const actualCat = actualByCategory(trip.expenses)
  const plannedCat = plannedByCategory(trip)
  const pending = unrecordedPlanned(trip)
  const overBudget = trip.budget > 0 && actual > trip.budget
  const percent = trip.budget > 0 ? Math.min(100, Math.round((actual / trip.budget) * 100)) : 0
  const rows = LEDGER_KEYS.filter((k) => plannedCat[k] > 0 || actualCat[k] > 0)

  const addExpense = (e: Expense) => onChange((t) => ({ ...t, expenses: [...t.expenses, e] }))
  const saveExpense = (e: Expense) => {
    onChange((t) => ({ ...t, expenses: t.expenses.map((x) => (x.id === e.id ? e : x)) }))
    setMode(null)
  }

  // 날짜별로 묶는다(같은 날 안에서는 입력한 순서).
  const sorted = trip.expenses.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const groups: { date: string; list: Expense[] }[] = []
  for (const e of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.date === e.date) last.list.push(e)
    else groups.push({ date: e.date, list: [e] })
  }

  return (
    <section aria-label="가계부">
      <h2>가계부</h2>
      <p className="muted">여행 중에 쓴 돈을 기록하고, 계획과 비교해요. 외화로 쓴 돈은 원화로 환산해 합산해요.</p>

      <section className="card" aria-label="지출 요약">
        <div className="budget-line">
          <span>실제 지출</span>
          <strong className={overBudget ? 'over' : ''}>{formatWon(actual)}</strong>
        </div>
        {trip.travelers > 1 && (
          <p className="muted">
            1인당 {formatWon(perPerson(actual, trip.travelers))} ({trip.travelers}명)
          </p>
        )}
        {trip.budget > 0 ? (
          <>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="예산 대비 지출">
              <div className={overBudget ? 'fill over' : 'fill'} style={{ width: `${percent}%` }} />
            </div>
            <p className={overBudget ? 'error' : 'muted'}>
              {overBudget
                ? `예산(${formatWon(trip.budget)})을 ${formatWon(actual - trip.budget)} 넘게 썼어요.`
                : `예산 ${formatWon(trip.budget)} 중 ${percent}% · ${formatWon(trip.budget - actual)} 남음`}
            </p>
          </>
        ) : (
          <p className="muted">'기본'에서 총 예산을 입력하면 예산 대비 지출을 보여 드려요.</p>
        )}
        {planned > 0 && (
          <p className="muted">
            계획 {formatWon(planned)} · {actual === planned ? '계획과 같아요' : actual > planned ? `계획보다 ${formatWon(actual - planned)} 더 썼어요` : `계획보다 ${formatWon(planned - actual)} 덜 썼어요`}
          </p>
        )}
      </section>

      {foreign && <FxPanel trip={trip} onChange={onChange} />}

      {mode === 'new' ? (
        <ExpenseForm trip={trip} defaultDate={defaultDate} submitLabel="기록" keepOpen onSubmit={addExpense} onCancel={() => setMode(null)} />
      ) : (
        <div className="row actions">
          <button className="primary" onClick={() => setMode('new')}>
            + 지출 기록
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <details className="planned">
          <summary>계획한 비용 {pending.length}건 · 한 번에 기록하기</summary>
          <p className="muted">항공·숙소·일정·산 쇼핑에 적어 둔 비용을 지출로 옮겨요. 실제로 다르게 썼다면 옮긴 뒤 고치세요.</p>
          <ul className="items">
            {pending.map((p) => (
              <li key={p.id} className="card item compact">
                <div className="item-main">
                  <div className="item-body">
                    <strong>{p.title}</strong>
                    <span className="tag">{LEDGER_CATEGORIES[p.category]}</span>
                    <div className="muted">{formatWon(p.amount)}</div>
                  </div>
                  <button className="ghost" onClick={() => addExpense(expenseFromPlanned(p, p.date || defaultDate))}>
                    기록
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="row actions">
            <button
              className="ghost"
              onClick={() => onChange((t) => ({ ...t, expenses: [...t.expenses, ...unrecordedPlanned(t).map((p) => expenseFromPlanned(p, p.date || defaultDate))] }))}
            >
              모두 기록 ({pending.length}건)
            </button>
          </div>
        </details>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="ledger-table">
            <caption className="sr-only">분류별 계획과 실제 지출</caption>
            <thead>
              <tr>
                <th scope="col">분류</th>
                <th scope="col">계획</th>
                <th scope="col">실제</th>
                <th scope="col">차이</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const diff = actualCat[k] - plannedCat[k]
                return (
                  <tr key={k}>
                    <th scope="row">{LEDGER_CATEGORIES[k]}</th>
                    <td>{fmt.format(plannedCat[k])}</td>
                    <td>{fmt.format(actualCat[k])}</td>
                    <td className={plannedCat[k] > 0 && diff > 0 ? 'over' : ''}>{diff === 0 ? '-' : signed(diff).replace('원', '')}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">합계 (원)</th>
                <td>{fmt.format(planned)}</td>
                <td>{fmt.format(actual)}</td>
                <td>{actual === planned ? '-' : signed(actual - planned).replace('원', '')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.date} className="day" aria-label={`${dateLabel(g.date)} 지출`}>
          <div className="day-head">
            <h3>{dateLabel(g.date)}</h3>
            <span className="muted">{formatWon(g.list.reduce((s, e) => s + krwOf(e), 0))}</span>
          </div>
          <ul className="items">
            {g.list.map((e) => (
              <li key={e.id} className="card item compact">
                {mode === e.id ? (
                  <ExpenseForm trip={trip} initial={e} defaultDate={defaultDate} submitLabel="저장" onSubmit={saveExpense} onCancel={() => setMode(null)} />
                ) : (
                  <>
                    <div className="item-main">
                      <div className="item-body">
                        <strong>{e.title}</strong>
                        <span className="tag">{LEDGER_CATEGORIES[e.category]}</span>
                        <div className="cost">
                          {e.currency === 'KRW' ? formatWon(e.amount) : `${fmt.format(e.amount)} ${e.currency}`}
                          {e.currency !== 'KRW' && <span className="muted"> ≈ {formatWon(krwOf(e))}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="item-actions">
                      <span className="spacer" />
                      <button className="ghost" onClick={() => setMode(e.id)}>
                        수정
                      </button>
                      <ConfirmButton
                        label="삭제"
                        prompt={`'${e.title}' 삭제?`}
                        onConfirm={() => onChange((t) => ({ ...t, expenses: t.expenses.filter((x) => x.id !== e.id) }))}
                      />
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

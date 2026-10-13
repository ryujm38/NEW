import { useState } from 'react'
import { COUNTRIES, DOMESTIC, findCountry, isDomestic } from '../lib/countries'
import { CURRENCIES } from '../lib/currencies'
import { validateDates, type BasicValues } from '../lib/trip'

export type TripFormValues = BasicValues

interface Props {
  initial?: TripFormValues
  submitLabel: string
  onSubmit: (values: TripFormValues) => void
  onCancel?: () => void
}

export function TripForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [country, setCountry] = useState(initial?.country ?? DOMESTIC)
  const [currency, setCurrency] = useState(initial?.currency ?? 'KRW')
  // 사용자가 통화를 직접 고르기 전까지는 나라를 바꿀 때마다 그 나라의 기본 통화를 따라간다.
  const [currencyTouched, setCurrencyTouched] = useState(Boolean(initial) && initial?.currency !== findCountry(initial?.country ?? '')?.currency)
  const [name, setName] = useState(initial?.name ?? '')
  const [destination, setDestination] = useState(initial?.destination ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [budget, setBudget] = useState(initial?.budget ? String(initial.budget) : '')
  const [travelers, setTravelers] = useState(String(initial?.travelers ?? 1))
  const [error, setError] = useState<string | null>(null)

  const overseas = !isDomestic(country)

  const changeCountry = (code: string) => {
    setCountry(code)
    if (!currencyTouched) setCurrency(findCountry(code)?.currency ?? 'KRW')
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const dateError = validateDates(startDate, endDate)
    if (!destination.trim()) return setError('도시·지역을 입력해 주세요.')
    if (dateError) return setError(dateError)
    const budgetNum = budget === '' ? 0 : Number(budget)
    if (!Number.isFinite(budgetNum) || budgetNum < 0) return setError('예산은 0 이상의 숫자로 입력해 주세요.')
    const people = Number(travelers)
    if (!Number.isInteger(people) || people < 1 || people > 99) return setError('인원은 1~99명 사이의 정수로 입력해 주세요.')
    onSubmit({
      name: name.trim() || `${destination.trim()} 여행`,
      destination: destination.trim(),
      country,
      currency: overseas ? currency : 'KRW',
      startDate,
      endDate,
      budget: budgetNum,
      travelers: people,
    })
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        나라
        <select value={country} onChange={(e) => changeCountry(e.target.value)}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="hint">
          나라를 정하면 같은 이름의 장소(일본과 미국의 유니버설 스튜디오처럼)를 구분해서 지도에서 찾아요.
          {country === 'ZZ' && ' 목록에 없는 나라는 도시·지역에 나라 이름도 함께 적어 주세요.'}
        </span>
      </label>
      <label>
        도시·지역
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={overseas ? '예: 오사카, 파리' : '예: 제주, 부산'}
          autoFocus={!initial}
        />
      </label>
      <label>
        여행 이름 (선택)
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="비워 두면 '도시·지역 여행'" />
      </label>
      <div className="row">
        <label>
          출발일
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
            }}
          />
        </label>
        <label>
          도착일
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          총 예산 (원, 선택)
          <input type="number" inputMode="numeric" min="0" step="1000" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label>
          인원 (명)
          <input type="number" inputMode="numeric" min="1" max="99" step="1" value={travelers} onChange={(e) => setTravelers(e.target.value)} />
        </label>
      </div>
      {overseas && (
        <label>
          현지 통화
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              setCurrencyTouched(true)
            }}
          >
            {Object.entries(CURRENCIES)
              .filter(([code]) => code !== 'KRW')
              .map(([code, label]) => (
                <option key={code} value={code}>
                  {code} · {label}
                </option>
              ))}
          </select>
          <span className="hint">여행지에서 쓰는 돈이에요. 가계부에서 원화로 환산해 줘요.</span>
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row actions">
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

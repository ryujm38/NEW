// 환율. 모든 환율은 "1 외화 = rate 원"으로 다룬다.
//
// 주의: 아래 두 환율 제공처의 응답 형식은 각 서비스의 문서를 보고 쓴 것이다.
// 개발 환경에서 실제 호출로 확인하지는 못했다(네트워크 차단). 응답이 예상과 다르면 실패로 처리하고 직접 입력으로 넘어간다.

export interface FxQuote {
  /** 1 외화 = rate 원 */
  rate: number
  /** ISO 시각 */
  updatedAt: string
  /** 받아온 곳의 도메인 */
  source: string
}

const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null)
const round6 = (n: number) => Number(n.toPrecision(6))

/** open.er-api.com/v6/latest/KRW → { result: 'success', time_last_update_unix, rates: { JPY: 0.108 } } (KRW 1원당 외화) */
export function parseErApi(json: unknown, code: string): FxQuote | null {
  const r = rec(json)
  if (!r || r.result !== 'success') return null
  const perWon = positive(rec(r.rates)?.[code])
  if (!perWon) return null
  const unix = positive(r.time_last_update_unix)
  return { rate: round6(1 / perWon), updatedAt: unix ? new Date(unix * 1000).toISOString() : '', source: 'open.er-api.com' }
}

/** api.frankfurter.dev/v1/latest?base=KRW&symbols=JPY → { base: 'KRW', date: '2026-10-12', rates: { JPY: 0.108 } } */
export function parseFrankfurter(json: unknown, code: string): FxQuote | null {
  const r = rec(json)
  if (!r || r.base !== 'KRW') return null
  const perWon = positive(rec(r.rates)?.[code])
  if (!perWon) return null
  const date = typeof r.date === 'string' ? new Date(`${r.date}T00:00:00Z`) : null
  return { rate: round6(1 / perWon), updatedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : '', source: 'api.frankfurter.dev' }
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 8000

/**
 * 환율을 받아온다. 제공처를 차례로 시도하고, 모두 실패하면 던진다.
 * (open.er-api.com은 대만 달러·베트남 동 등 폭넓게 지원하고, frankfurter는 유럽중앙은행 기준이라 일부 통화가 없다.)
 */
export async function fetchRate(
  code: string,
  fetcher: Fetcher = (url, init) => fetch(url, init),
  now: () => Date = () => new Date(),
): Promise<FxQuote> {
  if (code === 'KRW') return { rate: 1, updatedAt: now().toISOString(), source: '' }
  const providers: { url: string; parse: (json: unknown, code: string) => FxQuote | null }[] = [
    { url: 'https://open.er-api.com/v6/latest/KRW', parse: parseErApi },
    { url: `https://api.frankfurter.dev/v1/latest?base=KRW&symbols=${encodeURIComponent(code)}`, parse: parseFrankfurter },
  ]
  for (const p of providers) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const res = await fetcher(p.url, { signal: ctl.signal })
      if (!res.ok) continue
      const quote = p.parse(await res.json(), code)
      if (quote) return { ...quote, updatedAt: quote.updatedAt || now().toISOString() }
    } catch {
      // 네트워크 차단·시간 초과·잘못된 응답이면 다음 제공처로 넘어간다.
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('환율을 가져오지 못했어요.')
}

/** 사람이 읽기 편한 기준 단위. 엔은 100, 동·루피아는 10,000 단위로 보여준다. */
export function rateUnit(rate: number): number {
  if (rate >= 20) return 1
  if (rate >= 0.2) return 100
  return 10000
}

/** 환율을 아직 모를 때 입력창에 쓸 기준 단위. 값이 작은 통화는 100·10,000 단위로 입력한다. */
const DEFAULT_UNITS: Record<string, number> = {
  JPY: 100, VND: 10000, IDR: 10000, LAK: 10000, UZS: 10000, KZT: 100, HUF: 100, CLP: 100, INR: 100, RUB: 100, LKR: 100, NPR: 100, MNT: 100, ARS: 100,
}

export const defaultUnit = (code: string): number => DEFAULT_UNITS[code] ?? 1

/** 입력·표시에 쓸 기준 단위: 환율을 알면 그 크기에 맞춰, 모르면 통화별 기본값 */
export const unitFor = (code: string, rate: number): number => (rate > 0 ? rateUnit(rate) : defaultUnit(code))

export function rateLabel(code: string, rate: number): string {
  if (!(rate > 0)) return '환율 미설정'
  const unit = rateUnit(rate)
  const won = rate * unit
  const fmt = new Intl.NumberFormat('ko-KR')
  const text = won >= 100 ? fmt.format(Math.round(won)) : String(Number(won.toFixed(2)))
  return `${fmt.format(unit)} ${code} = ${text}원`
}

export const toKrw = (amount: number, rate: number): number => Math.round(amount * rate)

/** 마지막으로 받아온 지 hours시간이 지났거나 시각을 모르면 true */
export function isStale(updatedAt: string, now: Date = new Date(), hours = 12): boolean {
  const t = Date.parse(updatedAt)
  return Number.isNaN(t) || now.getTime() - t > hours * 3_600_000
}

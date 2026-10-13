export interface Country {
  /** ISO 3166-1 alpha-2. 목록에 없는 나라는 'ZZ'(기타) */
  code: string
  name: string
  /** 기본 통화(추천값, 바꿀 수 있다) */
  currency: string
}

/** 한국인이 많이 가는 나라 위주. 앞쪽일수록 자주 가는 곳이다. 없는 나라는 '기타'를 고르고 도시·지역에 적는다. */
export const COUNTRIES: Country[] = [
  { code: 'KR', name: '대한민국', currency: 'KRW' },
  { code: 'JP', name: '일본', currency: 'JPY' },
  { code: 'TW', name: '대만', currency: 'TWD' },
  { code: 'CN', name: '중국', currency: 'CNY' },
  { code: 'HK', name: '홍콩', currency: 'HKD' },
  { code: 'MO', name: '마카오', currency: 'MOP' },
  { code: 'VN', name: '베트남', currency: 'VND' },
  { code: 'TH', name: '태국', currency: 'THB' },
  { code: 'PH', name: '필리핀', currency: 'PHP' },
  { code: 'SG', name: '싱가포르', currency: 'SGD' },
  { code: 'MY', name: '말레이시아', currency: 'MYR' },
  { code: 'ID', name: '인도네시아', currency: 'IDR' },
  { code: 'KH', name: '캄보디아', currency: 'USD' },
  { code: 'LA', name: '라오스', currency: 'LAK' },
  { code: 'MN', name: '몽골', currency: 'MNT' },
  { code: 'IN', name: '인도', currency: 'INR' },
  { code: 'NP', name: '네팔', currency: 'NPR' },
  { code: 'LK', name: '스리랑카', currency: 'LKR' },
  { code: 'MV', name: '몰디브', currency: 'USD' },
  { code: 'UZ', name: '우즈베키스탄', currency: 'UZS' },
  { code: 'KZ', name: '카자흐스탄', currency: 'KZT' },
  { code: 'GU', name: '괌', currency: 'USD' },
  { code: 'MP', name: '사이판(북마리아나 제도)', currency: 'USD' },
  { code: 'US', name: '미국', currency: 'USD' },
  { code: 'CA', name: '캐나다', currency: 'CAD' },
  { code: 'MX', name: '멕시코', currency: 'MXN' },
  { code: 'GB', name: '영국', currency: 'GBP' },
  { code: 'FR', name: '프랑스', currency: 'EUR' },
  { code: 'IT', name: '이탈리아', currency: 'EUR' },
  { code: 'ES', name: '스페인', currency: 'EUR' },
  { code: 'PT', name: '포르투갈', currency: 'EUR' },
  { code: 'DE', name: '독일', currency: 'EUR' },
  { code: 'AT', name: '오스트리아', currency: 'EUR' },
  { code: 'NL', name: '네덜란드', currency: 'EUR' },
  { code: 'BE', name: '벨기에', currency: 'EUR' },
  { code: 'IE', name: '아일랜드', currency: 'EUR' },
  { code: 'GR', name: '그리스', currency: 'EUR' },
  { code: 'FI', name: '핀란드', currency: 'EUR' },
  { code: 'HR', name: '크로아티아', currency: 'EUR' },
  { code: 'CH', name: '스위스', currency: 'CHF' },
  { code: 'CZ', name: '체코', currency: 'CZK' },
  { code: 'HU', name: '헝가리', currency: 'HUF' },
  { code: 'PL', name: '폴란드', currency: 'PLN' },
  { code: 'RO', name: '루마니아', currency: 'RON' },
  { code: 'TR', name: '튀르키예', currency: 'TRY' },
  { code: 'IS', name: '아이슬란드', currency: 'ISK' },
  { code: 'NO', name: '노르웨이', currency: 'NOK' },
  { code: 'SE', name: '스웨덴', currency: 'SEK' },
  { code: 'DK', name: '덴마크', currency: 'DKK' },
  { code: 'RU', name: '러시아', currency: 'RUB' },
  { code: 'AE', name: '아랍에미리트', currency: 'AED' },
  { code: 'QA', name: '카타르', currency: 'QAR' },
  { code: 'IL', name: '이스라엘', currency: 'ILS' },
  { code: 'JO', name: '요르단', currency: 'JOD' },
  { code: 'EG', name: '이집트', currency: 'EGP' },
  { code: 'MA', name: '모로코', currency: 'MAD' },
  { code: 'ZA', name: '남아프리카공화국', currency: 'ZAR' },
  { code: 'KE', name: '케냐', currency: 'KES' },
  { code: 'AU', name: '호주', currency: 'AUD' },
  { code: 'NZ', name: '뉴질랜드', currency: 'NZD' },
  { code: 'BR', name: '브라질', currency: 'BRL' },
  { code: 'AR', name: '아르헨티나', currency: 'ARS' },
  { code: 'PE', name: '페루', currency: 'PEN' },
  { code: 'CL', name: '칠레', currency: 'CLP' },
  { code: 'ZZ', name: '기타', currency: 'USD' },
]

export const DOMESTIC = 'KR'

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code)
}

export const isDomestic = (code: string): boolean => code === DOMESTIC

/**
 * 나라 이름이 글 속에 들어 있으면 그 나라를 돌려준다(예: '대만 타이베이'). 기타·국내는 추측하지 않는다.
 * 이름이 다른 이름 안에 들어 있는 경우('인도'와 '인도네시아')를 위해 가장 긴 이름이 일치한 나라를 고른다.
 */
export function inferCountry(text: string): Country | undefined {
  const t = text.trim()
  if (!t) return undefined
  const shortName = (c: Country) => c.name.split('(')[0]
  return COUNTRIES.filter((c) => c.code !== 'ZZ' && c.code !== DOMESTIC && t.includes(shortName(c))).sort(
    (a, b) => shortName(b).length - shortName(a).length,
  )[0]
}

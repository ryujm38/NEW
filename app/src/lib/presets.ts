/** 준비물 체크리스트에서 눌러서 바로 추가할 수 있는 자주 챙기는 항목. */
export const PACKING_PRESETS: { group: string; items: string[] }[] = [
  { group: '서류·결제', items: ['여권', '항공권·예약 확인서', '여행자보험', '신용카드', '현금'] },
  { group: '전자기기', items: ['휴대폰 충전기', '보조배터리', '멀티 어댑터', '이어폰'] },
  { group: '생활', items: ['상비약', '세면도구', '선크림', '우산'] },
  { group: '옷', items: ['속옷·양말', '편한 신발', '겉옷'] },
]

/** 국내 여행에서는 해외에서만 필요한 것(여권, 변환 어댑터, 여행자보험 등)을 뺀다. */
const OVERSEAS_ONLY = new Set(['여권', '항공권·예약 확인서', '여행자보험', '멀티 어댑터'])

export function packingPresetsFor(domestic: boolean): { group: string; items: string[] }[] {
  const groups = PACKING_PRESETS.map((g) => ({
    group: g.group,
    items: domestic ? g.items.filter((n) => !OVERSEAS_ONLY.has(n)) : [...g.items],
  }))
  if (domestic) groups.find((g) => g.group === '서류·결제')?.items.unshift('신분증')
  return groups.filter((g) => g.items.length > 0)
}

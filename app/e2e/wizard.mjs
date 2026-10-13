import { OUT_DIR as SP, launch } from './env.mjs'
const URL = process.env.APP_URL
const browser = await launch()
const errors = []
let failed = 0
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failed++ }
const step = (page, name) => page.locator('.stepper').getByRole('button', { name: new RegExp(`^${name}`) })

async function run(name, viewport) {
  console.log(`--- ${name} ---`)
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: console ${m.text()}`))
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

  await page.goto(URL)
  // 1) 새 여행 → 항공 단계로 자동 이동
  await page.getByRole('button', { name: '+ 새 여행 만들기' }).click()
  await page.getByLabel('도시·지역').fill('제주')
  await page.getByLabel('출발일').fill('2026-11-05')
  await page.getByLabel('도착일').fill('2026-11-08')
  await page.getByLabel('총 예산 (원, 선택)').fill('1000000')
  await page.getByRole('button', { name: '만들기' }).click()
  await page.waitForSelector('.calendar')
  ok((await page.locator('.cal-cell').count()) === 4, '새 여행을 만들면 캘린더가 먼저 보인다 (4일)')
  ok(await page.getByRole('note').getByText('여행 준비를 시작해 볼까요?').isVisible(), '비어 있는 새 여행에는 시작 안내가 보인다')
  await page.getByRole('button', { name: '항공권부터 등록하기' }).click()
  await page.waitForSelector('h2:has-text("항공권")')
  ok((await step(page, '항공').getAttribute('aria-current')) === 'step', '안내를 따라 항공 단계로 들어간다')
  ok(await page.getByRole('button', { name: '왕복 2건 추가' }).isVisible(), '항공이 비어 있으면 왕복 입력창이 열려 있다')

  const stepperBox = await page.locator('.stepper').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
  ok(stepperBox.sw <= stepperBox.cw + 1, `${name} 단계 탭 5개가 한 화면에 모두 보인다 (scrollWidth ${stepperBox.sw} / clientWidth ${stepperBox.cw})`)
  // 2) 왕복 한 번에
  await page.getByLabel('출발지').fill('인천')
  await page.getByLabel('가는 편 출발 시간').fill('09:00')
  await page.getByLabel('오는 편 출발 시간').fill('20:00')
  await page.getByLabel('왕복 총 비용 (원, 선택)').fill('150000')
  await page.getByRole('button', { name: '왕복 2건 추가' }).click()
  ok((await page.locator('.item').count()) === 2, '왕복 입력으로 항공 2건 생성')
  const flightsText = await page.locator('.items').innerText()
  ok(flightsText.includes('인천 → 제주') && flightsText.includes('제주 → 인천'), '가는 편/오는 편 방향이 맞다')
  ok(flightsText.includes('11/5 (목)') && flightsText.includes('11/8 (일)'), '가는 날=출발일, 오는 날=도착일')
  ok(await page.getByRole('region', { name: '예산' }).innerText().then((t) => t.includes('150,000원')), '항공 비용이 예산에 반영')
  if (await overflow()) ok(false, `${name} 항공 단계 가로 스크롤`)
  await page.screenshot({ path: `${SP}/wiz-${name}-flights.png`, fullPage: true })

  // 3) 숙소: 빈 밤 경고 → 해소
  await page.getByRole('button', { name: /^다음: 숙소/ }).click()
  await page.waitForSelector('h2:has-text("숙소")')
  await page.getByLabel('숙소 이름').fill('제주호텔')
  await page.getByLabel('체크아웃').fill('2026-11-07')
  await page.getByLabel('숙박 총 비용 (원)').fill('200000')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  const warn1 = await page.getByRole('status').filter({ hasText: '숙소가 없는 밤' }).innerText()
  ok(warn1.includes('11/7 (토)'), `숙소가 비는 밤을 알려준다 → ${warn1.replace(/\n/g, ' ')}`)
  await page.getByRole('button', { name: '+ 숙소 추가' }).click()
  ok((await page.getByLabel('체크인').inputValue()) === '2026-11-07', '두 번째 숙소의 체크인은 이전 체크아웃 날짜로 채워진다')
  await page.getByLabel('숙소 이름').fill('서귀포 게스트하우스')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  ok((await page.getByRole('status').filter({ hasText: '숙소가 없는 밤' }).count()) === 0, '이어서 예약하면 경고가 사라진다')

  await page.screenshot({ path: `${SP}/wiz-${name}-stays.png`, fullPage: true })
  // 4) 일정: 자동 표시
  await page.getByRole('button', { name: /^다음: 일정/ }).click()
  await page.waitForSelector('h2:has-text("일정")')
  ok(!(await overflow()), `${name} 일정 단계에서 가로 스크롤 없음`)
  const day1 = page.getByRole('region', { name: '1일차' })
  const day4 = page.getByRole('region', { name: '4일차' })
  const ev1 = await day1.locator('.events').innerText()
  ok(ev1.includes('항공 인천 → 제주') && ev1.includes('숙소 체크인 · 제주호텔'), '1일차에 출발 항공과 체크인이 자동 표시')
  ok(ev1.indexOf('항공') < ev1.indexOf('체크인'), '시간순: 항공이 체크인보다 먼저')
  const ev4 = await day4.locator('.events').innerText()
  ok(ev4.includes('체크아웃 · 서귀포 게스트하우스') && ev4.includes('항공 제주 → 인천'), '마지막 날에 체크아웃과 귀국 항공')

  // 5) 빠른 추가 + 완료 체크 + 숨기기 + 완료 삭제
  await day1.getByLabel('1일차 일정 이름').fill('성산일출봉')
  await day1.getByLabel('1일차 일정 이름').press('Enter')
  await day1.getByLabel('1일차 일정 이름').fill('흑돼지 점심')
  await day1.getByLabel('1일차 일정 이름').press('Enter')
  ok((await day1.locator('.item').count()) === 2, '이름만 입력하고 Enter로 일정 2개 추가')
  await day1.getByRole('checkbox', { name: '성산일출봉 완료' }).check()
  ok((await day1.locator('.day-head').innerText()).includes('1/2 완료'), '완료하면 일차 진행 표시(1/2)')
  ok((await day1.locator('.item.done').count()) === 1, '완료한 일정은 완료 스타일')
  await page.getByLabel('완료한 일정 숨기기').check()
  ok((await day1.locator('.item').count()) === 1, '완료한 일정 숨기기')
  await page.getByLabel('완료한 일정 숨기기').uncheck()
  await day1.getByRole('button', { name: '완료 1개 삭제' }).click()
  await day1.locator('.confirm').getByRole('button', { name: '삭제' }).click()
  ok((await day1.locator('.item').count()) === 1 && (await day1.locator('.item strong').innerText()) === '흑돼지 점심', '완료한 것만 삭제되고 나머지는 남는다')
  if (await overflow()) ok(false, `${name} 일정 단계 가로 스크롤`)
  await page.screenshot({ path: `${SP}/wiz-${name}-plan.png`, fullPage: true })

  // 6) 쇼핑
  await page.getByRole('button', { name: /^다음: 준비/ }).click()
  await page.waitForSelector('h2:has-text("준비")')
  for (const [n, p] of [['감귤초콜릿', '12000'], ['한라봉', '']]) {
    await page.getByLabel('쇼핑 물건 이름', { exact: true }).fill(n)
    if (p) await page.getByLabel('쇼핑 물건 이름 예상 가격').fill(p)
    await page.getByLabel('쇼핑 물건 이름', { exact: true }).press('Enter')
  }
  ok((await page.locator('.item').count()) === 2, '쇼핑 물건 2개 추가')
  await page.getByRole('checkbox', { name: '감귤초콜릿 구매 완료' }).check()
  const order = await page.locator('.item strong').allTextContents()
  ok(order.join(',') === '한라봉,감귤초콜릿', `산 것은 아래로 이동 → ${order.join(' > ')}`)
  const sum = await page.locator('.muted', { hasText: '남은 것' }).innerText()
  ok(sum.includes('남은 것 1개') && sum.includes('산 것 1개'), `쇼핑 요약 → ${sum}`)
  const budget = await page.getByRole('region', { name: '예산' }).innerText()
  ok(budget.includes('362,000원'), `예산 합계 = 항공 150,000 + 숙소 200,000 + 쇼핑 12,000 → ${budget.split('\n').slice(0, 2).join(' ')}`)
  await page.screenshot({ path: `${SP}/wiz-${name}-shopping.png`, fullPage: true })

  // 7) 기본 단계에서 수정, 새로고침 후 단계/데이터 유지
  await step(page, '기본').click()
  const detail = await page.locator('.breakdown').innerText()
  ok(detail.includes('150,000원') && detail.includes('200,000원') && detail.includes('12,000원'), '기본 단계에 항목별 예산 내역')
  await page.reload()
  await page.waitForSelector('h2:has-text("기본 정보")')
  ok(true, '새로고침해도 같은 단계 유지')
  await step(page, '숙소').click()
  ok((await page.locator('.item').count()) === 2, '새로고침 후에도 숙소 데이터 유지')

  // 8) 공유 텍스트(클립보드 거부 환경 가정)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true })
  })
  await page.getByRole('button', { name: '공유' }).click()
  const shared = await page.locator('textarea[aria-label="공유할 일정 텍스트"]').inputValue()
  ok(['[항공]', '[숙소]', '[쇼핑]', '인천 → 제주', '제주호텔', '✔ 감귤초콜릿', '총 예상 비용: 362,000원'].every((x) => shared.includes(x)), '공유 텍스트에 항공·숙소·쇼핑·합계 포함')
  await ctx.close()
}

await run('mobile', { width: 390, height: 844 })
await run('desktop', { width: 1280, height: 900 })

// 이전 버전(항공/숙소/쇼핑/done 없음)으로 저장된 데이터가 그대로 열리는지
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('legacy: ' + e.message))
  await page.addInitScript(() => {
    localStorage.setItem('travel-planner:v1', JSON.stringify({ version: 1, trips: [
      { id: 'old', name: '예전 여행', destination: '부산', startDate: '2026-12-01', endDate: '2026-12-02', budget: 0,
        items: [{ id: 'i', date: '2026-12-01', time: '10:00', title: '해운대', place: '', note: '', cost: 5000, category: 'sight' }], createdAt: '' } ] }))
  })
  await page.goto(URL)
  await page.locator('.trip-card').first().click()
  await page.locator('.entry', { hasText: '일정' }).click()
  await page.waitForSelector('h2:has-text("일정")')
  ok((await page.locator('.item strong').innerText()) === '해운대', '예전 형식의 저장 데이터도 그대로 열린다')
  await page.getByRole('checkbox', { name: '해운대 완료' }).check()
  ok(await page.getByRole('checkbox', { name: '해운대 완료' }).isChecked(), '예전 일정에도 완료 체크가 된다')
  await ctx.close()
}

await browser.close()
ok(errors.length === 0, '콘솔/페이지 에러 없음 ' + (errors.length ? JSON.stringify(errors) : ''))
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exitCode = failed ? 1 : 0

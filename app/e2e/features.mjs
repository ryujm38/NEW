import { OUT_DIR as SP, launch } from './env.mjs'
const URL = process.env.APP_URL
const browser = await launch()
const errors = []
let failed = 0
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failed++ }

const seed = {
  version: 1,
  trips: [{
    id: 't1', name: '제주 여행', destination: '제주', startDate: '2026-11-05', endDate: '2026-11-08', budget: 0, createdAt: '',
    items: [], ideas: [], packing: [], shopping: [],
    flights: [
      { id: 'f1', flightNo: 'KE1201', from: '인천(ICN)', to: '제주(CJU)', departDate: '2026-11-05', departTime: '10:30', arriveDate: '2026-11-05', arriveTime: '11:40', cost: 0, note: '' },
      { id: 'f2', flightNo: 'KE1202', from: '제주(CJU)', to: '인천(ICN)', departDate: '2026-11-08', departTime: '19:00', arriveDate: '2026-11-08', arriveTime: '20:10', cost: 0, note: '' },
    ],
    stays: [
      { id: 's1', name: '제주호텔', address: '', checkIn: '2026-11-05', checkOut: '2026-11-07', cost: 0, note: '' },
      { id: 's2', name: '서귀포 게스트하우스', address: '', checkIn: '2026-11-07', checkOut: '2026-11-08', cost: 0, note: '' },
    ],
  }],
}

async function run(name, viewport) {
  console.log(`--- ${name} ---`)
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR' })
  await ctx.addInitScript((data) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('travel-planner:v1', JSON.stringify(data)); localStorage.setItem('seeded', '1') } }, seed)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: console ${m.text()}`))
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  const day = (n) => page.getByRole('region', { name: `${n}일차` })

  await page.goto(`${URL}#/trip/t1/plan`)
  await page.waitForSelector('h2:has-text("일정")')

  // --- 후보지 보관함 ---
  ok(!(await page.locator('.ideas-wrap').evaluate((el) => el.open)), '후보지가 없으면 보관함은 접혀 있다')
  await page.locator('.ideas-wrap > summary').click()
  for (const t of ['우도', '섭지코지']) {
    await page.getByLabel('후보지 이름', { exact: true }).fill(t)
    await page.getByLabel('후보지 이름', { exact: true }).press('Enter')
  }
  ok((await page.locator('.ideas .item').count()) === 2, '후보지 2개를 보관함에 추가')
  const udo = page.locator('.ideas .item', { hasText: '우도' })
  await udo.getByRole('button', { name: '수정' }).click()
  await page.getByLabel('장소 (지도 링크에 사용)').fill('우도 선착장')
  await page.getByRole('button', { name: '저장' }).click()
  ok((await page.locator('.ideas .item', { hasText: '우도' }).innerText()).includes('우도 선착장'), '후보지 장소를 수정할 수 있다')
  await page.getByLabel('우도 넣을 날짜').selectOption('2026-11-06')
  await page.locator('.ideas .item', { hasText: '우도' }).getByRole('button', { name: '일정에 넣기' }).click()
  ok((await page.locator('.ideas .item').count()) === 1, '일정에 넣으면 보관함에서 빠진다')
  ok((await day(2).locator('.item strong').allTextContents()).includes('우도'), '선택한 날짜(2일차)의 일정으로 들어간다')
  ok((await day(2).locator('.item').innerText()).includes('우도 선착장'), '후보지의 장소가 일정에 이어진다')
  await page.locator('.ideas .item', { hasText: '섭지코지' }).getByRole('button', { name: '수정' }).click()
  await page.getByLabel('장소 (지도 링크에 사용)').fill('섭지코지')
  await page.getByRole('button', { name: '저장' }).click()
  await page.getByLabel('섭지코지 넣을 날짜').selectOption('2026-11-06')
  await page.getByRole('button', { name: '일정에 넣기' }).click()
  ok((await day(2).locator('.item').count()) === 2, '두 번째 후보지도 2일차로')

  // --- 하루 경로 링크 (숙소 기점) ---
  const routeLink = day(2).getByRole('link', { name: /경로 보기/ })
  let q = new globalThis.URL(await routeLink.getAttribute('href')).searchParams
  ok(q.get('origin') === '제주호텔 제주' && q.get('destination') === '제주호텔 제주', `경로: 숙소에서 출발해 숙소로 복귀 → ${q.get('origin')} … ${q.get('destination')}`)
  ok(q.get('waypoints') === '우도 선착장 제주|섭지코지 제주', `경유지가 일정 순서대로 → ${q.get('waypoints')}`)
  await page.getByLabel('경로에 숙소 복귀 포함').uncheck()
  q = new globalThis.URL(await day(2).getByRole('link', { name: /경로 보기/ }).getAttribute('href')).searchParams
  ok(q.get('origin') === '제주호텔 제주' && q.get('destination') !== '제주호텔 제주', `복귀를 끄면 마지막 장소가 도착지 → ${q.get('destination')}`)
  await page.getByLabel('경로에 숙소 복귀 포함').check()

  // --- 일정 가능 시간대·경고 ---
  const w1 = await day(1).locator('.window').innerText()
  ok(w1.includes('12:40') && w1.includes('도착 11:40'), `1일차: 도착 1시간 뒤부터 → ${w1}`)
  const w4 = await day(4).locator('.window').innerText()
  ok(w4.includes('17:00') && w4.includes('출발 19:00'), `4일차: 출발 2시간 전까지 → ${w4}`)

  // 불러오기 칩 + 도착 전 시간 경고
  await day(1).getByRole('button', { name: '자세히 추가' }).click()
  const chips = await day(1).locator('.chips .chip').allTextContents()
  ok(chips.includes('숙소 · 제주호텔') && chips.some((c) => c.includes('도착 · 제주(CJU)')), `등록한 숙소·공항을 불러오기 칩으로 제공 → ${chips.join(' / ')}`)
  await day(1).getByRole('button', { name: '숙소 · 제주호텔' }).click()
  ok((await day(1).getByLabel('장소 (지도 링크에 사용)').inputValue()) === '제주호텔', '칩을 누르면 장소가 채워진다')
  await day(1).getByLabel('제목').fill('호텔에 짐 맡기기')
  await day(1).getByLabel('시간').fill('10:00')
  await day(1).getByRole('button', { name: '추가', exact: true }).click()
  let warns = await day(1).locator('.warns').innerText()
  ok(warns.includes('호텔에 짐 맡기기') && warns.includes('12:40 이후'), `도착 전 일정에 경고 → ${warns.replace(/\n/g, ' / ')}`)

  for (const t of ['점심', '카페']) {
    await day(1).getByRole('button', { name: '자세히 추가' }).click()
    await day(1).getByLabel('제목').fill(t)
    await day(1).getByLabel('시간').fill('13:00')
    await day(1).getByRole('button', { name: '추가', exact: true }).click()
  }
  warns = await day(1).locator('.warns').innerText()
  ok(warns.includes('13:00에 일정 2개가 겹쳐요'), '같은 시간 일정이 겹치면 경고')
  ok(!warns.includes('점심 13:00'), '도착 이후 시간은 경고하지 않는다')

  // 완료하면 남은 경로에서 빠진다
  await day(2).getByRole('checkbox', { name: '우도 완료' }).check()
  q = new globalThis.URL(await day(2).getByRole('link', { name: /경로 보기/ }).getAttribute('href')).searchParams
  ok(q.get('waypoints') === '섭지코지 제주' && q.get('origin') === '제주호텔 제주', `완료한 일정은 남은 경로에서 제외 → 경유지 ${q.get('waypoints')}`)

  if (await overflow()) ok(false, `${name} 일정 단계 가로 스크롤`)
  await day(1).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SP}/feat-${name}-plan.png`, fullPage: true })

  // --- 준비물 체크리스트 ---
  await page.locator('.stepper').getByRole('button', { name: /^준비/ }).click()
  await page.waitForSelector('h3:has-text("준비물 체크리스트")')
  ok(await page.locator('.presets').evaluate((el) => el.open), '준비물이 비어 있으면 자주 챙기는 것이 펼쳐져 있다')
  ok((await page.getByRole('button', { name: '+ 여권' }).count()) === 0, '국내(제주) 여행에는 여권 추천이 없다')
  await page.getByRole('button', { name: '+ 신분증' }).click()
  await page.getByRole('button', { name: '+ 휴대폰 충전기' }).click()
  ok((await page.getByRole('button', { name: '+ 신분증' }).count()) === 0, '추가한 항목은 추천 칩에서 사라진다')
  await page.getByLabel('준비물 이름', { exact: true }).fill('카메라')
  await page.getByLabel('준비물 이름', { exact: true }).press('Enter')
  ok((await page.locator('section[aria-label="준비물 체크리스트"] .item').count()) === 3, '추천 2개 + 직접 입력 1개')
  await page.getByRole('checkbox', { name: '신분증 챙김' }).check()
  ok((await page.locator('section[aria-label="준비물 체크리스트"]').innerText()).includes('챙긴 것 1/3'), '챙긴 개수 표시')
  await page.locator('section[aria-label="준비물 체크리스트"] .item', { hasText: '카메라' }).getByRole('button', { name: '삭제' }).click()
  await page.locator('section[aria-label="준비물 체크리스트"] .item', { hasText: '카메라' }).locator('.confirm').getByRole('button', { name: '삭제' }).click()
  ok((await page.locator('section[aria-label="준비물 체크리스트"] .item').count()) === 2, '준비물 삭제')
  ok((await page.locator('.stepper').getByRole('button', { name: /^준비/ }).innerText()).includes('2'), '준비 탭에 개수 표시')
  await page.getByLabel('쇼핑 물건 이름', { exact: true }).fill('감귤초콜릿')
  await page.getByLabel('쇼핑 물건 이름', { exact: true }).press('Enter')
  ok((await page.locator('section[aria-label="쇼핑 목록"] .item').count()) === 1, '같은 단계에서 쇼핑 목록도 쓸 수 있다')
  if (await overflow()) ok(false, `${name} 준비 단계 가로 스크롤`)
  await page.screenshot({ path: `${SP}/feat-${name}-prep.png`, fullPage: true })

  // --- 공유 텍스트 ---
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true })
  })
  await page.getByRole('button', { name: '공유' }).click()
  const shared = await page.locator('textarea[aria-label="공유할 일정 텍스트"]').inputValue()
  ok(['[준비물]', '✔ 신분증', '- 휴대폰 충전기', '[쇼핑]', '섭지코지'].every((x) => shared.includes(x)), '공유 텍스트에 준비물·쇼핑·일정 포함')

  // --- 새로고침 후에도 유지 ---
  await page.reload()
  await page.waitForSelector('h2:has-text("준비")')
  ok((await page.locator('section[aria-label="준비물 체크리스트"] .item').count()) === 2, '새로고침 후 준비물 유지')
  await ctx.close()
}

await run('mobile', { width: 390, height: 844 })
await run('desktop', { width: 1280, height: 900 })
await browser.close()
ok(errors.length === 0, '콘솔/페이지 에러 없음 ' + (errors.length ? JSON.stringify(errors) : ''))
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exitCode = failed ? 1 : 0

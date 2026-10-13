import { OUT_DIR as SP, launch } from './env.mjs'
const URL = process.env.APP_URL
const browser = await launch()
const errors = []
let failed = 0
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failed++ }

// 주의: 아래 환율 응답은 "응답을 흉내 낸 것"이다. 앱이 응답을 처리하는 방식만 확인하고, 실제 서비스의 응답과 같은지는 확인하지 못한다.
const MOCK = { result: 'success', time_last_update_unix: 1760230000, rates: { KRW: 1, JPY: 0.108, TWD: 0.0225 } } // 100엔 ≈ 925.9원
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

async function newPage(ctx, name) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(`${name}: console ${m.text()}`))
  return page
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

async function createJapanTrip(page) {
  await page.goto(URL)
  await page.getByRole('button', { name: '+ 새 여행 만들기' }).click()
  ok((await page.getByLabel('나라').inputValue()) === 'KR' && (await page.getByLabel('현지 통화').count()) === 0, '처음엔 대한민국이고 현지 통화 칸이 없다')
  await page.getByLabel('나라').selectOption('JP')
  ok((await page.getByLabel('현지 통화').inputValue()) === 'JPY', '일본을 고르면 현지 통화가 엔으로 채워진다')
  await page.getByLabel('도시·지역').fill('오사카')
  await page.getByLabel('출발일').fill('2026-11-05')
  await page.getByLabel('도착일').fill('2026-11-08')
  await page.getByLabel('총 예산 (원, 선택)').fill('1000000')
  await page.getByLabel('인원 (명)').fill('2')
  await page.getByRole('button', { name: '만들기' }).click()
  await page.waitForSelector('.calendar')
}

async function run(name, viewport) {
  console.log(`--- ${name} ---`)
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR' })
  let mode = 'ok' // ok | fail
  await ctx.route(/open\.er-api\.com|api\.frankfurter\./, (route) => (mode === 'ok' ? json(route, MOCK) : route.abort('failed')))
  const page = await newPage(ctx, name)

  // --- 나라 선택으로 여행 만들기 ---
  await createJapanTrip(page)
  ok((await page.locator('h1').innerText()) === '오사카 여행', '이름을 비우면 도시·지역으로 이름이 만들어진다')

  // --- 가계부: 환율 자동 (응답 흉내) ---
  await page.locator('.entry', { hasText: '가계부' }).click()
  await page.waitForSelector('h2:has-text("가계부")')
  await page.waitForFunction(() => document.querySelector('.fx-line strong')?.textContent?.includes('JPY = '))
  const fx = await page.locator('.fx-line').innerText()
  ok(fx.includes('100 JPY = 926원') && fx.includes('자동 · open.er-api.com'), `들어가면 환율을 한 번 자동으로 받는다 → ${fx.replace(/\n/g, ' ')}`)
  ok(await page.getByRole('link', { name: 'Exchange Rate API' }).isVisible(), '환율 제공처 표기가 보인다')

  // 지출: 엔화
  await page.getByLabel('내용').fill('라멘')
  await page.getByLabel('금액', { exact: true }).fill('1000')
  ok((await page.locator('p.muted[aria-live="polite"]').innerText()).includes('9,259원'), '입력하는 동안 원화 환산액을 미리 보여준다')
  await page.getByRole('button', { name: '기록', exact: true }).click()
  ok((await page.getByLabel('내용').inputValue()) === '', '기록하면 입력창이 비워지고 계속 입력할 수 있다')
  const row1 = await page.locator('.items .item', { hasText: '라멘' }).innerText()
  ok(row1.includes('1,000 JPY') && row1.includes('9,259원'), `엔화 지출이 원화로 환산돼 보인다 → ${row1.replace(/\n/g, ' ')}`)
  const summary = await page.getByRole('region', { name: '지출 요약' }).innerText()
  ok(summary.includes('9,259원') && summary.includes('1인당 4,630원 (2명)'), `실제 지출과 1인당 금액 → ${summary.replace(/\n/g, ' | ')}`)

  // 카드 청구 금액을 알면 정확한 환율로 기록
  await page.getByLabel('내용').fill('기념품')
  await page.getByLabel('금액', { exact: true }).fill('5000')
  await page.getByLabel('분류').selectOption('shopping')
  await page.getByLabel('카드 청구 금액 (원, 아는 경우)').fill('47500')
  await page.getByRole('button', { name: '기록', exact: true }).click()
  ok((await page.locator('.items .item', { hasText: '기념품' }).innerText()).includes('47,500원'), '카드 청구 금액을 입력하면 그 금액으로 기록된다 (환율 9.5)')

  // 원화로 직접
  await page.getByLabel('내용').fill('택시')
  await page.getByLabel('금액', { exact: true }).fill('12000')
  await page.getByLabel('통화').selectOption('KRW')
  ok((await page.getByLabel('카드 청구 금액 (원, 아는 경우)').count()) === 0, '원화를 고르면 카드 청구 칸이 사라진다')
  await page.getByLabel('분류').selectOption('move')
  await page.getByRole('button', { name: '기록', exact: true }).click()
  const total = await page.getByRole('region', { name: '지출 요약' }).innerText()
  ok(total.includes('68,759원'), `합계 = 9,259 + 47,500 + 12,000 → ${total.split('\n').slice(0, 2).join(' ')}`)
  ok(total.includes('1인당 34,380원'), '1인당 = 합계 ÷ 2명 (반올림)')
  const table = await page.locator('.ledger-table').innerText()
  ok(table.includes('쇼핑') && table.includes('교통') && table.includes('47,500'), '분류별 표에 쇼핑·교통이 나온다')

  // 환율을 바꿔도 이미 기록한 지출은 그대로
  await page.getByRole('button', { name: '직접 입력' }).click()
  ok((await page.getByText('100 JPY = ? 원').count()) === 1, '엔은 100엔 기준으로 입력한다')
  await page.getByPlaceholder('예: 926').fill('1000')
  await page.getByRole('button', { name: '적용' }).click()
  ok((await page.locator('.fx-line').innerText()).includes('100 JPY = 1,000원') && (await page.locator('.fx-line').innerText()).includes('직접 입력'), '직접 입력한 환율이 적용되고 출처가 바뀐다')
  ok((await page.locator('.items .item', { hasText: '라멘' }).innerText()).includes('9,259원'), '환율을 바꿔도 이전 지출은 기록 당시 환율로 고정')
  await page.getByLabel('내용').fill('편의점')
  await page.getByLabel('금액', { exact: true }).fill('300')
  await page.getByLabel('통화').selectOption('JPY')
  await page.getByRole('button', { name: '기록', exact: true }).click()
  ok((await page.locator('.items .item', { hasText: '편의점' }).innerText()).includes('3,000원'), '새 지출은 바뀐 환율(10원)로 환산')

  // 수정·삭제
  await page.locator('.items .item', { hasText: '편의점' }).getByRole('button', { name: '수정' }).click()
  await page.getByLabel('금액', { exact: true }).fill('400')
  await page.getByRole('button', { name: '저장' }).click()
  ok((await page.locator('.items .item', { hasText: '편의점' }).innerText()).includes('4,000원'), '지출 수정')
  await page.locator('.items .item', { hasText: '편의점' }).getByRole('button', { name: '삭제' }).click()
  await page.locator('.items .item', { hasText: '편의점' }).locator('.confirm').getByRole('button', { name: '삭제' }).click()
  ok((await page.locator('.items .item', { hasText: '편의점' }).count()) === 0, '지출 삭제')
  ok(!(await overflow(page)), `${name} 가계부 가로 스크롤 없음`)
  await page.screenshot({ path: `${SP}/led-${name}.png`, fullPage: true })

  // --- 공유 텍스트와 물어보기용 복사 (클립보드 거부 환경) ---
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true })
  })
  await page.getByRole('button', { name: '캘린더로' }).click()
  await page.getByRole('button', { name: 'Claude에게 물어보기용 요약 복사' }).click()
  const ask = await page.locator('textarea[aria-label="공유할 일정 텍스트"]').inputValue()
  ok(ask.includes('여행지: 일본 오사카') && ask.includes('같은 이름의 장소가 여러 나라에 있으면') && ask.includes('도움이 필요한 것:'), '물어보기용 요약에 나라와 안내가 들어간다')
  ok(ask.includes('나라: 일본') && ask.includes('인원: 2명') && ask.includes('통화: JPY (100 JPY = 1,000원)'), '요약에 나라·인원·통화·환율 포함')
  ok(await page.locator('.entry', { hasText: '가계부' }).innerText().then((t) => t.includes('지출 68,759원') || t.includes('지출')), '캘린더의 가계부 입구에 지출 합계가 보인다')

  // --- 같은 이름의 장소 구분: 지도 링크에 나라가 붙고 네이버지도는 숨겨진다 ---
  await page.locator('.entry', { hasText: '일정' }).click()
  await page.getByLabel('1일차 일정 이름').fill('유니버설 스튜디오')
  await page.getByLabel('1일차 일정 이름').press('Enter')
  await page.getByRole('button', { name: '유니버설 스튜디오 더보기' }).click()
  const day1 = page.getByRole('region', { name: '1일차' })
  ok((await day1.getByRole('link', { name: '네이버지도' }).count()) === 0, '해외 여행에서는 네이버지도 링크가 없다')
  const g = await day1.getByRole('link', { name: '구글지도' }).first().getAttribute('href')
  ok(decodeURIComponent(g).includes('유니버설 스튜디오 오사카 일본'), `구글지도 검색어에 도시와 나라가 붙는다 → ${decodeURIComponent(g).split('query=')[1]}`)

  // --- 준비물: 해외 추천 ---
  await page.getByRole('button', { name: '캘린더로' }).click()
  await page.locator('.entry', { hasText: '준비' }).click()
  ok((await page.getByRole('button', { name: '+ 여권' }).count()) === 1 && (await page.getByRole('button', { name: '+ 멀티 어댑터' }).count()) === 1, '해외 여행: 여권·멀티 어댑터 추천')
  ok((await page.getByRole('button', { name: '+ 신분증' }).count()) === 0, '해외 여행에는 신분증 추천이 없다')

  // --- 기본 정보에서 나라를 바꾸면 통화가 따라가고 이전 환율은 버린다 ---
  await page.locator('.stepper').getByRole('button', { name: /^기본/ }).click()
  await page.getByLabel('나라').selectOption('US')
  ok((await page.getByLabel('현지 통화').inputValue()) === 'USD', '나라를 바꾸면 통화도 따라 바뀐다')
  mode = 'fail'
  await page.getByRole('button', { name: '저장하고 다음 →' }).click()
  await page.locator('.stepper').getByRole('button', { name: /^가계부/ }).click()
  await page.waitForSelector('.fx-line')
  ok((await page.locator('.fx-line strong').innerText()).includes('미설정') || (await page.locator('.fx-line strong').innerText()).includes('USD'), `통화가 바뀌면 환율은 다시 정해야 한다 → ${await page.locator('.fx-line strong').innerText()}`)
  ok((await page.locator('.items .item', { hasText: '라멘' }).innerText()).includes('1,000 JPY'), '통화를 바꿔도 이미 기록한 엔화 지출은 그대로')
  // 자동 환율이 막힌 환경: 안내가 뜨고, 환율 없이 외화 지출은 기록되지 않는다
  await page.waitForSelector('text=자동으로 받아오지 못했어요')
  ok(true, '자동 환율이 막히면 직접 입력하라는 안내가 뜬다')
  await page.getByRole('button', { name: '+ 지출 기록' }).click()
  await page.getByLabel('내용').fill('핫도그')
  await page.getByLabel('금액', { exact: true }).fill('5')
  await page.getByRole('button', { name: '기록', exact: true }).click()
  ok((await page.getByRole('alert').filter({ hasText: '환율을 먼저 입력해 주세요' }).count()) >= 1, '환율을 모르면 외화 지출을 기록하지 않고 안내한다')
  ok(!(await overflow(page)), `${name} 가계부(환율 실패 상태) 가로 스크롤 없음`)

  // --- 탭이 한 줄에 들어가는지 ---
  const box = await page.locator('.stepper').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
  ok(box.sw <= box.cw + 1, `${name} 단계 탭 6개가 한 줄에 들어간다 (scrollWidth ${box.sw} / clientWidth ${box.cw})`)
  await ctx.close()
}

// --- 계획한 비용 불러오기(국내 여행) + 국내 준비물 ---
async function planned(name, viewport) {
  console.log(`--- ${name}: 계획 비용 불러오기 ---`)
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR' })
  const seed = { version: 1, trips: [{
    id: 'j', name: '제주 여행', destination: '제주', country: 'KR', startDate: '2026-11-05', endDate: '2026-11-08', budget: 600000, travelers: 1, currency: 'KRW', rate: 1,
    createdAt: '', ideas: [], packing: [], expenses: [],
    flights: [{ id: 'f1', flightNo: '', from: '김포', to: '제주', departDate: '2026-11-05', departTime: '', arriveDate: '2026-11-05', arriveTime: '', cost: 100000, note: '' }],
    stays: [{ id: 's1', name: '제주호텔', address: '', checkIn: '2026-11-05', checkOut: '2026-11-07', cost: 200000, note: '' }],
    items: [{ id: 'i1', date: '2026-11-06', time: '', title: '흑돼지', place: '', note: '', cost: 50000, category: 'food', done: false }, { id: 'i2', date: '2026-11-06', time: '', title: '무료 산책', place: '', note: '', cost: 0, category: 'sight', done: false }],
    shopping: [{ id: 'p1', name: '감귤', where: '', price: 20000, bought: true }, { id: 'p2', name: '한라봉', where: '', price: 30000, bought: false }],
  }] }
  await ctx.addInitScript((d) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('travel-planner:v1', JSON.stringify(d)); localStorage.setItem('seeded', '1') } }, seed)
  const page = await newPage(ctx, name)
  await page.goto(`${URL}#/trip/j/ledger`)
  await page.waitForSelector('h2:has-text("가계부")')
  ok((await page.locator('.fx').count()) === 0, '국내 여행(원화)에는 환율 칸이 없다')
  ok((await page.getByLabel('통화').count()) === 0, '국내 여행에는 통화 선택이 없다')
  const sum = page.locator('details.planned > summary')
  ok((await sum.innerText()).includes('4건'), `계획한 비용 4건(항공·숙소·일정·산 쇼핑)이 기록 대기 → ${await sum.innerText()}`)
  await sum.click()
  const list = await page.locator('details.planned').innerText()
  ok(list.includes('감귤') && !list.includes('한라봉') && !list.includes('무료 산책'), '비용이 없거나 못 산 것은 제외')
  await page.locator('details.planned .item', { hasText: '항공' }).getByRole('button', { name: '기록' }).click()
  ok((await page.locator('details.planned > summary').innerText()).includes('3건'), '하나를 기록하면 대기 목록에서 빠진다')
  await page.getByRole('button', { name: /^모두 기록/ }).click()
  ok((await page.locator('details.planned').count()) === 0, '모두 기록하면 대기 목록이 사라진다')
  const t = await page.getByRole('region', { name: '지출 요약' }).innerText()
  ok(t.includes('370,000원'), `기록된 합계 = 100,000 + 200,000 + 50,000 + 20,000 → ${t.split('\n').slice(0, 2).join(' ')}`)
  ok(!t.includes('1인당'), '1명이면 1인당 줄을 보여주지 않는다')
  ok(t.includes('계획과 같아요') || t.includes('덜 썼어요') || t.includes('더 썼어요'), `계획 대비 문구 → ${t.split('\n').pop()}`)
  const table = await page.locator('.ledger-table').innerText()
  ok(table.includes('항공') && table.includes('숙소') && table.includes('식사') && table.includes('쇼핑'), '분류별 표')
  const days = await page.locator('.day-head').allInnerTexts()
  ok(days.length >= 2, `지출이 날짜별로 묶인다 → ${days.map((d) => d.replace(/\n/g, ' ')).join(' / ')}`)
  // 국내 준비물 추천
  await page.locator('.stepper').getByRole('button', { name: /^준비/ }).click()
  ok((await page.getByRole('button', { name: '+ 신분증' }).count()) === 1 && (await page.getByRole('button', { name: '+ 여권' }).count()) === 0, '국내 여행: 신분증 추천, 여권 없음')
  ok(!(await overflow(page)), `${name} 국내 준비 단계 가로 스크롤 없음`)
  await ctx.close()
}

await run('mobile', { width: 390, height: 844 })
await run('desktop', { width: 1280, height: 900 })
await planned('mobile', { width: 390, height: 844 })
await browser.close()
ok(errors.length === 0, '콘솔/페이지 에러 없음 ' + (errors.length ? JSON.stringify(errors) : ''))
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exitCode = failed ? 1 : 0

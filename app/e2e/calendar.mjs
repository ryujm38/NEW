import { OUT_DIR as SP, launch } from './env.mjs'
const URL = process.env.APP_URL
const browser = await launch()
const errors = []
let failed = 0
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failed++ }

const it = (id, date, title, extra = {}) => ({ id, date, time: '', title, place: '', note: '', cost: 0, category: 'sight', done: false, ...extra })
const base = { budget: 0, createdAt: '', items: [], flights: [], stays: [], shopping: [], ideas: [], packing: [] }
const seed = {
  version: 1,
  trips: [
    {
      ...base, id: 'tw', name: '대만 여행', destination: '대만', startDate: '2026-11-05', endDate: '2026-11-18',
      flights: [
        { id: 'f1', flightNo: 'BR1', from: '인천', to: '타이베이', departDate: '2026-11-05', departTime: '09:00', arriveDate: '2026-11-05', arriveTime: '11:30', cost: 100000, note: '' },
        { id: 'f2', flightNo: 'BR2', from: '타이베이', to: '인천', departDate: '2026-11-18', departTime: '19:00', arriveDate: '2026-11-18', arriveTime: '22:00', cost: 100000, note: '' },
      ],
      stays: [
        { id: 's1', name: '시먼 호텔', address: '', checkIn: '2026-11-05', checkOut: '2026-11-12', cost: 0, note: '' },
        { id: 's2', name: '지우펀 민박', address: '', checkIn: '2026-11-12', checkOut: '2026-11-18', cost: 0, note: '' },
      ],
      items: [
        it('a', '2026-11-06', '고궁박물원', { time: '10:00', place: '국립고궁박물원', done: true }),
        it('b', '2026-11-06', '야시장', { time: '19:00', cost: 20000 }),
        it('c', '2026-11-07', '단수이'),
        it('d', '2026-11-16', '쇼핑', { time: '15:00' }),
        it('e', '2026-11-16', '마사지'), it('f', '2026-11-16', '저녁'), it('g', '2026-11-16', '카페'), it('h', '2026-11-16', '야경'),
      ],
    },
    { ...base, id: 'jj', name: '제주 일주일', destination: '제주', startDate: '2026-11-08', endDate: '2026-11-14' },
    { ...base, id: 'day', name: '당일치기', destination: '부산', startDate: '2026-11-10', endDate: '2026-11-10' },
  ],
}

async function run(name, viewport) {
  console.log(`--- ${name} ---`)
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR' })
  await ctx.addInitScript((data) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('travel-planner:v1', JSON.stringify(data)); localStorage.setItem('seeded', '1') } }, seed)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: console ${m.text()}`))
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  const cells = () => page.locator('.cal-cell')

  // 목록에서 여행을 열면 캘린더가 먼저 보인다
  await page.goto(URL)
  await page.locator('.trip-card', { hasText: '대만 여행' }).click()
  await page.waitForSelector('.calendar')
  ok(await page.evaluate(() => /^#\/trip\/tw$/.test(location.hash)), '여행을 열면 개요(캘린더)가 기본 화면')
  ok((await page.locator('.cal-title').innerText()) === '2026년 11월', '월 제목')
  ok((await cells().count()) === 14, `2주(14일) 여행은 날짜 칸 14개만 → ${await cells().count()}`)
  ok((await page.locator('.cal-grid > .cal-cell, .cal-grid > .cal-blank').count()) === 21, '목요일 시작 14일은 3주 행(21칸)으로 정렬')
  ok((await page.locator('.cal-blank').count()) === 7, '여행 기간 밖은 빈 칸')
  ok((await page.locator('.stepper').count()) === 0, '개요에는 단계 탭이 없다')

  // 칸의 내용
  const d1 = await page.getByRole('button', { name: /^Day 1,/ }).getAttribute('aria-label')
  ok(d1.includes('항공') && d1.includes('체크인') && d1.includes('일정 없음'), `Day 1: ${d1}`)
  const d2 = await page.getByRole('button', { name: /^Day 2,/ }).getAttribute('aria-label')
  ok(d2.includes('일정 2개 중 1개 완료'), `Day 2: ${d2}`)
  const d8 = await page.getByRole('button', { name: /^Day 8,/ }).getAttribute('aria-label')
  ok(d8.includes('체크인') && d8.includes('체크아웃'), `Day 8(숙소 이동일): ${d8}`)
  ok((await page.getByRole('button', { name: /^Day 1,/ }).locator('.dot-flight').count()) === 1 && (await page.getByRole('button', { name: /^Day 1,/ }).locator('.dot-stay').count()) === 1, 'Day 1에 항공·숙소 표시')
  ok((await page.getByRole('button', { name: /^Day 2,/ }).locator('.cal-count').innerText()) === '1/2', 'Day 2에 완료/전체 표시')
  const lines = page.getByRole('button', { name: /^Day 12,/ }).locator('.cal-lines')
  if (viewport.width >= 720) {
    const t = await lines.innerText()
    ok(t.includes('15:00 쇼핑') && t.includes('+2'), `넓은 화면에서는 칸 안에 일정을 보여준다 → ${t.replace(/\n/g, ' | ')}`)
  } else {
    ok(!(await lines.isVisible()), '좁은 화면에서는 칸에 숫자와 점만 보여준다')
  }
  ok((await page.getByRole('note').count()) === 0, '항공·숙소·일정이 있는 여행에는 시작 안내가 없다')
  ok(!(await overflow()), `${name} 개요 가로 스크롤 없음`)
  await page.screenshot({ path: `${SP}/cal-${name}-overview.png`, fullPage: true })

  // 날짜를 누르면 그날 일정으로
  await page.getByRole('button', { name: /^Day 12,/ }).click()
  await page.waitForSelector('h2:has-text("일정")')
  ok(await page.evaluate(() => location.hash === '#/trip/tw/plan/2026-11-16'), '날짜 칸 → 해당 날짜 일정 주소로 이동')
  await page.waitForTimeout(200)
  const y = await page.locator('#day-2026-11-16').evaluate((el) => Math.round(el.getBoundingClientRect().top))
  ok(Math.abs(y) < 120, `그 날짜가 화면 맨 위로 스크롤된다 (top=${y}px, scrollY=${await page.evaluate(() => Math.round(scrollY))})`)
  ok((await page.evaluate(() => scrollY)) > 300, '실제로 아래로 스크롤됨')
  ok((await page.locator('#day-2026-11-16 .day-head').evaluate((el) => getComputedStyle(el).position)) === 'sticky', '날짜 머리글은 스크롤해도 고정')

  // 일정 항목은 한 줄로, 동작은 접혀 있다
  ok((await page.locator('#day-2026-11-16 .item').count()) === 5, 'Day 12 일정 5개')
  ok((await page.locator('#day-2026-11-16').getByRole('button', { name: '삭제' }).count()) === 0, '항목의 동작 버튼은 처음에 접혀 있다')
  await page.locator('#day-2026-11-16').getByRole('button', { name: '쇼핑 더보기' }).click()
  ok(await page.locator('#day-2026-11-16').getByRole('link', { name: '구글지도' }).first().isVisible(), '⋯를 누르면 지도·순서·수정·삭제가 펼쳐진다')
  ok((await page.locator('#day-2026-11-16').getByRole('link', { name: '네이버지도' }).count()) === 0, '해외(대만) 여행에서는 네이버지도 링크를 숨긴다')
  ok((await page.getByRole('button', { name: '쇼핑 더보기' }).getAttribute('aria-expanded')) === 'true', '펼침 상태가 접근성에 노출된다')
  const itemH = await page.locator('#day-2026-11-16 .item').nth(1).evaluate((el) => Math.round(el.getBoundingClientRect().height))
  ok(itemH < 90, `접힌 일정 한 줄의 높이가 낮다 (${itemH}px)`)

  // 날짜 이동 줄
  await page.locator('.dayjump').getByRole('button', { name: '5일차로 이동' }).click()
  const y5 = await page.locator('#day-2026-11-09').evaluate((el) => Math.round(el.getBoundingClientRect().top))
  ok(Math.abs(y5) < 120, `날짜 이동 줄: 5일차가 맨 위로 (top=${y5}px)`)

  // 캘린더로 돌아가기 / 브라우저 뒤로가기
  await page.getByRole('button', { name: '캘린더로' }).click()
  await page.waitForSelector('.calendar')
  ok(await page.evaluate(() => location.hash === '#/trip/tw'), '← 캘린더로 개요에 돌아온다')

  // 세부 페이지 입구
  await page.locator('.entry', { hasText: '항공' }).click()
  await page.waitForSelector('h2:has-text("항공권")')
  ok((await page.locator('.item').count()) === 2, '항공 입구 → 항공 세부 페이지')
  await page.goBack()
  await page.waitForSelector('.calendar')
  ok(true, '브라우저 뒤로가기로 개요에 돌아온다')
  await page.locator('.entry', { hasText: '숙소' }).click()
  await page.waitForSelector('h2:has-text("숙소")')
  await page.getByRole('button', { name: '캘린더로' }).click()
  await page.locator('.entry', { hasText: '일정' }).click()
  await page.waitForSelector('h2:has-text("일정")')
  ok((await page.evaluate(() => Math.round(scrollY))) === 0, '일정 입구 → 일정 전체(맨 위부터)')
  await page.getByRole('button', { name: '캘린더로' }).click()

  // 새로고침해도 같은 화면
  await page.reload()
  await page.waitForSelector('.calendar')
  ok((await cells().count()) === 14, '새로고침 후에도 개요 유지')

  // 1주 / 하루짜리
  await page.getByRole('button', { name: '여행 목록으로' }).click()
  await page.locator('.trip-card', { hasText: '제주 일주일' }).click()
  await page.waitForSelector('.calendar')
  ok((await cells().count()) === 7 && (await page.locator('.cal-blank').count()) === 0, '일요일에 시작하는 1주 여행은 한 줄, 빈 칸 없음')
  ok((await page.getByRole('note').count()) === 1, '비어 있는 여행에는 시작 안내가 있다')
  await page.getByRole('button', { name: '여행 목록으로' }).click()
  await page.locator('.trip-card', { hasText: '당일치기' }).click()
  await page.waitForSelector('.calendar')
  ok((await cells().count()) === 1 && (await page.locator('.cal-blank').count()) === 6, '하루짜리 여행은 한 칸')
  await page.screenshot({ path: `${SP}/cal-${name}-oneday.png`, fullPage: true })
  await ctx.close()
}

await run('mobile', { width: 390, height: 844 })
await run('desktop', { width: 1280, height: 900 })
await browser.close()
ok(errors.length === 0, '콘솔/페이지 에러 없음 ' + (errors.length ? JSON.stringify(errors) : ''))
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exitCode = failed ? 1 : 0

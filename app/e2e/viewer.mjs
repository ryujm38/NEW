import { writeFileSync } from 'node:fs'
import { OUT_DIR as SP, launch, SINGLE_FILE_URL } from './env.mjs'
const URL = SINGLE_FILE_URL
const browser = await launch()
const errors = []
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1 }

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' })
// 임베디드 뷰어의 제약을 흉내 낸다.
await ctx.addInitScript(() => {
  window.confirm = () => false
  Object.defineProperty(navigator, 'share', { value: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')), configurable: true })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true })
})
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))

await page.goto(URL)
await page.getByRole('button', { name: '+ 새 여행 만들기' }).click()
await page.getByLabel('도시·지역').fill('부산')
await page.getByLabel('출발일').fill('2026-12-01')
await page.getByLabel('도착일').fill('2026-12-02')
await page.getByRole('button', { name: '만들기' }).click()
await page.waitForSelector('h1:has-text("부산 여행")')
await page.getByRole('button', { name: '항공권부터 등록하기' }).click()
ok((await page.locator('.stepper .step.active').innerText()).includes('항공'), '새 여행은 항공 단계에서 시작')

// 항공: 왕복 입력 → confirm()이 막혀도 삭제 가능
await page.getByLabel('출발지').fill('서울')
await page.getByRole('button', { name: '왕복 2건 추가' }).click()
ok((await page.locator('.item').count()) === 2, '왕복 입력으로 항공 2건')
await page.locator('.item').first().getByRole('button', { name: '삭제' }).click()
await page.locator('.item').first().locator('.confirm').getByRole('button', { name: '삭제' }).click()
ok((await page.locator('.item').count()) === 1, '항공 삭제 (confirm() 차단 상태)')

// 쇼핑: 추가 → 삭제
await page.locator('.stepper').getByRole('button', { name: /^준비/ }).click()
await page.getByLabel('쇼핑 물건 이름', { exact: true }).fill('라면')
await page.getByLabel('쇼핑 물건 이름', { exact: true }).press('Enter')
ok((await page.locator('.item').count()) === 1, '쇼핑 물건 추가')
await page.locator('.item').first().getByRole('button', { name: '삭제' }).click()
await page.locator('.item').first().locator('.confirm').getByRole('button', { name: '삭제' }).click()
ok((await page.locator('.item').count()) === 0, '쇼핑 물건 삭제 (confirm() 차단 상태)')

await page.locator('.stepper').getByRole('button', { name: /^일정/ }).click()
const day1 = page.getByRole('region', { name: '1일차' })
for (const t of ['해운대', '자갈치시장']) {
  await day1.getByLabel('1일차 일정 이름').fill(t)
  await day1.getByLabel('1일차 일정 이름').press('Enter')
}
ok((await day1.locator('.item').count()) === 2, '일정 2개 추가')

// confirm()이 항상 false여도 삭제가 되어야 한다 (인라인 확인)
const first = day1.locator('.item').first()
ok((await first.getByRole('button', { name: '삭제' }).count()) === 0, '동작 버튼은 처음엔 접혀 있다')
await first.getByRole('button', { name: /더보기/ }).click()
await first.getByRole('button', { name: '삭제' }).click()
await first.locator('.confirm').getByRole('button', { name: '취소' }).click()
ok((await day1.locator('.item').count()) === 2, '취소하면 일정이 남는다')
await first.getByRole('button', { name: '삭제' }).click()
await first.locator('.confirm').getByRole('button', { name: '삭제' }).click()
ok((await day1.locator('.item').count()) === 1, '확인하면 일정이 삭제된다 (confirm() 차단 상태)')

// 공유: share 거부 + clipboard 거부 → 직접 복사용 텍스트가 보여야 한다
await page.getByRole('button', { name: '공유' }).click()
await page.waitForSelector('textarea[aria-label="공유할 일정 텍스트"]')
const shared = await page.locator('textarea[aria-label="공유할 일정 텍스트"]').inputValue()
ok(shared.includes('Day 1') && shared.includes('자갈치시장'), '공유가 막혀도 복사용 텍스트를 보여준다')

// 화면 전환: 해시 변경 없이도 목록으로 돌아간다
await page.getByRole('button', { name: '캘린더로' }).click()
await page.waitForSelector('.calendar')
await page.getByRole('button', { name: '여행 목록으로' }).click()
await page.waitForSelector('h1:has-text("내 여행")')

// 백업 내보내기 패널과 복사 실패 안내
await page.getByRole('button', { name: '백업 내보내기' }).click()
const backup = await page.locator('textarea[aria-label="백업 데이터"]').inputValue()
ok(backup.includes('"부산"') && JSON.parse(backup).trips.length === 1, '백업 패널에 JSON이 보인다')
await page.getByRole('button', { name: '복사' }).click()
ok((await page.getByRole('status').innerText()).includes('자동 복사가 막혀'), '복사가 막히면 직접 복사 안내')

// 백업 불러오기: 확인 단계 + 덮어쓰기
writeFileSync(`${SP}/restore.json`, JSON.stringify({ version: 1, trips: [
  { id: 'a', name: '복원 A', destination: '강릉', startDate: '2026-12-10', endDate: '2026-12-11', budget: 0, items: [] },
  { id: 'b', name: '복원 B', destination: '전주', startDate: '2026-12-20', endDate: '2026-12-21', budget: 0, items: [] },
] }))
await page.setInputFiles('input[type=file]', `${SP}/restore.json`)
await page.getByRole('alertdialog').waitFor()
await page.getByRole('alertdialog').getByRole('button', { name: '취소' }).click()
ok((await page.locator('.trip-card').count()) === 1, '불러오기 취소하면 기존 데이터 유지')
await page.setInputFiles('input[type=file]', `${SP}/restore.json`)
await page.getByRole('alertdialog').getByRole('button', { name: '바꾸기' }).click()
ok((await page.locator('.trip-card').count()) === 2, '바꾸기를 누르면 백업으로 교체')

// 잘못된 파일
writeFileSync(`${SP}/bad.json`, '{not json')
await page.setInputFiles('input[type=file]', `${SP}/bad.json`)
await page.waitForFunction(() => document.body.innerText.includes('형식이 올바르지 않아요'))
ok(true, '깨진 백업 파일은 거부')

// 여행 삭제 (인라인 확인)
await page.locator('.trip-card').first().click()
await page.waitForSelector('.topbar')
await page.locator('.topbar').getByRole('button', { name: '삭제' }).click()
await page.locator('.topbar .confirm').getByRole('button', { name: '삭제' }).click()
await page.waitForSelector('h1:has-text("내 여행")')
ok((await page.locator('.trip-card').count()) === 1, '여행 삭제 후 목록으로 이동')

ok(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), '가로 스크롤 없음 (390px)')

// 테마: 시스템 다크 / 명시 라이트가 서로를 덮어쓰는지
const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
await page.emulateMedia({ colorScheme: 'light' }); const light = await bg()
await page.emulateMedia({ colorScheme: 'dark' }); const dark = await bg()
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); const forcedLight = await bg()
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.emulateMedia({ colorScheme: 'light' }); const forcedDark = await bg()
ok(light !== dark && forcedLight === light && forcedDark === dark, `테마: 시스템 라이트=${light} / 다크=${dark} / 명시 라이트=${forcedLight} / 명시 다크=${forcedDark}`)
await page.evaluate(() => document.documentElement.removeAttribute('data-theme')); await page.emulateMedia({ colorScheme: 'light' })
await page.screenshot({ path: `${SP}/single-list.png`, fullPage: true })

const sw = await page.evaluate(async () => { try { return (await navigator.serviceWorker.getRegistrations()).length } catch { return 0 } })
ok(sw === 0, '서비스 워커를 등록하지 않는다')
ok(errors.length === 0, '콘솔/페이지 에러 없음 ' + (errors.length ? JSON.stringify(errors) : ''))
await browser.close()

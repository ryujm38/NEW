import { OUT_DIR, OUT_DIR as SP, SINGLE_FILE_URL, launch, launchPersistent } from './env.mjs'
const URL = process.env.APP_URL
const browser = await launch()
const errors = []
let failed = 0
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failed++ }
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const hint = (page) => page.getByRole('complementary', { name: '앱으로 설치' })
const track = (page, name) => {
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: console ${m.text()}`))
}

// ---- 1) 브라우저의 설치 가능성 검사 (실제 검사) ----
{
  // 시크릿 창에서는 크롬이 설치를 허용하지 않아서(in-incognito) 일반 창과 같은 영구 프로필로 검사한다.
  const ctx = await launchPersistent(`${OUT_DIR}/pwa-profile`, { viewport: { width: 390, height: 844 } })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  track(page, 'installability')
  await page.goto(URL)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  const cdp = await ctx.newCDPSession(page)
  const m = await cdp.send('Page.getAppManifest')
  ok((m.errors ?? []).length === 0, `매니페스트에 오류가 없다 ${JSON.stringify(m.errors ?? [])}`)
  const manifest = JSON.parse(m.data)
  ok(manifest.display === 'standalone' && manifest.lang === 'ko' && manifest.name === '여행 플래너', '이름·언어·standalone 표시 설정')
  const purposes = manifest.icons.map((i) => `${i.sizes}/${i.purpose}`)
  ok(['192x192/any', '512x512/any', '512x512/maskable'].every((p) => purposes.includes(p)), `아이콘 192·512 및 마스크용 포함 → ${purposes.join(', ')}`)
  for (const icon of manifest.icons) {
    const res = await page.request.get(new globalThis.URL(icon.src, m.url).href)
    ok(res.status() === 200 && /image\/(png|svg)/.test(res.headers()['content-type'] ?? ''), `아이콘 ${icon.src} → ${res.status()} ${res.headers()['content-type']}`)
  }
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  ok(installabilityErrors.length === 0, `브라우저가 "설치 가능"으로 판단한다 (installabilityErrors: ${JSON.stringify(installabilityErrors)})`)

  const links = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
    apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
    capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
    title: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content,
  }))
  ok(links.manifest && links.apple === '/apple-touch-icon.png' && links.capable === 'yes' && links.title === '여행 플래너', `아이폰용 메타 태그 → ${JSON.stringify(links)}`)
  const ai = await page.request.get(new globalThis.URL(links.apple, URL).href)
  ok(ai.status() === 200 && ai.headers()['content-type'].includes('image/png'), '아이폰 홈 화면 아이콘이 받아진다')

  // 오프라인
  await ctx.setOffline(true)
  await page.reload()
  ok((await page.locator('h1').innerText()) === '내 여행', '인터넷이 없어도 새로고침하면 앱이 열린다')
  await ctx.setOffline(false)
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), '가로 스크롤 없음')
  await ctx.close()
}

// ---- 2) 설치 버튼 (이벤트는 직접 만들어 보낸 것) ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  track(page, 'install-button')
  await page.goto(URL)
  ok((await hint(page).count()) === 0, '설치 가능 이벤트가 없으면 안내가 보이지 않는다 (데스크톱 크롬)')
  const fire = () => page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve() }
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
    return e.defaultPrevented
  })
  ok((await fire()) === true, '브라우저의 기본 설치 배너를 막고 우리 버튼으로 대신한다')
  await hint(page).waitFor()
  ok((await hint(page).innerText()).includes('앱으로 설치할 수 있어요'), '이벤트가 오면 설치 안내가 나타난다')
  await page.screenshot({ path: `${SP}/pwa-install.png`, fullPage: true })
  await hint(page).getByRole('button', { name: '설치하기' }).click()
  ok((await page.evaluate(() => window.__prompted)) === 1, '설치하기를 누르면 브라우저의 설치 창을 띄운다')
  await page.waitForFunction(() => !document.querySelector('aside.install'))
  ok(true, '설치 창을 띄운 뒤 안내가 사라진다')
  await fire()
  await hint(page).getByRole('button', { name: '나중에' }).click()
  await page.reload()
  await fire()
  await page.waitForTimeout(150)
  ok((await hint(page).count()) === 0, '"나중에"를 누르면 다음에도 다시 보이지 않는다')
  await ctx.close()
}

// ---- 3) 아이폰 안내, 이미 설치한 경우, 임베디드 ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IOS_UA, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  track(page, 'ios')
  await page.goto(URL)
  await hint(page).waitFor()
  const t = await hint(page).innerText()
  ok(t.includes('홈 화면에 추가해서 앱처럼 쓰세요') && t.includes('공유 버튼') && t.includes('홈 화면에 추가'), `아이폰에서는 홈 화면에 추가하는 방법을 안내한다 → ${t.replace(/\n/g, ' ')}`)
  ok((await hint(page).getByRole('button', { name: '설치하기' }).count()) === 0, '아이폰 안내에는 (동작하지 않는) 설치 버튼이 없다')
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), '아이폰 안내가 가로 스크롤을 만들지 않는다')
  await page.screenshot({ path: `${SP}/pwa-ios.png`, fullPage: true })
  await hint(page).getByRole('button', { name: '닫기' }).click()
  await page.reload()
  await page.waitForSelector('h1')
  ok((await hint(page).count()) === 0, '닫으면 다음 방문에도 보이지 않는다')
  await ctx.close()

  // 이미 홈 화면에서 앱으로 연 경우 (표시 모드는 스크립트로 흉내 낸다: 앱이 그 값을 어떻게 읽는지만 확인)
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IOS_UA, isMobile: true, hasTouch: true })
  await ctx2.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  const p2 = await ctx2.newPage()
  track(p2, 'standalone-ios')
  await p2.goto(URL)
  await p2.waitForSelector('h1')
  ok((await p2.evaluate(() => navigator.standalone)) === true, '(검사 준비) 아이폰 홈 화면 앱처럼 navigator.standalone을 켰다')
  ok((await hint(p2).count()) === 0, '아이폰 홈 화면 앱으로 열었으면 안내를 보이지 않는다')
  await ctx2.close()

  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx3.addInitScript(() => {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { ...real('all'), matches: true, media: q } : real(q))
  })
  const p3 = await ctx3.newPage()
  track(p3, 'standalone-display-mode')
  await p3.goto(URL)
  await p3.waitForSelector('h1')
  await p3.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    e.prompt = () => Promise.resolve()
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  await p3.waitForTimeout(150)
  ok((await p3.evaluate(() => matchMedia('(display-mode: standalone)').matches)) === true, '(검사 준비) display-mode: standalone으로 열림을 흉내 냈다')
  ok((await hint(p3).count()) === 0, '이미 앱 모드로 열었으면 설치 이벤트가 와도 안내를 보이지 않는다')
  await ctx3.close()
}

// ---- 4) 저장소 보존 요청 ----
{
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => {
    window.__persistCalls = 0
    StorageManager.prototype.persist = async function () { window.__persistCalls++; return true }
  })
  const page = await ctx.newPage()
  track(page, 'persist')
  await page.goto(URL)
  await page.waitForSelector('h1')
  ok((await page.evaluate(() => window.__persistCalls)) === 1, '시작할 때 브라우저에 저장 데이터를 지우지 말라고 한 번 요청한다')
  await ctx.close()
}

// ---- 5) 파일 하나로 합친 미리보기에서는 설치 안내가 없다 ----
{
  const ctx = await browser.newContext({ userAgent: IOS_UA, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  track(page, 'embedded')
  await page.goto(SINGLE_FILE_URL)
  await page.waitForSelector('h1')
  ok((await hint(page).count()) === 0, '비공개 미리보기(임베디드)에는 설치 안내를 넣지 않는다')
  await ctx.close()
}

await browser.close()
ok(errors.length === 0, '콘솔/페이지 에러 없음 ' + (errors.length ? JSON.stringify(errors) : ''))
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exitCode = failed ? 1 : 0

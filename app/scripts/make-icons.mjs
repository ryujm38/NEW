// public/icon.svg(둥근 모서리)와 scripts/icon-maskable.svg(꽉 찬 사각형)에서 홈 화면용 PNG 아이콘을 만든다.
// 렌더링에 Chromium이 필요하다: playwright-core가 설치돼 있어야 하고(프로젝트 의존성은 아님),
// 실행 파일 경로를 CHROMIUM_PATH로 넘긴다.
//   CHROMIUM_PATH=/path/to/chromium node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = process.env.APP_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const any = readFileSync(join(root, 'public/icon.svg'), 'utf8')
const maskable = readFileSync(join(root, 'scripts/icon-maskable.svg'), 'utf8')

const targets = [
  { file: 'public/icon-192.png', svg: any, size: 192, transparent: true },
  { file: 'public/icon-512.png', svg: any, size: 512, transparent: true },
  { file: 'public/icon-maskable-512.png', svg: maskable, size: 512, transparent: false },
  // iOS는 투명한 부분을 검게 채우므로 꽉 찬 사각형을 쓴다(모서리는 iOS가 알아서 둥글게 만든다).
  { file: 'public/apple-touch-icon.png', svg: maskable, size: 180, transparent: false },
]

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } })
  const sized = t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`)
  writeFileSync(join(root, t.file), await page.screenshot({ omitBackground: t.transparent, type: 'png' }))
  await page.close()
  console.log('wrote', t.file)
}
await browser.close()

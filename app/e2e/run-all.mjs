// 브라우저 시험을 한 번에 돌린다: 빌드 → 미리보기 서버 → 시험 → 서버 종료.
//   npm run e2e
//   CHROMIUM_PATH=/path/to/chrome npm run e2e     (브라우저를 따로 지정할 때)
// 서버를 새로 띄우는 이유: vite preview는 시작할 때의 파일 목록을 기억해서, 다시 빌드한 뒤에는 서버도 다시 띄워야 한다.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT_DIR, SINGLE_FILE_URL } from './env.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const port = process.env.PORT ?? '4173'
const webUrl = `http://localhost:${port}/`
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' })
execFileSync(npm, ['run', 'build:single'], { cwd: root, stdio: 'inherit' })

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore' })
const results = []

try {
  // 서버가 올바른 빌드를 제공할 때까지 기다린다(매니페스트가 오면 정상, 대체 HTML이 오면 잘못된 서버).
  let ready = false
  for (let i = 0; i < 40 && !ready; i++) {
    try {
      const res = await fetch(`${webUrl}manifest.webmanifest`)
      ready = res.ok && (res.headers.get('content-type') ?? '').includes('manifest')
    } catch {
      /* 아직 안 떴다 */
    }
    if (!ready) await new Promise((r) => setTimeout(r, 500))
  }
  if (!ready) throw new Error(`미리보기 서버(${webUrl})가 준비되지 않았어요. 포트 ${port}를 다른 프로그램이 쓰고 있는지 확인하세요.`)

  const suites = [
    ['wizard', 'wizard.mjs', webUrl],
    ['features', 'features.mjs', webUrl],
    ['calendar', 'calendar.mjs', webUrl],
    ['ledger', 'ledger.mjs', webUrl],
    ['pwa', 'pwa.mjs', webUrl],
    ['viewer (단일 파일, 임베디드 제약)', 'viewer.mjs', ''],
    ['features (단일 파일)', 'features.mjs', SINGLE_FILE_URL],
    ['calendar (단일 파일)', 'calendar.mjs', SINGLE_FILE_URL],
    ['ledger (단일 파일)', 'ledger.mjs', SINGLE_FILE_URL],
  ]
  for (const [name, file, url] of suites) {
    process.stdout.write(`\n=== ${name} ===\n`)
    const r = spawnSync(process.execPath, [join(here, file)], { env: { ...process.env, APP_URL: url }, encoding: 'utf8', timeout: 600_000 })
    const lines = (r.stdout ?? '').split('\n')
    const pass = lines.filter((l) => l.startsWith('PASS')).length
    const fail = lines.filter((l) => l.startsWith('FAIL'))
    for (const l of fail) console.log(l)
    if (r.status !== 0 && fail.length === 0) console.log((r.stderr || r.stdout || '').split('\n').slice(-12).join('\n'))
    console.log(`${r.status === 0 ? '통과' : '실패'}: ${pass}개 확인`)
    results.push({ name, ok: r.status === 0, pass, fail: fail.length })
  }
} finally {
  server.kill()
}

console.log('\n--- 요약 ---')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.pass}개 확인${r.fail ? `, 실패 ${r.fail}` : ''})`)
console.log(`스크린샷과 임시 파일: ${OUT_DIR}`)
process.exitCode = results.length > 0 && results.every((r) => r.ok) ? 0 : 1

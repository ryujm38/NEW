// 브라우저 시험이 공통으로 쓰는 환경 설정.
//   CHROMIUM_PATH  Chromium/Chrome 실행 파일 경로. 비워 두면 playwright-core가 설치한 브라우저를 쓴다
//                  (먼저 `npx playwright-core install chromium`).
//   OUT_DIR        스크린샷과 임시 파일을 둘 폴더. 기본은 시스템 임시 폴더 아래.
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export const OUT_DIR = process.env.OUT_DIR ?? join(tmpdir(), 'travel-planner-e2e')
mkdirSync(OUT_DIR, { recursive: true })

/** `npm run build:single`이 만드는 단일 파일 버전 */
export const SINGLE_FILE_URL = pathToFileURL(join(appRoot, 'dist-single/index.html')).href

const executablePath = process.env.CHROMIUM_PATH || undefined
// root(컨테이너)로 돌 때는 Chromium 샌드박스를 쓸 수 없다.
const args = process.getuid?.() === 0 ? ['--no-sandbox'] : []

export const launch = () => chromium.launch({ executablePath, args })
export const launchPersistent = (dir, options = {}) => chromium.launchPersistentContext(dir, { executablePath, args, ...options })

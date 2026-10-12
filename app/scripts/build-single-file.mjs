// 앱을 HTML 파일 하나로 합친다. 파일 하나만 열 수 있는 곳(사이드 패널 미리보기, Artifact)용.
//   dist-single/index.html     전체 문서(사이드 패널 등에서 그대로 열기)
//   dist-single/fragment.html  <html>/<head>/<body> 없이 내용만(Artifact는 발행 시 뼈대를 씌워 준다)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'dist-single-src')
const out = join(root, 'dist-single')
const run = (args) => execFileSync('npx', args, { cwd: root, stdio: 'inherit', env: { ...process.env, NO_PWA: '1', BASE_PATH: './', VITE_EMBEDDED: '1' } })

run(['tsc', '-b'])
run(['vite', 'build', '--outDir', 'dist-single-src', '--emptyOutDir'])

const html = readFileSync(join(src, 'index.html'), 'utf8')
const cssHref = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/.exec(html)?.[1]
const jsSrc = /<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/.exec(html)?.[1]
if (!cssHref || !jsSrc) throw new Error('dist-single-src/index.html에서 CSS/JS 경로를 찾지 못했어요.')

// 인라인 <script>/<style> 안에서 HTML 파서를 끊을 수 있는 문자열을 이스케이프한다.
const css = readFileSync(join(src, cssHref), 'utf8').replace(/<\/style/gi, '<\\/style')
const js = readFileSync(join(src, jsSrc), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '여행 플래너'

const body = `<div id="root"></div>\n<script type="module">${js}</script>`
const fragment = `<title>${title}</title>\n<style>${css}</style>\n${body}\n`
const full = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>${title}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'index.html'), full)
writeFileSync(join(out, 'fragment.html'), fragment)
console.log(`dist-single/index.html ${(full.length / 1024).toFixed(0)} KB`)

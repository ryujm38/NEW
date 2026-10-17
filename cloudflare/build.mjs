// Cloudflare Pages(clue-note)에 올릴 dist 폴더를 만든다.
//   cloudflare/clue-site/**  → dist/          (클루 노트 사이트 완성본: 홈, games.json, games/...)
//   avalon/public/**         → dist/board/    (보드게임 화면)
// 클루 사이트 파일이 없으면 멈춘다. (없이 올리면 지금 공개된 클루 노트가 사라지기 때문)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clue = path.join(here, 'clue-site');
const board = path.join(here, '..', 'avalon', 'public');
const dist = path.join(here, 'pages', 'dist');

const htmlAtRoot = fs.existsSync(clue) ? fs.readdirSync(clue).filter((f) => f.endsWith('.html')) : [];
if (htmlAtRoot.length === 0) {
  console.error('❌ cloudflare/clue-site 에 클루 노트 사이트 파일(.html)이 없어요.');
  console.error('   E:\\클루\\site 폴더 안의 파일을 cloudflare/clue-site 에 넣은 뒤 다시 실행하세요.');
  console.error('   (이대로 올리면 지금 공개된 클루 노트가 지워지므로 멈춥니다)');
  process.exit(1);
}
if (fs.existsSync(path.join(clue, 'board'))) {
  console.error('❌ clue-site 안에 board 폴더가 있어요. 보드게임 자리와 겹치므로 이름을 바꿔 주세요.');
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(clue, dist, { recursive: true, filter: (src) => path.basename(src) !== 'README.md' || path.dirname(src) !== clue });
fs.cpSync(board, path.join(dist, 'board'), { recursive: true });

// 홈에서 보드게임으로 가는 링크가 있는지 확인만 한다(없으면 알려 준다)
const texts = fs.readdirSync(dist).filter((f) => /\.(html|json)$/.test(f)).map((f) => fs.readFileSync(path.join(dist, f), 'utf8'));
if (!texts.some((t) => t.includes('board/'))) {
  console.warn('⚠️ 홈(home.html / games.json)에 /board/ 로 가는 링크가 없어요. 주소창에 /board/ 를 치면 들어갈 수 있지만, 홈에 카드를 추가하는 걸 추천해요.');
}
const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`✅ dist 완성: 파일 ${count(dist)}개 (클루 사이트 + board/ 보드게임)`);

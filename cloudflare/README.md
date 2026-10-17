# Cloudflare로 옮기기: clue-note.pages.dev 한 곳에서 클루 노트 + 보드게임

폰 서버(Termux) 없이, 지금 쓰는 `https://clue-note.pages.dev` 주소에서 클루 노트와 보드게임을 같이 돌리는 구성입니다.

```
https://clue-note.pages.dev/            ← 클루 노트 (지금 사이트 그대로)
https://clue-note.pages.dev/board/      ← 보드게임 (아발론, 마피아, 뱅!, 듀얼 …)
https://clue-note.pages.dev/board/ws    ← 보드게임 실시간 연결 → board-rooms Worker의 Durable Object
```

## 구성

| 폴더 | 역할 |
|---|---|
| `clue-site/` | **클루 노트 사이트 완성본을 넣는 곳** (`E:\클루\site` 안의 파일 전부) |
| `worker/` | 게임 방 서버 `board-rooms` (Cloudflare Worker + Durable Object). 규칙은 `avalon/` 코드를 그대로 씀 |
| `pages/` | Pages 프로젝트 `clue-note` 설정과 `/board/ws` 연결 함수 |
| `build.mjs` | `clue-site` + `avalon/public` → `pages/dist` 로 묶음 |
| `../.github/workflows/cloudflare-deploy.yml` | GitHub에서 자동으로 위 두 가지를 Cloudflare에 올림 |

- 방은 Durable Object 하나가 들고 있고, 바뀔 때마다 저장소에 적습니다. 모두 잠깐 나갔다 와도(객체가 내려가도) 다시 들어오면 이어서 할 수 있습니다. 6시간 동안 아무 일 없는 방은 지워집니다.
- 무료 플랜 기준: Durable Object 요청 하루 10만 건, 실행 시간 하루 13,000 GB-s(방 서버가 켜져 있을 수 있는 시간으로 약 28시간)입니다. 방 서버는 하나라서 방이 여러 개여도 시간은 한 번만 셉니다. 친구들끼리 쓰는 정도는 충분합니다. 넘으면 그날은 연결이 실패하고 다음 날(한국 시간 오전 9시) 풀립니다.

## 한 번만 하면 되는 준비

### 1. 클루 노트 파일 넣기
`E:\클루\site` 폴더 **안의 파일 전부**를 이 저장소의 `cloudflare/clue-site/` 에 넣어 올립니다.
(이 폴더에 `.html` 이 없으면 배포가 자동으로 멈춥니다. 그대로 올리면 지금 클루 노트가 사라지기 때문입니다.)

홈 화면에 보드게임 카드를 넣으려면 `games.json`(또는 `home.html`)에 `/board/` 로 가는 링크를 추가하세요.

### 2. Cloudflare API 토큰 만들기
1. Cloudflare 대시보드 → 오른쪽 위 프로필 → **My Profile** → **API Tokens** → **Create Token**
2. **Edit Cloudflare Workers** 템플릿의 **Use template**
3. Permissions에 한 줄 추가: **Account** · **Cloudflare Pages** · **Edit**
4. Account Resources에서 본인 계정 선택 → **Continue to summary** → **Create Token** → 나온 토큰 복사(한 번만 보임)
5. 계정 ID: 대시보드 **Workers & Pages** 화면 오른쪽(또는 주소창 `dash.cloudflare.com/<계정ID>/...`)에 있는 32자리 값

### 3. GitHub에 비밀값 넣기
저장소 **Settings → Secrets and variables → Actions → New repository secret** 에서 두 개:
- `CLOUDFLARE_API_TOKEN` = 2번 토큰
- `CLOUDFLARE_ACCOUNT_ID` = 계정 ID

## 배포
- 저장소 **Actions** 탭 → **Cloudflare 배포 (clue-note + 보드게임)** → **Run workflow**
- 또는 게임/사이트 파일을 고쳐서 브랜치에 올리면 자동으로 실행됩니다.
- 순서: 게임 규칙 테스트 → 클루 파일·비밀값 확인 → `board-rooms` Worker 배포 → `clue-note` Pages 배포

배포 뒤 `https://clue-note.pages.dev/board/` 에서 확인하세요.

## 알아둘 점
- Pages 프로젝트의 운영 브랜치가 `main` 이 아니면 미리보기 주소로만 올라갑니다. 대시보드 clue-note → Settings에서 운영 브랜치 이름을 확인하고, 다르면 워크플로 파일의 `PAGES_BRANCH` 를 바꾸세요.
- 이 저장소의 Node 서버(`avalon/server.js`, Termux용)도 그대로 동작합니다. 두 방식은 같은 규칙 코드(`avalon/hub.js`)를 씁니다.

## 로컬에서 시험하기 (컴퓨터)
```bash
cd cloudflare/worker && npx wrangler dev --port 8787          # 방 서버
node cloudflare/build.mjs                                     # dist 만들기 (clue-site 필요)
cd cloudflare/pages && npx wrangler pages dev --port 8788     # 사이트 → http://localhost:8788/board/
```

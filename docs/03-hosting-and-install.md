# 웹으로 올리기와 앱처럼 설치하기 (v1)

작성일: 2026-10-13 · 작성: Claude(모루) · 결정: 망치(당신)

## 1. 이 앱은 어떤 형태인가

반응형 웹사이트이면서 **PWA(설치 가능한 웹앱)** 입니다. 주소로 들어가서 쓸 수도 있고, 폰 홈 화면에 추가하면 앱처럼 아이콘으로 열리고 인터넷이 없어도 열립니다. 앱스토어에 올리는 것이 아니라서 심사도 수수료도 없습니다.

- 서버가 없는 **정적 사이트**입니다. 빌드 결과(`app/dist`)를 올리기만 하면 됩니다.
- 주소 이동은 `#` 방식이라 호스팅 쪽에 별도 주소 규칙(rewrite)을 설정할 필요가 없습니다.
- 데이터는 사용자 기기에만 저장됩니다. 계정과 동기화는 아직 없습니다.

## 2. 설치 방법 (사용자 안내용)

| 기기 | 방법 |
|---|---|
| 안드로이드 크롬 | 주소로 들어가면 앱 안에 "설치하기" 버튼이 뜹니다. 또는 크롬 메뉴 → "홈 화면에 추가" |
| 아이폰·아이패드 | Safari로 열고 아래 공유 버튼 → "홈 화면에 추가". 앱 안에 방법을 안내하는 카드가 뜹니다 |
| 컴퓨터(크롬·엣지) | 주소창 오른쪽의 설치 아이콘, 또는 앱 안의 "설치하기" 버튼 |

## 3. 무료 호스팅 비교

**전제:** 사업으로 키울 계획이라서 "상업적으로 써도 되는가"를 가장 먼저 봤습니다. 아래 한도 숫자는 대부분 제3자 블로그에서 가져왔고 공식 문서로 확인한 것은 표시해 두었습니다. 요금제는 자주 바뀌니 가입 전에 각 공식 페이지를 다시 보세요.

| | Cloudflare Pages | Vercel (Hobby) | Netlify (Free) | Firebase Hosting (Spark) | GitHub Pages |
|---|---|---|---|---|---|
| **상업적 이용** | 허용으로 알려짐(제3자 자료, 공식 약관은 확인 못함) | **불가.** 개인·비상업 용도만(공식 문서) | 확인 못함 | 확인 못함 | **불가.** 온라인 사업·SaaS 용도로 쓰면 안 됨(공식 문서) |
| **트래픽** | 정적 요청·대역폭 무제한이라고 소개됨. 공식 문서에는 상한이 적혀 있지 않음 | 월 약 100GB. 넘으면 과금 없이 배포가 멈춤(제3자) | 월 300 크레딧. 다 쓰면 팀의 모든 사이트가 멈춤. 크레딧 환산 비율은 출처마다 다름 | 저장 10GB, 전송 월 10GB(제3자, 공식 확인 못함) | 소프트 한도 월 100GB, 사이트 1GB(공식) |
| **빌드·기타** | 빌드 월 500회, 파일 2만 개, 파일당 25MiB, 커스텀 도메인 100개(공식) | | | | 빌드 시간당 10회(Actions로 올리면 해당 없음) |
| **서버 기능을 나중에 붙일 때** | Workers(서버리스), D1(DB), KV | Functions, 외부 DB 연동 | Functions | **Auth·Firestore 같은 계정·DB가 한 곳에 있음** | 불가(정적만) |
| **설정 난이도** | 쉬움 | **가장 쉬움** | 쉬움 | 보통(CLI 설정) | 쉬움 |

### 추천

1. **본 서비스용: Cloudflare Pages.** 트래픽 걱정이 가장 적고, 사업으로 쓸 때 약관에 걸릴 가능성이 낮아 보입니다. 나중에 계정·동기화가 필요해지면 같은 곳의 Workers와 DB를 붙일 수 있습니다.
2. **지인 테스트만 빨리 해 보려면: Vercel.** 가장 쉽습니다. 다만 Hobby는 비상업용이라, 돈을 받기 시작하기 전에 옮기거나 유료(월 $20, 제3자 자료)로 올려야 합니다. 이 앱은 정적이라 옮기기는 어렵지 않습니다.
3. **계정·DB까지 한 번에 쓰고 싶다면: Firebase.** 호스팅과 Auth, Firestore를 한곳에서 씁니다.
4. **사업용으로는 피하세요:** GitHub Pages(공식 약관상 사업·SaaS 불가), Vercel Hobby(비상업용).
5. Netlify는 크레딧제라 한도가 예측하기 어렵고, 초과하면 사이트가 멈추는 점이 부담입니다.

> 이 저장소에 있는 GitHub Pages 배포 설정(`.github/workflows/deploy.yml`)은 수동 실행만 가능하게 꺼 두었습니다. 위 이유로 본 서비스에는 쓰지 않는 것을 권합니다.

### 확인하지 못한 것
- Cloudflare·Netlify·Firebase의 **공식 약관에서 상업적 이용 허용 여부**를 확인하지 못했습니다. 제3자 자료를 근거로 했습니다. 가입 전에 약관을 직접 확인해 주세요.
- Cloudflare가 Pages를 Workers로 통합하는 계획이 있는지는 확인하지 못했습니다.
- Firebase Hosting의 무료 한도 숫자는 공식 페이지에서 확인하지 못했습니다.

## 4. 올리는 방법 (Cloudflare Pages 기준)

직접 해야 하는 부분(계정 만들기, GitHub 연결 허용)이 있어서 제가 대신할 수 없습니다.

1. Cloudflare 계정을 만들고 Workers & Pages → Create → Pages → GitHub 저장소 `ryujm38/NEW`를 연결합니다.
2. 빌드 설정을 이렇게 입력합니다.
   - Production branch: 기본 브랜치
   - **Root directory: `app`**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - 환경 변수 `NODE_VERSION` = `22`
3. 배포가 끝나면 `https://<프로젝트 이름>.pages.dev`가 만들어집니다. 도메인을 따로 사면 Custom domains에서 연결합니다.

Vercel은 같은 값(Root Directory `app`, Build `npm run build`, Output `dist`)으로 Framework Preset을 Vite로 두면 됩니다.

배포 주소가 바뀌어도 주소 규칙이 `#` 방식이라 새로고침이나 직접 접속이 깨지지 않습니다. 단, 하위 경로(`/무엇`)로 배포하는 호스팅은 `BASE_PATH`를 지정해야 합니다(`app/README.md`).

## 5. 이 환경에서 확인한 것

- 브라우저의 **설치 가능성 검사**(Chromium의 `Page.getInstallabilityErrors`)가 오류 없음으로 나왔습니다(일반 창과 같은 영구 프로필에서 확인. 시크릿 창에서는 크롬이 설치를 막아서 `in-incognito`가 나옵니다).
- 매니페스트 오류 없음, 아이콘 4종(192·512·마스크용 512·SVG)과 아이폰용 아이콘이 모두 받아짐.
- 서비스 워커가 동작하고 인터넷이 없어도 새로고침하면 앱이 열림.
- 설치 안내(안드로이드형 버튼, 아이폰형 방법 안내)의 동작: 설치 이벤트는 **직접 만들어 보낸 것**이라, 실제 브라우저가 보내는 이벤트에 대한 반응은 확인하지 못했습니다.

### 확인하지 못한 것
- **실제 안드로이드·아이폰에서의 설치와 홈 화면 아이콘 모양.** 아이콘 모양(특히 마스크용 아이콘이 기기마다 어떻게 잘리는지)은 직접 보셔야 합니다.
- 설치를 실제로 완료하고 앱 모드로 열어 보는 것. 이 환경에서는 설치 창을 띄울 수 없었습니다.

## 6. 알아 둘 점: 데이터는 각자의 기기에만 저장됩니다

- 폰에서 만든 여행은 컴퓨터에서 보이지 않습니다. 기기 간 동기화는 아직 없습니다(다음 큰 단계).
- 브라우저가 저장 공간이 모자라거나 오래 안 쓰면 데이터를 지울 수 있습니다. 앱은 시작할 때 "지우지 마세요"라고 요청하지만, 허락 여부는 브라우저가 정합니다.
- 아이폰: 사파리는 7일 동안 안 쓰면 사이트 데이터를 지울 수 있습니다. 홈 화면에 추가한 앱은 이 규칙에서 제외된다고 Apple 문서에 있으나, 이후 변경 여부는 확인하지 못했습니다(iOS 17.4 관련 주장은 확인 못함). **중요한 여행은 '백업 내보내기'로 복사해 두라고 사용자에게 안내하세요.**

## 출처 (공식 문서와 2차 자료가 섞여 있음)

공식
- [Vercel Hobby 플랜](https://vercel.com/docs/plans/hobby) — 비상업적·개인 용도 제한
- [Vercel Fair Use 안내](https://vercel.com/docs/limits/fair-use-guidelines) — "상업적"의 정의가 넓음(금전적 이익이 걸린 모든 배포)
- [Cloudflare Pages 한도](https://developers.cloudflare.com/pages/platform/limits) — 빌드 500회, 파일 2만 개, 25MiB
- [GitHub Pages 한도](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) — 사업·SaaS 불가, 1GB, 소프트 100GB
- [Apple 개발자 포럼: iOS PWA 데이터 유지](https://developer.apple.com/forums/thread/710157)

2차 자료(블로그, 비교 사이트)
- [Vercel 무료 한도 2026 — DeployWise](https://deploywise.dev/blog/vercel-free-tier-limits-2026)
- [Cloudflare Pages 무료 한도 2026 — temps.sh](https://temps.sh/blog/cloudflare-pages-free-tier-limits-2026)
- [Cloudflare Pages 무료 티어 — FreeTiers](https://www.freetiers.com/directory/cloudflare-pages)
- [Netlify 무료 플랜 2026 — netli.fyi](https://netli.fyi/blog/netlify-free-plan-limits-2026)
- [Firebase 요금 안내 — DEV Community](https://dev.to/androve2k/spark-vs-blaze-the-firebase-pricing-guide-i-wish-id-read-sooner-onb)
- [PWA iOS 제한 정리 — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)

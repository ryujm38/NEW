# 여행 플래너 (가칭)

일정, 예산, 지도 링크를 한곳에서 정리하는 반응형 웹 앱. 폰·태블릿·PC 브라우저에서 쓰고, 홈 화면에 추가하면 앱처럼 열려요(PWA).

## 지금 되는 것 (MVP)

- 여행 만들기/수정/삭제 (여행지, 기간, 총 예산)
- 일차별 일정 추가·수정·삭제, 위/아래 순서 변경, 시간순 정렬
- 일정별 비용 입력 → 일차별·전체 합계, 예산 사용률과 초과 경고
- 장소별 네이버지도·구글지도 검색 링크
- 일정 텍스트 공유(지원 기기는 공유 시트, 아니면 클립보드 복사)
- 오프라인 동작(서비스 워커), 백업 내보내기/불러오기(JSON)
- 데이터는 **이 기기의 localStorage에만** 저장됩니다. 서버·계정·동기화는 아직 없어요.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 단위 테스트 (날짜 계산, 정렬, 예산, 저장소 검증)
npm run lint
npm run build    # dist/ 생성 (PWA 포함)
npm run preview  # 빌드 결과 미리보기
```

## 배포 (GitHub Pages)

`.github/workflows/deploy.yml`이 기본 브랜치에 푸시될 때마다 lint → 테스트 → 빌드 → 배포를 자동으로 실행해요. 주소는 `https://<사용자>.github.io/NEW/`예요.

**처음 한 번만:** 저장소 Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 바꿔 주세요. 이걸 켜기 전에는 배포 단계가 실패해요.

로컬에서 배포와 같은 조건으로 확인하려면 빌드와 미리보기 **둘 다**에 같은 경로를 지정해야 해요.

```bash
BASE_PATH=/NEW/ npm run build
BASE_PATH=/NEW/ npm run preview   # http://localhost:4173/NEW/
```

## 구조

- `src/lib/trip.ts` 날짜·예산·정렬 등 순수 로직 (테스트 대상)
- `src/lib/storage.ts` localStorage 읽기/쓰기와 데이터 검증
- `src/store.ts` 상태 훅, 해시 라우팅(`#/trip/<id>`)
- `src/components/` 화면 컴포넌트

## 알려진 한계

- PWA 아이콘이 SVG 하나뿐이라, 일부 기기의 홈 화면 아이콘이 기본 모양으로 나올 수 있어요. 배포 전에 192/512px PNG가 필요해요.
- 장소는 글자로만 저장해요. 좌표·장소 검색 자동완성은 없어요.
- 기기 간 동기화와 여러 명이 함께 편집하는 기능은 없어요.

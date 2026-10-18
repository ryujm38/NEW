'use strict';
// 초보자 가이드: 모든 게임이 같이 쓰는 틀. 게임별 내용은 guide-<종류>.js 가 GUIDES[종류]에 넣는다.
//
//   GUIDES[kind] = {
//     intro: [{ icon, title, text }],   // 게임을 시작할 때 넘겨 보는 설명 카드 3~6장 (목표 → 내 차례 → 이기는 법)
//     tip(S, ui) → null | { title, text, target? }
//         // 지금 화면에서 "내가 할 일"을 한두 문장으로. target은 반짝이게 할 요소의 CSS 선택자(없어도 됨)
//   }
//
// 켜고 끄기는 사람(기기)마다, 게임 종류마다 따로 저장한다(localStorage). 처음에는 켜져 있고,
// 같은 게임을 2판 끝내면 "이제 꺼도 될 것 같아요"라고 한 번 권한다. 게임 진행(서버)에는 아무 영향이 없다.
window.GUIDES = window.GUIDES || {};

const GUIDE = { introOpen: false, introStep: 0, seenGame: {}, lastOverGame: null };

function guideStore(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* 저장을 못 해도 가이드는 켜진 채로 동작 */ }
  return null;
}
const guideOn = (kind) => guideStore(`guide:${kind}`) !== 'off';
const guidePlays = (kind) => Number(guideStore(`guidePlays:${kind}`)) || 0;
function setGuide(kind, on) {
  guideStore(`guide:${kind}`, on ? 'on' : 'off');
  if (!on) GUIDE.introOpen = false;
}

// 새 상태가 올 때: 게임이 막 시작됐으면 설명 카드를 열고, 막 끝났으면 판 수를 센다
function guideOnState(prev, cur) {
  if (!cur || !GUIDES[cur.kind]) return;
  const key = `${cur.code}:${cur.gameNo}`;
  if (cur.phase !== 'lobby' && cur.phase !== 'over' && prev && prev.phase === 'lobby' && guideOn(cur.kind) && !GUIDE.seenGame[key]) {
    GUIDE.seenGame[key] = true;
    if ((GUIDES[cur.kind].intro || []).length) {
      GUIDE.introOpen = true;
      GUIDE.introStep = 0;
    }
  }
  if (cur.phase === 'over' && prev && prev.phase !== 'over' && GUIDE.lastOverGame !== key) {
    GUIDE.lastOverGame = key;
    guideStore(`guidePlays:${cur.kind}`, String(guidePlays(cur.kind) + 1));
  }
}

function guideTip() {
  const g = S && GUIDES[S.kind];
  if (!g || !g.tip) return null;
  try { return g.tip(S, ui) || null; } catch (e) { console.error('guide tip', e); return null; }
}

// 게임 화면 맨 위(방장 이름 줄 바로 아래)에 들어가는 안내 띠
function guideBarHtml() {
  if (!S || S.phase === 'lobby' || !GUIDES[S.kind]) return '';
  const kind = S.kind;
  if (!guideOn(kind)) {
    return '<div class="gd-off"><button class="gd-chip" data-act="guideOn">🧭 초보자 가이드 켜기</button></div>';
  }
  const tip = guideTip();
  const plays = guidePlays(kind);
  const suggest = plays >= 2 && S.phase === 'over'
    ? `<p class="gd-suggest">벌써 ${plays}판 했어요! 이제 가이드 없이 해도 될 것 같아요. <button class="gd-link" data-act="guideOff">가이드 끄기</button></p>` : '';
  return `<div class="gd-bar" role="status">
    <div class="gd-head"><span class="gd-badge">🧭 가이드</span>${tip ? `<b class="gd-title">${esc(tip.title)}</b>` : '<b class="gd-title">설명 카드를 다시 볼 수 있어요</b>'}
      <button class="gd-x" data-act="guideOff" aria-label="가이드 끄기">끄기</button></div>
    ${tip && tip.text ? `<p class="gd-text">${tip.html ? tip.text : esc(tip.text)}</p>` : ''}
    <div class="gd-acts"><button class="gd-link" data-act="guideIntro">📖 처음 설명 다시 보기</button></div>
    ${suggest}
  </div>`;
}

// 대기실에서 보이는 켜기/끄기 줄
function guideLobbyHtml(kind) {
  if (!GUIDES[kind]) return '';
  const on = guideOn(kind);
  return `<div class="gd-lobby">
    <div><b>🧭 초보자 가이드</b><small>${on ? '게임 중에 지금 할 일을 알려 줘요. 나만 보여요.' : '꺼져 있어요. 처음이라면 켜 두세요.'}</small></div>
    <button class="gd-toggle ${on ? 'on' : ''}" data-act="${on ? 'guideOff' : 'guideOn'}" role="switch" aria-checked="${on}"><i></i></button>
  </div>${on ? '<button class="ghost sm gd-preview" data-act="guideIntro">📖 게임 설명 미리 보기</button>' : ''}`;
}

// 시작할 때 넘겨 보는 설명 카드
function guideIntroHtml() {
  if (!GUIDE.introOpen || !S || !GUIDES[S.kind]) return '';
  const cards = GUIDES[S.kind].intro || [];
  if (!cards.length) return '';
  const i = Math.min(GUIDE.introStep, cards.length - 1);
  const c = cards[i];
  const dots = cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  const last = i === cards.length - 1;
  return `<div class="overlay gd-ov" data-act="guideClose"><div class="gd-card">
    <div class="gd-step">${gameName(S.kind)} 처음 설명 · ${i + 1}/${cards.length}</div>
    <div class="gd-icon">${c.icon || '💡'}</div>
    <h2>${esc(c.title)}</h2>
    <p>${c.html ? c.text : esc(c.text)}</p>
    <div class="gd-dots">${dots}</div>
    <div class="row">${i > 0 ? '<button data-act="guidePrev">이전</button>' : '<button class="ghost" data-act="guideClose">건너뛰기</button>'}
      <button class="primary" data-act="${last ? 'guideClose' : 'guideNext'}">${last ? (S.phase === 'lobby' ? '알겠어요' : '시작하기') : '다음'}</button></div>
  </div></div>`;
}

// 그린 뒤: 지금 눌러야 할 곳을 반짝이게
function guideAfterRender() {
  if (!S || S.phase === 'lobby' || !GUIDES[S.kind] || !guideOn(S.kind) || GUIDE.introOpen) return;
  const tip = guideTip();
  if (!tip || !tip.target) return;
  try {
    document.querySelectorAll(tip.target).forEach((el) => el.classList.add('gd-hl'));
  } catch { /* 잘못된 선택자는 무시 */ }
}

// 가이드 버튼 처리. 처리했으면 true
function guideClick(act, el, ev) {
  const kind = S && S.kind;
  switch (act) {
    case 'guideOn': setGuide(kind, true); render(); return true;
    case 'guideOff': setGuide(kind, false); showToast('가이드를 껐어요. 맨 위 버튼으로 다시 켤 수 있어요.'); return true;
    case 'guideIntro': GUIDE.introOpen = true; GUIDE.introStep = 0; render(); return true;
    case 'guideNext': GUIDE.introStep += 1; render(); return true;
    case 'guidePrev': GUIDE.introStep = Math.max(0, GUIDE.introStep - 1); render(); return true;
    case 'guideClose': {
      // 카드 안쪽을 누른 건 무시하고, 배경이나 버튼을 눌렀을 때만 닫는다
      if (el.classList.contains('gd-ov') && ev && ev.target !== el) return true;
      GUIDE.introOpen = false;
      render();
      return true;
    }
    default: return false;
  }
}

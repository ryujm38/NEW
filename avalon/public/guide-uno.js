'use strict';
// 우노 초보자 가이드 (틀은 guide.js). S에 들어 있는 정보(내 손패, 맨 위 카드, 장수)만 쓴다.
window.GUIDES = window.GUIDES || {};
(() => {
  const COLOR = { r: '빨강', y: '노랑', g: '초록', b: '파랑' };
  const KIND = { skip: '스킵', rev: '리버스', d2: '+2', wild: '와일드', d4: '와일드 +4' };
  const cardName = (c) => (c.color === 'w' ? KIND[c.kind] : `${COLOR[c.color]} ${KIND[c.kind] || c.kind}`);
  const nameOf = (S, id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
  const SPECIAL = {
    skip: '스킵: 다음 사람이 한 번 쉬어요.',
    rev: '리버스: 도는 방향이 반대로 바뀌어요. (2명이면 한 번 더 내 차례)',
    d2: '+2: 다음 사람이 2장을 뽑고 쉬어요.',
    wild: '와일드: 아무 때나 낼 수 있고, 다음에 이을 색을 내가 정해요.',
    d4: '와일드 +4: 다음 사람이 4장 뽑고 쉬어요. 지금 색 카드가 손에 없을 때만 낼 수 있어요.',
  };

  // "빨강 7 위에는 빨강 카드나 7을 낼 수 있어요" 같은 설명
  function matchText(S) {
    const t = S.top;
    if (!t) return '';
    const col = COLOR[S.color] || '';
    if (t.color === 'w') return `맨 위는 ${KIND[t.kind]}이고 정해진 색은 <b>${col}</b>이에요. <b>${col} 카드</b>나 와일드를 낼 수 있어요.`;
    const what = /^\d$/.test(t.kind) ? `숫자 ${t.kind}` : KIND[t.kind];
    return `맨 위가 <b>${cardName(t)}</b>이니 <b>${col} 카드</b>나 <b>${what}</b>, 또는 와일드를 낼 수 있어요.`;
  }

  window.GUIDES.uno = {
    intro: [
      { icon: '🃏', title: '손패를 먼저 다 털면 이겨요', text: '모두 7장씩 받고 시작해요. 한 장씩 내서 <b>내 손의 카드를 가장 먼저 0장</b>으로 만드는 사람이 이겨요.', html: true },
      { icon: '👀', title: '화면 읽는 법', text: '맨 위 칸에 <b>사람마다 남은 카드 수</b>가 크게 보여요. <b>노란 테두리</b>가 지금 차례, <b>점선</b>이 다음 차례, 칸 사이 <b>화살표</b>가 도는 방향이에요. 가운데 오른쪽 동그라미가 <b>지금 이어야 하는 색</b>이고, 1장 남은 사람에겐 빨간 <b>우노!</b> 표시가 붙어요.', html: true },
      { icon: '🎨', title: '같은 색 또는 같은 숫자', text: '가운데 맨 위 카드와 <b>색이 같거나</b>, <b>숫자/기호가 같은</b> 카드를 낼 수 있어요. 예: 빨강 7 위에는 빨강 아무 카드나, 파랑 7·초록 7 같은 7을 낼 수 있어요. 낼 수 있는 카드는 반짝여요.', html: true },
      { icon: '👆', title: '내 차례: 탭, 그리고 한 번 더 탭', text: '반짝이는 카드를 <b>한 번 탭</b>하면 위로 올라오고, <b>한 번 더 탭</b>(또는 아래 "내기" 버튼)하면 내요. 낼 카드가 없으면 왼쪽 <b>뽑는 더미</b>를 눌러 1장 뽑아요.', html: true },
      { icon: '⚡', title: '특별한 카드', text: '<b>⊘ 스킵</b> 다음 사람 쉬기 · <b>⇄ 리버스</b> 방향 바꾸기 · <b>+2</b> 다음 사람 2장 뽑기 · <b>와일드</b> 색 바꾸기 · <b>와일드 +4</b> 색 바꾸고 다음 사람 4장. +2와 +4는 겹쳐 낼 수 없어요.', html: true },
      { icon: '📣', title: '한 장 남으면 "우노!"', text: '카드가 1장 남으면 바로 <b>우노!</b> 버튼을 누르세요. 깜빡하면 다른 사람이 고발해서 <b>2장</b>을 더 뽑게 돼요. 2장일 때 미리 외쳐 둘 수도 있어요.', html: true },
    ],
    tip(S, ui) {
      const me = S.players.find((p) => p.id === S.me);
      const w = S.unoWindow;
      if (S.phase === 'over') {
        if (S.winnerId === S.me) return { title: '내가 이겼어요! 🎉', text: '카드를 모두 털어냈어요. 방장이 "한 판 더"를 누르면 승수를 이어서 또 할 수 있어요.' };
        return { title: `${nameOf(S, S.winnerId)}님이 이겼어요`, text: '먼저 손패를 다 낸 사람이 이겨요. 다음 판에는 숫자 높은 카드와 +2·+4 같은 카드를 먼저 털어 보세요.' };
      }
      if (S.phase !== 'play') return null;
      if (w && !w.called && w.id === S.me) {
        return { title: '지금 바로 "우노!"를 누르세요', text: '카드가 1장 남았어요! 다른 사람이 먼저 고발하면 2장을 더 뽑아야 해요.', target: '[data-act="unoCall"]' };
      }
      if (w && !w.called && w.id !== S.me) {
        return { title: '고발 기회예요!', text: `${nameOf(S, w.id)}님이 1장 남았는데 우노를 안 외쳤어요. 다음 사람이 움직이기 전에 고발하면 그 사람이 2장을 뽑아요.`, target: '[data-act="unoCatch"]' };
      }
      const myTurn = S.turnId === S.me;
      if (!myTurn) {
        const ti = S.players.findIndex((p) => p.id === S.turnId);
        const n = S.players.length;
        const nextMe = ti >= 0 && S.players[(((ti + S.dir) % n) + n) % n].id === S.me;
        const one = S.players.find((p) => p.count === 1 && p.id !== S.me);
        if (one) return { title: `${nameOf(S, S.turnId)}님 차례예요`, text: `${one.name}님이 1장 남았어요! 그 사람 앞 차례라면 스킵·+2로 막아 보세요.` };
        return {
          title: `${nameOf(S, S.turnId)}님 차례예요`,
          text: nextMe ? '다음이 내 차례예요! 맨 위 카드와 색이나 숫자가 같은 카드가 있는지 미리 봐 두세요.' : '기다리는 동안 내 손패를 살펴보세요. 위쪽 칸의 노란 테두리가 지금 차례, 점선이 다음 차례예요.',
        };
      }
      if (ui.colorOpen) {
        return { title: '이을 색을 골라요', text: '내 손에 가장 많이 남은 색을 고르면 다음 차례에 내기 쉬워요. 각 색에 "내 손에 몇 장"이 적혀 있어요.', target: '.uno-wheel' };
      }
      const playable = S.hand.filter((c) => c.playable);
      if (S.drewId !== null) {
        const c = S.hand.find((x) => x.id === S.drewId);
        return { title: '뽑은 카드를 낼 수 있어요', text: `방금 뽑은 ${c ? cardName(c) : '카드'}는 낼 수 있어요. 탭해서 내거나, 아끼고 싶으면 "넘기기"를 누르세요.`, target: '.uno-hand .uno-card.drew' };
      }
      const sel = S.hand.find((c) => c.id === ui.unoSel);
      if (sel) {
        return { title: `${cardName(sel)} 낼까요?`, text: `${SPECIAL[sel.kind] ? `${SPECIAL[sel.kind]} ` : ''}같은 카드를 한 번 더 탭하거나 아래 버튼을 누르면 내요.`, target: '[data-act="unoPlay"]' };
      }
      if (!playable.length) {
        return { title: '낼 카드가 없어요 → 1장 뽑기', text: `${matchText(S)} 맞는 카드가 없으니 왼쪽 뽑는 더미를 누르세요. 뽑은 카드가 맞으면 바로 낼 수 있어요.`, html: true, target: '[data-act="unoDraw"]' };
      }
      if (me && me.count === 2 && !S.myUnoReady) {
        return { title: '이번에 내면 1장 남아요', text: '"우노 미리 외치기"를 먼저 눌러 두면 깜빡해도 안전해요. 그다음 반짝이는 카드를 내세요.', target: '[data-act="unoCall"]' };
      }
      const special = playable.find((c) => SPECIAL[c.kind] && c.color !== 'w');
      return {
        title: `내 차례! 낼 수 있는 카드 ${playable.length}장`,
        text: `${matchText(S)}${special ? ` 💡 ${SPECIAL[special.kind]}` : ''}`,
        html: true,
        target: '.uno-hand .uno-card.ok',
      };
    },
  };
})();

'use strict';
// 세븐 원더스 듀얼 스타일 카드·불가사의·진보 토큰 정보. 서버(require)와 화면(<script>)이 같은 파일을 쓴다.
// 카드 구성(이름·비용·효과)은 원작 목록이 아니라 비슷한 구조로 새로 만든 것이다.
//
// 비용 키: W 목재, C 점토, S 석재, G 유리, P 파피루스, $ 동전
// 카드 속성: color, cost, res(고정 생산), choice(매 번 하나 고르는 생산), trade(그 자원 구입가 1),
//   vp, shields, coins(지을 때 동전), per{colors,coins}(지을 때 내 도시 카드 수만큼 동전), sym(과학 기호),
//   gives(연계 기호), from(이 기호가 있으면 무료), guild{colors|wonders|coins}

const DUEL_DATA = (() => {
  const RES = { W: '🪵', C: '🧱', S: '🪨', G: '🫙', P: '📃' };
  const RES_NAME = { W: '목재', C: '점토', S: '석재', G: '유리', P: '파피루스' };
  const COLORS = {
    brown: { name: '원자재', css: '#8a5a2b' },
    grey: { name: '제품', css: '#8b9098' },
    blue: { name: '시민', css: '#3a6fd0' },
    green: { name: '과학', css: '#2f9e5a' },
    yellow: { name: '상업', css: '#d6b13a' },
    red: { name: '군사', css: '#d9453a' },
    purple: { name: '길드', css: '#8a4fc7' },
  };
  const SYMS = {
    wheel: { icon: '⚙️', name: '톱니바퀴' },
    astro: { icon: '🔭', name: '천체관측' },
    quill: { icon: '✒️', name: '문자' },
    mortar: { icon: '⚗️', name: '약학' },
    globe: { icon: '🌐', name: '지구본' },
    sundial: { icon: '🧭', name: '해시계' },
    law: { icon: '⚖️', name: '법률' },
  };
  const CHAINS = {
    mask: '🎭', moon: '🌙', drop: '💧', jar: '🏺', bottle: '🧴', lamp: '🪔', book: '📖', cup: '🥤',
    horse: '🐴', sword: '⚔️', fort: '🏰', tower: '🗼',
    arch: '🌉', column: '🏛️', sun: '☀️', podium: '🎤', scroll: '🗞️', flask: '🧪', helm: '⛑️', flag: '🚩', bow: '🏹', wall: '🛡️',
  };

  const C = [];
  let seq = 0;
  const add = (age, color, name, cost, extra) => { C.push({ id: seq++, age, color, name, cost, ...extra }); };

  // ---- 1시대 (23장) ----
  add(1, 'brown', '벌목장', {}, { res: { W: 1 } });
  add(1, 'brown', '점토 웅덩이', {}, { res: { C: 1 } });
  add(1, 'brown', '채석장', {}, { res: { S: 1 } });
  add(1, 'brown', '벌목 캠프', { $: 1 }, { res: { W: 1 } });
  add(1, 'brown', '점토 구덩이', { $: 1 }, { res: { C: 1 } });
  add(1, 'brown', '석재 채굴장', { $: 1 }, { res: { S: 1 } });
  add(1, 'grey', '유리 공방', { $: 1 }, { res: { G: 1 } });
  add(1, 'grey', '제지소', { $: 1 }, { res: { P: 1 } });
  add(1, 'blue', '극장', {}, { vp: 3, gives: 'mask' });
  add(1, 'blue', '제단', {}, { vp: 3, gives: 'moon' });
  add(1, 'blue', '목욕탕', { S: 1 }, { vp: 3, gives: 'drop' });
  add(1, 'green', '약국', { G: 1 }, { sym: 'wheel', vp: 1, gives: 'bottle' });
  add(1, 'green', '공방', { P: 1 }, { sym: 'astro', vp: 1, gives: 'lamp' });
  add(1, 'green', '필사실', { $: 2 }, { sym: 'quill', vp: 0, gives: 'book' });
  add(1, 'green', '약제사', { $: 2 }, { sym: 'mortar', vp: 0, gives: 'cup' });
  add(1, 'red', '마구간', { W: 1 }, { shields: 1, gives: 'horse' });
  add(1, 'red', '수비대', { C: 1 }, { shields: 1, gives: 'sword' });
  add(1, 'red', '목책', { $: 2 }, { shields: 1, gives: 'fort' });
  add(1, 'red', '망루', { S: 1 }, { shields: 1, gives: 'tower' });
  add(1, 'yellow', '선술집', {}, { coins: 4, gives: 'jar' });
  add(1, 'yellow', '목재 비축소', { $: 3 }, { trade: ['W'] });
  add(1, 'yellow', '점토 비축소', { $: 3 }, { trade: ['C'] });
  add(1, 'yellow', '석재 비축소', { $: 3 }, { trade: ['S'] });

  // ---- 2시대 (23장) ----
  add(2, 'brown', '제재소', { $: 2 }, { res: { W: 2 } });
  add(2, 'brown', '벽돌 공장', { $: 2 }, { res: { C: 2 } });
  add(2, 'brown', '채석 작업장', { $: 2 }, { res: { S: 2 } });
  add(2, 'grey', '유리 부는 공방', {}, { res: { G: 1 } });
  add(2, 'grey', '건조실', {}, { res: { P: 1 } });
  add(2, 'blue', '수도교', { S: 3 }, { vp: 5, from: 'drop', gives: 'arch' });
  add(2, 'blue', '조각상', { C: 2 }, { vp: 4, from: 'mask', gives: 'column' });
  add(2, 'blue', '신전', { W: 1, P: 1 }, { vp: 4, from: 'moon', gives: 'sun' });
  add(2, 'blue', '법원', { W: 2, G: 1 }, { vp: 5 });
  add(2, 'blue', '연단', { S: 1, W: 1 }, { vp: 4, gives: 'podium' });
  add(2, 'green', '도서관', { S: 1, G: 1 }, { sym: 'quill', vp: 1, from: 'book', gives: 'scroll' });
  add(2, 'green', '학교', { W: 1, P: 2 }, { sym: 'wheel', vp: 1, from: 'cup' });
  add(2, 'green', '연구소', { W: 1, G: 2 }, { sym: 'globe', vp: 1, from: 'lamp', gives: 'flask' });
  add(2, 'green', '조제실', { C: 2, S: 1 }, { sym: 'sundial', vp: 1, from: 'bottle' });
  add(2, 'yellow', '포럼', { $: 3 }, { choice: ['G', 'P'] });
  add(2, 'yellow', '대상 숙소', { G: 1, P: 1 }, { choice: ['W', 'C', 'S'] });
  add(2, 'yellow', '세관', { $: 4 }, { trade: ['G', 'P'] });
  add(2, 'yellow', '양조장', {}, { coins: 6, from: 'jar' });
  add(2, 'red', '마필 사육장', { C: 1, W: 1 }, { shields: 1, from: 'horse', gives: 'helm' });
  add(2, 'red', '병영', { $: 3 }, { shields: 1, from: 'sword', gives: 'flag' });
  add(2, 'red', '궁술 연습장', { S: 1, W: 1, P: 1 }, { shields: 2, from: 'tower', gives: 'bow' });
  add(2, 'red', '열병장', { C: 2, G: 1 }, { shields: 2 });
  add(2, 'red', '성벽', { S: 2 }, { shields: 2, from: 'fort', gives: 'wall' });

  // ---- 3시대 (20장, 이 중 17장 + 길드 3장을 쓴다) ----
  add(3, 'yellow', '상공회의소', { P: 2 }, { vp: 3, per: { colors: ['grey'], coins: 3 } });
  add(3, 'yellow', '항구', { W: 1, G: 1, P: 1 }, { vp: 3, per: { colors: ['brown'], coins: 2 } });
  add(3, 'yellow', '병기고', { S: 2, G: 1 }, { vp: 3, per: { colors: ['red'], coins: 1 } });
  add(3, 'yellow', '등대 신호소', { C: 2, G: 1 }, { vp: 3, per: { colors: ['yellow'], coins: 1 } });
  add(3, 'yellow', '경기장', { C: 1, S: 1, W: 1 }, { vp: 3, per: { wonders: true, coins: 2 } });
  add(3, 'blue', '판테온', { C: 1, W: 1, G: 2 }, { vp: 6, from: 'sun' });
  add(3, 'blue', '정원', { C: 2, W: 2 }, { vp: 6, from: 'column' });
  add(3, 'blue', '시청', { S: 3, W: 2 }, { vp: 7 });
  add(3, 'blue', '궁전', { C: 1, S: 1, W: 1, G: 2 }, { vp: 7 });
  add(3, 'blue', '원로원', { C: 2, S: 2, P: 1 }, { vp: 5, from: 'podium' });
  add(3, 'blue', '오벨리스크', { S: 2, G: 1 }, { vp: 5, from: 'arch' });
  add(3, 'green', '학술원', { S: 1, G: 2 }, { sym: 'sundial', vp: 3 });
  add(3, 'green', '서재', { W: 1, G: 1, P: 1 }, { sym: 'astro', vp: 3 });
  add(3, 'green', '천문대', { S: 1, P: 2 }, { sym: 'globe', vp: 2, from: 'flask' });
  add(3, 'green', '대학', { C: 1, G: 1, P: 1 }, { sym: 'mortar', vp: 2, from: 'scroll' });
  add(3, 'red', '요새', { S: 2, C: 1, P: 1 }, { shields: 2, from: 'wall' });
  add(3, 'red', '무기고', { C: 3, W: 2 }, { shields: 3 });
  add(3, 'red', '공성 공방', { W: 3, G: 1 }, { shields: 3, from: 'bow' });
  add(3, 'red', '서커스', { C: 2, S: 2 }, { shields: 2, from: 'flag' });
  add(3, 'red', '근위대', { S: 2, P: 1, G: 1 }, { shields: 3, from: 'helm' });

  // ---- 길드 7장 (그중 3장이 3시대 덱에 섞인다) ----
  const guild = (name, cost, g, desc) => add(3, 'purple', name, cost, { guild: g, desc });
  guild('상인 길드', { W: 1, C: 1, G: 1, P: 1 }, { colors: ['yellow'], coins: true, vp: true }, '지을 때: 두 도시 중 상업(노랑) 카드가 더 많은 쪽의 장수만큼 동전. 게임 끝: 그 장수만큼 승점.');
  guild('선주 길드', { C: 1, S: 1, G: 1, P: 1 }, { colors: ['brown', 'grey'], coins: true, vp: true }, '지을 때: 두 도시 중 원자재+제품 카드가 더 많은 쪽의 장수만큼 동전. 게임 끝: 그 장수만큼 승점.');
  guild('건축가 길드', { S: 2, C: 1, W: 1, G: 1 }, { wonders: true, vp: 2 }, '게임 끝: 불가사의를 더 많이 지은 쪽의 불가사의 1개당 승점 2.');
  guild('행정관 길드', { W: 2, C: 1, P: 1 }, { colors: ['blue'], coins: true, vp: true }, '지을 때: 두 도시 중 시민(파랑) 카드가 더 많은 쪽의 장수만큼 동전. 게임 끝: 그 장수만큼 승점.');
  guild('과학자 길드', { C: 2, W: 2 }, { colors: ['green'], coins: true, vp: true }, '지을 때: 두 도시 중 과학(초록) 카드가 더 많은 쪽의 장수만큼 동전. 게임 끝: 그 장수만큼 승점.');
  guild('대금업자 길드', { S: 2, W: 2 }, { moneylend: true }, '게임 끝: 두 도시 중 동전이 더 많은 쪽의 동전 3개당 승점 1.');
  guild('전술가 길드', { S: 2, C: 1, P: 1 }, { colors: ['red'], coins: true, vp: true }, '지을 때: 두 도시 중 군사(빨강) 카드가 더 많은 쪽의 장수만큼 동전. 게임 끝: 그 장수만큼 승점.');

  const W = [
    { id: 0, name: '피라미드', cost: { S: 3, P: 1 }, vp: 9, desc: '승점 9.' },
    { id: 1, name: '대도서관', cost: { W: 3, G: 1, P: 1 }, vp: 4, library: true, desc: '승점 4. 사용하지 않은 진보 토큰 3개 중 1개를 가져옵니다.' },
    { id: 2, name: '공중정원', cost: { W: 2, G: 1, P: 1 }, vp: 3, coins: 6, again: true, desc: '승점 3, 동전 +6, 한 번 더 합니다.' },
    { id: 3, name: '키르쿠스 막시무스', cost: { S: 2, G: 1, W: 1 }, vp: 3, shields: 1, destroy: 'grey', desc: '승점 3, 방패 1, 상대의 제품(회색) 카드 1장을 파괴합니다.' },
    { id: 4, name: '콜로서스', cost: { C: 3, G: 1 }, vp: 3, shields: 2, desc: '승점 3, 방패 2.' },
    { id: 5, name: '파로스 등대', cost: { P: 2, S: 1, W: 1 }, vp: 4, choice: ['W', 'C', 'S'], desc: '승점 4, 목재·점토·석재 중 하나를 매번 골라 생산합니다.' },
    { id: 6, name: '피레우스 항구', cost: { W: 2, C: 1, S: 1 }, vp: 2, choice: ['G', 'P'], again: true, desc: '승점 2, 유리·파피루스 중 하나를 매번 골라 생산, 한 번 더 합니다.' },
    { id: 7, name: '아피아 가도', cost: { P: 1, S: 2, C: 2 }, vp: 3, coins: 3, oppLoses: 3, again: true, desc: '승점 3, 동전 +3, 상대는 동전 -3, 한 번 더 합니다.' },
    { id: 8, name: '마우솔레움', cost: { G: 2, C: 2, P: 1 }, vp: 2, revive: true, desc: '승점 2, 버려진 카드 1장을 골라 무료로 지읍니다.' },
    { id: 9, name: '아르테미스 신전', cost: { G: 1, P: 1, W: 1, S: 1 }, vp: 0, coins: 12, again: true, desc: '동전 +12, 한 번 더 합니다.' },
    { id: 10, name: '제우스 상', cost: { P: 1, C: 1, W: 1, S: 1 }, vp: 3, shields: 1, destroy: 'brown', desc: '승점 3, 방패 1, 상대의 원자재(갈색) 카드 1장을 파괴합니다.' },
    { id: 11, name: '스핑크스', cost: { G: 2, S: 1, C: 1 }, vp: 6, again: true, desc: '승점 6, 한 번 더 합니다.' },
  ];

  const TOKENS = {
    agriculture: { name: '농업', icon: '🌾', desc: '동전 +6, 게임 끝에 승점 4.' },
    architecture: { name: '건축', icon: '🏗️', desc: '불가사의를 지을 때 필요한 자원 2개가 줄어듭니다.' },
    economy: { name: '경제', icon: '💱', desc: '상대가 자원을 사느라 은행에 내는 동전을 내가 받습니다.' },
    law: { name: '법률', icon: '⚖️', desc: '과학 기호 1개로 칩니다. (서로 다른 기호 6종이면 즉시 승리)' },
    masonry: { name: '석공술', icon: '🧱', desc: '시민(파랑) 카드를 지을 때 필요한 자원 2개가 줄어듭니다.' },
    mathematics: { name: '수학', icon: '📐', desc: '게임 끝에 내가 가진 진보 토큰 1개당 승점 3 (이 토큰 포함).' },
    philosophy: { name: '철학', icon: '🦉', desc: '게임 끝에 승점 7.' },
    strategy: { name: '전략', icon: '🎯', desc: '앞으로 짓는 군사(빨강) 카드의 방패가 1개씩 늘어납니다.' },
    theology: { name: '신학', icon: '🙏', desc: '내가 짓는 모든 불가사의는 한 번 더 하기 효과가 붙습니다.' },
    urbanism: { name: '도시계획', icon: '🏙️', desc: '동전 +6, 앞으로 연계(무료)로 지을 때마다 동전 +4.' },
  };

  const byId = (list) => Object.fromEntries(list.map((c) => [c.id, c]));

  const resText = (cost) => [...['W', 'C', 'S', 'G', 'P'].filter((k) => cost[k]).map((k) => `${RES[k]}${cost[k] > 1 ? cost[k] : ''}`), ...(cost.$ ? [`🪙${cost.$}`] : [])].join(' ') || '무료';

  const cardDesc = (c) => {
    const bits = [];
    if (c.res) bits.push(`생산 ${resText(c.res)}`);
    if (c.choice) bits.push(`매번 하나 골라 생산: ${c.choice.map((k) => RES[k]).join(' / ')}`);
    if (c.trade) bits.push(`${c.trade.map((k) => RES[k]).join('')} 구입가 항상 🪙1`);
    if (c.shields) bits.push(`방패 ${c.shields}`);
    if (c.sym) bits.push(`과학 ${SYMS[c.sym].icon} ${SYMS[c.sym].name}`);
    if (c.coins) bits.push(`지을 때 🪙+${c.coins}`);
    if (c.per) {
      const what = c.per.wonders ? '내 불가사의' : c.per.colors.map((k) => COLORS[k].name).join('+') + ' 카드';
      bits.push(`지을 때 ${what} 1개당 🪙+${c.per.coins}`);
    }
    if (c.desc) bits.push(c.desc);
    if (c.vp && !c.guild) bits.push(`승점 ${c.vp}`);
    return bits.join(' · ');
  };

  return {
    RES, RES_NAME, COLORS, SYMS, CHAINS, TOKENS,
    CARDS: C, CARD: byId(C), WONDERS: W, WONDER: byId(W),
    resText, cardDesc,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DUEL_DATA;

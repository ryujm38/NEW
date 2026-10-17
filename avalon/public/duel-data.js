'use strict';
// 세븐 원더스 듀얼 카드(73장)·불가사의(12)·진보 토큰(10) 정보. 서버(require)와 화면(<script>)이 같은 파일을 쓴다.
// 비용·효과·연계 관계는 보드게임아레나(BGA)용 구현(koenheltzel/bga-sevenwondersduel)의 데이터와 대조해서 옮겼고,
// 다른 팬 구현(1amthis/seven-wonders-duel-3d)과도 비교했다. 한국어 이름은 직접 옮긴 것이라 정식 번역판과 다를 수 있다.
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
    square: { icon: '📐', name: '삼각자' },
    quill: { icon: '✒️', name: '문자' },
    mortar: { icon: '⚗️', name: '약학' },
    astrolabe: { icon: '🔭', name: '아스트롤라베' },
    sundial: { icon: '🧭', name: '해시계' },
    law: { icon: '⚖️', name: '법률' },
  };
  // 연계 기호(주는 카드의 key → 아이콘)
  const CHAINS = {
    stable: '🐴', garrison: '🗡️', palisade: '🗼', archery_range: '🎯', parade_ground: '⛑️',
    scriptorium: '📖', pharmacist: '🧪', school: '🎼', laboratory: '🪔',
    theater: '🎭', statue: '🏛️', altar: '🌙', temple: '☀️', baths: '💧', rostrum: '🏤',
    tavern: '🏺', brewery: '🛢️',
  };

  const C = [];
  let seq = 0;
  const add = (age, color, name, cost, extra) => { C.push({ id: seq++, age, color, name, cost, ...extra }); };

  // 카드 73장 (1시대 23 · 2시대 23 · 3시대 20 · 길드 7). 비용·효과·연계는 보드게임아레나 구현과 대조해 만든 것이다.
  add(1, 'brown', '벌목장', {}, { key: 'lumber_yard', res: { W: 1 } });
  add(1, 'brown', '석재 채굴장', { $: 1 }, { key: 'stone_pit', res: { S: 1 } });
  add(1, 'brown', '점토 웅덩이', {}, { key: 'clay_pool', res: { C: 1 } });
  add(1, 'brown', '벌목 캠프', { $: 1 }, { key: 'logging_camp', res: { W: 1 } });
  add(1, 'brown', '채석장', {}, { key: 'quarry', res: { S: 1 } });
  add(1, 'brown', '점토 구덩이', { $: 1 }, { key: 'clay_pit', res: { C: 1 } });
  add(1, 'grey', '유리 공방', { $: 1 }, { key: 'glassworks', res: { G: 1 } });
  add(1, 'grey', '제지소', { $: 1 }, { key: 'press', res: { P: 1 } });
  add(1, 'red', '마구간', { W: 1 }, { key: 'stable', shields: 1 });
  add(1, 'red', '수비대', { C: 1 }, { key: 'garrison', shields: 1 });
  add(1, 'red', '목책', { $: 2 }, { key: 'palisade', shields: 1 });
  add(1, 'red', '망루', {}, { key: 'guard_tower', shields: 1 });
  add(1, 'green', '필사실', { $: 2 }, { key: 'scriptorium', sym: 'quill' });
  add(1, 'green', '공방', { P: 1 }, { key: 'workshop', vp: 1, sym: 'square' });
  add(1, 'green', '약제사', { $: 2 }, { key: 'pharmacist', sym: 'mortar' });
  add(1, 'green', '약국', { G: 1 }, { key: 'apothecary', vp: 1, sym: 'wheel' });
  add(1, 'yellow', '선술집', {}, { key: 'tavern', coins: 4 });
  add(1, 'yellow', '석재 비축소', { $: 3 }, { key: 'stone_reserve', trade: ['S'] });
  add(1, 'yellow', '점토 비축소', { $: 3 }, { key: 'clay_reserve', trade: ['C'] });
  add(1, 'yellow', '목재 비축소', { $: 3 }, { key: 'wood_reserve', trade: ['W'] });
  add(1, 'blue', '극장', {}, { key: 'theater', vp: 3 });
  add(1, 'blue', '제단', {}, { key: 'altar', vp: 3 });
  add(1, 'blue', '목욕탕', { S: 1 }, { key: 'baths', vp: 3 });
  add(2, 'brown', '제재소', { $: 2 }, { key: 'sawmill', res: { W: 2 } });
  add(2, 'brown', '채석 작업장', { $: 2 }, { key: 'shelf_quarry', res: { S: 2 } });
  add(2, 'brown', '벽돌 공장', { $: 2 }, { key: 'brickyard', res: { C: 2 } });
  add(2, 'grey', '유리 부는 공방', {}, { key: 'glass_blower', res: { G: 1 } });
  add(2, 'grey', '건조실', {}, { key: 'drying_room', res: { P: 1 } });
  add(2, 'red', '마필 사육장', { W: 1, C: 1 }, { key: 'horse_breeders', shields: 1, from: 'stable' });
  add(2, 'red', '병영', { $: 3 }, { key: 'barracks', shields: 1, from: 'garrison' });
  add(2, 'red', '성벽', { S: 2 }, { key: 'walls', shields: 2 });
  add(2, 'red', '궁술 연습장', { W: 1, S: 1, P: 1 }, { key: 'archery_range', shields: 2 });
  add(2, 'red', '열병장', { C: 2, G: 1 }, { key: 'parade_ground', shields: 2 });
  add(2, 'green', '학교', { W: 1, P: 2 }, { key: 'school', vp: 1, sym: 'wheel' });
  add(2, 'green', '연구소', { W: 1, G: 2 }, { key: 'laboratory', vp: 1, sym: 'square' });
  add(2, 'green', '조제실', { C: 2, S: 1 }, { key: 'dispensary', vp: 2, sym: 'mortar', from: 'pharmacist' });
  add(2, 'green', '도서관', { W: 1, S: 1, G: 1 }, { key: 'library', vp: 2, sym: 'quill', from: 'scriptorium' });
  add(2, 'yellow', '양조장', {}, { key: 'brewery', coins: 6 });
  add(2, 'yellow', '포럼', { C: 1, $: 3 }, { key: 'forum', choice: ['G', 'P'] });
  add(2, 'yellow', '대상 숙소', { G: 1, P: 1, $: 2 }, { key: 'caravansery', choice: ['W', 'C', 'S'] });
  add(2, 'yellow', '세관', { $: 4 }, { key: 'customs_house', trade: ['P', 'G'] });
  add(2, 'blue', '신전', { W: 1, P: 1 }, { key: 'temple', vp: 4, from: 'altar' });
  add(2, 'blue', '조각상', { C: 2 }, { key: 'statue', vp: 4, from: 'theater' });
  add(2, 'blue', '법원', { W: 2, G: 1 }, { key: 'courthouse', vp: 5 });
  add(2, 'blue', '수도교', { S: 3 }, { key: 'aqueduct', vp: 5, from: 'baths' });
  add(2, 'blue', '연단', { W: 1, S: 1 }, { key: 'rostrum', vp: 4 });
  add(3, 'red', '서커스', { C: 2, S: 2 }, { key: 'circus', shields: 2, from: 'parade_ground' });
  add(3, 'red', '무기고', { W: 2, C: 3 }, { key: 'arsenal', shields: 3 });
  add(3, 'red', '공성 공방', { W: 3, G: 1 }, { key: 'siege_workshop', shields: 2, from: 'archery_range' });
  add(3, 'red', '요새', { C: 1, S: 2, P: 1 }, { key: 'fortifications', shields: 2, from: 'palisade' });
  add(3, 'red', '프레토리움', { $: 8 }, { key: 'pretorium', shields: 3 });
  add(3, 'green', '학술원', { W: 1, S: 1, G: 2 }, { key: 'academy', vp: 3, sym: 'sundial' });
  add(3, 'green', '대학', { C: 1, G: 1, P: 1 }, { key: 'university', vp: 2, sym: 'astrolabe', from: 'school' });
  add(3, 'green', '서재', { W: 2, G: 1, P: 1 }, { key: 'study', vp: 3, sym: 'sundial' });
  add(3, 'green', '천문대', { S: 1, P: 2 }, { key: 'observatory', vp: 2, sym: 'astrolabe', from: 'laboratory' });
  add(3, 'yellow', '경기장', { W: 1, C: 1, S: 1 }, { key: 'arena', vp: 3, per: { wonders: true, coins: 2 }, from: 'brewery' });
  add(3, 'yellow', '상공회의소', { P: 2 }, { key: 'chamber_of_commerce', vp: 3, per: { colors: ['grey'], coins: 3 } });
  add(3, 'yellow', '항구', { W: 1, G: 1, P: 1 }, { key: 'port', vp: 3, per: { colors: ['brown'], coins: 2 } });
  add(3, 'yellow', '등대 신호소', { C: 2, G: 1 }, { key: 'lighthouse', vp: 3, per: { colors: ['yellow'], coins: 1 }, from: 'tavern' });
  add(3, 'yellow', '병기고', { S: 2, G: 1 }, { key: 'armory', vp: 3, per: { colors: ['red'], coins: 1 } });
  add(3, 'blue', '궁전', { W: 1, C: 1, S: 1, G: 2 }, { key: 'palace', vp: 7 });
  add(3, 'blue', '정원', { W: 2, C: 2 }, { key: 'gardens', vp: 6, from: 'statue' });
  add(3, 'blue', '판테온', { W: 1, C: 1, P: 2 }, { key: 'pantheon', vp: 6, from: 'temple' });
  add(3, 'blue', '시청', { W: 2, S: 3 }, { key: 'town_hall', vp: 7 });
  add(3, 'blue', '원로원', { C: 2, S: 1, P: 1 }, { key: 'senate', vp: 5, from: 'rostrum' });
  add(3, 'blue', '오벨리스크', { S: 2, G: 1 }, { key: 'obelisk', vp: 5 });
  add(3, 'purple', '상인 길드', { W: 1, C: 1, G: 1, P: 1 }, { key: 'merchants_guild', guild: { colors: ['yellow'], coins: true, vp: true } });
  add(3, 'purple', '선주 길드', { C: 1, S: 1, G: 1, P: 1 }, { key: 'shipowners_guild', guild: { colors: ['brown', 'grey'], coins: true, vp: true } });
  add(3, 'purple', '건축가 길드', { W: 1, C: 1, S: 2, G: 1 }, { key: 'builders_guild', guild: { wonders: true, vp: 2 } });
  add(3, 'purple', '행정관 길드', { W: 2, C: 1, P: 1 }, { key: 'magistrates_guild', guild: { colors: ['blue'], coins: true, vp: true } });
  add(3, 'purple', '과학자 길드', { W: 2, C: 2 }, { key: 'scientists_guild', guild: { colors: ['green'], coins: true, vp: true } });
  add(3, 'purple', '대금업자 길드', { W: 2, S: 2 }, { key: 'moneylenders_guild', guild: { moneylend: true } });
  add(3, 'purple', '전술가 길드', { C: 1, S: 2, P: 1 }, { key: 'tacticians_guild', guild: { colors: ['red'], coins: true, vp: true } });

  // 연계(무료 건설): from 카드를 가진 사람은 이 카드를 무료로 짓는다. 연계 기호를 주는 카드는 gives = 자기 key.
  const keys = new Set(C.filter((c) => c.from).map((c) => c.from));
  C.forEach((c) => { if (keys.has(c.key)) c.gives = c.key; });

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
    { id: 10, name: '제우스 상', cost: { P: 2, C: 1, W: 1, S: 1 }, vp: 3, shields: 1, destroy: 'brown', desc: '승점 3, 방패 1, 상대의 원자재(갈색) 카드 1장을 파괴합니다.' },
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
    if (c.guild) {
      const g = c.guild;
      if (g.moneylend) bits.push('게임 끝: 두 도시 중 동전이 더 많은 쪽의 동전 3개당 승점 1');
      else if (g.wonders) bits.push('게임 끝: 불가사의를 더 많이 지은 쪽의 불가사의 1개당 승점 2');
      else {
        const what = g.colors.map((k) => COLORS[k].name).join('+');
        bits.push(`지을 때: 두 도시 중 ${what} 카드가 더 많은 쪽의 장수만큼 🪙 / 게임 끝: 그 장수만큼 승점`);
      }
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

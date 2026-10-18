'use strict';
const test = require('node:test');
const assert = require('node:assert');
const duel = require('../duel');
const DATA = require('../public/duel-data.js');

const { CARDS, CARD, WONDERS, TOKENS } = DATA;
const byName = (name) => CARDS.find((c) => c.name === name).id;

function lobby() {
  const room = duel.createRoom('ABCD');
  const a = duel.addPlayer(room, '가').player;
  const b = duel.addPlayer(room, '나').player;
  return { room, a, b };
}

// 불가사의 고르기를 첫 번째 것으로 자동 진행해 1시대 시작 상태를 만든다.
function ready() {
  const { room, a } = lobby();
  assert.deepStrictEqual(duel.start(room, a.id), {});
  while (room.phase === 'draft') {
    const picker = room.players.find((p) => p.id === duel.viewFor(room, room.hostId).draft.pickerId);
    assert.deepStrictEqual(duel.draftWonder(room, picker.id, room.draft.pool[0]), {});
  }
  assert.strictEqual(room.phase, 'play');
  return { room, p0: room.players[0], p1: room.players[1] };
}

const setSlot = (room, i, name) => { room.slots[i].card = byName(name); };
const cardOf = (p, name) => p.cards.includes(byName(name));
const give = (p, ...names) => names.forEach((n) => p.cards.push(byName(n)));

test('카드·불가사의·진보 토큰 구성이 맞다', () => {
  assert.strictEqual(CARDS.length, 73);
  assert.strictEqual(CARDS.filter((c) => c.age === 1).length, 23);
  assert.strictEqual(CARDS.filter((c) => c.age === 2).length, 23);
  assert.strictEqual(CARDS.filter((c) => c.age === 3 && c.color !== 'purple').length, 20);
  assert.strictEqual(CARDS.filter((c) => c.color === 'purple').length, 7);
  assert.strictEqual(new Set(CARDS.map((c) => c.id)).size, 73);
  assert.strictEqual(new Set(CARDS.map((c) => c.name)).size, 73);
  assert.strictEqual(WONDERS.length, 12);
  assert.strictEqual(Object.keys(TOKENS).length, 10);
  // 과학 기호는 6종이 카드 2장씩
  const sym = {};
  CARDS.filter((c) => c.sym).forEach((c) => { sym[c.sym] = (sym[c.sym] || 0) + 1; });
  assert.deepStrictEqual(Object.values(sym).sort(), [2, 2, 2, 2, 2, 2]);
  // 연계는 더 이른 시대 카드가 준다
  CARDS.filter((c) => c.from).forEach((c) => {
    const giver = CARDS.find((g) => g.gives === c.from);
    assert.ok(giver && giver.age < c.age, `${c.name} 연계`);
  });
  // 연계 기호는 한 장만 준다
  const gives = CARDS.filter((c) => c.gives).map((c) => c.gives);
  assert.strictEqual(new Set(gives).size, gives.length);
});

test('원작 대조 데이터: 연계 17쌍, 색·시대별 장수, 길드·불가사의 비용', () => {
  const pairs = CARDS.filter((c) => c.from).map((c) => `${CARDS.find((g) => g.key === c.from).name}→${c.name}`).sort();
  assert.deepStrictEqual(pairs, [
    '극장→조각상', '마구간→마필 사육장', '목욕탕→수도교', '목책→요새', '수비대→병영', '약제사→조제실', '필사실→도서관', '제단→신전',
    '조각상→정원', '신전→판테온', '연단→원로원', '학교→대학', '연구소→천문대', '궁술 연습장→공성 공방', '열병장→서커스',
    '선술집→등대 신호소', '양조장→경기장',
  ].sort());
  const tally = {};
  CARDS.forEach((c) => { const k = `${c.age}${c.color}`; tally[k] = (tally[k] || 0) + 1; });
  assert.deepStrictEqual(tally, {
    '1brown': 6, '1grey': 2, '1red': 4, '1green': 4, '1yellow': 4, '1blue': 3,
    '2brown': 3, '2grey': 2, '2red': 5, '2green': 4, '2yellow': 4, '2blue': 5,
    '3blue': 6, '3red': 5, '3green': 4, '3yellow': 5, '3purple': 7,
  });
  const cost = (name) => JSON.stringify(Object.entries(CARD[byName(name)].cost).sort());
  assert.strictEqual(cost('건축가 길드'), JSON.stringify(Object.entries({ S: 2, C: 1, W: 1, G: 1 }).sort()));
  assert.strictEqual(cost('전술가 길드'), JSON.stringify(Object.entries({ S: 2, C: 1, P: 1 }).sort()));
  assert.strictEqual(cost('프레토리움'), JSON.stringify([['$', 8]]));
  assert.strictEqual(CARD[byName('프레토리움')].shields, 3);
  assert.deepStrictEqual(WONDERS.find((w) => w.name === '제우스 상').cost, { P: 2, C: 1, W: 1, S: 1 });
  // 3시대 노랑 카드는 승점 3 + 장수당 동전, 시민 카드 승점
  assert.deepStrictEqual(CARDS.filter((c) => c.age === 3 && c.color === 'blue').map((c) => c.vp).sort(), [5, 5, 6, 6, 7, 7]);
  assert.ok(CARDS.filter((c) => c.age === 3 && c.color === 'yellow').every((c) => c.vp === 3 && c.per));
});

test('판 배치: 시대마다 20칸, 처음 집을 수 있는 카드 수, 덱 구성', () => {
  [1, 2, 3].forEach((age) => {
    const s = duel.layout(age);
    assert.strictEqual(s.length, 20);
    const free = s.filter((x) => x.coveredBy.length === 0).length;
    assert.strictEqual(free, age === 1 ? 6 : 2);
    // 처음 집을 수 있는 줄은 앞면
    assert.ok(s.filter((x) => x.coveredBy.length === 0).every((x) => x.up));
    // 가린 카드는 항상 존재하는 칸
    assert.ok(s.every((x) => x.coveredBy.every((j) => j >= 0 && j < 20)));
    const deck = duel.dealAge(age);
    assert.strictEqual(deck.length, 20);
    assert.strictEqual(new Set(deck).size, 20);
    assert.ok(deck.every((id) => CARD[id].age === age));
  });
  const d3 = duel.dealAge(3);
  assert.strictEqual(d3.filter((id) => CARD[id].color === 'purple').length, 3);
  // 3시대 가운데 2장 줄은 위 줄 4장과 어긋나게 걸친다 (각각 2장이 덮는다)
  const s3 = duel.layout(3);
  assert.deepStrictEqual(s3.filter((x) => x.row === 2).map((x) => x.coveredBy.length), [1, 1, 1, 1]);
  assert.deepStrictEqual(s3.filter((x) => x.row === 3).map((x) => x.coveredBy.length), [2, 2]);
});

test('시작 조건: 방장만, 정확히 2명, 접속 중이어야 한다', () => {
  const { room, a, b } = lobby();
  const solo = duel.createRoom('ZZZZ');
  duel.addPlayer(solo, '혼자');
  assert.ok(duel.start(solo, solo.hostId).error);
  assert.ok(duel.start(room, b.id).error);
  b.connected = false;
  assert.ok(duel.start(room, a.id).error);
  b.connected = true;
  assert.ok(duel.addPlayer(room, '셋째').error); // 2명 정원
  assert.deepStrictEqual(duel.start(room, a.id), {});
  assert.ok(duel.start(room, a.id).error);
  assert.strictEqual(room.players[0].coins, 7);
  assert.strictEqual(room.boardTokens.length, 5);
  assert.strictEqual(room.boxTokens.length, 5);
});

test('불가사의 고르기: 1·2·2·1 순서, 마지막 한 장은 자동, 4개씩', () => {
  const { room, a } = lobby();
  duel.start(room, a.id);
  const [x, y] = room.players;
  const order = [];
  const all = new Set([...room.draft.sets[0], ...room.draft.sets[1]]);
  assert.strictEqual(all.size, 8);
  // 차례가 아닌 사람 / 없는 불가사의
  assert.ok(duel.draftWonder(room, y.id, room.draft.pool[0]).error);
  assert.ok(duel.draftWonder(room, x.id, 999).error);
  while (room.phase === 'draft') {
    const v = duel.viewFor(room, x.id);
    order.push(v.draft.pickerId === x.id ? 0 : 1);
    assert.deepStrictEqual(duel.draftWonder(room, v.draft.pickerId, room.draft.pool[0]), {});
  }
  assert.deepStrictEqual(order, [0, 1, 1, 1, 0, 0]); // 세트마다 마지막(4번째)은 자동 배정이라 선택은 3번씩
  assert.strictEqual(x.wonders.length, 4);
  assert.strictEqual(y.wonders.length, 4);
  assert.strictEqual(new Set([...x.wonders, ...y.wonders].map((w) => w.id)).size, 8);
  assert.ok([...x.wonders, ...y.wonders].every((w) => all.has(w.id)));
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(room.age, 1);
  assert.strictEqual(room.turn, 0);
});

test('비용 계산: 구입가, 상대 생산, 비축소, 고르는 생산, 토큰 할인', () => {
  const { room, p0, p1 } = ready();
  p0.cards = [];
  p1.cards = [];
  p0.tokens = [];
  p1.tokens = [];
  assert.strictEqual(duel.payment(room, p0, { S: 2 }).coins, 4); // 한 개당 2
  assert.strictEqual(duel.payment(room, p0, { S: 2, $: 1 }).coins, 5);
  give(p1, '채석장'); // 상대가 석재를 1개 생산하면 내 구입가는 3
  assert.strictEqual(duel.payment(room, p0, { S: 2 }).coins, 6);
  give(p0, '채석장'); // 내가 1개 만들면 1개만 산다
  assert.strictEqual(duel.payment(room, p0, { S: 2 }).coins, 3);
  give(p0, '석재 비축소'); // 구입가 1
  assert.strictEqual(duel.payment(room, p0, { S: 2 }).coins, 1);
  p0.cards = [];
  p1.cards = [];
  give(p0, '대상 숙소'); // 목재/점토/석재 중 하나를 매번 고름
  assert.strictEqual(duel.payment(room, p0, { S: 1 }).coins, 0);
  assert.strictEqual(duel.payment(room, p0, { S: 1, W: 1 }).coins, 2);
  give(p0, '벌목장');
  assert.strictEqual(duel.payment(room, p0, { S: 1, W: 1 }).coins, 0);
  assert.strictEqual(duel.payment(room, p0, { S: 2, W: 1 }).coins, 2);
  // 상대의 상업(노랑) 카드 생산은 구입가를 올리지 않고, 원자재·제품 카드는 올린다
  p0.cards = [];
  p1.cards = [];
  give(p1, '대상 숙소', '벌목 캠프');
  assert.strictEqual(duel.payment(room, p0, { C: 1 }).coins, 2);
  assert.strictEqual(duel.payment(room, p0, { W: 1 }).coins, 3);
  assert.strictEqual(duel.payment(room, p0, { G: 1, P: 1 }).coins, 4);
  // 토큰: 석공술은 시민(파랑) 카드, 건축은 불가사의의 자원 2개를 줄인다
  p0.cards = [];
  p1.cards = [];
  const bath = CARD[byName('수도교')];
  p0.tokens = ['masonry'];
  assert.strictEqual(duel.costOfCard(room, p0, bath).coins, 2); // 석재 3 → 1개만 구입
  p0.tokens = [];
  assert.strictEqual(duel.costOfCard(room, p0, bath).coins, 6);
  p0.tokens = ['masonry'];
  assert.strictEqual(duel.costOfCard(room, p0, CARD[byName('성벽')]).coins, 4); // 파랑이 아니면 할인 없음
  p0.tokens = ['architecture'];
  const pyramid = WONDERS.find((w) => w.name === '피라미드').id; // 석재3 + 파피루스1
  assert.strictEqual(duel.costOfWonder(room, p0, pyramid).coins, 4); // 4개 중 2개 감소 → 2개 구입
});

test('연계(무료 건설): 기호가 있으면 무료, 도시계획은 +4 동전', () => {
  const { room, p0 } = ready();
  const slot = duel.openSlots(room)[0];
  setSlot(room, slot, '수도교');
  p0.coins = 0;
  assert.ok(duel.build(room, p0.id, slot).error); // 비용 석재 3, 동전 0
  give(p0, '목욕탕');
  assert.strictEqual(duel.costOfCard(room, p0, CARD[byName('수도교')]).chain, true);
  p0.tokens = ['urbanism'];
  assert.deepStrictEqual(duel.build(room, p0.id, slot), {});
  assert.ok(cardOf(p0, '수도교'));
  assert.strictEqual(p0.coins, 4);
});

test('버리기: 동전 2 + 내 상업 카드 수, 카드는 버린 더미로, 차례가 넘어간다', () => {
  const { room, p0, p1 } = ready();
  give(p0, '선술집', '목재 비축소');
  const [s1, s2] = duel.openSlots(room);
  const before = p0.coins;
  const id = room.slots[s1].card;
  assert.deepStrictEqual(duel.discardCard(room, p0.id, s1), {});
  assert.strictEqual(p0.coins, before + 4);
  assert.deepStrictEqual(room.discard, [id]);
  assert.strictEqual(room.slots[s1].taken, true);
  assert.strictEqual(duel.viewFor(room, p0.id).turnId, p1.id);
  assert.ok(duel.discardCard(room, p0.id, s2).error); // 내 차례가 아님
  assert.ok(duel.discardCard(room, p1.id, s1).error); // 이미 가져간 카드
});

test('집을 수 없는 카드(가려진 카드)는 가져올 수 없고, 가렸던 카드가 뒤집힌다', () => {
  const { room, p0, p1 } = ready();
  const open = duel.openSlots(room);
  const covered = room.slots.findIndex((s, i) => !open.includes(i));
  assert.ok(duel.discardCard(room, p0.id, covered).error);
  assert.ok(duel.build(room, p0.id, -1).error);
  assert.ok(duel.build(room, p0.id, 'x').error);
  // 가린 카드는 뒷면일 수 있고, 그 카드의 정체는 상태에 담기지 않는다
  const v = duel.viewFor(room, p1.id);
  v.slots.forEach((s) => { if (!s.up) assert.strictEqual(s.card, null); });
  assert.ok(v.slots.some((s) => !s.up));
  // 아래 줄 카드를 모두 가져가면 위 줄 카드가 풀린다
  let guard = 0;
  while (room.slots.some((s) => !s.taken && !s.up) && guard++ < 40) {
    const cur = room.players[room.turn];
    duel.discardCard(room, cur.id, duel.openSlots(room)[0]);
  }
  assert.ok(room.slots.every((s) => s.taken || s.up));
});

test('건설: 동전 차감, 상대의 경제 토큰, 모자라면 거부', () => {
  const { room, p0, p1 } = ready();
  const slot = duel.openSlots(room)[0];
  setSlot(room, slot, '유리 공방');
  p0.coins = 0;
  assert.ok(duel.build(room, p0.id, slot).error);
  assert.strictEqual(room.slots[slot].taken, false); // 실패하면 아무 일도 없다
  p0.coins = 5;
  assert.deepStrictEqual(duel.build(room, p0.id, slot), {});
  assert.strictEqual(p0.coins, 4);
  assert.ok(cardOf(p0, '유리 공방'));
  assert.strictEqual(room.players[room.turn], p1);
  // 경제: 자원을 은행에서 사면 상대가 그 동전을 받는다
  p0.tokens = ['economy'];
  p1.coins = 10;
  const s2 = duel.openSlots(room)[0];
  setSlot(room, s2, '목욕탕'); // 석재 1 → 구입가 2
  assert.deepStrictEqual(duel.build(room, p1.id, s2), {});
  assert.strictEqual(p1.coins, 8);
  assert.strictEqual(p0.coins, 4 + 2);
});

test('군사: 방패만큼 말이 밀리고, 토큰은 한 번만 동전을 빼앗고, 9칸이면 즉시 승리', () => {
  const { room, p0, p1 } = ready();
  const turnOf = (p) => { while (room.players[room.turn] !== p) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]); };
  const buildRed = (p, name) => {
    turnOf(p);
    const s = duel.openSlots(room)[0];
    setSlot(room, s, name);
    p.coins = 20;
    assert.deepStrictEqual(duel.build(room, p.id, s), {});
  };
  buildRed(p0, '목책'); // 방패 1 → +1
  assert.strictEqual(room.military, 1);
  buildRed(p0, '열병장'); // 방패 2 → +3, 첫 토큰(상대 동전 2)
  assert.strictEqual(room.military, 3);
  assert.ok(room.milTokens['+3']);
  buildRed(p1, '병영'); // 방패 1 → 말이 2로
  assert.strictEqual(room.military, 2);
  while (room.players[room.turn] !== p0) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]);
  p1.coins = 9;
  buildRed(p0, '병영'); // 다시 3: 토큰은 이미 발동했으므로 동전을 또 빼앗지 않는다
  assert.strictEqual(room.military, 3);
  assert.strictEqual(p1.coins, 9);
  while (room.players[room.turn] !== p0) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]);
  p1.coins = 9;
  buildRed(p0, '무기고'); // +3 → 6: 5동전 토큰
  assert.strictEqual(room.military, 6);
  assert.ok(room.milTokens['+6']);
  assert.strictEqual(p1.coins, 4);
  buildRed(p0, '요새'); // +2 → 8
  assert.strictEqual(room.military, 8);
  assert.strictEqual(room.phase, 'play');
  buildRed(p0, '목책'); // +1 → 9: 승리
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds, [p0.id]);
  assert.strictEqual(room.reason, 'military');
  assert.ok(duel.discardCard(room, p1.id, 0).error);
});

test('군사 토큰: 1번 자리가 밀면 반대쪽(-)으로 움직이고 상대(0번)가 잃는다', () => {
  const { room, p0, p1 } = ready();
  while (room.players[room.turn] !== p1) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]);
  const s = duel.openSlots(room)[0];
  setSlot(room, s, '열병장');
  p1.coins = 20;
  p0.coins = 7;
  duel.build(room, p1.id, s);
  assert.strictEqual(room.military, -2);
  while (room.players[room.turn] !== p1) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]);
  const s2 = duel.openSlots(room)[0];
  setSlot(room, s2, '병영');
  const before = p0.coins;
  duel.build(room, p1.id, s2);
  assert.strictEqual(room.military, -3);
  assert.strictEqual(p0.coins, before - 2);
  assert.ok(room.milTokens['-3']);
});

test('과학: 같은 기호 2장이면 진보 토큰을 고르고, 법률 토큰도 기호로 치며, 6종이면 승리', () => {
  const { room, p0, p1 } = ready();
  p0.coins = 30;
  p1.coins = 30;
  const turnOf = (p) => { while (room.players[room.turn] !== p) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]); };
  const buildAs = (p, name) => {
    turnOf(p);
    const s = duel.openSlots(room)[0];
    setSlot(room, s, name);
    p.coins = 30;
    return duel.build(room, p.id, s);
  };
  assert.deepStrictEqual(buildAs(p0, '필사실'), {});
  assert.strictEqual(room.pend.length, 0);
  const tokenBefore = room.boardTokens.slice();
  assert.deepStrictEqual(buildAs(p0, '도서관'), {}); // 문자 기호 2장 → 토큰 선택
  assert.strictEqual(room.pend.length, 1);
  assert.strictEqual(room.pend[0].type, 'token');
  const v = duel.viewFor(room, p0.id);
  assert.strictEqual(v.mode, 'token');
  assert.strictEqual(duel.viewFor(room, p1.id).mode, 'wait');
  // 선택 전에는 아무도 카드를 가져올 수 없다
  assert.ok(duel.discardCard(room, p0.id, duel.openSlots(room)[0]).error);
  assert.ok(duel.choose(room, p1.id, { token: tokenBefore[0] }).error);
  assert.ok(duel.choose(room, p0.id, { token: 'nope' }).error);
  const pick = tokenBefore[0];
  assert.deepStrictEqual(duel.choose(room, p0.id, { token: pick }), {});
  assert.ok(p0.tokens.includes(pick));
  assert.strictEqual(room.boardTokens.length, 4);
  assert.ok(!room.boardTokens.includes(pick));
  // 선택이 끝나면 상대 차례
  assert.strictEqual(room.players[room.turn], p1);
});

test('과학 승리: 서로 다른 기호 6종 (법률 토큰 포함)', () => {
  const { room, p0 } = ready();
  give(p0, '약국', '공방', '필사실', '약제사', '학술원'); // wheel square quill mortar sundial
  assert.strictEqual(room.phase, 'play');
  const s = duel.openSlots(room)[0];
  setSlot(room, s, '천문대'); // astrolabe → 6종
  p0.coins = 30;
  assert.deepStrictEqual(duel.build(room, p0.id, s), {});
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.reason, 'science');
  assert.deepStrictEqual(room.winnerIds, [p0.id]);

  // 법률 토큰도 과학 기호 1개로 친다: 5종 + 같은 기호 한 쌍 → 토큰으로 법률을 고르면 6종
  const r2 = ready();
  give(r2.p0, '약제사', '공방', '필사실', '학술원', '천문대'); // mortar square quill sundial astrolabe
  r2.room.boardTokens = ['law', 'agriculture', 'masonry', 'strategy', 'theology'];
  r2.room.boxTokens = ['architecture', 'economy', 'mathematics', 'philosophy', 'urbanism'];
  const s2 = duel.openSlots(r2.room)[0];
  setSlot(r2.room, s2, '연구소'); // square 두 번째 (6종은 아님)
  r2.p0.coins = 30;
  duel.build(r2.room, r2.p0.id, s2);
  assert.strictEqual(r2.room.phase, 'play');
  assert.strictEqual(r2.room.pend[0].type, 'token');
  duel.choose(r2.room, r2.p0.id, { token: 'law' });
  assert.strictEqual(r2.room.phase, 'over');
  assert.strictEqual(r2.room.reason, 'science');
  assert.deepStrictEqual(r2.room.winnerIds, [r2.p0.id]);
});

test('불가사의: 비용·카드가 밑에 깔림·효과·한 번 더', () => {
  const { room, p0, p1 } = ready();
  const w = (name) => WONDERS.find((x) => x.name === name).id;
  p0.wonders = [{ id: w('아르테미스 신전'), built: false, under: null }, { id: w('콜로서스'), built: false, under: null }];
  const slot = duel.openSlots(room)[0];
  const cardId = room.slots[slot].card;
  p0.coins = 4;
  assert.ok(duel.buildWonder(room, p0.id, slot, w('피라미드')).error); // 내 불가사의가 아님
  assert.ok(duel.buildWonder(room, p0.id, slot, w('아르테미스 신전')).error); // 동전 부족 (자원 4개 → 8)
  p0.coins = 8;
  assert.deepStrictEqual(duel.buildWonder(room, p0.id, slot, w('아르테미스 신전')), {});
  assert.strictEqual(p0.coins, 12); // 8 - 8 + 12
  const built = p0.wonders[0];
  assert.strictEqual(built.built, true);
  assert.strictEqual(built.under, cardId);
  assert.strictEqual(room.players[room.turn], p0); // 한 번 더
  assert.ok(duel.buildWonder(room, p0.id, duel.openSlots(room)[0], w('아르테미스 신전')).error); // 이미 지음
  assert.strictEqual(room.wondersBuilt, 1);
  // 콜로서스: 방패 2
  p0.coins = 20;
  assert.deepStrictEqual(duel.buildWonder(room, p0.id, duel.openSlots(room)[0], w('콜로서스')), {});
  assert.strictEqual(room.military, 2);
  assert.strictEqual(room.players[room.turn], p1); // 콜로서스는 한 번 더가 없다
});

test('불가사의 효과: 아피아 가도, 키르쿠스(파괴), 대도서관, 마우솔레움, 신학', () => {
  const w = (name) => WONDERS.find((x) => x.name === name).id;
  // 아피아 가도: +3 / 상대 -3 / 한 번 더
  let g = ready();
  g.p0.wonders = [{ id: w('아피아 가도'), built: false, under: null }];
  g.p0.coins = 30;
  g.p1.coins = 2;
  duel.buildWonder(g.room, g.p0.id, duel.openSlots(g.room)[0], w('아피아 가도'));
  assert.strictEqual(g.p1.coins, 0);
  assert.strictEqual(g.room.players[g.room.turn], g.p0);
  assert.ok(g.p0.coins >= 3);

  // 키르쿠스: 상대의 제품(회색) 카드 파괴, 방패 1
  g = ready();
  g.p0.wonders = [{ id: w('키르쿠스 막시무스'), built: false, under: null }];
  g.p0.coins = 40;
  give(g.p1, '유리 공방', '벌목장');
  duel.buildWonder(g.room, g.p0.id, duel.openSlots(g.room)[0], w('키르쿠스 막시무스'));
  assert.strictEqual(g.room.pend[0].type, 'destroy');
  assert.deepStrictEqual(g.room.pend[0].options, [byName('유리 공방')]);
  assert.strictEqual(duel.viewFor(g.room, g.p0.id).mode, 'destroy');
  assert.ok(duel.choose(g.room, g.p0.id, { card: byName('벌목장') }).error); // 갈색은 대상이 아님
  assert.deepStrictEqual(duel.choose(g.room, g.p0.id, { card: byName('유리 공방') }), {});
  assert.ok(!cardOf(g.p1, '유리 공방'));
  assert.ok(g.room.discard.includes(byName('유리 공방')));
  assert.strictEqual(g.room.military, 1);
  assert.strictEqual(g.room.players[g.room.turn], g.p1);

  // 상대에게 대상이 없으면 그냥 넘어간다
  g = ready();
  g.p0.wonders = [{ id: w('제우스 상'), built: false, under: null }];
  g.p0.coins = 40;
  duel.buildWonder(g.room, g.p0.id, duel.openSlots(g.room)[0], w('제우스 상'));
  assert.strictEqual(g.room.pend.length, 0);
  assert.strictEqual(g.room.players[g.room.turn], g.p1);

  // 대도서관: 상자 속 토큰 3개 중 1개
  g = ready();
  g.p0.wonders = [{ id: w('대도서관'), built: false, under: null }];
  g.p0.coins = 40;
  duel.buildWonder(g.room, g.p0.id, duel.openSlots(g.room)[0], w('대도서관'));
  const head = g.room.pend[0];
  assert.strictEqual(head.type, 'library');
  assert.strictEqual(head.options.length, 3);
  assert.ok(head.options.every((t) => g.room.boxTokens.includes(t)));
  assert.deepStrictEqual(duel.viewFor(g.room, g.p0.id).pend.options, head.options); // 고르는 사람은 보고
  assert.strictEqual(duel.viewFor(g.room, g.p1.id).pend.options, null); // 상대는 못 본다
  duel.choose(g.room, g.p0.id, { token: head.options[1] });
  assert.ok(g.p0.tokens.includes(head.options[1]));
  assert.strictEqual(g.room.boxTokens.length, 4);

  // 마우솔레움: 버려진 카드를 무료로 짓는다
  g = ready();
  g.p0.wonders = [{ id: w('마우솔레움'), built: false, under: null }];
  g.p0.coins = 40;
  g.room.discard = [byName('채석장'), byName('극장')];
  duel.buildWonder(g.room, g.p0.id, duel.openSlots(g.room)[0], w('마우솔레움'));
  assert.strictEqual(g.room.pend[0].type, 'revive');
  assert.ok(duel.choose(g.room, g.p0.id, { card: byName('벌목장') }).error);
  duel.choose(g.room, g.p0.id, { card: byName('극장') });
  assert.ok(cardOf(g.p0, '극장'));
  assert.deepStrictEqual(g.room.discard, [byName('채석장')]);

  // 신학: 한 번 더가 없는 불가사의에도 붙는다
  g = ready();
  g.p0.wonders = [{ id: w('피라미드'), built: false, under: null }];
  g.p0.tokens = ['theology'];
  g.p0.coins = 40;
  duel.buildWonder(g.room, g.p0.id, duel.openSlots(g.room)[0], w('피라미드'));
  assert.strictEqual(g.room.players[g.room.turn], g.p0);
});

test('불가사의가 7개 지어지면 남은 불가사의는 사라진다', () => {
  const { room, p0, p1 } = ready();
  room.wondersBuilt = 6;
  p0.wonders.forEach((x) => { x.built = false; });
  p0.coins = 99;
  const target = p0.wonders[0];
  duel.buildWonder(room, p0.id, duel.openSlots(room)[0], target.id);
  assert.strictEqual(room.wondersBuilt, 7);
  const unbuilt = [...p0.wonders, ...p1.wonders].filter((x) => !x.built);
  assert.ok(unbuilt.length > 0);
  assert.ok(unbuilt.every((x) => x.lost));
  const owner = [p0, p1].find((p) => p.wonders.includes(unbuilt[0]));
  room.turn = room.players.indexOf(owner);
  owner.coins = 99;
  assert.ok(duel.buildWonder(room, owner.id, duel.openSlots(room)[0], unbuilt[0].id).error);
  const v = duel.viewFor(room, p0.id);
  assert.ok(v.players.every((p) => p.wonders.every((x) => x.built || x.lost)));
});

test('시대 전환: 군사가 약한 쪽이 시작 플레이어를 고른다', () => {
  const { room, p0, p1 } = ready();
  room.military = 2; // 0번이 밀고 있음 → 1번이 약함
  let guard = 0;
  while (room.phase === 'play' && guard++ < 60) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]);
  assert.strictEqual(room.phase, 'chooseStart');
  assert.strictEqual(room.age, 1);
  const v1 = duel.viewFor(room, p1.id);
  assert.strictEqual(v1.mode, 'chooseStart');
  assert.strictEqual(duel.viewFor(room, p0.id).mode, 'wait');
  assert.ok(duel.chooseStart(room, p0.id, 'me').error);
  assert.ok(duel.chooseStart(room, p1.id, 'both').error);
  assert.deepStrictEqual(duel.chooseStart(room, p1.id, 'opp'), {});
  assert.strictEqual(room.age, 2);
  assert.strictEqual(room.players[room.turn], p0);
  assert.strictEqual(room.slots.filter((s) => s.taken).length, 0);
  assert.strictEqual(room.phase, 'play');
  // 동률이면 마지막 카드를 가져간 사람이 고른다
  room.military = 0;
  guard = 0;
  while (room.phase === 'play' && guard++ < 60) duel.discardCard(room, room.players[room.turn].id, duel.openSlots(room)[0]);
  assert.strictEqual(room.phase, 'chooseStart');
  assert.strictEqual(room.chooser, room.lastTaker);
  assert.deepStrictEqual(duel.chooseStart(room, room.players[room.chooser].id, 'me'), {});
  assert.strictEqual(room.age, 3);
  assert.strictEqual(room.players[room.turn], room.players[room.chooser]);
  assert.strictEqual(room.slots.length, 20);
});

test('종료 점수: 카드·불가사의·토큰·군사·동전, 동점이면 파랑 승점', () => {
  const { room, p0, p1 } = ready();
  p0.cards = [];
  p1.cards = [];
  p0.tokens = [];
  p1.tokens = [];
  p0.wonders.forEach((x) => { x.built = false; });
  room.military = 0;
  p0.coins = 0;
  p1.coins = 0;
  give(p0, '극장', '약국', '상공회의소'); // 파랑 3, 초록 1, 노랑 3
  const s = duel.score(room, p0);
  assert.deepStrictEqual([s.blue, s.green, s.yellow, s.total], [3, 1, 3, 7]);
  p0.wonders[0].built = true; // 불가사의 승점
  const wp = DATA.WONDER[p0.wonders[0].id].vp;
  p0.coins = 8; // 8/3 = 2점
  room.military = 4; // 0번이 앞섬: 3~5칸 → 5점
  p0.tokens = ['philosophy', 'agriculture', 'mathematics']; // 7 + 4 + 3×3
  const s2 = duel.score(room, p0);
  assert.strictEqual(s2.wonders, wp);
  assert.strictEqual(s2.coins, 2);
  assert.strictEqual(s2.military, 5);
  assert.strictEqual(s2.tokens, 7 + 4 + 9);
  assert.strictEqual(s2.total, 7 + wp + 2 + 5 + 20);
  // 군사 승점은 앞선 쪽만 받는다
  assert.strictEqual(duel.score(room, p1).military, 0);
  room.military = -7;
  assert.strictEqual(duel.score(room, p1).military, 10);
  room.military = -1;
  assert.strictEqual(duel.score(room, p1).military, 2);
  // 길드: 두 도시 중 많은 쪽 기준
  room.military = 0;
  p0.cards = [];
  p1.cards = [];
  give(p0, '행정관 길드', '극장');
  give(p1, '극장', '제단', '목욕탕');
  assert.strictEqual(duel.score(room, p0).purple, 3);
  p0.coins = 0;
  p1.coins = 12;
  p0.cards = [];
  give(p0, '대금업자 길드');
  assert.strictEqual(duel.score(room, p0).purple, 4);
});

test('3시대가 끝나면 점수로 승패가 정해지고, 동점이면 파랑 승점으로 가린다', () => {
  const { room, p0, p1 } = ready();
  room.military = 0;
  room.age = 3;
  room.slots = duel.layout(3);
  room.slots.forEach((s, i) => { s.card = duel.dealAge(3)[i]; s.taken = i > 0; });
  room.slots[0].taken = false;
  room.slots[0].coveredBy = [];
  room.turn = 0;
  p0.coins = 3;
  p1.coins = 0;
  p0.cards = [];
  p1.cards = [];
  const id = room.slots[0].card;
  duel.discardCard(room, p0.id, 0);
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds, [p0.id]); // 동전 3+2 = 5 → 1점 vs 0점
  assert.strictEqual(room.reason, 'points');
  assert.ok(room.result.scores[p0.id].total > room.result.scores[p1.id].total);
  assert.ok(id !== undefined);

  // 동점: 파랑 승점이 높은 쪽
  const g = ready();
  g.room.age = 3;
  g.room.slots.forEach((s) => { s.taken = true; });
  g.p0.cards = [byName('극장')]; // 파랑 3
  g.p1.cards = [byName('상공회의소')]; // 노랑 3
  g.p0.coins = 0;
  g.p1.coins = 0;
  g.room.slots[0].taken = false;
  g.room.slots[0].coveredBy = [];
  g.room.slots[0].card = byName('채석장');
  g.room.turn = 0;
  g.p0.wonders = [];
  g.p1.wonders = [];
  // 버린 뒤 p0 동전 2 → 0점, 동점 3:3
  duel.discardCard(g.room, g.p0.id, 0);
  assert.strictEqual(g.room.phase, 'over');
  assert.deepStrictEqual(g.room.winnerIds, [g.p0.id]);

  // 완전 동점은 공동 우승
  const h = ready();
  h.room.age = 3;
  h.room.slots.forEach((s) => { s.taken = true; });
  h.room.slots[0].taken = false;
  h.room.slots[0].coveredBy = [];
  h.room.slots[0].card = byName('채석장');
  h.room.turn = 0;
  h.p0.cards = [];
  h.p1.cards = [];
  h.p0.coins = 0;
  h.p1.coins = 2;
  h.p0.wonders = [];
  h.p1.wonders = [];
  duel.discardCard(h.room, h.p0.id, 0);
  assert.strictEqual(h.room.reason, 'tie');
  assert.strictEqual(h.room.winnerIds.length, 2);
});

test('상태 보기: 뒷면 카드는 정체를 보내지 않고, 비용은 차례인 사람에게만 보낸다', () => {
  const { room, p0, p1 } = ready();
  const v0 = duel.viewFor(room, p0.id);
  const v1 = duel.viewFor(room, p1.id);
  assert.strictEqual(v0.mode, 'pick');
  assert.strictEqual(v1.mode, 'wait');
  assert.ok(Object.keys(v0.costs).length > 0);
  assert.deepStrictEqual(v1.costs, {});
  assert.deepStrictEqual(Object.keys(v0.costs).map(Number).sort(), duel.openSlots(room).sort((a, b) => a - b));
  assert.ok(v0.slots.filter((s) => s.card === null).every((s) => s.taken || !s.up));
  assert.ok(v0.slots.filter((s) => s.open).every((s) => s.up && s.card !== null));
  assert.strictEqual(v0.discardGain, 2);
  assert.strictEqual(Object.keys(v0.wonderCosts).length, 4);
  assert.strictEqual(v0.players.length, 2);
  assert.strictEqual(v0.minPlayers, 2);
  assert.strictEqual(v0.maxPlayers, 2);
  // 불가사의 밑에 깔린 카드는 보이지 않는다
  duel.buildWonder(room, p0.id, duel.openSlots(room)[0], Object.keys(v0.wonderCosts).map(Number)[0]);
  const json = JSON.stringify(duel.viewFor(room, p1.id));
  assert.ok(!json.includes('"under"'));
});

test('방장: 대신 진행 / 초기화 / 다시 시작', () => {
  const { room, p0 } = ready();
  const host = room.hostId;
  const other = room.players.find((p) => p.id !== host);
  assert.ok(duel.force(room, other.id).error);
  const before = room.slots.filter((s) => s.taken).length;
  assert.deepStrictEqual(duel.force(room, host), {});
  assert.strictEqual(room.slots.filter((s) => s.taken).length, before + 1);
  assert.ok(duel.restart(room, other.id).error);
  other.connected = false;
  assert.ok(duel.restart(room, host).error);
  other.connected = true;
  const no = room.gameNo;
  assert.deepStrictEqual(duel.restart(room, host), {});
  assert.strictEqual(room.gameNo, no + 1);
  assert.strictEqual(room.phase, 'draft');
  assert.ok(room.players.every((p) => p.coins === 7 && p.cards.length === 0 && p.wonders.length === 0));
  assert.strictEqual(room.discard.length, 0);
  assert.strictEqual(room.military, 0);
  assert.deepStrictEqual(duel.backToLobby(room, host), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(duel.backToLobby(room, host).error);
  assert.ok(p0);
});

// ---- 무작위 시뮬레이션 ----

function invariants(room, dealt) {
  assert.ok(room.players.every((p) => Number.isInteger(p.coins) && p.coins >= 0), '동전');
  assert.ok(Math.abs(room.military) <= 9, '군사');
  assert.strictEqual(room.wondersBuilt, room.players.reduce((a, p) => a + p.wonders.filter((w) => w.built).length, 0));
  assert.ok(room.wondersBuilt <= 7);
  assert.strictEqual(new Set(room.discard).size, room.discard.length);
  // 토큰 보존
  const tok = [...room.boardTokens, ...room.boxTokens, ...room.players.flatMap((p) => p.tokens)];
  assert.strictEqual(tok.length, 10);
  assert.strictEqual(new Set(tok).size, 10);
  // 카드 보존: 한 번 깔린 카드는 어딘가 정확히 한 곳에 있다
  const where = [];
  room.slots.forEach((s) => { if (!s.taken) where.push(s.card); });
  room.players.forEach((p) => { where.push(...p.cards); p.wonders.forEach((w) => { if (w.under !== null) where.push(w.under); }); });
  where.push(...room.discard);
  assert.strictEqual(where.length, dealt.size, '카드 수');
  assert.strictEqual(new Set(where).size, where.length, '카드 중복');
  assert.ok(where.every((id) => dealt.has(id)));
}

function randomGame(rng) {
  const { room, a } = lobby();
  const pickR = (arr) => arr[Math.floor(rng() * arr.length)];
  duel.start(room, a.id);
  const dealt = new Set();
  let seenAge = 0;
  const kinds = { build: 0, discard: 0, wonder: 0, choose: 0 };
  for (let step = 0; step < 400 && room.phase !== 'over'; step++) {
    if (room.age !== seenAge && room.phase === 'play') {
      seenAge = room.age;
      room.slots.forEach((s) => dealt.add(s.card));
    }
    if (room.phase === 'draft') {
      const v = duel.viewFor(room, a.id);
      assert.deepStrictEqual(duel.draftWonder(room, v.draft.pickerId, pickR(room.draft.pool)), {});
      continue;
    }
    if (room.phase === 'chooseStart') {
      assert.deepStrictEqual(duel.chooseStart(room, room.players[room.chooser].id, pickR(['me', 'opp'])), {});
      continue;
    }
    if (room.pend.length) {
      const h = room.pend[0];
      const p = room.players[h.player];
      const msg = h.type === 'token' || h.type === 'library' ? { token: pickR(h.options) } : { card: pickR(h.options) };
      assert.deepStrictEqual(duel.choose(room, p.id, msg), {});
      kinds.choose += 1;
      invariants(room, dealt);
      continue;
    }
    const p = room.players[room.turn];
    const v = duel.viewFor(room, p.id);
    assert.strictEqual(v.mode, 'pick');
    const slot = pickR(duel.openSlots(room));
    const roll = rng();
    let r;
    const wonders = Object.keys(v.wonderCosts).map(Number).filter((id) => v.wonderCosts[id].ok);
    if (roll < 0.55 && v.costs[slot].ok) { r = duel.build(room, p.id, slot); kinds.build += 1; }
    else if (roll < 0.75 && wonders.length) { r = duel.buildWonder(room, p.id, slot, pickR(wonders)); kinds.wonder += 1; }
    else { r = duel.discardCard(room, p.id, slot); kinds.discard += 1; }
    assert.deepStrictEqual(r, {});
    if (room.phase === 'over') break;
    invariants(room, dealt);
  }
  return { room, kinds };
}

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

test('무작위 100판 시뮬레이션: 카드·토큰 보존, 반드시 끝난다', () => {
  const ends = { military: 0, science: 0, points: 0, tie: 0 };
  const total = { build: 0, discard: 0, wonder: 0, choose: 0 };
  for (let g = 0; g < 100; g++) {
    const { room, kinds } = randomGame(seeded(g + 1));
    assert.strictEqual(room.phase, 'over', `game ${g}`);
    assert.ok(room.winnerIds.length >= 1 && room.winnerIds.length <= 2);
    assert.ok(room.result && Object.keys(room.result.scores).length === 2);
    ends[room.reason] += 1;
    Object.keys(total).forEach((k) => { total[k] += kinds[k]; });
  }
  assert.ok(total.build > 0 && total.discard > 0 && total.wonder > 0 && total.choose > 0, JSON.stringify(total));
  assert.ok(ends.points > 0, JSON.stringify(ends));
});

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const b = require('../bang');
const DATA = require('../public/bang-data.js');

let nid = 1000;
const C = (key, suit = 's', rank = 5) => ({ id: nid++, key, suit, rank });
const toCard = (k) => (typeof k === 'string' ? C(k) : k);

// 규칙을 정확히 시험하려고 판을 직접 세팅한다. 좌석 0이 보안관이고 지금 턴. 덱은 맨 끝 카드가 먼저 뽑힌다.
function setup(n, o = {}) {
  const room = b.createRoom('BT');
  for (let i = 0; i < n; i++) b.addPlayer(room, `p${i}`);
  assert.deepStrictEqual(b.start(room, room.hostId), {});
  const roles = o.roles || b.ROLE_SETS[n];
  room.players.forEach((p, i) => {
    p.role = roles[i];
    p.char = (o.chars && o.chars[i]) || 'kit'; // 'kit'은 뽑기 단계에서만 효과가 있어 시험에서는 중립
    p.max = (o.max && o.max[i]) || 4;
    p.life = (o.life && o.life[i] != null) ? o.life[i] : p.max;
    p.alive = true;
    p.hand = ((o.hands && o.hands[i]) || []).map(toCard);
    p.table = ((o.tables && o.tables[i]) || []).map(toCard);
  });
  room.deck = o.deck || Array.from({ length: 40 }, () => C('missed', 'c', 3));
  room.discard = [];
  room.queue = [];
  room.pending = null;
  room.turn = o.turn || 0;
  room.bangUsed = false;
  room.discarding = false;
  room.phase = 'play';
  return room;
}
const P = (room, i) => room.players[i];
const handKeys = (p) => p.hand.map((c) => c.key);
const play = (room, i, key, target, pick) => {
  const card = P(room, i).hand.find((c) => c.key === key);
  return b.play(room, P(room, i).id, card.id, target == null ? undefined : P(room, target).id, pick);
};
const respondWith = (room, i, key) => {
  const card = key ? P(room, i).hand.find((c) => c.key === key) : null;
  return b.respond(room, P(room, i).id, card ? card.id : null);
};
const heart = () => C('missed', 'h', 7);
const clubs = () => C('missed', 'c', 7);

test('덱 80장: 종류별 장수, 다이너마이트는 ♥2', () => {
  assert.strictEqual(b.DECK.length, 80);
  for (const [key, def] of Object.entries(DATA.CARDS)) {
    assert.strictEqual(b.DECK.filter((c) => c.key === key).length, def.n, key);
  }
  assert.strictEqual(new Set(b.DECK.map((c) => c.id)).size, 80);
  const dyn = b.DECK.find((c) => c.key === 'dynamite');
  assert.deepStrictEqual([dyn.suit, dyn.rank], ['h', 2]);
  assert.ok(b.DECK.every((c) => c.rank >= 2 && c.rank <= 14 && 'shdc'.includes(c.suit)));
});

test('덱 무늬·숫자가 실제 카드 목록과 같다 (무늬별 20장, 뽑기!에 쓰이는 카드의 위치)', () => {
  const at = (key) => b.DECK.filter((c) => c.key === key).map((c) => `${c.suit}${c.rank}`).sort();
  const bySuit = {};
  b.DECK.forEach((c) => { bySuit[c.suit] = (bySuit[c.suit] || 0) + 1; });
  assert.deepStrictEqual(bySuit, { s: 20, h: 20, d: 20, c: 20 });
  // 뽑기!로 쓰이는 카드: 배럴(♠Q ♠K), 감옥(♠10 ♠J ♥4), 다이너마이트(♥2)
  assert.deepStrictEqual(at('barrel'), ['s12', 's13']);
  assert.deepStrictEqual(at('jail'), ['h4', 's10', 's11']);
  assert.deepStrictEqual(at('dynamite'), ['h2']);
  // 무기: 규칙서에 적힌 무늬
  assert.deepStrictEqual(at('volcanic'), ['c10', 's10']);
  assert.deepStrictEqual(at('schofield'), ['c11', 'c12', 's13']);
  assert.deepStrictEqual(at('remington'), ['c13']);
  assert.deepStrictEqual(at('carabine'), ['c14']);
  assert.deepStrictEqual(at('winchester'), ['s8']);
  // 뱅! 25장: ♣2~9, ♦2~A, ♠A, ♥A ♥Q ♥K
  assert.deepStrictEqual(at('bang'), [
    'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'd10', 'd11', 'd12', 'd13', 'd14', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'h12', 'h13', 'h14', 's14',
  ].sort());
  assert.deepStrictEqual(at('beer'), ['h10', 'h11', 'h6', 'h7', 'h8', 'h9']);
  assert.deepStrictEqual(at('missed'), ['c10', 'c11', 'c12', 'c13', 'c14', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].sort());
  // 80장은 52장 한 벌보다 많아서 같은 무늬·숫자가 여러 번 나온다. 역마차 ♠9는 원본 목록에서도 두 장이다.
  const dup = {};
  b.DECK.forEach((c) => { const k = `${c.suit}${c.rank}`; (dup[k] = dup[k] || []).push(c.key); });
  const multi = Object.entries(dup).filter(([, v]) => v.length > 1);
  assert.ok(multi.length > 0);
  assert.deepStrictEqual(dup.s9.sort(), ['stagecoach', 'stagecoach']);
});

test('4~7명: 역할 구성, 체력, 시작 손패, 정체 공개 범위', () => {
  const want = { 4: [1, 0, 2, 1], 5: [1, 1, 2, 1], 6: [1, 1, 3, 1], 7: [1, 2, 3, 1] };
  for (const n of [4, 5, 6, 7]) {
    const room = b.createRoom('X');
    for (let i = 0; i < n; i++) b.addPlayer(room, `p${i}`);
    assert.deepStrictEqual(b.start(room, room.hostId), {});
    const count = (r) => room.players.filter((p) => p.role === r).length;
    assert.deepStrictEqual([count('sheriff'), count('deputy'), count('outlaw'), count('renegade')], want[n], `${n}명`);
    assert.strictEqual(new Set(room.players.map((p) => p.char)).size, n);
    for (const p of room.players) {
      assert.strictEqual(p.max, DATA.CHARS[p.char].life + (p.role === 'sheriff' ? 1 : 0));
      assert.strictEqual(p.life, p.max);
    }
    assert.strictEqual(room.players[room.turn].role, 'sheriff');
    const viewer = room.players.find((p) => p.role === 'outlaw');
    const v = b.viewFor(room, viewer.id);
    for (const p of v.players) {
      const real = room.players.find((x) => x.id === p.id);
      if (real.role === 'sheriff' || real.id === viewer.id) assert.strictEqual(p.role, real.role);
      else assert.strictEqual(p.role, null);
    }
    assert.ok(!JSON.stringify(v).includes(room.players.find((p) => p.role === 'renegade').token || 'zzz'));
  }
});

test('4명 미만이면 시작 불가, 방장만 시작', () => {
  const room = b.createRoom('X');
  for (let i = 0; i < 3; i++) b.addPlayer(room, `p${i}`);
  assert.ok(b.start(room, room.hostId).error);
  b.addPlayer(room, 'p3');
  assert.ok(b.start(room, room.players[1].id).error);
  for (let i = 4; i < 7; i++) b.addPlayer(room, `p${i}`);
  assert.ok(b.addPlayer(room, 'p8').error);
});

test('거리: 좌석 기준 최단, 머스탱 +1, 스코프 -1, 폴 +1, 로즈 -1, 탈락자는 건너뜀', () => {
  const room = setup(6);
  const d = (a, c) => b.distance(room, P(room, a), P(room, c));
  assert.deepStrictEqual([d(0, 1), d(0, 2), d(0, 3), d(0, 4), d(0, 5)], [1, 2, 3, 2, 1]);
  P(room, 3).table = [C('mustang')];
  assert.strictEqual(d(0, 3), 4);
  P(room, 0).table = [C('scope')];
  assert.strictEqual(d(0, 3), 3);
  assert.strictEqual(d(0, 1), 1); // 최소 1
  P(room, 3).table = [];
  P(room, 0).table = [];
  P(room, 2).char = 'paul';
  assert.strictEqual(d(0, 2), 3);
  P(room, 0).char = 'rose';
  assert.strictEqual(d(0, 2), 2);
  P(room, 0).char = 'kit';
  P(room, 2).char = 'kit';
  P(room, 1).alive = false;
  assert.strictEqual(d(0, 2), 1);
});

test('뱅!: 사거리 밖은 거부, 무기가 있으면 가능, 한 턴에 한 번', () => {
  const room = setup(6, { hands: [['bang', 'bang', 'bang']] });
  assert.ok(play(room, 0, 'bang', 2).error);
  assert.deepStrictEqual(play(room, 0, 'bang', 1), {}); // 아무도 못 막음 → 바로 피해
  assert.strictEqual(P(room, 1).life, 3);
  assert.match(play(room, 0, 'bang', 5).error, /이미 뱅/);
  P(room, 0).table = [C('schofield')];
  assert.match(play(room, 0, 'bang', 5).error, /이미 뱅/);
  P(room, 0).table = [C('volcanic')];
  assert.deepStrictEqual(play(room, 0, 'bang', 5), {}); // 볼캐닉은 횟수 제한 없음
  assert.strictEqual(P(room, 5).life, 3);
  assert.ok(play(room, 0, 'bang', 3).error); // 거리 3은 사거리 1 밖
});

test('윌리 더 키드는 뱅!을 계속 쓸 수 있다. 무기 사거리는 거리와 맞아야 한다', () => {
  const room = setup(5, { chars: { 0: 'willy' }, hands: [['bang', 'bang']], tables: [[C('schofield')]] });
  assert.deepStrictEqual(play(room, 0, 'bang', 1), {});
  assert.deepStrictEqual(play(room, 0, 'bang', 2), {}); // 거리 2, 스코필드 사거리 2
  assert.strictEqual(P(room, 2).life, 3);
});

test('뱅!에 빗나감!으로 막거나, 포기하면 체력 -1', () => {
  const room = setup(5, { hands: [['bang', 'bang'], ['missed', 'missed']] });
  play(room, 0, 'bang', 1);
  assert.strictEqual(room.pending.t, 'respond');
  assert.strictEqual(room.pending.who, P(room, 1).id);
  assert.ok(respondWith(room, 2, null).error); // 다른 사람은 대응 불가
  assert.deepStrictEqual(respondWith(room, 1, 'missed'), {});
  assert.strictEqual(room.pending, null);
  assert.strictEqual(P(room, 1).life, 4);
  assert.deepStrictEqual(handKeys(P(room, 1)), ['missed']);

  P(room, 0).table = [C('volcanic')];
  play(room, 0, 'bang', 1);
  assert.deepStrictEqual(respondWith(room, 1, null), {});
  assert.strictEqual(P(room, 1).life, 3);
});

test('빗나감!이 없으면 묻지 않고 바로 맞는다. 잘못된 카드는 거부', () => {
  const room = setup(5, { hands: [['bang'], ['beer', 'bang']] });
  play(room, 0, 'bang', 1);
  assert.strictEqual(room.pending, null);
  assert.strictEqual(P(room, 1).life, 3);
  const room2 = setup(5, { hands: [['bang'], ['beer', 'missed']] });
  play(room2, 0, 'bang', 1);
  const beer = P(room2, 1).hand.find((c) => c.key === 'beer');
  assert.ok(b.respond(room2, P(room2, 1).id, beer.id).error);
  assert.strictEqual(room2.pending.t, 'respond');
});

test('슬랩 더 킬러의 뱅!은 빗나감!이 2장 필요하다', () => {
  const two = setup(5, { chars: { 0: 'slab' }, hands: [['bang'], ['missed', 'missed']] });
  play(two, 0, 'bang', 1);
  respondWith(two, 1, 'missed');
  assert.strictEqual(two.pending.need, 1);
  respondWith(two, 1, 'missed');
  assert.strictEqual(two.pending, null);
  assert.strictEqual(P(two, 1).life, 4);
  const one = setup(5, { chars: { 0: 'slab' }, hands: [['bang'], ['missed']] });
  play(one, 0, 'bang', 1);
  respondWith(one, 1, 'missed');
  assert.strictEqual(one.pending, null); // 더 낼 카드가 없어 바로 맞음
  assert.strictEqual(P(one, 1).life, 3);
});

const barrelOf = (room, i, use) => b.useBarrel(room, P(room, i).id, use);

test('배럴: 쓸지 직접 고른다. ♥면 막고 아니면 맞는다. 조던네는 배럴을 기본으로 가진다 (장비와 겹치면 두 번 시도)', () => {
  const hit = setup(5, { hands: [['bang']], tables: [[], [C('barrel')]], deck: [clubs(), heart()] });
  play(hit, 0, 'bang', 1);
  assert.strictEqual(hit.pending.t, 'barrel'); // 맞기 전에 배럴을 쓸지 묻는다
  assert.strictEqual(hit.pending.who, P(hit, 1).id);
  assert.strictEqual(P(hit, 1).life, 4);
  assert.deepStrictEqual(barrelOf(hit, 1, true), {});
  assert.strictEqual(P(hit, 1).life, 4); // ♥ 성공
  assert.strictEqual(hit.pending, null);
  const miss = setup(5, { hands: [['bang']], tables: [[], [C('barrel')]], deck: [heart(), clubs()] });
  play(miss, 0, 'bang', 1);
  barrelOf(miss, 1, true);
  assert.strictEqual(P(miss, 1).life, 3); // ♣ 실패, 빗나감!도 없어서 맞음
  const jour = setup(5, { chars: { 1: 'jourdonnais' }, hands: [['bang']], deck: [clubs(), heart()] });
  play(jour, 0, 'bang', 1);
  assert.strictEqual(jour.pending.t, 'barrel');
  barrelOf(jour, 1, true);
  assert.strictEqual(P(jour, 1).life, 4);
  // 장비 배럴 + 조던네: 첫 시도 실패 → 다시 쓸지 묻고, 두 번째 성공
  const both = setup(5, { chars: { 1: 'jourdonnais' }, hands: [['bang']], tables: [[], [C('barrel')]], deck: [heart(), clubs()] });
  play(both, 0, 'bang', 1);
  assert.strictEqual(both.pending.barrels, 2);
  barrelOf(both, 1, true);
  assert.strictEqual(both.pending.t, 'barrel');
  assert.strictEqual(both.pending.barrels, 1);
  barrelOf(both, 1, true);
  assert.strictEqual(P(both, 1).life, 4); // 첫 시도 실패, 두 번째 성공
  assert.strictEqual(both.pending, null);
});

test('배럴을 쓰지 않기로 하면 카드를 뒤집지 않고 빗나감!으로 넘어간다', () => {
  const room = setup(5, { hands: [['bang'], ['missed']], tables: [[], [C('barrel')]], deck: [heart()] });
  const deckBefore = room.deck.length;
  play(room, 0, 'bang', 1);
  assert.strictEqual(room.pending.t, 'barrel');
  assert.deepStrictEqual(barrelOf(room, 1, false), {});
  assert.strictEqual(room.deck.length, deckBefore); // 뽑기!를 하지 않았다
  assert.strictEqual(room.pending.t, 'respond');
  assert.strictEqual(room.pending.who, P(room, 1).id);
  assert.deepStrictEqual(respondWith(room, 1, 'missed'), {});
  assert.strictEqual(P(room, 1).life, 4);
  // 빗나감!도 없으면 바로 맞는다
  const none = setup(5, { hands: [['bang']], tables: [[], [C('barrel')]], deck: [heart()] });
  play(none, 0, 'bang', 1);
  barrelOf(none, 1, false);
  assert.strictEqual(none.pending, null);
  assert.strictEqual(P(none, 1).life, 3);
  // 조던네+장비 배럴이라도 '쓰지 않기'를 누르면 남은 시도는 모두 포기
  const both = setup(5, { chars: { 1: 'jourdonnais' }, hands: [['bang']], tables: [[], [C('barrel')]], deck: [heart(), heart()] });
  play(both, 0, 'bang', 1);
  barrelOf(both, 1, false);
  assert.strictEqual(both.pending, null);
  assert.strictEqual(P(both, 1).life, 3);
});

test('배럴 실패 뒤에도 빗나감!으로 막을 수 있다. 슬랩의 뱅!은 배럴 성공이 빗나감! 1장 몫', () => {
  const room = setup(5, { hands: [['bang'], ['missed']], tables: [[], [C('barrel')]], deck: [clubs()] });
  play(room, 0, 'bang', 1);
  barrelOf(room, 1, true); // ♣ 실패
  assert.strictEqual(room.pending.t, 'respond');
  respondWith(room, 1, 'missed');
  assert.strictEqual(P(room, 1).life, 4);
  const slab = setup(5, { chars: { 0: 'slab' }, hands: [['bang'], ['missed']], tables: [[], [C('barrel')]], deck: [heart()] });
  play(slab, 0, 'bang', 1);
  barrelOf(slab, 1, true); // ♥ 성공 → 빗나감! 1장 몫
  assert.strictEqual(slab.pending.t, 'respond');
  assert.strictEqual(slab.pending.need, 1);
  respondWith(slab, 1, 'missed');
  assert.strictEqual(P(slab, 1).life, 4);
});

test('배럴 선택: 다른 사람/대기 중이 아닐 때는 거부, 보는 사람에게만 선택창, 개틀링에도 묻는다', () => {
  const room = setup(5, { hands: [['bang']], tables: [[], [C('barrel')]], deck: [heart()] });
  assert.ok(barrelOf(room, 1, true).error); // 아직 맞는 중이 아님
  play(room, 0, 'bang', 1);
  assert.ok(barrelOf(room, 2, true).error); // 다른 사람
  assert.ok(barrelOf(room, 0, true).error);
  assert.strictEqual(b.viewFor(room, P(room, 1).id).mode, 'barrel');
  assert.strictEqual(b.viewFor(room, P(room, 0).id).mode, 'wait');
  assert.strictEqual(b.viewFor(room, P(room, 1).id).pending.barrels, 1);
  assert.ok(b.respond(room, P(room, 1).id, null).error); // 배럴 선택 중에는 포기도 안 됨(먼저 고른다)
  barrelOf(room, 1, true);
  assert.ok(barrelOf(room, 1, true).error); // 이미 끝남
  const gat = setup(5, { hands: [['gatling']], tables: [[], [C('barrel')]], deck: [heart()] });
  play(gat, 0, 'gatling');
  assert.strictEqual(gat.pending.t, 'barrel');
  assert.strictEqual(gat.pending.kind, 'gatling');
  barrelOf(gat, 1, true);
  assert.strictEqual(P(gat, 1).life, 4);
});

test('방장 force: 배럴 선택 중인 사람이 없으면 배럴을 쓴 것으로 처리한다', () => {
  const room = setup(5, { hands: [['bang']], tables: [[], [C('barrel')]], deck: [heart()] });
  play(room, 0, 'bang', 1);
  assert.strictEqual(room.pending.t, 'barrel');
  assert.deepStrictEqual(b.force(room, room.hostId), {});
  assert.strictEqual(room.pending, null);
  assert.strictEqual(P(room, 1).life, 4);
});

test('럭키 듀크는 2장을 넘겨 좋은 쪽을 고른다', () => {
  const room = setup(5, { chars: { 1: 'luckyduke' }, hands: [['bang']], tables: [[], [C('barrel')]], deck: [heart(), clubs()] });
  play(room, 0, 'bang', 1);
  barrelOf(room, 1, true);
  assert.strictEqual(P(room, 1).life, 4);
  assert.strictEqual(room.discard.length, 3); // 뱅! + 판정 2장
});

test('개틀링: 다른 모두에게, 각자 막거나 맞는다 (거리 무관)', () => {
  const room = setup(5, { hands: [['gatling'], [], ['missed'], [], []] });
  assert.deepStrictEqual(play(room, 0, 'gatling'), {});
  assert.strictEqual(P(room, 1).life, 3); // 막을 카드가 없어 바로 맞음
  assert.strictEqual(room.pending.who, P(room, 2).id);
  respondWith(room, 2, 'missed');
  assert.strictEqual(P(room, 2).life, 4);
  assert.strictEqual(P(room, 3).life, 3);
  assert.strictEqual(P(room, 4).life, 3);
  assert.strictEqual(P(room, 0).life, 4);
});

test('인디언!: 뱅!을 버리면 안전, 못 버리면 체력 -1', () => {
  const room = setup(5, { hands: [['indians'], ['bang'], [], ['bang'], []] });
  play(room, 0, 'indians');
  assert.strictEqual(room.pending.who, P(room, 1).id);
  respondWith(room, 1, null); // 포기
  assert.strictEqual(P(room, 1).life, 3);
  assert.strictEqual(P(room, 2).life, 3); // 뱅! 없음
  assert.strictEqual(room.pending.who, P(room, 3).id);
  respondWith(room, 3, 'bang');
  assert.strictEqual(P(room, 3).life, 4);
  assert.strictEqual(P(room, 4).life, 3);
});

test('결투: 번갈아 뱅!을 버리고 먼저 못 버리는 쪽이 체력 -1', () => {
  const room = setup(5, { hands: [['duel', 'bang', 'bang'], ['bang', 'bang']] });
  play(room, 0, 'duel', 1);
  assert.strictEqual(room.pending.who, P(room, 1).id);
  respondWith(room, 1, 'bang');
  assert.strictEqual(room.pending.who, P(room, 0).id);
  respondWith(room, 0, 'bang');
  assert.strictEqual(room.pending.who, P(room, 1).id);
  respondWith(room, 1, 'bang'); // 1이 마지막 뱅!
  assert.strictEqual(room.pending.who, P(room, 0).id);
  respondWith(room, 0, null); // 0이 포기 → 0이 맞음
  assert.strictEqual(P(room, 0).life, 3);
  assert.strictEqual(P(room, 1).life, 4);
  assert.strictEqual(room.pending, null);
});

test('캘러미티 자넷: 뱅!과 빗나감!을 바꿔 쓴다', () => {
  const room = setup(5, { chars: { 0: 'calamity', 1: 'calamity' }, hands: [['missed'], ['bang']] });
  play(room, 0, 'missed', 1); // 빗나감!을 뱅!으로
  assert.strictEqual(room.pending.who, P(room, 1).id);
  respondWith(room, 1, 'bang'); // 뱅!을 빗나감!으로
  assert.strictEqual(room.pending, null);
  assert.strictEqual(P(room, 1).life, 4);
});

test('잡화점: 낸 사람부터 한 장씩 고른다', () => {
  const cards = [C('beer'), C('bang'), C('missed'), C('panic'), C('scope')];
  const room = setup(5, { hands: [['genstore']], deck: [...cards] });
  play(room, 0, 'genstore');
  assert.strictEqual(room.pending.t, 'store');
  assert.strictEqual(room.pending.cards.length, 5);
  assert.ok(b.store(room, P(room, 1).id, cards[0].id).error); // 내 차례가 아님
  const order = [0, 1, 2, 3, 4];
  for (const i of order) {
    assert.strictEqual(room.pending.who, P(room, i).id);
    assert.deepStrictEqual(b.store(room, P(room, i).id, room.pending.cards[0].id), {});
  }
  assert.strictEqual(room.pending, null);
  assert.ok(room.players.every((p) => p.hand.length === 1));
});

test('패닉!: 거리 1만, 손패는 무작위/장비는 골라서. 캣 발루는 아무나', () => {
  const room = setup(6, { hands: [['panic', 'catbalou', 'catbalou', 'catbalou'], ['bang'], ['bang'], [], [], []], tables: [[], [C('barrel')], [C('mustang')]] });
  assert.ok(play(room, 0, 'panic', 2).error); // 거리 2
  const barrel = P(room, 1).table[0];
  assert.deepStrictEqual(play(room, 0, 'panic', 1, barrel.id), {});
  assert.ok(P(room, 0).hand.some((c) => c.id === barrel.id));
  assert.strictEqual(P(room, 1).table.length, 0);
  assert.deepStrictEqual(play(room, 0, 'catbalou', 2, 'hand'), {});
  assert.strictEqual(P(room, 2).hand.length, 0);
  assert.ok(play(room, 0, 'catbalou', 2, 'hand').error); // 손패 없음
  assert.deepStrictEqual(play(room, 0, 'catbalou', 2, P(room, 2).table[0].id), {});
  assert.strictEqual(P(room, 2).table.length, 0);
  assert.ok(play(room, 0, 'catbalou', 3).error); // 아무 카드도 없는 사람은 대상이 아니다
});

test('감옥: 보안관에겐 못 쓰고, 턴 시작에 ♥면 탈출, 아니면 턴을 건너뛴다', () => {
  const room = setup(5, { turn: 1, hands: [[], ['jail', 'jail']] });
  assert.ok(play(room, 1, 'jail', 0).error);
  assert.deepStrictEqual(play(room, 1, 'jail', 2), {});
  assert.ok(P(room, 2).table.some((c) => c.key === 'jail'));

  const skip = setup(5, { turn: 1, chars: { 2: 'willy', 3: 'willy' }, tables: [[], [], [C('jail')]], deck: [C('bang'), C('bang'), clubs()] });
  b.endTurn(skip, P(skip, 1).id);
  assert.strictEqual(skip.turn, 3); // 2번은 감옥으로 건너뜀
  assert.strictEqual(P(skip, 2).table.length, 0);
  assert.strictEqual(P(skip, 2).hand.length, 0); // 카드도 못 뽑음

  const free = setup(5, { turn: 1, chars: { 2: 'willy' }, tables: [[], [], [C('jail')]], deck: [C('bang'), C('bang'), heart()] });
  b.endTurn(free, P(free, 1).id);
  assert.strictEqual(free.turn, 2);
  assert.strictEqual(P(free, 2).table.length, 0);
  assert.strictEqual(P(free, 2).hand.length, 2); // 정상적으로 2장 뽑음
});

test('다이너마이트: ♠2~9면 폭발(-3), 아니면 다음 사람에게 넘어간다', () => {
  const boom = setup(5, { turn: 0, tables: [[], [C('dynamite')]], deck: [C('bang'), C('bang'), C('missed', 's', 5)] });
  b.endTurn(boom, P(boom, 0).id);
  assert.strictEqual(boom.turn, 1);
  assert.strictEqual(P(boom, 1).life, 1);
  assert.strictEqual(P(boom, 1).table.length, 0);

  const pass = setup(5, { turn: 0, tables: [[], [C('dynamite')]], deck: [C('bang'), C('bang'), C('missed', 's', 10)] });
  b.endTurn(pass, P(pass, 0).id);
  assert.strictEqual(P(pass, 1).life, 4);
  assert.strictEqual(P(pass, 1).table.length, 0);
  assert.ok(P(pass, 2).table.some((c) => c.key === 'dynamite'));

  const heartCase = setup(5, { turn: 0, tables: [[], [C('dynamite')]], deck: [C('bang'), C('bang'), C('missed', 'h', 5)] });
  b.endTurn(heartCase, P(heartCase, 0).id);
  assert.strictEqual(P(heartCase, 1).life, 4); // ♥는 안전
});

test('맥주/살롱/역마차/웰스 파고', () => {
  const room = setup(5, { life: [4, 2, 4, 4, 4], hands: [['beer', 'saloon', 'stagecoach', 'wellsfargo']] });
  assert.match(play(room, 0, 'beer').error, /가득/);
  P(room, 0).life = 2;
  assert.deepStrictEqual(play(room, 0, 'beer'), {});
  assert.strictEqual(P(room, 0).life, 3);
  play(room, 0, 'saloon');
  assert.deepStrictEqual(room.players.map((p) => p.life), [4, 3, 4, 4, 4]);
  const before = P(room, 0).hand.length;
  play(room, 0, 'stagecoach');
  play(room, 0, 'wellsfargo');
  assert.strictEqual(P(room, 0).hand.length, before - 2 + 5);
});

test('둘만 남으면 맥주를 쓸 수 없다', () => {
  const room = setup(5, { life: [2], hands: [['beer']] });
  [2, 3, 4].forEach((i) => { P(room, i).alive = false; });
  assert.match(play(room, 0, 'beer').error, /둘만/);
});

test('죽기 직전: 맥주로 살아나거나 포기하면 탈락, 맥주가 없으면 바로 탈락', () => {
  const save = setup(5, { life: [4, 1], hands: [['bang'], ['beer']] });
  play(save, 0, 'bang', 1);
  assert.strictEqual(save.pending.t, 'dying');
  assert.strictEqual(P(save, 1).life, 0);
  const beer = P(save, 1).hand[0];
  assert.deepStrictEqual(b.respond(save, P(save, 1).id, beer.id), {});
  assert.strictEqual(P(save, 1).life, 1);
  assert.strictEqual(P(save, 1).alive, true);
  assert.strictEqual(save.pending, null);

  const give = setup(5, { life: [4, 1], hands: [['bang'], ['beer']] });
  play(give, 0, 'bang', 1);
  respondWith(give, 1, null);
  assert.strictEqual(P(give, 1).alive, false);

  const none = setup(5, { life: [4, 1], hands: [['bang'], []] });
  play(none, 0, 'bang', 1);
  assert.strictEqual(P(none, 1).alive, false);
  assert.strictEqual(none.pending, null);
});

test('체력이 2 이하로 떨어지면 맥주를 여러 장 써야 한다 (다이너마이트 -3)', () => {
  const room = setup(5, { life: [4, 2], chars: { 1: 'willy' }, hands: [[], ['beer', 'beer']], turn: 0, tables: [[], [C('dynamite')]], deck: [C('bang'), C('bang'), C('missed', 's', 5)] });
  b.endTurn(room, P(room, 0).id);
  assert.strictEqual(room.pending.t, 'dying');
  assert.strictEqual(P(room, 1).life, -1);
  respondWith(room, 1, 'beer');
  assert.strictEqual(room.pending.t, 'dying'); // 아직 0
  respondWith(room, 1, 'beer');
  assert.strictEqual(room.pending, null); // 체력 1이 되어 해결
  assert.strictEqual(P(room, 1).life, 1);
  assert.strictEqual(P(room, 1).alive, true);
});

test('무법자를 쓰러뜨리면 3장 뽑고, 보안관이 부보안관을 쓰러뜨리면 모든 카드를 버린다', () => {
  const room = setup(5, { life: [4, 1], roles: ['sheriff', 'outlaw', 'deputy', 'outlaw', 'renegade'], hands: [['bang'], []] });
  const before = P(room, 0).hand.length - 1;
  play(room, 0, 'bang', 1);
  assert.strictEqual(P(room, 1).alive, false);
  assert.strictEqual(P(room, 0).hand.length, before + 3);

  const dep = setup(5, { life: [4, 4, 1], roles: ['sheriff', 'outlaw', 'deputy', 'outlaw', 'renegade'], hands: [['bang', 'beer', 'beer'], [], []], tables: [[C('mustang')]], turn: 0 });
  P(dep, 0).table.push(C('schofield'));
  play(dep, 0, 'bang', 2);
  assert.strictEqual(P(dep, 2).alive, false);
  assert.strictEqual(P(dep, 0).hand.length, 0);
  assert.strictEqual(P(dep, 0).table.length, 0);
});

test('벌처 샘은 탈락자의 카드를 모두 가져온다', () => {
  const room = setup(5, { life: [4, 1], chars: { 3: 'vulture' }, hands: [['bang'], ['beer', 'missed']], tables: [[], [C('barrel')]] });
  play(room, 0, 'bang', 1);
  barrelOf(room, 1, false); // 배럴은 쓰지 않는다
  respondWith(room, 1, 'missed'); // 막아 봤자 맥주는 쓰지 않음 → 이번엔 직접 포기 흐름으로
  assert.strictEqual(P(room, 1).alive, true);
  P(room, 1).life = 1;
  P(room, 0).table = [C('volcanic')];
  P(room, 0).hand.push(C('bang'));
  play(room, 0, 'bang', 1);
  barrelOf(room, 1, false);
  assert.strictEqual(room.pending.t, 'dying');
  respondWith(room, 1, null);
  assert.strictEqual(P(room, 1).alive, false);
  assert.strictEqual(P(room, 3).hand.length, 2);
  assert.ok(P(room, 3).hand.some((c) => c.key === 'barrel'));
});

test('승리 조건: 보안관 팀 / 무법자 / 배신자', () => {
  // 무법자와 배신자가 모두 쓰러지면 보안관 팀 승리
  const law = setup(4, { life: [4, 4, 1, 1], roles: ['sheriff', 'deputy', 'outlaw', 'renegade'], hands: [['bang', 'bang'], []], tables: [[C('volcanic')]] });
  P(law, 0).table.push(C('schofield'));
  play(law, 0, 'bang', 3);
  assert.strictEqual(law.phase, 'play');
  P(law, 2).life = 1;
  play(law, 0, 'bang', 1 + 1 === 2 ? 2 : 2);
  assert.strictEqual(law.phase, 'over');
  assert.strictEqual(law.winner, 'law');

  // 보안관이 죽고 살아남은 사람이 배신자 한 명이면 배신자 승리
  const ren = setup(4, { life: [1, 4, 1, 4], roles: ['sheriff', 'renegade', 'outlaw', 'outlaw'], turn: 2, hands: [[], [], ['bang', 'bang']] });
  ren.players[1].alive = true;
  [2, 3].forEach((i) => { P(ren, i).alive = false; });
  ren.turn = 1;
  P(ren, 1).hand = [C('bang')];
  play(ren, 1, 'bang', 0);
  assert.strictEqual(ren.phase, 'over');
  assert.strictEqual(ren.winner, 'renegade');

  // 보안관이 죽었는데 무법자가 있으면 무법자 승리
  const out = setup(4, { life: [1, 4, 4, 4], roles: ['sheriff', 'renegade', 'outlaw', 'outlaw'], turn: 2, hands: [[], [], [C('bang')]] });
  P(out, 2).table = [C('schofield')];
  play(out, 2, 'bang', 0);
  assert.strictEqual(out.winner, 'outlaw');
  assert.strictEqual(out.phase, 'over');
  assert.ok(b.viewFor(out, P(out, 0).id).players.every((p) => p.role)); // 끝나면 정체 공개
});

test('바트 캐시디는 체력을 잃을 때마다 뽑고, 엘 그링고는 때린 사람의 손패를 가져온다', () => {
  const bart = setup(5, { chars: { 1: 'bart' }, hands: [['bang']], deck: [C('beer'), C('beer')] });
  play(bart, 0, 'bang', 1);
  assert.strictEqual(P(bart, 1).hand.length, 1);
  const gringo = setup(5, { chars: { 1: 'elgringo' }, hands: [['bang', 'beer']], max: [4, 3] });
  play(gringo, 0, 'bang', 1);
  assert.deepStrictEqual(handKeys(P(gringo, 1)), ['beer']);
  assert.strictEqual(P(gringo, 0).hand.length, 0);
});

test('수지 라파예트: 손패가 비면 바로 1장 뽑는다', () => {
  const room = setup(5, { chars: { 0: 'suzy' }, hands: [['beer']], life: [3], deck: [C('bang')] });
  play(room, 0, 'beer');
  assert.strictEqual(P(room, 0).hand.length, 1);
});

test('키트 카르슨: 3장을 받고 1장을 덱 위로 돌려놓는다', () => {
  const room = setup(5, { turn: 4, deck: [C('bang'), C('beer'), C('panic'), C('missed'), C('bang')] });
  P(room, 4).char = 'kit';
  room.queue = [{ t: 'nextTurn' }];
  P(room, 0).char = 'kit';
  b.run(room);
  assert.strictEqual(room.pending.t, 'kit');
  assert.strictEqual(room.pending.cards.length, 3);
  const give = P(room, 0).hand[0];
  assert.ok(b.choose(room, P(room, 0).id, { card: 99999 }).error);
  assert.deepStrictEqual(b.choose(room, P(room, 0).id, { card: give.id }), {});
  assert.strictEqual(P(room, 0).hand.length, 2);
  assert.strictEqual(room.deck[room.deck.length - 1].id, give.id);
});

test('페드로 라미레즈: 첫 카드를 버린 더미 맨 위에서 가져올 수 있다', () => {
  const pedro = setup(5, { turn: 4, hands: [['beer']] });
  P(pedro, 0).char = 'pedro';
  pedro.discard = [C('panic')];
  pedro.queue = [{ t: 'nextTurn' }];
  b.run(pedro);
  assert.strictEqual(pedro.pending.t, 'drawChoice');
  assert.ok(b.choose(pedro, P(pedro, 0).id, { opt: 'nope' }).error);
  assert.deepStrictEqual(b.choose(pedro, P(pedro, 0).id, { opt: 'discard' }), {});
  assert.ok(P(pedro, 0).hand.some((c) => c.key === 'panic'));
  assert.strictEqual(P(pedro, 0).hand.length, 3); // 기존 1 + 버린 더미 1 + 덱 1

  const deck = setup(5, { turn: 4, hands: [['beer']] });
  P(deck, 0).char = 'pedro';
  deck.discard = [C('panic')];
  deck.queue = [{ t: 'nextTurn' }];
  b.run(deck);
  b.choose(deck, P(deck, 0).id, { opt: 'deck' });
  assert.strictEqual(P(deck, 0).hand.length, 3); // 기존 1 + 덱 2
  assert.ok(!P(deck, 0).hand.some((c) => c.key === 'panic'));
});

test('제시 존스는 다른 사람의 손패에서 뽑을 수 있다', () => {
  const room = setup(5, { turn: 4, hands: [[], ['beer', 'bang']] });
  P(room, 0).char = 'jesse';
  room.queue = [{ t: 'nextTurn' }];
  b.run(room);
  assert.strictEqual(room.pending.t, 'drawChoice');
  assert.deepStrictEqual(room.pending.options, [P(room, 1).id]);
  b.choose(room, P(room, 0).id, { opt: P(room, 1).id });
  assert.strictEqual(P(room, 0).hand.length, 2);
  assert.strictEqual(P(room, 1).hand.length, 1);
});

test('블랙 잭: 두 번째 카드가 ♥/♦면 1장 더', () => {
  const more = setup(5, { turn: 4, deck: [C('bang'), C('bang'), C('beer', 'h', 5), C('missed', 'c', 5)] });
  P(more, 0).char = 'blackjack';
  more.queue = [{ t: 'nextTurn' }];
  b.run(more);
  assert.strictEqual(P(more, 0).hand.length, 3);
  const none = setup(5, { turn: 4, deck: [C('bang'), C('bang'), C('beer', 's', 5), C('missed', 'c', 5)] });
  P(none, 0).char = 'blackjack';
  none.queue = [{ t: 'nextTurn' }];
  b.run(none);
  assert.strictEqual(P(none, 0).hand.length, 2);
});

test('시드 케첨: 카드 2장을 버리고 체력 회복 (죽기 직전에도)', () => {
  const room = setup(5, { chars: { 0: 'sid' }, life: [2], hands: [['bang', 'bang', 'bang']] });
  const [a, c] = P(room, 0).hand;
  assert.ok(b.sid(room, P(room, 0).id, [a.id]).error);
  assert.deepStrictEqual(b.sid(room, P(room, 0).id, [a.id, c.id]), {});
  assert.strictEqual(P(room, 0).life, 3);
  assert.strictEqual(P(room, 0).hand.length, 1);
  assert.ok(b.sid(room, P(room, 1).id, [1, 2]).error);

  const dying = setup(5, { chars: { 1: 'sid' }, life: [4, 1], hands: [['bang'], ['missed', 'missed']] });
  P(dying, 0).table = [C('volcanic')];
  const [m1, m2] = P(dying, 1).hand;
  play(dying, 0, 'bang', 1);
  respondWith(dying, 1, null); // 막지 않음
  assert.strictEqual(dying.pending.t, 'dying');
  assert.deepStrictEqual(b.sid(dying, P(dying, 1).id, [m1.id, m2.id]), {});
  assert.strictEqual(P(dying, 1).life, 1);
  assert.strictEqual(P(dying, 1).alive, true);
});

test('턴 종료: 손패가 체력보다 많으면 줄여야 다음 사람으로 넘어간다', () => {
  const room = setup(5, { life: [2], chars: { 1: 'willy' }, hands: [['bang', 'beer', 'missed', 'panic']] });
  assert.deepStrictEqual(b.endTurn(room, P(room, 0).id), {});
  assert.strictEqual(room.discarding, true);
  assert.strictEqual(room.turn, 0);
  assert.ok(play(room, 0, 'bang', 1).error); // 줄이는 동안엔 카드를 못 낸다
  assert.ok(b.endTurn(room, P(room, 1).id).error);
  b.discardCard(room, P(room, 0).id, P(room, 0).hand[0].id);
  assert.strictEqual(room.turn, 0);
  b.discardCard(room, P(room, 0).id, P(room, 0).hand[0].id);
  assert.strictEqual(room.turn, 1);
  assert.strictEqual(room.discarding, false);
  assert.strictEqual(P(room, 1).hand.length, 2); // 다음 사람이 2장 뽑음
});

test('장비: 같은 장비는 중복 불가, 무기는 교체된다', () => {
  const room = setup(5, { hands: [['barrel', 'barrel', 'schofield', 'remington']] });
  assert.deepStrictEqual(play(room, 0, 'barrel'), {});
  assert.match(play(room, 0, 'barrel').error, /이미/);
  play(room, 0, 'schofield');
  play(room, 0, 'remington');
  assert.strictEqual(P(room, 0).table.filter((c) => DATA.CARDS[c.key].type === 'gun').length, 1);
  assert.strictEqual(b.weaponRange(P(room, 0)), 3);
  assert.ok(room.discard.some((c) => c.key === 'schofield'));
});

test('남의 차례나 대응 중에는 카드를 낼 수 없고, 각자에게 자기 손패만 보인다', () => {
  const room = setup(5, { hands: [['bang', 'bang'], ['beer', 'missed']] });
  assert.ok(play(room, 1, 'beer').error);
  play(room, 0, 'bang', 1);
  assert.ok(play(room, 0, 'bang', 1).error);
  const v0 = b.viewFor(room, P(room, 0).id);
  const v1 = b.viewFor(room, P(room, 1).id);
  assert.strictEqual(v0.mode, 'wait');
  assert.strictEqual(v1.mode, 'respond');
  assert.deepStrictEqual(v1.hand.filter((c) => c.ok).map((c) => c.key), ['missed']);
  assert.strictEqual(v0.players[1].handCount, 2);
  assert.ok(v0.hand.every((c) => c.id !== P(room, 1).hand[0].id));
  assert.strictEqual(v1.pending.who, P(room, 1).id);
});

test('방장 force: 대응할 사람이 없을 때 대신 포기시키고, 자유 시간엔 턴을 넘긴다', () => {
  const room = setup(5, { hands: [['bang'], ['missed']] });
  play(room, 0, 'bang', 1);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(b.force(room, nonHost.id).error);
  assert.deepStrictEqual(b.force(room, room.hostId), {});
  assert.strictEqual(P(room, 1).life, 3);
  const idle = setup(5, { life: [2], hands: [['bang', 'bang', 'bang', 'bang']] });
  b.force(idle, idle.hostId);
  assert.strictEqual(idle.turn, 1);
  assert.strictEqual(P(idle, 0).hand.length, 2);
});

test('끝난 뒤/도중 초기화와 다시 시작', () => {
  const room = setup(5);
  const nonHost = room.players.find((p) => p.id !== room.hostId).id;
  assert.ok(b.backToLobby(room, nonHost).error);
  assert.ok(b.restart(room, nonHost).error);
  const g = room.gameNo;
  assert.deepStrictEqual(b.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, g + 1);
  assert.strictEqual(room.phase, 'play');
  assert.deepStrictEqual(b.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.role === null && p.hand.length === 0));
});

// ---- 무작위로 끝까지 ----

function totalCards(room) {
  const store = room.pending && room.pending.t === 'store' ? room.pending.cards.length : 0;
  return room.deck.length + room.discard.length + store
    + room.players.reduce((n, p) => n + p.hand.length + p.table.length, 0);
}

function botStep(room, rnd) {
  const pd = room.pending;
  const actorId = pd ? pd.who : room.players[room.turn].id;
  const v = b.viewFor(room, actorId);
  const me = room.players.find((p) => p.id === actorId);
  const ok = v.hand.filter((c) => c.ok);
  const must = (r) => assert.deepStrictEqual(r, {}, `${v.mode} ${JSON.stringify(r)}`);
  switch (v.mode) {
    case 'main': {
      if (v.canSid && rnd() < 0.3) {
        const two = me.hand.slice(0, 2).map((c) => c.id);
        must(b.sid(room, actorId, two));
        return;
      }
      if (ok.length && rnd() < 0.8) {
        const card = ok[Math.floor(rnd() * ok.length)];
        let target;
        let pick;
        if (card.targets) {
          target = card.targets[Math.floor(rnd() * card.targets.length)];
          if (card.key === 'panic' || card.key === 'catbalou') {
            const t = room.players.find((p) => p.id === target);
            pick = t.table.length && (t.hand.length === 0 || rnd() < 0.5) ? t.table[Math.floor(rnd() * t.table.length)].id : 'hand';
          }
        }
        must(b.play(room, actorId, card.id, target, pick));
      } else {
        must(b.endTurn(room, actorId));
      }
      return;
    }
    case 'discard':
      must(b.discardCard(room, actorId, me.hand[0].id));
      return;
    case 'barrel':
      must(b.useBarrel(room, actorId, rnd() < 0.7));
      return;
    case 'respond':
      if (ok.length && rnd() < 0.7) must(b.respond(room, actorId, ok[0].id));
      else must(b.respond(room, actorId, null));
      return;
    case 'dying':
      if (ok.length) must(b.respond(room, actorId, ok[0].id));
      else if (v.canSid) must(b.sid(room, actorId, me.hand.slice(0, 2).map((c) => c.id)));
      else must(b.respond(room, actorId, null));
      return;
    case 'store':
      must(b.store(room, actorId, v.pending.cards[Math.floor(rnd() * v.pending.cards.length)].id));
      return;
    case 'drawChoice': {
      const opts = ['deck', ...v.pending.options];
      must(b.choose(room, actorId, { opt: opts[Math.floor(rnd() * opts.length)] }));
      return;
    }
    case 'kit':
      must(b.choose(room, actorId, { card: ok[0].id }));
      return;
    default:
      assert.fail(`예상 못한 모드 ${v.mode} (pending=${JSON.stringify(pd)})`);
  }
}

test('4~7명이 무작위로 끝까지 두어도 오류가 없고 카드는 항상 80장, 대부분 끝난다', () => {
  let finished = 0;
  let total = 0;
  for (const n of [4, 5, 6, 7]) {
    for (let g = 0; g < 25; g++) {
      const room = b.createRoom('F');
      for (let i = 0; i < n; i++) b.addPlayer(room, `p${i}`);
      assert.deepStrictEqual(b.start(room, room.hostId), {});
      let seed = n * 1000 + g + 1;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
      for (let steps = 0; steps < 6000 && room.phase === 'play'; steps++) {
        botStep(room, rnd);
        assert.strictEqual(totalCards(room), 80, `${n}명 ${g}판 ${steps}번째에서 카드 수가 맞지 않아요`);
        for (const p of room.players) {
          assert.ok(p.life <= p.max, '체력이 최대를 넘었어요');
          if (!p.alive) assert.ok(p.hand.length === 0 && p.table.length === 0, '탈락자가 카드를 가지고 있어요');
        }
        assert.ok(room.players.some((p) => p.alive));
        if (room.pending) assert.ok(room.players.find((p) => p.id === room.pending.who).alive, '죽은 사람에게 입력을 기다려요');
      }
      total += 1;
      if (room.phase === 'over') {
        finished += 1;
        assert.ok(['law', 'outlaw', 'renegade'].includes(room.winner));
      }
    }
  }
  assert.ok(finished / total > 0.8, `끝난 판이 너무 적어요: ${finished}/${total}`);
});

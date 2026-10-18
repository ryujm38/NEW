'use strict';
const test = require('node:test');
const assert = require('node:assert');
const m = require('../marble');
const { serializeRoom, deserializeRoom } = require('../hub');

const W = (man) => man * m.MAN; // 만원 → 내부 단위(천원)

function mk(n = 3, opts = {}) {
  const room = m.createRoom('MB');
  for (let i = 0; i < n; i++) m.addPlayer(room, `p${i}`);
  if (opts.maxRounds !== undefined) m.setSetting(room, room.hostId, 'maxRounds', opts.maxRounds);
  assert.deepStrictEqual(m.start(room, room.hostId), {});
  room.keyDeck = [...m.KEYS].reverse(); // 필요하면 테스트가 맨 위 카드를 직접 정한다
  return room;
}
const cur = (room) => room.players[room.turn];
const P = (room, i) => room.players[i];
const dice = (room, ...pairs) => { room.rigged = pairs; };
const roll = (room) => m.roll(room, cur(room).id);
const own = (room, tile, player, level = 0) => { room.owners[tile] = { owner: player.id, level }; };
const topKey = (room, id) => { room.keyDeck.push(m.KEYS.find((k) => k.id === id)); };
const T = (name) => m.TILES.find((t) => t.name === name).i;
const START = m.START_CASH;

test('보드: 원판과 같은 40칸 순서와 땅 카드 값', () => {
  assert.strictEqual(m.TILES.length, 40);
  const count = (t) => m.TILES.filter((x) => x.type === t).length;
  assert.deepStrictEqual(
    [count('city'), count('special'), count('ride'), count('key'), count('island'), count('fundpay'), count('fundcollect'), count('space'), count('start')],
    [23, 3, 3, 6, 1, 1, 1, 1, 1],
  );
  assert.deepStrictEqual([0, 10, 20, 30].map((i) => m.TILES[i].type), ['start', 'island', 'fundcollect', 'space']);
  const names = m.TILES.map((t) => t.name);
  assert.deepStrictEqual(names.slice(0, 11), ['출발', '타이베이', '황금열쇠', '베이징', '마닐라', '제주도', '싱가포르', '황금열쇠', '카이로', '이스탄불', '무인도']);
  assert.deepStrictEqual(names.slice(31), ['도쿄', '컬럼비아호', '파리', '로마', '황금열쇠', '런던', '뉴욕', '사회복지기금 접수처', '서울']);
  assert.strictEqual(m.TILES[T('서울')].price, W(100));
  assert.strictEqual(m.TILES[T('서울')].toll, W(200));
  assert.deepStrictEqual(m.TILES[T('타이베이')].tolls, [2, 10, 30, 90, 250]); // 2천, 1만, 3만, 9만, 25만
  assert.strictEqual(m.KEYS.length, 30);
  assert.strictEqual(new Set(m.KEYS.map((k) => k.id)).size, 30);
});

test('시작: 2~6명, 3명 이상은 293만, 2명은 2배. 설정은 방장만 대기실에서', () => {
  const one = m.createRoom('X');
  m.addPlayer(one, 'a');
  assert.ok(m.start(one, one.hostId).error);
  const full = m.createRoom('Y');
  for (let i = 0; i < 6; i++) m.addPlayer(full, `p${i}`);
  assert.ok(m.addPlayer(full, 'p7').error);
  assert.ok(m.setSetting(full, full.players[1].id, 'maxRounds', 20).error);
  assert.ok(m.setSetting(full, full.hostId, 'maxRounds', 7).error);
  assert.deepStrictEqual(m.setSetting(full, full.hostId, 'maxRounds', 30), {});
  assert.deepStrictEqual(m.start(full, full.hostId), {});
  assert.ok(full.players.every((p) => p.cash === W(293) && p.pos === 0));
  assert.strictEqual(new Set(full.players.map((p) => p.color)).size, 6);
  assert.ok(m.setSetting(full, full.hostId, 'maxRounds', 0).error); // 시작 후에는 불가
  const two = mk(2);
  assert.ok(two.players.every((p) => p.cash === W(586)));
});

test('이동: 주사위 합만큼 걷고, 이동 경로가 기록되며, 출발을 지나면 월급 20만', () => {
  const room = mk(3);
  dice(room, [3, 4]);
  roll(room);
  assert.strictEqual(P(room, 0).pos, 7);
  assert.deepStrictEqual(room.dice, [3, 4]);
  assert.deepStrictEqual(room.move.dice, [3, 4]);
  assert.deepStrictEqual(room.move.segs[0], { k: 'walk', from: 0, n: 7 });
  assert.strictEqual(room.move.who, P(room, 0).id);

  const room2 = mk(3);
  cur(room2).pos = 37;
  dice(room2, [2, 4]); // 43 → 3번(베이징), 출발을 지나 월급
  roll(room2);
  assert.strictEqual(P(room2, 0).pos, 3);
  assert.strictEqual(P(room2, 0).cash, START + W(20));
  const room3 = mk(3);
  cur(room3).pos = 36;
  dice(room3, [1, 3]); // 정확히 출발에 도착
  roll(room3);
  assert.strictEqual(P(room3, 0).pos, 0);
  assert.strictEqual(P(room3, 0).cash, START + W(20));
});

test('내 차례가 아니거나 처리할 일이 남아 있으면 굴릴 수 없다', () => {
  const room = mk(3);
  assert.ok(m.roll(room, P(room, 1).id).error);
  dice(room, [1, 3]); // 4번 마닐라: 구입 선택
  roll(room);
  assert.strictEqual(room.pending.t, 'buy');
  assert.ok(m.roll(room, P(room, 0).id).error);
  assert.ok(m.buy(room, P(room, 1).id).error);
});

test('빈 땅: 구입하면 돈이 빠지고 내 땅이 된다. 건너뛰면 그대로. 돈이 모자라면 묻지 않는다', () => {
  const room = mk(3);
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(m.TILES[4].name, '마닐라');
  assert.deepStrictEqual(m.buy(room, P(room, 0).id), {});
  assert.strictEqual(P(room, 0).cash, START - W(8));
  assert.deepStrictEqual(room.owners[4], { owner: P(room, 0).id, level: 0 });
  assert.strictEqual(cur(room).id, P(room, 1).id);

  const skip = mk(3);
  dice(skip, [1, 3]);
  roll(skip);
  assert.deepStrictEqual(m.skip(skip, P(skip, 0).id), {});
  assert.strictEqual(skip.owners[4], undefined);

  const poor = mk(3);
  cur(poor).cash = W(5);
  dice(poor, [1, 3]);
  roll(poor);
  assert.strictEqual(poor.pending, null);
  assert.strictEqual(cur(poor).id, P(poor, 1).id);
});

test('통행료: 원판 카드 값 (땅 → 별장1 → 별장2 → 빌딩 → 호텔), 특수지역/탈것은 고정', () => {
  const room = mk(3);
  const [a] = room.players;
  const tokyo = T('도쿄');
  own(room, tokyo, a, 0);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((l) => { room.owners[tokyo].level = l; return m.tollOf(room, tokyo); }), [26, 130, 390, 900, 1270]);
  own(room, T('제주도'), a);
  assert.strictEqual(m.tollOf(room, T('제주도')), W(30));
  own(room, T('컬럼비아호'), a);
  assert.strictEqual(m.tollOf(room, T('컬럼비아호')), W(40));
});

test('남의 땅에 도착하면 통행료를 내고 주인이 받는다. 우대권이 있으면 한 번 면제', () => {
  const room = mk(3);
  own(room, 8, P(room, 1), 2); // 카이로 별장 2채: 9만
  dice(room, [3, 5]);
  roll(room);
  assert.strictEqual(P(room, 0).cash, START - W(9));
  assert.strictEqual(P(room, 1).cash, START + W(9));

  const pass = mk(3);
  own(pass, 8, P(pass, 1), 2);
  P(pass, 0).pass = 1;
  dice(pass, [3, 5]);
  roll(pass);
  assert.strictEqual(P(pass, 0).cash, START);
  assert.strictEqual(P(pass, 0).pass, 0);
});

test('내 도시에서는 별장1 → 별장2 → 빌딩 → 호텔을 하나씩 지을 수 있고 비용이 맞다', () => {
  const room = mk(3);
  own(room, 4, P(room, 0)); // 마닐라: 별장 5만, 빌딩 15만, 호텔 25만
  const expect = [W(5), W(5), W(15), W(25)];
  for (let level = 0; level < 4; level++) {
    cur(room).pos = 0;
    dice(room, [1, 3]);
    roll(room);
    assert.strictEqual(room.pending.t, 'build');
    const before = P(room, 0).cash;
    assert.strictEqual(m.viewFor(room, P(room, 0).id).pending.cost, expect[level]);
    assert.deepStrictEqual(m.build(room, P(room, 0).id), {});
    assert.strictEqual(before - P(room, 0).cash, expect[level]);
    assert.strictEqual(room.owners[4].level, level + 1);
    room.turn = 0;
  }
  cur(room).pos = 0;
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(room.pending, null); // 호텔이면 끝

  const sp = mk(3);
  own(sp, 5, P(sp, 0)); // 제주도는 건물 불가
  dice(sp, [2, 3]);
  roll(sp);
  assert.strictEqual(sp.pending, null);
});

test('건설할 돈이 없으면 묻지 않고, 건너뛸 수도 있다', () => {
  const room = mk(3);
  own(room, 4, P(room, 0));
  cur(room).cash = W(3);
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(room.pending, null);
  const room2 = mk(3);
  own(room2, 4, P(room2, 0));
  dice(room2, [1, 3]);
  roll(room2);
  assert.deepStrictEqual(m.skip(room2, P(room2, 0).id), {});
  assert.strictEqual(room2.owners[4].level, 0);
});

test('더블이면 한 번 더, 3번 연속이면 무인도', () => {
  const room = mk(3);
  const first = cur(room).id;
  dice(room, [1, 1], [2, 2]);
  roll(room);
  if (room.pending) m.skip(room, first);
  assert.strictEqual(cur(room).id, first);
  roll(room);
  if (room.pending) m.skip(room, first);
  assert.strictEqual(cur(room).id, first);
  dice(room, [3, 3]);
  roll(room);
  const p = room.players.find((x) => x.id === first);
  assert.strictEqual(p.jail, true);
  assert.strictEqual(p.pos, m.ISLAND);
  assert.strictEqual(room.move.segs[0].k, 'jump');
  assert.notStrictEqual(cur(room).id, first);
});

test('무인도: 3턴 쉬고, 더블이나 무전기 카드로 탈출', () => {
  const esc = mk(3);
  const b = cur(esc);
  b.jail = true; b.pos = 10;
  assert.ok(m.useEscape(esc, b.id).error);
  b.escape = 1;
  esc.keyDeck = esc.keyDeck.filter((k) => k.id !== 'escape');
  assert.deepStrictEqual(m.useEscape(esc, b.id), {});
  assert.strictEqual(b.escape, 0);
  assert.strictEqual(b.jail, false);
  assert.ok(esc.keyDiscard.some((k) => k.id === 'escape')); // 쓴 카드는 덱으로 돌아감

  const dbl = mk(3);
  const c = cur(dbl);
  c.jail = true; c.pos = 10;
  dice(dbl, [2, 3]);
  roll(dbl);
  assert.strictEqual(c.jail, true);
  assert.strictEqual(c.jailTurns, 1);
  assert.strictEqual(c.pos, 10);
  assert.notStrictEqual(cur(dbl).id, c.id);
  dbl.turn = dbl.players.indexOf(c);
  dice(dbl, [4, 4]);
  roll(dbl);
  assert.strictEqual(c.jail, false);
  assert.strictEqual(c.pos, 18);
  assert.strictEqual(dbl.extra, false); // 탈출 더블은 한 번 더 굴리지 않음

  const wait = mk(3);
  const d = cur(wait);
  d.jail = true; d.pos = 10; d.jailTurns = 3;
  dice(wait, [1, 3]);
  roll(wait);
  assert.strictEqual(d.jail, false);
  assert.strictEqual(d.pos, 14);
});

test('황금열쇠: 돈, 건물세, 이동, 무인도, 보관 카드, 생일', () => {
  const run = (id, setup = () => {}) => {
    const room = mk(3);
    setup(room);
    topKey(room, id);
    dice(room, [1, 1]); // 2번 칸 = 황금열쇠 (더블이지만 테스트에는 상관없음)
    roll(room);
    return room;
  };
  assert.strictEqual(run('nobel').players[0].cash, START + W(30));
  assert.strictEqual(run('abroad').players[0].cash, START - W(10));
  const tax = run('incomeTax', (r) => { own(r, 1, P(r, 0), 4); own(r, 3, P(r, 0), 2); own(r, 4, P(r, 0), 3); });
  assert.strictEqual(tax.players[0].cash, START - W(15 + 3 * 2 + 10));
  assert.strictEqual(run('repair').players[0].cash, START); // 건물이 없으면 0
  const bday = run('birthday');
  assert.deepStrictEqual(bday.players.map((p) => p.cash), [START + W(2), START - W(1), START - W(1)]);
  assert.strictEqual(run('escape').players[0].escape, 1);
  assert.strictEqual(run('pass').players[0].pass, 1);
  const isl = run('island');
  assert.strictEqual(isl.players[0].jail, true);
  assert.strictEqual(isl.players[0].pos, 10);
  const back = run('back3'); // 2번 → 39번 서울(구입 선택)
  assert.strictEqual(back.players[0].pos, 39);
  assert.deepStrictEqual(back.move.segs.map((s) => s.k), ['walk', 'walk']);
  assert.strictEqual(back.move.segs[1].n, -3);
  const seoul = run('seoul');
  assert.strictEqual(seoul.players[0].pos, 39);
  assert.strictEqual(seoul.pending.t, 'buy');
  const hw = run('highway');
  assert.strictEqual(hw.players[0].pos, 0);
  assert.strictEqual(hw.players[0].cash, START + W(20));
  const world = run('world', (r) => { r.fund = W(30); });
  assert.strictEqual(world.players[0].pos, 2);
  assert.strictEqual(world.players[0].cash, START + W(20) + W(30));
  assert.strictEqual(world.fund, 0);
  const space = run('space');
  assert.strictEqual(space.players[0].pos, 30);
  assert.strictEqual(space.players[0].warp, true);
  assert.strictEqual(space.players[0].freeWarp, true);
  const half = run('halfSale', (r) => { own(r, 4, P(r, 0), 0); own(r, 39, P(r, 0), 0); });
  assert.strictEqual(half.owners[39], undefined); // 가장 비싼 서울을 반값에
  assert.ok(half.owners[4]);
  assert.strictEqual(half.players[0].cash, START + W(50));
});

test('황금열쇠 크루즈: 퀸 엘리자베스호 주인에게 배삯을 내고 베이징까지 (출발을 지나 월급)', () => {
  const room = mk(3);
  own(room, T('퀸 엘리자베스호'), P(room, 1));
  topKey(room, 'cruise');
  dice(room, [1, 1]);
  roll(room);
  const a = P(room, 0);
  assert.strictEqual(a.pos, T('베이징'));
  assert.strictEqual(P(room, 1).cash, START + W(25));
  assert.strictEqual(a.cash, START - W(25) + W(20));
  assert.strictEqual(room.pending.t, 'buy');
  assert.deepStrictEqual(room.move.segs.map((s) => s.k), ['walk', 'walk', 'walk']);
});

test('사회복지기금: 접수처에서 15만을 내면 쌓이고, 수령처에서 전부 가져간다', () => {
  const room = mk(3);
  cur(room).pos = 34;
  dice(room, [2, 2]); // 38번 접수처 (더블이라 한 번 더)
  roll(room);
  assert.strictEqual(room.fund, W(15));
  assert.strictEqual(P(room, 0).cash, START - W(15));
  const a = cur(room);
  a.pos = 16;
  dice(room, [1, 3]); // 20번 수령처
  roll(room);
  assert.strictEqual(room.fund, 0);
  assert.strictEqual(a.cash, START);
});

test('우주여행: 다음 차례에 원하는 칸으로 날아가고, 컬럼비아호 주인이 남이면 탑승료 20만', () => {
  const room = mk(3);
  const a = cur(room);
  own(room, m.COLUMBIA, P(room, 2));
  a.pos = 26;
  dice(room, [1, 3]); // 30번 우주여행
  roll(room);
  assert.strictEqual(a.warp, true);
  room.turn = room.players.indexOf(a) + 1;
  for (let k = 0; k < 2; k++) { // 나머지 둘이 한 번씩
    const c = cur(room);
    dice(room, [1, 2]);
    roll(room);
    if (room.pending && room.pending.t !== 'warp') m.skip(room, c.id);
  }
  assert.strictEqual(cur(room).id, a.id);
  assert.strictEqual(room.pending.t, 'warp');
  assert.ok(m.roll(room, a.id).error);
  assert.ok(m.warp(room, P(room, 1).id, 3).error);
  assert.ok(m.warp(room, a.id, 30).error);
  assert.ok(m.warp(room, a.id, 99).error);
  const cash = a.cash;
  const owner = P(room, 2).cash;
  assert.deepStrictEqual(m.warp(room, a.id, 3), {}); // 30 → 3: 출발을 지나 월급
  assert.strictEqual(a.pos, 3);
  assert.strictEqual(a.cash, cash - W(20) + W(20));
  assert.strictEqual(P(room, 2).cash, owner + W(20));
  assert.deepStrictEqual(room.move.segs, [{ k: 'fly', from: 30, to: 3 }]);
  assert.strictEqual(a.warp, false);
});

test('빚: 돈이 모자라면 땅을 팔아 갚고, 갚으면 이어서 진행한다', () => {
  const room = mk(3);
  const [a, b] = [P(room, 0), P(room, 1)];
  own(room, 39, b); // 서울: 통행료 200만
  own(room, 4, a); // 마닐라 8만 → 판매 4만
  own(room, 37, a, 4); // 뉴욕 호텔: 35+20+20+60+100 = 235만 → 판매 117만5천
  a.cash = W(100);
  a.pos = 35;
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(room.pending.t, 'debt');
  assert.strictEqual(room.pending.amount, W(200));
  assert.ok(m.sell(room, b.id, 4).error);
  assert.ok(m.sell(room, a.id, 12).error);
  assert.deepStrictEqual(m.sell(room, a.id, 37), {});
  assert.strictEqual(room.pending, null);
  assert.strictEqual(a.cash, W(100) + 1175 - W(200));
  assert.strictEqual(b.cash, START + W(200));
  assert.ok(room.owners[4]);
});

test('빚을 못 갚으면 파산: 땅은 은행으로, 현금은 채권자에게, 한 명 남으면 끝', () => {
  const room = mk(2);
  const [a, b] = [P(room, 0), P(room, 1)];
  own(room, 39, b);
  own(room, 4, a);
  a.cash = W(5);
  a.pos = 35;
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(a.bankrupt, true);
  assert.strictEqual(room.owners[4], undefined);
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds, [b.id]);
  assert.strictEqual(b.cash, m.START_CASH_2P + W(5));
});

test('스스로 파산을 선언할 수 있고, 셋 이상이면 게임은 계속된다', () => {
  const room = mk(3);
  const [a, b] = [P(room, 0), P(room, 1)];
  own(room, 39, b);
  own(room, 37, a, 4);
  a.cash = W(100);
  a.pos = 35;
  a.escape = 1;
  room.keyDeck = room.keyDeck.filter((k) => k.id !== 'escape');
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(room.pending.t, 'debt');
  assert.ok(m.declareBankrupt(room, b.id).error);
  assert.deepStrictEqual(m.declareBankrupt(room, a.id), {});
  assert.strictEqual(a.bankrupt, true);
  assert.strictEqual(room.owners[37], undefined);
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(b.cash, START + W(100));
  assert.ok(room.keyDiscard.some((k) => k.id === 'escape')); // 가지고 있던 카드는 덱으로
  for (let i = 0; i < 6; i++) {
    const c = cur(room);
    assert.strictEqual(c.bankrupt, false);
    dice(room, [1, 2]);
    roll(room);
    if (room.pending && room.pending.who === c.id && room.pending.t !== 'debt') m.skip(room, c.id);
    if (room.phase !== 'play') break;
  }
});

test('바퀴 수가 차면 자산(현금+땅/건물)이 가장 많은 사람이 이긴다', () => {
  const room = mk(2, { maxRounds: 15 });
  room.settings.maxRounds = 2;
  for (let i = 0; i < 8 && room.phase === 'play'; i++) {
    const c = cur(room);
    dice(room, [1, 2]);
    roll(room);
    if (room.pending && ['buy', 'build'].includes(room.pending.t)) m.skip(room, c.id);
  }
  assert.strictEqual(room.phase, 'over');
  const best = Math.max(...room.players.map((p) => m.netWorth(room, p)));
  assert.ok(room.winnerIds.every((id) => m.netWorth(room, room.players.find((p) => p.id === id)) === best));
});

test('방장 force: 굴리기/선택을 대신 처리한다', () => {
  const room = mk(3);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(m.force(room, nonHost.id).error);
  assert.deepStrictEqual(m.force(room, room.hostId), {});
  assert.ok(room.dice);
  if (room.pending && room.pending.t !== 'debt') {
    assert.deepStrictEqual(m.force(room, room.hostId), {});
  }
});

test('초기화와 다시 시작', () => {
  const room = mk(3);
  const nonHost = room.players.find((p) => p.id !== room.hostId).id;
  assert.ok(m.backToLobby(room, nonHost).error);
  const g = room.gameNo;
  assert.deepStrictEqual(m.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, g + 1);
  assert.ok(room.players.every((p) => p.cash === START));
  assert.deepStrictEqual(m.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
});

test('저장했다 되살려도(서버 재시작) 보관 카드가 겹치지 않는다', () => {
  let room = mk(3);
  const a = cur(room);
  a.jail = true; a.pos = 10; a.escape = 1;
  room.keyDeck = room.keyDeck.filter((k) => k.id !== 'escape');
  room = deserializeRoom(serializeRoom(room));
  assert.deepStrictEqual(m.useEscape(room, cur(room).id), {});
  const ids = [...room.keyDeck, ...room.keyDiscard].map((k) => k.id);
  assert.strictEqual(ids.length, new Set(ids).size);
});

// ---- 무작위로 끝까지 ----

test('2~6명이 무작위로 끝까지 두면 반드시 끝나고 상태가 깨지지 않는다', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    for (let g = 0; g < 25; g++) {
      const room = mk(n, { maxRounds: 15 });
      room.keyDeck = require('../common').shuffle(room.keyDeck);
      let lastSeq = 0;
      for (let step = 0; step < 6000 && room.phase === 'play'; step++) {
        const pd = room.pending;
        const id = pd ? pd.who : cur(room).id;
        const v = m.viewFor(room, id);
        const me = room.players.find((p) => p.id === id);
        const must = (r) => assert.deepStrictEqual(r, {}, `${v.mode} ${JSON.stringify(r)}`);
        switch (v.mode) {
          case 'roll':
            if (me.jail && me.escape > 0 && Math.random() < 0.5) must(m.useEscape(room, id));
            must(m.roll(room, id));
            break;
          case 'buy': must(Math.random() < 0.8 ? m.buy(room, id) : m.skip(room, id)); break;
          case 'build': must(Math.random() < 0.7 ? m.build(room, id) : m.skip(room, id)); break;
          case 'debt': {
            const mine = v.tiles.filter((t) => t.owner === id);
            if (mine.length && Math.random() < 0.9) must(m.sell(room, id, mine[0].i));
            else must(m.declareBankrupt(room, id));
            break;
          }
          case 'warp': must(m.warp(room, id, (me.pos + 1 + Math.floor(Math.random() * 39)) % 40)); break;
          default: assert.fail(`예상 못한 모드 ${v.mode}`);
        }
        if (room.move && room.move.seq !== lastSeq) {
          // 기록된 경로를 따라가면 실제 위치와 같아야 한다 (화면 애니메이션이 이 기록을 쓴다)
          lastSeq = room.move.seq;
          const mover = room.players.find((p) => p.id === room.move.who);
          let pos = room.move.segs.length ? room.move.segs[0].from : mover.pos;
          for (const s of room.move.segs) {
            assert.strictEqual(s.from, pos, '경로가 끊겼어요');
            pos = s.k === 'walk' ? (((pos + s.n) % 40) + 40) % 40 : s.to;
          }
          if (!mover.bankrupt) assert.strictEqual(pos, mover.pos, '경로 끝과 실제 위치가 달라요');
        }
        for (const p of room.players) {
          if (!p.bankrupt) assert.ok(p.cash >= 0, `${p.name} 돈이 음수 ${p.cash}`);
          assert.ok(p.pos >= 0 && p.pos < 40);
        }
        for (const [i, o] of Object.entries(room.owners)) {
          assert.ok(!room.players.find((p) => p.id === o.owner).bankrupt, '파산한 사람이 땅을 가지고 있어요');
          assert.ok(o.level >= 0 && o.level <= 4 && (m.TILES[i].type === 'city' || o.level === 0));
        }
        const held = room.players.reduce((s, p) => s + p.escape + p.pass, 0);
        assert.strictEqual(room.keyDeck.length + room.keyDiscard.length + held, 30, '황금열쇠 수가 맞지 않아요');
      }
      assert.strictEqual(room.phase, 'over', `${n}명 ${g}판이 끝나지 않았어요`);
      assert.ok(room.winnerIds.length >= 1);
    }
  }
});

test('예전 32칸 규칙으로 저장된 진행 중인 방은 대기실로 돌아간다', () => {
  const room = mk(3);
  delete room.v;
  room.settings.maxRounds = 50;
  room.players[0].pos = 31;
  const v = m.viewFor(room, room.hostId);
  assert.strictEqual(v.phase, 'lobby');
  assert.strictEqual(room.settings.maxRounds, 20);
  assert.deepStrictEqual(m.start(room, room.hostId), {});
  assert.ok(room.players.every((p) => p.pos === 0));
  const fresh = mk(3);
  m.viewFor(fresh, fresh.hostId);
  assert.strictEqual(fresh.phase, 'play'); // 새 방은 그대로
});

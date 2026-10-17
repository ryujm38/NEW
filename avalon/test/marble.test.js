'use strict';
const test = require('node:test');
const assert = require('node:assert');
const m = require('../marble');

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
const tileOf = (name) => m.TILES.find((t) => t.name === name).i;

test('보드: 32칸, 도시 20, 관광지 3, 열쇠 4, 모서리 종류, 그룹 구성', () => {
  assert.strictEqual(m.TILES.length, 32);
  const count = (t) => m.TILES.filter((x) => x.type === t).length;
  assert.deepStrictEqual([count('city'), count('tour'), count('key'), count('island'), count('fundpay'), count('fundcollect'), count('space'), count('start')], [20, 3, 4, 1, 1, 1, 1, 1]);
  assert.deepStrictEqual([0, 8, 16, 24].map((i) => m.TILES[i].type), ['start', 'island', 'fundcollect', 'space']);
  assert.strictEqual(Object.values(m.GROUPS).reduce((n, g) => n + g.length, 0), 20);
  assert.ok(Object.values(m.GROUPS).every((g) => g.length >= 2 && g.length <= 3));
  assert.strictEqual(new Set(m.TILES.map((t) => t.i)).size, 32);
  const prices = m.TILES.filter((t) => t.type === 'city').map((t) => t.price);
  assert.deepStrictEqual(prices, prices.slice().sort((a, b) => a - b)); // 갈수록 비싸다
});

test('시작: 2~6명, 모두 300만, 설정은 방장만 대기실에서', () => {
  const one = m.createRoom('X');
  m.addPlayer(one, 'a');
  assert.ok(m.start(one, one.hostId).error);
  const full = m.createRoom('Y');
  for (let i = 0; i < 6; i++) m.addPlayer(full, `p${i}`);
  assert.ok(m.addPlayer(full, 'p7').error);
  assert.ok(m.setSetting(full, full.players[1].id, 'maxRounds', 20).error);
  assert.ok(m.setSetting(full, full.hostId, 'maxRounds', 7).error);
  assert.deepStrictEqual(m.setSetting(full, full.hostId, 'maxRounds', 20), {});
  assert.deepStrictEqual(m.start(full, full.hostId), {});
  assert.ok(full.players.every((p) => p.cash === 300 && p.pos === 0));
  assert.strictEqual(new Set(full.players.map((p) => p.color)).size, 6);
  assert.ok(m.setSetting(full, full.hostId, 'maxRounds', 0).error); // 시작 후에는 불가
});

test('이동: 주사위 합만큼 가고, 시작을 지나면 월급 20만', () => {
  const room = mk(2);
  dice(room, [3, 4]);
  roll(room);
  assert.strictEqual(P(room, 0).pos, 7);
  assert.deepStrictEqual(room.dice, [3, 4]);
  const room2 = mk(2);
  cur(room2).pos = 30;
  dice(room2, [1, 3]); // 34 → 2번 칸(홍콩), 시작을 지나 월급
  roll(room2);
  assert.strictEqual(P(room2, 0).pos, 2);
  assert.strictEqual(P(room2, 0).cash, 320);
  const room3 = mk(2);
  cur(room3).pos = 28;
  dice(room3, [1, 3]); // 정확히 시작에 도착
  roll(room3);
  assert.strictEqual(P(room3, 0).pos, 0);
  assert.strictEqual(P(room3, 0).cash, 320);
});

test('내 차례가 아니거나 처리할 일이 남아 있으면 굴릴 수 없다', () => {
  const room = mk(2);
  assert.ok(m.roll(room, P(room, 1).id).error);
  dice(room, [1, 3]); // 4번 칸(마닐라): 구입 선택이 뜬다
  roll(room);
  assert.strictEqual(room.pending.t, 'buy');
  assert.ok(m.roll(room, P(room, 0).id).error);
  assert.ok(m.buy(room, P(room, 1).id).error);
});

test('빈 도시: 구입하면 돈이 빠지고 내 땅이 되고, 건너뛰면 그대로. 돈이 모자라면 묻지 않는다', () => {
  const room = mk(2);
  dice(room, [1, 3]);
  roll(room);
  const tile = m.TILES[4]; // 4번 마닐라 8만
  assert.strictEqual(tile.name, '마닐라');
  assert.deepStrictEqual(m.buy(room, P(room, 0).id), {});
  assert.strictEqual(P(room, 0).cash, 300 - 8);
  assert.deepStrictEqual(room.owners[4], { owner: P(room, 0).id, level: 0 });
  assert.strictEqual(cur(room).id, P(room, 1).id); // 턴이 넘어감

  const skip = mk(2);
  dice(skip, [1, 3]);
  roll(skip);
  assert.deepStrictEqual(m.skip(skip, P(skip, 0).id), {});
  assert.strictEqual(skip.owners[4], undefined);

  const poor = mk(2);
  cur(poor).cash = 5;
  dice(poor, [1, 3]);
  roll(poor);
  assert.strictEqual(poor.pending, null); // 8만짜리를 5만으로는 못 사니 바로 다음 사람
  assert.strictEqual(cur(poor).id, P(poor, 1).id);
});

test('통행료: 땅 0.2배, 건물이 오를수록 비싸고, 한 그룹을 독점하면 2배', () => {
  const room = mk(2);
  const [a] = room.players;
  own(room, 31, a, 0); // 서울 50만
  assert.strictEqual(m.tollOf(room, 31), 10);
  room.owners[31].level = 1;
  assert.strictEqual(m.tollOf(room, 31), 30);
  room.owners[31].level = 2;
  assert.strictEqual(m.tollOf(room, 31), 70);
  room.owners[31].level = 3;
  assert.strictEqual(m.tollOf(room, 31), 150);
  room.owners[31].level = 0;
  own(room, 28, a); own(room, 30, a); // 그룹 H 독점
  assert.strictEqual(m.hasMonopoly(room, a.id, 'H'), true);
  assert.strictEqual(m.tollOf(room, 31), 20);
  delete room.owners[28];
  assert.strictEqual(m.tollOf(room, 31), 10);
});

test('남의 도시에 도착하면 통행료를 내고 주인이 받는다', () => {
  const room = mk(2);
  own(room, 7, P(room, 1)); // 카이로 10만 → 통행료 2
  dice(room, [3, 4]);
  roll(room);
  assert.strictEqual(P(room, 0).cash, 298);
  assert.strictEqual(P(room, 1).cash, 302);
});

test('관광지 통행료는 가진 개수에 따라 10 → 20 → 40', () => {
  const room = mk(2);
  own(room, 5, P(room, 1));
  assert.strictEqual(m.tollOf(room, 5), 10);
  own(room, 14, P(room, 1));
  assert.strictEqual(m.tollOf(room, 5), 20);
  own(room, 22, P(room, 1));
  assert.strictEqual(m.tollOf(room, 14), 40);
  dice(room, [2, 3]); // 5번 제주도
  roll(room);
  assert.strictEqual(P(room, 0).cash, 260);
});

test('내 도시에서는 별장→빌딩→호텔을 지을 수 있고 비용이 맞다', () => {
  const room = mk(2);
  own(room, 4, P(room, 0)); // 마닐라 8만: 별장4, 빌딩8, 호텔12
  const expect = [[4, 'build'], [8, 'build'], [12, 'build']];
  for (let level = 0; level < 3; level++) {
    cur(room).pos = 0;
    dice(room, [1, 3]);
    roll(room);
    assert.strictEqual(room.pending.t, 'build');
    const before = P(room, 0).cash;
    assert.strictEqual(m.viewFor(room, P(room, 0).id).pending.cost, expect[level][0]);
    assert.deepStrictEqual(m.build(room, P(room, 0).id), {});
    assert.strictEqual(before - P(room, 0).cash, expect[level][0]);
    assert.strictEqual(room.owners[4].level, level + 1);
    room.turn = 0; // 같은 사람이 계속 시험
  }
  cur(room).pos = 0;
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(room.pending, null); // 호텔이 있으면 더 지을 수 없다
});

test('건설할 돈이 없으면 묻지 않고, 건너뛸 수도 있다', () => {
  const room = mk(2);
  own(room, 4, P(room, 0));
  cur(room).cash = 3;
  dice(room, [1, 3]);
  roll(room);
  assert.strictEqual(room.pending, null);
  const room2 = mk(2);
  own(room2, 4, P(room2, 0));
  dice(room2, [1, 3]);
  roll(room2);
  assert.deepStrictEqual(m.skip(room2, P(room2, 0).id), {});
  assert.strictEqual(room2.owners[4].level, 0);
});

test('인수: 통행료를 낸 뒤 (땅+건물)의 2배를 내면 내 것이 된다. 호텔은 불가', () => {
  const room = mk(2);
  own(room, 7, P(room, 1), 1); // 카이로 10만 + 별장 5만 = 15만 → 인수 30만
  dice(room, [3, 4]);
  roll(room);
  assert.strictEqual(room.pending.t, 'takeover');
  assert.strictEqual(room.pending.cost, 30);
  const tollPaid = P(room, 0).cash;
  const sellerBefore = P(room, 1).cash;
  assert.deepStrictEqual(m.takeover(room, P(room, 0).id), {});
  assert.strictEqual(P(room, 0).cash, tollPaid - 30);
  assert.strictEqual(P(room, 1).cash, sellerBefore + 30);
  assert.strictEqual(room.owners[7].owner, P(room, 0).id);
  assert.strictEqual(room.owners[7].level, 1); // 건물은 그대로

  const hotel = mk(2);
  own(hotel, 7, P(hotel, 1), 3);
  dice(hotel, [3, 4]);
  roll(hotel);
  assert.strictEqual(hotel.pending, null);

  const poor = mk(2);
  own(poor, 7, P(poor, 1), 0);
  cur(poor).cash = 20; // 인수 비용 20만... 통행료 2만 내면 18만이라 못 산다
  dice(poor, [3, 4]);
  roll(poor);
  assert.strictEqual(poor.pending, null);
});

test('더블이면 한 번 더, 3번 연속이면 무인도', () => {
  const room = mk(2);
  const first = cur(room).id;
  dice(room, [1, 1], [2, 2]);
  roll(room);
  assert.strictEqual(cur(room).id, first);
  if (room.pending) m.skip(room, first);
  assert.strictEqual(cur(room).id, first); // 한 번 더
  roll(room);
  if (room.pending) m.skip(room, first);
  assert.strictEqual(cur(room).id, first);
  dice(room, [3, 3]);
  roll(room);
  assert.strictEqual(room.players.find((p) => p.id === first).jail, true);
  assert.strictEqual(room.players.find((p) => p.id === first).pos, 8);
  assert.notStrictEqual(cur(room).id, first); // 무인도에 갇혀 턴 종료
});

test('무인도: 갇히면 벌금/탈출권/더블/3턴 후에 나온다', () => {
  const room = mk(2);
  const a = cur(room);
  a.pos = 8;
  a.jail = true;
  a.jailTurns = 0;
  a.cash = 100;
  assert.deepStrictEqual(m.payFine(room, a.id), {});
  assert.strictEqual(a.jail, false);
  assert.strictEqual(a.cash, 80);

  const esc = mk(2);
  const b = cur(esc);
  b.jail = true; b.pos = 8;
  assert.ok(m.useEscape(esc, b.id).error);
  b.escape = 1;
  assert.deepStrictEqual(m.useEscape(esc, b.id), {});
  assert.strictEqual(b.escape, 0);
  assert.strictEqual(b.jail, false);

  const dbl = mk(2);
  const c = cur(dbl);
  c.jail = true; c.pos = 8;
  dice(dbl, [2, 3]); // 더블 아님: 그대로
  roll(dbl);
  assert.strictEqual(c.jail, true);
  assert.strictEqual(c.jailTurns, 1);
  assert.notStrictEqual(cur(dbl).id, c.id);
  dbl.turn = dbl.players.indexOf(c);
  dice(dbl, [4, 4]); // 더블: 탈출하고 8칸 이동
  roll(dbl);
  assert.strictEqual(c.jail, false);
  assert.strictEqual(c.pos, 16);

  const wait = mk(2);
  const d = cur(wait);
  d.jail = true; d.pos = 8; d.jailTurns = 3;
  dice(wait, [1, 3]);
  roll(wait);
  assert.strictEqual(d.jail, false); // 3턴을 채우면 풀려나서 이동
  assert.strictEqual(d.pos, 12);
});

test('황금열쇠: 돈, 이동, 무인도, 탈출권, 생일', () => {
  const run = (id, setup = () => {}) => {
    const room = mk(3);
    setup(room);
    cur(room).pos = 0;
    topKey(room, id);
    dice(room, [1, 2]); // 3번 칸 = 황금열쇠
    roll(room);
    return room;
  };
  assert.strictEqual(run('lottery').players[0].cash, 320);
  assert.strictEqual(run('tax').players[0].cash, 290);
  assert.strictEqual(run('bonus').players[0].cash, 330);
  assert.strictEqual(run('theft').players[0].cash, 295);
  const donate = run('donate');
  assert.strictEqual(donate.players[0].cash, 290);
  assert.strictEqual(donate.fund, 10);
  const bday = run('birthday');
  assert.deepStrictEqual(bday.players.map((p) => p.cash), [310, 295, 295]);
  const esc = run('escape');
  assert.strictEqual(esc.players[0].escape, 1);
  const isl = run('island');
  assert.strictEqual(isl.players[0].jail, true);
  assert.strictEqual(isl.players[0].pos, 8);
  const fwd = run('fwd3'); // 3번 → 6번 싱가포르 (구입 선택)
  assert.strictEqual(fwd.players[0].pos, 6);
  assert.strictEqual(fwd.pending.t, 'buy');
  const back = run('back3'); // 3번 → 0번 시작
  assert.strictEqual(back.players[0].pos, 0);
  const space = run('space');
  assert.strictEqual(space.players[0].pos, 24);
  assert.strictEqual(space.players[0].warp, true);
  const tour = run('nearTour'); // 3번에서 가장 가까운 관광지는 5번
  assert.strictEqual(tour.players[0].pos, 5);
  const start = run('start');
  assert.strictEqual(start.players[0].pos, 0);
  assert.strictEqual(start.players[0].cash, 320);
});

test('사회복지기금: 접수에서 15만을 내면 쌓이고, 수령에서 전부 가져간다', () => {
  const room = mk(2);
  cur(room).pos = 25;
  dice(room, [2, 2]); // 29번 접수 (더블이라 한 번 더)
  roll(room);
  assert.strictEqual(room.fund, 15);
  assert.strictEqual(P(room, 0).cash, 285);
  const a = room.players.find((p) => p.id === cur(room).id);
  a.pos = 12;
  dice(room, [1, 3]); // 16번 수령
  roll(room);
  assert.strictEqual(room.fund, 0);
  assert.strictEqual(a.cash, 285 + 15); // 접수에서 낸 15만이 기금에 쌓였다가 그대로 돌아옴
});

test('우주여행: 도착하면 다음 턴에 원하는 칸으로 간다 (시작을 지나면 월급)', () => {
  const room = mk(2);
  const a = cur(room);
  a.pos = 20;
  dice(room, [1, 3]); // 24번 우주여행
  roll(room);
  assert.strictEqual(a.warp, true);
  const other = cur(room);
  assert.notStrictEqual(other.id, a.id);
  dice(room, [1, 2]);
  roll(room);
  if (room.pending) m.skip(room, other.id);
  // 다시 a 차례: 굴리기 대신 우주여행 선택
  assert.strictEqual(cur(room).id, a.id);
  assert.strictEqual(room.pending.t, 'warp');
  assert.ok(m.roll(room, a.id).error);
  assert.ok(m.warp(room, other.id, 3).error);
  assert.ok(m.warp(room, a.id, 24).error); // 제자리
  assert.ok(m.warp(room, a.id, 99).error);
  const cash = a.cash;
  assert.deepStrictEqual(m.warp(room, a.id, 2), {}); // 24 → 2: 시작을 지나 월급
  assert.strictEqual(a.pos, 2);
  assert.strictEqual(a.cash, cash + 20);
  assert.strictEqual(a.warp, false);
});

test('빚: 돈이 모자라면 땅을 팔아 갚고, 갚으면 이어서 진행한다', () => {
  const room = mk(2);
  const [a, b] = [P(room, 0), P(room, 1)];
  own(room, 31, b, 3); // 서울 호텔: 통행료 150
  own(room, 4, a); // a의 땅: 마닐라 (판매 4)
  own(room, 9, a, 3); // 이스탄불 호텔 12 + 6+12+18 = 48 → 판매 24
  a.cash = 140;
  a.pos = 27;
  dice(room, [2, 2]); // 31번
  roll(room);
  assert.strictEqual(room.pending.t, 'debt');
  assert.strictEqual(room.pending.amount, 150);
  assert.ok(m.sell(room, b.id, 4).error);
  assert.ok(m.sell(room, a.id, 12).error);
  assert.deepStrictEqual(m.sell(room, a.id, 9), {}); // +24 → 164 ≥ 150
  assert.strictEqual(room.pending, null);
  assert.strictEqual(a.cash, 14);
  assert.strictEqual(b.cash, 300 + 150);
  assert.strictEqual(room.owners[9], undefined);
  assert.ok(room.owners[4]); // 팔지 않은 땅은 그대로
});

test('빚을 못 갚으면 파산: 땅은 은행으로, 현금은 채권자에게, 한 명 남으면 끝', () => {
  const room = mk(2);
  const [a, b] = [P(room, 0), P(room, 1)];
  own(room, 31, b, 3);
  own(room, 4, a);
  a.cash = 5;
  a.pos = 27;
  dice(room, [2, 2]);
  roll(room); // 5 + 판매 4 = 9 < 150 → 바로 파산
  assert.strictEqual(a.bankrupt, true);
  assert.strictEqual(room.owners[4], undefined);
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds, [b.id]);
  assert.strictEqual(b.cash, 305);
});

test('스스로 파산을 선언할 수 있고, 셋 이상이면 게임은 계속된다', () => {
  const room = mk(3);
  const [a, b] = [P(room, 0), P(room, 1)];
  own(room, 31, b, 3);
  own(room, 9, a, 3); // 판매 24
  a.cash = 130;
  a.pos = 27;
  dice(room, [2, 2]);
  roll(room);
  assert.strictEqual(room.pending.t, 'debt'); // 130+24 = 154 ≥ 150이라 갚을 수 있음
  assert.ok(m.declareBankrupt(room, b.id).error);
  assert.deepStrictEqual(m.declareBankrupt(room, a.id), {});
  assert.strictEqual(a.bankrupt, true);
  assert.strictEqual(room.owners[9], undefined);
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(b.cash, 300 + 130);
  assert.ok(!room.players[room.turn].bankrupt);
  // 파산한 사람은 차례에서 빠진다
  for (let i = 0; i < 6; i++) {
    const c = cur(room);
    assert.strictEqual(c.bankrupt, false);
    dice(room, [1, 2]);
    roll(room);
    if (room.pending) m.skip(room, c.id);
  }
});

test('바퀴 수가 차면 자산(현금+땅/건물)이 가장 많은 사람이 이긴다', () => {
  const room = mk(2, { maxRounds: 20 });
  room.settings.maxRounds = 2;
  const [a, b] = [P(room, 0), P(room, 1)];
  a.cash = 100;
  b.cash = 100;
  own(room, 31, b, 0); // b: +50
  for (let i = 0; i < 8 && room.phase === 'play'; i++) {
    const c = cur(room);
    dice(room, [1, 2]);
    roll(room);
    if (room.pending) m.skip(room, c.id);
  }
  assert.strictEqual(room.phase, 'over');
  assert.ok(room.winnerIds.length >= 1);
  const best = Math.max(...room.players.map((p) => m.netWorth(room, p)));
  assert.ok(room.winnerIds.every((id) => m.netWorth(room, room.players.find((p) => p.id === id)) === best));
});

test('방장 force: 굴리기/선택/빚/우주여행을 대신 처리한다', () => {
  const room = mk(2);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(m.force(room, nonHost.id).error);
  const before = cur(room).id;
  assert.deepStrictEqual(m.force(room, room.hostId), {}); // 대신 굴림
  assert.ok(room.dice);
  if (room.pending) {
    assert.deepStrictEqual(m.force(room, room.hostId), {}); // 선택은 건너뜀
    assert.strictEqual(room.pending, null);
  }
  assert.ok(before);
});

test('초기화와 다시 시작', () => {
  const room = mk(3);
  const nonHost = room.players.find((p) => p.id !== room.hostId).id;
  assert.ok(m.backToLobby(room, nonHost).error);
  const g = room.gameNo;
  assert.deepStrictEqual(m.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, g + 1);
  assert.ok(room.players.every((p) => p.cash === 300));
  assert.deepStrictEqual(m.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
});

// ---- 무작위로 끝까지 ----

test('2~6명이 무작위로 끝까지 두면 반드시 끝나고 상태가 깨지지 않는다', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    for (let g = 0; g < 25; g++) {
      const room = mk(n, { maxRounds: 20 });
      for (let step = 0; step < 4000 && room.phase === 'play'; step++) {
        const pd = room.pending;
        const id = pd ? pd.who : cur(room).id;
        const v = m.viewFor(room, id);
        const me = room.players.find((p) => p.id === id);
        const must = (r) => assert.deepStrictEqual(r, {}, `${v.mode} ${JSON.stringify(r)}`);
        switch (v.mode) {
          case 'roll':
            if (me.jail && me.escape > 0 && Math.random() < 0.5) must(m.useEscape(room, id));
            else if (me.jail && v.canPayFine && Math.random() < 0.4) must(m.payFine(room, id));
            must(m.roll(room, id));
            break;
          case 'buy': must(Math.random() < 0.8 ? m.buy(room, id) : m.skip(room, id)); break;
          case 'build': must(Math.random() < 0.7 ? m.build(room, id) : m.skip(room, id)); break;
          case 'takeover': must(Math.random() < 0.5 ? m.takeover(room, id) : m.skip(room, id)); break;
          case 'debt': {
            const mine = v.tiles.filter((t) => t.owner === id);
            if (mine.length && Math.random() < 0.9) must(m.sell(room, id, mine[0].i));
            else must(m.declareBankrupt(room, id));
            break;
          }
          case 'warp': must(m.warp(room, id, (me.pos + 1 + Math.floor(Math.random() * 31)) % 32)); break;
          default: assert.fail(`예상 못한 모드 ${v.mode}`);
        }
        for (const p of room.players) {
          if (!p.bankrupt) assert.ok(p.cash >= 0, `${p.name} 돈이 음수 ${p.cash}`);
          assert.ok(p.pos >= 0 && p.pos < 32);
        }
        for (const [i, o] of Object.entries(room.owners)) {
          assert.ok(!room.players.find((p) => p.id === o.owner).bankrupt, '파산한 사람이 땅을 가지고 있어요');
          assert.ok(o.level >= 0 && o.level <= 3 && (m.TILES[i].type === 'city' || o.level === 0));
        }
      }
      assert.strictEqual(room.phase, 'over', `${n}명 ${g}판이 끝나지 않았어요`);
      assert.ok(room.winnerIds.length >= 1);
    }
  }
});

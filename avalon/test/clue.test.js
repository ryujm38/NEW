'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('../clue');
const { serializeRoom, deserializeRoom } = require('../hub');

function mk(n = 4, settings) {
  const room = c.createRoom('CL');
  for (let i = 0; i < n; i++) c.addPlayer(room, `p${i}`);
  if (settings) Object.entries(settings).forEach(([k, v]) => assert.deepStrictEqual(c.setSetting(room, room.hostId, k, v), {}));
  assert.deepStrictEqual(c.start(room, room.hostId), {});
  return room;
}
const cur = (room) => room.players[room.turn];
const P = (room, i) => room.players[i];
const inPlay = (room) => [...room.suspects, ...c.TREASURES, ...c.ISLANDS];
const ok = (r) => assert.deepStrictEqual(r, {});

// 손패를 직접 정해서 규칙을 정확히 시험한다. hands: 자리 순서대로 카드 id 배열. 나머지는 공개 카드로.
function rig(room, { turn = 0, envelope, hands }) {
  room.suspects = ['luffy', 'zoro', 'sanji', 'nami', 'chopper', 'franky'];
  room.envelope = envelope || { who: 'luffy', what: 'chest', where: 'wano' };
  room.players.forEach((p, i) => { p.hand = hands[i] || []; p.out = false; p.shown = {}; });
  const used = new Set([...Object.values(room.envelope), ...hands.flat()]);
  room.publicCards = inPlay(room).filter((x) => !used.has(x));
  room.rumor = [];
  room.turn = turn;
  room.step = 'ask';
  room.asked = false;
  room.question = null;
}
const Q = (who, what, where) => ({ who, what, where });

function allCards(room) {
  return [...Object.values(room.envelope), ...room.players.flatMap((p) => p.hand), ...room.publicCards, ...room.rumor];
}

test('카드 21장: 인물 6(루피·조로·상디 고정 + 짝마다 1명) · 보물 6 · 섬 9', () => {
  assert.strictEqual(c.TREASURES.length, 6);
  assert.strictEqual(c.ISLANDS.length, 9);
  assert.deepStrictEqual(c.TREASURES.map((x) => c.CARD[x].name), ['보물상자', '쌍안경', '목걸이', '해적 금화', '고기', '검']);
  assert.deepStrictEqual(c.ISLANDS.map((x) => c.CARD[x].name), ['와노쿠니', '드럼성', '어인섬', '홀케이크 아일랜드', '마린 포드', '드레스로자', '아마존 릴리', '워터 세븐', '펑크 하자드']);
  for (let g = 0; g < 40; g++) {
    const room = mk(3);
    assert.strictEqual(room.suspects.length, 6);
    assert.deepStrictEqual(room.suspects.slice(0, 3), ['luffy', 'zoro', 'sanji']);
    assert.ok(['nami', 'usopp'].includes(room.suspects[3]));
    assert.ok(['chopper', 'brook'].includes(room.suspects[4]));
    assert.ok(['franky', 'robin'].includes(room.suspects[5]));
    assert.strictEqual(new Set(inPlay(room)).size, 21);
  }
});

test('대기실 설정: 짝마다 랜덤/한쪽 고르기, 방장만, 대기실에서만', () => {
  const room = c.createRoom('S');
  c.addPlayer(room, 'a'); c.addPlayer(room, 'b');
  assert.ok(c.setSetting(room, room.players[1].id, 'p1', 'usopp').error);
  assert.ok(c.setSetting(room, room.hostId, 'p1', 'brook').error);
  assert.ok(c.setSetting(room, room.hostId, 'zz', 'random').error);
  ok(c.setSetting(room, room.hostId, 'p1', 'usopp'));
  ok(c.setSetting(room, room.hostId, 'p2', 'brook'));
  ok(c.setSetting(room, room.hostId, 'p3', 'robin'));
  ok(c.start(room, room.hostId));
  assert.deepStrictEqual(room.suspects, ['luffy', 'zoro', 'sanji', 'usopp', 'brook', 'robin']);
  assert.ok(c.setSetting(room, room.hostId, 'p1', 'nami').error);
  // 랜덤이면 두 쪽이 모두 나온다
  const seen = new Set();
  for (let g = 0; g < 60; g++) seen.add(mk(2).suspects[3]);
  assert.deepStrictEqual([...seen].sort(), ['nami', 'usopp']);
});

test('준비: 봉투 3장(종류별 1장), 인원별 장수, 남는 카드 공개 / 2인 소문 카드', () => {
  const expect = { 2: [6, 1, 5], 3: [6, 0, 0], 4: [4, 2, 0], 5: [3, 3, 0], 6: [3, 0, 0] };
  for (const n of [2, 3, 4, 5, 6]) {
    for (let g = 0; g < 20; g++) {
      const room = mk(n);
      const [hand, pub, rumor] = expect[n];
      assert.ok(room.suspects.includes(room.envelope.who));
      assert.ok(c.TREASURES.includes(room.envelope.what));
      assert.ok(c.ISLANDS.includes(room.envelope.where));
      assert.ok(room.players.every((p) => p.hand.length === hand), `${n}명 손패`);
      assert.strictEqual(room.publicCards.length, pub);
      assert.strictEqual(room.rumor.length, rumor);
      const all = allCards(room);
      assert.strictEqual(all.length, 21);
      assert.deepStrictEqual(new Set(all), new Set(inPlay(room)));
      assert.strictEqual(room.phase, 'play');
      assert.strictEqual(room.step, 'ask');
      assert.ok(room.turn >= 0 && room.turn < n);
    }
  }
});

test('첫 차례는 무작위', () => {
  const firsts = new Set();
  for (let g = 0; g < 60; g++) firsts.add(mk(3).turn);
  assert.deepStrictEqual([...firsts].sort(), [0, 1, 2]);
});

test('시작 조건: 2~6명, 방장만, 접속 끊김 불가', () => {
  const one = c.createRoom('X');
  c.addPlayer(one, 'a');
  assert.ok(c.start(one, one.hostId).error);
  const full = c.createRoom('Y');
  for (let i = 0; i < 6; i++) c.addPlayer(full, `p${i}`);
  assert.ok(c.addPlayer(full, 'p7').error);
  assert.ok(c.start(full, full.players[1].id).error);
  full.players[2].connected = false;
  assert.ok(c.start(full, full.hostId).error);
  full.players[2].connected = true;
  ok(c.start(full, full.hostId));
  assert.ok(c.addPlayer(full, 'late').error);
});

test('질문 순서: 질문자 왼쪽(다음 자리)부터 시계 방향', () => {
  const room = mk(5);
  const ids = room.players.map((p) => p.id);
  assert.deepStrictEqual(c.askOrder(room, 0), ids.slice(1));
  assert.deepStrictEqual(c.askOrder(room, 3), [ids[4], ids[0], ids[1], ids[2]]);
  assert.deepStrictEqual(c.askOrder(room, 4), ids.slice(0, 4));
});

test('질문: 처음으로 가진 사람에서 멈추고, 그 앞 사람은 패스. 뒤에 가진 사람은 묻지 않는다', () => {
  const room = mk(4);
  // 자리 2가 질문. 순서는 3 → 0 → 1. 자리 3은 없음, 자리 0은 조로 보유, 자리 1도 검 보유
  rig(room, {
    turn: 2,
    hands: [['zoro', 'drum', 'scope', 'nami'], ['sword', 'fishman', 'meat', 'sanji'], ['coin', 'wci', 'marine', 'chopper'], ['dressrosa', 'amazon', 'water7', 'punk']],
  });
  const A = P(room, 2);
  assert.ok(c.ask(room, P(room, 0).id, Q('zoro', 'sword', 'drum')).error); // 내 차례 아님
  ok(c.ask(room, A.id, Q('zoro', 'sword', 'drum')));
  const q = room.history[0];
  assert.deepStrictEqual(q.order, [P(room, 3).id, P(room, 0).id, P(room, 1).id]);
  assert.deepStrictEqual(q.passed, [P(room, 3).id]);
  assert.strictEqual(q.shower, P(room, 0).id);
  assert.strictEqual(room.step, 'respond');
  // 보여 줄 사람의 화면과 나머지 화면
  assert.strictEqual(c.viewFor(room, P(room, 0).id).mode, 'respond');
  assert.strictEqual(c.viewFor(room, A.id).mode, 'wait');
  assert.strictEqual(c.viewFor(room, P(room, 1).id).mode, 'wait');
  // 질문 중에는 또 질문/고발/차례 끝내기 불가
  assert.ok(c.ask(room, A.id, Q('luffy', 'chest', 'wano')).error);
  assert.ok(c.accuse(room, A.id, Q('luffy', 'chest', 'wano')).error);
  assert.ok(c.endTurn(room, A.id).error);
  // 다른 사람이 보여 줄 수 없고, 질문에 없는 카드나 안 가진 카드도 못 보여 준다
  assert.ok(c.show(room, P(room, 1).id, 'sword').error);
  assert.ok(c.show(room, P(room, 0).id, 'scope').error);
  assert.ok(c.show(room, P(room, 0).id, 'sword').error);
  ok(c.show(room, P(room, 0).id, 'drum')); // 둘 중 고를 수 있다
  assert.strictEqual(q.card, 'drum');
  assert.strictEqual(room.step, 'after');
  assert.deepStrictEqual(P(room, 0).shown, { drum: [A.id] });
  assert.ok(c.show(room, P(room, 0).id, 'zoro').error); // 한 장만
  assert.ok(c.ask(room, A.id, Q('luffy', 'chest', 'wano')).error); // 질문은 한 번만
  assert.strictEqual(c.viewFor(room, A.id).mode, 'after');
});

test('질문: 보여 준 카드는 질문자와 보여 준 사람만 안다. 패스/보여 준 사람은 모두가 안다', () => {
  const room = mk(3);
  rig(room, { turn: 0, hands: [['zoro', 'drum'], ['nami', 'sword'], ['meat', 'fishman']] });
  const [A, B, C] = room.players;
  ok(c.ask(room, A.id, Q('nami', 'meat', 'punk')));
  ok(c.show(room, B.id, 'nami'));
  const vA = c.viewFor(room, A.id);
  const vB = c.viewFor(room, B.id);
  const vC = c.viewFor(room, C.id);
  assert.strictEqual(vA.question.card, 'nami');
  assert.strictEqual(vB.question.card, 'nami');
  assert.strictEqual(vC.question.card, null);
  assert.strictEqual(vC.history[0].card, null);
  assert.strictEqual(vC.history[0].shower, B.id);
  assert.deepStrictEqual(vC.history[0].passed, []);
  assert.ok(vC.history.every((h) => h.card === null));
  // 남의 "보여 준 기록"도 안 보인다
  assert.deepStrictEqual(vC.myShown, {});
  assert.deepStrictEqual(vA.myShown, {});
  assert.deepStrictEqual(vB.myShown, { nami: [A.id] });
});

test('질문: 아무도 없으면 모두 패스하고 바로 질문 뒤 단계', () => {
  const room = mk(3);
  rig(room, { turn: 1, hands: [['zoro', 'drum'], ['nami', 'sword'], ['meat', 'fishman']] });
  const [A, B, C] = room.players;
  ok(c.ask(room, B.id, Q('luffy', 'chest', 'wano'))); // 정답 그대로
  const q = room.history[0];
  assert.deepStrictEqual(q.passed, [C.id, A.id]);
  assert.strictEqual(q.shower, null);
  assert.strictEqual(room.step, 'after');
  assert.ok(room.log.some((l) => l.includes('아무도 카드를 보여 주지 못했어요')));
  // 질문자 자신의 카드는 묻지 않는다: 자기 카드를 섞어 물어도 남에게 없으면 아무도 안 보여 준다
  ok(c.endTurn(room, B.id));
  assert.strictEqual(cur(room).id, C.id);
  ok(c.ask(room, C.id, Q('luffy', 'meat', 'fishman')));
  assert.strictEqual(room.history[1].shower, null);
  assert.deepStrictEqual(room.history[1].passed, [A.id, B.id]);
});

test('2인: 소문 카드는 아무도 갖지 않아 질문에 걸리지 않고, 끝나기 전엔 안 보인다', () => {
  const room = mk(2);
  const [A, B] = room.players;
  assert.strictEqual(room.rumor.length, 5);
  assert.strictEqual(room.publicCards.length, 1);
  const r = room.rumor[0];
  const ca = c.CARD[r].cat;
  // 소문 카드 1장 + 봉투의 나머지 두 장으로 질문 → B는 아무것도 없다
  const o = { ...room.envelope, [ca]: r };
  room.turn = 0; room.step = 'ask'; room.asked = false;
  ok(c.ask(room, A.id, o));
  assert.strictEqual(room.history[0].shower, null);
  assert.deepStrictEqual(room.history[0].passed, [B.id]);
  const vB = c.viewFor(room, B.id);
  assert.strictEqual(vB.rumor, null);
  assert.strictEqual(vB.rumorCount, 5);
  assert.strictEqual(vB.envelope, null);
  for (const x of room.rumor) assert.ok(!vB.hand.includes(x));
});

test('고발: 맞히면 승리하고 정답 공개', () => {
  const room = mk(3);
  rig(room, { turn: 0, hands: [['zoro', 'drum'], ['nami', 'sword'], ['meat', 'fishman']] });
  const A = P(room, 0);
  assert.strictEqual(c.viewFor(room, P(room, 1).id).envelope, null);
  ok(c.accuse(room, A.id, Q('luffy', 'chest', 'wano'))); // 질문 없이 바로 고발해도 된다
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winnerId, A.id);
  assert.strictEqual(A.wins, 1);
  const v = c.viewFor(room, P(room, 2).id);
  assert.strictEqual(v.mode, 'over');
  assert.deepStrictEqual(v.envelope, { who: 'luffy', what: 'chest', where: 'wano' });
  assert.deepStrictEqual(v.players[1].hand, ['nami', 'sword']);
});

test('고발: 틀리면 탈락(차례 건너뜀), 그래도 질문을 받으면 카드를 보여 줘야 한다', () => {
  const room = mk(3);
  rig(room, { turn: 0, hands: [['zoro', 'drum'], ['nami', 'sword'], ['meat', 'fishman']] });
  const [A, B, C] = room.players;
  ok(c.ask(room, A.id, Q('luffy', 'sword', 'wano')));
  ok(c.show(room, B.id, 'sword'));
  ok(c.accuse(room, A.id, Q('luffy', 'meat', 'wano'))); // 질문 뒤 고발, 틀림
  assert.strictEqual(A.out, true);
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(cur(room).id, B.id);
  assert.strictEqual(c.viewFor(room, A.id).envelope, null); // 틀린 사람에게도 정답은 안 보여 준다
  assert.strictEqual(c.viewFor(room, A.id).mode, 'wait');
  assert.deepStrictEqual(room.accusations.map((x) => x.ok), [false]);
  ok(c.endTurn(room, B.id));
  assert.strictEqual(cur(room).id, C.id);
  // C가 질문하면 순서는 A → B. 탈락한 A도 조로를 보여 줘야 한다
  ok(c.ask(room, C.id, Q('zoro', 'chest', 'marine')));
  assert.strictEqual(room.history[1].shower, A.id);
  assert.strictEqual(c.viewFor(room, A.id).mode, 'respond');
  ok(c.show(room, A.id, 'zoro'));
  ok(c.endTurn(room, C.id));
  assert.strictEqual(cur(room).id, B.id, 'A는 건너뛴다');
  assert.ok(c.ask(room, A.id, Q('zoro', 'chest', 'marine')).error);
});

test('고발: 모두 틀리면 아무도 못 이기고 정답 공개', () => {
  const room = mk(2);
  rig(room, { turn: 1, hands: [['zoro', 'drum'], ['nami', 'sword']] });
  room.rumor = room.publicCards.splice(0, 5);
  const [A, B] = room.players;
  ok(c.accuse(room, B.id, Q('zoro', 'chest', 'wano')));
  assert.strictEqual(cur(room).id, A.id);
  // 남은 한 사람은 계속 할 수 있다: 탈락한 B에게 질문
  ok(c.ask(room, A.id, Q('nami', 'chest', 'wano')));
  assert.strictEqual(room.history[0].shower, B.id);
  ok(c.show(room, B.id, 'nami'));
  ok(c.endTurn(room, A.id));
  assert.strictEqual(cur(room).id, A.id, '혼자 남으면 계속 내 차례');
  ok(c.accuse(room, A.id, Q('sanji', 'chest', 'wano')));
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winnerId, null);
  assert.ok(room.log.some((l) => l.includes('모두 고발에 실패')));
  const v = c.viewFor(room, A.id);
  assert.deepStrictEqual(v.envelope, room.envelope);
  assert.deepStrictEqual(v.rumor, room.rumor);
});

test('차례: 질문 없이 넘기기, 질문 뒤 고발 없이 끝내기, 자리 순서', () => {
  const room = mk(4);
  rig(room, { turn: 3, hands: [['zoro'], ['nami'], ['meat'], ['fishman']] });
  ok(c.endTurn(room, P(room, 3).id));
  assert.strictEqual(room.turn, 0);
  assert.ok(room.log.some((l) => l.includes('질문 없이')));
  ok(c.ask(room, P(room, 0).id, Q('nami', 'chest', 'wano')));
  ok(c.show(room, P(room, 1).id, 'nami'));
  ok(c.endTurn(room, P(room, 0).id));
  assert.strictEqual(room.turn, 1);
  assert.strictEqual(room.step, 'ask');
  assert.strictEqual(room.question, null);
});

test('방장 넘기기: 보여 줄 사람이 자리를 비우면 첫 번째 맞는 카드, 질문자면 차례 끝', () => {
  const room = mk(3);
  rig(room, { turn: 0, hands: [['zoro', 'drum'], ['sword', 'nami'], ['meat', 'fishman']] });
  const [A, B] = room.players;
  assert.ok(c.force(room, B.id).error); // 방장만
  ok(c.ask(room, A.id, Q('nami', 'sword', 'punk')));
  ok(c.force(room, room.hostId));
  assert.strictEqual(room.history[0].card, 'nami'); // 질문 순서(인물 → 보물 → 섬)로 첫 번째
  assert.strictEqual(room.step, 'after');
  assert.deepStrictEqual(B.shown, { nami: [A.id] });
  ok(c.force(room, room.hostId));
  assert.strictEqual(room.turn, 1);
  ok(c.force(room, room.hostId)); // 질문 전에도 넘길 수 있다
  assert.strictEqual(room.turn, 2);
});

test('보여 준 기록: 같은 카드를 같은 사람에게 다시 보여 주면 한 번만 적는다', () => {
  const room = mk(2);
  rig(room, { turn: 0, hands: [['zoro', 'drum'], ['nami', 'sword']] });
  const [A, B] = room.players;
  for (let k = 0; k < 2; k++) {
    room.turn = 0; room.step = 'ask'; room.asked = false;
    ok(c.ask(room, A.id, Q('nami', 'chest', 'wano')));
    ok(c.show(room, B.id, 'nami'));
    ok(c.endTurn(room, A.id));
  }
  assert.deepStrictEqual(B.shown, { nami: [A.id] });
});

test('다시 하기 / 대기실: 상태 초기화, 같은 멤버로 새 판', () => {
  const room = mk(3);
  const g = room.gameNo;
  ok(c.restart(room, room.hostId));
  assert.strictEqual(room.gameNo, g + 1);
  assert.strictEqual(room.history.length, 0);
  ok(c.accuse(room, cur(room).id, room.envelope));
  assert.strictEqual(room.phase, 'over');
  ok(c.backToLobby(room, room.hostId));
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.hand.length === 0 && !p.out));
  assert.strictEqual(room.envelope, null);
  assert.strictEqual(c.viewFor(room, room.hostId).mode, 'lobby');
  ok(c.start(room, room.hostId));
});

test('저장 후 되살려도 질문 진행이 이어진다 (JSON 직렬화)', () => {
  let room = mk(3);
  rig(room, { turn: 0, hands: [['zoro', 'drum'], ['sword', 'nami'], ['meat', 'fishman']] });
  ok(c.ask(room, P(room, 0).id, Q('nami', 'sword', 'punk')));
  room = deserializeRoom(serializeRoom(room));
  assert.strictEqual(c.viewFor(room, P(room, 1).id).mode, 'respond');
  ok(c.show(room, P(room, 1).id, 'sword'));
  assert.strictEqual(room.history[0].card, 'sword');
});

// ---- 무작위로 끝까지 ----

// 보는 사람이 알면 안 되는 카드가 화면 상태에 없어야 한다
function assertNoLeak(room) {
  for (const viewer of room.players) {
    const v = c.viewFor(room, viewer.id);
    const s = JSON.stringify(v);
    assert.ok(!s.includes('"token"'));
    assert.strictEqual(v.envelope, null);
    assert.strictEqual(v.rumor, null);
    assert.deepStrictEqual(v.hand, viewer.hand);
    assert.deepStrictEqual(v.myShown, viewer.shown);
    assert.ok(v.players.every((p) => p.hand === null));
    v.history.forEach((h, i) => {
      const real = room.history[i];
      if (viewer.id === real.by || viewer.id === real.shower) assert.strictEqual(h.card, real.card);
      else assert.strictEqual(h.card, null);
    });
    // 손패 id 목록이 남의 화면에 그대로 들어 있지 않은지 (카드 목록 cards 는 모두 같으므로 뺀다)
    const { cards, ...rest } = v;
    for (const other of room.players) {
      if (other === viewer || !other.hand.length) continue;
      assert.ok(!JSON.stringify(rest).includes(JSON.stringify(other.hand)));
    }
  }
}

test('2~6명이 무작위로 끝까지 두면 늘 끝나고, 카드가 보존되고, 비밀이 새지 않는다', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    for (let g = 0; g < 40; g++) {
      const room = mk(n);
      const all0 = allCards(room).slice().sort();
      let steps = 0;
      while (room.phase === 'play' && steps++ < 2000) {
        assertNoLeak(room);
        const A = cur(room);
        assert.ok(!A.out, '탈락한 사람 차례가 오면 안 된다');
        if (room.step === 'respond') {
          const q = room.history[room.history.length - 1];
          const S = room.players.find((p) => p.id === q.shower);
          // 질문자 왼쪽부터 첫 보유자가 맞는지 다시 확인
          const named = [q.who, q.what, q.where];
          const firstHolder = q.order.find((pid) => room.players.find((p) => p.id === pid).hand.some((x) => named.includes(x)));
          assert.strictEqual(q.shower, firstHolder);
          q.passed.forEach((pid) => assert.ok(!room.players.find((p) => p.id === pid).hand.some((x) => named.includes(x))));
          const mine = S.hand.filter((x) => named.includes(x));
          if (Math.random() < 0.1) ok(c.force(room, room.hostId));
          else ok(c.show(room, S.id, mine[Math.floor(Math.random() * mine.length)]));
          continue;
        }
        const r = Math.random();
        const randTriple = () => ({
          who: room.suspects[Math.floor(Math.random() * 6)],
          what: c.TREASURES[Math.floor(Math.random() * 6)],
          where: c.ISLANDS[Math.floor(Math.random() * 9)],
        });
        if (room.step === 'ask' && r < 0.75) ok(c.ask(room, A.id, randTriple()));
        else if (r < 0.88) ok(c.accuse(room, A.id, Math.random() < 0.15 ? room.envelope : randTriple()));
        else ok(c.endTurn(room, A.id));
      }
      assert.strictEqual(room.phase, 'over', `${n}명 ${g}판이 끝나지 않았어요`);
      assert.deepStrictEqual(allCards(room).slice().sort(), all0);
      if (room.winnerId) {
        const last = room.accusations[room.accusations.length - 1];
        assert.ok(last.ok && last.by === room.winnerId);
        assert.ok(room.accusations.slice(0, -1).every((x) => !x.ok));
      } else {
        assert.ok(room.players.every((p) => p.out));
      }
      const outs = room.players.filter((p) => p.out).map((p) => p.id).sort();
      assert.deepStrictEqual(room.accusations.filter((x) => !x.ok).map((x) => x.by).sort(), outs);
      const v = c.viewFor(room, P(room, 0).id);
      assert.deepStrictEqual(v.envelope, room.envelope);
      assert.ok(v.history.every((h, i) => h.card === room.history[i].card));
    }
  }
});

// ---- 2차 검토에서 추가 ----

test('검토: 게임 중 대기실로 / 끊긴 사람이 있으면 바로 다시 하기는 막힘', () => {
  const room = mk(3);
  room.players[2].connected = false;
  assert.ok(c.restart(room, room.hostId).error);
  assert.strictEqual(room.phase, 'play', '실패해도 진행 중인 판은 그대로');
  ok(c.backToLobby(room, room.hostId));
  assert.strictEqual(room.phase, 'lobby');
  assert.strictEqual(room.players.length, 3, '게임 중에 돌아오면 끊긴 사람도 남겨 둔다(방장이 정리)');
  assert.ok(c.start(room, room.hostId).error);
  assert.ok(c.kick(room, room.hostId, room.players[2].id).kicked);
  ok(c.start(room, room.hostId));
  assert.ok(c.backToLobby(room, room.players[1].id).error);
});

test('검토: 보여 주는 중에는 방장만 넘길 수 있고, 질문자는 아무것도 못 한다', () => {
  const room = mk(3);
  rig(room, { turn: 0, hands: [['zoro', 'drum'], ['sword', 'nami'], ['meat', 'fishman']] });
  const [A, B, C] = room.players;
  ok(c.ask(room, A.id, Q('luffy', 'meat', 'punk'))); // B는 없음 → C가 고기
  assert.deepStrictEqual(room.history[0].passed, [B.id]);
  assert.strictEqual(room.history[0].shower, C.id);
  assert.ok(c.force(room, C.id).error);
  assert.ok(c.show(room, A.id, 'meat').error);
  assert.ok(c.endTurn(room, A.id).error);
  ok(c.force(room, room.hostId));
  assert.strictEqual(room.history[0].card, 'meat');
  assert.ok(room.log.some((l) => l.includes('대신 카드를 골랐어요')));
  // 질문 뒤 단계에서 넘기면 다음 사람 차례
  ok(c.force(room, room.hostId));
  assert.strictEqual(cur(room).id, B.id);
  assert.strictEqual(room.step, 'ask');
});

test('검토: 끝나면 모두에게 손패·보여 준 카드·소문 카드가 공개되고, 그 전에는 남의 화면에 정답 id 조합이 없다', () => {
  const room = mk(2);
  const [A, B] = room.players;
  room.turn = 0; room.step = 'ask'; room.asked = false;
  const q = { who: B.hand.find((x) => c.CARD[x].cat === 'who') || room.envelope.who, what: room.envelope.what, where: room.envelope.where };
  ok(c.ask(room, A.id, q));
  if (room.step === 'respond') ok(c.show(room, B.id, B.hand.find((x) => [q.who, q.what, q.where].includes(x))));
  const vB = c.viewFor(room, B.id);
  assert.ok(!JSON.stringify(vB).includes(JSON.stringify(room.envelope)));
  ok(c.accuse(room, A.id, room.envelope));
  const v = c.viewFor(room, B.id);
  assert.deepStrictEqual(v.players[0].hand, A.hand);
  assert.deepStrictEqual(v.rumor, room.rumor);
  assert.deepStrictEqual(v.history.map((h) => h.card), room.history.map((h) => h.card));
});

test('검토: 잘못된 설정 값/종류는 거부', () => {
  const room = c.createRoom('V');
  c.addPlayer(room, 'a');
  for (const [k, v] of [['p1', 'franky'], ['p2', ''], ['p3', null], ['__proto__', 'random'], ['toString', 'random']]) {
    assert.ok(c.setSetting(room, room.hostId, k, v).error, `${k}=${v}`);
  }
  assert.deepStrictEqual(room.settings, { p1: 'random', p2: 'random', p3: 'random' });
});

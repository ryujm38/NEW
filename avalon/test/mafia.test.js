'use strict';
const test = require('node:test');
const assert = require('node:assert');
const m = require('../mafia');

// 역할을 직접 정해서 시작한다. roles[i]가 i번째 사람의 역할.
// 게임은 1일차 낮부터 시작한다. mk()는 1일차 낮(전원 기권)을 넘겨서 1번째 밤까지 진행해 준다.
function mkDay(roles, o = {}) {
  const room = m.createRoom('MT');
  roles.forEach((_, i) => m.addPlayer(room, `p${i}`));
  if (o.revealRoles === false) m.setSetting(room, room.hostId, 'revealRoles', false);
  assert.deepStrictEqual(m.start(room, room.hostId), {});
  room.players.forEach((p, i) => { p.role = roles[i]; });
  room.players.forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'day');
  assert.strictEqual(room.day, 1);
  return room;
}
function mk(roles, o = {}) {
  const room = mkDay(roles, o);
  room.players.forEach((p) => m.ready(room, p.id)); // 토론 끝
  assert.strictEqual(room.phase, 'vote');
  room.players.forEach((p) => m.vote(room, p.id, null)); // 전원 기권 → 아무도 처형되지 않음
  assert.strictEqual(room.phase, 'voteResult');
  assert.strictEqual(room.lastVote.executed, null);
  room.players.forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'night');
  assert.strictEqual(room.day, 1);
  return room;
}
const P = (room, i) => room.players[i];
const id = (room, i) => P(room, i).id;
const night = (room, i, t) => m.night(room, id(room, i), id(room, t));
const ROLES5 = ['mafia', 'police', 'doctor', 'citizen', 'citizen'];
const ROLES6 = ['mafia', 'mafia', 'police', 'doctor', 'citizen', 'citizen'];

test('구성: 마피아 floor(n/3)(최소 1), 경찰 1, 의사 1, 나머지 시민 (5~12명)', () => {
  const want = { 5: 1, 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 4 };
  for (const [n, mafia] of Object.entries(want)) {
    const roles = m.composition(Number(n));
    assert.strictEqual(roles.length, Number(n));
    const count = (r) => roles.filter((x) => x === r).length;
    assert.deepStrictEqual([count('mafia'), count('police'), count('doctor'), count('citizen')], [mafia, 1, 1, Number(n) - mafia - 2], `${n}명`);
  }
});

test('5명 미만/12명 초과/방장 아님/접속 끊김이면 시작 불가', () => {
  const room = m.createRoom('X');
  for (let i = 0; i < 4; i++) m.addPlayer(room, `p${i}`);
  assert.ok(m.start(room, room.hostId).error);
  m.addPlayer(room, 'p4');
  assert.ok(m.start(room, room.players[1].id).error);
  room.players[2].connected = false;
  assert.ok(m.start(room, room.hostId).error);
  room.players[2].connected = true;
  for (let i = 5; i < 12; i++) m.addPlayer(room, `p${i}`);
  assert.ok(m.addPlayer(room, 'p13').error);
  assert.deepStrictEqual(m.start(room, room.hostId), {});
});

test('설정: 방장만, 대기실에서만 바꿀 수 있다', () => {
  const room = m.createRoom('X');
  for (let i = 0; i < 5; i++) m.addPlayer(room, `p${i}`);
  assert.ok(m.setSetting(room, room.players[1].id, 'revealRoles', false).error);
  assert.ok(m.setSetting(room, room.hostId, 'nope', true).error);
  assert.deepStrictEqual(m.setSetting(room, room.hostId, 'revealRoles', false), {});
  assert.strictEqual(room.settings.revealRoles, false);
  m.start(room, room.hostId);
  assert.ok(m.setSetting(room, room.hostId, 'revealRoles', true).error);
});

test('정체 공개 범위: 본인, 마피아끼리, 죽은 사람(설정에 따라), 끝나면 모두', () => {
  const room = mk(ROLES6);
  const v = (i) => m.viewFor(room, id(room, i));
  // 마피아 0은 동료 1을 안다. 시민은 아무도 모른다.
  assert.strictEqual(v(0).players[1].role, 'mafia');
  assert.strictEqual(v(0).players[2].role, null);
  assert.strictEqual(v(4).players[0].role, null);
  assert.strictEqual(v(4).players[4].role, 'citizen');
  assert.ok(!JSON.stringify(v(4)).includes('"token"'));
  // 죽은 사람의 직업 공개 (기본 켜짐)
  P(room, 4).alive = false;
  assert.strictEqual(v(2).players[4].role, 'citizen');
  const hidden = mk(ROLES6, { revealRoles: false });
  P(hidden, 4).alive = false;
  assert.strictEqual(m.viewFor(hidden, id(hidden, 2)).players[4].role, null);
  hidden.phase = 'over';
  assert.ok(m.viewFor(hidden, id(hidden, 2)).players.every((p) => p.role));
});

test('밤: 모두 행동해야 아침이 된다. 마피아 표적이 죽는다', () => {
  const room = mk(ROLES5);
  assert.deepStrictEqual(night(room, 0, 3), {});
  assert.strictEqual(room.phase, 'night');
  assert.deepStrictEqual(night(room, 1, 0), {}); // 경찰
  assert.strictEqual(room.phase, 'night');
  assert.deepStrictEqual(night(room, 2, 4), {}); // 의사가 다른 사람을 지킴
  assert.strictEqual(room.phase, 'day');
  assert.strictEqual(P(room, 3).alive, false);
  assert.strictEqual(room.lastNight.victim, id(room, 3));
  assert.strictEqual(room.lastNight.saved, false);
});

test('의사가 표적을 지키면 아무도 죽지 않고, 자기 자신도 지킬 수 있다', () => {
  const room = mk(ROLES5);
  night(room, 0, 2); // 마피아가 의사를 노림
  night(room, 1, 0);
  night(room, 2, 2); // 의사가 자기 자신을 지킴
  assert.strictEqual(room.phase, 'day');
  assert.ok(room.players.every((p) => p.alive));
  assert.strictEqual(room.lastNight.saved, true);
  assert.strictEqual(room.lastNight.victim, null);
  assert.strictEqual(room.lastNight.attacked, id(room, 2));
});

test('밤 행동 검사: 시민/죽은 사람/동료 마피아/자기 조사/중복/낮에는 거부', () => {
  const room = mk(ROLES6);
  assert.ok(night(room, 4, 0).error); // 시민은 밤에 할 일이 없다
  assert.ok(night(room, 0, 1).error); // 동료 마피아는 고를 수 없다
  assert.ok(night(room, 2, 2).error); // 경찰은 자기 자신 조사 불가
  assert.deepStrictEqual(night(room, 0, 4), {});
  assert.ok(night(room, 0, 5).error); // 이미 선택
  assert.ok(m.night(room, id(room, 0), 'nobody').error);
  assert.ok(m.vote(room, id(room, 0), id(room, 4)).error); // 밤에는 투표 불가
  P(room, 3).alive = false;
  assert.ok(night(room, 3, 0).error); // 죽은 의사
  assert.ok(night(room, 1, 3).error); // 죽은 사람은 표적이 될 수 없다
});

test('경찰 조사 결과는 경찰에게만 보이고 즉시 기록된다', () => {
  const room = mk(ROLES6);
  night(room, 2, 0);
  const police = m.viewFor(room, id(room, 2));
  assert.deepStrictEqual(police.policeLog, [{ day: 1, target: id(room, 0), mafia: true }]);
  assert.strictEqual(m.viewFor(room, id(room, 0)).policeLog, null);
  assert.strictEqual(m.viewFor(room, id(room, 4)).policeLog, null);
  assert.strictEqual(night(room, 2, 1).error, '이미 선택했어요.');
});

test('마피아 표가 갈리면 최다득표가 표적, 동률이면 둘 중 하나', () => {
  const three = ['mafia', 'mafia', 'mafia', 'police', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen'];
  for (let t = 0; t < 20; t++) {
    const room = mk(three);
    night(room, 0, 5);
    night(room, 1, 5);
    night(room, 2, 6);
    night(room, 3, 0);
    night(room, 4, 7);
    assert.strictEqual(P(room, 5).alive, false, '2표 받은 사람이 죽어야 해요');
    assert.strictEqual(P(room, 6).alive, true);
  }
  const seen = new Set();
  for (let t = 0; t < 60; t++) {
    const room = mk(ROLES6);
    night(room, 0, 4);
    night(room, 1, 5);
    night(room, 2, 0);
    night(room, 3, 3);
    seen.add(P(room, 4).alive ? 5 : 4);
    assert.strictEqual(room.players.filter((p) => !p.alive).length, 1);
  }
  assert.strictEqual(seen.size, 2); // 동률은 무작위
});

test('경찰/의사가 죽어 있으면 기다리지 않는다', () => {
  const room = mk(['mafia', 'mafia', 'police', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen']);
  P(room, 2).alive = false;
  P(room, 3).alive = false;
  night(room, 0, 4);
  assert.strictEqual(room.phase, 'night');
  night(room, 1, 4);
  assert.strictEqual(room.phase, 'day');
  assert.strictEqual(P(room, 4).alive, false);
});

test('낮: 산 사람 과반이 토론 끝을 누르면 투표로 넘어간다', () => {
  const room = mk(ROLES5);
  night(room, 0, 3); night(room, 1, 0); night(room, 2, 4);
  assert.strictEqual(room.phase, 'day');
  assert.ok(m.ready(room, id(room, 3)).error); // 죽은 사람
  m.ready(room, id(room, 0));
  m.ready(room, id(room, 1));
  assert.strictEqual(room.phase, 'day'); // 4명 중 2명 = 과반 아님
  m.ready(room, id(room, 2));
  assert.strictEqual(room.phase, 'vote'); // 3/4
});

function toVote(room) {
  alive(room).forEach((p) => m.ready(room, p.id));
  assert.strictEqual(room.phase, 'vote');
}
const alive = (room) => room.players.filter((p) => p.alive);
// 찬반 투표: 후보를 뺀 모두가 같은 선택을 한다
const trialAll = (room, kill) => alive(room).filter((p) => p.id !== room.accused).forEach((p) => m.judge(room, p.id, kill));

test('투표: 단독 최다득표자가 처형되고, 동률/전원 기권이면 아무도 처형 안 됨', () => {
  const room = mk(ROLES6);
  night(room, 0, 4); night(room, 1, 4); night(room, 2, 0); night(room, 3, 3); // 4번 사망
  toVote(room);
  const [a, b, c, d, , f] = [0, 1, 2, 3, 4, 5].map((i) => id(room, i));
  m.vote(room, a, f); m.vote(room, b, f); m.vote(room, c, a); m.vote(room, d, null);
  assert.strictEqual(room.phase, 'vote');
  m.vote(room, f, a); // 5명 중 마지막
  assert.strictEqual(room.phase, 'voteResult');
  assert.strictEqual(room.lastVote.executed, null); // f:2, a:2 → 동률
  assert.ok(room.players.every((p, i) => p.alive === (i !== 4)));

  const room2 = mk(ROLES6);
  night(room2, 0, 4); night(room2, 1, 4); night(room2, 2, 0); night(room2, 3, 3);
  toVote(room2);
  alive(room2).forEach((p) => m.vote(room2, p.id, null));
  assert.strictEqual(room2.lastVote.executed, null);
  assert.strictEqual(room2.phase, 'voteResult');

  const room3 = mk(ROLES6);
  night(room3, 0, 4); night(room3, 1, 4); night(room3, 2, 0); night(room3, 3, 3);
  toVote(room3);
  const t0 = id(room3, 5);
  alive(room3).forEach((p) => { if (p.id !== t0) m.vote(room3, p.id, t0); });
  m.vote(room3, t0, null);
  assert.strictEqual(room3.phase, 'trial'); // 단독 최다득표자는 처형 후보가 되어 찬반 투표로 간다
  assert.strictEqual(room3.accused, t0);
  assert.strictEqual(room3.lastVote.executed, null);
  trialAll(room3, true);
  assert.strictEqual(room3.phase, 'voteResult');
  assert.strictEqual(room3.lastVote.executed, t0);
  assert.strictEqual(getAlive(room3, 5), false);
});
const getAlive = (room, i) => P(room, i).alive;

test('투표 검사: 자기 자신/죽은 사람/중복/죽은 투표자/낮에는 거부', () => {
  const room = mk(ROLES6);
  night(room, 0, 4); night(room, 1, 4); night(room, 2, 0); night(room, 3, 3);
  assert.ok(m.vote(room, id(room, 0), id(room, 1)).error); // 아직 낮
  toVote(room);
  assert.ok(m.vote(room, id(room, 0), id(room, 0)).error);
  assert.ok(m.vote(room, id(room, 0), id(room, 4)).error); // 죽은 사람
  assert.ok(m.vote(room, id(room, 4), id(room, 0)).error); // 죽은 투표자
  assert.deepStrictEqual(m.vote(room, id(room, 0), id(room, 5)), {});
  assert.ok(m.vote(room, id(room, 0), id(room, 5)).error);
  const v = m.viewFor(room, id(room, 0));
  assert.deepStrictEqual(v.myVote, { target: id(room, 5) });
  assert.strictEqual(m.viewFor(room, id(room, 1)).myVote, null); // 남의 표는 안 보임
  assert.strictEqual(v.lastVote, null);
});

test('승리: 마피아가 모두 처형되면 시민팀 (결과 확인 뒤 종료)', () => {
  const room = mk(ROLES5);
  night(room, 0, 3); night(room, 1, 0); night(room, 2, 4);
  toVote(room);
  const mafia = id(room, 0);
  alive(room).forEach((p) => { if (p.id !== mafia) m.vote(room, p.id, mafia); });
  m.vote(room, mafia, null);
  trialAll(room, true);
  assert.strictEqual(room.phase, 'voteResult');
  assert.strictEqual(room.pendingWinner, 'citizen');
  alive(room).forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winner, 'citizen');
  assert.ok(m.viewFor(room, id(room, 4)).players.every((p) => p.role));
});

test('승리: 마피아 수가 나머지 이상이 되면 마피아팀 (밤에 결판)', () => {
  const room = mk(['mafia', 'citizen', 'citizen', 'citizen', 'citizen']);
  P(room, 3).alive = false;
  P(room, 4).alive = false; // 마피아1 vs 시민2
  night(room, 0, 1); // 시민 한 명이 죽으면 1:1
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winner, 'mafia');
});

test('승리: 처형으로 마피아 수가 같아지면 마피아팀', () => {
  const room = mk(ROLES6.concat(['citizen'])); // 7명: 마피아2, 경찰, 의사, 시민3
  night(room, 0, 4); night(room, 1, 4); night(room, 2, 0); night(room, 3, 5); // 4 사망, 5 보호
  toVote(room);
  const target = id(room, 6); // 시민 처형 → 마피아2 vs 3 → 아직 진행
  alive(room).forEach((p) => { if (p.id !== target) m.vote(room, p.id, target); });
  m.vote(room, target, null);
  trialAll(room, true);
  assert.strictEqual(room.pendingWinner, null);
  alive(room).forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'night');
  assert.strictEqual(room.day, 2);
  // 2번째 밤: 시민 1명 더 사망 → 마피아2 vs 2 → 마피아 승
  night(room, 0, 5); night(room, 1, 5); night(room, 2, 0); night(room, 3, 3);
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winner, 'mafia');
});

test('채팅: 낮/투표에는 산 사람 전체, 밤에는 마피아끼리만, 죽은 사람은 불가', () => {
  const room = mk(ROLES6);
  assert.ok(m.chat(room, id(room, 4), '안녕').error); // 밤: 시민
  assert.deepStrictEqual(m.chat(room, id(room, 0), '오늘 누구 죽일까'), {});
  m.chat(room, id(room, 1), '  4번  ');
  assert.strictEqual(m.viewFor(room, id(room, 1)).chat.length, 2);
  assert.strictEqual(m.viewFor(room, id(room, 4)).chat.length, 0); // 시민에겐 안 보임
  assert.strictEqual(m.viewFor(room, id(room, 0)).canChat, 'mafia');
  assert.strictEqual(m.viewFor(room, id(room, 4)).canChat, null);
  night(room, 0, 4); night(room, 1, 4); night(room, 2, 0); night(room, 3, 3);
  assert.strictEqual(room.phase, 'day');
  assert.ok(m.chat(room, id(room, 4), '억울해').error); // 죽은 사람
  assert.ok(m.chat(room, id(room, 0), '   ').error);
  assert.deepStrictEqual(m.chat(room, id(room, 5), 'x'.repeat(200)), {});
  const mine = m.viewFor(room, id(room, 3)).chat;
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].text.length, 80);
  assert.strictEqual(m.viewFor(room, id(room, 3)).canChat, 'all');
});

test('force: 밤/낮/투표/결과에서 방장이 멈춘 곳을 넘긴다', () => {
  const room = mk(ROLES6);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(m.force(room, nonHost.id).error);
  night(room, 0, 4);
  assert.deepStrictEqual(m.force(room, room.hostId), {}); // 나머지 마피아/의사/경찰은 행동 안 한 것으로
  assert.ok(['day', 'over'].includes(room.phase));
  if (room.phase === 'day') {
    m.force(room, room.hostId);
    assert.strictEqual(room.phase, 'vote');
    m.vote(room, alive(room)[0].id, null);
    m.force(room, room.hostId); // 나머지는 기권
    assert.strictEqual(room.phase, 'voteResult');
    assert.strictEqual(room.lastVote.executed, null);
    m.force(room, room.hostId);
    assert.strictEqual(room.phase, 'night');
  }
});

test('접속이 끊긴 사람은 결과 확인에서 기다리지 않는다', () => {
  const room = mk(ROLES6);
  night(room, 0, 4); night(room, 1, 4); night(room, 2, 0); night(room, 3, 3);
  toVote(room);
  alive(room).forEach((p) => m.vote(room, p.id, null));
  assert.strictEqual(room.phase, 'voteResult');
  const live = alive(room);
  live.slice(1).forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'voteResult');
  live[0].connected = false;
  m.afterDisconnect(room);
  assert.strictEqual(room.phase, 'night');
});

test('초기화와 다시 시작', () => {
  const room = mk(ROLES6);
  const nonHost = room.players.find((p) => p.id !== room.hostId).id;
  assert.ok(m.backToLobby(room, nonHost).error);
  const g = room.gameNo;
  assert.deepStrictEqual(m.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, g + 1);
  assert.strictEqual(room.phase, 'roles');
  assert.deepStrictEqual(m.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.role === null && p.alive));
  assert.ok(m.backToLobby(room, room.hostId).error);
});

// ---- 무작위로 끝까지 ----

test('5~12명이 무작위로 끝까지 두면 반드시 끝나고 승자가 맞다', () => {
  for (let n = 5; n <= 12; n++) {
    for (let g = 0; g < 30; g++) {
      const room = m.createRoom('F');
      for (let i = 0; i < n; i++) m.addPlayer(room, `p${i}`);
      assert.deepStrictEqual(m.start(room, room.hostId), {});
      for (let step = 0; step < 400 && room.phase !== 'over'; step++) {
        const live = alive(room);
        switch (room.phase) {
          case 'roles':
          case 'voteResult':
            room.players.forEach((p) => m.ack(room, p.id));
            break;
          case 'night':
            for (const p of live) {
              const v = m.viewFor(room, p.id);
              if (v.nightAction && !v.nightAction.done && room.phase === 'night') {
                const t = v.nightAction.options[Math.floor(Math.random() * v.nightAction.options.length)];
                assert.deepStrictEqual(m.night(room, p.id, t), {});
              }
            }
            break;
          case 'day':
            live.forEach((p) => { if (room.phase === 'day' && Math.random() < 0.6) m.ready(room, p.id); });
            if (room.phase === 'day') m.force(room, room.hostId);
            break;
          case 'vote':
            for (const p of live) {
              if (room.phase !== 'vote') break;
              const others = live.filter((q) => q.id !== p.id);
              const t = Math.random() < 0.15 ? null : others[Math.floor(Math.random() * others.length)].id;
              assert.deepStrictEqual(m.vote(room, p.id, t), {});
            }
            break;
          case 'trial':
            for (const p of live) {
              if (room.phase !== 'trial') break;
              if (p.id !== room.accused) assert.deepStrictEqual(m.judge(room, p.id, Math.random() < 0.6), {});
            }
            break;
          default:
            assert.fail(`예상 못한 단계 ${room.phase}`);
        }
        const mafia = alive(room).filter((p) => p.role === 'mafia').length;
        if (room.phase !== 'over' && !room.pendingWinner) assert.ok(mafia > 0 && mafia < alive(room).length - mafia, '끝났어야 하는 상태예요');
      }
      assert.strictEqual(room.phase, 'over', `${n}명 ${g}판이 끝나지 않았어요`);
      const mafia = alive(room).filter((p) => p.role === 'mafia').length;
      if (room.winner === 'citizen') assert.strictEqual(mafia, 0);
      else assert.ok(mafia >= alive(room).length - mafia);
    }
  }
});


// ---- 낮부터 시작 ----

test('게임은 1일차 낮부터 시작한다: 밤사이 일어난 일이 없고, 채팅은 전체, 밤 행동은 불가', () => {
  const room = mkDay(ROLES6);
  assert.strictEqual(room.phase, 'day');
  const v = m.viewFor(room, id(room, 0));
  assert.strictEqual(v.day, 1);
  assert.strictEqual(v.lastNight, null);
  assert.strictEqual(v.canChat, 'all');
  assert.ok(night(room, 0, 4).error); // 아직 밤이 아니다
  assert.deepStrictEqual(m.chat(room, id(room, 4), '안녕'), {});
  assert.strictEqual(m.viewFor(room, id(room, 3)).chat.length, 1); // 마피아가 아니어도 낮 채팅은 보인다
  assert.ok(room.log.some((l) => l.text.includes('1일차 낮')));
  assert.ok(room.players.every((p) => p.alive));
});

test('낮 → 투표 → 밤 → 낮 순서로 진행되고 날짜는 밤이 지나야 올라간다', () => {
  const room = mkDay(ROLES6);
  room.players.forEach((p) => m.ready(room, p.id));
  assert.strictEqual(room.phase, 'vote');
  room.players.forEach((p) => m.vote(room, p.id, null));
  room.players.forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'night');
  assert.strictEqual(room.day, 1); // 1일차 낮 다음은 1번째 밤
  night(room, 0, 4); night(room, 1, 4); night(room, 2, 0); night(room, 3, 3);
  assert.strictEqual(room.phase, 'day');
  assert.strictEqual(room.day, 2); // 밤이 끝나야 2일차
  assert.strictEqual(m.viewFor(room, id(room, 0)).lastNight.victim, id(room, 4));
});

test('1일차 낮의 투표로도 처형되고, 마지막 마피아를 처형하면 그 자리에서 시민팀이 이긴다', () => {
  const room = mkDay(ROLES5); // 마피아 1명
  room.players.forEach((p) => m.ready(room, p.id));
  const mafia = id(room, 0);
  room.players.forEach((p) => { if (p.id !== mafia) m.vote(room, p.id, mafia); });
  m.vote(room, mafia, null);
  trialAll(room, true);
  assert.strictEqual(room.lastVote.executed, mafia);
  assert.strictEqual(room.pendingWinner, 'citizen');
  room.players.filter((p) => p.alive).forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winner, 'citizen');
  assert.strictEqual(room.day, 1); // 밤은 한 번도 오지 않았다
});

test('1일차 낮에 시민이 처형되면 그 뒤에 첫 밤이 온다', () => {
  const room = mkDay(ROLES6);
  room.players.forEach((p) => m.ready(room, p.id));
  const target = id(room, 5);
  room.players.forEach((p) => { if (p.id !== target) m.vote(room, p.id, target); });
  m.vote(room, target, null);
  trialAll(room, true);
  assert.strictEqual(room.lastVote.executed, target);
  assert.strictEqual(room.pendingWinner, null);
  room.players.filter((p) => p.alive).forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'night');
  assert.strictEqual(P(room, 5).alive, false);
  assert.strictEqual(room.day, 1);
});


test('경찰 조사: 기본은 마피아 여부만, 옵션을 켜면 직업까지 (본인에게만)', () => {
  // 기본: role 항목 자체가 없다
  const base = mk(ROLES6);
  assert.strictEqual(base.settings.policeReveal, false);
  night(base, 2, 3); // 의사를 조사
  const log = m.viewFor(base, id(base, 2)).policeLog;
  assert.deepStrictEqual(log, [{ day: 1, target: id(base, 3), mafia: false }]);
  assert.ok(!('role' in log[0]));

  // 켜면: 마피아/의사/시민 모두 직업이 보인다
  const on = m.createRoom('MT');
  ROLES6.forEach((_, i) => m.addPlayer(on, `p${i}`));
  assert.ok(m.setSetting(on, on.players[1].id, 'policeReveal', true).error); // 방장만
  assert.deepStrictEqual(m.setSetting(on, on.hostId, 'policeReveal', true), {});
  m.start(on, on.hostId);
  on.players.forEach((p, i) => { p.role = ROLES6[i]; });
  on.players.forEach((p) => m.ack(on, p.id));
  on.players.forEach((p) => m.ready(on, p.id));
  on.players.forEach((p) => m.vote(on, p.id, null));
  on.players.forEach((p) => m.ack(on, p.id));
  assert.strictEqual(on.phase, 'night');
  night(on, 2, 3);
  assert.deepStrictEqual(m.viewFor(on, id(on, 2)).policeLog, [{ day: 1, target: id(on, 3), mafia: false, role: 'doctor' }]);
  // 경찰이 아닌 사람에게는 조사 기록이 없다
  assert.strictEqual(m.viewFor(on, id(on, 0)).policeLog, null);
  assert.strictEqual(m.viewFor(on, id(on, 3)).policeLog, null);
  // 마피아를 조사하면 마피아 직업이 나온다
  const on2 = m.createRoom('MT');
  ROLES6.forEach((_, i) => m.addPlayer(on2, `p${i}`));
  m.setSetting(on2, on2.hostId, 'policeReveal', true);
  m.start(on2, on2.hostId);
  on2.players.forEach((p, i) => { p.role = ROLES6[i]; });
  on2.players.forEach((p) => m.ack(on2, p.id));
  on2.players.forEach((p) => m.ready(on2, p.id));
  on2.players.forEach((p) => m.vote(on2, p.id, null));
  on2.players.forEach((p) => m.ack(on2, p.id));
  night(on2, 2, 0);
  assert.deepStrictEqual(m.viewFor(on2, id(on2, 2)).policeLog, [{ day: 1, target: id(on2, 0), mafia: true, role: 'mafia' }]);
});

test('시작하면 옵션을 바꿀 수 없다 (경찰 직업 공개 포함)', () => {
  const room = mk(ROLES6);
  assert.ok(m.setSetting(room, room.hostId, 'policeReveal', true).error);
  assert.strictEqual(room.settings.policeReveal, false);
});


// ---- 찬반 투표 ----

// 1일차 낮에 후보 한 명을 만든다 (나머지가 후보에게 투표)
function toTrial(roles, accusedIdx) {
  const room = mkDay(roles);
  room.players.forEach((p) => m.ready(room, p.id));
  const target = id(room, accusedIdx);
  room.players.forEach((p) => { if (p.id !== target) m.vote(room, p.id, target); });
  m.vote(room, target, null);
  assert.strictEqual(room.phase, 'trial');
  return room;
}

test('찬반 투표: 후보는 투표할 수 없고, 찬성이 반대보다 많을 때만 처형된다', () => {
  const room = toTrial(ROLES6, 5);
  const target = id(room, 5);
  assert.strictEqual(room.accused, target);
  assert.ok(m.judge(room, target, true).error); // 후보 본인
  assert.ok(m.judge(room, id(room, 0), 'yes').error); // 찬성/반대가 아닌 값
  assert.ok(m.vote(room, id(room, 0), id(room, 1)).error); // 1차 투표는 이미 끝남
  assert.deepStrictEqual(m.judge(room, id(room, 0), true), {});
  assert.ok(m.judge(room, id(room, 0), false).error); // 중복
  // 5명 중 찬성 2 (0,1) : 반대 3 (2,3,4) → 살아남는다
  m.judge(room, id(room, 1), true);
  m.judge(room, id(room, 2), false);
  m.judge(room, id(room, 3), false);
  assert.strictEqual(room.phase, 'trial');
  m.judge(room, id(room, 4), false);
  assert.strictEqual(room.phase, 'voteResult');
  assert.strictEqual(room.lastVote.executed, null);
  assert.strictEqual(room.lastVote.accused, target);
  assert.deepStrictEqual([room.lastVote.trial.kill, room.lastVote.trial.spare], [2, 3]);
  assert.strictEqual(P(room, 5).alive, true);
  room.players.forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'night');

  // 찬성 3 : 반대 2 → 처형
  const r2 = toTrial(ROLES6, 5);
  [0, 1, 2].forEach((i) => m.judge(r2, id(r2, i), true));
  [3, 4].forEach((i) => m.judge(r2, id(r2, i), false));
  assert.strictEqual(r2.phase, 'voteResult');
  assert.strictEqual(r2.lastVote.executed, id(r2, 5));
  assert.strictEqual(P(r2, 5).alive, false);
});

test('찬반 투표: 동수면 살고, 죽은 사람/아직 아닌 단계에서는 거부', () => {
  // 6명 중 후보 1명 → 투표자 5명이라 동수가 안 나온다. 마피아 7명 규모에서 후보 + 투표자 짝수로 만든다.
  const room = toTrial(ROLES5, 4); // 투표자 4명
  assert.ok(m.judge(room, id(room, 0), true).error === undefined);
  m.judge(room, id(room, 1), true);
  m.judge(room, id(room, 2), false);
  m.judge(room, id(room, 3), false); // 2 : 2
  assert.strictEqual(room.phase, 'voteResult');
  assert.strictEqual(room.lastVote.executed, null);
  assert.strictEqual(P(room, 4).alive, true);
  assert.strictEqual(room.pendingWinner, null);
  room.players.forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'night'); // 아무도 안 죽었으니 밤으로

  // 낮/투표 단계에서는 찬반 투표를 할 수 없다
  const day = mkDay(ROLES6);
  assert.ok(m.judge(day, id(day, 0), true).error);
  day.players.forEach((p) => m.ready(day, p.id));
  assert.strictEqual(day.phase, 'vote');
  assert.ok(m.judge(day, id(day, 0), true).error);

  // 죽은 사람은 투표할 수 없다
  const dead = toTrial(ROLES6, 5);
  P(dead, 4).alive = false;
  assert.ok(m.judge(dead, id(dead, 4), true).error);
});

test('찬반 투표: 마지막 마피아를 찬성으로 처형하면 시민팀 승리, 반대면 게임이 계속된다', () => {
  const room = toTrial(ROLES5, 0);
  trialAll(room, true);
  assert.strictEqual(room.pendingWinner, 'citizen');
  room.players.filter((p) => p.alive).forEach((p) => m.ack(room, p.id));
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winner, 'citizen');

  const r2 = toTrial(ROLES5, 0);
  trialAll(r2, false);
  assert.strictEqual(r2.pendingWinner, null);
  assert.strictEqual(P(r2, 0).alive, true);
  r2.players.forEach((p) => m.ack(r2, p.id));
  assert.strictEqual(r2.phase, 'night');
});

test('찬반 투표: 상태 보기 — 남의 표는 개표 전에 안 보이고, 개표 뒤에 모두 공개된다', () => {
  const room = toTrial(ROLES6, 5);
  const target = id(room, 5);
  m.judge(room, id(room, 0), true);
  m.judge(room, id(room, 1), false);
  const v0 = m.viewFor(room, id(room, 0));
  const v2 = m.viewFor(room, id(room, 2));
  assert.strictEqual(v0.phase, 'trial');
  assert.strictEqual(v0.accusedId, target);
  assert.strictEqual(v0.judgeCount, 5);
  assert.deepStrictEqual(v0.myJudge, { kill: true });
  assert.strictEqual(v2.myJudge, null);
  assert.ok(v0.players.find((p) => p.id === id(room, 1)).voted);
  assert.ok(!v0.players.find((p) => p.id === id(room, 2)).voted);
  assert.strictEqual(v0.players.find((p) => p.id === target).voted, null); // 후보는 투표자가 아님
  assert.strictEqual(v0.lastVote.trial, null); // 개표 전
  assert.ok(!JSON.stringify(v2).includes('"kill":false')); // 남의 선택이 새어 나가지 않는다
  assert.strictEqual(v0.canChat, 'all'); // 찬반 투표 중에도 토론 채팅
  assert.deepStrictEqual(m.chat(room, id(room, 3), '후보는 수상해'), {});
  [2, 3, 4].forEach((i) => m.judge(room, id(room, i), i === 2));
  const after = m.viewFor(room, id(room, 3));
  assert.strictEqual(after.phase, 'voteResult');
  assert.deepStrictEqual(after.lastVote.trial.votes[id(room, 0)], true);
  assert.deepStrictEqual([after.lastVote.trial.kill, after.lastVote.trial.spare], [2, 3]);
});

test('찬반 투표: 방장 force는 안 한 사람을 반대로 세어 개표한다', () => {
  const room = toTrial(ROLES6, 5);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(m.force(room, nonHost.id).error);
  [0, 1].forEach((i) => m.judge(room, id(room, i), true));
  assert.deepStrictEqual(m.force(room, room.hostId), {}); // 나머지 3명은 반대
  assert.strictEqual(room.phase, 'voteResult');
  assert.deepStrictEqual([room.lastVote.trial.kill, room.lastVote.trial.spare], [2, 3]);
  assert.strictEqual(room.lastVote.executed, null);
});

test('투표 기록: 낮마다 1차 투표와 찬반 투표가 쌓이고, 개표 전에는 보이지 않으며, 초기화하면 사라진다', () => {
  const room = mkDay(ROLES6);
  assert.deepStrictEqual(m.viewFor(room, id(room, 0)).voteHistory, []);
  room.players.forEach((p) => m.ready(room, p.id));
  // 투표 중에는 기록이 없다 (남의 표는 비밀)
  m.vote(room, id(room, 0), id(room, 1));
  assert.deepStrictEqual(m.viewFor(room, id(room, 2)).voteHistory, []);
  room.players.slice(1).forEach((p) => m.vote(room, p.id, null));
  // 1일차: 1표뿐이지만 단독 최다득표 → 후보 → 찬반 투표 (개표 전에도 1차 결과는 기록에 있다)
  assert.strictEqual(room.phase, 'trial');
  let h = m.viewFor(room, id(room, 2)).voteHistory;
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].day, 1);
  assert.strictEqual(h[0].accused, id(room, 1));
  assert.strictEqual(h[0].trial, null);
  [0, 2, 3, 4, 5].forEach((i, n) => m.judge(room, id(room, i), n < 2)); // 찬성 2 : 반대 3 → 생존
  h = m.viewFor(room, id(room, 2)).voteHistory;
  assert.strictEqual(h.length, 1);
  assert.deepStrictEqual([h[0].trial.kill, h[0].trial.spare], [2, 3]);
  assert.strictEqual(h[0].trial.votes[id(room, 0)], true);
  assert.strictEqual(h[0].executed, null);
  assert.strictEqual(h[0].votes[id(room, 0)], id(room, 1));
  assert.strictEqual(h[0].votes[id(room, 3)], null);
  room.players.forEach((p) => m.ack(room, p.id));
  night(room, 0, 4); night(room, 1, 4); night(room, 2, 0); night(room, 3, 3); // 4번 사망
  // 2일차: 전원 기권 → 후보 없음, 기록에 남는다
  toVote(room);
  alive(room).forEach((p) => m.vote(room, p.id, null));
  h = m.viewFor(room, id(room, 2)).voteHistory;
  assert.strictEqual(h.length, 2);
  assert.deepStrictEqual(h.map((x) => x.day), [1, 2]);
  assert.strictEqual(h[1].accused, null);
  assert.strictEqual(h[1].trial, null);
  // 초기화하면 기록도 사라진다
  assert.deepStrictEqual(m.restart(room, room.hostId), {});
  assert.deepStrictEqual(m.viewFor(room, id(room, 0)).voteHistory, []);
  m.backToLobby(room, room.hostId);
  assert.deepStrictEqual(m.viewFor(room, id(room, 0)).voteHistory, []);
});

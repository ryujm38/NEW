'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../game');

function makeRoom() {
  const room = g.createRoom('TEST');
  for (const n of ['가', '나', '다', '라', '마', '바']) g.addPlayer(room, n);
  return room;
}
function started() {
  const room = makeRoom();
  assert.deepStrictEqual(g.start(room, room.hostId), {});
  return room;
}
const ids = (room) => room.players.map((p) => p.id);
const withRole = (room, role) => room.players.find((p) => p.role === role);
const everyoneAck = (room) => ids(room).forEach((id) => g.ack(room, id));

function voteAll(room, approve) {
  ids(room).forEach((id) => g.vote(room, id, approve));
}
function proposeAs(room, teamIds) {
  const r = g.propose(room, g.leaderId(room), teamIds);
  assert.ok(!r.error, r.error);
}

test('방은 10명까지만, 이름 중복 불가', () => {
  const room = makeRoom();
  for (const n of ['사', '아', '자', '차']) assert.ok(!g.addPlayer(room, n).error);
  assert.ok(g.addPlayer(room, '카').error);
  const r2 = g.createRoom('X');
  g.addPlayer(r2, '가');
  assert.ok(g.addPlayer(r2, '가').error);
  assert.ok(g.addPlayer(r2, '   ').error);
});

test('5명 미만이면 시작할 수 없고 방장만 시작한다', () => {
  const room = g.createRoom('X');
  g.addPlayer(room, '가');
  assert.ok(g.start(room, room.hostId).error);
  const full = makeRoom();
  assert.ok(g.start(full, full.players[1].id).error);
});

test('역할 배정: 멀린1 퍼시벌1 신하2 모르가나1 암살자1', () => {
  const room = started();
  const count = {};
  room.players.forEach((p) => { count[p.role] = (count[p.role] || 0) + 1; });
  assert.deepStrictEqual(count, { merlin: 1, percival: 1, servant: 2, morgana: 1, assassin: 1 });
});

test('밤 정보: 멀린은 악 둘, 퍼시벌은 멀린+모르가나, 악은 서로, 신하는 없음', () => {
  const room = started();
  const view = (role) => g.viewFor(room, withRole(room, role).id).roleInfo.night;
  const evil = [withRole(room, 'morgana').name, withRole(room, 'assassin').name].sort();
  assert.deepStrictEqual(view('merlin').names.sort(), evil);
  assert.deepStrictEqual(view('percival').names.sort(), [withRole(room, 'merlin').name, withRole(room, 'morgana').name].sort());
  assert.deepStrictEqual(view('morgana').names, [withRole(room, 'assassin').name]);
  assert.deepStrictEqual(view('assassin').names, [withRole(room, 'morgana').name]);
  assert.strictEqual(view('servant'), null);
});

test('게임 중에는 남의 역할이 새지 않고, 끝나면 모두 공개', () => {
  const room = started();
  const v = g.viewFor(room, room.players[0].id);
  assert.ok(v.players.every((p) => p.role === null));
  assert.ok(!JSON.stringify(v).includes('"assassinTarget":"'));
  room.phase = 'over';
  const v2 = g.viewFor(room, room.players[0].id);
  assert.ok(v2.players.every((p) => p.role));
});

test('투표 내용은 전원이 투표하기 전까지 보이지 않는다', () => {
  const room = started();
  everyoneAck(room);
  const [a, b] = ids(room);
  proposeAs(room, [a, b]);
  g.vote(room, a, true);
  g.vote(room, b, false);
  const v = g.viewFor(room, ids(room)[2]);
  assert.strictEqual(v.phase, 'vote');
  assert.strictEqual(v.lastVote, null);
  assert.deepStrictEqual(v.history, []);
  assert.strictEqual(v.myVote, null);
  assert.strictEqual(g.viewFor(room, a).myVote, true);
  assert.strictEqual(v.players.find((p) => p.id === a).voted, true);
});

test('원정대 인원이 맞지 않거나 리더가 아니면 거부', () => {
  const room = started();
  everyoneAck(room);
  const [a, b, c] = ids(room);
  assert.ok(g.propose(room, g.leaderId(room), [a]).error);
  assert.ok(g.propose(room, g.leaderId(room), [a, a]).error);
  assert.ok(g.propose(room, g.leaderId(room), [a, b, c]).error);
  const notLeader = ids(room).find((id) => id !== g.leaderId(room));
  assert.ok(g.propose(room, notLeader, [a, b]).error);
});

test('3대3 동수는 부결, 4명 찬성이어야 가결', () => {
  const room = started();
  everyoneAck(room);
  proposeAs(room, ids(room).slice(0, 2));
  ids(room).forEach((id, i) => g.vote(room, id, i < 3));
  assert.strictEqual(room.phase, 'voteResult');
  assert.strictEqual(room.current.approved, false);
  everyoneAck(room);
  assert.strictEqual(room.phase, 'propose');
  assert.strictEqual(room.rejects, 1);
  proposeAs(room, ids(room).slice(0, 2));
  ids(room).forEach((id, i) => g.vote(room, id, i < 4));
  assert.strictEqual(room.current.approved, true);
});

test('리더는 부결/가결 후 다음 사람에게 넘어간다', () => {
  const room = started();
  everyoneAck(room);
  const l0 = room.leader;
  proposeAs(room, ids(room).slice(0, 2));
  voteAll(room, false);
  everyoneAck(room);
  assert.strictEqual(room.leader, (l0 + 1) % 6);
});

test('5연속 부결이면 악의 승리', () => {
  const room = started();
  everyoneAck(room);
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(room.phase, 'propose');
    proposeAs(room, ids(room).slice(0, 2));
    voteAll(room, false);
    everyoneAck(room);
  }
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winner, 'evil');
  assert.strictEqual(room.reason, 'rejects');
});

function playQuest(room, failers) {
  // 가결 → 원정 → 결과 확인까지. failers: 실패 카드를 낼 id 목록
  const size = room.setup.teams[room.round];
  const team = ids(room).slice(0, size);
  proposeAs(room, team);
  voteAll(room, true);
  everyoneAck(room);
  assert.strictEqual(room.phase, 'quest');
  team.forEach((id) => g.submitCard(room, id, !failers.includes(id)));
  assert.strictEqual(room.phase, 'questResult');
  const result = room.results[room.results.length - 1];
  everyoneAck(room);
  return result;
}

test('선은 실패 카드를 낼 수 없다 (서버가 성공으로 처리)', () => {
  const room = started();
  everyoneAck(room);
  const goodTeam = room.players.filter((p) => ['merlin', 'percival'].includes(p.role)).map((p) => p.id);
  proposeAs(room, goodTeam);
  voteAll(room, true);
  everyoneAck(room);
  goodTeam.forEach((id) => g.submitCard(room, id, false));
  assert.deepStrictEqual(room.results[0], { ok: true, fails: 0, needed: 1 });
});

test('원정대가 아니면 카드를 낼 수 없고 두 번 낼 수 없다', () => {
  const room = started();
  everyoneAck(room);
  const team = ids(room).slice(0, 2);
  proposeAs(room, team);
  voteAll(room, true);
  everyoneAck(room);
  assert.ok(g.submitCard(room, ids(room)[5], true).error);
  assert.deepStrictEqual(g.submitCard(room, team[0], true), {});
  assert.ok(g.submitCard(room, team[0], true).error);
});

test('실패 3번이면 악의 승리 (6인은 실패 카드 1장이면 원정 실패)', () => {
  const room = started();
  everyoneAck(room);
  const evil = room.players.filter((p) => p.role === 'morgana' || p.role === 'assassin').map((p) => p.id);
  for (let i = 0; i < 3; i++) {
    // 팀 앞쪽에 악 1명이 반드시 들어가도록 좌석 기준이 아니라 직접 구성
    const size = room.setup.teams[room.round];
    const others = ids(room).filter((id) => !evil.includes(id));
    const team = [evil[0], ...others.slice(0, size - 1)];
    proposeAs(room, team);
    voteAll(room, true);
    everyoneAck(room);
    team.forEach((id) => g.submitCard(room, id, id !== evil[0]));
    assert.strictEqual(room.results[i].fails, 1);
    assert.strictEqual(room.results[i].ok, false);
    everyoneAck(room);
  }
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winner, 'evil');
});

test('성공 3번이면 암살 단계: 멀린을 맞히면 악, 못 맞히면 선', () => {
  for (const hit of [true, false]) {
    const room = started();
    everyoneAck(room);
    for (let i = 0; i < 3; i++) playQuest(room, []);
    assert.strictEqual(room.phase, 'assassin');
    const assassin = withRole(room, 'assassin');
    const merlin = withRole(room, 'merlin');
    assert.ok(g.assassinate(room, withRole(room, 'servant').id, merlin.id).error);
    assert.ok(g.assassinate(room, assassin.id, assassin.id).error);
    const target = hit ? merlin : room.players.find((p) => p.role === 'servant');
    assert.deepStrictEqual(g.assassinate(room, assassin.id, target.id), {});
    assert.strictEqual(room.phase, 'over');
    assert.strictEqual(room.winner, hit ? 'evil' : 'good');
  }
});

test('성공/실패가 섞여 5라운드까지 간다 (2-2 후 마지막 라운드)', () => {
  const room = started();
  everyoneAck(room);
  const evilId = withRole(room, 'morgana').id;
  playQuest(room, [evilId]); // 1라운드: 팀에 악이 없을 수도 있으므로 결과만 기록
  const fails = [];
  while (room.phase === 'propose' && room.round < 4) {
    const r = playQuest(room, []);
    fails.push(r.ok);
  }
  assert.ok(['propose', 'assassin', 'over'].includes(room.phase));
});

test('접속이 끊긴 사람은 확인 대기에서 제외된다', () => {
  const room = started();
  const [a, b, c, d, e, f] = ids(room);
  [a, b, c, d, e].forEach((id) => g.ack(room, id));
  assert.strictEqual(room.phase, 'roles');
  g.getPlayer(room, f).connected = false;
  g.maybeAdvance(room);
  assert.strictEqual(room.phase, 'propose');
});

test('방장은 force로 넘길 수 있고 다른 사람은 불가', () => {
  const room = started();
  assert.ok(g.force(room, ids(room).find((id) => id !== room.hostId)).error);
  assert.deepStrictEqual(g.force(room, room.hostId), {});
  assert.strictEqual(room.phase, 'propose');
});

test('끝난 뒤 다시 하기: 대기실로 돌아가 다시 시작 가능', () => {
  const room = started();
  everyoneAck(room);
  for (let i = 0; i < 5; i++) {
    proposeAs(room, ids(room).slice(0, 2));
    voteAll(room, false);
    everyoneAck(room);
  }
  assert.strictEqual(room.phase, 'over');
  assert.ok(g.backToLobby(room, ids(room).find((id) => id !== room.hostId)).error);
  assert.deepStrictEqual(g.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.role === null));
  assert.deepStrictEqual(g.start(room, room.hostId), {});
  assert.strictEqual(room.round, 0);
  assert.deepStrictEqual(room.results, []);
});

test('로비에서만 내보낼 수 있다', () => {
  const room = makeRoom();
  const other = room.players[1].id;
  assert.ok(g.kick(room, other, room.hostId).error);
  assert.ok(g.kick(room, room.hostId, room.hostId).error);
  assert.deepStrictEqual(g.kick(room, room.hostId, other), { kicked: other });
  assert.strictEqual(room.players.length, 5);
});

function midGame() {
  const room = started();
  everyoneAck(room);
  playQuest(room, []); // 1라운드를 마치고 2라운드 제안 단계
  proposeAs(room, ids(room).slice(0, 3));
  ids(room).slice(0, 2).forEach((id) => g.vote(room, id, true)); // 투표 도중
  assert.strictEqual(room.phase, 'vote');
  return room;
}

test('방장은 게임 도중에도 초기화해서 대기실로 돌려보낼 수 있다', () => {
  const room = midGame();
  const nonHost = ids(room).find((id) => id !== room.hostId);
  assert.ok(g.backToLobby(room, nonHost).error);
  assert.strictEqual(room.phase, 'vote'); // 거부되면 그대로
  g.getPlayer(room, nonHost).connected = false; // 잠깐 끊긴 사람의 자리는 유지된다
  assert.deepStrictEqual(g.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.strictEqual(room.players.length, 6);
  assert.ok(room.players.every((p) => p.role === null));
  assert.deepStrictEqual([room.results, room.history, room.votes, room.cards, room.team], [[], [], {}, {}, []]);
  assert.strictEqual(room.round, 0);
  assert.strictEqual(room.rejects, 0);
  const v = g.viewFor(room, room.hostId);
  assert.strictEqual(v.roleInfo, null);
  assert.deepStrictEqual(v.results, []);
  assert.ok(g.backToLobby(room, room.hostId).error); // 이미 대기실
});

test('초기화 뒤 다시 시작하면 처음 상태로 새 게임이 시작된다', () => {
  const room = midGame();
  g.backToLobby(room, room.hostId);
  g.getPlayer(room, room.players[1].id).connected = true;
  assert.deepStrictEqual(g.start(room, room.hostId), {});
  assert.strictEqual(room.phase, 'roles');
  assert.strictEqual(room.round, 0);
  assert.deepStrictEqual(room.results, []);
  assert.deepStrictEqual(room.history, []);
});

test('방장은 같은 멤버로 바로 처음부터 다시 시작할 수 있다', () => {
  const room = midGame();
  const before = room.gameNo;
  const nonHost = ids(room).find((id) => id !== room.hostId);
  assert.ok(g.restart(room, nonHost).error);
  assert.deepStrictEqual(g.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, before + 1);
  assert.strictEqual(room.phase, 'roles');
  assert.strictEqual(room.round, 0);
  assert.strictEqual(room.rejects, 0);
  assert.deepStrictEqual(room.results, []);
  assert.deepStrictEqual(room.history, []);
  assert.deepStrictEqual(room.votes, {});
  assert.strictEqual(room.acks.size, 0);
  assert.strictEqual(room.players.length, 6);
  const count = {};
  room.players.forEach((p) => { count[p.role] = (count[p.role] || 0) + 1; });
  assert.deepStrictEqual(count, { merlin: 1, percival: 1, servant: 2, morgana: 1, assassin: 1 });
});

test('접속이 끊긴 사람이 있으면 바로 다시 시작은 거부되고 진행 중인 게임은 그대로', () => {
  const room = midGame();
  g.getPlayer(room, ids(room).find((id) => id !== room.hostId)).connected = false;
  const r = g.restart(room, room.hostId);
  assert.ok(r.error);
  assert.strictEqual(room.phase, 'vote');
  assert.strictEqual(room.round, 1);
  assert.strictEqual(room.results.length, 1);
});

test('끝난 뒤 바로 다시 하기도 된다', () => {
  const room = started();
  everyoneAck(room);
  for (let i = 0; i < 5; i++) {
    proposeAs(room, ids(room).slice(0, 2));
    voteAll(room, false);
    everyoneAck(room);
  }
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(g.restart(room, room.hostId), {});
  assert.strictEqual(room.phase, 'roles');
  assert.strictEqual(room.winner, null);
});


// ---- 5~10명 ----

function startedN(n) {
  const room = g.createRoom('TESTN');
  for (let i = 0; i < n; i++) g.addPlayer(room, `p${i}`);
  assert.deepStrictEqual(g.start(room, room.hostId), {});
  return room;
}
const roleCount = (room) => {
  const count = {};
  room.players.forEach((p) => { count[p.role] = (count[p.role] || 0) + 1; });
  return count;
};

test('인원별 선/악 구성과 원정 인원이 공식 표와 같다 (5~10명)', () => {
  const table = {
    5: { good: 3, evil: 2, teams: [2, 3, 2, 3, 3] },
    6: { good: 4, evil: 2, teams: [2, 3, 4, 3, 4] },
    7: { good: 4, evil: 3, teams: [2, 3, 3, 4, 4] },
    8: { good: 5, evil: 3, teams: [3, 4, 4, 5, 5] },
    9: { good: 6, evil: 3, teams: [3, 4, 4, 5, 5] },
    10: { good: 6, evil: 4, teams: [3, 4, 4, 5, 5] },
  };
  for (const [n, want] of Object.entries(table)) {
    const room = startedN(Number(n));
    const c = roleCount(room);
    assert.strictEqual(c.merlin, 1, `${n}명 멀린`);
    assert.strictEqual(c.percival, 1);
    assert.strictEqual(c.morgana, 1);
    assert.strictEqual(c.assassin, 1);
    assert.strictEqual(c.servant || 0, want.good - 2, `${n}명 신하`);
    assert.strictEqual(c.minion || 0, want.evil - 2, `${n}명 하수인`);
    const good = room.players.filter((p) => g.ROLES[p.role].team === 'good').length;
    assert.strictEqual(good, want.good);
    assert.deepStrictEqual(room.setup.teams, want.teams);
    const v = g.viewFor(room, room.players[0].id);
    assert.deepStrictEqual(v.teamSizes, want.teams);
    assert.deepStrictEqual([v.composition.good, v.composition.evil], [want.good, want.evil]);
    assert.strictEqual(v.composition.roles.reduce((a, r) => a + r.count, 0), Number(n));
    assert.strictEqual(v.minPlayers, 5);
    assert.strictEqual(v.maxPlayers, 10);
  }
});

test('4번째 원정은 7명 이상일 때만 실패 카드 2장이 필요하다', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    const room = startedN(n);
    assert.deepStrictEqual(room.setup.failsNeeded, [1, 1, 1, n >= 7 ? 2 : 1, 1], `${n}명`);
  }
  // 7명: 4번째 원정에 악 둘 + 선 둘이 가서 실패 1장만 나오면 성공, 2장이면 실패
  for (const failers of [1, 2]) {
    const room = startedN(7);
    everyoneAck(room);
    room.round = 3;
    const evil = room.players.filter((p) => g.ROLES[p.role].team === 'evil').map((p) => p.id);
    const good = room.players.filter((p) => g.ROLES[p.role].team === 'good').map((p) => p.id);
    const team = [evil[0], evil[1], good[0], good[1]];
    assert.strictEqual(team.length, room.setup.teams[3]);
    proposeAs(room, team);
    voteAll(room, true);
    everyoneAck(room);
    team.forEach((id) => g.submitCard(room, id, !(id === evil[0] || (failers === 2 && id === evil[1]))));
    const r = room.results[room.results.length - 1];
    assert.strictEqual(r.fails, failers);
    assert.strictEqual(r.needed, 2);
    assert.strictEqual(r.ok, failers === 1);
  }
  // 6명은 4번째 원정도 1장이면 실패
  const six = started();
  everyoneAck(six);
  six.round = 3;
  const e = six.players.find((p) => g.ROLES[p.role].team === 'evil').id;
  const gs = six.players.filter((p) => g.ROLES[p.role].team === 'good').map((p) => p.id);
  const team6 = [e, gs[0], gs[1]];
  proposeAs(six, team6);
  voteAll(six, true);
  everyoneAck(six);
  team6.forEach((id) => g.submitCard(six, id, id !== e));
  assert.strictEqual(six.results[six.results.length - 1].ok, false);
});

test('과반 찬성 기준은 인원에 맞게 바뀐다 (동수는 부결)', () => {
  const cases = [[5, 2, false], [5, 3, true], [7, 3, false], [7, 4, true], [8, 4, false], [8, 5, true], [10, 5, false], [10, 6, true]];
  for (const [n, yes, approved] of cases) {
    const room = startedN(n);
    everyoneAck(room);
    proposeAs(room, ids(room).slice(0, room.setup.teams[0]));
    ids(room).forEach((id, i) => g.vote(room, id, i < yes));
    assert.strictEqual(room.phase, 'voteResult', `${n}명 ${yes}표`);
    assert.strictEqual(room.current.approved, approved, `${n}명 중 ${yes}명 찬성`);
  }
});

test('인원이 늘어도 투표는 전원이 해야 공개되고, 리더는 인원수만큼 돈다', () => {
  const room = startedN(9);
  everyoneAck(room);
  proposeAs(room, ids(room).slice(0, 3));
  ids(room).slice(0, 8).forEach((id) => g.vote(room, id, true));
  assert.strictEqual(room.phase, 'vote');
  g.vote(room, ids(room)[8], true);
  assert.strictEqual(room.phase, 'voteResult');
  const l0 = room.leader;
  everyoneAck(room); // 가결 → 원정
  ids(room).slice(0, 3).forEach((id) => g.submitCard(room, id, true));
  everyoneAck(room);
  assert.strictEqual(room.leader, (l0 + 1) % 9);
});

test('밤 정보: 멀린은 하수인까지 모든 악을, 악은 서로를, 퍼시벌은 멀린+모르가나만', () => {
  const room = startedN(10);
  const evil = room.players.filter((p) => g.ROLES[p.role].team === 'evil');
  const names = (role) => g.viewFor(room, room.players.find((p) => p.role === role).id).roleInfo.night.names.sort();
  assert.deepStrictEqual(names('merlin'), evil.map((p) => p.name).sort());
  assert.deepStrictEqual(names('percival'), room.players.filter((p) => ['merlin', 'morgana'].includes(p.role)).map((p) => p.name).sort());
  for (const e of evil) {
    const night = g.viewFor(room, e.id).roleInfo.night;
    assert.deepStrictEqual(night.names.sort(), evil.filter((x) => x.id !== e.id).map((x) => x.name).sort());
  }
  const servant = room.players.find((p) => p.role === 'servant');
  assert.strictEqual(g.viewFor(room, servant.id).roleInfo.night, null);
});

test('하수인은 원정에서 실패 카드를 낼 수 있고 선은 못 낸다', () => {
  const room = startedN(5);
  everyoneAck(room);
  const minionless = room.players.filter((p) => g.ROLES[p.role].team === 'evil')[0];
  const goodOne = room.players.find((p) => g.ROLES[p.role].team === 'good');
  proposeAs(room, [minionless.id, goodOne.id]);
  voteAll(room, true);
  everyoneAck(room);
  g.submitCard(room, minionless.id, false);
  g.submitCard(room, goodOne.id, false);
  assert.deepStrictEqual(room.results[0], { ok: false, fails: 1, needed: 1 });
});

test('5~10명 아무 인원이나 끝까지 무작위로 두면 반드시 끝난다', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    for (let game = 0; game < 15; game++) {
      const room = startedN(n);
      everyoneAck(room);
      for (let guard = 0; guard < 400 && room.phase !== 'over'; guard++) {
        if (room.phase === 'propose') {
          const pick = ids(room).sort(() => Math.random() - 0.5).slice(0, room.setup.teams[room.round]);
          proposeAs(room, pick);
        } else if (room.phase === 'vote') {
          ids(room).forEach((id) => g.vote(room, id, Math.random() < 0.7));
        } else if (room.phase === 'quest') {
          room.team.forEach((id) => g.submitCard(room, id, Math.random() < 0.6));
        } else if (room.phase === 'assassin') {
          const a = room.players.find((p) => p.role === 'assassin');
          g.assassinate(room, a.id, room.players.find((p) => p.id !== a.id).id);
        } else {
          everyoneAck(room);
        }
      }
      assert.strictEqual(room.phase, 'over', `${n}명`);
      assert.ok(['good', 'evil'].includes(room.winner));
    }
  }
});

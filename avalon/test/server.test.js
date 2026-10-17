'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');
const { createAppServer } = require('../server');

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, id: null, token: null, code: null, errors: [], gone: false, waiters: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'joined') Object.assign(c, { id: m.id, token: m.token, code: m.code });
    if (m.t === 'state') c.state = m.state;
    if (m.t === 'error') c.errors.push(m.msg);
    if (m.t === 'gone') c.gone = true;
    c.waiters = c.waiters.filter((w) => !w());
  });
  c.open = new Promise((res) => ws.on('open', res));
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 2000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout; state=' + JSON.stringify(c.state && c.state.phase))), ms);
    const check = () => (pred(c) ? (clearTimeout(t), res(), true) : false);
    if (!check()) c.waiters.push(check);
  });
  return c;
}

async function setup() {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  for (let i = 0; i < 6; i++) {
    const c = client(port);
    await c.open;
    cs.push(c);
  }
  cs[0].send({ t: 'create', name: '방장' });
  await cs[0].until((c) => c.code);
  for (let i = 1; i < 6; i++) {
    cs[i].send({ t: 'join', code: cs[0].code.toLowerCase(), name: `친구${i}` });
    await cs[i].until((c) => c.state);
  }
  return { httpServer, port, cs };
}
const close = ({ httpServer, cs }) => { cs.forEach((c) => c.ws.terminate()); httpServer.closeAllConnections?.(); httpServer.close(); };

function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

test('정적 파일과 헬스체크, 상위 폴더 접근 차단', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  try {
    const port = httpServer.address().port;
    const base = `http://127.0.0.1:${port}`;
    assert.strictEqual((await fetch(base + '/')).status, 200);
    assert.match(await (await fetch(base + '/app.js')).text(), /WebSocket/);
    assert.strictEqual((await fetch(base + '/healthz')).status, 200);
    assert.strictEqual((await fetch(base + '/없는파일')).status, 404);
    // 인코딩된 ..도 막혀야 한다 (fetch는 미리 정리해 버리므로 날 것 그대로 보낸다)
    assert.strictEqual(await rawGet(port, '/%2e%2e/server.js'), 403);
    assert.strictEqual(await rawGet(port, '/..%2fserver.js'), 403);
    assert.strictEqual(await rawGet(port, '/%2e%2e/%2e%2e/etc/passwd'), 403);
  } finally {
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('아발론 방은 10명까지만 들어오고, 같은 이름은 거부된다', async () => {
  const s = await setup();
  try {
    const dup = client(s.port);
    await dup.open;
    s.cs.push(dup);
    dup.send({ t: 'join', code: s.cs[0].code, name: '친구1' }); // 이미 있는 이름
    await dup.until((c) => c.errors.length);
    assert.match(dup.errors[0], /같은 이름/);
    for (let i = 0; i < 4; i++) {
      const c = client(s.port);
      await c.open;
      s.cs.push(c);
      c.send({ t: 'join', code: s.cs[0].code, name: `추가${i}` });
      await c.until((x) => x.state);
    }
    const extra = client(s.port);
    await extra.open;
    s.cs.push(extra);
    extra.send({ t: 'join', code: s.cs[0].code, name: '열한째' });
    await extra.until((c) => c.errors.length);
    assert.match(extra.errors[0], /가득/);
  } finally {
    close(s);
  }
});

test('6명이 실제 서버로 한 판을 끝까지 + 재접속', async () => {
  const s = await setup();
  const { cs } = s;
  cs[0].send({ t: 'start' });
  await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'roles')));
  assert.ok(cs.every((c) => c.state.roleInfo));
  assert.ok(cs.every((c) => c.state.players.every((p) => p.role === null)));

  // 3번 연속 원정을 성공시켜 암살 단계까지 간다
  const ack = async (phase) => {
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === phase)));
    cs.forEach((c) => c.send({ t: 'ack' }));
  };
  await ack('roles');
  for (let round = 0; round < 3; round++) {
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'propose' && x.state.round === round)));
    const leader = cs.find((c) => c.id === cs[0].state.leaderId);
    const size = cs[0].state.teamSize;
    const team = cs.slice(0, size).map((c) => c.id);
    leader.send({ t: 'draft', team });
    await cs[3].until((x) => x.state.draft.length === size); // 실시간 초안이 다른 사람에게도 보인다
    leader.send({ t: 'propose', team });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'vote')));

    if (round === 1) {
      // 투표 도중 한 명이 새로고침(재접속)해도 상태가 이어진다
      const old = cs[4];
      const fresh = client(s.port);
      await fresh.open;
      fresh.send({ t: 'resume', code: old.code, token: old.token });
      await fresh.until((x) => x.state);
      assert.strictEqual(fresh.id, old.id);
      assert.strictEqual(fresh.state.phase, 'vote');
      assert.ok(fresh.state.roleInfo);
      old.ws.terminate();
      cs[4] = Object.assign(fresh, { code: old.code, token: old.token, id: old.id });
    }

    cs.forEach((c) => c.send({ t: 'vote', approve: true }));
    await ack('voteResult');
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'quest')));
    cs.slice(0, size).forEach((c) => c.send({ t: 'card', success: true }));
    await ack('questResult');
  }
  await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'assassin')));
  const assassin = cs.find((c) => c.state.roleInfo.key === 'assassin');
  const merlin = cs.find((c) => c.state.roleInfo.key === 'merlin');
  assassin.send({ t: 'assassinate', target: merlin.id });
  await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'over')));
  assert.strictEqual(cs[0].state.winner, 'evil');
  assert.ok(cs[0].state.players.every((p) => p.role));

  cs[0].send({ t: 'again' });
  await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'lobby')));
  close(s);
});

test('로비에서 끊겼다 토큰으로 돌아오고, 잘못된 토큰은 거부', async () => {
  const s = await setup();
  const { cs } = s;
  const victim = cs[2];
  victim.ws.terminate();
  await cs[0].until((c) => c.state.players.some((p) => !p.connected));
  const back = client(s.port);
  await back.open;
  back.send({ t: 'resume', code: victim.code, token: victim.token });
  await back.until((c) => c.state);
  assert.ok(back.state.players.every((p) => p.connected));
  const bad = client(s.port);
  await bad.open;
  bad.send({ t: 'resume', code: victim.code, token: 'nope' });
  await bad.until((c) => c.gone);
  cs.push(back, bad);
  close(s);
});

test('방장이 아니면 시작/내보내기 불가', async () => {
  const s = await setup();
  s.cs[1].send({ t: 'start' });
  await s.cs[1].until((c) => c.errors.length);
  s.cs[1].send({ t: 'kick', target: s.cs[2].id });
  await s.cs[1].until((c) => c.errors.length === 2);
  close(s);
});

test('게임 도중 방장의 초기화/다시 시작이 모두의 화면에 반영된다', async () => {
  const s = await setup();
  const { cs } = s;
  const all = (pred) => Promise.all(cs.map((c) => c.until(pred)));
  cs[0].send({ t: 'start' });
  await all((x) => x.state.phase === 'roles');
  cs.forEach((c) => c.send({ t: 'ack' }));
  await all((x) => x.state.phase === 'propose');
  const gameNo = cs[0].state.gameNo;

  // 방장이 아닌 사람은 못 한다
  cs[1].send({ t: 'again' });
  await cs[1].until((x) => x.errors.length === 1);
  cs[1].send({ t: 'restart' });
  await cs[1].until((x) => x.errors.length === 2);
  assert.strictEqual(cs[1].state.phase, 'propose');

  // 같은 멤버로 바로 다시 시작: 역할 확인 단계로, 판 번호가 오른다
  cs[0].send({ t: 'restart' });
  await all((x) => x.state.phase === 'roles' && x.state.gameNo === gameNo + 1);
  assert.ok(cs.every((c) => c.state.roleInfo));

  // 초기화: 모두 대기실로, 역할은 사라진다
  cs[0].send({ t: 'again' });
  await all((x) => x.state.phase === 'lobby');
  assert.ok(cs.every((c) => c.state.roleInfo === null && c.state.players.length === 6));

  // 다시 시작할 수 있다
  cs[0].send({ t: 'start' });
  await all((x) => x.state.phase === 'roles');
  close(s);
});

test('우노 방: 만들기·입장·시작, 내 손패만 받고, 차례가 아니면 거부, 다른 게임 요청은 거부', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'uno' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'uno');
    for (let i = 1; i < 3; i++) {
      cs[i].send({ t: 'join', code: cs[0].code, name: `친구${i}` });
      await cs[i].until((c) => c.state);
    }
    // 2명 미만이면 시작 불가, 방장만 시작
    cs[1].send({ t: 'start' });
    await cs[1].until((c) => c.errors.length === 1);
    cs[0].send({ t: 'start' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'play')));
    assert.ok(cs.every((c) => c.state.hand.length === 7));
    assert.ok(cs.every((c) => c.state.players.every((p) => p.count === 7 && !('hand' in p))));
    const mine = new Set(cs[0].state.hand.map((x) => x.id));
    assert.ok(cs[1].state.hand.every((x) => !mine.has(x.id)));

    // 아발론 전용 요청과 이상한 요청은 거부
    cs[0].send({ t: 'vote', approve: true });
    cs[0].send({ t: 'constructor' });
    cs[0].send({ t: '__proto__' });
    await cs[0].until((c) => c.errors.length === 3);

    // 차례가 아닌 사람은 뽑을 수 없고, 차례인 사람은 뽑을 수 있다
    const turnId = cs[0].state.turnId;
    const me = cs.find((c) => c.id === turnId);
    const other = cs.find((c) => c.id !== turnId);
    other.send({ t: 'draw' });
    await other.until((c) => c.errors.length >= 1 && /차례/.test(c.errors[c.errors.length - 1]));
    const before = me.state.hand.length;
    me.send({ t: 'draw' });
    await me.until((c) => c.state.hand.length === before + 1);

    // 끊겼다 토큰으로 돌아와도 같은 손패
    const victim = cs[2];
    const handBefore = victim.state.hand.map((x) => x.id).join();
    victim.ws.terminate();
    await cs[0].until((c) => c.state.players.some((p) => !p.connected));
    const back = client(port);
    await back.open;
    back.send({ t: 'resume', code: victim.code, token: victim.token });
    await back.until((c) => c.state);
    assert.strictEqual(back.state.hand.map((x) => x.id).join(), handBefore);
    cs.push(back);

    // 방장 초기화
    cs[0].send({ t: 'again' });
    await cs[0].until((c) => c.state.phase === 'lobby');
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('아발론 방에 우노 요청을 보내면 거부된다', async () => {
  const s = await setup();
  s.cs[0].send({ t: 'draw' });
  s.cs[0].send({ t: 'play', card: 1 });
  await s.cs[0].until((c) => c.errors.length === 2);
  close(s);
});

test('뱅 방: 4명이 접속해 시작하고, 자기 역할과 손패만 받고, 재접속해도 같고, 다른 게임 요청은 거부', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 4; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'bang' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'bang');
    for (let i = 1; i < 4; i++) {
      cs[i].send({ t: 'join', code: cs[0].code, name: `친구${i}` });
      await cs[i].until((c) => c.state);
    }
    cs[0].send({ t: 'start' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'play')));
    const meOf = (c) => c.state.players.find((p) => p.id === c.id);
    assert.ok(cs.every((c) => meOf(c).role && c.state.hand.length >= 3)); // 시작 손패 = 체력 (3~5장)
    // 다른 사람의 정체(보안관 제외)와 손패는 보이지 않는다
    for (const c of cs) {
      for (const p of c.state.players) {
        if (p.id !== c.id && p.role !== 'sheriff') assert.strictEqual(p.role, null);
        assert.ok(!('hand' in p));
      }
    }
    assert.strictEqual(cs.filter((c) => meOf(c).role === 'sheriff').length, 1);

    // 아발론/우노 전용 요청은 거부
    cs[0].send({ t: 'vote', approve: true });
    cs[0].send({ t: 'ack' });
    await cs[0].until((c) => c.errors.length >= 2);

    // 차례가 아닌 사람이 카드를 내면 거부, 차례인 사람이 끝내면 진행
    const turnId = cs[0].state.turnId;
    const mover = cs.find((c) => c.id === turnId);
    const other = cs.find((c) => c.id !== turnId);
    other.send({ t: 'play', card: other.state.hand[0].id });
    await other.until((c) => c.errors.length >= 1);
    // 시작 캐릭터에 따라 뽑을 때 선택이 먼저 대기 중일 수 있다 (키트 칼슨, 제시 존스)
    await mover.until((c) => c.state.mode !== 'wait');
    if (mover.state.mode === 'kit') mover.send({ t: 'choose', card: mover.state.hand.find((c) => c.ok).id });
    else if (mover.state.mode === 'drawChoice') mover.send({ t: 'choose', opt: 'deck' });
    await mover.until((c) => c.state.mode === 'main');
    mover.send({ t: 'end' });
    await mover.until((c) => c.state.turnId !== turnId || c.state.mode === 'discard');

    // 재접속해도 같은 손패
    const victim = cs[2];
    const handBefore = victim.state.hand.map((x) => x.id).join();
    victim.ws.terminate();
    await cs[0].until((c) => c.state.players.some((p) => !p.connected));
    const back = client(port);
    await back.open;
    back.send({ t: 'resume', code: victim.code, token: victim.token });
    await back.until((c) => c.state);
    assert.strictEqual(back.state.hand.map((x) => x.id).join(), handBefore);
    cs.push(back);

    cs[0].send({ t: 'again' });
    await cs[0].until((c) => c.state.phase === 'lobby');
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('마피아 방: 5명이 접속해 밤·낮·투표를 진행하고, 역할/마피아 채팅/조사 결과는 해당자에게만 보인다', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 5; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'mafia' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'mafia');
    for (let i = 1; i < 5; i++) {
      cs[i].send({ t: 'join', code: cs[0].code, name: `친구${i}` });
      await cs[i].until((c) => c.state);
    }
    // 방장만 설정을 바꾼다
    cs[1].send({ t: 'setting', key: 'revealRoles', value: false });
    await cs[1].until((c) => c.errors.length === 1);
    cs[0].send({ t: 'setting', key: 'revealRoles', value: false });
    await Promise.all(cs.map((c) => c.until((x) => x.state.settings.revealRoles === false)));
    cs[0].send({ t: 'start' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'roles')));
    const myRole = (c) => c.state.players.find((p) => p.id === c.id).role;
    assert.ok(cs.every((c) => myRole(c)));
    for (const c of cs) {
      for (const p of c.state.players) {
        if (p.id !== c.id && !(myRole(c) === 'mafia' && p.role === 'mafia')) assert.strictEqual(p.role, null);
      }
    }
    cs.forEach((c) => c.send({ t: 'ack' }));
    // 게임은 1일차 낮부터: 밤사이 일어난 일이 없고, 밤 행동은 아직 불가
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'day')));
    assert.ok(cs.every((c) => c.state.day === 1 && c.state.lastNight === null));
    // 1일차 낮 → 전원 토론 끝 → 전원 기권 → 결과 확인 → 1번째 밤
    cs.forEach((c) => c.send({ t: 'ready' }));
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'vote')));
    cs.forEach((c) => c.send({ t: 'vote', target: null }));
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'voteResult')));
    cs.forEach((c) => c.send({ t: 'ack' }));
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'night')));

    const by = (role) => cs.find((c) => myRole(c) === role);
    const mafia = by('mafia');
    const police = by('police');
    const doctor = by('doctor');
    const citizens = cs.filter((c) => myRole(c) === 'citizen');

    // 밤 채팅은 마피아에게만, 시민은 못 쓴다
    mafia.send({ t: 'chat', text: '비밀 작전' });
    citizens[0].send({ t: 'chat', text: '나도 낄래' });
    await citizens[0].until((c) => c.errors.length >= 1);
    await mafia.until((c) => c.state.chat.length === 1);
    assert.ok(cs.filter((c) => c !== mafia).every((c) => c.state.chat.length === 0));

    // 밤 행동: 마피아는 시민 한 명, 의사는 자기 자신, 경찰은 마피아를 조사
    mafia.send({ t: 'night', target: citizens[0].id });
    doctor.send({ t: 'night', target: doctor.id });
    police.send({ t: 'night', target: mafia.id });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'day')));
    assert.strictEqual(cs[0].state.players.find((p) => p.id === citizens[0].id).alive, false);
    assert.deepStrictEqual(police.state.policeLog, [{ day: 1, target: mafia.id, mafia: true }]);
    assert.ok(cs.filter((c) => c !== police).every((c) => c.state.policeLog === null));

    // 낮 채팅은 산 사람 모두에게, 죽은 사람은 못 쓴다
    mafia.send({ t: 'chat', text: '안녕' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.chat.some((l) => l.text === '안녕'))));
    assert.ok(cs.filter((c) => c !== mafia).every((c) => !c.state.chat.some((l) => l.text === '비밀 작전') || myRole(c) === 'mafia'));
    const before = citizens[0].errors.length;
    citizens[0].send({ t: 'chat', text: '억울해' });
    await citizens[0].until((c) => c.errors.length > before);

    // 토론 끝 → 투표 (전원이 마피아에게)
    const live = cs.filter((c) => c !== citizens[0]);
    live.forEach((c) => c.send({ t: 'ready' }));
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'vote')));
    live.forEach((c) => c.send({ t: 'vote', target: c === mafia ? police.id : mafia.id }));
    // 단독 최다득표자(마피아)가 처형 후보가 되어 찬반 투표로 넘어간다
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'trial')));
    assert.strictEqual(cs[0].state.accusedId, mafia.id);
    const errsBefore = mafia.errors.length;
    mafia.send({ t: 'judge', kill: false }); // 후보 본인은 투표할 수 없다
    await mafia.until((c) => c.errors.length > errsBefore);
    live.filter((c) => c !== mafia).forEach((c) => c.send({ t: 'judge', kill: true }));
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'voteResult' || x.state.phase === 'over')));
    assert.strictEqual(cs[0].state.lastVote.executed, mafia.id);
    assert.ok(cs[0].state.lastVote.trial.kill > cs[0].state.lastVote.trial.spare);
    live.forEach((c) => c.send({ t: 'ack' }));
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'over')));
    assert.strictEqual(cs[0].state.winner, 'citizen');
    assert.ok(cs[0].state.players.every((p) => p.role)); // 끝나면 모두 공개

    // 아발론/우노/뱅 전용 요청은 거부
    cs[0].send({ t: 'draw' });
    cs[0].send({ t: 'propose', team: [] });
    await cs[0].until((c) => c.errors.length >= 2);
    cs[0].send({ t: 'again' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'lobby')));
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('스플렌더 방: 3명이 접속해 시작하고, 예약 카드는 본인에게만 보이고, 차례가 아니면 거부된다', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'splendor' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'splendor');
    for (let i = 1; i < 3; i++) {
      cs[i].send({ t: 'join', code: cs[0].code, name: `친구${i}` });
      await cs[i].until((c) => c.state);
    }
    cs[0].send({ t: 'start' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'play')));
    const mover = cs.find((c) => c.state.mode === 'main');
    const others = cs.filter((c) => c !== mover);
    assert.strictEqual(others.length, 2);
    assert.ok(others.every((c) => c.state.mode === 'wait'));
    others[0].send({ t: 'take', colors: ['w', 'u', 'g'] });
    await others[0].until((c) => c.errors.length >= 1);

    mover.send({ t: 'reserve', level: 1, index: 0 });
    await Promise.all(cs.map((c) => c.until((x) => x.state.players.find((p) => p.id === mover.id).reservedCount === 1)));
    const mine = mover.state.players.find((p) => p.id === mover.id);
    assert.strictEqual(mine.reserved.length, 1);
    assert.ok(others.every((c) => c.state.players.find((p) => p.id === mover.id).reserved === null));

    // 아발론/우노/뱅/마피아 전용 요청은 거부
    others[1].send({ t: 'vote', approve: true });
    others[1].send({ t: 'draw' });
    await others[1].until((c) => c.errors.length >= 2);
    cs[0].send({ t: 'again' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'lobby')));
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('부루마블 방: 설정은 방장만, 시작 후 차례인 사람만 굴리고, 다른 게임 요청은 거부된다', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'marble' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'marble');
    for (let i = 1; i < 3; i++) {
      cs[i].send({ t: 'join', code: cs[0].code, name: `친구${i}` });
      await cs[i].until((c) => c.state);
    }
    cs[1].send({ t: 'setting', key: 'maxRounds', value: 20 });
    await cs[1].until((c) => c.errors.length === 1);
    cs[0].send({ t: 'setting', key: 'maxRounds', value: 20 });
    await Promise.all(cs.map((c) => c.until((x) => x.state.settings.maxRounds === 20)));
    cs[0].send({ t: 'start' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'play')));
    assert.ok(cs.every((c) => c.state.tiles.length === 32));
    const mover = cs.find((c) => c.state.mode === 'roll');
    const others = cs.filter((c) => c !== mover);
    others[0].send({ t: 'roll' });
    await others[0].until((c) => c.errors.length >= 1);
    mover.send({ t: 'roll' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.dice !== null)));
    assert.strictEqual(cs[0].state.diceBy, mover.id);
    // 다른 게임 요청은 거부
    others[1].send({ t: 'vote', approve: true });
    others[1].send({ t: 'draw' });
    others[1].send({ t: 'take', colors: ['w'] });
    await others[1].until((c) => c.errors.length >= 3);
    cs[0].send({ t: 'again' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'lobby')));
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('보난자 방: 3명이 접속해 시작하고, 손패는 본인에게만 보이고, 거래 제안/수락이 서버를 통해 동작한다', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'bohnanza' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'bohnanza');
    for (let i = 1; i < 3; i++) {
      cs[i].send({ t: 'join', code: cs[0].code, name: `친구${i}` });
      await cs[i].until((c) => c.state);
    }
    cs[0].send({ t: 'start' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'play')));
    assert.ok(cs.every((c) => c.state.hand.length === 5));
    const mover = cs.find((c) => c.state.mode === 'plant1');
    const others = cs.filter((c) => c !== mover);
    // 다른 사람의 손패는 보이지 않는다
    const mine = new Set(mover.state.hand.map((x) => x.id));
    assert.ok(others.every((c) => c.state.hand.every((x) => !mine.has(x.id))));
    assert.ok(others.every((c) => c.state.players.every((p) => !('hand' in p))));

    // 차례가 아닌 사람은 심을 수 없고, 차례인 사람은 맨 앞 카드를 심는다
    others[0].send({ t: 'plant', card: others[0].state.hand[0].id, field: 0 });
    await others[0].until((c) => c.errors.length >= 1);
    mover.send({ t: 'plant', card: mover.state.hand[0].id, field: 0 });
    await mover.until((c) => c.state.plantCount === 1);
    mover.send({ t: 'skipPlant' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.step === 'trade')));
    assert.strictEqual(mover.state.faceUp.length, 2);
    assert.ok(others.every((c) => c.state.faceUp.length === 2)); // 펼친 카드는 모두에게 보인다

    // 거래: 친구가 손패 한 장을 주고 펼친 카드 한 장을 받겠다고 제안 → 수락
    const want = mover.state.faceUp[0];
    const give = others[0].state.hand[0];
    others[0].send({ t: 'propose', give: [give.id], want: [want.id] });
    await mover.until((c) => c.state.proposals.length === 1);
    others[1].send({ t: 'accept', from: others[0].id }); // 차례가 아닌 사람은 수락 불가
    await others[1].until((c) => c.errors.length >= 1);
    mover.send({ t: 'accept', from: others[0].id });
    await Promise.all(cs.map((c) => c.until((x) => x.state.proposals.length === 0 && x.state.faceUp.length === 1)));
    assert.deepStrictEqual(others[0].state.table.map((x) => x.id), [want.id]);
    assert.deepStrictEqual(mover.state.table.map((x) => x.id), [give.id]);
    assert.strictEqual(others[0].state.hand.length, 4);

    // 아발론/우노/뱅/마피아/스플렌더/부루마블 전용 요청은 거부
    others[1].send({ t: 'vote', approve: true });
    others[1].send({ t: 'draw' });
    others[1].send({ t: 'roll' });
    await others[1].until((c) => c.errors.length >= 4);
    cs[0].send({ t: 'again' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'lobby')));
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('라스베가스 방: 3명이 접속해 시작하고, 차례인 사람만 굴리고 놓을 수 있고, 굴린 주사위는 모두에게 보인다', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'vegas' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'vegas');
    for (let i = 1; i < 3; i++) {
      cs[i].send({ t: 'join', code: cs[0].code, name: `친구${i}` });
      await cs[i].until((c) => c.state);
    }
    cs[0].send({ t: 'start' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'play')));
    assert.ok(cs.every((c) => c.state.casinos.length === 6 && c.state.round === 1));
    assert.ok(cs.every((c) => c.state.casinos.every((k) => k.bills.reduce((a, b) => a + b, 0) >= 50)));
    const mover = cs.find((c) => c.state.mode === 'roll');
    const others = cs.filter((c) => c !== mover);

    // 차례가 아닌 사람은 굴릴 수 없다
    others[0].send({ t: 'roll' });
    await others[0].until((c) => c.errors.length >= 1);

    // 차례인 사람이 굴리면 모두에게 보이고, 나온 숫자 하나를 골라 놓는다
    mover.send({ t: 'roll' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.rolled && x.state.rolled.length === 8)));
    assert.strictEqual(mover.state.mode, 'place');
    const pick = mover.state.rolled[0];
    const count = mover.state.rolled.filter((v) => v === pick).length;
    others[1].send({ t: 'place', number: pick });
    await others[1].until((c) => c.errors.length >= 1);
    mover.send({ t: 'place', number: pick });
    await Promise.all(cs.map((c) => c.until((x) => x.state.rolled === null)));
    const moverId = mover.state.me;
    assert.ok(cs.every((c) => c.state.casinos[pick - 1].dice[moverId] === count));
    assert.ok(cs.every((c) => c.state.players.find((p) => p.id === moverId).dice === 8 - count));
    assert.ok(cs.every((c) => c.state.turnId !== moverId || count === 8)); // 차례가 넘어감

    // 다른 게임 전용 요청은 거부
    others[1].send({ t: 'vote', approve: true });
    others[1].send({ t: 'draw' });
    others[1].send({ t: 'plant', card: 1, field: 0 });
    await others[1].until((c) => c.errors.length >= 4);
    cs[0].send({ t: 'again' });
    await Promise.all(cs.map((c) => c.until((x) => x.state.phase === 'lobby')));
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

test('세븐 원더스 듀얼 방: 2명이 접속해 불가사의를 고르고, 차례인 사람만 카드를 가져오고, 뒷면 카드는 정체가 안 보인다', async () => {
  const { httpServer } = createAppServer();
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  const port = httpServer.address().port;
  const cs = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = client(port);
      await c.open;
      cs.push(c);
    }
    cs[0].send({ t: 'create', name: '방장', game: 'duel' });
    await cs[0].until((c) => c.code);
    assert.strictEqual(cs[0].state.kind, 'duel');
    cs[1].send({ t: 'join', code: cs[0].code, name: '친구' });
    await cs[1].until((c) => c.state);
    // 3번째 사람은 들어올 수 없다 (2명 정원)
    cs[2].send({ t: 'join', code: cs[0].code, name: '셋째' });
    await cs[2].until((c) => c.errors.length >= 1);
    const two = cs.slice(0, 2);
    cs[0].send({ t: 'start' });
    await Promise.all(two.map((c) => c.until((x) => x.state.phase === 'draft')));
    // 불가사의 고르기: 고를 차례가 아닌 사람은 거부
    let picker = two.find((c) => c.state.mode === 'draft');
    let waiter = two.find((c) => c !== picker);
    waiter.send({ t: 'draftWonder', wonder: waiter.state.draft.pool[0] });
    await waiter.until((c) => c.errors.length >= 1);
    for (let n = 0; n < 6; n++) {
      picker = two.find((c) => c.state.mode === 'draft');
      const before = picker.state.draft.pool.length;
      picker.send({ t: 'draftWonder', wonder: picker.state.draft.pool[0] });
      await Promise.all(two.map((c) => c.until((x) => x.state.phase !== 'draft' || !x.state.draft || x.state.draft.pool.length !== before || x.state.draft.set !== picker.state.draft.set)));
    }
    await Promise.all(two.map((c) => c.until((x) => x.state.phase === 'play')));
    assert.ok(two.every((c) => c.state.players.every((p) => p.wonders.length === 4)));
    const mover = two.find((c) => c.state.mode === 'pick');
    const other = two.find((c) => c !== mover);
    // 뒷면 카드는 정체가 없고, 집을 수 있는 카드는 모두 앞면
    assert.ok(other.state.slots.filter((s) => !s.up).every((s) => s.card === null));
    assert.ok(other.state.slots.filter((s) => s.open).every((s) => s.card !== null));
    assert.deepStrictEqual(other.state.costs, {});
    const slot = mover.state.slots.find((s) => s.open).i;
    other.send({ t: 'discard', slot });
    await other.until((c) => c.errors.length >= 2);
    mover.send({ t: 'discard', slot });
    await Promise.all(two.map((c) => c.until((x) => x.state.slots[slot].taken)));
    assert.strictEqual(mover.state.players.find((p) => p.id === mover.state.me).coins, 9);
    await other.until((c) => c.state.mode === 'pick');
    // 다른 게임 전용 요청은 거부
    mover.send({ t: 'vote', approve: true });
    mover.send({ t: 'roll' });
    mover.send({ t: 'plant', card: 1, field: 0 });
    await mover.until((c) => c.errors.length >= 3);
    cs[0].send({ t: 'again' });
    await Promise.all(two.map((c) => c.until((x) => x.state.phase === 'lobby')));
  } finally {
    cs.forEach((c) => c.ws.terminate());
    httpServer.closeAllConnections?.();
    httpServer.close();
  }
});

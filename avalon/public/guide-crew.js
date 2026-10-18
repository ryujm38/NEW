'use strict';
// 더 크루 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
(function () {
  const SUIT = { p: '분홍', b: '파랑', g: '초록', y: '노랑', r: '로켓' };
  const suitOf = (c) => c[0];
  const valOf = (c) => Number(c.slice(1));
  const cn = (c) => `${SUIT[suitOf(c)]} ${valOf(c)}`;
  // 지금까지 낸 카드 중 이기고 있는 카드 (엔진의 trickWinner와 같은 계산)
  function leading(plays) {
    if (!plays.length) return null;
    const led = suitOf(plays[0].card);
    const rockets = plays.filter((x) => suitOf(x.card) === 'r');
    const pool = rockets.length ? rockets : plays.filter((x) => suitOf(x.card) === led);
    return pool.reduce((b, x) => (valOf(x.card) > valOf(b.card) ? x : b));
  }

  window.GUIDES.crew = {
    intro: [
      { icon: '🚀', title: '모두가 한 팀인 우주 임무', text: '더 크루는 <b>협력</b> 게임이에요. 서로 이기려는 게 아니라 <b>모두 같이</b> 임무를 성공시켜요. 임무 30개를 1번부터 차례로 깨 나가요. 실패하면 같은 임무를 다시 도전해요.', html: true },
      { icon: '🎯', title: '과제 = 그 카드가 든 트릭을 내가 이기기', text: '임무마다 <b>과제 카드</b>가 펼쳐지고, 사령관(👑 로켓 4를 가진 사람)부터 한 장씩 가져가요. 내 과제가 <b>파랑 7</b>이면, 파랑 7이 나온 트릭을 <b>내가</b> 이겨야 해요. 누가 냈든 상관없지만, <b>다른 사람이 이기면 바로 실패</b>!', html: true },
      { icon: '🃏', title: '트릭: 같은 색 따라 내기', text: '먼저 내는 사람은 아무 카드나 내요. 나머지는 <b>같은 색이 있으면 꼭 같은 색</b>을 내야 해요(화면이 낼 수 있는 카드만 밝게 보여 줘요). 없으면 아무거나 낼 수 있어요. <b>로켓</b>이 나오면 가장 높은 로켓이, 아니면 처음 낸 색에서 가장 높은 카드가 이겨요. 이긴 사람이 다음 트릭을 먼저 내요.', html: true },
      { icon: '🔢', title: '순서 표시가 붙은 과제', text: '<b>①②③</b>: 전체 과제 중 정확히 그 번째에 완료해요. <b>› ›› ›››</b>: 표시끼리 이 순서로(사이에 다른 과제는 괜찮아요). <b>Ω</b>: 맨 마지막에 완료해요. 한 트릭에서 여러 과제를 함께 완료하면 어느 카드가 먼저 나왔든 <b>순서대로 한 것</b>으로 쳐요(①②를 한 번에 OK, ①③은 ②가 빠져서 실패).', html: true },
      { icon: '📡', title: '통신은 임무당 한 번', text: '트릭이 시작되기 전, 내 색 카드 한 장을 모두에게 보여 주며 그 색에서 <b>가장 높아요 / 하나뿐이에요 / 가장 낮아요</b> 중 사실인 것을 알릴 수 있어요. 로켓은 안 되고, 카드는 손에 남아요. 임무에 따라 통신이 막히기도 해요.', html: true },
      { icon: '🤫', title: '카드 얘기는 금지!', text: '"나 파랑 9 있어", "그거 내지 마" 같은 말은 하면 안 돼요. 정보는 <b>통신</b>과 <b>내는 카드</b>로만 나눠요. 남의 폰 화면도 보지 않기! 응원과 한숨은 괜찮아요. 🙈 가리기 버튼으로 내 손패를 덮을 수 있어요.', html: true },
    ],
    tip(S, ui) {
      const me = S.players.find((p) => p.id === S.me);
      const name = (id) => { const p = S.players.find((x) => x.id === id); return id === S.me ? '나' : p ? `${p.name}님` : ''; };
      const m = S.missionInfo || {};
      const myTasks = S.tasks.filter((t) => t.owner === S.me && !t.done);
      const cw = ui.cw || {};
      if (cw.comm && S.phase === 'play' && S.commOptions.length) {
        return cw.commCard
          ? { title: '통신: 표시를 눌러 보내요', text: `${cn(cw.commCard)} 카드는 밝게 켜진 표시 하나만 사실이에요. 그 버튼을 누르면 모두에게 공개돼요(임무당 한 번).`, target: '.cw-ctok.ok' }
          : { title: '통신: 보여 줄 카드를 골라요', text: '밝은 카드 중 하나를 눌러요. 카드 아래에 그 카드로 알릴 수 있는 표시(최고·유일·최저)가 적혀 있어요. 안 하려면 닫기.', target: 'button.cw-cc' };
      }
      switch (S.mode) {
        case 'choose':
          return S.choosing === 'solo'
            ? { title: '사령관: 과제를 모두 맡을 대원을 골라요', text: '이번 임무는 한 명이 과제를 전부 맡아요. 아래에서 고르세요(나는 안 돼요). 펼쳐진 과제를 보고 누가 잘할지 표정만 보고 정해요. 카드 얘기는 금지!', target: '.cw-choice:not([disabled])' }
            : { title: '사령관: 통신할 대원 1명을 골라요', text: '이번 임무는 고른 한 사람만 통신할 수 있어요. 아래에서 고르세요(나도 돼요).', target: '.cw-choice' };
        case 'pick':
          if (cw.task != null && S.tasks[cw.task] && !S.tasks[cw.task].owner) {
            return { title: '이 과제를 가져갈까요?', text: '아래 "이 과제 가져가기"를 누르면 내 과제가 돼요. 그 카드가 든 트릭을 내가 이겨야 해요.', target: '[data-act="cwPick"]' };
          }
          return { title: '내 차례! 과제를 하나 골라요', text: '위 "남은 과제"에서 하나를 눌러요. 내 손에 그 색의 높은 카드(8, 9)나 로켓이 있으면 이기기 쉬워요. 과제 카드 자체가 내 손에 있으면 직접 낼 수도 있어요.', target: 'button.cw-pt' };
        case 'assign':
          if (cw.task != null && S.tasks[cw.task] && !S.tasks[cw.task].owner) {
            return { title: '누구에게 줄까요?', text: `아래에서 받을 대원을 눌러요. 고르게 나눠야 해서 누구도 다른 사람보다 2개 이상 많을 수 없어요(흐린 버튼은 지금 못 줘요).`, target: '.cw-choice:not([disabled])' };
          }
          return { title: '사령관: 과제를 나눠 줘요', text: '위 "남은 과제"에서 하나를 누른 다음, 받을 사람을 골라요. 모든 과제를 나눠 주면 시작해요.', target: 'button.cw-pt' };
        case 'play': {
          const plays = S.trick ? S.trick.plays : [];
          if (cw.sel) return { title: '이 카드를 낼까요?', text: `아래 버튼(또는 같은 카드를 한 번 더)을 누르면 ${cn(cw.sel)} 카드를 내요. 다른 카드로 바꾸려면 그 카드를 눌러요.`, target: '[data-act="cwPlay"]' };
          if (!plays.length) {
            const holdOwn = myTasks.filter((t) => S.hand.includes(t.card));
            const extra = S.commOptions.length ? ' 내기 전에 📡 통신으로 정보를 줄 수도 있어요.' : '';
            if (holdOwn.length) return { title: '내가 트릭을 시작해요', text: `내 과제 카드(${holdOwn.map((t) => cn(t.card)).join(', ')})가 내 손에 있어요. 그 색을 먼저 내면 더 높은 카드를 가진 사람이 이길 수 있으니, 그 색이 다 빠진 뒤나 확실할 때 내요.${extra}`, target: '.cw-hc.legal' };
            return { title: '내가 트릭을 시작해요', text: `아무 카드나 낼 수 있어요. 위 임무 칸에서 과제마다 맡은 사람을 보고, 그 사람이 이기기 좋게 이끌어요.${extra}`, target: '.cw-hc.legal' };
          }
          const led = suitOf(plays[0].card);
          const must = S.hand.some((c) => suitOf(c) === led);
          const win = leading(plays);
          const inTrick = S.tasks.filter((t) => !t.done && plays.some((x) => x.card === t.card));
          const rule = must ? `${SUIT[led]}이 있으니 ${SUIT[led]}을 내야 해요.` : `${SUIT[led]}이 없어서 아무거나(로켓 포함) 낼 수 있어요.`;
          if (inTrick.length) {
            const t = inTrick[0];
            if (t.owner === S.me) {
              return { title: '내 과제 카드가 트릭에 있어요!', text: `${cn(t.card)} 카드는 내가 이겨야 해요. 지금 이기는 카드: ${cn(win.card)} (${name(win.id)}). ${win.id === S.me ? '내가 이기고 있어요! 남은 사람을 지켜봐요.' : '더 높은 카드나 로켓으로 가져와요.'} ${rule}`, target: '.cw-hc.legal' };
            }
            return { title: `${name(t.owner)}의 과제 카드가 있어요`, text: `${cn(t.card)} 카드는 ${name(t.owner)}이 이겨야 해요. 내가 이기면 실패! ${win.id === t.owner ? '지금 그 사람이 이기고 있으니 더 낮은 카드를 내요.' : `지금 이기는 카드: ${cn(win.card)} (${name(win.id)}).`} ${rule}`, target: '.cw-hc.legal' };
          }
          const myCardTask = myTasks.find((t) => S.hand.includes(t.card) && suitOf(t.card) === led);
          return { title: '내 차례! 카드를 내요', text: `${rule} 지금 이기는 카드: ${cn(win.card)} (${name(win.id)}).${myCardTask ? ` 내 과제 카드(${cn(myCardTask.card)})를 지금 내면 이길 수 있는지 살펴봐요.` : ''} 낼 카드를 누르고, 한 번 더 누르면 내요.`, target: '.cw-hc.legal' };
        }
        case 'result': {
          const host = !!S.canNext;
          if (cw.peek) return { title: '판을 보는 중', text: '마지막 트릭과 과제를 확인했으면 위 "결과 다시 보기"를 눌러 결과 창으로 돌아가요.', target: '[data-act="cwPeek"]' };
          if (S.result.ok) return { title: '임무 성공!', text: `${host ? '"다음 임무"를 눌러 계속해요.' : '방장이 다음 임무를 시작하길 기다려요.'} 다른 날 이어서 하려면 대기실에서 시작 임무를 고르면 돼요.`, target: host ? '[data-act="cwNext"]' : undefined };
          return { title: '임무 실패… 다시 도전해요', text: `실패 이유를 확인하고 ${host ? '"다시 도전"을 눌러요.' : '방장이 다시 도전을 누르길 기다려요.'} 카드를 새로 섞어서 같은 임무를 해요. "판 보기"로 마지막 트릭을 볼 수 있어요.`, target: host ? '[data-act="cwNext"]' : undefined };
        }
        case 'over':
          return { title: '캠페인 완주!', text: '30개 임무를 모두 해냈어요. 방장은 1번 임무부터 다시 시작할 수 있어요.', target: S.hostId === S.me ? '[data-act="restart"]' : undefined };
        default: {
          if (S.phase === 'choose') return { title: '사령관이 정하는 중이에요', text: `사령관 ${name(S.commanderId)}이 ${S.choosing === 'solo' ? '과제를 모두 맡을 대원' : '통신할 대원'}을 고르고 있어요. 내 손패를 보며 기다려요.` };
          if (S.phase === 'tasks') {
            return m.assign
              ? { title: '사령관이 과제를 나눠 주는 중', text: '위 과제들을 보며 내 손패로 이길 수 있을지 생각해 봐요. 말로 카드 얘기는 안 돼요!' }
              : { title: `${name(S.pickerId)}이 과제를 고르는 중`, text: '곧 내 차례가 와요. 내 손에 높은 카드나 로켓이 있는 색의 과제를 노려요.' };
          }
          if (S.phase === 'play') {
            const plays = S.trick ? S.trick.plays : [];
            if (S.commOptions.length && !plays.length) {
              return { title: '지금 통신할 수 있어요', text: '트릭이 시작되기 전이에요. 내 정보가 도움이 될 것 같으면 아래 📡 통신하기를 눌러요(임무당 한 번).', target: '[data-act="cwComm"]' };
            }
            const mine = myTasks.length ? ` 내 남은 과제: ${myTasks.map((t) => cn(t.card)).join(', ')}.` : ' 내 과제는 다 끝냈어요. 다른 사람을 도와요.';
            return { title: `${name(S.turnId)} 차례예요`, text: `가운데 트릭을 지켜봐요. 🎯 표시는 과제 카드예요.${mine}` };
          }
          return null;
        }
      }
    },
  };
}());

'use strict';
// 세븐 원더스 듀얼 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.duel = {
  intro: [
    { icon: '🏛️', title: '둘이서 문명 키우기', text: '세 번의 <b>시대</b>(Ⅰ·Ⅱ·Ⅲ) 동안 카드를 한 장씩 번갈아 가져와 도시를 짓는 2인 게임이에요. 이기는 방법은 <b>세 가지</b>: 군사 승리, 과학 승리, 그리고 마지막에 점수 승리!', html: true },
    { icon: '🃏', title: '피라미드에서 카드 가져오기', text: '카드가 겹쳐 깔려 있어요. <b>다른 카드에 가려지지 않은 카드</b>(금빛 테두리)만 가져올 수 있어요. 카드를 가져가면 그 위에 있던 카드가 드러나고, 뒤집혀 있던 카드는 앞면이 보여요.', html: true },
    { icon: '🔨', title: '가져온 카드로 셋 중 하나', text: '<b>🏗️ 건설</b>: 비용을 내고 내 도시에 지어요. <b>♻️ 버리기</b>: 동전 2개(+내 노랑 카드 수)를 받아요. <b>🏛️ 불가사의</b>: 이 카드를 밑에 깔고 내 불가사의를 지어요. 카드 아래 <b>가격표</b>가 내가 낼 동전이에요(초록=가능, 빨강=부족).', html: true },
    { icon: '🪵', title: '자원과 동전', text: '갈색·회색 카드는 <b>자원</b>(🪵목재 🧱점토 🪨석재 🫙유리 📃파피루스)을 만들어요. 모자란 자원은 은행에서 사는데, <b>상대가 그 자원을 많이 만들수록 비싸져요</b>. 🔗 연계 기호가 맞으면 공짜로 지을 수 있어요!', html: true },
    { icon: '⚔️', title: '군사 · 과학 즉시 승리', text: '빨강 카드의 🛡️방패만큼 군사 말이 상대 쪽으로 가요. <b>상대 수도에 닿으면 즉시 승리!</b> 초록 카드의 과학 기호를 <b>서로 다른 6종</b> 모아도 즉시 승리예요. 같은 기호 2장이면 🧪진보 토큰을 받아요.', html: true },
    { icon: '🏆', title: '끝까지 가면 점수', text: 'Ⅲ시대가 끝나면 카드·불가사의·진보 토큰·군사·동전(3개당 1점) 점수를 더해요. 처음엔 <b>자원 카드를 일찍 모으고</b>, 상대가 군사나 과학으로 앞서면 그 카드를 먼저 가져가 막는 게 요령이에요.', html: true },
  ],
  tip(S, ui) {
    const D = DUEL_DATA;
    const me = S.players.find((p) => p.id === S.me);
    const op = S.players.find((p) => p.id !== S.me);
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    const dl = ui.dl || {};
    const mySide = me ? (S.players[0].id === me.id ? 1 : -1) : 1; // 내가 밀면 military가 이 방향으로 움직인다
    const myLead = S.military * mySide;

    // 위험 알림: 상대가 즉시 승리에 가까울 때
    const danger = () => {
      if (!op) return '';
      if (op.sci.length >= 5) return ' ⚠️ 상대가 과학 기호를 5종 모았어요! 새 기호 카드를 먼저 가져가 막아요.';
      if (myLead <= -6) return ' ⚠️ 군사 말이 내 수도 가까이 왔어요! 빨강(방패) 카드로 밀어내요.';
      return '';
    };

    switch (S.mode) {
      case 'draft':
        return { title: '불가사의를 하나 골라요', text: '"한 번 더 합니다"가 붙은 불가사의는 차례를 한 번 더 줘서 강해요. 처음이라면 승점이 큰 것이나 한 번 더 하기를 골라 보세요.', target: '[data-act="dlDraft"]' };
      case 'pick': {
        const f = dl.focus;
        const slot = f && f.kind === 'slot' ? S.slots[f.i] : null;
        if (slot && slot.open && slot.card !== null) {
          const c = D.CARD[slot.card];
          const k = S.costs[f.i];
          if (dl.wpick) return { title: '어느 불가사의를 지을까요?', text: '누를 수 있는 버튼이 지금 지을 수 있는 불가사의예요(흐린 버튼은 동전 부족). 고른 카드는 불가사의 밑에 깔리고 효과는 불가사의 것만 받아요.', target: '[data-act="dlWonder"]:not([disabled])' };
          if (k.chain) return { title: '🔗 연계로 공짜예요!', text: `내 도시의 연계 기호 덕분에 "${c.name}"을(를) 무료로 지을 수 있어요. 건설을 추천해요.`, target: '[data-act="dlBuild"]' };
          if (k.ok) {
            const why = c.color === 'brown' || c.color === 'grey' ? '자원 카드는 앞으로 짓는 비용을 줄여 줘요.'
              : c.color === 'red' ? '방패만큼 군사 말이 상대 쪽으로 가요.'
                : c.color === 'green' ? '과학 기호를 모으면 진보 토큰이나 과학 승리를 노릴 수 있어요.'
                  : c.color === 'blue' ? '시민 카드는 게임 끝에 점수가 돼요.' : c.color === 'purple' ? '길드는 게임 끝에 큰 점수를 줄 수 있어요.' : '상업 카드는 동전이나 싼 거래를 줘요.';
            return { title: `지을 수 있어요 (${k.coins ? `🪙${k.coins}` : '무료'})`, text: `🏗️ 건설을 누르면 내 도시에 지어요. ${why}`, target: '[data-act="dlBuild"]' };
          }
          const canW = Object.values(S.wonderCosts).some((w) => w.ok);
          return { title: '동전이 모자라요', text: `이 카드를 지으려면 🪙${k.coins}이 필요해요. ♻️ 버리면 동전 ${S.discardGain}개를 받아요.${canW ? ' 아니면 이 카드로 🏛️ 불가사의를 지을 수도 있어요!' : ''}`, target: canW ? '[data-act="dlWpick"]' : '[data-act="dlDiscard"]' };
        }
        const open = Object.entries(S.costs);
        const chain = open.find(([, k]) => k.chain);
        if (chain) return { title: '🔗 공짜로 지을 카드가 있어요', text: `"${D.CARD[S.slots[chain[0]].card].name}"은(는) 연계 기호 덕분에 무료예요. 눌러서 건설해 보세요.${danger()}`, target: `.dlc[data-i="${chain[0]}"]` };
        const cheap = open.some(([, k]) => k.ok);
        const rows = S.slots.filter((x) => !x.taken).length;
        const ageStart = S.slots.every((x) => !x.taken);
        return {
          title: ageStart ? `${['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][S.age]}시대 시작! 카드를 골라요` : '내 차례예요! 카드를 하나 골라요',
          text: `금빛 테두리 카드를 누르면 효과와 내 가격이 나와요.${cheap ? ' 초록 가격표 카드는 바로 지을 수 있어요.' : ' 지금은 다 비싸요 — 버려서 동전을 받는 것도 방법이에요.'}${S.age === 1 && ageStart ? ' Ⅰ시대엔 자원(갈색·회색) 카드가 특히 좋아요.' : ''}${rows <= 2 ? ' 이 시대 카드가 거의 다 떨어졌어요.' : ''}${danger()}`,
          target: '.dlc.open',
        };
      }
      case 'token':
        return { title: '🧪 진보 토큰을 하나 골라요', text: '같은 과학 기호 2장을 모은 보상이에요. 처음이라면 동전과 점수를 바로 주는 🌾농업이나, 점수 7점의 🦉철학이 쉬워요.', target: '[data-act="dlToken"]' };
      case 'library':
        return { title: '📚 대도서관: 토큰 하나 고르기', text: '아무도 모르는 토큰 3개 중 하나를 가져와요. 설명을 읽고 지금 내 도시에 맞는 걸 고르세요.', target: '[data-act="dlToken"]' };
      case 'destroy':
        return { title: '💥 상대 카드 하나를 부숴요', text: '상대가 가장 아쉬워할 카드(자원을 2개 만드는 카드 등)를 고르면 좋아요.', target: '[data-act="dlCard"]' };
      case 'revive':
        return { title: '⚱️ 버려진 카드를 무료로 지어요', text: '지금까지 버려진 카드 중 하나를 공짜로 지어요. 점수가 크거나 과학 기호를 채워 주는 카드를 찾아보세요.', target: '[data-act="dlCard"]' };
      case 'chooseStart':
        return { title: '다음 시대는 누가 먼저 할까요?', text: '군사에서 밀리는 사람(같으면 마지막 카드를 가져간 사람)이 정해요. 먼저 하면 좋은 카드를 먼저 고를 수 있어서 보통 "내가 먼저"를 많이 골라요.', target: '[data-act="dlStart"][data-who="me"]' };
      case 'over': {
        const win = S.winnerIds.includes(S.me);
        const why = { military: '군사 말이 수도에 닿아 즉시 끝났어요.', science: '서로 다른 과학 기호 6종으로 즉시 끝났어요.', points: '점수를 모두 더해서 정해졌어요.', tie: '점수와 시민 점수까지 같아서 공동 우승이에요.' }[S.reason] || '';
        return { title: win ? '축하해요, 이겼어요! 🏆' : '게임이 끝났어요', text: `${why} 위의 점수표에서 어디서 점수가 났는지 확인해 보세요.` };
      }
      default: {
        if (S.phase === 'draft') return { title: `${name(S.draft.pickerId)}님이 불가사의를 고르는 중`, text: '불가사의는 1·2·2·1 순서로 골라요. 상대가 고르는 동안 남은 불가사의 설명을 읽어 두세요.' };
        if (S.phase === 'chooseStart') return { title: '시대가 바뀌는 중', text: `${name(S.chooserId)}님이 다음 시대를 누가 먼저 시작할지 고르고 있어요. 다음 시대 카드는 더 비싸지만 더 강해요.` };
        if (S.pend) return { title: `${name(S.pend.playerId)}님이 고르는 중`, text: '불가사의나 과학 기호 효과로 무언가를 고르고 있어요.' };
        return { title: `${name(S.turnId)}님 차례예요`, text: `기다리는 동안 카드를 눌러 효과를 읽어 보세요. 상대가 가져갈 것 같은 카드를 생각해 두면 좋아요.${danger()}` };
      }
    }
  },
};

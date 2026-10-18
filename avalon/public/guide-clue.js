'use strict';
// 클루 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.clue = {
  intro: [
    { icon: '✉️', title: '봉투 속 3장을 맞혀요', text: '정답 봉투에 <b>누가(인물) · 무엇을(보물) · 어디에(섬)</b> 카드가 1장씩 몰래 들어 있어요. 나머지 카드는 모두에게 나눠 줬어요. 봉투의 3장을 <b>가장 먼저 맞히는 사람</b>이 이겨요.', html: true },
    { icon: '🃏', title: '내 카드는 정답이 아니에요', text: '내가 가진 카드와 <b>📢 공개 카드</b>는 봉투에 없다는 뜻이에요. 다른 사람 카드를 하나씩 알아내서 지워 나가면, 아무도 안 가진 3장이 정답이에요.', html: true },
    { icon: '🔍', title: '내 차례: 질문하기', text: '<b>질문하기</b>를 누르고 인물·보물·섬을 하나씩 골라요. 내 왼쪽 사람부터 차례로, 셋 중 하나라도 가진 <b>첫 사람이 1장만 나에게 몰래</b> 보여 줘요. 없는 사람은 ✕ 패스. 누가 패스했는지는 모두가 보니까 남의 질문도 잘 봐 두세요!', html: true },
    { icon: '📓', title: '추리 노트에 표시해요', text: '<b>📓 노트</b> 탭에서 칸을 누를 때마다 <b>✓ 있음 → ✕ 없음 → ? 의심</b>이 바뀌어요. 내 카드·공개 카드·나에게 보여 준 카드는 자동으로 채워 줘요. 나머지는 직접 추리해서 적어요. 노트는 내 폰에만 저장돼요.', html: true },
    { icon: '⚖️', title: '확신이 들면 고발!', text: '질문 뒤(또는 질문 대신) <b>고발</b>할 수 있어요. 맞으면 승리! <b>틀리면</b> 이번 판은 더 질문·고발을 못 하고 차례도 건너뛰어요. 그래도 질문을 받으면 카드는 계속 보여 줘야 해요.', html: true },
    { icon: '🤫', title: '카드를 보여 줄 때', text: '누가 질문한 카드를 내가 가지고 있고 내 앞 사람들이 모두 패스했다면, 아래에 내 카드가 떠요. <b>1장을 골라</b> 보여 줘요. 여러 장이면 내가 골라도 돼요. 같은 사람에게 이미 보여 준 카드를 또 보여 주면 정보를 덜 줘요.', html: true },
  ],
  tip(S, ui) {
    const s = ui.cl || {};
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    const card = (id) => { const c = (S.cards || []).find((x) => x.id === id); return c ? c.name : ''; };
    const me = S.players.find((p) => p.id === S.me);
    const q = S.question;
    if (S.mode === 'over') {
      return S.winnerId === S.me
        ? { title: '축하해요! 사건을 해결했어요', text: '봉투 속 정답과 모두의 카드를 보며 어떻게 추리했는지 복기해 봐요.' }
        : { title: '게임이 끝났어요', text: '봉투 속 정답이 공개됐어요. "모두의 카드 보기"로 누가 무엇을 가졌는지 확인해 봐요.' };
    }
    if (s.compose === 'ask') {
      const left = ['who', 'what', 'where'].filter((k) => !(s.sel || {})[k]);
      if (left.length) return { title: '질문할 카드를 골라요', text: `인물·보물·섬을 하나씩 골라요(남은 것: ${left.map((k) => ({ who: '인물', what: '보물', where: '섬' }[k])).join(', ')}). 노트에서 아직 모르는 카드를 고르면 정보를 많이 얻어요. 내 카드를 일부러 섞어 물어도 돼요.`, target: `.cl-opts.${left[0]}` };
      return { title: '이대로 질문할까요?', text: '"이대로 질문하기"를 누르면 내 왼쪽 사람부터 차례로 확인해요.', target: '[data-act="clSubmit"]' };
    }
    if (s.compose === 'accuse') {
      return { title: '고발은 신중하게!', text: '노트에서 아무도 안 가진(봉투에 있는) 인물·보물·섬을 하나씩 골라요. 틀리면 이번 판은 더 추리할 수 없어요.', target: '[data-act="clSubmit"]' };
    }
    switch (S.mode) {
      case 'ask':
        if (S.history.filter((h) => h.by === S.me).length === 0) return { title: '내 차례! 먼저 질문해 봐요', text: '"질문하기"를 눌러 인물·보물·섬을 하나씩 고르면, 내 왼쪽 사람부터 차례로 그 카드가 있는지 확인해요.', target: '[data-act="clAsk"]' };
        return { title: '내 차례예요', text: '노트를 보고 아직 모르는 카드로 질문해요. 봉투의 3장이 확실하면 "고발"을 눌러요.', target: '[data-act="clAsk"]' };
      case 'after':
        if (q && q.card) {
          if (s.tab !== 'play') return { title: `${name(q.shower)}님이 카드를 보여 줬어요`, text: '🧭 진행 탭에서 뒤집힌 카드를 눌러 확인해요. 노트에는 이미 자동으로 ✓ 표시됐어요.', target: '[data-act="clTab"][data-tab="play"]' };
          if (s.peek !== q.seq) return { title: `${name(q.shower)}님이 카드를 보여 줬어요`, text: '뒤집힌 카드를 눌러 몰래 확인해요. 노트에는 자동으로 ✓ 표시돼요.', target: '.cl-peek' };
          return { title: `${card(q.card)}은(는) ${name(q.shower)}님 카드예요`, text: '봉투에는 없다는 뜻이에요. 정답이 확실하면 고발하고, 아니면 "차례 끝내기"를 눌러요.', target: '[data-act="clEnd"]' };
        }
        return { title: '아무도 카드를 보여 주지 못했어요!', text: '셋 중 내 카드가 아닌 것은 다른 사람에게 없어요(봉투나 공개·소문 카드일 수 있어요). 노트에 적고, 확실하면 고발해요. 아니면 "차례 끝내기".', target: '[data-act="clEnd"]' };
      case 'respond': {
        const many = ['who', 'what', 'where'].filter((k) => S.hand.includes(q[k])).length > 1;
        if (!s.pick) return { title: `${name(q.by)}님에게 카드를 보여 줘요`, text: '질문에 나온 내 카드 중 1장을 골라요. "이미 보여 준 카드"를 또 보여 주면 새 정보를 주지 않아요.', target: '.cl-pick' };
        return { title: '이 카드를 보여 줄까요?', text: `${many ? '여러 장 중에 내가 골랐어요. ' : ''}"이 카드 보여 주기"를 누르면 ${name(q.by)}님 화면에만 보여요.`, target: '[data-act="clShow"]' };
      }
      default: {
        if (s.tab === 'note') {
          return { title: '추리 노트', text: '칸을 누르면 ✓ → ✕ → ? → 빈칸 순서로 바뀌어요. 누군가 패스하면 그 사람 칸의 세 카드에 ✕, 누가 남에게 카드를 보여 주면 그 셋 중 하나가 그 사람에게 있다는 뜻이에요(? 로 표시해 두세요). 할 일이 생기면 아래 버튼이 바뀌어요.' };
        }
        if (s.tab === 'log') {
          return { title: '질문 기록', text: '"내 기록"에는 내가 본 카드와 내가 보여 준 카드가, "모두의 질문"에는 누가 무엇을 물었고 누가 패스했는지가 남아요. 노트를 채울 때 참고해요.' };
        }
        if (me && me.out) return { title: '고발에 실패했어요', text: '이번 판은 내 차례가 건너뛰어요. 그래도 질문을 받으면 카드를 보여 줘야 해요. 다른 사람이 맞히는지 지켜봐요.' };
        if (S.step === 'respond' && q) {
          if (q.by === S.me) return { title: '카드를 기다리는 중', text: `${name(q.shower)}님이 나에게 보여 줄 카드를 고르고 있어요. ${q.passed.length ? `패스한 ${q.passed.map(name).join(', ')}님은 세 카드 모두 없어요.` : ''}` };
          return { title: `${name(q.by)}님의 질문`, text: `${q.passed.length ? `${q.passed.map(name).join(', ')}님이 패스했어요 → 노트에서 그 사람 칸의 세 카드에 ✕. ` : ''}${name(q.shower)}님이 셋 중 하나를 가지고 있어요.`, target: '.cl-q' };
        }
        if (S.step === 'after' && q) {
          return { title: `${name(q.by)}님 질문 결과`, text: q.shower ? `${name(q.shower)}님이 셋 중 1장을 보여 줬어요(무슨 카드인지는 몰라요). 노트에 ? 로 적어 두면 나중에 추리에 써요.` : '아무도 못 보여 줬어요! 질문한 사람이 가진 카드가 아니라면 봉투에 있을 수 있어요.', target: '.cl-q' };
        }
        return { title: `${name(S.turnId)}님 차례예요`, text: '질문이 나오면 누가 패스하고 누가 보여 주는지 잘 봐요. 남의 질문도 중요한 단서예요. 노트 탭에서 표시해 둘 수 있어요.', target: '[data-act="clTab"][data-tab="note"]' };
      }
    }
  },
};

'use strict';
// 마피아 초보자 가이드 (틀은 guide.js). 내 직업과 지금 단계에 맞춰 한두 문장으로 알려 준다.
window.GUIDES = window.GUIDES || {};
window.GUIDES.mafia = {
  intro: [
    { icon: '🏙️', title: '마피아를 찾아라', text: '이 도시에 <b>마피아</b>가 숨어 있어요. <b>시민팀</b>은 마피아를 모두 찾아내면 이기고, <b>마피아팀</b>은 마피아 수가 나머지 사람 수와 같아지면 이겨요.', html: true },
    { icon: '🎭', title: '내 직업은 나만 알아요', text: '🔪 <b>마피아</b>: 동료를 알고, 밤에 한 명을 제거해요.<br>🕵️ <b>경찰</b>: 밤에 한 명이 마피아인지 조사해요.<br>💉 <b>의사</b>: 밤에 한 명을 지켜요(나도 가능).<br>🙂 <b>시민</b>: 능력은 없지만 토론과 투표가 무기예요.', html: true },
    { icon: '☀️', title: '낮: 토론하고 투표해요', text: '낮에는 밤사이 일어난 일이 공개되고, 채팅이나 말로 토론해요. 과반이 <b>토론 끝</b>을 누르면 투표! 가장 많이 뽑힌 사람이 <b>처형 후보</b>가 되고, <b>찬반 투표</b>에서 찬성이 더 많으면 처형돼요.', html: true },
    { icon: '🌙', title: '밤: 몰래 움직여요', text: '밤에는 마피아·경찰·의사가 각자 목록에서 한 명을 눌러 골라요. 시민은 기다리기만 하면 돼요. 마피아의 표적을 의사가 지키면 아무도 죽지 않아요.', html: true },
    { icon: '💀', title: '죽으면 관전해요', text: '죽은 사람은 말하거나 투표할 수 없지만 끝까지 지켜볼 수 있어요. 게임은 <b>1일차 낮</b>부터 시작해요. 첫날은 정보가 없으니 가볍게 이야기해 봐요.', html: true },
  ],
  tip(S, ui) {
    const me = S.players.find((p) => p.id === S.me);
    if (!me || !me.role) return null;
    const role = me.role;
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : '?'; };
    const dayHint = {
      mafia: '시민인 척 자연스럽게 대화하고, 다른 사람에게 의심을 돌려 보세요.',
      police: '조사 결과를 언제 밝힐지 잘 골라요. 너무 일찍 밝히면 밤에 노려져요.',
      doctor: '정체를 숨기세요. 의사가 들키면 마피아가 먼저 노려요.',
      citizen: '말이 바뀌거나 남을 몰아가는 사람을 잘 살펴봐요.',
    }[role];

    if (S.phase === 'over') {
      const won = (S.winner === 'mafia') === (role === 'mafia');
      return { title: won ? '이겼어요! 🎉' : '아쉽게 졌어요', text: '이제 모두의 직업이 공개됐어요. 누가 마피아였는지 확인해 보세요.' };
    }
    if (S.phase === 'roles') {
      if (me.acked) return { title: '다른 사람을 기다리는 중', text: '모두 확인하면 1일차 낮이 시작돼요.' };
      const t = {
        mafia: '밤마다 동료와 함께 한 명을 골라요. 낮에는 절대 들키면 안 돼요!',
        police: '밤마다 한 명을 조사해 마피아인지 알아내요. 결과는 나만 봐요.',
        doctor: '밤마다 마피아가 노릴 것 같은 사람을 한 명 지켜요.',
        citizen: '능력은 없지만 투표권이 있어요. 수상한 사람을 찾아내요.',
      }[role];
      return { title: `나는 ${{ mafia: '마피아', police: '경찰', doctor: '의사', citizen: '시민' }[role]}!`, text: `${t} 다 봤으면 확인을 눌러요.`, target: '.mf [data-act="ack"]' };
    }
    if (!me.alive) return { title: '당신은 죽었어요', text: '말하거나 투표할 수는 없지만, 누가 마피아인지 끝까지 지켜봐요.' };

    switch (S.phase) {
      case 'night': {
        const na = S.nightAction;
        if (!na) return { title: '눈을 감고 기다려요', text: '시민은 밤에 할 일이 없어요. 마피아·경찰·의사가 모두 고르면 아침이 와요.' };
        if (na.done) return { title: `${name(na.myPick)}님을 골랐어요`, text: '다른 역할이 모두 정할 때까지 기다려요. 결과는 아침에 공개돼요.' };
        const pickTarget = ui.mSel ? '[data-act="mafiaConfirm"]' : '.mf .mp.pick';
        if (na.kind === 'mafia') {
          return { title: ui.mSel ? `${name(ui.mSel)}님을 노릴까요?` : '오늘 밤 노릴 사람을 골라요', text: ui.mSel ? '맨 아래 빨간 버튼을 눌러 확정해요. 동료와 표가 갈리면 그중 무작위예요.' : '경찰이나 의사로 보이는 사람을 노리면 좋아요. 마피아 채팅으로 동료와 의논해요.', target: pickTarget };
        }
        if (na.kind === 'police') {
          return { title: ui.mSel ? `${name(ui.mSel)}님을 조사할까요?` : '조사할 사람을 골라요', text: ui.mSel ? '맨 아래 파란 버튼을 눌러요. 결과는 아래 수사 수첩에 나만 보이게 적혀요.' : '낮에 가장 수상했던 사람을 골라 마피아인지 확인해요.', target: pickTarget };
        }
        return { title: ui.mSel ? `${name(ui.mSel)}님을 지킬까요?` : '지킬 사람을 골라요', text: ui.mSel ? '맨 아래 초록 버튼을 눌러요. 마피아가 이 사람을 노리면 살아나요.' : '마피아가 노릴 것 같은 사람(활약한 사람이나 나 자신)을 지켜요.', target: pickTarget };
      }
      case 'day': {
        const ln = S.lastNight;
        const news = ln && ln.victim ? `밤사이 ${name(ln.victim)}님이 죽었어요. ` : ln && ln.saved ? '의사가 누군가를 살렸어요! ' : '';
        if (me.ready) return { title: '토론 끝을 눌렀어요', text: '살아 있는 사람의 과반이 누르면 투표가 시작돼요. 그동안 채팅으로 계속 이야기할 수 있어요.', target: '#mtext' };
        return { title: S.day === 1 ? '첫날 낮: 서로 인사하며 탐색해요' : '토론 시간이에요', text: `${news}${dayHint} 할 말을 다 했으면 맨 아래 버튼을 눌러요.`, target: '[data-act="ready"]' };
      }
      case 'vote':
        if (S.myVote) return { title: '투표 완료! 기다려요', text: '모두 투표하면 혼자 가장 많은 표를 받은 사람이 처형 후보가 돼요.' };
        if (ui.mSel) return { title: `${name(ui.mSel)}님에게 투표할까요?`, text: '맨 아래 빨간 버튼으로 확정해요. 다시 누르면 취소돼요.', target: '[data-act="mafiaVote"]' };
        return {
          title: '처형 후보를 골라요',
          text: role === 'mafia' ? '동료가 아닌 사람에게 표를 모아 보세요. 확실하지 않으면 기권도 돼요.' : '가장 수상한 사람을 목록에서 눌러요. 확신이 없으면 기권해도 돼요.',
          target: '.mf .mp.pick',
        };
      case 'trial':
        if (S.accusedId === S.me) return { title: '내가 처형 후보예요!', text: '채팅으로 내가 왜 마피아가 아닌지 변론해 보세요. 나는 찬반 투표를 할 수 없어요.', target: '#mtext' };
        if (S.myJudge) return { title: '찬반 투표 완료', text: '찬성이 반대보다 많아야 처형돼요. 결과를 기다려요.' };
        return {
          title: `${name(S.accusedId)}님을 처형할까요?`,
          text: role === 'mafia' ? '후보가 동료가 아니면 처형 찬성으로 시민을 줄일 수 있어요.' : '확신이 들면 ☠️ 처형, 아니라면 🙏 살리기를 눌러요. 동수면 살아요.',
          target: '[data-act="mafiaJudge"]',
        };
      case 'voteResult':
        if (me.acked) return { title: '다른 사람을 기다리는 중', text: '모두 확인하면 다음으로 넘어가요.' };
        return { title: '투표 결과를 확인해요', text: '누가 누구에게 투표했는지 살펴보면 다음 날의 단서가 돼요. 모두 확인하면 다음으로 넘어가요.', target: '.mf [data-act="ack"]' };
      default:
        return null;
    }
  },
};

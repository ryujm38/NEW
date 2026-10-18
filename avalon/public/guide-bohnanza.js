'use strict';
// 보난자 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.bohnanza = {
  intro: [
    { icon: '🫘', title: '콩을 키워 코인 부자 되기', text: '밭에 콩을 심고, 많이 모였을 때 <b>수확</b>하면 콩이 <b>코인</b>으로 바뀌어요. 덱이 3번 바닥나면 게임이 끝나고, <b>코인이 가장 많은 사람</b>이 이겨요.', html: true },
    { icon: '🖐', title: '손패 순서는 못 바꿔요', text: '손패는 줄을 선 것과 같아요. 내 차례에는 <b>맨 앞(왼쪽, ①번) 카드를 꼭 심고</b>, 원하면 그다음 카드도 1장 더 심어요. 새로 받는 카드는 항상 <b>맨 뒤</b>에 붙어요.', html: true },
    { icon: '🌱', title: '한 밭에는 한 종류만', text: '밭은 처음에 2개예요(코인 3개로 3번째 밭을 살 수 있어요). 같은 콩은 한 밭에 쌓고, 다른 콩을 심으려면 그 밭을 <b>먼저 수확</b>해야 해요. 그래서 원치 않는 콩이 맨 앞에 오면 곤란해져요!', html: true },
    { icon: '🤝', title: '카드 2장 펼치고 거래', text: '심고 나면 덱에서 카드 2장이 펼쳐져요. 차례인 사람은 이 카드와 손패를 내놓고, 다른 사람은 <b>줄 카드 ⇄ 받을 카드</b>를 골라 제안해요. 수락은 차례인 사람만 할 수 있어요. 거래로 받은 카드와 남은 펼친 카드는 <b>바로 심어야</b> 해요.', html: true },
    { icon: '🪙', title: '콩 계량표 보고 수확하기', text: '카드 맨 아래 줄이 <b>콩 계량표</b>예요. 동전 숫자는 받는 <b>코인</b>, 그 아래 숫자는 필요한 <b>콩 수</b>예요(예: 4 아래 🪙1 → 4개면 1코인). 내 밭을 누르면 언제든 수확해요. 카드 오른쪽 위 숫자는 그 콩이 덱에 몇 장 있는지예요.', html: true },
    { icon: '🏆', title: '차례 끝과 승리', text: '모두 다 심으면 차례인 사람이 덱에서 <b>3장을 뽑아</b> 손패 뒤에 붙이고 다음 사람 차례가 돼요. 덱이 3번째로 바닥나면 모든 밭을 수확하고, 코인이 가장 많은 사람이 승리!', html: true },
  ],
  tip(S, ui) {
    const B = BOHNANZA_DATA.BEANS;
    const nm = (t) => B[t].name;
    // 받침에 따라 조사 고르기 (대두를 / 녹색콩을)
    const j = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); };
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    const me = S.players.find((p) => p.id === S.me);
    const fields = me ? me.fields : [];
    const canPlant = (t) => fields.some((f) => !f.count || f.type === t);
    const sameField = (t) => fields.findIndex((f) => f.count && f.type === t);
    const HARVEST = '.bz-plot.can:not(.lock)';
    const s = (ui && ui.bz) || { give: [], want: [], table: null };

    switch (S.mode) {
      case 'plant1': {
        const c = S.hand[0];
        if (!c) return null;
        const t = nm(c.type);
        const same = sameField(c.type);
        if (!canPlant(c.type)) {
          return { title: `${j(t, '을', '를')} 심을 밭이 없어요`, text: `맨 앞 카드 ${j(t, '은', '는')} 꼭 심어야 해서 밭 하나를 비워야 해요. 내 농장에서 수확할 밭을 눌러요(코인을 더 받는 밭이 좋아요).`, target: HARVEST };
        }
        if (S.plantCount === 0) {
          return {
            title: `맨 앞 카드 ${j(t, '을', '를')} 꼭 심어야 해요`,
            text: same >= 0 ? `밭 ${same + 1}에 이미 ${j(t, '이', '가')} 있어요. 아래 초록 테두리 버튼을 눌러 같이 쌓아요.` : '아래 밭 버튼 중 하나를 눌러 심어요. 빈 밭에 심으면 그 밭은 이 콩 전용이 돼요.',
            target: same >= 0 ? '.bz-pb.add' : '.bz-pb:not([disabled])',
          };
        }
        if (same >= 0) return { title: `다음 카드 ${t}도 심으면 좋아요`, text: `밭 ${same + 1}에 같은 콩이 있어서 더 쌓을 수 있어요. 2장째는 선택이에요.`, target: '.bz-pb.add' };
        return { title: `다음 카드 ${t}도 심을까요? (선택)`, text: '빈 밭이 있으면 심어도 되지만, 밭을 아끼고 싶으면 "그만 심고 카드 2장 펼치기"를 눌러요.', target: '[data-act="bzSkip"]' };
      }
      case 'tradeA': {
        if (S.proposals.length) {
          const p = S.proposals[0];
          return { title: `${name(p.from)}님이 거래를 제안했어요`, text: '주고받을 콩을 보고 마음에 들면 "수락", 아니면 "거절"을 눌러요. 받은 카드는 바로 심어야 하니 내 밭에 맞는 콩인지 확인해요!', target: '[data-act="bzAccept"]' };
        }
        const fu = S.faceUp.map((c) => nm(c.type)).join(', ');
        return { title: '거래 시간이에요', text: `펼친 카드${fu ? `(${fu})` : ''}는 거래하지 않으면 내가 심어요. 필요 없는 손패를 눌러 내놓고 제안을 기다리거나, 다 됐으면 "거래 끝내기"를 눌러요.`, target: '.bz-faceup' };
      }
      case 'tradeB': {
        const mine = S.proposals.find((p) => p.from === S.me);
        if (mine) return { title: '제안을 보냈어요', text: `${name(S.turnId)}님이 수락하면 카드가 바뀌고, 받은 카드는 바로 심어요. 바꾸고 싶으면 다시 고른 뒤 "제안 바꾸기"를 눌러요.` };
        const visible = [...S.faceUp, ...S.offered];
        if (!s.give.length && !s.want.length) {
          const good = visible.find((c) => sameField(c.type) >= 0);
          if (!visible.length) return { title: `${name(S.turnId)}님이 거래 중이에요`, text: '지금 받을 수 있는 카드가 없어요. 내 손패를 눌러 공짜로 주는 제안도 할 수 있어요(곤란한 콩을 치울 때 좋아요).' };
          return {
            title: `${name(S.turnId)}님과 거래할 수 있어요`,
            text: good ? `${j(nm(good.type), '은', '는')} 내 밭에 있는 콩이라 받으면 좋아요. 거래 테이블에서 받고 싶은 카드를 눌러요.` : '거래 테이블에서 받고 싶은 카드를 누르고, 내 손패에서 줄 카드를 골라요. 거래하기 싫으면 그냥 기다려도 돼요.',
            target: '.bz-trade [data-act="bzWant"]',
          };
        }
        if (!s.give.length) return { title: '줄 카드도 골라 볼까요?', text: '내 손패에서 줄 카드를 누르면 상대가 수락할 가능성이 높아져요. 다 고르면 아래 "제안하기"를 눌러요.', target: '[data-act="bzPropose"]' };
        return { title: '제안 준비 완료!', text: `줄 카드 ${s.give.length}장 ⇄ 받을 카드 ${s.want.length}장이에요. 아래 "제안하기"를 눌러 보내요.`, target: '[data-act="bzPropose"]' };
      }
      case 'plantAll': {
        const c = S.table.find((x) => x.id === s.table) || S.table[0];
        if (!c) return null;
        const t = nm(c.type);
        if (!canPlant(c.type)) return { title: '심을 밭을 비워야 해요', text: `${j(t, '을', '를')} 심을 밭이 없어요. 내 농장에서 밭 하나를 눌러 수확한 뒤 심어요.`, target: HARVEST };
        return { title: S.table.length > 1 ? `받은 카드 ${S.table.length}장을 모두 심어요` : '받은 카드를 심어요', text: `지금 고른 ${j(t, '을', '를')} 아래 밭 버튼을 눌러 심어요. 다른 카드부터 심고 싶으면 위의 카드를 눌러 바꿔요.`, target: '.bz-pb:not([disabled])' };
      }
      case 'over':
        return { title: '게임이 끝났어요', text: '남은 밭은 모두 자동으로 수확됐어요. 코인이 가장 많은 사람이 이겼어요. 한 판 더 해 볼까요?' };
      default: {
        if (S.step === 'plantAll') return { title: '다른 사람이 받은 카드를 심는 중', text: `모두 심으면 ${name(S.turnId)}님이 카드 3장을 뽑고 다음 사람 차례로 넘어가요.` };
        const front = S.hand[0];
        const prep = front && !canPlant(front.type) ? ` 심을 밭이 없으니 미리 밭 하나를 수확해 둘 수도 있어요.` : '';
        return { title: `${name(S.turnId)}님이 콩을 심는 중이에요`, text: front ? `곧 거래 시간이 와요. 내 맨 앞 카드는 ${j(nm(front.type), '이에요', '예요')}.${prep}` : '곧 카드 2장이 펼쳐지고 거래 시간이 와요.', target: prep ? HARVEST : undefined };
      }
    }
  },
};

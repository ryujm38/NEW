'use strict';
// 라스베가스 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.vegas = {
  intro: [
    { icon: '🎰', title: '주사위로 카지노 지폐 따기', text: '4라운드 동안 1~6번 카지노에 주사위를 놓아 그 아래 깔린 <b>지폐</b>를 따요. 4라운드가 끝났을 때 <b>돈이 가장 많은 사람</b>이 이겨요.', html: true },
    { icon: '🎲', title: '내 차례: 굴리고, 숫자 하나 고르기', text: '남은 주사위를 <b>모두</b> 굴린 뒤, 나온 숫자 중 <b>하나</b>를 골라요. 그 숫자가 나온 주사위는 <b>전부</b> 같은 번호 카지노에 놓여요. (예: 3이 2개 나와서 3을 고르면 3번 카지노에 2개)', html: true },
    { icon: '💵', title: '많이 놓은 사람이 큰 지폐', text: '모두가 주사위를 다 쓰면 라운드 정산! 카지노마다 주사위를 <b>가장 많이</b> 놓은 사람이 가장 큰 지폐(1등), 그다음 사람이 다음 지폐를 가져가요.', html: true },
    { icon: '💥', title: '동점은 모두 탈락!', text: '같은 카지노에 <b>같은 개수</b>를 놓은 사람끼리는 모두 상쇄돼서 아무것도 못 받아요. 그다음 사람이 1등 지폐를 가져가요. 남의 1등을 동점으로 무너뜨릴 수도 있어요. 화면의 👑는 지금 1등, "동점"은 상쇄될 사람이에요.', html: true },
    { icon: '🏆', title: '주사위를 아껴 쓰는 게 요령', text: '한 번에 많이 놓으면 강하지만 나중에 굴릴 주사위가 줄어요. 시작하는 사람은 라운드마다 바뀌고, 4라운드 합계로 승부가 나요.' },
  ],
  tip(S) {
    const me = S.players.find((p) => p.id === S.me);
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    const money = (k) => `$${k}k`;
    const cname = (n) => (window.GAME_UI.vegas && window.GAME_UI.vegas.casinoName ? window.GAME_UI.vegas.casinoName(n) : `${n}번`);
    switch (S.mode) {
      case 'roll':
        return { title: '내 차례! 주사위를 굴려요', text: `아래 버튼을 눌러 남은 주사위 ${me ? me.dice : ''}개를 모두 굴려요.`, target: '[data-act="vgRoll"]' };
      case 'place': {
        // 지금 놓인 주사위 기준으로, 각 숫자를 고르면 몇 등으로 얼마를 받는지 계산해 본다
        const values = [...new Set(S.rolled)];
        const options = values.map((v) => {
          const cnt = S.rolled.filter((x) => x === v).length;
          const c = S.casinos[v - 1];
          const dice = { ...c.dice, [S.me]: (c.dice[S.me] || 0) + cnt };
          const counts = Object.values(dice);
          const survivors = Object.entries(dice).filter(([, n]) => counts.filter((x) => x === n).length === 1).sort((a, b) => b[1] - a[1]);
          const rank = survivors.findIndex(([id]) => id === S.me);
          const bill = rank >= 0 && rank < c.bills.length ? c.bills[rank] : 0;
          return { v, cnt, rank, bill };
        });
        options.sort((a, b) => b.bill - a.bill || a.cnt - b.cnt);
        const best = options[0];
        const list = values.map((v) => `${v}(${S.rolled.filter((x) => x === v).length}개)`).join(', ');
        if (!best || !best.bill) {
          return { title: '놓을 숫자를 하나 골라요', text: `나온 숫자: ${list}. 지금은 어디에 놓아도 지폐를 받기 어려워요. 다른 사람과 같은 개수를 만들어 상쇄시키거나, 주사위를 적게 써서 다음 차례를 노려요.`, target: '.vg-choice' };
        }
        return { title: '놓을 숫자를 하나 골라요', text: `나온 숫자: ${list}. 지금 기준으로는 ${best.v}번 ${cname(best.v)}에 놓으면 ${best.rank + 1}등으로 ${money(best.bill)}를 받을 수 있어요(뒤에 다른 사람이 바꿀 수 있어요).`, target: '.vg-choice' };
      }
      case 'roundEnd': {
        const won = S.results.reduce((sum, r) => sum + r.rows.filter((x) => x.id === S.me && x.bill).reduce((a, x) => a + x.bill, 0), 0);
        if (me && me.acked) return { title: '다음 라운드를 기다려요', text: '모두 확인하면 새 지폐가 깔리고 주사위를 다시 받아요.' };
        return { title: `${S.round}라운드 정산이에요`, text: `${won ? `이번 라운드에 ${money(won)}를 받았어요.` : '이번 라운드에는 받은 지폐가 없어요.'} 카지노별 결과를 보고 "${S.round >= S.rounds ? '최종 결과 보기' : '다음 라운드'}"를 눌러요.`, target: '[data-act="ack"]' };
      }
      case 'over':
        return { title: '게임이 끝났어요', text: '4라운드 동안 모은 돈이 가장 많은 사람이 이겼어요. 한 판 더 해 볼까요?' };
      default: {
        if (S.rolled) return { title: `${name(S.turnId)}님이 놓을 숫자를 고르는 중`, text: '어느 카지노에 놓는지 지켜봐요. 1등(👑)이 바뀌거나 동점이 생길 수 있어요.' };
        if (me && me.dice === 0) return { title: '내 주사위는 다 놓았어요', text: '다른 사람이 주사위를 다 쓰면 라운드 정산을 해요. 어느 카지노에서 동점이 생기는지 지켜봐요.' };
        return { title: `${name(S.turnId)}님 차례예요`, text: `내 남은 주사위는 ${me ? me.dice : 0}개예요. 카지노마다 누가 1등(👑)이고 어디가 동점인지 보면서 다음 차례를 계획해요.` };
      }
    }
  },
};

'use strict';
// 부루마블 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.marble = {
  intro: [
    { icon: '🌍', title: '세계를 돌며 땅 부자 되기', text: '주사위를 굴려 보드를 빙글빙글 돌면서 도시를 사고, 건물을 지어서 <b>통행료</b>로 돈을 버는 게임이에요. 다른 사람이 모두 파산하거나, 정한 바퀴가 끝났을 때 <b>자산이 가장 많은 사람</b>이 이겨요.', html: true },
    { icon: '🎲', title: '내 차례: 주사위 굴리기', text: '내 차례가 되면 아래 빨간 <b>주사위 굴리기</b> 버튼만 누르면 돼요. 두 주사위의 합만큼 말이 한 칸씩 움직여요. 같은 숫자(<b>더블</b>)가 나오면 한 번 더 굴려요.', html: true },
    { icon: '🏠', title: '빈 땅은 사고, 내 땅엔 건물', text: '주인 없는 도시에 서면 살지 물어봐요. 내 땅에 다시 오면 <b>별장 → 빌딩 → 호텔</b>을 지을 수 있고, 지을수록 통행료가 크게 올라요. 칸을 누르면 땅 카드(값·통행료)를 볼 수 있어요.', html: true },
    { icon: '💸', title: '남의 땅이면 통행료', text: '다른 사람 땅에 서면 통행료가 자동으로 나가요. 돈이 모자라면 내 땅을 팔아서(산 값의 절반) 갚아야 하고, 그래도 못 갚으면 파산이에요.' },
    { icon: '🔑', title: '특별한 칸들', text: '<b>황금열쇠</b>: 카드 한 장 뽑기(상금·벌금·여행). <b>무인도</b>: 3턴 쉬기. <b>우주여행</b>: 다음 차례에 원하는 칸으로. <b>사회복지기금</b>: 접수처에서 내고 수령처에서 모두 받기. <b>출발</b>을 지나면 월급 20만원!', html: true },
  ],
  tip(S) {
    if (window.GAME_UI.marble && window.GAME_UI.marble.busy()) return { title: '주사위와 말을 지켜봐요', text: '말이 도착하면 그 칸에서 할 일을 알려 줄게요.' };
    const me = S.players.find((p) => p.id === S.me);
    const pd = S.pending;
    const tile = pd && pd.tile !== undefined ? S.tiles[pd.tile] : null;
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    switch (S.mode) {
      case 'roll':
        if (me && me.jail) {
          return { title: '무인도에서 탈출해 봐요', text: `주사위를 굴려 같은 숫자(더블)가 나오면 바로 나가요. 안 나오면 이번 턴은 쉬어요. (${me.jailTurns}/3턴)${me.escape ? ' 무전기 카드가 있으면 바로 나갈 수도 있어요.' : ''}`, target: '[data-act="mbRoll"]' };
        }
        return { title: '내 차례예요! 주사위를 굴려요', text: '아래 빨간 버튼을 누르면 주사위가 굴러가고, 나온 숫자만큼 말이 앞으로 가요.', target: '[data-act="mbRoll"]' };
      case 'buy':
        return { title: `${tile.name}을(를) 살까요?`, text: '땅을 사 두면 다른 사람이 여기 설 때마다 통행료를 받아요. 처음에는 싼 땅이라도 많이 사 두는 게 좋아요. 돈이 너무 줄어들면 통행료를 못 낼 수 있으니 조심!', target: '[data-act="mbBuy"]' };
      case 'build':
        return { title: '내 땅에 건물을 지을 수 있어요', text: `건물을 지으면 ${tile.name} 통행료가 크게 올라요. 남은 돈이 넉넉하면 짓는 걸 추천해요.`, target: '[data-act="mbBuild"]' };
      case 'debt':
        return { title: '돈이 모자라요! 땅을 팔아 갚아요', text: '아래에서 팔 땅을 누르세요. 산 값의 절반을 받아요. 덜 중요한(싼) 땅부터 파는 게 좋아요.', target: '.mprop-btn' };
      case 'warp':
        return { title: '우주여행! 갈 칸을 골라요', text: '보드에서 가고 싶은 칸을 누른 뒤 아래 버튼을 누르세요. 출발을 지나가면 월급도 받아요. 사고 싶은 빈 땅이나 내 땅으로 가 보세요.' };
      case 'over':
        return { title: '게임이 끝났어요', text: '자산(현금 + 땅과 건물 값)이 가장 많은 사람이 이겼어요. 한 판 더 해 볼까요?' };
      default: {
        const who = pd ? name(pd.who) : name(S.turnId);
        if (pd && pd.t === 'buy') return { title: `${who}님이 땅을 살지 고르는 중`, text: '기다리는 동안 보드의 칸을 눌러 땅 값과 통행료를 구경해 보세요.' };
        return { title: `${who}님 차례예요`, text: '내 차례가 되면 빨간 주사위 버튼이 나타나요. 그동안 다른 사람이 어디에 서는지 지켜봐요.' };
      }
    }
  },
};

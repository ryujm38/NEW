'use strict';
// 부루마블 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.marble = {
  intro: [
    { icon: '🌍', title: '세계를 돌며 땅 부자 되기', text: '주사위 2개를 굴려 40칸 보드를 빙글빙글 돌면서 도시를 사고, 건물을 지어서 <b>통행료</b>로 돈을 버는 게임이에요. 다른 사람이 모두 파산하거나 정한 바퀴가 끝났을 때 <b>자산(현금 + 땅·건물에 들인 돈)이 가장 많은 사람</b>이 이겨요.', html: true },
    { icon: '🎲', title: '내 차례: 주사위 굴리기', text: '내 차례가 되면 아래 빨간 <b>주사위 굴리기</b> 버튼을 눌러요. 두 주사위의 합만큼 말이 앞으로 가요. 같은 숫자(<b>더블</b>)면 한 번 더 굴리지만, 3번 연속 더블이면 무인도로 가요. 출발을 지나면 월급 <b>20만</b>!', html: true },
    { icon: '🏠', title: '빈 땅은 사고, 내 땅엔 건물', text: '주인 없는 땅에 서면 살지 물어봐요. 내 도시에 다시 서면 <b>별장 → 별장 2채 → 빌딩 → 호텔</b> 순서로 하나씩 지을 수 있고, 지을수록 통행료가 크게 올라요. 제주도·부산·서울과 탈것은 건물을 못 지어요. 보드의 칸을 누르면 땅 카드를 볼 수 있어요.', html: true },
    { icon: '💸', title: '남의 땅이면 통행료', text: '다른 사람 땅에 서면 통행료가 자동으로 나가요(<b>우대권</b>이 있으면 한 번 면제). 돈이 모자라면 내 땅을 팔아(땅값+건물값의 <b>절반</b>) 갚아야 하고, 그래도 못 갚으면 파산이에요.', html: true },
    { icon: '🔑', title: '특별한 칸들', text: '<b>황금열쇠</b>: 카드 한 장(상금·벌금·여행·무전기·우대권 등). <b>무인도</b>: 3턴 쉬기(더블이나 무전기로 탈출). <b>우주여행</b>: 다음 차례에 원하는 칸으로(컬럼비아호 주인에게 탑승료 20만). <b>사회복지기금</b>: 접수처에서 15만을 내고, 수령처에 서면 모인 기금을 모두 받아요.', html: true },
    { icon: '👀', title: '화면 보는 법', text: '맨 위 <b>상태판</b>에 누구 차례인지, 그 사람이 선 칸이 무슨 뜻인지 나와요. 아래쪽 <b>자산 순위</b>에서 모두의 현금과 자산을, <b>내 땅</b>에서 내 땅과 통행료를 한눈에 볼 수 있어요.', html: true },
  ],
  tip(S, ui) {
    if (window.GAME_UI.marble && window.GAME_UI.marble.busy()) return { title: '주사위와 말을 지켜봐요', text: '말이 도착하면 그 칸에서 할 일을 알려 줄게요.' };
    const me = S.players.find((p) => p.id === S.me);
    const pd = S.pending;
    const tile = pd && pd.tile !== undefined ? S.tiles[pd.tile] : null;
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    // 받침에 따라 조사 고르기 (서울을 / 부산을 / 파리를)
    const j = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); };
    const won = (k) => { const m = Math.floor(Math.abs(k) / 10); const c = Math.abs(k) % 10; return (k < 0 ? '-' : '') + (m && c ? `${m}만${c}천` : m ? `${m}만` : `${c}천`) + '원'; };
    const LV = ['땅', '별장 1채', '별장 2채', '빌딩', '호텔'];
    if (me && me.bankrupt && S.mode !== 'over') return { title: '파산했어요', text: '이번 판은 구경하며 누가 이기는지 지켜봐요. 다음 판에 다시 도전해요!' };
    switch (S.mode) {
      case 'roll': {
        if (me && me.jail) {
          if (me.jailTurns >= 3) return { title: '무인도에서 3턴을 다 쉬었어요', text: '주사위를 굴리면 바로 무인도를 나가서 앞으로 가요.', target: '[data-act="mbRoll"]' };
          if (me.escape) return { title: '무인도예요! 무전기를 쓸 수 있어요', text: `"무전기 카드 쓰고 나가기"를 누르면 바로 나가요. 아끼고 싶으면 주사위를 굴려 더블을 노려요. (${me.jailTurns}/3턴)`, target: '[data-act="mbEscape"]' };
          return { title: '무인도에서 탈출해 봐요', text: `주사위를 굴려 더블이 나오면 바로 나가요. 안 나오면 이번 턴은 쉬어요. (${me.jailTurns}/3턴)`, target: '[data-act="mbRoll"]' };
        }
        const again = S.move && S.move.who === S.me && S.move.dice && S.move.dice[0] === S.move.dice[1];
        if (again) return { title: '더블! 한 번 더 굴려요', text: '같은 숫자가 나와서 한 번 더 굴릴 수 있어요. 다만 3번 연속 더블이면 무인도로 가요.', target: '[data-act="mbRoll"]' };
        return { title: '내 차례예요! 주사위를 굴려요', text: '아래 빨간 버튼을 누르면 주사위가 굴러가고, 나온 숫자만큼 말이 앞으로 가요.', target: '[data-act="mbRoll"]' };
      }
      case 'buy': {
        const left = me ? me.cash - pd.cost : 0;
        const warn = left < 300 ? ' 사고 나면 돈이 꽤 줄어요. 통행료 낼 돈은 남겨 두세요!' : ' 땅을 사 두면 다른 사람이 설 때마다 통행료를 받아요.';
        return { title: `${j(tile.name, '을', '를')} 살까요?`, text: `땅값 ${won(pd.cost)}, 사고 나면 내 돈은 ${won(left)}이에요.${warn}`, target: '[data-act="mbBuy"]' };
      }
      case 'build': {
        const next = tile.level + 1;
        return { title: `${tile.name}에 ${LV[next]}${['', '를', '를', '을', '을'][next]} 지을 수 있어요`, text: `건설비 ${won(pd.cost)}을 내면 통행료가 ${won(tile.tolls[tile.level])}에서 ${won(tile.tolls[next])}으로 올라요. 돈이 넉넉하면 짓는 걸 추천해요.`, target: '[data-act="mbBuild"]' };
      }
      case 'debt': {
        const has = S.tiles.some((t) => t.owner === S.me);
        if (!has) return { title: '팔 땅이 없어요', text: '더 갚을 방법이 없어서 파산을 선언해야 해요.', target: '[data-act="mbBankrupt"]' };
        return { title: `돈이 ${won(pd.amount - (me ? me.cash : 0))} 모자라요!`, text: '아래에서 팔 땅을 누르세요. 땅값+건물값의 절반을 받아요. 통행료가 싼 땅부터 파는 게 좋아요.', target: '.mprop-btn' };
      }
      case 'warp': {
        const picked = ui && ui.mb ? ui.mb.warp : null;
        if (picked !== null && picked !== undefined) return { title: `${S.tiles[picked].name}(으)로 갈까요?`, text: '맞으면 아래 "날아가기"를 눌러요. 다른 칸을 누르면 바꿀 수 있어요.', target: '[data-act="mbWarp"]' };
        return { title: '우주여행! 갈 칸을 골라요', text: `노랗게 테두리가 쳐진 보드 칸 중 가고 싶은 곳을 누르세요. 출발을 지나가면 월급도 받아요.${S.spaceFare && !(me && me.freeWarp) ? ' 컬럼비아호 주인에게 탑승료 20만을 내요.' : ''}`, target: '.mt.warpable' };
      }
      case 'over':
        return { title: '게임이 끝났어요', text: '혼자 남은 사람, 또는 정한 바퀴가 끝났을 때 자산(현금 + 땅·건물에 들인 돈)이 가장 많은 사람이 이겨요. 위 순위를 확인하고 한 판 더 해 볼까요?' };
      default: {
        const who = pd ? name(pd.who) : name(S.turnId);
        if (pd && pd.t === 'buy') return { title: `${who}님이 땅을 살지 고르는 중`, text: '기다리는 동안 보드의 칸을 눌러 땅값과 통행료를 구경해 보세요.' };
        if (pd && pd.t === 'build') return { title: `${who}님이 건물을 지을지 고르는 중`, text: '건물이 생기면 그 땅 통행료가 올라요. 그 칸은 피하고 싶어지죠!' };
        if (pd && pd.t === 'debt') return { title: `${who}님이 빚을 갚는 중`, text: '돈이 모자라서 땅을 팔고 있어요. 팔린 땅은 다시 빈 땅이 돼요.' };
        if (pd && pd.t === 'warp') return { title: `${who}님이 우주여행 갈 곳을 고르는 중`, text: '원하는 칸으로 바로 날아가요. 어디로 갈지 지켜봐요.' };
        return { title: `${who}님 차례예요`, text: '내 차례가 되면 빨간 주사위 버튼이 나타나요. 아래 자산 순위에서 누가 앞서는지 확인해 보세요.' };
      }
    }
  },
};

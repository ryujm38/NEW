'use strict';
// 스플렌더 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.splendor = {
  intro: [
    { icon: '💎', title: '보석 상인이 되어 15점 모으기', text: '보석 칩을 모아 <b>카드</b>를 사고, 카드 왼쪽 위의 <b>점수</b>를 모으는 게임이에요. 누군가 <b>15점</b>을 넘기면 그 라운드까지만 하고, 점수가 가장 높은 사람이 이겨요.', html: true },
    { icon: '✋', title: '내 차례엔 딱 하나만', text: '① 서로 다른 색 보석 <b>3개</b> 가져오기<br>② 같은 색 보석 <b>2개</b> 가져오기 (은행에 그 색이 4개 이상일 때)<br>③ 카드 <b>예약</b>하기 (금 보석 1개 덤, 최대 3장)<br>④ 카드 <b>구매</b>하기', html: true },
    { icon: '🃏', title: '카드 읽는 법', text: '카드 <b>왼쪽 아래 동그라미</b>가 가격이에요. 오른쪽 위 보석은 이 카드가 주는 <b>보너스</b>예요. 테두리 색은 단계예요: 동색 Ⅰ · 은색 Ⅱ · 금색 Ⅲ. 지금 살 수 있는 카드는 <b>금빛으로 반짝이고 ✓</b>가 붙어요.', html: true },
    { icon: '🔁', title: '보너스 = 영원한 할인', text: '산 카드는 그 색 보석 <b>1개를 계속 깎아 줘요</b>. 처음엔 점수 없는 싼 Ⅰ단계 카드로 보너스를 모으고, 할인이 쌓이면 비싼 고득점 카드를 노리세요. 보석은 <b>최대 10개</b>까지만 가질 수 있어요.', html: true },
    { icon: '👑', title: '귀족은 저절로 찾아와요', text: '위쪽 귀족 타일에 적힌 만큼 <b>보너스 카드</b>(보석 칩 말고!)가 모이면 내 차례 끝에 귀족이 찾아와 <b>+3점</b>. 이미 채운 조건은 초록 테두리로 표시돼요.', html: true },
    { icon: '🏆', title: '이기는 요령', text: '여러 색 보너스를 고르게 모으면 어떤 카드든 싸져요. 남이 노리는 카드를 <b>예약</b>해서 막을 수도 있어요. 15점에 도달한 뒤에도 그 라운드는 끝까지 하니, 동점이면 <b>카드를 적게 산 사람</b>이 이겨요.', html: true },
  ],
  tip(S, ui) {
    const H = window.GAME_UI.splendor && window.GAME_UI.splendor.helpers;
    const me = S.players.find((p) => p.id === S.me);
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    const NM = { w: '흰색', u: '파랑', g: '초록', r: '빨강', k: '검정', y: '금' };
    const sp = ui.sp || { gems: [], sel: null, giveBack: {} };
    const total = me ? Object.values(me.gems).reduce((a, b) => a + b, 0) : 0;
    const lastRound = S.endTrigger ? ' 이번 라운드가 마지막이에요!' : '';

    switch (S.mode) {
      case 'main': {
        if (sp.gems.length) {
          const two = sp.gems.length === 2 && sp.gems[0] === sp.gems[1];
          const avail = ['w', 'u', 'g', 'r', 'k'].filter((c) => S.bank[c] > 0).length;
          if (!two && sp.gems.length < Math.min(3, avail)) {
            const more = sp.gems.length === 1
              ? '다른 색을 더 눌러 3개를 채우거나, 같은 색을 한 번 더 누르면 그 색 2개가 돼요(은행에 4개 이상 있을 때).'
              : '다른 색 하나를 더 누르세요. 고른 보석을 다시 누르면 빠져요.';
            return { title: `보석을 ${Math.min(3, avail) - sp.gems.length}개 더 골라요`, text: more, target: '.sptok[data-act="spGem"]' };
          }
          return { title: '좋아요! 이제 가져와요', text: `${sp.gems.map((c) => NM[c]).join('·')} 보석을 가져와요. 아래 금색 버튼을 누르세요.${total + sp.gems.length > 10 ? ' 10개가 넘으면 몇 개는 돌려줘야 해요.' : ''}`, target: '[data-act="spTake"]' };
        }
        const sel = H && H.selectedCard();
        if (sel && sel.deck) {
          return { title: '덱에서 몰래 예약', text: '무슨 카드가 나올지 모르지만 금 보석 1개를 받아요. 확실하지 않으면 펼쳐진 카드를 예약하는 게 더 안전해요.', target: '[data-act="spReserve"]' };
        }
        if (sel) {
          if (sel.afford) return { title: '이 카드를 살 수 있어요!', text: `구매하기를 누르면 ${NM[sel.bonus]} 보너스가 생겨서 다음부터 ${NM[sel.bonus]} 보석 1개가 할인돼요.${sel.points ? ` 점수도 +${sel.points}!` : ''}`, target: '[data-act="spBuy"]' };
          const pi = H.payInfo(sel, me);
          const miss = Object.entries(pi.miss).map(([c, n]) => `${NM[c]} ${n}`).join(', ');
          return { title: '아직 보석이 모자라요', text: `${miss}개가 더 필요해요(금 보석으로 대신할 수도 있어요). 꼭 갖고 싶다면 예약해 두고 나중에 사세요.`, target: me.reservedCount < 3 ? '[data-act="spReserve"]' : '[data-act="spClear"]' };
        }
        if (S.canPass) return { title: '할 수 있는 게 없어요', text: '가져올 보석도, 살 카드도, 예약할 자리도 없어요. 차례를 넘기세요.', target: '[data-act="spPass"]' };
        const cards = [1, 2, 3].flatMap((l) => S.board[l].filter(Boolean));
        const okBoard = cards.filter((c) => c.afford);
        const okRes = (me.reserved || []).filter((c) => c.afford);
        if (okBoard.length || okRes.length) {
          const best = [...okBoard, ...okRes].sort((a, b) => b.points - a.points)[0];
          return { title: '지금 살 수 있는 카드가 반짝여요', text: `✓ 표시 카드는 바로 살 수 있어요.${best.points ? ` 점수가 높은 ${NM[best.bonus]} ${best.points}점 카드를 추천해요.` : ' 점수는 없어도 보너스가 쌓이면 다음 카드가 싸져요.'}${lastRound}`, target: '.spc.ok' };
        }
        if (total >= 9) {
          return { title: '보석이 거의 꽉 찼어요', text: `지금 ${total}개예요(최대 10개). 더 가져오면 돌려줘야 하니, 갖고 싶은 카드를 눌러 예약(금 +1)하는 것도 좋아요.`, target: '.spc[data-act="spCard"]' };
        }
        if (me.cardCount === 0 && total === 0) {
          return { title: '첫 차례: 보석 3개부터', text: '아래 은행에서 서로 다른 색 보석 3개를 눌러 보세요. 맨 아래 Ⅰ단계 카드 중 싼 카드의 가격 색을 고르면 좋아요.', target: '.sptok[data-act="spGem"]' };
        }
        return { title: '내 차례예요! 보석을 모아요', text: `살 수 있는 카드가 아직 없어요. 갖고 싶은 카드의 가격 색 보석을 3개(다른 색) 또는 2개(같은 색) 가져오세요. 카드를 누르면 무엇이 모자란지 알려 줘요.${lastRound}`, target: '.sptok[data-act="spGem"]' };
      }
      case 'discard': {
        const need = S.pending.need;
        const given = Object.values(sp.giveBack || {}).reduce((a, b) => a + b, 0);
        if (given >= need) return { title: '이제 돌려주기를 눌러요', text: '고른 보석은 은행으로 돌아가요.', target: '[data-act="spGiveOk"]' };
        return { title: `보석 ${need}개를 돌려줘야 해요`, text: `보석은 10개까지만 가질 수 있어요. 앞으로 살 카드에 덜 필요한 색을 눌러 ${need - given}개 더 고르세요. (금 보석은 아껴 두는 게 좋아요)`, target: '[data-act="spGive"]' };
      }
      case 'noble':
        return { title: '귀족이 여러 명 왔어요!', text: '한 명만 모실 수 있어요(+3점). 다른 귀족은 나중에 조건을 다시 맞추면 또 찾아와요.', target: '[data-act="spNoble"]' };
      case 'over': {
        const win = S.winnerIds.includes(S.me);
        return { title: win ? '축하해요, 이겼어요! 🏆' : '게임이 끝났어요', text: '점수가 같으면 카드를 적게 산 사람이 이겨요. 다음 판엔 귀족 조건을 노리며 보너스 색을 맞춰 보세요.' };
      }
      default: {
        const pd = S.pending;
        if (pd && pd.t === 'discard') return { title: `${name(pd.who)}님이 보석을 돌려주는 중`, text: '보석이 10개를 넘어서 몇 개를 은행에 돌려주고 있어요.' };
        if (pd && pd.t === 'noble') return { title: `${name(pd.who)}님이 귀족을 고르는 중`, text: '귀족 조건을 두 개 이상 한꺼번에 채웠어요.' };
        const myOk = me && (me.reserved || []).length;
        return { title: `${name(S.turnId)}님 차례예요`, text: `기다리는 동안 다음에 살 카드를 골라 두세요. 위쪽 귀족 타일의 초록 테두리는 내가 이미 채운 조건이에요.${myOk ? ' 예약한 카드는 내 차례에 바로 살 수도 있어요.' : ''}${lastRound}` };
      }
    }
  },
};

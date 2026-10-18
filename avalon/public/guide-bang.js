'use strict';
// 뱅! 초보자 가이드 (틀은 guide.js). S에 들어 있는 정보(내 역할, 내 손패, 공개된 보안관 등)만 쓴다.
window.GUIDES = window.GUIDES || {};
(() => {
  const D = () => window.BANG_DATA || BANG_DATA;
  const nameOf = (S, id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
  const sheriffOf = (S) => S.players.find((p) => p.role === 'sheriff');
  const cardName = (c) => D().CARDS[c.key].name;
  const sel = (id) => `.bng-hand.mine [data-id="${id}"]`;

  // 내 역할별 한 줄 작전. 기본은 html(<b> 강조, 이름 이스케이프), plain이면 태그 없는 글자만
  function roleTip(S, role, plain) {
    const sh = sheriffOf(S);
    const shName = sh && sh.id !== S.me ? ` ${plain ? sh.name : esc(sh.name)}님` : '';
    const t = roleTipRaw(role, shName);
    return plain ? t.replace(/<[^>]+>/g, '') : t;
  }
  function roleTipRaw(role, shName) {
    switch (role) {
      case 'sheriff': return '나는 <b>보안관</b>(모두가 알아요). 누가 나를 공격하는지 보고 무법자를 추리해서 쏘세요. 부보안관을 쏘면 손해예요.';
      case 'deputy': return `나는 <b>부보안관</b>(비밀). 보안관${shName}을 지키고, 보안관을 공격하는 사람을 쏘세요.`;
      case 'outlaw': return `나는 <b>무법자</b>(비밀). 보안관${shName}을 쓰러뜨리면 무법자 팀이 이겨요. 다른 무법자가 누군지는 몰라요.`;
      case 'renegade': return '나는 <b>배신자</b>(비밀). 처음엔 보안관 편인 척 무법자를 줄이고, 마지막에 보안관과 1:1로 남아 이겨야 해요.';
      default: return '';
    }
  }

  const ROLE_ALL = '<b>⭐ 보안관</b>+<b>🛡️ 부보안관</b>: 무법자와 배신자를 모두 쓰러뜨리면 승리 · <b>💰 무법자</b>: 보안관을 쓰러뜨리면 승리 · <b>🐍 배신자</b>: 혼자 끝까지 살아남으면 승리. 보안관만 정체가 공개돼요.';

  window.GUIDES.bang = {
    get intro() {
      const S0 = typeof S !== 'undefined' ? S : null;
      const me = S0 && S0.players ? S0.players.find((p) => p.id === S0.me) : null;
      const role = me && me.role ? D().ROLES[me.role] : null;
      // 역할 카드는 아이콘·제목을 모두 같은 모양으로 둔다(옆 사람이 멀리서 봐도 역할을 알 수 없게)
      const roleCard = role
        ? { icon: '🎭', title: '내 비밀 역할', text: `${roleTip(S0, me.role)}<br><small>언제든 아래 🎭 내 정보에서 다시 볼 수 있어요.</small><br><br><small>${ROLE_ALL}</small>`, html: true }
        : { icon: '🎭', title: '비밀 역할과 이기는 법', text: ROLE_ALL, html: true };
      return [
        { icon: '🤠', title: '서부의 총잡이 게임', text: '4~7명이 각자 <b>비밀 역할</b>을 받고 서로 총을 쏘는 게임이에요. 체력은 <b>총알 모양</b>으로 보여요. 체력이 0이 되면 탈락하고 정체가 공개돼요.', html: true },
        roleCard,
        { icon: '👀', title: '화면 읽는 법', text: '다른 사람들은 <b>앉은 순서대로</b> 가운데 탁자를 둘러앉아 있고, 나는 맨 아래 <b>내 칸</b>이에요. 칸마다 체력·🃏손패 수·<b>나와의 거리</b>가 보여요. 빨간 <b>🎯 거리</b>는 내 뱅!이 닿는 사람, ⭐는 보안관, 노란 테두리는 지금 차례예요.', html: true },
        { icon: '🔄', title: '내 차례에 하는 일', text: '① 카드 2장은 <b>자동으로</b> 뽑아요. ② 손패에서 <b>빛나는 카드</b>를 눌러 원하는 만큼 내요. ③ 다 했으면 <b>턴 끝내기</b>. 손패는 체력 수만큼만 들고 끝낼 수 있어서, 넘치면 버려야 해요.', html: true },
        { icon: '🔫', title: '뱅!과 빗나감!', text: '<b>뱅!</b>은 한 턴에 한 번, <b>사거리</b> 안의 사람(빨간 🎯)에게 쏴요. 맞은 사람은 <b>빗나감!</b>을 내서 막거나 체력 1을 잃어요. 무기를 앞에 놓으면 사거리가 늘어나요.', html: true },
        { icon: '🍺', title: '카드 색, 맥주, 캐릭터', text: '<b>갈색</b> 카드는 한 번 쓰고 버리고, <b>파란</b> 카드는 앞에 놓아 계속 효과를 보는 장비예요. <b>맥주</b>는 체력 +1, 죽기 직전에도 마실 수 있어요(둘만 남으면 안 돼요). 사람마다 다른 <b>캐릭터 능력</b>은 <b>🎭 내 정보</b>에서 확인하세요.', html: true },
      ];
    },
    tip(S, ui) {
      const me = S.players.find((p) => p.id === S.me);
      if (!me) return null;
      const C = D().CARDS;
      const role = me.role;
      if (S.phase === 'over') {
        const team = role ? D().ROLES[role].team : null;
        const label = { law: '보안관 팀', outlaw: '무법자', renegade: '배신자' }[S.winner];
        return team === S.winner
          ? { title: `${label} 승리! 내가 이겼어요 🎉`, text: '모든 사람의 정체가 공개됐어요. 결과 표에서 누가 무슨 역할이었는지 확인해 보세요.' }
          : { title: `${label} 승리… 이번엔 졌어요`, text: '결과 표에서 정체를 확인해 보세요. 다음 판엔 누가 누구를 공격하는지 잘 보면 역할을 추리할 수 있어요.' };
      }
      if (S.phase !== 'play') return null;
      if (!me.alive) {
        return { title: '탈락했어요', text: role === 'renegade' ? '배신자는 혼자 살아남아야 해서 이번 판은 졌어요. 남은 사람들의 대결을 구경해요.' : '탈락해도 내 팀이 이기면 같이 이겨요! 남은 사람들을 응원하며 구경해요.' };
      }
      const pd = S.pending;
      const okCards = S.hand.filter((c) => c.ok);
      const selCard = S.hand.find((c) => c.id === ui.bSel);
      switch (S.mode) {
        case 'respond': {
          const attacker = nameOf(S, pd.kind === 'duel' ? pd.other : pd.source);
          const need = pd.kind === 'bang' || pd.kind === 'gatling' ? '빗나감!' : '뱅!';
          const what = { bang: `${attacker}님이 나에게 뱅!을 쐈어요`, gatling: `${attacker}님의 개틀링!`, indians: `${attacker}님의 인디언 습격!`, duel: `${attacker}님과 결투 중!` }[pd.kind];
          if (selCard && selCard.ok) return { title: what, text: `아래 "${cardName(selCard)}으로 막기" 버튼을 누르면 막아요.`, target: '[data-act="bangRespond"]' };
          return { title: what, text: `빛나는 ${need} 카드를 고르고 아래 막기 버튼을 누르세요${pd.need > 1 ? ` (${pd.need}장 필요)` : ''}. 아끼고 싶으면 "포기"를 눌러 체력 1을 잃어도 돼요.${pd.kind === 'duel' ? ' 결투는 뱅!을 더 오래 버티는 쪽이 이겨요.' : ''}`, target: '.bng-hand.mine .bng-card.okc' };
        }
        case 'barrel':
          return { title: '배럴을 써 보세요', text: '배럴은 카드를 1장 뒤집어 ♥가 나오면 공격을 막아 줘요. 실패해도 손해가 없으니 쓰는 게 좋아요.', target: '[data-act="bangBarrel"][data-use="1"]' };
        case 'dying':
          if (selCard && selCard.ok) return { title: '맥주를 마셔요!', text: '"맥주 마시기"를 누르면 체력 1을 되찾고 살아나요.', target: '[data-act="bangRespond"]' };
          return { title: '체력이 0이에요! 맥주로 버티기', text: okCards.length ? '빛나는 맥주 카드를 눌러 마시면 살아날 수 있어요.' : '맥주가 없으면 탈락해요. 시드 케첨이라면 카드 2장을 버려 살아날 수 있어요.', target: okCards.length ? '.bng-hand.mine .bng-card.okc' : '[data-act="bangSid"]' };
        case 'store':
          if (ui.bStore) return { title: '이 카드를 가져갈까요?', text: '"이 카드 가져가기"를 누르면 내 손으로 와요. 남은 카드는 다음 사람이 골라요.', target: '[data-act="bangStorePick"]' };
          return { title: '잡화점: 1장 고르기', text: '펼쳐진 카드 중 하나를 고르세요. 빗나감!, 맥주, 무기처럼 오래 쓸 카드가 좋아요.', target: '.bng-store .bng-card' };
        case 'drawChoice':
          return { title: '카드를 어떻게 뽑을까요?', text: pd && pd.kind === 'pedro' ? '페드로 능력: 버린 더미 맨 위 카드가 좋으면 그걸 첫 카드로 가져올 수 있어요. 모르겠으면 덱에서 2장!' : '제시 존스 능력: 다른 사람의 손패에서 1장을 뽑아올 수 있어요. 모르겠으면 덱에서 2장!', target: '[data-act="bangChoose"]' };
        case 'kit':
          if (selCard && selCard.ok) return { title: '이 카드를 덱 위로 돌려놓을까요?', text: '가장 필요 없는 카드를 돌려놓으세요. 버튼을 누르면 확정돼요.', target: '[data-act="bangKit"]' };
          return { title: '키트 칼슨: 3장 중 1장 돌려놓기', text: '빛나는 3장 중 가장 덜 필요한 카드를 눌러 고르세요.', target: '.bng-hand.mine .bng-card.okc' };
        case 'discard':
          if (selCard) return { title: `${cardName(selCard)} 카드를 버릴까요?`, text: '"이 카드 버리기"를 누르면 버려요.', target: '[data-act="bangDiscard"]' };
          return { title: `손패 ${S.needDiscard}장을 버려야 해요`, text: `손패는 체력(${me.life})만큼만 들고 턴을 끝낼 수 있어요. 빗나감!과 맥주는 남겨 두고 덜 쓸모 있는 카드부터 버리세요.`, target: '.bng-hand.mine .bng-card' };
        case 'main': {
          if (ui.bPick) {
            const t = S.players.find((p) => p.id === ui.bPick.target);
            return { title: selCard && selCard.key === 'panic' ? '어떤 카드를 가져올까요?' : '어떤 카드를 버리게 할까요?', text: `${t ? t.name : ''}님의 손패(무작위 1장)나 앞에 놓인 장비 중 하나를 고르세요.`, target: '[data-act="bangPick"]' };
          }
          if (ui.bSid) return { title: '버릴 카드 2장 고르기', text: '손패에서 버릴 카드 2장을 누르면 체력 1을 회복해요.', target: '.bng-hand.mine .bng-card' };
          if (selCard) {
            if (!selCard.ok) {
              const why = selCard.key === 'missed' ? '빗나감!은 공격받을 때 막는 용도라 지금은 못 내요.'
                : selCard.key === 'bang' ? (S.bangUsed ? '뱅!은 한 턴에 한 번만 쏠 수 있어요.' : '사거리 안에 아무도 없어요. 무기나 스코프로 사거리를 늘려 보세요.')
                  : selCard.key === 'beer' ? '체력이 가득 찼거나 둘만 남아서 지금은 못 마셔요.' : '지금은 이 카드를 낼 수 없어요.';
              return { title: '이 카드는 지금 못 내요', text: why };
            }
            if (selCard.targets) return { title: '누구에게 쓸까요?', text: `${C[selCard.key].name}: 위에서 과녁이 표시된 사람의 칸을 누르세요. 그만두려면 같은 카드를 한 번 더 눌러요.`, target: '.bng-seat.target' };
            return { title: `${C[selCard.key].name} 내기`, text: `${C[selCard.key].desc} "카드 내기"를 누르면 써요.`, target: '[data-act="bangPlay"]' };
          }
          if (!okCards.length) return { title: '낼 카드가 없어요', text: '"턴 끝내기"를 누르면 다음 사람 차례가 돼요. 빗나감!은 남겨 두면 공격을 막을 수 있어요.', target: '[data-act="bangEnd"]' };
          const key = (c) => (c.asBang ? 'bang' : c.key);
          const pick = (k) => okCards.find((c) => key(c) === k);
          const draw = pick('wellsfargo') || pick('stagecoach');
          if (draw) return { title: '먼저 카드를 더 뽑아요', text: `${cardName(draw)}을(를) 먼저 쓰면 손패가 늘어서 더 많은 걸 할 수 있어요.`, target: sel(draw.id) };
          // 무기는 지금보다 사거리가 길 때만 권한다(약한 총으로 바꾸면 손해)
          const equip = okCards.find((c) => C[c.key].type === 'blue' ? c.key !== 'jail' && c.key !== 'dynamite' : C[c.key].type === 'gun' && C[c.key].range > (S.range || 1));
          if (equip) return { title: '장비를 앞에 놓아요', text: `파란 카드 ${cardName(equip)}: ${C[equip.key].desc} 한 번 놓으면 계속 효과가 있어요.`, target: sel(equip.id) };
          const beer = pick('beer');
          if (beer && me.life < me.max - 1) return { title: '맥주로 체력 회복', text: `체력이 ${me.life}/${me.max}이에요. 맥주를 마셔 1 회복해요.`, target: sel(beer.id) };
          const bang = pick('bang');
          if (bang) {
            // 가이드 띠는 멀리서도 보이니 내 역할에 따라 다른 말을 하지 않는다(작전은 🎭 내 정보에)
            return {
              title: '뱅!을 쏠 수 있어요',
              text: `뱅! 카드를 누르고 빨간 🎯 거리 표시가 있는 사람을 골라요. 누구를 쏠지는 내 역할 작전(🎭 내 정보)을 떠올려 보세요.${bang.asBang ? ' (빗나감!을 뱅!으로 쓸 수 있어요)' : ''}`,
              target: sel(bang.id),
            };
          }
          return { title: '카드를 더 내거나 턴 끝내기', text: `빛나는 카드를 누르면 설명이 나와요. 더 낼 게 없으면 "턴 끝내기"를 누르세요.${me.life >= me.max ? ' (체력이 가득 차서 맥주는 아껴 두세요)' : ''}`, target: '[data-act="bangEnd"]' };
        }
        default: {
          // 다른 사람을 기다리는 중
          if (pd) {
            const who = nameOf(S, pd.who);
            const t = { respond: `${who}님이 공격을 막을지 고르는 중이에요.`, barrel: `${who}님이 배럴을 쓸지 고르는 중이에요.`, dying: `${who}님이 죽기 직전이에요! 맥주로 버틸지 고르는 중.`, store: `잡화점: ${who}님이 카드를 고르는 중이에요. 낸 사람부터 차례로 한 장씩 골라요.`, drawChoice: `${who}님이 카드 뽑는 방법을 고르는 중이에요.`, kit: `${who}님이 카드를 덱 위로 돌려놓는 중이에요.` }[pd.t];
            return { title: '잠시 기다려요', text: t || '다른 사람이 고르는 중이에요.' };
          }
          return { title: `${nameOf(S, S.turnId)}님 차례예요`, text: '누가 누구를 쏘는지 잘 보면 정체를 추리할 수 있어요. 빨간 🎯 거리는 내 뱅!이 닿는 사람이에요. 내 역할 작전은 🎭 내 정보에 있어요.' };
        }
      }
    },
  };
})();

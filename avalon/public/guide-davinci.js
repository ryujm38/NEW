'use strict';
// 다빈치 코드 초보자 가이드 (틀은 guide.js)
window.GUIDES = window.GUIDES || {};
window.GUIDES.davinci = {
  intro: [
    { icon: '🔢', title: '숨긴 숫자를 추리해서 맞히기', text: '모두 검은색·흰색 숫자 타일(0~11)을 세워 두고 숫자를 숨겨요. 상대 타일의 숫자를 추리해서 맞히면 그 타일이 공개돼요. <b>내 숨은 타일이 마지막까지 남은 한 사람</b>이 이겨요.', html: true },
    { icon: '📏', title: '타일은 항상 작은 숫자부터', text: '모든 줄은 왼쪽부터 <b>작은 숫자 순서</b>예요. 숫자가 같으면 <b>검은색이 왼쪽</b>. 색과 자리는 모두에게 보이니까, 예를 들어 공개된 5와 9 사이의 타일은 6~8 중 하나겠죠? 이게 추리의 열쇠예요. <b>조커(−)</b>만은 주인이 아무 자리에나 둘 수 있어요.', html: true },
    { icon: '👆', title: '내 차례: 뽑고, 골라서, 말하기', text: '차례가 오면 가운데에서 타일 1개를 자동으로 뽑아요(나만 봐요). 상대의 <b>숨은 타일을 하나 누르고</b>, 아래 숫자판에서 숫자를 고른 뒤 <b>"말하기"</b>를 눌러요.', html: true },
    { icon: '🎯', title: '맞으면 계속, 틀리면 내가 공개', text: '<b>맞으면</b> 그 타일이 공개되고, 한 번 더 맞히거나 <b>그만하기</b>를 고를 수 있어요. 그만하면 뽑은 타일을 <b>숨긴 채로</b> 내 줄에 넣어요. <b>틀리면</b> 뽑은 타일을 <b>공개한 채로</b> 넣고 차례가 끝나요. (뽑은 타일이 없으면 내 숨은 타일 하나를 공개해요)', html: true },
    { icon: '📝', title: '메모와 공개된 숫자 표', text: '상대 타일 아래 <b>✗5</b>는 누군가 5라고 했다가 틀린 기록이에요. 타일을 누르면 <b>나만 보는 메모</b>를 쓸 수 있고(내 차례가 아닐 때, 또는 숫자판의 📝), 가운데 <b>공개된 숫자</b> 표에서 이미 나온 숫자를 볼 수 있어요.', html: true },
    { icon: '🙈', title: '내 숫자는 나만 봐요', text: '내 타일의 숫자는 내 화면에만 보여요. 옆 사람이 볼까 걱정되면 내 타일 칸의 <b>🙈 숫자 가리기</b>를 눌러요. 타일 왼쪽 위 작은 동그라미가 빈 것은 숨김, 금색은 공개된 타일이에요.', html: true },
  ],
  tip(S, ui) {
    const me = S.players.find((p) => p.id === S.me);
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : ''; };
    const word = (n) => (n === -1 ? '조커' : String(n));
    const dv = ui && ui.dv;
    switch (S.mode) {
      case 'setup':
        if (S.slots) return { title: '조커를 받았어요! 놓을 자리를 골라요', text: '조커는 숫자 순서와 상관없이 아무 데나 둘 수 있어요. 내 줄의 ＋를 눌러 자리를 고르고 "여기에 조커 놓기"를 눌러요. 헷갈리게 숨겨 두면 좋아요.', target: '[data-act="dvJoker"]' };
        return { title: '내 타일을 확인해요', text: `받은 타일 ${me ? me.row.length : ''}개가 작은 숫자부터 놓였어요. 확인했으면 "준비 완료"를 눌러요. 모두 준비되면 시작해요.`, target: '[data-act="dvReady"]' };
      case 'guess': {
        const sel = dv && dv.sel;
        if (!sel) {
          if (S.guesses) return { title: `${S.guesses}번 맞혔어요! 더 할까요?`, text: '또 맞힐 자신이 있으면 다른 숨은 타일을 눌러요. 틀리면 뽑은 타일이 공개되니, 자신 없으면 "그만하기"를 눌러 뽑은 타일을 숨긴 채로 지켜요.', target: '[data-act="dvStop"]' };
          return { title: '내 차례! 상대 타일을 하나 골라요', text: '반짝이는 상대의 숨은 타일 중 숫자를 짐작할 수 있는 타일을 눌러요. 양옆의 공개된 숫자와 색을 보면 범위를 좁힐 수 있어요.', target: '.dv-opps .dv-cell:has(> .dv-t.pick)' };
        }
        if (dv.val === null || dv.val === undefined) return { title: '숫자를 골라요', text: '아래 숫자판에서 이 타일일 것 같은 숫자를 눌러요. 줄은 작은 숫자 순서라 왼쪽 타일보다 크고 오른쪽 타일보다 작아요(조커는 예외). 줄이 그어진 숫자는 이미 누가 말했다가 틀린 숫자예요.', target: '.dv-pad' };
        return { title: `"${word(dv.val)}"(이)라고 말할까요?`, text: '맞으면 그 타일이 공개되고 계속할 수 있어요. 틀리면 내가 뽑은 타일이 모두에게 공개돼요.', target: '[data-act="dvSay"]' };
      }
      case 'place':
        if (S.placeOpen) return { title: '틀렸어요… 뽑은 타일이 공개돼요', text: '규칙대로 방금 뽑은 타일을 공개한 채로 내 줄에 넣어요. "여기에 놓기"를 누르면 차례가 끝나요.', target: '[data-act="dvPlace"]' };
        if (S.drawn && S.drawn.n === -1) return { title: '뽑은 조커를 숨겨 놓아요', text: '조커는 아무 자리나 괜찮아요. 내 줄의 ＋로 자리를 고르고 "여기에 놓기"를 눌러요.', target: '[data-act="dvPlace"]' };
        return { title: '뽑은 타일을 숨겨서 놓아요', text: '잘 멈췄어요! 뽑은 타일이 숫자 순서에 맞는 자리에 숨겨진 채로 들어가요. "여기에 놓기"를 눌러요.', target: '[data-act="dvPlace"]' };
      case 'reveal':
        if (dv && dv.rsel) return { title: '이 타일을 공개할까요?', text: '공개하면 모두가 그 숫자를 알게 돼요. 다른 타일로 바꾸려면 내 타일을 다시 눌러요.', target: '[data-act="dvReveal"]' };
        return { title: '내 타일 하나를 공개해야 해요', text: '가운데 타일이 떨어져서 뽑은 타일이 없으니, 대신 내 숨은 타일 하나를 공개해요. 들켜도 덜 아픈 타일(이미 짐작당한 타일)을 고르는 게 좋아요.', target: '.dv-me .dv-cell:has(> .dv-t.pick)' };
      case 'out':
        return { title: '탈락했어요', text: '내 타일이 모두 공개됐어요. 남은 사람들이 누구 타일을 맞히는지 지켜보면서 다음 판 작전을 세워요.' };
      case 'over':
        return { title: '게임이 끝났어요', text: '숨은 타일이 마지막까지 남은 사람이 이겼어요. 이제 모든 타일이 보여요. 점선 테두리는 끝까지 숨겨 둔 타일이에요. 한 판 더 해 볼까요?' };
      default: {
        if (S.phase === 'setup') return { title: '다른 사람이 타일을 확인하는 중', text: '모두 "준비 완료"를 누르면 시작해요. 잠깐 기다려요.' };
        const who = name(S.turnId);
        if (S.step === 'place') return { title: `${who}님이 뽑은 타일을 놓는 중`, text: S.placeOpen ? '틀려서 뽑은 타일이 곧 공개돼요. 그 숫자도 추리에 써요!' : '숨긴 채로 들어가는 타일의 자리를 잘 봐 두세요. 양옆 숫자로 범위를 짐작할 수 있어요.' };
        if (S.step === 'reveal') return { title: `${who}님이 자기 타일을 공개하는 중`, text: '틀렸는데 뽑은 타일이 없어서 자기 타일 하나를 공개해요.' };
        return { title: `${who}님이 숫자를 맞히는 중`, text: '누가 무슨 숫자를 말하고 틀리는지 잘 들어 두세요(타일 아래 ✗ 표시). 상대 타일을 누르면 나만 보는 메모를 쓸 수 있어요.' };
      }
    }
  },
};

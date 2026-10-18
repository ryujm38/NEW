'use strict';
// 아발론 초보자 가이드 (틀은 guide.js). 내 역할(S.roleInfo)과 지금 단계(S.phase)에 맞춰 한두 문장으로 알려 준다.
// 같은 방에서 옆 사람이 볼 수 있으니, 크게 보이는 제목에는 역할·편을 쓰지 않고 반짝이는 곳도 선·악이 같게 한다.
window.GUIDES = window.GUIDES || {};
window.GUIDES.avalon = {
  intro: [
    { icon: '🛡️', title: '선과 악의 숨은 싸움', text: '아서 왕의 기사들(<b>선</b>) 사이에 <b>악</b>의 첩자가 숨어 있어요. 원정을 최대 5번 떠나는데, <b>3번 성공</b>시키면 선이, <b>3번 실패</b>시키면 악이 이겨요. 누가 악인지 대화와 투표로 알아내는 게임이에요.', html: true },
    { icon: '🎭', title: '내 역할은 나만 알아요', text: '<b>멀린</b>은 악이 누군지 알고, <b>퍼시벌</b>은 멀린 후보 2명(한 명은 모르가나)을 알아요. <b>신하</b>는 아무것도 몰라요. 악(<b>모르가나·암살자·하수인</b>)은 서로를 알아요. 역할 카드는 모두 같은 색이니 화면을 너무 내보이지만 않으면 돼요. 🎭 버튼으로 다시 볼 수 있어요.', html: true },
    { icon: '👑', title: '리더가 원정대를 골라요', text: '왕관을 쓴 <b>리더</b>가 위 메달에 적힌 인원만큼 원정대를 골라요. 그다음 모두가 <b>찬성/반대</b> 투표를 해요. <b>과반</b>이 찬성해야 출발하고(동수는 부결), 아니면 리더가 다음 사람에게 넘어가요. <b>5번 연속 부결되면 악이 이겨요!</b>', html: true },
    { icon: '⚔️', title: '원정: 몰래 카드 내기', text: '원정대원은 몰래 <b>성공</b> 또는 <b>실패</b> 카드를 내요. 선은 성공만 낼 수 있고, 악은 고를 수 있어요. 실패가 <b>1장만</b> 나와도 원정은 실패예요(7명 이상일 때 4번째 원정은 <b>2장</b>). 누가 냈는지는 비밀이에요.', html: true },
    { icon: '🗡️', title: '마지막 반전: 암살', text: '선이 3번 성공해도 끝이 아니에요. <b>암살자</b>가 멀린을 맞히면 악의 역전승! 그래서 멀린은 아는 걸 티 나지 않게 살짝만 알려 줘야 해요.', html: true },
    { icon: '🧭', title: '화면 보는 법', text: '맨 위 <b>원정 판</b>에 결과·점수·지금 리더(👑)·연속 부결이 모여 있어요. 그 아래는 지금 단계, 내가 누를 버튼은 <b>맨 아래</b>에 있어요. 막히면 이 <b>가이드</b> 띠를 보세요. 📜 기록에서 지난 투표를 볼 수 있어요.', html: true },
  ],
  tip(S) {
    const ri = S.roleInfo;
    const me = S.players.find((p) => p.id === S.me);
    if (!ri || !me) return null;
    const key = ri.key;
    const evil = ri.team === 'evil';
    const isHost = S.hostId === S.me;
    const name = (id) => { const p = S.players.find((x) => x.id === id); return p ? p.name : '?'; };
    const isLeader = S.leaderId === S.me;
    const goodN = S.results.filter((r) => r.ok).length;
    const badN = S.results.length - goodN;
    const ackWait = (next) => {
      const n = S.players.filter((p) => p.acked).length;
      const total = S.players.filter((p) => p.connected).length;
      return { title: `다른 사람을 기다리는 중 (${n}/${total})`, text: `모두 확인하면 ${next}${isHost ? ' 자리를 비운 사람이 있으면 맨 아래 "기다리지 않고" 버튼으로 넘길 수 있어요.' : ''}` };
    };
    // 역할별 한마디 (작은 글씨로만 보여요)
    const roleHint = {
      merlin: '악이 누군지 알지만, 티 나게 몰아가면 마지막에 암살자에게 잡혀요. 슬쩍 돌려서 말해요.',
      percival: '멀린 후보 2명 중 진짜 멀린을 찾아 지켜 주세요. 한 명은 모르가나예요.',
      servant: '정보가 없으니 투표 기록과 원정 결과를 보고 수상한 사람을 찾아요.',
      morgana: '퍼시벌에게 멀린처럼 보여요. 멀린인 척 그럴듯하게 행동해 보세요.',
      assassin: '멀린이 누군지 계속 관찰해요. 악을 너무 잘 아는 사람이 수상해요.',
      minion: '선인 척하면서 원정대에 끼어들어 몰래 실패시키는 게 목표예요.',
    }[key];

    switch (S.phase) {
      case 'roles':
        if (me.acked) return ackWait('첫 원정이 시작돼요.');
        return {
          title: '내 역할을 확인해요',
          text: `카드에 적힌 역할과 아래 "알고 있는 정보"를 기억하세요. ${roleHint} 다 봤으면 맨 아래 버튼을 눌러요.`,
          target: '.av [data-act="ack"]',
        };
      case 'propose': {
        const size = S.teamSize;
        const last = S.rejects >= S.maxRejects - 1;
        if (isLeader) {
          if (S.draft.length < size) {
            return {
              title: `내가 리더예요! ${size}명을 골라요 (${S.draft.length}/${size})`,
              text: last
                ? '이번에 부결되면 5연속 부결로 악이 이겨요. 모두가 찬성할 만한 사람으로 골라요.'
                : evil
                  ? '동료 악을 한 명 끼워 넣으면 원정을 실패시킬 수 있어요. 너무 뻔하면 부결되니 조심!'
                  : '믿을 만한 사람을 자리에서 눌러 골라요. 다시 누르면 빠져요. 나 자신을 넣는 게 가장 안전해요.',
              target: '.av button.av-seat',
            };
          }
          return { title: '다 골랐어요. 확정해요', text: '맨 아래 버튼을 누르면 모두가 이 원정대에 찬성/반대 투표를 해요. 자리를 다시 누르면 빼고 바꿀 수 있어요.', target: '.av [data-act="propose"]' };
        }
        return {
          title: `${name(S.leaderId)}님이 원정대를 고르는 중`,
          text: last ? `벌써 ${S.rejects}번 연속 부결이에요. 한 번 더 부결되면 악이 이기니 이번엔 웬만하면 통과시키는 게 좋아요.` : `누구를 넣으면 좋을지 말로 의견을 내 보세요. ${roleHint}`,
        };
      }
      case 'vote':
        if (S.myVote !== null) {
          const n = S.players.filter((p) => p.voted).length;
          return { title: `투표 완료! 기다려요 (${n}/${S.players.length})`, text: '전원이 투표하면 누가 찬성/반대했는지 한꺼번에 공개돼요. 잘 기억해 두세요.' };
        }
        if (S.rejects >= S.maxRejects - 1) {
          return { title: '마지막 기회! 찬성할까요?', text: evil ? '이번에 부결되면 5연속 부결로 악이 바로 이겨요. 반대표를 노려 보세요.' : '이번에도 부결되면 악이 바로 이겨요. 선이라면 웬만하면 찬성하세요!', target: '.av-token' };
        }
        return {
          title: '이 원정대에 찬성? 반대?',
          text: evil
            ? '동료 악이 원정대에 있으면 찬성해서 실패 기회를 노려요. 하지만 너무 티 나지 않게! 맨 아래에서 골라요.'
            : key === 'merlin'
              ? '악이 끼어 있으면 반대하는 게 좋지만, 매번 정확하면 암살자가 눈치채요. 맨 아래에서 골라요.'
              : '금테 두른 원정대 자리를 보고, 수상한 사람이 있으면 반대, 믿을 만하면 찬성을 눌러요.',
          target: '.av-token',
        };
      case 'voteResult': {
        const lv = S.lastVote;
        if (me.acked) return ackWait(lv && lv.approved ? '원정대가 카드를 내요.' : '다음으로 넘어가요.');
        if (lv && lv.approved) return { title: '가결! 원정을 떠나요', text: '원정대원은 곧 몰래 카드를 내요. 자리마다 찬성/반대 동전이 보이니 기억해 두면 단서가 돼요.', target: '.av [data-act="ack"]' };
        if (S.rejects >= S.maxRejects) return { title: '5번 연속 부결! 악의 승리예요', text: '원정대가 5번 연속으로 부결되면 악이 이겨요. 확인을 누르면 결과 화면으로 가요.', target: '.av [data-act="ack"]' };
        return { title: `부결! 리더가 바뀌어요 (연속 ${S.rejects}/${S.maxRejects})`, text: `다음 사람이 새 원정대를 골라요. 연속 부결이 ${S.maxRejects}번이 되면 악이 이겨요. 확인을 눌러요.`, target: '.av [data-act="ack"]' };
      }
      case 'quest': {
        const two = S.failsNeeded[S.round] > 1;
        if (!S.team.includes(S.me)) return { title: `원정대가 카드를 내는 중 (${S.cardsIn}/${S.team.length})`, text: '나는 이번 원정대가 아니에요. 결과를 기다려요. 실패가 나오면 원정대 중 누가 수상한지 생각해 봐요.' };
        if (S.myCard !== null) return { title: '카드를 냈어요', text: '다른 대원이 모두 내면 결과가 공개돼요. 누가 무엇을 냈는지는 공개되지 않아요.' };
        // 제목과 반짝이는 곳은 선·악이 똑같다. 설명만 다르게(작은 글씨)
        return {
          title: '원정 카드를 몰래 내요',
          text: !evil
            ? '선은 성공 카드만 낼 수 있어요. 맨 아래 파란 성배(성공) 카드를 눌러요.'
            : two
              ? '이번 원정은 실패 카드가 2장 나와야 실패예요. 동료와 함께 실패를 내야 해요.'
              : '실패를 내면 원정이 실패하지만 원정대 모두가 의심받아요. 일부러 성공을 내서 믿음을 얻는 작전도 있어요.',
          target: '.av-qc',
        };
      }
      case 'questResult': {
        if (me.acked) return ackWait('다음으로 넘어가요.');
        const q = S.lastQuest;
        if (badN >= 3) return { title: '원정 3번 실패! 악의 승리예요', text: '확인을 누르면 결과 화면에서 모두의 역할이 공개돼요.', target: '.av [data-act="ack"]' };
        if (goodN >= 3) return { title: '선이 3번 성공! 이제 암살 단계예요', text: '확인을 누르면 암살자가 멀린을 한 명 지목해요. 맞히면 악의 역전승이에요.', target: '.av [data-act="ack"]' };
        return q && q.ok
          ? { title: '원정 성공!', text: '선이 한 걸음 앞서요. 위 메달에 결과가 쌓여요. 확인을 눌러 다음 라운드로 가요.', target: '.av [data-act="ack"]' }
          : { title: `원정 실패… (실패 ${q ? q.fails : '?'}장)`, text: '이번 원정대 안에 악이 있다는 뜻이에요! 누가 그 원정대에 있었는지 기억하세요.', target: '.av [data-act="ack"]' };
      }
      case 'assassin':
        if (key === 'assassin') return { title: '멀린을 찾아 지목하세요!', text: '게임 내내 악을 너무 잘 알던 사람이 멀린일 가능성이 커요. 동료와 상의한 뒤 자리를 눌러요.', target: '.av-seat.aim' };
        if (key === 'merlin') return { title: '암살자가 멀린을 찾는 중', text: '들키지 않게 태연하게 기다려요. 암살자가 나를 고르면 악이 역전승해요.' };
        if (evil) return { title: '암살자가 멀린을 찾는 중', text: '멀린이 누구였을지 말로 의논해서 암살자에게 알려 주세요.' };
        return { title: '암살자가 멀린을 찾는 중', text: '선은 3번 성공했지만 아직 안심하긴 일러요. 멀린이 들키지 않기를 기다려요.' };
      case 'over': {
        const won = (S.winner === 'good') === !evil;
        return { title: won ? '이겼어요! 🎉' : '아쉽게 졌어요', text: `이제 모두의 역할이 공개됐어요. 자리에서 누가 어떤 역할이었는지 확인해 보세요.${isHost ? ' 맨 아래에서 바로 다시 할 수 있어요.' : ''}` };
      }
      default:
        return null;
    }
  },
};

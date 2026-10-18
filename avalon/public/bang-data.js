'use strict';
// 뱅! 카드·캐릭터·역할 정보. 서버(require)와 화면(<script>)이 같은 파일을 쓴다.

// 덱 80장의 무늬·숫자(A=14)는 공개된 카드 목록 두 곳(wflosin/bang-card-game, zjevik/Bang-card-game)과
// 공식 규칙서 번역(무기 카드 무늬)을 대조해서 옮겼다. 카드 이름 → ['무늬+숫자', ...]
const BANG_DECK = {
  bang: ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'dJ', 'dQ', 'dK', 'dA', 'sA', 'hA', 'hQ', 'hK'],
  missed: ['c10', 'cJ', 'cQ', 'cK', 'cA', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
  beer: ['h6', 'h7', 'h8', 'h9', 'h10', 'hJ'],
  panic: ['hA', 'hJ', 'hQ', 'd8'],
  catbalou: ['d9', 'd10', 'dJ', 'hK'],
  stagecoach: ['s9', 's9'],
  wellsfargo: ['h3'],
  genstore: ['c9', 'sQ'],
  indians: ['dA', 'dK'],
  gatling: ['h10'],
  duel: ['c8', 'sJ', 'dQ'],
  saloon: ['h5'],
  jail: ['s10', 'sJ', 'h4'],
  dynamite: ['h2'],
  barrel: ['sQ', 'sK'],
  scope: ['sA'],
  mustang: ['h8', 'h9'],
  volcanic: ['s10', 'c10'],
  schofield: ['cJ', 'cQ', 'sK'],
  remington: ['cK'],
  carabine: ['cA'],
  winchester: ['s8'],
};

const BANG_DATA = {
  DECK: BANG_DECK,
  SUITS: { s: '♠', h: '♥', d: '♦', c: '♣' },
  // type: brown(한 번 쓰고 버림) / blue(앞에 놓는 장비) / gun(무기)
  CARDS: {
    bang: { name: '뱅!', type: 'brown', icon: '🔫', n: 25, desc: '사거리 안의 한 명을 공격해요. 상대가 빗나감!을 못 내면 체력 -1. 한 턴에 한 번만.' },
    missed: { name: '빗나감!', type: 'brown', icon: '💨', n: 12, desc: '뱅!을 맞을 때 내서 막아요.' },
    beer: { name: '맥주', type: 'brown', icon: '🍺', n: 6, desc: '체력 +1. 죽기 직전에도 쓸 수 있어요. 둘만 남으면 쓸 수 없어요.' },
    panic: { name: '패닉!', type: 'brown', icon: '😱', n: 4, desc: '거리 1 안의 사람 카드 1장(손패는 무작위, 앞에 놓인 것은 골라서)을 내 손으로 가져와요.' },
    catbalou: { name: '캣 발루', type: 'brown', icon: '🐱', n: 4, desc: '아무나의 카드 1장(손패는 무작위, 앞에 놓인 것은 골라서)을 버리게 해요.' },
    stagecoach: { name: '역마차', type: 'brown', icon: '🚌', n: 2, desc: '카드 2장을 뽑아요.' },
    wellsfargo: { name: '웰스 파고', type: 'brown', icon: '💰', n: 1, desc: '카드 3장을 뽑아요.' },
    genstore: { name: '잡화점', type: 'brown', icon: '🏪', n: 2, desc: '살아 있는 사람 수만큼 카드를 펼치고, 낸 사람부터 한 장씩 골라 가져가요.' },
    indians: { name: '인디언!', type: 'brown', icon: '🏹', n: 2, desc: '다른 모두가 뱅!을 버리지 못하면 체력 -1.' },
    gatling: { name: '개틀링', type: 'brown', icon: '🌀', n: 1, desc: '다른 모두에게 뱅!을 쏴요. (거리 무관, 각자 빗나감!으로 막아요)' },
    duel: { name: '결투', type: 'brown', icon: '⚔️', n: 3, desc: '한 명을 지목해요. 지목당한 사람부터 번갈아 뱅!을 버리고, 못 버리는 쪽이 체력 -1.' },
    saloon: { name: '살롱', type: 'brown', icon: '🥃', n: 1, desc: '살아 있는 모두가 체력 +1.' },
    jail: { name: '감옥', type: 'blue', icon: '⛓️', n: 3, desc: '보안관이 아닌 사람 앞에 놓아요. 그 사람은 턴 시작에 ♥를 못 뽑으면 턴을 건너뛰어요.' },
    dynamite: { name: '다이너마이트', type: 'blue', icon: '🧨', n: 1, desc: '내 앞에 놓아요. 턴 시작에 ♠2~9가 나오면 체력 -3, 아니면 다음 사람에게 넘어가요.' },
    barrel: { name: '배럴', type: 'blue', icon: '🛢️', n: 2, desc: '뱅!을 맞을 때 자동으로 한 장 뽑아 ♥면 막아요.' },
    scope: { name: '스코프', type: 'blue', icon: '🔭', n: 1, desc: '내가 다른 사람을 볼 때 거리가 -1.' },
    mustang: { name: '머스탱', type: 'blue', icon: '🐴', n: 2, desc: '다른 사람이 나를 볼 때 거리가 +1.' },
    volcanic: { name: '볼캐닉', type: 'gun', icon: '🌋', range: 1, n: 2, desc: '사거리 1. 뱅!을 횟수 제한 없이 쓸 수 있어요.' },
    schofield: { name: '스코필드', type: 'gun', icon: '🔫', range: 2, n: 3, desc: '사거리 2.' },
    remington: { name: '레밍턴', type: 'gun', icon: '🔫', range: 3, n: 1, desc: '사거리 3.' },
    carabine: { name: '카빈', type: 'gun', icon: '🔫', range: 4, n: 1, desc: '사거리 4.' },
    winchester: { name: '윈체스터', type: 'gun', icon: '🔫', range: 5, n: 1, desc: '사거리 5.' },
  },
  CHARS: {
    bart: { name: '바트 캐시디', life: 4, desc: '체력을 잃을 때마다 덱에서 카드 1장을 뽑아요.' },
    blackjack: { name: '블랙 잭', life: 4, desc: '카드를 뽑을 때 두 번째 카드를 공개해요. ♥ 또는 ♦면 1장 더 뽑아요.' },
    calamity: { name: '캘러미티 자넷', life: 4, desc: '뱅!과 빗나감!을 서로 바꿔 쓸 수 있어요.' },
    elgringo: { name: '엘 그링고', life: 3, desc: '다른 사람 때문에 체력을 잃으면 그 사람의 손패에서 카드 1장을 가져와요.' },
    jesse: { name: '제시 존스', life: 4, desc: '첫 카드를 덱 대신 다른 사람의 손패(무작위)에서 뽑을 수 있어요.' },
    jourdonnais: { name: '조던네', life: 4, desc: '배럴을 항상 가지고 있어요. (장비 배럴이 있으면 두 번 시도)' },
    kit: { name: '키트 칼슨', life: 4, desc: '카드 3장을 뽑고, 1장을 골라 덱 맨 위로 돌려놓아요.' },
    luckyduke: { name: '럭키 듀크', life: 4, desc: '뽑기 판정 때 2장을 넘겨 더 좋은 쪽을 골라요. (자동)' },
    paul: { name: '폴 리그렛', life: 3, desc: '다른 사람이 보는 거리가 +1이에요.' },
    pedro: { name: '페드로 라미레즈', life: 4, desc: '첫 카드를 버린 더미 맨 위에서 가져올 수 있어요.' },
    rose: { name: '로즈 둘런', life: 4, desc: '다른 사람을 볼 때 거리가 -1이에요.' },
    sid: { name: '시드 케첨', life: 4, desc: '카드 2장을 버리고 체력 1을 회복할 수 있어요.' },
    slab: { name: '슬랩 더 킬러', life: 4, desc: '그의 뱅!은 빗나감!을 2장 내야 막을 수 있어요.' },
    suzy: { name: '수지 라파예트', life: 4, desc: '손패가 비면 바로 1장 뽑아요.' },
    vulture: { name: '벌처 샘', life: 4, desc: '누군가 탈락하면 그 사람의 카드를 모두 가져와요.' },
    willy: { name: '윌리 더 키드', life: 4, desc: '뱅!을 횟수 제한 없이 쓸 수 있어요.' },
  },
  // icon은 화면 표시용
  ROLES: {
    sheriff: { name: '보안관', icon: '⭐', team: 'law', goal: '모든 무법자와 배신자를 제거하세요. 체력이 +1이고 모두에게 정체가 공개돼요.' },
    deputy: { name: '부보안관', icon: '🛡️', team: 'law', goal: '보안관을 지키세요. 보안관 팀이 이기면 승리해요.' },
    outlaw: { name: '무법자', icon: '💰', team: 'outlaw', goal: '보안관을 제거하세요. 무법자를 쓰러뜨리면 3장을 뽑아요.' },
    renegade: { name: '배신자', icon: '🐍', team: 'renegade', goal: '마지막 한 명으로 남아 보안관과 1:1로 이기세요. (먼저 보안관이 죽으면 안 돼요)' },
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = BANG_DATA;

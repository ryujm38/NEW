'use strict';
// 보난자 콩 정보. 서버(require)와 화면(<script>)이 같은 파일을 쓴다.
// meter: [[필요한 콩 수, 받는 코인], ...] — 수확할 때 콩이 그만큼 이상이면 해당 코인을 받는다.
// name·n·meter는 규칙(서버)이 쓰고, icon·color·face는 화면 그리기에만 쓴다.
//   face: 카드에 그리는 콩 캐릭터 { eyes, mouth, acc(머리 위/옆 소품), cheeks }

const BOHNANZA_DATA = {
  BEANS: {
    coffee: { name: '커피콩', icon: '☕', color: '#8a5a36', n: 24, meter: [[4, 1], [7, 2], [10, 3], [12, 4]], face: { eyes: 'sleepy', mouth: 'smile', acc: 'steam' } },
    wax: { name: '왁스콩', icon: '🕯️', color: '#e6c34a', n: 22, meter: [[4, 1], [7, 2], [9, 3], [11, 4]], face: { eyes: 'big', mouth: 'grin', acc: 'shine' } },
    blue: { name: '푸른콩', icon: '🫐', color: '#4a7fe0', n: 20, meter: [[4, 1], [6, 2], [8, 3], [10, 4]], face: { eyes: 'big', mouth: 'o', acc: 'drop' } },
    chili: { name: '고추콩', icon: '🌶️', color: '#e0453a', n: 18, meter: [[3, 1], [6, 2], [8, 3], [9, 4]], face: { eyes: 'angry', mouth: 'flat', acc: 'flame' } },
    stink: { name: '악취콩', icon: '🤢', color: '#9cc23e', n: 16, meter: [[3, 1], [5, 2], [7, 3], [8, 4]], face: { eyes: 'squint', mouth: 'wavy', acc: 'stink' } },
    green: { name: '녹색콩', icon: '🥒', color: '#2fae68', n: 14, meter: [[3, 1], [5, 2], [6, 3], [7, 4]], face: { eyes: 'happy', mouth: 'smile', acc: 'leaf' } },
    soy: { name: '대두', icon: '🌱', color: '#c9b45a', n: 12, meter: [[2, 1], [4, 2], [6, 3], [7, 4]], face: { eyes: 'dot', mouth: 'small', acc: 'sprout' } },
    black: { name: '검은눈콩', icon: '👁️', color: '#e8dcc0', n: 10, meter: [[2, 1], [4, 2], [5, 3], [6, 4]], face: { eyes: 'patch', mouth: 'smirk', acc: '' } },
    red: { name: '팥', icon: '🍒', color: '#b8324e', n: 8, meter: [[2, 1], [3, 2], [4, 3], [5, 4]], face: { eyes: 'happy', mouth: 'smile', acc: 'heart', cheeks: true } },
    garden: { name: '정원콩', icon: '🌻', color: '#f08a3a', n: 6, meter: [[2, 2], [3, 3]], face: { eyes: 'dot', mouth: 'grin', acc: 'flower', cheeks: true } },
  },
};

// n개의 콩을 수확하면 받는 코인 수
BOHNANZA_DATA.coinsFor = (type, n) => {
  let coins = 0;
  for (const [need, c] of BOHNANZA_DATA.BEANS[type].meter) if (n >= need) coins = c;
  return coins;
};

if (typeof module !== 'undefined' && module.exports) module.exports = BOHNANZA_DATA;

'use strict';
// 보난자 콩 정보. 서버(require)와 화면(<script>)이 같은 파일을 쓴다.
// meter: [[필요한 콩 수, 받는 코인], ...] — 수확할 때 콩이 그만큼 이상이면 해당 코인을 받는다.

const BOHNANZA_DATA = {
  BEANS: {
    coffee: { name: '커피콩', icon: '☕', color: '#7a5230', n: 24, meter: [[4, 1], [7, 2], [10, 3], [12, 4]] },
    wax: { name: '왁스콩', icon: '🕯️', color: '#d8b845', n: 22, meter: [[4, 1], [7, 2], [9, 3], [11, 4]] },
    blue: { name: '푸른콩', icon: '🫐', color: '#3b6fd0', n: 20, meter: [[4, 1], [6, 2], [8, 3], [10, 4]] },
    chili: { name: '고추콩', icon: '🌶️', color: '#d9453a', n: 18, meter: [[3, 1], [6, 2], [8, 3], [9, 4]] },
    stink: { name: '악취콩', icon: '🤢', color: '#7fae3a', n: 16, meter: [[3, 1], [5, 2], [7, 3], [8, 4]] },
    green: { name: '녹색콩', icon: '🥒', color: '#2f9e5a', n: 14, meter: [[3, 1], [5, 2], [6, 3], [7, 4]] },
    soy: { name: '대두', icon: '🌱', color: '#a8a04a', n: 12, meter: [[2, 1], [4, 2], [6, 3], [7, 4]] },
    black: { name: '검은눈콩', icon: '👁️', color: '#4a4a58', n: 10, meter: [[2, 1], [4, 2], [5, 3], [6, 4]] },
    red: { name: '팥', icon: '🍒', color: '#a8324a', n: 8, meter: [[2, 1], [3, 2], [4, 3], [5, 4]] },
    garden: { name: '정원콩', icon: '🌻', color: '#e08a3a', n: 6, meter: [[2, 2], [3, 3]] },
  },
};

// n개의 콩을 수확하면 받는 코인 수
BOHNANZA_DATA.coinsFor = (type, n) => {
  let coins = 0;
  for (const [need, c] of BOHNANZA_DATA.BEANS[type].meter) if (n >= need) coins = c;
  return coins;
};

if (typeof module !== 'undefined' && module.exports) module.exports = BOHNANZA_DATA;

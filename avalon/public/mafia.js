'use strict';
// 마피아 화면. app.js보다 먼저 불러오며, S / ui / send / esc / showToast / render 같은 app.js의 전역을 그대로 쓴다.
// 비밀(남의 역할, 남의 표, 마피아 채팅)은 서버가 걸러서 보내므로 여기엔 없다.
// 그림(역할 문장, 밤/낮 도시 풍경)은 모두 이 파일에서 SVG로 새로 그린 것이다.
//
// 같은 방에서 서로의 폰이 보이는 게임이라, 밤 화면은 역할과 상관없이 모두 똑같이 생겼다:
//   누구나 목록에서 한 명을 고르고(시민은 아무 효과 없는 "가짜 선택"), 같은 색 버튼으로 정하고, 같은 모양의 채팅 칸을 본다.
//   역할 이름은 작은 글씨로만, 역할마다 다른 색·빛은 쓰지 않는다.

const MAFIA_RULES_HTML = `
<details><summary>마피아 규칙 간단 설명</summary>
<p><b>5~12명</b> · 마피아팀(마피아) vs 시민팀(경찰, 의사, 시민). 마피아는 서로를 알고 있어요.</p>
<ul>
<li>게임은 <b>낮부터</b> 시작해요: 1일차 낮(토론·투표) → 1번째 밤 → 2일차 낮 → …</li>
<li><b>밤</b>: 마피아는 함께 한 명을 골라 죽여요. <b>의사</b>는 한 명을 지켜요(자기 자신도 가능). <b>경찰</b>은 한 명을 조사해 마피아인지 알아내요(본인만 확인).</li>
<li>마피아의 표적을 의사가 지켰다면 아무도 죽지 않아요. 마피아의 표가 갈리면 최다득표 중 무작위예요.</li>
<li>밤에는 옆 사람이 눈치채지 못하게 모든 사람의 화면이 똑같이 보여요. 시민도 아무나 한 명 골라 두세요(아무 효과 없어요).</li>
<li><b>낮</b>: 밤에 일어난 일이 공개되고 토론해요(채팅 또는 음성). 산 사람의 과반이 "토론 끝"을 누르면 투표로 넘어가요.</li>
<li><b>투표</b>: 각자 한 명(또는 기권)에게 투표해요. 혼자 가장 많은 표를 받은 사람이 <b>처형 후보</b>가 되고, 동률이면 아무도 후보가 되지 않아요.</li>
<li><b>찬반 투표</b>: 후보를 뺀 산 사람이 "처형(찬성)" 또는 "살리기(반대)"를 골라요. <b>찬성이 반대보다 많아야</b> 처형돼요(동수면 살아요). 후보 본인은 투표할 수 없어요.</li>
<li>마피아가 모두 죽으면 <b>시민팀 승리</b>. 마피아 수가 나머지 생존자 수 이상이 되면 <b>마피아팀 승리</b>.</li>
<li>죽은 사람은 말할 수 없어요. 직업을 공개할지는 방장이 대기실에서 정해요. 경찰은 기본적으로 "마피아인지 아닌지"만 알지만, 방장이 옵션을 켜면 직업까지 알아요.</li>
</ul></details>`;

const MAFIA_ROLE = {
  mafia: { name: '마피아', cls: 'mafia', icon: '🔪', team: '마피아팀' },
  police: { name: '경찰', cls: 'police', icon: '🕵️', team: '시민팀' },
  doctor: { name: '의사', cls: 'doctor', icon: '💉', team: '시민팀' },
  citizen: { name: '시민', cls: 'citizen', icon: '🙂', team: '시민팀' },
};
const MAFIA_ROLE_DESC = {
  mafia: '밤마다 동료와 함께 한 명을 골라 제거하세요. 낮에는 시민인 척 정체를 숨기세요.',
  police: '밤마다 한 명을 조사해 마피아인지 알아낼 수 있어요. 정체를 들키면 마피아의 표적이 되니 조심하세요.',
  doctor: '밤마다 한 명을 지켜요. 마피아가 그 사람을 노리면 살아나요. 자기 자신도 지킬 수 있어요.',
  citizen: '특별한 능력은 없어요. 토론과 투표로 마피아를 찾아내세요.',
};

const mfPlayer = (id) => S.players.find((p) => p.id === id);
const mfName = (id) => (mfPlayer(id) ? esc(mfPlayer(id).name) : '?');
const mfMe = () => mfPlayer(S.me);

// ---- 그림 ----

const MF_DEFS = `<svg class="mf-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<linearGradient id="mfRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b5e"/><stop offset="1" stop-color="#8e0f1c"/></linearGradient>
<linearGradient id="mfGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#e3b44e"/><stop offset="1" stop-color="#8a5c16"/></linearGradient>
<linearGradient id="mfBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f86e8"/><stop offset="1" stop-color="#132c6e"/></linearGradient>
<linearGradient id="mfGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ee0a0"/><stop offset="1" stop-color="#14794a"/></linearGradient>
<linearGradient id="mfCoat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2a35c"/><stop offset="1" stop-color="#7a4520"/></linearGradient>
<linearGradient id="mfHat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a4c"/><stop offset="1" stop-color="#121219"/></linearGradient>
<radialGradient id="mfGlowR"><stop offset="0" stop-color="#ff4a3a" stop-opacity=".55"/><stop offset="1" stop-color="#ff4a3a" stop-opacity="0"/></radialGradient>
<radialGradient id="mfGlowB"><stop offset="0" stop-color="#6fa8ff" stop-opacity=".55"/><stop offset="1" stop-color="#6fa8ff" stop-opacity="0"/></radialGradient>
<radialGradient id="mfGlowG"><stop offset="0" stop-color="#5ee0a0" stop-opacity=".5"/><stop offset="1" stop-color="#5ee0a0" stop-opacity="0"/></radialGradient>
<radialGradient id="mfGlowY"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
</defs></svg>`;

function mfStar5(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

// 역할 문장 (viewBox 120×120): 중절모와 가면 / 별 배지 / 십자와 심전도 / 모자 쓴 시민
const MF_ART = {
  mafia: `<circle cx="60" cy="60" r="56" fill="url(#mfGlowR)"/>
    <path d="M16 118Q20 84 60 80Q100 84 104 118Z" fill="#15151d"/>
    <path d="M48 81L60 104L72 81Z" fill="#efe9dc"/><path d="M56.5 86L60 101L63.5 86L60 82Z" fill="url(#mfRed)"/>
    <path d="M30 86L48 81L56 100Z M90 86L72 81L64 100Z" fill="#23232e"/>
    <ellipse cx="60" cy="62" rx="20" ry="23" fill="#2b2731"/>
    <path d="M35 60Q60 51 85 60Q84 72 73 72Q65 72 60 65Q55 72 47 72Q36 72 35 60Z" fill="url(#mfRed)"/>
    <ellipse cx="48" cy="63" rx="5.5" ry="3.2" fill="#0b0b10"/><ellipse cx="72" cy="63" rx="5.5" ry="3.2" fill="#0b0b10"/>
    <ellipse cx="60" cy="45" rx="46" ry="9.5" fill="url(#mfHat)" stroke="#4a4a5e" stroke-width="1.2"/>
    <path d="M35 45Q34 18 60 16Q86 18 85 45Z" fill="url(#mfHat)"/>
    <path d="M49 21Q60 30 71 21" stroke="#0b0b10" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M35 37Q60 43 85 37L85 45Q60 51 35 45Z" fill="url(#mfRed)"/>`,
  police: `<circle cx="60" cy="60" r="56" fill="url(#mfGlowB)"/>
    <path d="M60 8L97 21Q100 72 60 112Q20 72 23 21Z" fill="url(#mfGold)" stroke="#6a4a10" stroke-width="2" stroke-linejoin="round"/>
    <path d="M60 19L87 29Q89 68 60 100Q31 68 33 29Z" fill="url(#mfBlue)"/>
    <path d="M60 19L87 29Q89 68 60 100Q31 68 33 29Z" fill="none" stroke="#ffffff33" stroke-width="1.5"/>
    <path d="${mfStar5(60, 57, 22, 9)}" fill="url(#mfGold)" stroke="#6a4a10" stroke-width="1"/>
    <circle cx="60" cy="57" r="6" fill="#132c6e" stroke="#fff0b8" stroke-width="1.5"/>
    <path d="M44 88Q60 94 76 88" stroke="#fff0b8" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`,
  doctor: `<circle cx="60" cy="58" r="56" fill="url(#mfGlowG)"/>
    <circle cx="60" cy="54" r="40" fill="#f4fbf7" stroke="url(#mfGreen)" stroke-width="5"/>
    <path d="M50 26h20v18h18v20H70v18H50V64H32V44h18z" fill="url(#mfGreen)"/>
    <path d="M50 26h20v18h18v20H70v18H50V64H32V44h18z" fill="none" stroke="#ffffff66" stroke-width="1.2"/>
    <path d="M6 104h30l6-12 8 22 9-34 7 24h48" stroke="#5ef0a8" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  citizen: `<circle cx="60" cy="60" r="56" fill="url(#mfGlowY)"/>
    <path d="M22 116Q24 78 60 74Q96 78 98 116Z" fill="url(#mfCoat)"/>
    <path d="M42 76Q60 88 78 76L80 86Q60 98 40 86Z" fill="#c8453a"/>
    <path d="M70 84l6 20-8-2z" fill="#a8362d"/>
    <circle cx="60" cy="54" r="18" fill="#efcba4"/>
    <circle cx="53" cy="56" r="2" fill="#3a2a20"/><circle cx="67" cy="56" r="2" fill="#3a2a20"/>
    <path d="M53 63Q60 68 67 63" stroke="#8a4a30" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M40 48Q40 30 60 30Q80 30 80 46Q60 40 40 48Z" fill="#6e4a2c"/>
    <path d="M38 48Q60 39 86 47L86 52Q62 45 38 52Z" fill="#53361f"/>`,
};
const mfArt = (role) => `<svg viewBox="0 0 120 120" class="mf-art" aria-hidden="true">${MF_ART[role] || ''}</svg>`;

// 도시 풍경: 같은 그림을 밤(달, 별, 불 켜진 창)과 낮(해, 노을)으로 색만 바꿔 쓴다
const MF_SCENE = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const layer = (base, minH, maxH, cls, win) => {
    let x = -4;
    let d = '';
    let w = '';
    while (x < 364) {
      const bw = 18 + Math.round(rnd() * 26);
      const bh = minH + Math.round(rnd() * (maxH - minH));
      const top = base - bh;
      d += `M${x} ${base}V${top}${rnd() > 0.7 ? `h${Math.round(bw / 2) - 2}v-6h4v6` : ''}H${x + bw}V${base}Z`;
      if (win) {
        for (let wy = top + 6; wy < base - 6; wy += 9) {
          for (let wx = x + 4; wx < x + bw - 5; wx += 7) if (rnd() > 0.62) w += `M${wx} ${wy}h3v4h-3z`;
        }
      }
      x += bw + (rnd() > 0.6 ? 2 : 0);
    }
    return `<path class="${cls}" d="${d}"/>${win ? `<path class="mf-win" d="${w}"/>` : ''}`;
  };
  const stars = Array.from({ length: 26 }, () => `<circle cx="${Math.round(rnd() * 360)}" cy="${Math.round(rnd() * 60)}" r="${(0.6 + rnd() * 0.9).toFixed(1)}"/>`).join('');
  return `<svg viewBox="0 0 360 110" preserveAspectRatio="xMidYMax slice" class="mf-scene" aria-hidden="true">
    <g class="mf-stars">${stars}</g>
    <g class="mf-moon"><circle cx="300" cy="34" r="30" class="glow"/><circle cx="300" cy="34" r="17" class="disc"/><circle cx="294" cy="30" r="3.5" class="crater"/><circle cx="305" cy="40" r="2.5" class="crater"/><circle cx="303" cy="27" r="1.6" class="crater"/></g>
    <g class="mf-sun"><circle cx="292" cy="46" r="40" class="glow"/><circle cx="292" cy="46" r="20" class="disc"/></g>
    ${layer(110, 30, 66, 'mf-far', false)}
    ${layer(110, 14, 46, 'mf-near', true)}
  </svg>`;
})();

// 화면이 다시 그려져도 등장 효과가 처음부터 되풀이되지 않게, 처음 본 시각부터 남은 만큼만 이어서 움직인다
const mfSeenAt = {};
function mfAnim(key, ms) {
  const now = Date.now();
  if (!mfSeenAt[key]) mfSeenAt[key] = now;
  const gone = now - mfSeenAt[key];
  return gone < ms ? { cls: ' mf-anim', st: ` style="--ad:-${gone}ms"` } : { cls: '', st: '' };
}

function mfHue(id) {
  let h = 11;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// ---- 밤: 모든 역할이 똑같이 "한 명 고르기"를 한다 ----

// 시민(밤에 할 일 없는 사람)의 가짜 선택. 서버에는 보내지 않고 이 폰에만 기억한다(새로고침해도 같은 화면이 되게 sessionStorage에도).
const mfDecoy = (() => { try { return JSON.parse(sessionStorage.getItem('mfDecoy')) || {}; } catch { return {}; } })();
function mfDecoySave() { try { sessionStorage.setItem('mfDecoy', JSON.stringify(mfDecoy)); } catch { /* 저장 못 해도 괜찮다 */ } }
const mfNightKey = () => `${S.code}:${S.gameNo}:${S.day}`;

// 지금 밤에 내가 고르는 상태: { real, kind, options, done, pick } (밤이 아니거나 죽었으면 null)
function mfNight(me) {
  if (S.phase !== 'night' || !me || !me.alive) return null;
  const na = S.nightAction;
  if (na) return { real: true, kind: na.kind, options: na.options, done: na.done, pick: na.myPick };
  const pick = mfDecoy[mfNightKey()] || null;
  return { real: false, kind: 'citizen', options: S.players.filter((p) => p.alive && p.id !== S.me).map((p) => p.id), done: !!pick, pick };
}

// ---- 대기실 옵션 ----

function mafiaLobbyOptions(isHost) {
  const opt = (key, label, hint) => `<label class="opt ${isHost ? '' : 'ro'}">
    <input type="checkbox" data-act="mafiaOpt" data-key="${key}" ${S.settings[key] ? 'checked' : ''} ${isHost ? '' : 'disabled'} />
    <span>${label}<small class="dim" style="display:block;font-size:12px">${hint}</small></span>
  </label>`;
  return `${opt('revealRoles', '죽은 사람의 직업 공개', '꺼 두면 게임이 끝날 때까지 정체를 알 수 없어요')}
    ${opt('policeReveal', '경찰에게 직업까지 알려주기', '꺼 두면 경찰은 "마피아인지 아닌지"만 알아요 (기본)')}
    ${isHost ? '' : '<p class="small dim" style="margin:0 0 6px">옵션은 방장이 정해요.</p>'}`;
}

// ---- 조각들 ----

// 역할 꼬리표. 살아 있는 사람의 역할(나 자신, 마피아 동료)은 비밀이라 역할과 상관없이 같은 무채색으로 그린다.
// 죽은 사람(공개 설정)과 게임 끝의 역할은 모두에게 공개된 정보라 역할 색을 쓴다.
function mfRoleTag(p) {
  if (!p.role) return '';
  const r = MAFIA_ROLE[p.role];
  const open = S.phase === 'over' || !p.alive;
  return `<span class="mf-rtag ${open ? r.cls : 'plain'}">${mfArt(p.role)}${r.name}</span>`;
}

// 역할 카드: 누아르 영화 사진처럼 모든 역할이 같은 흑백 톤. "알고 있는 정보" 칸도 늘 같은 모양으로 둔다.
function mfRoleCard(an = { cls: '', st: '' }) {
  const me = mfMe();
  if (!me || !me.role) return '';
  const r = MAFIA_ROLE[me.role];
  let known;
  if (me.role === 'mafia') {
    const mates = S.players.filter((p) => p.role === 'mafia' && p.id !== S.me).map((p) => `<span class="mf-mate ${p.alive ? '' : 'dead'}">${esc(p.name)}${p.alive ? '' : ' 💀'}</span>`);
    known = `<div class="t">동료 마피아</div>${mates.length ? mates.join('') : '<span class="mf-none">없음 (혼자예요)</span>'}`;
  } else {
    const n = me.role === 'police' && S.policeLog ? S.policeLog.length : 0;
    known = `<div class="t">알고 있는 정보</div><span class="mf-none">${me.role === 'police' ? (n ? `조사 결과 ${n}건 · 아래 수사 수첩` : '아직 없어요 · 밤마다 조사 결과가 쌓여요') : '없어요 · 토론과 투표로 추리해요'}</span>`;
  }
  return `<div class="mf-card${an.cls}"${an.st}><div class="mf-card-in">
      <div class="mf-card-top"><span>기밀</span><span>내 역할</span></div>
      <div class="mf-card-art">${mfArt(me.role)}</div>
      <div class="mf-card-name">${r.name}</div>
      <div class="mf-card-team">${r.team}</div>
      <div class="mf-card-desc">${esc(MAFIA_ROLE_DESC[me.role])}</div>
      <div class="mf-mates">${known}</div>
    </div></div>`;
}

// 경찰 수사 수첩: 눈에 띄지 않게 "내 역할" 시트 안에만 둔다
function mfPoliceLog() {
  if (!S.policeLog || !S.policeLog.length) return '';
  const result = (l) => (l.role
    ? `${MAFIA_ROLE[l.role].icon} ${MAFIA_ROLE[l.role].name}`
    : l.mafia ? '마피아!' : '마피아 아님');
  return `<div class="mf-note"><div class="mf-note-h">🕵️ 수사 수첩 <small>나만 보여요</small></div>${S.policeLog.map((l) => `<div class="mf-note-r"><span>${l.day}번째 밤 · <b>${mfName(l.target)}</b></span><span class="mf-stampx ${l.mafia ? 'bad' : 'ok'}">${result(l)}</span></div>`).join('')}</div>`;
}

function mfChatHtml(me) {
  const night = S.phase === 'night';
  // 밤에는 마피아 채팅만, 낮/투표에는 전체 채팅만 보여준다 (끝나면 모두)
  const show = night ? (c) => c.ch === 'mafia' : S.phase === 'over' ? () => true : (c) => c.ch === 'all';
  let prev = null;
  const lines = S.chat.filter(show).map((c) => {
    const mine = c.id === S.me;
    const same = prev && prev.id === c.id && prev.ch === c.ch;
    prev = c;
    return `<div class="cl ${mine ? 'mine' : ''} ${same ? 'cont' : ''}">${same || mine ? '' : `<b style="--h:${mfHue(c.id)}">${esc(c.name)}</b>`}<span>${esc(c.text)}</span></div>`;
  }).join('');
  // 밤에는 살아 있는 사람 모두에게 같은 모양의 입력칸을 보여 준다 (마피아가 아니면 보내도 서버가 거절해요)
  const canType = S.canChat || (night && me && me.alive);
  const label = night ? '🌙 밤 채팅' : S.canChat === 'all' ? '💬 토론 채팅' : '💬 채팅 (읽기 전용)';
  const empty = night ? '밤에는 마피아끼리만 대화할 수 있어요.' : S.canChat ? '아직 대화가 없어요. 첫 마디를 남겨 보세요.' : '아직 대화가 없어요.';
  const ph = night ? '밤 채팅 (마피아만 보내져요)' : '메시지 입력';
  return `<div class="mf-chat"><div class="mf-chat-h">${label}</div>
    <div class="mchat" id="mchat">${lines || `<div class="mf-empty">${empty}</div>`}</div>
    ${canType ? `<div class="mrow"><input type="text" id="mtext" maxlength="80" autocomplete="off" placeholder="${ph}" value="${esc(ui.mText || '')}" /><button class="sm primary" data-act="mafiaSend">보내기</button></div>` : ''}
  </div>`;
}

// 단계가 바뀌었다는 알림(☀️/🌙/🗳)을 뺀, 실제로 일어난 일 두 줄. 누르면 전체 일지
function mfTicker() {
  const ev = S.log.filter((l) => !/^(☀️|🌙|🗳|게임 시작)/.test(l.text));
  if (!ev.length) return '';
  const lines = ev.slice(-2).reverse();
  return `<button class="mf-ticker" data-act="mafiaLog"><span class="h">📰</span><span class="l">${lines.map((l, i) => `<span class="${i ? 'old' : 'new'}">${esc(l.text)}</span>`).join('')}</span><i>전체 ›</i></button>`;
}

function mfLogSheet() {
  const lines = S.log.slice().reverse().map((l) => `<div class="mf-log-r"><small>${l.day}일차</small><span>${esc(l.text)}</span></div>`).join('');
  return `<div class="overlay" data-act="closeall"><div class="sheet"><h2>📰 사건 일지</h2><div class="mf-log">${lines || '<p class="dim center">아직 기록이 없어요.</p>'}</div><button data-act="closeall">닫기</button></div></div>`;
}

// 위쪽 풍경 띠: 지금이 밤인지 낮인지, 며칠째인지, 몇 명이 살아 있는지
function mfHero() {
  const phase = S.phase;
  let t = '';
  let sub = '';
  if (phase === 'night') {
    t = `🌙 ${S.day}번째 밤`;
    sub = '모두 조용히 한 명씩 골라요';
  } else if (phase === 'day') {
    t = `☀️ ${S.day}일차 낮`;
    sub = '모두 모여 토론하는 시간이에요';
  } else if (phase === 'vote') {
    t = `🗳 ${S.day}일차 투표`;
    sub = '처형 후보를 한 명 뽑아요';
  } else if (phase === 'trial') {
    t = `⚖️ ${S.day}일차 찬반 투표`;
    sub = `${mfName(S.accusedId)}님의 운명은?`;
  } else if (phase === 'voteResult') {
    t = `⚖️ ${S.day}일차 투표 결과`;
    sub = '확인하면 밤이 와요';
  } else if (phase === 'over') {
    t = S.winner === 'citizen' ? '🌅 시민팀 승리' : '🩸 마피아팀 승리';
    sub = S.winner === 'citizen' ? '도시에 다시 아침이 찾아왔어요' : '도시는 마피아의 손에 넘어갔어요';
  }
  return `<div class="mf-hero">${MF_SCENE}<div class="mf-hero-t"><b>${t}</b><small>${sub}</small></div>
    <div class="mf-alive"><b>${S.aliveCount}</b><small>/${S.players.length}명<br>생존</small></div></div>`;
}

// 사람 한 칸: 이름, (비밀이면 무채색) 역할 꼬리표, 지금 단계의 상태, 오른쪽에 받은 표 수
function mfRow(p, pickable, team, night) {
  const phase = S.phase;
  const sel = ui.mSel;
  const lv = S.lastVote;
  const cls = ['mp'];
  if (!p.alive) cls.push('dead');
  if (p.id === S.me) cls.push('me');
  // 밤에 고르는 중이면 살아 있는 모든 칸을 같은 모양으로 (동료·나 자신처럼 못 고르는 칸도). 역할마다 고를 수 있는 칸 수가 달라 보이지 않게
  if (pickable.has(p.id) || (night && p.alive)) cls.push('pick');
  if (sel === p.id) cls.push('sel');
  const accused = (phase === 'trial' && p.id === S.accusedId) || (phase === 'voteResult' && lv && lv.accused === p.id);
  if (accused) cls.push('accused');
  let st = '';
  if (!p.alive) {
    st = S.lastNight && S.lastNight.victim === p.id && phase === 'day' ? '☠️ 간밤에 살해됨' : lv && lv.executed === p.id && phase === 'voteResult' ? '⚖️ 처형됨' : '사망';
  } else if (phase === 'roles') {
    st = p.acked ? '✓ 확인' : '확인 중…';
  } else if (phase === 'day') {
    st = p.ready ? '✋ 토론 끝' : '토론 중';
  } else if (phase === 'vote') {
    st = p.voted ? '🗳 투표함' : '투표 전';
  } else if (phase === 'trial') {
    st = p.id === S.accusedId ? '⚖️ 처형 후보' : p.voted ? '🗳 투표함' : '투표 전';
  } else if (phase === 'voteResult' && lv) {
    if (lv.trial && lv.trial.votes[p.id] !== undefined) st = lv.trial.votes[p.id] ? '☠️ 처형 찬성' : '🙏 살리기';
    else if (p.id in lv.votes) st = lv.votes[p.id] ? `→ ${mfName(lv.votes[p.id])}` : '기권';
    if (accused) st = '⚖️ 처형 후보';
  } else if (phase === 'night' && team) {
    // 마피아 동료가 고른 표적: 작고 무채색인 글씨로만
    const by = team.filter((t) => t.target === p.id).map((t) => mfName(t.voter));
    if (by.length) st = `🎯 ${by.join(', ')}`;
  }
  const n = (phase === 'trial' || phase === 'voteResult') && lv ? lv.counts[p.id] : 0;
  const ava = `<span class="mf-ava" style="--h:${mfHue(p.id)}">${p.alive ? esc(Array.from(p.name)[0] || '?') : '💀'}<i class="dot ${p.connected ? '' : 'off'}"></i></span>`;
  const body = `${ava}<span class="mf-pn"><b>${esc(p.name)}${p.id === S.me ? ' <small>(나)</small>' : ''}</b><span class="mf-st">${mfRoleTag(p)}${st ? `<span>${st}</span>` : ''}</span></span>
    ${n ? `<span class="mf-cnt">${n}<small>표</small></span>` : ''}${sel === p.id ? '<span class="mf-check">✓</span>' : ''}`;
  return pickable.has(p.id)
    ? `<button class="${cls.join(' ')}" data-act="mafiaPick" data-id="${p.id}">${body}</button>`
    : `<div class="${cls.join(' ')}">${body}</div>`;
}

function renderMafia() {
  const me = mfMe();
  const isHost = S.hostId === S.me;
  const phase = S.phase;
  const over = phase === 'over';
  const nt = mfNight(me);

  // 고를 수 있는 사람
  let pickable = new Set();
  if (nt && !nt.done) pickable = new Set(nt.options);
  if (phase === 'vote' && me && me.alive && !S.myVote) {
    pickable = new Set(S.players.filter((p) => p.alive && p.id !== S.me).map((p) => p.id));
  }
  const team = phase === 'night' && S.nightAction ? S.nightAction.team : null;
  const rows = `<div class="mplayers">${S.players.map((p) => mfRow(p, pickable, team, !!(nt && !nt.done))).join('')}</div>`;

  const title = { roles: '역할 확인', night: `🌙 ${S.day}번째 밤`, day: `☀️ ${S.day}일차 낮`, vote: `🗳 ${S.day}일차 투표`, trial: `⚖️ ${S.day}일차 찬반`, voteResult: `${S.day}일차 투표 결과`, over: '게임 끝' }[phase];
  const tone = phase === 'night' || phase === 'roles' ? 'night' : over ? `end-${S.winner}` : phase === 'day' ? 'day' : 'dusk';
  const showChat = phase === 'day' || phase === 'vote' || phase === 'trial' || phase === 'night' || (over && S.chat.length);
  const chat = showChat ? mfChatHtml(me) : '';
  // 낮 토론과 찬반 투표(변론)에는 채팅을 먼저, 고르는 단계에는 사람 목록을 먼저
  const chatFirst = phase === 'day' || phase === 'trial';
  const dock = mfDockButtons(me, nt, isHost);

  return `<div class="mf mf-${phase} tone-${tone}">${MF_DEFS}
  <div class="top"><span>${roomTag()}</span><span class="mf-round">${title}</span></div>
  ${phase === 'roles' ? '' : mfHero()}
  ${phase === 'roles' ? '' : mfTicker()}
  ${mfPanel(me, isHost, nt)}
  ${chatFirst ? chat + rows : rows + chat}
  <div class="bdock mf-dock">
    ${dock ? `<div class="mf-act">${dock}</div>` : ''}
    <div class="foot">
      <button data-act="mafiaInfo">🎭 내 역할</button>
      <button data-act="mafiaLog">📰 일지</button>
      ${isHost ? '<button data-act="hostmenu">⚙ 방장</button>' : ''}
    </div>
  </div>
  ${ui.mInfo === 'log' ? mfLogSheet() : ui.mInfo ? `<div class="overlay" data-act="closeall"><div class="sheet">${mfRoleCard()}${mfPoliceLog()}<button data-act="closeall">닫기</button></div></div>` : ''}
  ${ui.hostOpen && isHost ? mfHostMenuHtml() : ''}
  </div>`;
}

// 주요 행동 버튼은 화면 아래에 붙여 둔다 (사람 목록이 길어도 바로 누를 수 있게)
function mfDockButtons(me, nt, isHost) {
  const phase = S.phase;
  const sel = ui.mSel;
  if (phase === 'over') {
    return isHost
      ? '<button class="primary" data-act="restart">같은 멤버로 바로 다시 하기</button><button class="ghost sm mf-force" data-act="again">대기실로 돌아가기</button>'
      : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>';
  }
  if (phase === 'roles') {
    if (me && me.acked) {
      const acked = S.players.filter((p) => p.acked).length;
      return `<p class="progress">다른 사람을 기다리는 중 (${acked}/${S.players.filter((p) => p.connected).length})</p>${isHost ? '<button class="ghost sm mf-force" data-act="force">기다리지 않고 시작</button>' : ''}`;
    }
    return '<button class="primary" data-act="ack">확인했어요</button>';
  }
  if (!me || !me.alive) return '';
  if (nt) {
    // 역할과 상관없이 같은 색, 같은 글자 수의 버튼
    if (nt.done) return '<button disabled>✓ 선택 완료 · 아침을 기다려요</button>';
    return sel
      ? `<button class="primary" data-act="${nt.real ? 'mafiaConfirm' : 'mafiaDecoyOk'}">🌙 ${mfName(sel)}님 선택하기</button>`
      : '<button disabled>목록에서 한 명을 고르세요</button>';
  }
  if (phase === 'day') {
    return me.ready
      ? `<button disabled>✋ 토론 끝을 눌렀어요 (${S.readyCount}/${Math.floor(S.aliveCount / 2) + 1})</button>`
      : '<button class="primary" data-act="ready">✋ 토론 끝 (투표하러 가기)</button>';
  }
  if (phase === 'vote' && !S.myVote) {
    return `<div class="row">${sel
      ? `<button class="no" data-act="mafiaVote">🗳 ${mfName(sel)}님에게 투표</button>`
      : '<button disabled>목록에서 한 명을 고르세요</button>'}<button class="ghost mf-abstain" data-act="mafiaAbstain">기권</button></div>`;
  }
  if (phase === 'trial' && S.accusedId !== S.me && !S.myJudge) {
    return '<div class="row"><button class="no" data-act="mafiaJudge" data-kill="1">☠️ 처형 찬성</button><button class="yes" data-act="mafiaJudge" data-kill="0">🙏 살리기</button></div>';
  }
  if (phase === 'voteResult') {
    if (!me.acked) return '<button class="primary" data-act="ack">확인</button>';
    const acked = S.players.filter((p) => p.acked).length;
    return `<p class="progress">다른 사람을 기다리는 중 (${acked}/${S.players.filter((p) => p.alive && p.connected).length})</p>`;
  }
  return '';
}

function mfPanel(me, isHost, nt) {
  const phase = S.phase;
  const alive = me && me.alive;
  const progress = (n, total, what) => `<div class="mf-prog"><span>${what}</span><i><b style="width:${total ? Math.min(100, Math.round((n / total) * 100)) : 0}%"></b></i><span>${n}/${total}</span></div>`;
  const forceBtn = (label) => (isHost ? `<button class="ghost sm mf-force" data-act="force">${label}</button>` : '');

  if (phase === 'roles') {
    const total = S.players.length;
    const mafiaN = Math.max(1, Math.floor(total / 3));
    const chip = (k, n) => `<span class="mf-rtag ${k}">${mfArt(k)}${MAFIA_ROLE[k].name} ${n}</span>`;
    return `<div class="mf-panel"><div class="mf-ph">당신의 역할</div>${mfRoleCard(mfAnim(`role${S.gameNo}`, 800))}
      <div class="mf-comp"><div class="dim small">이번 판 ${total}명</div>${chip('mafia', mafiaN)}${chip('police', 1)}${chip('doctor', 1)}${chip('citizen', total - mafiaN - 2)}</div>
    </div>`;
  }

  if (phase === 'night') {
    if (!alive) return `<div class="mf-panel center"><p class="mf-big">🌙 밤이에요</p><p class="dim small">당신은 죽었어요. 조용히 지켜보세요.</p>${forceBtn('기다리지 않고 아침으로')}</div>`;
    // 모든 역할이 같은 모양: 제목 한 줄 + 안내 + 작은 역할 한 줄
    if (!nt.done) {
      const line = {
        mafia: '🔪 마피아: 제거할 사람을 골라요. 동료 선택도 보여요.',
        doctor: '💉 의사: 지킬 사람을 골라요. 나 자신도 돼요.',
        police: '🕵️ 경찰: 조사할 사람을 골라요. 결과는 나만 봐요.',
        citizen: '🙂 시민: 아무나 골라 두세요. 아무 효과 없어요.',
      }[nt.kind];
      return `<div class="mf-panel night"><div class="mf-ph">한 명을 고르세요</div>
        <p class="center">목록에서 한 명을 누르고 맨 아래에서 정해요.</p>
        <p class="mf-role-line">${line}</p>${forceBtn('기다리지 않고 아침으로')}</div>`;
    }
    let line = {
      mafia: '🔪 동료가 다 고르면 표적이 정해져요.',
      doctor: '💉 마피아가 이 사람을 노리면 살아나요.',
      citizen: '🙂 시민의 선택은 효과가 없어요.',
    }[nt.kind];
    if (nt.kind === 'police') {
      const l = (S.policeLog || []).filter((x) => x.day === S.day).pop();
      const is = { mafia: '마피아예요!', police: '경찰이에요.', doctor: '의사예요.', citizen: '시민이에요.' };
      line = l ? `🕵️ 조사 결과: ${mfName(l.target)}님은 ${l.role ? is[l.role] : l.mafia ? '마피아예요!' : '마피아가 아니에요.'}` : '🕵️ 조사 결과는 나만 봐요.';
    }
    return `<div class="mf-panel night"><div class="mf-ph">선택 완료</div>
      <p class="mf-big gold">${mfName(nt.pick)}님을 골랐어요</p>
      <p class="mf-role-line">${line}</p>${forceBtn('기다리지 않고 아침으로')}</div>`;
  }

  if (phase === 'day') {
    const ln = S.lastNight;
    let news = S.day === 1 && !ln
      ? { cls: '', h: '첫 번째 낮이 밝았어요', p: '아직 아무 일도 없었어요. 서로 이야기해 보세요.' }
      : { cls: 'calm', h: '조용한 밤이었어요', p: '밤사이 아무도 죽지 않았어요.' };
    if (ln && ln.victim) news = { cls: 'kill', h: `${mfName(ln.victim)}님이 살해당했어요`, p: '밤사이 마피아의 습격이 있었어요.' };
    else if (ln && ln.saved) news = { cls: 'save', h: '의사가 사람을 살렸어요!', p: `마피아가 <b>${mfName(ln.attacked)}</b>님을 공격했지만 의사가 지켜 냈어요.` };
    const need = Math.floor(S.aliveCount / 2) + 1;
    return `<div class="mf-panel"><div class="mf-news ${news.cls}"><small>☀️ ${S.day}일차 아침 소식</small><b>${news.h}</b><p>${news.p}</p></div>
      ${progress(S.readyCount, need, '✋ 토론 끝')}
      <p class="small dim center">산 사람 ${S.aliveCount}명 중 <b>${need}명</b>이 누르면 투표가 시작돼요.</p>
      ${forceBtn('지금 투표 시작')}</div>`;
  }

  if (phase === 'vote') {
    const votedN = S.players.filter((p) => p.voted).length;
    const prog = progress(votedN, S.aliveCount, '투표');
    if (!alive) return `<div class="mf-panel"><div class="mf-ph">처형 후보 투표</div><p class="dim center">당신은 죽어서 투표할 수 없어요.</p>${prog}${forceBtn('기다리지 않고 개표')}</div>`;
    if (S.myVote) {
      const t = S.myVote.target;
      return `<div class="mf-panel"><div class="mf-ph">처형 후보 투표</div><p class="mf-big gold">${t ? `${mfName(t)}님에게 투표했어요` : '기권했어요'}</p>
        ${prog}${forceBtn('기다리지 않고 개표')}</div>`;
    }
    return `<div class="mf-panel"><div class="mf-ph">처형 후보 투표</div>
      <p class="center">목록에서 한 명을 누르고 맨 아래에서 투표해요.</p>
      <p class="small dim center">혼자 가장 많은 표를 받으면 처형 후보예요(동률이면 없음).</p>${prog}${forceBtn('기다리지 않고 개표')}</div>`;
  }

  if (phase === 'trial') {
    const lv = S.lastVote;
    const judgedN = S.players.filter((p) => p.voted).length;
    const tally = lv ? Object.values(lv.counts).reduce((a, b) => a + b, 0) : 0;
    const acc = mfPlayer(S.accusedId);
    const head = `<div class="mf-accused"><span class="mf-ava xl" style="--h:${mfHue(S.accusedId)}">${acc ? esc(Array.from(acc.name)[0] || '?') : '?'}</span>
      <div><small>처형 후보</small><b>${mfName(S.accusedId)}</b><span>${lv ? `${lv.counts[S.accusedId]}표 / 총 ${tally}표` : ''}</span></div></div>`;
    const wait = `${progress(judgedN, S.judgeCount, '찬반 투표')}<p class="small dim center">찬성이 반대보다 많아야 처형돼요. 동수면 살아요.</p>${forceBtn('기다리지 않고 개표')}`;
    let say = '<p class="center">변론을 듣고 맨 아래에서 골라요.</p>';
    if (S.me === S.accusedId) say = '<p class="center mf-gold">당신이 처형 후보예요. 채팅으로 변론하세요!</p>';
    else if (!alive) say = '<p class="dim center">당신은 죽어서 투표할 수 없어요.</p>';
    else if (S.myJudge) say = `<p class="mf-big gold">${S.myJudge.kill ? '☠️ 처형(찬성)에 투표했어요' : '🙏 살리기(반대)에 투표했어요'}</p>`;
    return `<div class="mf-panel trial">${head}${say}${wait}</div>`;
  }

  if (phase === 'voteResult') {
    const lv = S.lastVote;
    let bars = '';
    if (lv) {
      const total = Object.keys(lv.votes).length || 1;
      const abstain = Object.values(lv.votes).filter((t) => t === null).length;
      const entries = Object.entries(lv.counts).sort((a, b) => b[1] - a[1]);
      bars = entries.map(([id, n]) => `<div class="mf-bar ${id === lv.accused ? 'top' : ''}"><span class="nm">${mfName(id)}</span><i><b style="width:${Math.round((n / total) * 100)}%"></b></i><span class="n">${n}표</span></div>`).join('')
        + (abstain ? `<div class="mf-bar ab"><span class="nm">기권</span><i><b style="width:${Math.round((abstain / total) * 100)}%"></b></i><span class="n">${abstain}표</span></div>` : '');
    }
    const who = lv ? Object.entries(lv.votes).map(([voter, t]) => `<span>${mfName(voter)} → ${t ? mfName(t) : '<i class="dim">기권</i>'}</span>`).join('') : '';
    const verdict = lv && lv.executed ? `${mfName(lv.executed)}님이 처형됐어요` : lv && lv.accused ? `${mfName(lv.accused)}님은 살아남았어요` : '아무도 처형 후보가 되지 않았어요';
    const ex = lv && lv.executed ? mfPlayer(lv.executed) : null;
    const barsAn = mfAnim(`vr${S.gameNo}-${S.day}`, 700);
    return `<div class="mf-panel"><div class="mf-ph">투표 결과</div>
      <p class="mf-big ${lv && lv.executed ? 'bad' : 'gold'}">${verdict}</p>
      ${ex && ex.role ? `<p class="center">${mfRoleTag(ex)}</p>` : ''}
      ${lv && lv.trial ? `<div class="mf-split"><span class="k" style="flex:${lv.trial.kill || 0.001}">☠️ 찬성 ${lv.trial.kill}</span><span class="s" style="flex:${lv.trial.spare || 0.001}">🙏 반대 ${lv.trial.spare}</span></div>` : ''}
      <div class="mf-bars${barsAn.cls}"${barsAn.st}><div class="small dim">1차 투표</div>${bars || '<p class="dim small">표가 없어요.</p>'}</div>
      <details class="mf-who"><summary>누가 누구에게 투표했나 (1차)</summary><div>${who}</div></details>
      ${forceBtn('기다리지 않고 넘어가기')}</div>`;
  }

  if (phase === 'over') {
    const win = S.winner === 'citizen';
    const team = (pred) => S.players.filter(pred).map((p) => `<span class="mf-endp ${p.alive ? '' : 'dead'}">${p.role ? mfArt(p.role) : ''}${esc(p.name)}</span>`).join('');
    return `<div class="mf-panel end ${win ? 'citizen' : 'mafia'}">
      <div class="mf-end-art">${mfArt(win ? 'police' : 'mafia')}</div>
      <p class="mf-big xl ${win ? 'ok' : 'bad'}">${win ? '시민팀 승리!' : '마피아팀 승리!'}</p>
      <div class="mf-endteams"><div><small>🔪 마피아팀</small>${team((p) => p.role === 'mafia')}</div><div><small>🏙 시민팀</small>${team((p) => p.role && p.role !== 'mafia')}</div></div></div>`;
  }
  return '';
}

function mfHostMenuHtml() {
  const playing = S.phase !== 'over' && S.phase !== 'lobby';
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    <h2>방장 메뉴</h2>
    <p class="dim small">누르면 모든 사람의 진행 상황이 바로 바뀌어요.</p>
    ${playing ? '<button data-act="force" data-confirm="멈춘 곳을 기본값으로 넘길까요? (밤: 행동 안 한 사람은 건너뜀, 투표: 기권 처리)">멈춘 곳 넘기기</button>' : ''}
    <button class="primary" data-act="restart" data-confirm="같은 멤버로 역할을 새로 나눠 다시 시작할까요?">처음부터 다시 시작 (역할 새로 배정)</button>
    <button data-act="again" data-confirm="게임을 초기화하고 모두 대기실로 돌아갈까요?">초기화하고 대기실로</button>
    <button class="ghost" data-act="closeall">닫기</button>
  </div></div>`;
}

// ---- 동작 ----

function mafiaSync() {
  if (S.kind !== 'mafia') {
    ui.mSel = null;
    ui.mInfo = false;
    return;
  }
  const me = mfMe();
  const nt = mfNight(me);
  const canNight = nt && !nt.done && nt.options.includes(ui.mSel);
  const canVote = S.phase === 'vote' && me && me.alive && !S.myVote && ui.mSel !== S.me && mfPlayer(ui.mSel) && mfPlayer(ui.mSel).alive;
  if (!canNight && !canVote) ui.mSel = null;
}

function mafiaAfterRender() {
  const el = document.getElementById('mchat');
  if (el) el.scrollTop = el.scrollHeight;
}

function mafiaSendChat() {
  const text = (ui.mText || '').trim();
  if (!text) return;
  send({ t: 'chat', text });
  ui.mText = '';
  const input = document.getElementById('mtext');
  if (input) input.value = '';
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'mtext') ui.mText = e.target.value;
});
document.addEventListener('keydown', (e) => {
  if (e.target && e.target.id === 'mtext' && e.key === 'Enter') {
    e.preventDefault();
    mafiaSendChat();
  }
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.dataset && e.target.dataset.act === 'mafiaOpt') {
    send({ t: 'setting', key: e.target.dataset.key, value: e.target.checked });
  }
});

function mafiaClick(act, el) {
  switch (act) {
    case 'mafiaPick':
      ui.mSel = ui.mSel === el.dataset.id ? null : el.dataset.id;
      render();
      return true;
    case 'mafiaConfirm':
      send({ t: 'night', target: ui.mSel });
      ui.mSel = null;
      return true;
    case 'mafiaDecoyOk': // 시민의 가짜 선택: 서버에 보내지 않고 화면만 "선택 완료"로
      if (S && S.phase === 'night' && ui.mSel) { mfDecoy[mfNightKey()] = ui.mSel; mfDecoySave(); }
      ui.mSel = null;
      render();
      return true;
    case 'mafiaVote':
      send({ t: 'vote', target: ui.mSel });
      ui.mSel = null;
      return true;
    case 'mafiaAbstain':
      if (window.confirm('기권할까요?')) send({ t: 'vote', target: null });
      ui.mSel = null;
      return true;
    case 'mafiaJudge':
      send({ t: 'judge', kill: el.dataset.kill === '1' });
      return true;
    case 'ready': send({ t: 'ready' }); return true;
    case 'mafiaSend': mafiaSendChat(); return true;
    case 'mafiaInfo': ui.mInfo = true; render(); return true;
    case 'mafiaLog': ui.mInfo = 'log'; render(); return true;
    case 'mafiaOpt': return true; // 체크박스는 change 이벤트로 처리
    default: return false;
  }
}

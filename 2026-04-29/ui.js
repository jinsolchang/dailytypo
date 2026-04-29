// =========================================================
// UI / DOM 헬퍼 — 캐릭터 상태, 말풍선, 로그, 모달 렌더
// =========================================================

// ----- DOM 맵 -----
const $ = (id) => document.getElementById(id);

export const ui = {
  topic: $('topicInput'),
  start: $('startBtn'),
  reset: $('resetBtn'),
  surrender: $('surrenderBtn'),
  round: $('roundCount'),
  phase: $('phaseLabel'),
  timeline: $('timeline'),
  emptyState: $('emptyState'),
  statusDot: $('statusDot'),
  vsSplash: $('vsSplash'),
  impact: $('impact'),
  modalBack: $('modalBack'),
  modal: $('modal'),
  AZ: {
    panel: $('panelAZ'),
    char: $('charAZ'),
    img: $('imgAZ'),
    bubble: $('bubbleAZ'),
    bubbleText: $('bubbleAZText'),
    hpFill: $('hpAZ'),
    hpNum: $('hpNumAZ'),
    stance: $('stanceAZ'),
  },
  GEM: {
    panel: $('panelGEM'),
    char: $('charGEM'),
    img: $('imgGEM'),
    bubble: $('bubbleGEM'),
    bubbleText: $('bubbleGEMText'),
    hpFill: $('hpGEM'),
    hpNum: $('hpNumGEM'),
    stance: $('stanceGEM'),
  },
};

// ----- 작은 유틸 -----
export const sleepFactory = (getSpeed) => (ms) =>
  new Promise(r => setTimeout(r, ms / getSpeed()));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const other = (s) => (s === 'AZ' ? 'GEM' : 'AZ');
export const displayName = (s) =>
  s === 'AZ' ? '지피티쨩' : s === 'GEM' ? '잼민이' : s;
export function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// "**강조**" 마크업을 HTML span으로 변환. XSS 방지로 이스케이프 먼저.
export function renderEmphasis(text) {
  const esc = escapeHtml(text || '');
  return esc.replace(/\*\*(.+?)\*\*/g, '<span class="emph">$1</span>');
}

// ----- 스프라이트 -----
const SPRITE_ACTION = {
  null: 'idle',
  speaking: 'speak',
  thinking: 'think',
  attacking: 'attack',
  damaged: 'damaged',
  victory: 'victory',
  defeat: 'defeat',
};
const SPRITE_DIR = { AZ: 'assets/az', GEM: 'assets/gem' };

// 이미지 프리로드(초기 로딩 순간 지연 줄이기)
for (const sp of ['AZ', 'GEM']) {
  for (const act of Object.values(SPRITE_ACTION)) {
    const img = new Image();
    img.src = `${SPRITE_DIR[sp]}/${act}.png`;
  }
}

export function setCharState(speaker, cls) {
  const c = ui[speaker].char;
  c.classList.remove('speaking', 'thinking', 'attacking', 'damaged', 'victory', 'defeat');
  if (cls) c.classList.add(cls);
  const key = cls === null || cls === undefined ? 'null' : cls;
  const action = SPRITE_ACTION[key] || 'idle';
  const img = ui[speaker].img;
  if (img) {
    const newSrc = `${SPRITE_DIR[speaker]}/${action}.png`;
    if (!img.src.endsWith(newSrc)) img.src = newSrc;
  }
}

// ----- HP / stance / phase / round -----
export function setHP(state, speaker, hp) {
  state.hp[speaker] = clamp(hp, 0, 100);
  ui[speaker].hpFill.style.width = state.hp[speaker] + '%';
  ui[speaker].hpNum.textContent = `${state.hp[speaker]} / 100`;
  ui[speaker].hpFill.classList.toggle('low', state.hp[speaker] < 30);
}

export function setStance(state, speaker, stance, label) {
  state.stance[speaker] = stance;
  state.stanceLabel[speaker] = label || '';
  const el = ui[speaker].stance;
  if (!stance) {
    el.textContent = '—';
  } else {
    el.textContent = label || (stance === 'PRO' ? '찬성' : '반대');
  }
  el.classList.remove('stance-pro', 'stance-con', 'stance-none');
  el.classList.add(
    !stance ? 'stance-none' :
      stance === 'PRO' ? 'stance-pro' : 'stance-con'
  );
}

export function setPhase(state, p) {
  state.phase = p;
  ui.phase.textContent = p;
  ui.statusDot.style.background = (p === 'IDLE' || p === 'END') ? '#888' : 'var(--ok)';
}

export function setRound(state, n) {
  state.turn = n;
  ui.round.textContent = n;
}

// ----- 임팩트 연출 -----
export function flashImpact() {
  ui.impact.classList.remove('flash');
  void ui.impact.offsetWidth;
  ui.impact.classList.add('flash');
}

export function shakeCenter(getSpeed) {
  document.querySelector('.stage').animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 220 / getSpeed() }
  );
}

// 데미지 인디케이터 — 캐릭터 위로 "-15" 같은 숫자가 솟아오름
export function showDamagePopup(speaker, dmg) {
  const stage = ui[speaker].char.parentElement; // .char-stage
  if (!stage) return;
  const el = document.createElement('div');
  el.className = 'dmg-popup ' + (dmg >= 30 ? 'big' : dmg >= 15 ? 'mid' : 'small');
  el.textContent = `-${dmg}`;
  stage.appendChild(el);
  // 애니 끝나면 정리 (CSS와 동일 시간)
  setTimeout(() => {
    if (el.parentElement) el.parentElement.removeChild(el);
  }, dmg >= 30 ? 2500 : 2300);
}

// ----- 말풍선 -----
export async function showBubble(sleep, speaker, text, _intent = 'ATTACK') {
  const b = ui[speaker].bubble;
  const t = ui[speaker].bubbleText;
  b.classList.remove('thinking');
  b.classList.remove('show');
  t.innerHTML = '';
  await sleep(60);
  b.classList.add('show');

  // 강조 기준으로 세그먼트 분할
  const segments = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), emph: false });
    segments.push({ text: m[1], emph: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), emph: false });
  if (segments.length === 0) segments.push({ text: text, emph: false });

  // typewriter
  let html = '';
  for (const seg of segments) {
    const chars = [...seg.text];
    for (let i = 0; i < chars.length; i++) {
      const piece = chars.slice(0, i + 1).join('');
      const escPiece = escapeHtml(piece);
      t.innerHTML = seg.emph
        ? html + `<span class="emph emph-typing">${escPiece}</span>`
        : html + escPiece;
      await sleep(18);
    }
    const escFull = escapeHtml(seg.text);
    html += seg.emph ? `<span class="emph">${escFull}</span>` : escFull;
    t.innerHTML = html;
  }
}

export function hideBubble(speaker) {
  ui[speaker].bubble.classList.remove('show');
  ui[speaker].bubble.classList.remove('thinking');
}

export function showThinkingBubble(speaker) {
  const b = ui[speaker].bubble;
  const t = ui[speaker].bubbleText;
  t.innerHTML = '<span class="mid"></span>';
  b.classList.add('thinking');
  b.classList.add('show');
}

// ----- 타임라인 로그 -----
export function pushLog(state, speaker, phase, text, intent) {
  if (state.history.length === 0) {
    ui.emptyState.style.display = 'none';
  }
  state.history.push({ speaker, phase, text, intent });
  const el = document.createElement('div');
  el.className = 'log-item ' + (speaker === 'SYS' ? 'system' : speaker.toLowerCase());
  if (speaker === 'SYS') {
    el.innerHTML = `<span class="log-speaker">▸ SYS</span>${text}`;
  } else {
    const nm = displayName(speaker);
    el.innerHTML = `
      <span class="log-speaker">${nm}</span>
      <div style="margin-top:4px">${renderEmphasis(text || '')}</div>
    `;
  }
  // 최신을 맨 위에
  el.classList.add('fresh');
  ui.timeline.querySelectorAll('.log-item.fresh').forEach(n => n.classList.remove('fresh'));
  el.classList.add('fresh');
  ui.timeline.insertBefore(el, ui.timeline.firstChild);
  ui.timeline.scrollTop = 0;
  setTimeout(() => el.classList.remove('fresh'), 1800);
}

// ----- 모달 헬퍼 -----
export function closeModal() {
  ui.modalBack.classList.remove('show');
}

// 결과 모달 HTML 렌더링
export function renderConclusionHtml(c) {
  if (!c) return '<div class="conclusion-block loading">결론 정리 실패. 주제를 달리해서 다시 시도해보세요</div>';
  const kp = (c.key_points || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');
  return `
    <div class="conclusion-block">
      <div class="verdict-line">${escapeHtml(c.verdict)}</div>
      <div class="summary-text">${escapeHtml(c.summary)}</div>
      ${kp ? `<ul class="key-points">${kp}</ul>` : ''}
    </div>
  `;
}

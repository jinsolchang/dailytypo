// =========================================================
// AI DEBATE ARENA — 메인 플로우, API, 상태 머신
// =========================================================
import {
  ui, sleepFactory, other, displayName, escapeHtml,
  setCharState, setHP, setStance, setPhase, setRound,
  flashImpact, shakeCenter, showDamagePopup,
  showBubble, hideBubble, showThinkingBubble,
  pushLog, closeModal, renderConclusionHtml,
} from './ui.js';
import {
  introLineOf, koScreamOf, koSurrenderOf, winLineOf, victoryQuoteOf,
  prefixOf, OPPONENT_NAME,
  SAMPLE_TOPICS,
} from './lines.js';

// ----- CONFIG -----
const MAX_REBUTTALS = 10;

// ----- STATE -----
const state = {
  topic: '',
  phase: 'IDLE',
  turn: 0,
  history: [],
  stance: { AZ: null, GEM: null },
  stanceLabel: { AZ: '', GEM: '' },
  hp: { AZ: 100, GEM: 100 },
  speed: 1,
  running: false,
  closing: { AZ: null, GEM: null },
  consensusHits: 0,
};

const sleep = sleepFactory(() => state.speed);

// ----- API -----
async function callDebater(payload) {
  const res = await fetch('/api/debate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  const j = await res.json();
  return {
    speech: String(j.speech || '…'),
    intent: ['ATTACK', 'SURRENDER', 'CONSENSUS', 'DEADLOCK'].includes(j.intent) ? j.intent : 'ATTACK',
    confidence: Math.max(0, Math.min(1, Number(j.confidence ?? 0.5))),
    judge: j.judge || null,
  };
}

async function fetchTurn(speaker, phase) {
  const payload = {
    speaker, phase,
    topic: state.topic,
    stance: state.stance[speaker],
    stance_label: state.stanceLabel[speaker],
    opponent_stance_label: state.stanceLabel[other(speaker)],
    my_hp: state.hp[speaker],
    history: state.history.map(h => ({ speaker: h.speaker, text: h.text })),
  };
  const res = await callDebater(payload);
  return { speaker, phase, ...res };
}

// 글자수 기반 체류 시간
function readTimeFor(text) {
  const len = (text || '').length;
  return Math.max(2500, len * 90 + 300);
}

// history에서 주어진 speaker의 마지막 텍스트 — 단, "지금 방금 추가된 발화" 제외
function lastFromBefore(speaker, skipText) {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const h = state.history[i];
    if (h.speaker === speaker && h.text !== skipText) return h.text;
  }
  return '';
}

function lastFrom(speaker) {
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (state.history[i].speaker === speaker) return state.history[i].text;
  }
  return '...';
}

// ----- 턴 재생 -----
async function playTurn(item) {
  const { speaker, phase, intent } = item;
  let speech = item.speech;

  // REBUTTAL 에서 ATTACK intent 이면 호칭 프리픽스 자동 부착.
  // 서버 모델이 실수로 호칭 넣었으면 제거 후 재부착.
  if (phase === 'REBUTTAL' && intent === 'ATTACK') {
    const oppName = OPPONENT_NAME[speaker];
    // 문장 앞쪽에 상대 이름이 어정쩡하게 들어간 경우 제거 (예: "잼민이, 당신은..." → "당신은...")
    // 정규식: 문장 맨 앞부분에서 "잼민이" 또는 "잼민이 씨" 같은 걸 포함한 ", " 이전까지를 삭제
    const nameEscaped = oppName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const leadingAddr = new RegExp(`^\\s*[^,.!?]*${nameEscaped}[^,.!?]*[,.…\\s]*`);
    speech = speech.replace(leadingAddr, '').trim();
    // 중간에 남은 상대 이름도 제거(아주 드문 케이스). 호칭 옆 쉼표/공백도 정리.
    speech = speech.replace(new RegExp(`[,\\s]*${nameEscaped}[가은는이야]?[,\\s]*`, 'g'), ' ').replace(/\s+/g, ' ').trim();

    // HP <= 30이면 당황 프리픽스, 상대 HP <= 50이면 피니셔(마무리) 프리픽스
    const panic = state.hp[speaker] <= 30;
    const finisher = !panic && state.hp[other(speaker)] <= 50;
    const prefix = prefixOf(speaker, { panic, finisher });
    if (prefix) {
      // 프리픽스 끝이 문장 부호(쉼표, 마침표, 말줄임표)면 공백만 넣고, 아니면 공백 두칸 띄움
      const sep = /[,.…!?~\-]$/.test(prefix) ? ' ' : ' ';
      speech = `${prefix}${sep}${speech}`;
    }
  }

  hideBubble(speaker);
  setCharState(speaker, 'speaking');

  // JUDGE — 대사 표시와 병렬로 fetch 시작 (기다리지 않고 promise만 잡아둠)
  let judgePromise = null;
  if (phase === 'REBUTTAL' && intent === 'ATTACK') {
    const target = other(speaker);
    const myLast = lastFromBefore(target, speech);
    if (myLast) {
      judgePromise = fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge: target,
          topic: state.topic,
          stance: state.stance[target],
          stance_label: state.stanceLabel[target],
          my_last: myLast,
          their_attack: speech,
        }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(err => { console.warn('judge fetch failed', err); return null; });
    }
  }

  // 타이프라이터로 대사 표시 (judge는 병렬 진행)
  await showBubble(sleep, speaker, speech, intent);
  pushLog(state, speaker, phase, speech, intent);

  // judge 완료 대기 (이미 끝났으면 즉시)
  const judgeData = judgePromise ? await judgePromise : null;

  const dwell = readTimeFor(speech);
  const start = performance.now();

  if (judgeData) {
    const j = judgeData;
    // 서버에서 이미 0~50 클램핑됨 — 그대로 사용
    const dmg = Number(j.damage) || 0;
    const target = other(speaker);
    const lethal = state.hp[target] - dmg <= 0;

    if (lethal) {
      // 치명타: 대사 체류 후 KO 플로우로 위임
      const lethalDwell = Math.max(1800, speech.length * 80);
      await sleep(lethalDwell);

      setCharState(speaker, 'attacking');
      flashImpact();
      shakeCenter(() => state.speed);
      setCharState(target, 'damaged');
      // attack 포즈 충분히 유지 (1.2초)
      await sleep(1200);
      setCharState(speaker, null);
      item._pendingKO = { target, dmg, reason: j.reason || '' };
      return;
    }

    if (dmg >= 35) {
      // 강한 피격: attack 포즈를 1.2초 유지, 중간에 speaking으로 안 바꿈
      setCharState(speaker, 'attacking');
      flashImpact();
      shakeCenter(() => state.speed);
      setCharState(target, 'damaged');
      // 1.2초 뒤 idle (next 턴이 이어받음)
      setTimeout(() => {
        const c = ui[speaker].char;
        if (c.classList.contains('attacking')) setCharState(speaker, null);
      }, 1200);
    } else if (dmg >= 20) {
      setCharState(target, 'damaged');
    }

    const visualDelay = dmg >= 35 ? 400 : (dmg >= 20 ? 250 : 0);
    if (visualDelay > 0) await sleep(visualDelay);

    if (dmg > 0) {
      showDamagePopup(target, dmg);
      setHP(state, target, state.hp[target] - dmg);
    }

    // damaged 풀리는 시점 — 말풍선 다 읽고 동시에 speaker도 idle 로.
    // 체류 시간(읽는 시간)과 맞추되, 최소 1000ms / 최대 2200ms.
    const dwellForDamaged = Math.max(1000, Math.min(2200, readTimeFor(speech) * 0.5));
    setTimeout(() => {
      const c = ui[target].char;
      if (c.classList.contains('damaged')) setCharState(target, null);
    }, dwellForDamaged);
  }

  const elapsed = performance.now() - start;
  const remain = dwell - elapsed;

  // 체류 시간이 아직 남았으면 — 절반 지점에서 상대(피격자)에게 thinking 버블 띄워
  // "반박 준비 중" 느낌 연출
  if (phase === 'REBUTTAL' && remain > 800) {
    // 체류의 절반 지점까지 기다리고, 그 후 상대 thinking 시작
    await sleep(remain * 0.5);
    const target = other(speaker);
    // 상대는 damaged 애니 끝난 뒤 thinking 포즈로
    setCharState(target, 'thinking');
    showThinkingBubble(target);
    // 남은 체류 마저
    await sleep(remain * 0.5);
  } else if (remain > 0) {
    await sleep(remain);
  }

  setCharState(speaker, null);
}

// ----- 인트로 대사 -----
async function showIntroLine(speaker) {
  const line = introLineOf(speaker);
  if (!line) return;
  setCharState(speaker, 'speaking');
  await showBubble(sleep, speaker, line, 'INTRO');
  pushLog(state, speaker, 'REBUTTAL', line, null);
  await sleep(Math.max(1600, line.length * 90 + 300));
  setCharState(speaker, null);
  hideBubble(speaker);
  await sleep(200);
}

// ----- KO 플로우 -----
async function knockoutSurrender(loser, pendingKO) {
  const scream = koScreamOf(loser);
  const surrenderLine = koSurrenderOf(loser);
  const winner = other(loser);

  // 1. 공격자 attacking → victory, 패배자 damaged
  setCharState(winner, 'attacking');
  hideBubble(loser);
  setCharState(loser, 'damaged');
  await sleep(350);
  setCharState(winner, 'victory');

  // 2. 패배자 비명 ("으악!" 등)
  if (scream) {
    await showBubble(sleep, loser, scream, 'KO');
    pushLog(state, loser, null, scream, 'KO');
    await sleep(Math.max(800, scream.length * 70));
    hideBubble(loser);
    await sleep(200);
  }

  // 3. HP 0 으로 떨어짐 + defeat 포즈로 전환 (동시)
  if (pendingKO) {
    showDamagePopup(loser, state.hp[loser]);
  }
  setCharState(loser, 'defeat');
  setHP(state, loser, 0);
  await sleep(800);

  // 4. 패배자 항복 대사 ("졌어요" 등)
  await showBubble(sleep, loser, surrenderLine, 'SURRENDER');
  pushLog(state, loser, null, surrenderLine, 'SURRENDER');
  await sleep(Math.max(1800, surrenderLine.length * 85));
  hideBubble(loser);
  await sleep(300);

  // 5. 승자 승리 대사 (유지)
  const winLine = winLineOf(winner);
  if (winLine) {
    await showBubble(sleep, winner, winLine, 'VICTORY');
    pushLog(state, winner, null, winLine, 'VICTORY');
    await sleep(Math.max(2500, winLine.length * 95));
  }

  endSurrender._winLineSpoken = true;
  await endSurrender(winner, loser);
}

// ----- 결론 prefetch -----
let _conclusionPromise = null;

function beginConclusionFetch({ outcome, winner, winnerStance }) {
  _conclusionPromise = (async () => {
    try {
      const res = await fetch('/api/conclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: state.topic,
          outcome,
          winner,
          winner_stance: winnerStance,
          winner_stance_label: winner ? state.stanceLabel[winner] : null,
          history: state.history.map(h => ({ speaker: h.speaker, text: h.text })),
        }),
      });
      if (!res.ok) throw new Error('conclude http');
      return await res.json();
    } catch (err) {
      console.warn('conclusion fetch failed', err);
      return null;
    }
  })();
  return _conclusionPromise;
}

async function fetchConclusion({ outcome, winner, winnerStance }) {
  if (_conclusionPromise) {
    const cached = await _conclusionPromise;
    _conclusionPromise = null;
    return cached;
  }
  return beginConclusionFetch({ outcome, winner, winnerStance }).then(p => {
    _conclusionPromise = null;
    return p;
  });
}

// ----- 종료 핸들러 -----
async function endSurrender(winner, loser) {
  setPhase(state, 'END');
  setCharState(winner, 'victory');
  setCharState(loser, 'defeat');
  hideBubble(loser);
  pushLog(state, 'SYS', 'END', `<b style="color:var(--ok)">${displayName(winner)}</b>의 승리! ${displayName(loser)} 항복.`);
  if (!endSurrender._winLineSpoken) {
    const winLine = winLineOf(winner);
    if (winLine) {
      await showBubble(sleep, winner, winLine, 'VICTORY');
      pushLog(state, winner, 'END', winLine, 'VICTORY');
      await sleep(Math.max(1400, winLine.length * 85));
    }
  }
  endSurrender._winLineSpoken = false;
  await sleep(800);
  showResultModal({ type: 'SURRENDER', winner, loser });
  finalize();
}

async function endConsensus() {
  setPhase(state, 'END');
  setCharState('AZ', 'victory');
  setCharState('GEM', 'victory');
  pushLog(state, 'SYS', 'END', '양측 합의 도달. 무승부.');
  await sleep(1200);
  showResultModal({ type: 'CONSENSUS' });
  finalize();
}

async function endDeadlock() {
  setPhase(state, 'CLOSING');
  pushLog(state, 'SYS', 'CLOSING', '교착 상태! 양측 최종 변론을 시작합니다.');
  await sleep(700);

  for (const sp of ['AZ', 'GEM']) {
    setCharState(sp, 'thinking');
    hideBubble(sp);
    showThinkingBubble(sp);
  }
  const [azRes, gemRes] = await Promise.all([
    callDebater({
      speaker: 'AZ', phase: 'CLOSING',
      topic: state.topic,
      stance: state.stance.AZ,
      stance_label: state.stanceLabel.AZ,
      opponent_stance_label: state.stanceLabel.GEM,
      my_hp: state.hp.AZ,
      history: state.history.map(h => ({ speaker: h.speaker, text: h.text })),
    }),
    callDebater({
      speaker: 'GEM', phase: 'CLOSING',
      topic: state.topic,
      stance: state.stance.GEM,
      stance_label: state.stanceLabel.GEM,
      opponent_stance_label: state.stanceLabel.AZ,
      my_hp: state.hp.GEM,
      history: state.history.map(h => ({ speaker: h.speaker, text: h.text })),
    }),
  ]);
  state.closing.AZ = azRes.speech;
  state.closing.GEM = gemRes.speech;

  for (const [sp, res] of [['AZ', azRes], ['GEM', gemRes]]) {
    hideBubble(sp);
    setCharState(sp, 'speaking');
    setCharState(other(sp), null);
    hideBubble(other(sp));
    await showBubble(sleep, sp, res.speech, 'DEADLOCK');
    pushLog(state, sp, 'CLOSING', res.speech, 'DEADLOCK');
    await sleep(readTimeFor(res.speech));
    setCharState(sp, null);
  }

  setPhase(state, 'END');
  showResultModal({ type: 'DEADLOCK' });
  finalize();
}

function finalize() {
  state.running = false;
  ui.start.disabled = false;
  ui.topic.disabled = false;
  ui.surrender.disabled = true;
}

// ----- 결과 모달 -----
async function showResultModal(opts) {
  const m = ui.modal;
  const topic = escapeHtml(state.topic);

  let header = '';
  let winnerBlock = '';

  if (opts.type === 'SURRENDER') {
    header = `
      <h2>🏆 V I C T O R Y</h2>
      <div class="sub">${displayName(opts.loser)}이(가) 항복을 선언했습니다</div>
    `;
    winnerBlock = `
      <div class="victory-banner">
        <div class="winner-name">${displayName(opts.winner)}</div>
        <div class="winner-quote">"${escapeHtml(victoryQuoteOf(opts.winner))}"</div>
      </div>
    `;
  } else if (opts.type === 'VERDICT') {
    header = `
      <h2>🏆 V E R D I C T</h2>
      <div class="sub">사용자 판결에 의한 승리</div>
    `;
    winnerBlock = `
      <div class="victory-banner">
        <div class="winner-name">${displayName(opts.winner)}</div>
        <div class="winner-quote">"${escapeHtml(victoryQuoteOf(opts.winner))}"</div>
      </div>
    `;
  } else if (opts.type === 'CONSENSUS') {
    header = `
      <h2>🤝 C O N S E N S U S</h2>
      <div class="sub">양측이 합의에 도달 — 무승부</div>
    `;
  } else if (opts.type === 'DEADLOCK') {
    header = `
      <h2>⚖ D E A D L O C K</h2>
      <div class="sub">교착 상태 — 당신이 판결한다</div>
    `;
  } else if (opts.type === 'DRAW') {
    header = `
      <h2>🤝 D R A W</h2>
      <div class="sub">사용자 판결에 의한 무승부</div>
    `;
  }

  const topicLine = `<div class="topic-echo">📡 ${topic}</div>`;

  if (opts.type === 'DEADLOCK') {
    // 교착 상태는 사용자 판결 없이 "무승부"로 결론 자동 표시
    m.innerHTML = `
      ${header}
      ${topicLine}
      <div class="modal-section az">
        <h3>${displayName('AZ')} 최종 변론 · ${state.stanceLabel.AZ || (state.stance.AZ === 'PRO' ? '찬성' : '반대')}</h3>
        <div>${escapeHtml(state.closing.AZ || lastFrom('AZ'))}</div>
      </div>
      <div class="modal-section gem">
        <h3>${displayName('GEM')} 최종 변론 · ${state.stanceLabel.GEM || (state.stance.GEM === 'PRO' ? '찬성' : '반대')}</h3>
        <div>${escapeHtml(state.closing.GEM || lastFrom('GEM'))}</div>
      </div>
      <div class="conclusion-block loading">결론을 정리하는 중</div>
      <div class="modal-actions">
        <button class="btn primary" data-action="close">NEW TOPIC</button>
      </div>
    `;
    bindModalActions();
    ui.modalBack.classList.add('show');

    // 결론 fetch 후 교체
    const conclusion = await fetchConclusion({
      outcome: 'DEADLOCK', winner: null, winnerStance: null,
    });
    if (!ui.modalBack.classList.contains('show')) return;
    m.innerHTML = `
      ${header}
      ${topicLine}
      <div class="modal-section az">
        <h3>${displayName('AZ')} 최종 변론 · ${state.stanceLabel.AZ || (state.stance.AZ === 'PRO' ? '찬성' : '반대')}</h3>
        <div>${escapeHtml(state.closing.AZ || lastFrom('AZ'))}</div>
      </div>
      <div class="modal-section gem">
        <h3>${displayName('GEM')} 최종 변론 · ${state.stanceLabel.GEM || (state.stance.GEM === 'PRO' ? '찬성' : '반대')}</h3>
        <div>${escapeHtml(state.closing.GEM || lastFrom('GEM'))}</div>
      </div>
      ${renderConclusionHtml(conclusion)}
      <div class="modal-actions">
        <button class="btn primary" data-action="close">NEW TOPIC</button>
      </div>
    `;
    bindModalActions();
    return;
  }

  const actionsHtml = `
    <div class="modal-actions">
      <button class="btn primary" data-action="close">NEW TOPIC</button>
      ${opts.winner ? `<button class="btn ghost" data-action="rematch">REMATCH</button>` : ''}
    </div>
  `;
  m.innerHTML = `
    ${header}
    ${topicLine}
    ${winnerBlock}
    <div class="conclusion-block loading">결론을 정리하는 중</div>
    ${actionsHtml}
  `;
  bindModalActions();
  ui.modalBack.classList.add('show');

  const conclusion = await fetchConclusion({
    outcome: opts.type,
    winner: opts.winner || null,
    winnerStance: opts.winner ? state.stance[opts.winner] : null,
  });
  if (!ui.modalBack.classList.contains('show')) return;
  m.innerHTML = `
    ${header}
    ${topicLine}
    ${winnerBlock}
    ${renderConclusionHtml(conclusion)}
    ${actionsHtml}
  `;
  bindModalActions();
}

function bindModalActions() {
  ui.modal.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'close') closeModal();
      else if (a === 'rematch') { closeModal(); rematch(); }
    });
  });
}

function userVerdict(v) {
  if (v === 'AZ' || v === 'GEM') {
    setCharState(v, 'victory');
    setCharState(other(v), 'defeat');
    pushLog(state, 'SYS', 'VERDICT', `사용자 판결: <b>${displayName(v)}</b> 승!`);
    closeModal();
    setTimeout(() => showResultModal({ type: 'VERDICT', winner: v, loser: other(v) }), 250);
  } else {
    pushLog(state, 'SYS', 'VERDICT', '사용자 판결: 무승부.');
    closeModal();
    setTimeout(() => showResultModal({ type: 'DRAW' }), 250);
  }
}

function rematch() {
  setTimeout(() => startDebate(), 200);
}

// ----- 메인 플로우 -----
async function startDebate() {
  if (state.running) return;
  const topic = ui.topic.value.trim();
  if (!topic) {
    ui.topic.focus();
    ui.topic.style.animation = 'shake .35s';
    setTimeout(() => ui.topic.style.animation = '', 400);
    return;
  }
  state.running = true;
  state.topic = topic;
  state.history = [];
  state.turn = 0;
  state.consensusHits = 0;
  setHP(state, 'AZ', 100); setHP(state, 'GEM', 100);
  setCharState('AZ', null); setCharState('GEM', null);
  hideBubble('AZ'); hideBubble('GEM');
  ui.timeline.innerHTML = '';
  ui.emptyState.style.display = 'none';
  ui.start.disabled = true;
  ui.topic.disabled = true;
  ui.surrender.disabled = false;

  // 주제에서 두 입장 뽑아오기
  let sideA = '찬성', sideB = '반대';
  try {
    const r = await fetch('/api/stances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
    if (r.ok) {
      const j = await r.json();
      if (j.side_a) sideA = j.side_a;
      if (j.side_b) sideB = j.side_b;
    }
  } catch (err) { console.warn('stances fetch failed', err); }

  const azIsPro = Math.random() < 0.5;
  setStance(state, 'AZ', azIsPro ? 'PRO' : 'CON', azIsPro ? sideA : sideB);
  setStance(state, 'GEM', azIsPro ? 'CON' : 'PRO', azIsPro ? sideB : sideA);

  pushLog(state, 'SYS', 'INIT', `주제: <b>${topic}</b>`);
  pushLog(state, 'SYS', 'INIT', `${displayName('AZ')}: <b>${state.stanceLabel.AZ}</b> / ${displayName('GEM')}: <b>${state.stanceLabel.GEM}</b>`);

  // VS splash
  ui.vsSplash.classList.remove('show');
  void ui.vsSplash.offsetWidth;
  ui.vsSplash.classList.add('show');
  await sleep(900);

  // OPENING — 병렬
  setPhase(state, 'OPENING');
  setCharState('AZ', 'thinking');
  setCharState('GEM', 'thinking');
  showThinkingBubble('AZ');
  showThinkingBubble('GEM');
  const [azOpen, gemOpen] = await Promise.all([
    fetchTurn('AZ', 'OPENING'),
    fetchTurn('GEM', 'OPENING'),
  ]);
  hideBubble('AZ');
  hideBubble('GEM');
  await Promise.all([playTurn(azOpen), playTurn(gemOpen)]);
  await sleep(400);

  // REBUTTAL LOOP
  setPhase(state, 'REBUTTAL');
  let current = Math.random() < 0.5 ? 'AZ' : 'GEM';
  await showIntroLine(current);
  let ended = false;

  let nextFetch = fetchTurn(current, 'REBUTTAL');

  for (let t = 1; t <= MAX_REBUTTALS; t++) {
    setRound(state, t);

    // 이전 턴 끝에서 이미 상대(=현재 발화자)가 thinking 상태일 수 있음 — 유지
    // 그 외의 경우에만 thinking 버블 세팅
    const curChar = ui[current].char;
    if (!curChar.classList.contains('thinking')) {
      setCharState(current, 'thinking');
      showThinkingBubble(current);
    }

    let item = await nextFetch;
    // prefetch 실패 시 (Azure 콘텐츠 필터 등) 인라인 재시도
    if (!item) {
      console.warn(`[turn ${t}] prefetch failed, retrying inline...`);
      try {
        item = await fetchTurn(current, 'REBUTTAL');
      } catch (err) {
        console.error(`[turn ${t}] retry also failed, ending debate as deadlock`, err);
        ended = true;
        beginConclusionFetch({ outcome: 'DEADLOCK', winner: null, winnerStance: null });
        await endDeadlock();
        break;
      }
    }
    hideBubble(current);

    // 상대방 bubble/state 정리
    const otherSide = other(current);
    hideBubble(otherSide);
    setCharState(otherSide, null);

    // ⚡ 다음 턴 prefetch 먼저 트리거. playTurn 이 ~5-7초 걸리는 동안 API 호출도 병렬로.
    //   item 이 방금 도착해서 history에 아직 push 되지 않았으므로 직접 한 줄 추가 뒤 fetch.
    //   (playTurn 내부에서 pushLog 되면 중복이지만 prefetch 시 history 참조 시점에만 유효)
    const nextSpeaker = other(current);
    let nextPrefetchPromise = null;
    if (t < MAX_REBUTTALS) {
      // item.speech 를 history 에 선반영 (prefetch용) — playTurn 내 pushLog 는 그대로 돎
      // 간단하게: playTurn이 pushLog하기 전이라도 현재 speech를 prefetch 프롬프트에 넣어야 함.
      // 그래서 여기서는 한 번 이 history를 조합한 prefetch 를 따로 만들어둠.
      const tempHistory = [
        ...state.history.map(h => ({ speaker: h.speaker, text: h.text })),
        { speaker: item.speaker, text: item.speech },
      ];
      const payload = {
        speaker: nextSpeaker, phase: 'REBUTTAL',
        topic: state.topic,
        stance: state.stance[nextSpeaker],
        stance_label: state.stanceLabel[nextSpeaker],
        opponent_stance_label: state.stanceLabel[other(nextSpeaker)],
        my_hp: state.hp[nextSpeaker],
        history: tempHistory,
      };
      nextPrefetchPromise = callDebater(payload)
        .then(res => ({ speaker: nextSpeaker, phase: 'REBUTTAL', ...res }))
        .catch(err => { console.warn('prefetch failed', err); return null; });
    }

    // 이전 playTurn 말미에 상대(=이번 발화자)를 thinking으로 띄우고 쉬는 시간을 이미 거쳤으므로
    // 여기선 짧은 호흡만.
    await sleep(400);

    await playTurn(item);

    const result = item;

    if (item._pendingKO) {
      ended = true;
      beginConclusionFetch({ outcome: 'SURRENDER', winner: current, winnerStance: state.stance[current] });
      await knockoutSurrender(item._pendingKO.target, item._pendingKO);
      break;
    }

    if (result.intent === 'SURRENDER') {
      ended = true;
      const winner = other(current);
      beginConclusionFetch({ outcome: 'SURRENDER', winner, winnerStance: state.stance[winner] });
      await endSurrender(winner, current);
      break;
    }
    if (result.intent === 'CONSENSUS') {
      state.consensusHits++;
      if (state.consensusHits >= 2) {
        ended = true;
        beginConclusionFetch({ outcome: 'CONSENSUS', winner: null, winnerStance: null });
        await endConsensus();
        break;
      }
    } else {
      state.consensusHits = 0;
    }
    if (result.intent === 'DEADLOCK' && t >= 4) {
      ended = true;
      beginConclusionFetch({ outcome: 'DEADLOCK', winner: null, winnerStance: null });
      await endDeadlock();
      break;
    }
    const target = other(current);
    if (state.hp[target] <= 0) {
      ended = true;
      beginConclusionFetch({ outcome: 'SURRENDER', winner: current, winnerStance: state.stance[current] });
      await knockoutSurrender(target);
      break;
    }

    current = other(current);
    if (t < MAX_REBUTTALS) {
      // prefetch는 playTurn 시작 직전에 이미 시작됨 (nextPrefetchPromise)
      // 여기선 대기 상태의 Promise를 nextFetch로 이어받기만.
      nextFetch = nextPrefetchPromise || fetchTurn(current, 'REBUTTAL');
    }
  }

  if (!ended) {
    beginConclusionFetch({ outcome: 'DEADLOCK', winner: null, winnerStance: null });
    await endDeadlock();
  }
}

// ----- 컨트롤 바인딩 -----
ui.start.addEventListener('click', startDebate);
ui.topic.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startDebate();
});
ui.reset.addEventListener('click', () => {
  if (state.running && !confirm('진행 중인 토론을 중단할까요?')) return;
  location.reload();
});
ui.surrender.addEventListener('click', () => {
  if (!state.running) return;
  state.running = false;
  pushLog(state, 'SYS', 'FORCE', '사용자가 강제 종료를 눌렀습니다.');
  endDeadlock();
});

// SPEED / MODE 컨트롤은 제거. state.speed=1, state.mode='REAL' 고정

// 모달 외부 클릭으로 닫기
ui.modalBack.addEventListener('click', (e) => {
  if (e.target === ui.modalBack && state.phase === 'END') {
    if (!ui.modal.querySelector('[data-verdict]')) {
      closeModal();
    }
  }
});

// init HP
setHP(state, 'AZ', 100); setHP(state, 'GEM', 100);
setPhase(state, 'IDLE');

// 샘플 placeholder 로테이트
let si = 0;
setInterval(() => {
  if (document.activeElement === ui.topic) return;
  si = (si + 1) % SAMPLE_TOPICS.length;
  ui.topic.placeholder = SAMPLE_TOPICS[si];
}, 4000);

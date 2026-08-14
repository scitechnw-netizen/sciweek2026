import { supabase } from './supabase-client.js';
import { APP_CONFIG } from './config.js';

const TOKEN_KEY = 'treasure_hunt_session_token_v1';

const $ = (id) => document.getElementById(id);
const setupView = $('setupView');
const gameView = $('gameView');
const studentCode = $('studentCode');
const searchBtn = $('searchBtn');
const lookupResult = $('lookupResult');
const setupMessage = $('setupMessage');
const questionPanel = $('questionPanel');
const loadingPanel = $('loadingPanel');
const chestPanel = $('chestPanel');
const finishPanel = $('finishPanel');
const choices = $('choices');
const answerMessage = $('answerMessage');

let lookupStudent = null;
let busy = false;

function setBusy(value) {
  busy = value;
  searchBtn.disabled = value;
  document.querySelectorAll('button.choice-btn').forEach((b) => (b.disabled = value));
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setMessage(el, text, type = 'info') {
  el.textContent = text;
  el.className = `message ${type}`;
  show(el);
}
function clearMessage(el) { hide(el); el.textContent = ''; }

function setGameHeader(state) {
  if (state?.student) {
    $('playerName').textContent = state.student.name || '-';
    $('playerClass').textContent = state.student.className ? ` • ${state.student.className}` : '';
  }
  const score = Number(state?.score || 0);
  $('scoreValue').textContent = score;
  $('chestValue').textContent = Number(state?.chestsOpened || 0);
  $('progressFill').style.width = `${Math.min(100, (score / APP_CONFIG.totalQuestions) * 100)}%`;
}

function enterGame() {
  hide(setupView);
  show(gameView);
}

function showLoading() {
  hide(questionPanel); hide(chestPanel); hide(finishPanel); show(loadingPanel);
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

async function lookup() {
  if (busy) return;
  const code = studentCode.value.trim();
  if (!code) return setMessage(setupMessage, 'กรุณากรอกรหัสนักเรียน', 'error');

  clearMessage(setupMessage);
  hide(lookupResult);
  setBusy(true);
  searchBtn.textContent = 'กำลังค้นหา...';
  try {
    const data = await rpc('lookup_student', { p_student_code: code });
    if (!data?.found) {
      lookupStudent = null;
      return setMessage(setupMessage, data?.message || 'ไม่พบรหัสนักเรียน', 'error');
    }

    lookupStudent = data;
    lookupResult.innerHTML = `
      <div class="student-found">
        <div class="student-avatar">🧭</div>
        <div class="student-info">
          <span class="mini-label">พบข้อมูลนักเรียน</span>
          <strong>${escapeHtml(data.name || '')}</strong>
          <span>${escapeHtml(data.className || '')}</span>
        </div>
      </div>
      ${data.eligible
        ? '<button id="startBtn" class="btn primary large full">เริ่มเกม</button>'
        : `<div class="message error">${escapeHtml(data.message || 'รหัสนี้เล่นแล้ว')}</div>`}
    `;
    show(lookupResult);
    if (data.eligible) $('startBtn').addEventListener('click', startGame);
  } catch (err) {
    console.error(err);
    setMessage(setupMessage, 'เชื่อมต่อระบบไม่ได้ กรุณาลองอีกครั้ง', 'error');
  } finally {
    setBusy(false);
    searchBtn.textContent = 'ค้นหา';
  }
}

async function startGame() {
  if (busy || !lookupStudent?.eligible) return;
  setBusy(true);
  try {
    const data = await rpc('start_game', { p_student_code: lookupStudent.studentCode });
    if (!data?.ok) {
      return setMessage(setupMessage, data?.message || 'ไม่สามารถเริ่มเกมได้', 'error');
    }
    localStorage.setItem(TOKEN_KEY, data.sessionToken);
    enterGame();
    setGameHeader({ student: data.student, score: 0, chestsOpened: 0 });
    await loadNextQuestion();
  } catch (err) {
    console.error(err);
    setMessage(setupMessage, 'เริ่มเกมไม่สำเร็จ กรุณาลองอีกครั้ง', 'error');
  } finally {
    setBusy(false);
  }
}

function renderQuestion(q) {
  hide(loadingPanel); hide(chestPanel); hide(finishPanel); show(questionPanel);
  clearMessage(answerMessage);
  $('signNumber').textContent = q.signNumber;
  $('roundNumber').textContent = q.sequence;
  choices.innerHTML = '';

  for (const choice of q.choices || []) {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.type = 'button';
    btn.innerHTML = `<span class="choice-key">${choice.key}</span><span>${escapeHtml(choice.text)}</span>`;
    btn.addEventListener('click', () => submitAnswer(choice.key));
    choices.appendChild(btn);
  }
}

async function loadNextQuestion() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return resetToLogin();
  showLoading();
  try {
    const data = await rpc('next_question', { p_session_token: token });
    if (!data?.ok) {
      if (data?.error === 'chest_action_required') return restoreState();
      throw new Error(data?.message || data?.error || 'next_question_failed');
    }
    renderQuestion(data.question);
  } catch (err) {
    console.error(err);
    hide(loadingPanel); show(questionPanel);
    setMessage(answerMessage, 'สุ่มคำถามไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ หรือติดต่อครูผู้ดูแล', 'error');
  }
}

async function submitAnswer(option) {
  if (busy) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return resetToLogin();
  setBusy(true);
  document.querySelectorAll('.choice-btn').forEach((b) => (b.disabled = true));
  clearMessage(answerMessage);

  try {
    const data = await rpc('submit_answer', { p_session_token: token, p_selected_option: option });
    if (!data?.ok) {
      if (data?.error === 'chest_action_required') return restoreState();
      throw new Error(data?.error || 'submit_failed');
    }

    if (!data.correct) {
      setMessage(answerMessage, '❌ ยังไม่ถูก ลองอีกครั้ง', 'error');
      document.querySelectorAll('.choice-btn').forEach((b) => (b.disabled = false));
      return;
    }

    setGameHeader({ score: data.score, chestsOpened: data.chestsOpened ?? Number($('chestValue').textContent) });
    setMessage(answerMessage, '✅ ตอบถูก!', 'success');

    if (data.finished) {
      setTimeout(() => showFinish(data), 500);
      return;
    }

    if (data.milestone) {
      setTimeout(() => showChest(data.score, data.chestNumber), 500);
      return;
    }

    setTimeout(loadNextQuestion, 650);
  } catch (err) {
    console.error(err);
    setMessage(answerMessage, 'ส่งคำตอบไม่สำเร็จ กรุณาลองอีกครั้ง', 'error');
    document.querySelectorAll('.choice-btn').forEach((b) => (b.disabled = false));
  } finally {
    setBusy(false);
  }
}

function showChest(score, chestNumber) {
  hide(questionPanel); hide(loadingPanel); hide(finishPanel); show(chestPanel);
  $('milestoneScore').textContent = score;
  $('milestoneChest').textContent = chestNumber;
  $('scoreValue').textContent = score;
  $('chestValue').textContent = chestNumber;
}

async function continueGame() {
  if (busy) return;
  const token = localStorage.getItem(TOKEN_KEY);
  setBusy(true);
  $('continueBtn').disabled = true;
  $('finishBtn').disabled = true;
  try {
    const data = await rpc('continue_game', { p_session_token: token });
    if (!data?.ok) throw new Error(data?.error || 'continue_failed');
    await loadNextQuestion();
  } catch (err) {
    console.error(err);
    alert('ไม่สามารถเล่นต่อได้ กรุณาลองอีกครั้ง');
  } finally {
    setBusy(false);
    $('continueBtn').disabled = false;
    $('finishBtn').disabled = false;
  }
}

async function finishGame() {
  if (busy) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!confirm('ยืนยันจบเกมใช่หรือไม่? เมื่อจบแล้วจะกลับมาเล่นต่อไม่ได้')) return;
  setBusy(true);
  $('continueBtn').disabled = true;
  $('finishBtn').disabled = true;
  try {
    const data = await rpc('finish_game', { p_session_token: token });
    if (!data?.ok) throw new Error(data?.message || data?.error || 'finish_failed');
    showFinish(data);
  } catch (err) {
    console.error(err);
    alert(err.message || 'จบเกมไม่สำเร็จ');
  } finally {
    setBusy(false);
    $('continueBtn').disabled = false;
    $('finishBtn').disabled = false;
  }
}

function showFinish(data) {
  hide(questionPanel); hide(loadingPanel); hide(chestPanel); show(finishPanel);
  const big = Boolean(data.bigReward);
  $('finishIcon').textContent = big ? '🏆' : '🎉';
  $('finishTitle').textContent = big ? 'สุดยอด! คุณพิชิตรางวัลใหญ่' : 'ยินดีด้วย! ภารกิจสำเร็จ';
  $('finishText').innerHTML = big
    ? `คุณตอบคำถามถูกครบ <b>25 ข้อ</b><br>ได้รับสิทธิ์รับ <b>รางวัลใหญ่</b>`
    : `คุณจบเกมด้วยคะแนน <b>${Number(data.score || 0)} ข้อ</b><br>และเปิดหีบสมบัติได้ <b>${Number(data.chestsOpened || 0)} หีบ</b>`;
  $('scoreValue').textContent = Number(data.score || 0);
  if (data.chestsOpened != null) $('chestValue').textContent = Number(data.chestsOpened || 0);
}

async function restoreState() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  enterGame();
  showLoading();
  try {
    const data = await rpc('get_game_state', { p_session_token: token });
    if (!data?.ok) {
      localStorage.removeItem(TOKEN_KEY);
      return resetToLogin();
    }
    setGameHeader(data);
    if (data.finished || data.status !== 'active') return showFinish(data);
    if (data.awaitingChest) return showChest(data.score, data.chestNumber || data.chestsOpened);
    if (data.question) return renderQuestion(data.question);
    await loadNextQuestion();
  } catch (err) {
    console.error(err);
    hide(loadingPanel);
    show(questionPanel);
    setMessage(answerMessage, 'เชื่อมต่อเกมเดิมไม่ได้ กรุณารีเฟรชอีกครั้ง', 'error');
  }
}

function resetToLogin() {
  localStorage.removeItem(TOKEN_KEY);
  hide(gameView);
  show(setupView);
  hide(lookupResult);
  lookupStudent = null;
  studentCode.value = '';
  clearMessage(setupMessage);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

searchBtn.addEventListener('click', lookup);
studentCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(); });
$('continueBtn').addEventListener('click', continueGame);
$('finishBtn').addEventListener('click', finishGame);
$('leaveDeviceBtn').addEventListener('click', resetToLogin);

restoreState();

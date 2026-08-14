import { supabase } from './supabase-client.js';

const ADMIN_KEY = 'treasure_hunt_admin_password_v1';
const $ = (id) => document.getElementById(id);
let adminPassword = sessionStorage.getItem(ADMIN_KEY) || '';
let students = [];
let questions = [];
let results = [];

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function msg(el, text, type = 'info') { el.textContent = text; el.className = `message ${type}`; show(el); }
function clearMsg(el) { el.textContent = ''; hide(el); }
function status(text) { $('adminStatus').textContent = text; }
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function escapeAttr(value) { return escapeHtml(value).replaceAll('\n', '&#10;'); }

async function callAdmin(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action, ...payload },
    headers: { 'x-admin-password': adminPassword },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || data?.error || 'Admin API error');
  return data;
}

async function login(password) {
  adminPassword = password.trim();
  if (!adminPassword) return msg($('loginMessage'), 'กรุณากรอกรหัสผ่าน', 'error');
  $('adminLoginBtn').disabled = true;
  $('adminLoginBtn').textContent = 'กำลังเข้าสู่ระบบ...';
  clearMsg($('loginMessage'));
  try {
    await callAdmin('login');
    sessionStorage.setItem(ADMIN_KEY, adminPassword);
    hide($('adminLogin')); show($('adminApp'));
    await loadStudents();
  } catch (err) {
    console.error(err);
    adminPassword = '';
    sessionStorage.removeItem(ADMIN_KEY);
    msg($('loginMessage'), 'รหัสผ่านไม่ถูกต้อง หรือเชื่อมต่อระบบไม่ได้', 'error');
  } finally {
    $('adminLoginBtn').disabled = false;
    $('adminLoginBtn').textContent = 'เข้าสู่ระบบ';
  }
}

function logout() {
  adminPassword = '';
  sessionStorage.removeItem(ADMIN_KEY);
  hide($('adminApp')); show($('adminLogin'));
  $('adminPassword').value = '';
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => hide(p));
  show($(`tab-${tab}`));
  if (tab === 'students') loadStudents();
  if (tab === 'questions') loadQuestions();
  if (tab === 'results') loadResults();
}

async function loadStudents() {
  status('กำลังโหลดรายชื่อนักเรียน...');
  try {
    const data = await callAdmin('students.list');
    students = data.rows || [];
    renderStudents();
    status(`นักเรียน ${students.length.toLocaleString('th-TH')} คน`);
  } catch (err) {
    console.error(err); msg($('studentsMessage'), 'โหลดรายชื่อไม่สำเร็จ', 'error'); status('เกิดข้อผิดพลาด');
  }
}

function renderStudents() {
  const q = $('studentSearch').value.trim().toLowerCase();
  const rows = students.filter((s) => {
    const hay = `${s.student_code} ${s.prefix} ${s.first_name} ${s.last_name} ${s.class_name}`.toLowerCase();
    return !q || hay.includes(q);
  });
  $('studentsBody').innerHTML = rows.map((s) => `
    <tr>
      <td><b>${escapeHtml(s.student_code)}</b></td>
      <td>${escapeHtml([s.prefix, s.first_name, s.last_name].filter(Boolean).join(' '))}</td>
      <td>${escapeHtml(s.class_name || '-')}</td>
      <td><span class="status-pill ${s.is_active ? 'completed' : 'ended'}">${s.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">ไม่พบข้อมูล</td></tr>';
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else {
      if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function normalizeHeader(h) { return String(h ?? '').trim().toLowerCase().replaceAll(' ', '_'); }
function headerIndex(headers, names) {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const i = normalized.indexOf(normalizeHeader(name));
    if (i >= 0) return i;
  }
  return -1;
}

async function importStudents() {
  const file = $('studentCsv').files?.[0];
  if (!file) return msg($('studentsMessage'), 'กรุณาเลือกไฟล์ CSV ก่อน', 'error');
  $('importStudentsBtn').disabled = true;
  clearMsg($('studentsMessage'));
  try {
    const parsed = parseCSV(await file.text());
    if (parsed.length < 2) throw new Error('ไฟล์ไม่มีข้อมูลนักเรียน');
    const headers = parsed[0];
    const idx = {
      student_code: headerIndex(headers, ['student_code', 'รหัสนักเรียน', 'รหัส']),
      prefix: headerIndex(headers, ['prefix', 'คำนำหน้า']),
      first_name: headerIndex(headers, ['first_name', 'ชื่อ']),
      last_name: headerIndex(headers, ['last_name', 'นามสกุล']),
      class_name: headerIndex(headers, ['class_name', 'ห้อง', 'ชั้น', 'ชั้นเรียน']),
    };
    if (idx.student_code < 0 || idx.first_name < 0) throw new Error('ต้องมีคอลัมน์ student_code และ first_name');

    const dataRows = parsed.slice(1).map((r) => ({
      student_code: String(r[idx.student_code] ?? '').trim(),
      prefix: idx.prefix >= 0 ? String(r[idx.prefix] ?? '').trim() : '',
      first_name: String(r[idx.first_name] ?? '').trim(),
      last_name: idx.last_name >= 0 ? String(r[idx.last_name] ?? '').trim() : '',
      class_name: idx.class_name >= 0 ? String(r[idx.class_name] ?? '').trim() : '',
      is_active: true,
    })).filter((r) => r.student_code && r.first_name);

    if (!dataRows.length) throw new Error('ไม่พบข้อมูลที่นำเข้าได้');
    let imported = 0;
    for (let i = 0; i < dataRows.length; i += 500) {
      const chunk = dataRows.slice(i, i + 500);
      status(`กำลังนำเข้า ${Math.min(i + chunk.length, dataRows.length)}/${dataRows.length}...`);
      const res = await callAdmin('students.upsert', { rows: chunk });
      imported += Number(res.count || chunk.length);
    }
    msg($('studentsMessage'), `นำเข้าหรืออัปเดตสำเร็จ ${imported.toLocaleString('th-TH')} คน`, 'success');
    $('studentCsv').value = '';
    await loadStudents();
  } catch (err) {
    console.error(err); msg($('studentsMessage'), err.message || 'นำเข้าไม่สำเร็จ', 'error');
  } finally {
    $('importStudentsBtn').disabled = false;
  }
}

function populateSignSelect() {
  if ($('signSelect').options.length) return;
  $('signSelect').innerHTML = Array.from({ length: 43 }, (_, i) => `<option value="${i + 1}">ป้าย ${i + 1}</option>`).join('');
}

async function loadQuestions() {
  populateSignSelect();
  status('กำลังโหลดข้อสอบ...');
  clearMsg($('questionsMessage'));
  try {
    const data = await callAdmin('questions.list');
    questions = data.rows || [];
    renderQuestionEditor();
    const active = questions.filter((q) => q.is_active).length;
    status(`เปิดใช้ ${active}/129 ข้อ`);
  } catch (err) {
    console.error(err); msg($('questionsMessage'), 'โหลดข้อสอบไม่สำเร็จ', 'error'); status('เกิดข้อผิดพลาด');
  }
}

function renderQuestionEditor() {
  const sign = Number($('signSelect').value || 1);
  const rows = [1, 2, 3].map((slot) => questions.find((q) => Number(q.sign_number) === sign && Number(q.question_slot) === slot) || {
    sign_number: sign, question_slot: slot, question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', is_active: false,
  });
  $('questionEditor').innerHTML = rows.map((q) => `
    <article class="question-card" data-slot="${q.question_slot}">
      <div class="question-card-head">
        <strong>ป้าย ${q.sign_number} • คำถามที่ ${q.question_slot}</strong>
        <label class="checkbox-row"><input class="q-active" type="checkbox" ${q.is_active ? 'checked' : ''}> เปิดใช้งาน</label>
      </div>
      <div class="form-field">
        <label>ข้อความคำถาม (สำหรับครูตรวจสอบ — ไม่แสดงในหน้าเกม)</label>
        <textarea class="textarea q-text" placeholder="พิมพ์คำถามที่ติดอยู่บนป้าย...">${escapeHtml(q.question_text || '')}</textarea>
      </div>
      <div class="options-grid" style="margin-top:10px">
        <div class="form-field"><label>ตัวเลือก A</label><input class="input q-a" value="${escapeAttr(q.option_a || '')}"></div>
        <div class="form-field"><label>ตัวเลือก B</label><input class="input q-b" value="${escapeAttr(q.option_b || '')}"></div>
        <div class="form-field"><label>ตัวเลือก C</label><input class="input q-c" value="${escapeAttr(q.option_c || '')}"></div>
        <div class="form-field"><label>ตัวเลือก D</label><input class="input q-d" value="${escapeAttr(q.option_d || '')}"></div>
      </div>
      <div class="form-field" style="margin-top:10px;max-width:220px">
        <label>คำตอบที่ถูกต้อง</label>
        <select class="select q-correct">
          ${['A','B','C','D'].map((x) => `<option value="${x}" ${q.correct_option === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
    </article>`).join('');
}

async function saveQuestions() {
  const sign = Number($('signSelect').value);
  const cards = [...document.querySelectorAll('.question-card')];
  const rows = cards.map((card) => ({
    sign_number: sign,
    question_slot: Number(card.dataset.slot),
    question_text: card.querySelector('.q-text').value.trim(),
    option_a: card.querySelector('.q-a').value.trim(),
    option_b: card.querySelector('.q-b').value.trim(),
    option_c: card.querySelector('.q-c').value.trim(),
    option_d: card.querySelector('.q-d').value.trim(),
    correct_option: card.querySelector('.q-correct').value,
    is_active: card.querySelector('.q-active').checked,
  }));
  const invalid = rows.find((r) => r.is_active && (!r.option_a || !r.option_b || !r.option_c || !r.option_d));
  if (invalid) return msg($('questionsMessage'), `คำถามที่ ${invalid.question_slot}: ถ้าเปิดใช้งาน ต้องกรอกตัวเลือก A–D ให้ครบ`, 'error');

  $('saveQuestionsBtn').disabled = true;
  status(`กำลังบันทึกป้าย ${sign}...`);
  try {
    await callAdmin('questions.upsert', { rows });
    msg($('questionsMessage'), `บันทึกป้าย ${sign} เรียบร้อย`, 'success');
    await loadQuestions();
  } catch (err) {
    console.error(err); msg($('questionsMessage'), err.message || 'บันทึกไม่สำเร็จ', 'error');
  } finally {
    $('saveQuestionsBtn').disabled = false;
  }
}

async function loadResults() {
  status('กำลังโหลดผลการเล่น...');
  clearMsg($('resultsMessage'));
  try {
    const data = await callAdmin('results.list');
    results = data.rows || [];
    renderResults();
    status(`มีผู้เริ่มเกม ${results.length.toLocaleString('th-TH')} คน`);
  } catch (err) {
    console.error(err); msg($('resultsMessage'), 'โหลดผลการเล่นไม่สำเร็จ', 'error'); status('เกิดข้อผิดพลาด');
  }
}

function renderResults() {
  const active = results.filter((r) => r.status === 'active').length;
  const ended = results.filter((r) => r.status === 'ended').length;
  const completed = results.filter((r) => r.status === 'completed').length;
  const avg = results.length ? (results.reduce((s, r) => s + Number(r.correct_count || 0), 0) / results.length).toFixed(1) : '0.0';
  $('statsGrid').innerHTML = `
    <div class="stat-card"><b>${results.length}</b><span>เริ่มเกมทั้งหมด</span></div>
    <div class="stat-card"><b>${active}</b><span>กำลังเล่น</span></div>
    <div class="stat-card"><b>${completed}</b><span>ครบ 25 ข้อ</span></div>
    <div class="stat-card"><b>${avg}</b><span>คะแนนเฉลี่ย</span></div>`;

  $('resultsBody').innerHTML = results.map((r) => {
    const st = r.students || {};
    const name = [st.prefix, st.first_name, st.last_name].filter(Boolean).join(' ');
    const statusText = r.status === 'completed' ? 'รางวัลใหญ่' : r.status === 'ended' ? 'จบเกม' : 'กำลังเล่น';
    const started = r.started_at ? new Date(r.started_at).toLocaleString('th-TH') : '-';
    return `<tr>
      <td><b>${escapeHtml(st.student_code || '')}</b></td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(st.class_name || '-')}</td>
      <td><b>${Number(r.correct_count || 0)}/25</b></td>
      <td>${Number(r.wrong_count || 0)}</td>
      <td>${Number(r.chests_opened || 0)}</td>
      <td><span class="status-pill ${escapeHtml(r.status)}">${statusText}</span></td>
      <td>${escapeHtml(started)}</td>
      <td><button class="btn danger reset-btn" data-code="${escapeAttr(st.student_code || '')}" data-name="${escapeAttr(name)}">รีเซ็ต</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="muted">ยังไม่มีผู้เล่น</td></tr>';

  document.querySelectorAll('.reset-btn').forEach((btn) => btn.addEventListener('click', () => resetSession(btn.dataset.code, btn.dataset.name)));
}

async function resetSession(code, name) {
  if (!confirm(`รีเซ็ตเกมของ ${name || code} ?\nประวัติการเล่นจะถูกลบ และนักเรียนจะเริ่มใหม่ได้`)) return;
  try {
    status(`กำลังรีเซ็ต ${code}...`);
    await callAdmin('session.reset', { student_code: code });
    msg($('resultsMessage'), `รีเซ็ต ${name || code} เรียบร้อย`, 'success');
    await loadResults();
  } catch (err) {
    console.error(err); msg($('resultsMessage'), err.message || 'รีเซ็ตไม่สำเร็จ', 'error');
  }
}

$('adminLoginBtn').addEventListener('click', () => login($('adminPassword').value));
$('adminPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') login($('adminPassword').value); });
$('logoutBtn').addEventListener('click', logout);
document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('refreshStudentsBtn').addEventListener('click', loadStudents);
$('studentSearch').addEventListener('input', renderStudents);
$('importStudentsBtn').addEventListener('click', importStudents);
$('refreshQuestionsBtn').addEventListener('click', loadQuestions);
$('signSelect').addEventListener('change', renderQuestionEditor);
$('saveQuestionsBtn').addEventListener('click', saveQuestions);
$('refreshResultsBtn').addEventListener('click', loadResults);

populateSignSelect();
if (adminPassword) login(adminPassword);

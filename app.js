// ============================================================
// app.js — JG Lucknow Study Planner (Fixed Version)
// ============================================================

import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, setDoc, getDoc, getDocs,
  addDoc, updateDoc, deleteDoc, query,
  where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────────────────────────
let currentUser = null;
let scheduleChart = null;
let progressChart = null;
let monthlyChart = null;
let activeSection = 'dashboard';

const QUOTES = [
  { text: "Justice is the constant and perpetual will to allot to every man his due.", author: "Justinian I" },
  { text: "The law is reason, free from passion.", author: "Aristotle" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" }
];

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '✓'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

function today() {
  return formatDate(new Date());
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date(today());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const LS = {
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} },
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; } }
};

function loadQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const el = document.getElementById('daily-quote');
  if (el) {
    el.querySelector('.quote-text').textContent = `"${q.text}"`;
    el.querySelector('.quote-author').textContent = `— ${q.author}`;
  }
}

// ─────────────────────────────────────────────────────────────
// AUTH FUNCTIONS
// ─────────────────────────────────────────────────────────────
async function registerUser(name, email, password) {
  let cred = null;

  // Step 1 — Create Firebase Auth account
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
    return false;
  }

  // Step 2 — Set display name (non-critical)
  try {
    await updateProfile(cred.user, { displayName: name });
  } catch (err) {
    console.warn('Display name update failed:', err.message);
  }

  // Step 3 — Create Firestore profile (non-critical)
  try {
    await setDoc(doc(db, 'users', cred.user.uid), {
      name: name,
      email: email,
      createdAt: serverTimestamp(),
      theme: 'dark'
    });
  } catch (err) {
    console.warn('Firestore profile creation failed:', err.message);
  }

  showToast('Account created! Welcome aboard 🎉', 'success');
  return true;
}

async function loginUser(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast('Welcome back! Ready to study? 📚', 'success');
    return true;
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
    return false;
  }
}

async function logoutUser() {
  await signOut(auth);
  showToast('Logged out. Keep studying! 💪', 'info');
}

async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Password reset email sent!', 'success');
    return true;
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
    return false;
  }
}

function getAuthError(code) {
  const errors = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.'
  };
  return errors[code] || `Error: ${code}`;
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (!currentUser) return;
  loadQuote();

  const name = currentUser.displayName || 'Aspirant';
  const el = document.getElementById('user-greeting');
  if (el) el.textContent = `Welcome back, ${name.split(' ')[0]}! 👋`;

  await loadTodaysTasks();
  await loadUpcomingExamsPreview();
  await loadTodayProgress();
  await loadLatestScores();
}

async function loadTodaysTasks() {
  const container = document.getElementById('todays-tasks');
  if (!container) return;
  try {
    const q = query(
      collection(db, 'users', currentUser.uid, 'schedules'),
      where('date', '==', today())
    );
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (tasks.length === 0) {
      container.innerHTML = '<p class="empty-msg">No tasks for today. <a href="#" onclick="switchSection(\'schedule\')">Add some!</a></p>';
      return;
    }
    tasks.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    container.innerHTML = tasks.map(t => `
      <div class="task-item ${t.completed ? 'task-done' : ''} priority-${t.priority || 'medium'}">
        <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTask('${t.id}', this.checked)" />
        <div class="task-info">
          <span class="task-subject">${t.subject || ''}</span>
          <span class="task-topic">${t.topic || ''}</span>
        </div>
        <span class="task-time">${t.startTime || ''} – ${t.endTime || ''}</span>
      </div>`).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty-msg">Could not load tasks.</p>';
    console.error('loadTodaysTasks error:', e);
  }
}

async function loadUpcomingExamsPreview() {
  const container = document.getElementById('upcoming-exams-preview');
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'exams'));
    const exams = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(e => daysUntil(e.date) >= 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
    if (exams.length === 0) {
      container.innerHTML = '<p class="empty-msg">No upcoming exams.</p>';
      return;
    }
    container.innerHTML = exams.map(e => {
      const d = daysUntil(e.date);
      return `<div class="exam-preview-card">
        <div class="exam-preview-info">
          <strong>${e.name}</strong>
          <span class="exam-stage badge badge-${e.stage?.toLowerCase()}">${e.stage || 'Prelims'}</span>
        </div>
        <div class="exam-countdown ${d <= 7 ? 'urgent' : ''}">${d === 0 ? 'TODAY!' : d === 1 ? 'Tomorrow' : `${d} days`}</div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty-msg">Could not load exams.</p>';
  }
}

async function loadTodayProgress() {
  try {
    const q = query(
      collection(db, 'users', currentUser.uid, 'schedules'),
      where('date', '==', today())
    );
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => d.data());
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const el = document.getElementById('today-progress-pct');
    const bar = document.getElementById('today-progress-bar');
    const label = document.getElementById('today-progress-label');
    const labelBar = document.getElementById('today-progress-label-bar');

    if (el) el.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `${done}/${total} tasks completed`;
    if (labelBar) labelBar.textContent = `${done}/${total} tasks completed today`;
  } catch (e) {
    console.error('loadTodayProgress error:', e);
  }
}

async function loadLatestScores() {
  const container = document.getElementById('latest-scores');
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'prelims_tests'));
    const tests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);
    if (tests.length === 0) {
      container.innerHTML = '<p class="empty-msg">No mock tests recorded yet.</p>';
      return;
    }
    container.innerHTML = tests.map(t => {
      const pct = t.total > 0 ? Math.round((t.obtained / t.total) * 100) : 0;
      return `<div class="score-card">
        <div class="score-info">
          <strong>${t.name || 'Mock Test'}</strong>
          <span class="score-date">${t.date || ''}</span>
        </div>
        <div class="score-result">
          <span class="score-pct ${pct >= 60 ? 'good' : pct >= 40 ? 'average' : 'poor'}">${pct}%</span>
          <span class="score-raw">${t.obtained}/${t.total}</span>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty-msg">Could not load scores.</p>';
  }
}

// ─────────────────────────────────────────────────────────────
// SCHEDULE
// ─────────────────────────────────────────────────────────────
async function loadSchedule(filter = 'today') {
  const container = document.getElementById('schedule-list');
  if (!container) return;
  const now = new Date();
  let q;

  if (filter === 'today') {
    q = query(collection(db, 'users', currentUser.uid, 'schedules'), where('date', '==', today()));
  } else if (filter === 'week') {
    const end = formatDate(new Date(now.getTime() + 7 * 86400000));
    q = query(collection(db, 'users', currentUser.uid, 'schedules'), where('date', '>=', today()), where('date', '<=', end));
  } else if (filter === 'month') {
    const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()));
    q = query(collection(db, 'users', currentUser.uid, 'schedules'), where('date', '>=', today()), where('date', '<=', end));
  } else {
    q = query(collection(db, 'users', currentUser.uid, 'schedules'), orderBy('date', 'desc'));
  }

  try {
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));

    if (tasks.length === 0) {
      container.innerHTML = '<p class="empty-msg">No tasks found. Add a new task above!</p>';
      return;
    }

    const grouped = {};
    tasks.forEach(t => { (grouped[t.date] = grouped[t.date] || []).push(t); });

    container.innerHTML = Object.entries(grouped).map(([date, items]) => `
      <div class="schedule-date-group">
        <h4 class="date-header">${formatDisplayDate(date)}</h4>
        ${items.map(t => `
          <div class="schedule-item ${t.completed ? 'completed' : ''}" id="task-${t.id}">
            <div class="schedule-item-left">
              <input type="checkbox" class="task-checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTask('${t.id}', this.checked)" />
              <div class="schedule-item-info">
                <span class="sched-subject ${t.category === 'law' ? 'cat-law' : 'cat-gk'}">${t.subject || '—'}</span>
                <span class="sched-topic">${t.topic || '—'}</span>
                <div class="sched-meta">
                  <span>⏰ ${t.startTime || '?'} – ${t.endTime || '?'}</span>
                  <span class="priority-badge p-${t.priority || 'medium'}">${(t.priority || 'medium').toUpperCase()}</span>
                </div>
              </div>
            </div>
            <div class="schedule-item-actions">
              <button class="btn-icon" onclick="openEditTask('${t.id}')" title="Edit">✏️</button>
              <button class="btn-icon btn-del" onclick="deleteTask('${t.id}')" title="Delete">🗑️</button>
            </div>
          </div>`).join('')}
      </div>`).join('');
  } catch (e) {
    container.innerHTML = `<p class="empty-msg">Error: ${e.message}</p>`;
    console.error('loadSchedule error:', e);
  }
}

function formatDisplayDate(dateStr) {
  if (dateStr === today()) return '📅 Today';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getDateRange(startStr, endStr) {
  const dates = [];
  let current = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function saveTask(taskData, taskId = null) {
  try {
    const colRef = collection(db, 'users', currentUser.uid, 'schedules');
    if (taskId) {
      await updateDoc(doc(db, 'users', currentUser.uid, 'schedules', taskId), { ...taskData, updatedAt: serverTimestamp() });
      showToast('Task updated!', 'success');
    } else if (taskData.planType === 'weekly' || taskData.planType === 'monthly') {
      const dates = getDateRange(taskData.startDate, taskData.endDate);
      if (dates.length === 0) { showToast('Invalid date range.', 'error'); return; }
      if (dates.length > 60) { showToast('Range too large. Max 60 days.', 'warning'); return; }
      await Promise.all(dates.map(date => addDoc(colRef, {
        subject: taskData.subject, topic: taskData.topic, date,
        startTime: taskData.startTime, endTime: taskData.endTime,
        priority: taskData.priority, category: taskData.category,
        planType: taskData.planType, completed: false,
        createdAt: serverTimestamp(), userId: currentUser.uid
      })));
      showToast(`✅ ${dates.length} tasks created!`, 'success');
    } else {
      await addDoc(colRef, { ...taskData, completed: false, createdAt: serverTimestamp(), userId: currentUser.uid });
      showToast('Task added!', 'success');
    }
    closeModal('task-modal');
    loadSchedule(document.querySelector('.filter-btn.active')?.dataset.filter || 'today');
    if (activeSection === 'dashboard') loadTodaysTasks();
  } catch (e) {
    showToast('Failed to save task: ' + e.message, 'error');
    console.error('saveTask error:', e);
  }
}

async function toggleTask(taskId, completed) {
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'schedules', taskId), { completed });
    if (activeSection === 'dashboard') { loadTodaysTasks(); loadTodayProgress(); }
    if (activeSection === 'schedule') loadTodayProgress();
  } catch (e) { showToast('Could not update task.', 'error'); }
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'schedules', taskId));
    showToast('Task deleted.', 'info');
    loadSchedule(document.querySelector('.filter-btn.active')?.dataset.filter || 'today');
  } catch { showToast('Could not delete task.', 'error'); }
}

// ─────────────────────────────────────────────────────────────
// EXAMS
// ─────────────────────────────────────────────────────────────
async function loadExams() {
  const container = document.getElementById('exams-list');
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'exams'));
    const exams = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (exams.length === 0) {
      container.innerHTML = '<p class="empty-msg">No exams added yet.</p>';
      return;
    }
    container.innerHTML = exams.map(e => {
      const d = daysUntil(e.date);
      const isPast = d < 0;
      return `<div class="exam-card ${isPast ? 'past-exam' : ''}">
        <div class="exam-card-header">
          <div>
            <h3 class="exam-name">${e.name}</h3>
            <span class="badge badge-${e.stage?.toLowerCase()}">${e.stage || 'Prelims'}</span>
          </div>
          <button class="btn-icon" onclick="deleteExam('${e.id}')">🗑️</button>
        </div>
        <div class="exam-card-body">
          <div class="exam-date">📅 ${new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div class="exam-countdown-big ${d <= 7 && !isPast ? 'urgent' : ''}">
            ${isPast ? '✅ Completed' : d === 0 ? '🔔 TODAY!' : `⏳ ${d} day${d !== 1 ? 's' : ''} to go`}
          </div>
          ${e.notes ? `<p class="exam-notes">${e.notes}</p>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty-msg">Could not load exams.</p>';
  }
}

async function saveExam(examData) {
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'exams'), { ...examData, createdAt: serverTimestamp() });
    showToast('Exam added!', 'success');
    closeModal('exam-modal');
    loadExams();
    loadUpcomingExamsPreview();
  } catch (e) { showToast('Failed to save exam.', 'error'); }
}

async function deleteExam(id) {
  if (!confirm('Remove this exam?')) return;
  await deleteDoc(doc(db, 'users', currentUser.uid, 'exams', id));
  showToast('Exam removed.', 'info');
  loadExams();
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────
async function loadTests() {
  await loadPrelimsTests();
  await loadMainsTests();
}

async function loadPrelimsTests() {
  const container = document.getElementById('prelims-list');
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'prelims_tests'));
    const tests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (tests.length === 0) { container.innerHTML = '<p class="empty-msg">No prelims tests recorded yet.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Test Name</th><th>Date</th><th>Marks</th><th>Score</th><th>Accuracy</th><th>Actions</th></tr></thead>
        <tbody>${tests.map(t => {
          const pct = t.total > 0 ? Math.round((t.obtained / t.total) * 100) : 0;
          return `<tr>
            <td>${t.name || '—'}</td><td>${t.date || '—'}</td>
            <td>${t.obtained}/${t.total}</td>
            <td><div class="mini-bar"><div class="mini-fill ${pct >= 60 ? 'good' : pct >= 40 ? 'avg' : 'poor'}" style="width:${pct}%"></div></div></td>
            <td>${t.accuracy || pct}%</td>
            <td><button class="btn-icon btn-del" onclick="deleteTest('prelims_tests','${t.id}')">🗑️</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch (e) { container.innerHTML = '<p class="empty-msg">Could not load tests.</p>'; }
}

async function loadMainsTests() {
  const container = document.getElementById('mains-list');
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'mains_tests'));
    const tests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (tests.length === 0) { container.innerHTML = '<p class="empty-msg">No mains tests recorded yet.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Subject</th><th>Date</th><th>Marks</th><th>Score</th><th>Remarks</th><th>Actions</th></tr></thead>
        <tbody>${tests.map(t => {
          const pct = t.total > 0 ? Math.round((t.obtained / t.total) * 100) : 0;
          return `<tr>
            <td>${t.subject || '—'}</td><td>${t.date || '—'}</td>
            <td>${t.obtained}/${t.total}</td>
            <td><div class="mini-bar"><div class="mini-fill ${pct >= 60 ? 'good' : pct >= 40 ? 'avg' : 'poor'}" style="width:${pct}%"></div></div></td>
            <td>${t.remarks || '—'}</td>
            <td><button class="btn-icon btn-del" onclick="deleteTest('mains_tests','${t.id}')">🗑️</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch (e) { container.innerHTML = '<p class="empty-msg">Could not load tests.</p>'; }
}

async function savePrelimsTest(data) {
  try {
    const pct = data.total > 0 ? Math.round((data.obtained / data.total) * 100) : 0;
    await addDoc(collection(db, 'users', currentUser.uid, 'prelims_tests'), { ...data, accuracy: pct, createdAt: serverTimestamp() });
    showToast('Prelims score saved!', 'success');
    closeModal('prelims-modal');
    loadPrelimsTests();
    loadLatestScores();
  } catch (e) { showToast('Failed to save score.', 'error'); }
}

async function saveMainsTest(data) {
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'mains_tests'), { ...data, createdAt: serverTimestamp() });
    showToast('Mains score saved!', 'success');
    closeModal('mains-modal');
    loadMainsTests();
  } catch (e) { showToast('Failed to save score.', 'error'); }
}

async function deleteTest(coll, id) {
  if (!confirm('Delete this test record?')) return;
  await deleteDoc(doc(db, 'users', currentUser.uid, coll, id));
  showToast('Record deleted.', 'info');
  loadTests();
}

// ─────────────────────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────────────────────
async function loadProgress() {
  try {
    const pSnap = await getDocs(collection(db, 'users', currentUser.uid, 'prelims_tests'));
    const pTests = pSnap.docs.map(d => d.data());
    const mSnap = await getDocs(collection(db, 'users', currentUser.uid, 'mains_tests'));
    const mTests = mSnap.docs.map(d => d.data());
    const sSnap = await getDocs(collection(db, 'users', currentUser.uid, 'schedules'));
    const tasks = sSnap.docs.map(d => d.data());

    const totalTests = pTests.length + mTests.length;
    const avgScore = pTests.length > 0
      ? Math.round(pTests.reduce((s, t) => s + (t.total > 0 ? (t.obtained / t.total) * 100 : 0), 0) / pTests.length) : 0;
    const completionPct = tasks.length > 0
      ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0;

    const el = id => document.getElementById(id);
    if (el('stat-total-tests')) el('stat-total-tests').textContent = totalTests;
    if (el('stat-avg-score')) el('stat-avg-score').textContent = `${avgScore}%`;
    if (el('stat-completion')) el('stat-completion').textContent = `${completionPct}%`;
    if (el('stat-prelims-count')) el('stat-prelims-count').textContent = pTests.length;
    if (el('completion-bar')) el('completion-bar').style.width = `${completionPct}%`;
    if (el('completion-label')) el('completion-label').textContent = `${completionPct}% schedule completed`;

    buildSubjectChart(mTests);
    buildMonthlyChart(pTests);
    generateSWOT(pTests, mTests, completionPct);
  } catch (e) {
    showToast('Could not load progress.', 'error');
    console.error('loadProgress error:', e);
  }
}

function buildSubjectChart(mTests) {
  const ctx = document.getElementById('subject-chart')?.getContext('2d');
  if (!ctx) return;
  const subjects = {};
  mTests.forEach(t => {
    if (!subjects[t.subject]) subjects[t.subject] = { total: 0, obtained: 0 };
    subjects[t.subject].total += Number(t.total) || 0;
    subjects[t.subject].obtained += Number(t.obtained) || 0;
  });
  const labels = Object.keys(subjects);
  const data = labels.map(s => subjects[s].total > 0 ? Math.round((subjects[s].obtained / subjects[s].total) * 100) : 0);
  const colors = data.map(v => v >= 60 ? '#22c55e' : v >= 40 ? '#f59e0b' : '#ef4444');
  if (scheduleChart) scheduleChart.destroy();
  scheduleChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels.length > 0 ? labels : ['No data'], datasets: [{ label: 'Score %', data: data.length > 0 ? data : [0], backgroundColor: colors.length > 0 ? colors : ['#6b7280'], borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: '#1e293b' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
  });
}

function buildMonthlyChart(pTests) {
  const ctx = document.getElementById('monthly-chart')?.getContext('2d');
  if (!ctx) return;
  const monthly = {};
  pTests.forEach(t => {
    if (!t.date) return;
    const month = t.date.substring(0, 7);
    if (!monthly[month]) monthly[month] = { total: 0, obtained: 0 };
    monthly[month].total += Number(t.total) || 0;
    monthly[month].obtained += Number(t.obtained) || 0;
  });
  const sortedMonths = Object.keys(monthly).sort();
  const labels = sortedMonths.map(m => { const [y, mo] = m.split('-'); return new Date(y, mo - 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' }); });
  const data = sortedMonths.map(m => monthly[m].total > 0 ? Math.round((monthly[m].obtained / monthly[m].total) * 100) : 0);
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'line',
    data: { labels: labels.length > 0 ? labels : ['No data'], datasets: [{ label: 'Avg Score %', data: data.length > 0 ? data : [0], borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)', fill: true, tension: 0.4, pointBackgroundColor: '#6366f1', pointRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: '#1e293b' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
  });
}

function generateSWOT(pTests, mTests, completionPct) {
  const strengths = [], weaknesses = [], opportunities = [], threats = [];
  const subjects = {};
  mTests.forEach(t => {
    if (!subjects[t.subject]) subjects[t.subject] = { total: 0, obtained: 0 };
    subjects[t.subject].total += Number(t.total) || 0;
    subjects[t.subject].obtained += Number(t.obtained) || 0;
  });
  Object.entries(subjects).forEach(([sub, data]) => {
    const pct = data.total > 0 ? Math.round((data.obtained / data.total) * 100) : 0;
    if (pct >= 65) strengths.push(`Strong in <strong>${sub}</strong> (${pct}%)`);
    else if (pct < 45) weaknesses.push(`Needs work in <strong>${sub}</strong> (${pct}%)`);
  });
  const avgPrelims = pTests.length > 0 ? Math.round(pTests.reduce((s, t) => s + (t.total > 0 ? (t.obtained / t.total) * 100 : 0), 0) / pTests.length) : 0;
  if (avgPrelims >= 60) strengths.push(`Good prelims average: <strong>${avgPrelims}%</strong>`);
  else if (avgPrelims > 0) weaknesses.push(`Prelims average needs work: <strong>${avgPrelims}%</strong>`);
  if (completionPct >= 70) strengths.push(`Great schedule adherence: <strong>${completionPct}%</strong>`);
  else if (completionPct < 40) weaknesses.push(`Low schedule completion: <strong>${completionPct}%</strong>`);
  opportunities.push('Consistent daily practice leads to exponential improvement');
  opportunities.push('Focus on high-weightage constitutional law topics');
  if (completionPct < 50) threats.push('Inconsistent schedule may hamper preparation');
  if (avgPrelims < 50 && pTests.length > 0) threats.push('Prelims cutoff is competitive — increase test frequency');
  threats.push('Avoid burnout — maintain work-life balance');
  if (strengths.length === 0) strengths.push('Keep adding test scores to track strengths!');
  if (weaknesses.length === 0) weaknesses.push('No weak areas detected yet.');
  const render = (id, items, icon) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = items.map(i => `<li>${icon} ${i}</li>`).join('');
  };
  render('swot-strengths', strengths, '💪');
  render('swot-weaknesses', weaknesses, '⚠️');
  render('swot-opportunities', opportunities, '🚀');
  render('swot-threats', threats, '🔴');
}

// ─────────────────────────────────────────────────────────────
// INBOX
// ─────────────────────────────────────────────────────────────
async function loadInbox() {
  const container = document.getElementById('inbox-list');
  if (!container || !currentUser) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', currentUser.uid, 'messages'), orderBy('createdAt', 'desc'))
    );
    if (snap.empty) { container.innerHTML = '<p class="empty-msg">No messages from faculty yet.</p>'; return; }
    const typeIcons = { feedback: '📋', warning: '⚠️', praise: '🌟', task: '📌', announcement: '📣', reminder: '⏰', motivation: '💪' };
    container.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-IN') : '—';
      return `<div class="card" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">${typeIcons[m.msgType] || '💬'}</span>
            <div>
              <div style="font-weight:700;font-size:15px">${m.subject || 'Message'}</div>
              <div style="font-size:12px;color:var(--text-muted)">From: ${m.fromName || 'Faculty'} • ${time}</div>
            </div>
          </div>
          ${m.isBroadcast ? '<span style="font-size:11px;padding:3px 8px;border-radius:10px;background:var(--accent-light);color:var(--accent)">Broadcast</span>' : ''}
        </div>
        <p style="font-size:14px;color:var(--text-secondary);line-height:1.7">${m.message || ''}</p>
      </div>`;
    }).join('');
    const badge = document.getElementById('inbox-badge');
    if (badge) { badge.textContent = snap.size; badge.style.display = snap.size > 0 ? 'inline' : 'none'; }
  } catch (e) {
    container.innerHTML = `<p class="empty-msg">Could not load messages: ${e.message}</p>`;
  }
}

// ─────────────────────────────────────────────────────────────
// UI / NAVIGATION
// ─────────────────────────────────────────────────────────────
window.switchSection = function(sectionId) {
  activeSection = sectionId;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${sectionId}`)?.classList.add('active');
  document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');
  document.getElementById('sidebar')?.classList.remove('open');
  switch (sectionId) {
    case 'dashboard': loadDashboard(); break;
    case 'schedule': loadSchedule('today'); break;
    case 'exams': loadExams(); break;
    case 'tests': loadTests(); break;
    case 'progress': loadProgress(); break;
    case 'inbox': loadInbox(); break;
  }
};

window.openModal = function(id) { document.getElementById(id)?.classList.add('active'); };
window.closeModal = function(id) {
  document.getElementById(id)?.classList.remove('active');
  const form = document.querySelector(`#${id} form`);
  if (form) form.reset();
};

window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.deleteExam = deleteExam;
window.deleteTest = deleteTest;

window.openEditTask = async function(taskId) {
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'schedules', taskId));
    if (!snap.exists()) return;
    const t = snap.data();
    const form = document.getElementById('task-form');
    form.querySelector('[name="subject"]').value = t.subject || '';
    form.querySelector('[name="topic"]').value = t.topic || '';
    form.querySelector('[name="date"]').value = t.date || '';
    form.querySelector('[name="startTime"]').value = t.startTime || '';
    form.querySelector('[name="endTime"]').value = t.endTime || '';
    form.querySelector('[name="priority"]').value = t.priority || 'medium';
    form.querySelector('[name="category"]').value = t.category || 'law';
    form.dataset.editId = taskId;
    document.getElementById('task-modal-title').textContent = 'Edit Task';
    openModal('task-modal');
  } catch { showToast('Could not load task.', 'error'); }
};

window.setPlanType = function(type) {
  document.querySelectorAll('.plan-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === type));
  const singleDate = document.getElementById('field-single-date');
  const rangeDate = document.getElementById('field-date-range');
  const hint = document.getElementById('range-hint');
  const dateInput = document.querySelector('#task-form [name="date"]');
  const startInput = document.querySelector('#task-form [name="startDate"]');
  const endInput = document.querySelector('#task-form [name="endDate"]');
  if (type === 'daily') {
    singleDate.style.display = 'block'; rangeDate.style.display = 'none';
    dateInput.required = true;
    if (startInput) startInput.required = false;
    if (endInput) endInput.required = false;
  } else {
    singleDate.style.display = 'none'; rangeDate.style.display = 'block';
    dateInput.required = false;
    if (startInput) startInput.required = true;
    if (endInput) endInput.required = true;
    if (hint) hint.textContent = type === 'weekly' ? '📌 Tasks created for each day of the week range' : '📌 Tasks created for each day of the month range';
  }
};

// ─────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  LS.set('theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = isLight ? '🌙' : '☀️';
}

function applyStoredTheme() {
  if (LS.get('theme') === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = '🌙';
  }
}

// ─────────────────────────────────────────────────────────────
// AUTH VIEWS
// ─────────────────────────────────────────────────────────────
function showAuthView(view) {
  document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`auth-${view}`)?.classList.add('active');
}

function showApp(user) {
  currentUser = user;
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  document.getElementById('user-name-display').textContent = user.displayName || user.email;
  switchSection('dashboard');
}

function showAuth() {
  currentUser = null;
  document.getElementById('auth-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  showAuthView('login');
}

// ─────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────
async function exportProgressPDF() {
  showToast('Generating PDF...', 'info');
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    pdf.setFontSize(20); pdf.setTextColor(99, 102, 241);
    pdf.text('JG Lucknow Study Planner', 20, 20);
    pdf.setFontSize(12); pdf.setTextColor(50, 50, 50);
    pdf.text(`Progress Report — ${currentUser?.displayName || ''}`, 20, 30);
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 20, 38);
    pdf.setFontSize(10);
    pdf.text(`Total Tests: ${document.getElementById('stat-total-tests')?.textContent || '—'}`, 20, 55);
    pdf.text(`Average Score: ${document.getElementById('stat-avg-score')?.textContent || '—'}`, 20, 63);
    pdf.text(`Schedule Completion: ${document.getElementById('stat-completion')?.textContent || '—'}`, 20, 71);
    pdf.save('JG_Progress_Report.pdf');
    showToast('PDF downloaded!', 'success');
  } catch (e) {
    showToast('PDF export failed.', 'error');
  }
}

// ─────────────────────────────────────────────────────────────
// FORMS SETUP
// ─────────────────────────────────────────────────────────────
function setupForms() {

  // LOGIN
  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const password = f.password.value;
    if (!email || !password) { showToast('Please enter email and password.', 'error'); return; }
    const btn = f.querySelector('button[type="submit"]');
    btn.textContent = 'Signing in...'; btn.disabled = true;
    try { await loginUser(email, password); }
    finally { btn.textContent = 'Sign In →'; btn.disabled = false; }
  });

  // REGISTER
  document.getElementById('register-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    const email = f.email.value.trim();
    const password = f.password.value;
    const confirm = f.confirmPassword.value;
    if (!name) { showToast('Please enter your full name.', 'error'); return; }
    if (!email) { showToast('Please enter your email.', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
    if (password !== confirm) { showToast('Passwords do not match.', 'error'); return; }
    const btn = f.querySelector('button[type="submit"]');
    btn.textContent = 'Creating account...'; btn.disabled = true;
    try { await registerUser(name, email, password); }
    finally { btn.textContent = 'Create Account →'; btn.disabled = false; }
  });

  // FORGOT PASSWORD
  document.getElementById('forgot-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const success = await resetPassword(e.target.email.value.trim());
    if (success) showAuthView('login');
  });

  // LOGOUT
  document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

  // TASK FORM
  document.getElementById('task-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const editId = f.dataset.editId || null;
    const planType = document.querySelector('.plan-type-btn.active')?.dataset.type || 'daily';
    if (!editId && (planType === 'weekly' || planType === 'monthly')) {
      if (!f.startDate.value || !f.endDate.value) { showToast('Please select start and end dates.', 'error'); return; }
      if (new Date(f.startDate.value) > new Date(f.endDate.value)) { showToast('Start date must be before end date.', 'error'); return; }
    } else {
      if (!f.date.value) { showToast('Please select a date.', 'error'); return; }
    }
    await saveTask({
      subject: f.subject.value.trim(), topic: f.topic.value.trim(),
      date: f.date.value || f.startDate?.value || '',
      startDate: f.startDate?.value || '', endDate: f.endDate?.value || '',
      startTime: f.startTime.value, endTime: f.endTime.value,
      priority: f.priority.value, category: f.category.value, planType
    }, editId);
    delete f.dataset.editId;
    document.getElementById('task-modal-title').textContent = 'Add New Task';
    setPlanType('daily');
  });

  // EXAM FORM
  document.getElementById('exam-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    await saveExam({ name: f.examName.value.trim(), date: f.examDate.value, stage: f.stage.value, notes: f.notes.value.trim() });
  });

  // PRELIMS FORM
  document.getElementById('prelims-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    await savePrelimsTest({ name: f.testName.value.trim(), total: Number(f.total.value), obtained: Number(f.obtained.value), date: f.date.value });
  });

  // MAINS FORM
  document.getElementById('mains-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    await saveMainsTest({ subject: f.subject.value.trim(), total: Number(f.total.value), obtained: Number(f.obtained.value), date: f.date.value, remarks: f.remarks.value.trim() });
  });

  // FILTER BUTTONS
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadSchedule(btn.dataset.filter);
    });
  });

  // SIDEBAR TOGGLE
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  // THEME
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // NAV
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchSection(item.dataset.section));
  });

  // AUTH SWITCHERS
  document.getElementById('go-register')?.addEventListener('click', () => showAuthView('register'));
  document.getElementById('go-login')?.addEventListener('click', () => showAuthView('login'));
  document.getElementById('go-forgot')?.addEventListener('click', () => showAuthView('forgot'));
  document.getElementById('back-to-login')?.addEventListener('click', () => showAuthView('login'));

  // SEARCH
  document.getElementById('schedule-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.schedule-item').forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // TABS
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab)?.classList.add('active');
    });
  });

  // PDF EXPORT
  document.getElementById('export-pdf-btn')?.addEventListener('click', exportProgressPDF);

  // CLOSE MODAL ON OVERLAY CLICK
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  setupForms();
  const taskDateInput = document.querySelector('#task-form [name="date"]');
  if (taskDateInput) taskDateInput.value = today();
  onAuthStateChanged(auth, user => {
    if (user) showApp(user);
    else showAuth();
  });
});
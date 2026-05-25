// ============================================================
// app.js — JG Lucknow Study Planner (Main Application Logic)
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
  where, orderBy, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────────────────────────
let currentUser = null;
let scheduleChart = null;
let progressChart = null;
let monthlyChart = null;
let activeSection = 'dashboard';
let unsubscribers = []; // Firestore listeners to clean up on logout

// Motivational quotes for judiciary aspirants
const QUOTES = [
  { text: "Justice is the constant and perpetual will to allot to every man his due.", author: "Justinian I" },
  { text: "The law is reason, free from passion.", author: "Aristotle" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "A lawyer without history or literature is a mechanic, a mere working mason.", author: "Walter Scott" },
  { text: "Study hard, for the well is deep and our brains are shallow.", author: "Richard Baxter" },
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Do not wait to strike till the iron is hot, but make it hot by striking.", author: "William Butler Yeats" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Lawyers are the only persons in whom ignorance of the law is not punished.", author: "Jeremy Bentham" }
];

// ─────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────

/** Show toast notification */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
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

/** Format date to YYYY-MM-DD */
function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

/** Get today's date string */
function today() { return formatDate(new Date()); }

/** Countdown days from today to a future date */
function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date(today());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Local storage helpers (backup) */
const LS = {
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} },
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; } }
};

/** Save random daily quote */
function loadQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const el = document.getElementById('daily-quote');
  if (el) {
    el.querySelector('.quote-text').textContent = `"${q.text}"`;
    el.querySelector('.quote-author').textContent = `— ${q.author}`;
  }
}

/** Calculate study streak from schedule completions */
async function calculateStreak() {
  if (!currentUser) return 0;
  try {
    const q = query(
      collection(db, 'users', currentUser.uid, 'schedules'),
      where('completed', '==', true),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    const dates = [...new Set(snap.docs.map(d => d.data().date))].sort().reverse();
    let streak = 0;
    let checkDate = today();
    for (const d of dates) {
      if (d === checkDate) { streak++; checkDate = formatDate(new Date(new Date(checkDate) - 86400000)); }
      else if (d < checkDate) break;
    }
    return streak;
  } catch { return 0; }
}

// ─────────────────────────────────────────────────────────────
// AUTH FUNCTIONS
// ─────────────────────────────────────────────────────────────

/** Register new user */
async function registerUser(name, email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // Create user profile doc in Firestore
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, email,
      createdAt: serverTimestamp(),
      theme: 'dark'
    });
    showToast('Account created successfully! Welcome aboard 🎉', 'success');
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
    throw err;
  }
}

/** Login user */
async function loginUser(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast('Welcome back! Ready to study? 📚', 'success');
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
    throw err;
  }
}

/** Logout user */
async function logoutUser() {
  unsubscribers.forEach(fn => fn()); // clean up Firestore listeners
  unsubscribers = [];
  await signOut(auth);
  showToast('Logged out. Keep studying! 💪', 'info');
}

/** Send password reset email */
async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Password reset email sent! Check your inbox.', 'success');
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
    throw err;
  }
}

/** Convert Firebase auth error codes to user-friendly messages */
function getAuthError(code) {
  const errors = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.'
  };
  return errors[code] || 'Something went wrong. Please try again.';
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────

async function loadDashboard() {
  if (!currentUser) return;

  loadQuote();

  // Update user greeting
  const name = currentUser.displayName || 'Aspirant';
  const el = document.getElementById('user-greeting');
  if (el) el.textContent = `Welcome back, ${name.split(' ')[0]}! 👋`;

  // Load today's tasks
  await loadTodaysTasks();

  // Load upcoming exams
  await loadUpcomingExamsPreview();

  // Load streak
  const streak = await calculateStreak();
  const streakEl = document.getElementById('streak-count');
  if (streakEl) streakEl.textContent = streak;

  // Load today's progress
  await loadTodayProgress();

  // Load latest mock scores
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
      container.innerHTML = '<p class="empty-msg">No upcoming exams. <a href="#" onclick="switchSection(\'exams\')">Add one!</a></p>';
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
  } catch { container.innerHTML = '<p class="empty-msg">Could not load exams.</p>'; }
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
    if (el) el.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `${done}/${total} tasks completed`;
  } catch {}
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
  } catch { container.innerHTML = '<p class="empty-msg">Could not load scores.</p>'; }
}

// ─────────────────────────────────────────────────────────────
// SCHEDULE PLANNER
// ─────────────────────────────────────────────────────────────

async function loadSchedule(filter = 'today') {
  const container = document.getElementById('schedule-list');
  if (!container) return;

  let q;
  const now = new Date();

  if (filter === 'today') {
    q = query(collection(db, 'users', currentUser.uid, 'schedules'), where('date', '==', today()));
  } else if (filter === 'week') {
    const start = today();
    const end = formatDate(new Date(now.getTime() + 7 * 86400000));
    q = query(
      collection(db, 'users', currentUser.uid, 'schedules'),
      where('date', '>=', start),
      where('date', '<=', end)
    );
  } else if (filter === 'month') {
    const start = today();
    const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()));
    q = query(
      collection(db, 'users', currentUser.uid, 'schedules'),
      where('date', '>=', start),
      where('date', '<=', end)
    );
  } else {
    q = query(collection(db, 'users', currentUser.uid, 'schedules'), orderBy('date', 'desc'));
  }

  try {
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.date?.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));

    if (tasks.length === 0) {
      container.innerHTML = '<p class="empty-msg">No tasks found. Add a new task above!</p>';
      return;
    }

    // Group by date
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
    container.innerHTML = `<p class="empty-msg">Error loading schedule: ${e.message}</p>`;
  }
}

/** Format date for display */
function formatDisplayDate(dateStr) {
  if (dateStr === today()) return '📅 Today';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Get all dates between two date strings */
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

/** Add or update a schedule task (supports daily, weekly, monthly ranges) */
async function saveTask(taskData, taskId = null) {
  try {
    const colRef = collection(db, 'users', currentUser.uid, 'schedules');

    if (taskId) {
      // Editing existing task — always single update
      await updateDoc(doc(db, 'users', currentUser.uid, 'schedules', taskId), {
        ...taskData, updatedAt: serverTimestamp()
      });
      showToast('Task updated!', 'success');

    } else if (taskData.planType === 'weekly' || taskData.planType === 'monthly') {
      // Create one task per day in the date range
      const dates = getDateRange(taskData.startDate, taskData.endDate);
      if (dates.length === 0) { showToast('Invalid date range.', 'error'); return; }
      if (dates.length > 60) { showToast('Range too large. Max 60 days allowed.', 'warning'); return; }

      // Save all tasks in parallel
      await Promise.all(dates.map(date =>
        addDoc(colRef, {
          subject: taskData.subject,
          topic: taskData.topic,
          date,
          startTime: taskData.startTime,
          endTime: taskData.endTime,
          priority: taskData.priority,
          category: taskData.category,
          planType: taskData.planType,
          completed: false,
          createdAt: serverTimestamp(),
          userId: currentUser.uid
        })
      ));
      showToast(`✅ ${dates.length} tasks created (${taskData.planType} plan)!`, 'success');

    } else {
      // Daily — single task
      await addDoc(colRef, {
        ...taskData, completed: false,
        createdAt: serverTimestamp(),
        userId: currentUser.uid
      });
      showToast('Task added!', 'success');
    }

    closeModal('task-modal');
    loadSchedule(document.querySelector('.filter-btn.active')?.dataset.filter || 'today');
    if (activeSection === 'dashboard') loadTodaysTasks();

  } catch (e) {
    showToast('Failed to save task: ' + e.message, 'error');
  }
}
/** Toggle task completion */
async function toggleTask(taskId, completed) {
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'schedules', taskId), { completed });
    if (activeSection === 'dashboard') { loadTodaysTasks(); loadTodayProgress(); }
    if (activeSection === 'schedule') loadTodayProgress();
  } catch (e) {
    showToast('Could not update task.', 'error');
  }
}

/** Delete task */
async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'schedules', taskId));
    showToast('Task deleted.', 'info');
    loadSchedule(document.querySelector('.filter-btn.active')?.dataset.filter || 'today');
  } catch { showToast('Could not delete task.', 'error'); }
}

// ─────────────────────────────────────────────────────────────
// EXAMS MODULE
// ─────────────────────────────────────────────────────────────

async function loadExams() {
  const container = document.getElementById('exams-list');
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'exams'));
    const exams = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (exams.length === 0) {
      container.innerHTML = '<p class="empty-msg">No exams added yet. Click "Add Exam" to get started!</p>';
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
          <div class="exam-actions">
            <button class="btn-icon" onclick="deleteExam('${e.id}')">🗑️</button>
          </div>
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
  } catch { container.innerHTML = '<p class="empty-msg">Could not load exams.</p>'; }
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
// MOCK TEST TRACKER
// ─────────────────────────────────────────────────────────────

async function loadTests() {
  await loadPrelimsTests();
  await loadMainsTests();
}

async function loadPrelimsTests() {
  const container = document.getElementById('prelims-list');
  if (!container) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'users', currentUser.uid, 'prelims_tests'),
      orderBy('date', 'desc')
    ));
    const tests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (tests.length === 0) { container.innerHTML = '<p class="empty-msg">No prelims tests recorded yet.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Test Name</th><th>Date</th><th>Marks</th><th>Score</th><th>Accuracy</th><th>Actions</th></tr></thead>
        <tbody>${tests.map(t => {
          const pct = t.total > 0 ? Math.round((t.obtained / t.total) * 100) : 0;
          return `<tr>
            <td>${t.name || '—'}</td>
            <td>${t.date || '—'}</td>
            <td>${t.obtained}/${t.total}</td>
            <td><div class="mini-bar"><div class="mini-fill ${pct >= 60 ? 'good' : pct >= 40 ? 'avg' : 'poor'}" style="width:${pct}%"></div></div></td>
            <td>${t.accuracy || pct}%</td>
            <td><button class="btn-icon btn-del" onclick="deleteTest('prelims_tests','${t.id}')">🗑️</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch { container.innerHTML = '<p class="empty-msg">Could not load tests.</p>'; }
}

async function loadMainsTests() {
  const container = document.getElementById('mains-list');
  if (!container) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'users', currentUser.uid, 'mains_tests'),
      orderBy('date', 'desc')
    ));
    const tests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (tests.length === 0) { container.innerHTML = '<p class="empty-msg">No mains tests recorded yet.</p>'; return; }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Subject</th><th>Date</th><th>Marks</th><th>Score</th><th>Remarks</th><th>Actions</th></tr></thead>
        <tbody>${tests.map(t => {
          const pct = t.total > 0 ? Math.round((t.obtained / t.total) * 100) : 0;
          return `<tr>
            <td>${t.subject || '—'}</td>
            <td>${t.date || '—'}</td>
            <td>${t.obtained}/${t.total}</td>
            <td><div class="mini-bar"><div class="mini-fill ${pct >= 60 ? 'good' : pct >= 40 ? 'avg' : 'poor'}" style="width:${pct}%"></div></div></td>
            <td>${t.remarks || '—'}</td>
            <td><button class="btn-icon btn-del" onclick="deleteTest('mains_tests','${t.id}')">🗑️</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch { container.innerHTML = '<p class="empty-msg">Could not load tests.</p>'; }
}

async function savePrelimsTest(data) {
  try {
    const pct = data.total > 0 ? Math.round((data.obtained / data.total) * 100) : 0;
    await addDoc(collection(db, 'users', currentUser.uid, 'prelims_tests'), { ...data, accuracy: pct, createdAt: serverTimestamp() });
    showToast('Prelims score saved!', 'success');
    closeModal('prelims-modal');
    loadPrelimsTests();
    loadLatestScores();
  } catch { showToast('Failed to save score.', 'error'); }
}

async function saveMainsTest(data) {
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'mains_tests'), { ...data, createdAt: serverTimestamp() });
    showToast('Mains score saved!', 'success');
    closeModal('mains-modal');
    loadMainsTests();
  } catch { showToast('Failed to save score.', 'error'); }
}

async function deleteTest(coll, id) {
  if (!confirm('Delete this test record?')) return;
  await deleteDoc(doc(db, 'users', currentUser.uid, coll, id));
  showToast('Record deleted.', 'info');
  loadTests();
}

// ─────────────────────────────────────────────────────────────
// PROGRESS REPORT & CHARTS
// ─────────────────────────────────────────────────────────────

async function loadProgress() {
  try {
    // Fetch prelims tests
    const pSnap = await getDocs(collection(db, 'users', currentUser.uid, 'prelims_tests'));
    const pTests = pSnap.docs.map(d => d.data());

    // Fetch mains tests
    const mSnap = await getDocs(collection(db, 'users', currentUser.uid, 'mains_tests'));
    const mTests = mSnap.docs.map(d => d.data());

    // Fetch schedule completion
    const sSnap = await getDocs(collection(db, 'users', currentUser.uid, 'schedules'));
    const tasks = sSnap.docs.map(d => d.data());

    // Stats
    const totalTests = pTests.length + mTests.length;
    const avgScore = pTests.length > 0
      ? Math.round(pTests.reduce((s, t) => s + (t.total > 0 ? (t.obtained / t.total) * 100 : 0), 0) / pTests.length)
      : 0;
    const completionPct = tasks.length > 0
      ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0;

    document.getElementById('stat-total-tests').textContent = totalTests;
    document.getElementById('stat-avg-score').textContent = `${avgScore}%`;
    document.getElementById('stat-completion').textContent = `${completionPct}%`;
    document.getElementById('stat-prelims-count').textContent = pTests.length;

    // Subject-wise performance chart (mains)
    buildSubjectChart(mTests);

    // Monthly progress chart
    buildMonthlyChart(pTests);

    // Completion bar
    const bar = document.getElementById('completion-bar');
    if (bar) bar.style.width = `${completionPct}%`;
    const lbl = document.getElementById('completion-label');
    if (lbl) lbl.textContent = `${completionPct}% schedule completed`;

    // Generate SWOT
    generateSWOT(pTests, mTests, completionPct);

  } catch (e) { showToast('Could not load progress.', 'error'); }
}

function buildSubjectChart(mTests) {
  const ctx = document.getElementById('subject-chart')?.getContext('2d');
  if (!ctx) return;

  // Group by subject
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
    data: {
      labels: labels.length > 0 ? labels : ['No data yet'],
      datasets: [{ label: 'Score %', data: data.length > 0 ? data : [0], backgroundColor: colors.length > 0 ? colors : ['#6b7280'], borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}%` } } },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: '#1e293b' } },
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
      }
    }
  });
}

function buildMonthlyChart(pTests) {
  const ctx = document.getElementById('monthly-chart')?.getContext('2d');
  if (!ctx) return;

  // Group by month
  const monthly = {};
  pTests.forEach(t => {
    if (!t.date) return;
    const month = t.date.substring(0, 7); // YYYY-MM
    if (!monthly[month]) monthly[month] = { total: 0, obtained: 0, count: 0 };
    monthly[month].total += Number(t.total) || 0;
    monthly[month].obtained += Number(t.obtained) || 0;
    monthly[month].count++;
  });

  const sortedMonths = Object.keys(monthly).sort();
  const labels = sortedMonths.map(m => {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' });
  });
  const data = sortedMonths.map(m => monthly[m].total > 0 ? Math.round((monthly[m].obtained / monthly[m].total) * 100) : 0);

  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['No data'],
      datasets: [{
        label: 'Avg Score %', data: data.length > 0 ? data : [0],
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)',
        fill: true, tension: 0.4, pointBackgroundColor: '#6366f1', pointRadius: 5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: '#1e293b' } },
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// SWOT ANALYSIS
// ─────────────────────────────────────────────────────────────

function generateSWOT(pTests, mTests, completionPct) {
  const strengths = [], weaknesses = [], opportunities = [], threats = [];

  // Analyse mains subjects
  const subjects = {};
  mTests.forEach(t => {
    if (!subjects[t.subject]) subjects[t.subject] = { total: 0, obtained: 0 };
    subjects[t.subject].total += Number(t.total) || 0;
    subjects[t.subject].obtained += Number(t.obtained) || 0;
  });

  Object.entries(subjects).forEach(([sub, data]) => {
    const pct = data.total > 0 ? Math.round((data.obtained / data.total) * 100) : 0;
    if (pct >= 65) strengths.push(`Strong performance in <strong>${sub}</strong> (${pct}%)`);
    else if (pct < 45) weaknesses.push(`Needs improvement in <strong>${sub}</strong> (${pct}%)`);
  });

  // Prelims analysis
  const avgPrelims = pTests.length > 0
    ? Math.round(pTests.reduce((s, t) => s + (t.total > 0 ? (t.obtained / t.total) * 100 : 0), 0) / pTests.length) : 0;
  if (avgPrelims >= 60) strengths.push(`Good overall prelims average: <strong>${avgPrelims}%</strong>`);
  else if (avgPrelims > 0) weaknesses.push(`Prelims average needs improvement: <strong>${avgPrelims}%</strong>`);

  // Schedule completion
  if (completionPct >= 70) strengths.push(`Excellent schedule adherence: <strong>${completionPct}%</strong>`);
  else if (completionPct < 40) weaknesses.push(`Low schedule completion: <strong>${completionPct}%</strong> — improve consistency`);

  // Generic opportunities and threats
  if (pTests.length > 0) opportunities.push('Mock test data available — use it to identify patterns');
  opportunities.push('Consistent daily practice leads to exponential improvement');
  opportunities.push('Focus on high-weightage constitutional law topics for quick gains');
  if (completionPct < 50) threats.push('Inconsistent study schedule may hamper last-minute preparation');
  if (avgPrelims < 50 && pTests.length > 0) threats.push('Prelims cut-off is competitive — increase test frequency');
  threats.push('Exam stress and burnout — maintain work-life balance');

  if (strengths.length === 0) strengths.push('Keep adding test scores to track your strengths!');
  if (weaknesses.length === 0) weaknesses.push('No weak areas detected yet — keep recording scores.');

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
// UI NAVIGATION & MODALS
// ─────────────────────────────────────────────────────────────

window.switchSection = function(sectionId) {
  activeSection = sectionId;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = document.getElementById(`section-${sectionId}`);
  const navItem = document.querySelector(`[data-section="${sectionId}"]`);
  if (section) section.classList.add('active');
  if (navItem) navItem.classList.add('active');

  // Close sidebar on mobile
  document.getElementById('sidebar')?.classList.remove('open');

  // Load data for the section
  switch (sectionId) {
    case 'dashboard': loadDashboard(); break;
    case 'schedule': loadSchedule('today'); break;
    case 'exams': loadExams(); break;
    case 'tests': loadTests(); break;
    case 'progress': loadProgress(); break;
  }
};

window.openModal = function(id) {
  document.getElementById(id)?.classList.add('active');
};

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
  } catch { showToast('Could not load task data.', 'error'); }
};

// ─────────────────────────────────────────────────────────────
// FORM HANDLERS
// ─────────────────────────────────────────────────────────────

function setupForms() {
  // LOGIN FORM
  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    await loginUser(email, password);
  });

  // REGISTER FORM
  document.getElementById('register-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    const confirm = e.target.confirmPassword.value;
    if (password !== confirm) { showToast('Passwords do not match.', 'error'); return; }
    await registerUser(name, email, password);
  });

  // FORGOT PASSWORD FORM
  document.getElementById('forgot-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await resetPassword(e.target.email.value.trim());
    showAuthView('login');
  });

  // LOGOUT BUTTON
  document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

  // TASK FORM
  document.getElementById('task-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const editId = f.dataset.editId || null;
    const planType = document.querySelector('.plan-type-btn.active')?.dataset.type || 'daily';

    // Validate dates based on plan type
    if (!editId && (planType === 'weekly' || planType === 'monthly')) {
      if (!f.startDate.value || !f.endDate.value) {
        showToast('Please select both start and end dates.', 'error'); return;
      }
      if (new Date(f.startDate.value) > new Date(f.endDate.value)) {
        showToast('Start date must be before end date.', 'error'); return;
      }
    } else {
      if (!f.date.value) {
        showToast('Please select a date.', 'error'); return;
      }
    }

    const data = {
      subject: f.subject.value.trim(),
      topic: f.topic.value.trim(),
      date: f.date.value || f.startDate?.value || '',
      startDate: f.startDate?.value || '',
      endDate: f.endDate?.value || '',
      startTime: f.startTime.value,
      endTime: f.endTime.value,
      priority: f.priority.value,
      category: f.category.value,
      planType
    };

    await saveTask(data, editId);
    delete f.dataset.editId;
    document.getElementById('task-modal-title').textContent = 'Add New Task';
    setPlanType('daily'); // reset to daily after save
  });
  
  // EXAM FORM
  document.getElementById('exam-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    await saveExam({
      name: f.examName.value.trim(),
      date: f.examDate.value,
      stage: f.stage.value,
      notes: f.notes.value.trim()
    });
  });

  // PRELIMS FORM
  document.getElementById('prelims-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    await savePrelimsTest({
      name: f.testName.value.trim(),
      total: Number(f.total.value),
      obtained: Number(f.obtained.value),
      date: f.date.value
    });
  });

  // MAINS FORM
  document.getElementById('mains-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    await saveMainsTest({
      subject: f.subject.value.trim(),
      total: Number(f.total.value),
      obtained: Number(f.obtained.value),
      date: f.date.value,
      remarks: f.remarks.value.trim()
    });
  });

  // SCHEDULE FILTER BUTTONS
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadSchedule(btn.dataset.filter);
    });
  });

  // SIDEBAR TOGGLE (mobile)
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  // THEME TOGGLE
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // NAV ITEMS
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchSection(item.dataset.section));
  });

  // AUTH SWITCHERS
  document.getElementById('go-register')?.addEventListener('click', () => showAuthView('register'));
  document.getElementById('go-login')?.addEventListener('click', () => showAuthView('login'));
  document.getElementById('go-forgot')?.addEventListener('click', () => showAuthView('forgot'));
  document.getElementById('back-to-login')?.addEventListener('click', () => showAuthView('login'));

  // SEARCH SCHEDULE
  document.getElementById('schedule-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.schedule-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(q) ? '' : 'none';
    });
  });

  // TABS (tests section)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab)?.classList.add('active');
    });
  });

  // EXPORT PDF
  document.getElementById('export-pdf-btn')?.addEventListener('click', exportProgressPDF);

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) closeModal(m.id);
    });
  });
}

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
  const t = LS.get('theme');
  if (t === 'light') {
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
// EXPORT PDF
// ─────────────────────────────────────────────────────────────

async function exportProgressPDF() {
  showToast('Generating PDF...', 'info');
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    pdf.setFontSize(20);
    pdf.setTextColor(99, 102, 241);
    pdf.text('JG Lucknow Study Planner', 20, 20);
    pdf.setFontSize(12);
    pdf.setTextColor(50, 50, 50);
    pdf.text(`Progress Report — ${currentUser?.displayName || ''}`, 20, 30);
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 20, 38);

    pdf.setFontSize(10);
    pdf.text(`Total Tests: ${document.getElementById('stat-total-tests')?.textContent || '—'}`, 20, 55);
    pdf.text(`Average Score: ${document.getElementById('stat-avg-score')?.textContent || '—'}`, 20, 63);
    pdf.text(`Schedule Completion: ${document.getElementById('stat-completion')?.textContent || '—'}`, 20, 71);

    pdf.setFontSize(14);
    pdf.setTextColor(99, 102, 241);
    pdf.text('SWOT Analysis', 20, 90);

    const swotItems = {
      Strengths: document.getElementById('swot-strengths'),
      Weaknesses: document.getElementById('swot-weaknesses'),
      Opportunities: document.getElementById('swot-opportunities'),
      Threats: document.getElementById('swot-threats')
    };

    let y = 100;
    Object.entries(swotItems).forEach(([label, el]) => {
      if (!el) return;
      pdf.setFontSize(11);
      pdf.setTextColor(50, 50, 50);
      pdf.text(`${label}:`, 20, y);
      y += 6;
      pdf.setFontSize(9);
      el.querySelectorAll('li').forEach(li => {
        const text = li.textContent.trim().substring(2); // remove icon
        pdf.text(`  • ${text}`, 24, y);
        y += 6;
        if (y > 280) { pdf.addPage(); y = 20; }
      });
      y += 4;
    });

    pdf.save('JG_Progress_Report.pdf');
    showToast('PDF downloaded!', 'success');
  } catch (e) {
    showToast('PDF export failed. Make sure jsPDF is loaded.', 'error');
  }
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  setupForms();

  // Set today's date as default in task form
  const taskDateInput = document.querySelector('#task-form [name="date"]');
  if (taskDateInput) taskDateInput.value = today();

  // Auth state observer
  onAuthStateChanged(auth, user => {
    if (user) showApp(user);
    else showAuth();
  });
});

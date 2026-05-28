// ============================================================
// admin.js — Faculty Portal Logic
// ============================================================

import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc,
  query, where, orderBy, serverTimestamp,
  collectionGroup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────────────────────
// FACULTY EMAILS — Add all authorised faculty emails here
// ─────────────────────────────────────────────────────────────
const FACULTY_EMAILS = [
  "chinmaypandeynluo@gmail.com",
  "chinmayjglaw@gmail.com",
  "admin@jglucknow.com",
  // Add more faculty emails here as needed
];

// ─────────────────────────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────────────────────────
let currentFaculty = null;
let allStudents = [];       // cache of all student profiles
let selectedStudent = null; // currently viewed student
let classAvgChart = null;
let classSubjectChart = null;
let studentScoreChart = null;

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'✓'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function today() { return new Date().toISOString().split('T')[0]; }

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function scoreClass(pct) {
  if (pct >= 60) return 'score-good';
  if (pct >= 40) return 'score-avg';
  if (pct > 0)   return 'score-poor';
  return 'score-none';
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────
async function loginFaculty(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Check if this email is authorised as faculty
    if (!FACULTY_EMAILS.includes(cred.user.email.toLowerCase())) {
      await signOut(auth);
      showToast('Access denied. This account is not authorised as faculty.', 'error');
      return;
    }
    showToast('Welcome! Loading dashboard...', 'success');
  } catch (err) {
    const errors = {
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/too-many-requests': 'Too many attempts. Try again later.'
    };
    showToast(errors[err.code] || 'Login failed. Please try again.', 'error');
  }
}

// ─────────────────────────────────────────────────────────────
// LOAD ALL STUDENTS
// ─────────────────────────────────────────────────────────────
async function loadAllStudents() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    allStudents = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    // Filter out faculty accounts
    allStudents = allStudents.filter(s => !FACULTY_EMAILS.includes((s.email||'').toLowerCase()));
    return allStudents;
  } catch (e) {
    showToast('Could not load students: ' + e.message, 'error');
    return [];
  }
}

// Get aggregated stats for a student
async function getStudentStats(uid) {
  try {
    const [schedSnap, prelSnap, mainsSnap] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'schedules')),
      getDocs(collection(db, 'users', uid, 'prelims_tests')),
      getDocs(collection(db, 'users', uid, 'mains_tests'))
    ]);

    const tasks     = schedSnap.docs.map(d => d.data());
    const prelims   = prelSnap.docs.map(d => d.data());

    const totalTasks    = tasks.length;
    const doneTasks     = tasks.filter(t => t.completed).length;
    const completion    = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const avgScore      = prelims.length > 0
      ? Math.round(prelims.reduce((s, t) => s + (t.total > 0 ? (t.obtained/t.total)*100 : 0), 0) / prelims.length)
      : null;
    const todayDone     = tasks.filter(t => t.date === today() && t.completed).length;
    const testsCount    = prelims.length + mainsSnap.docs.length;

    return { totalTasks, doneTasks, completion, avgScore, todayDone, testsCount, prelims };
  } catch {
    return { totalTasks:0, doneTasks:0, completion:0, avgScore:null, todayDone:0, testsCount:0, prelims:[] };
  }
}

// ─────────────────────────────────────────────────────────────
// OVERVIEW SECTION
// ─────────────────────────────────────────────────────────────
async function loadOverview() {
  const students = await loadAllStudents();
  document.getElementById('stat-total-students').textContent = students.length;

  if (students.length === 0) {
    document.getElementById('overview-table').innerHTML = '<p class="empty-msg">No students registered yet.</p>';
    return;
  }

  // Load stats for all students in parallel
  const statsArr = await Promise.all(students.map(s => getStudentStats(s.uid)));

  // Compute class-level stats
  const activeToday   = statsArr.filter(s => s.todayDone > 0).length;
  const scoresOnly    = statsArr.filter(s => s.avgScore !== null).map(s => s.avgScore);
  const classAvg      = scoresOnly.length > 0 ? Math.round(scoresOnly.reduce((a,b)=>a+b,0)/scoresOnly.length) : 0;
  const testsThisWeek = statsArr.reduce((sum, s) => {
    // rough count — full accuracy needs date filter but this gives a good estimate
    return sum + (s.testsCount > 0 ? 1 : 0);
  }, 0);

  document.getElementById('stat-active-today').textContent  = activeToday;
  document.getElementById('stat-class-avg').textContent     = scoresOnly.length > 0 ? `${classAvg}%` : '—';
  document.getElementById('stat-tests-week').textContent    = statsArr.reduce((s,st)=>s+st.testsCount,0);

  // Build overview table
  const rows = students.map((s, i) => {
    const st    = statsArr[i];
    const pct   = st.avgScore;
    const cls   = pct !== null ? scoreClass(pct) : 'score-none';
    const label = pct !== null ? `${pct}%` : 'No tests';
    return `
      <tr>
        <td>
          <div class="student-name-cell">
            <div class="student-mini-avatar">${getInitials(s.name)}</div>
            <div>
              <div style="font-weight:600;font-size:13px">${s.name || '—'}</div>
              <div class="student-email">${s.email || ''}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="completion-cell">
            <div class="completion-mini-bar">
              <div class="completion-mini-fill" style="width:${st.completion}%"></div>
            </div>
            <span style="font-size:12px;font-weight:600">${st.completion}%</span>
          </div>
        </td>
        <td><span class="score-pill ${cls}">${label}</span></td>
        <td style="font-size:13px">${st.testsCount}</td>
        <td>
          <button class="view-btn" onclick="openStudentDetail('${s.uid}')">View →</button>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('overview-table').innerHTML = `
    <div style="overflow-x:auto">
      <table class="overview-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Schedule Completion</th>
            <th>Avg Prelims Score</th>
            <th>Tests Taken</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Class avg chart (scores distribution)
  buildClassAvgChart(students, statsArr);

  // Update schedule filter dropdown
  updateStudentDropdowns(students);
}

function buildClassAvgChart(students, statsArr) {
  const ctx = document.getElementById('class-avg-chart')?.getContext('2d');
  if (!ctx) return;
  const labels = students.map(s => (s.name||'').split(' ')[0]);
  const data   = statsArr.map(s => s.avgScore ?? 0);
  const colors = data.map(v => v >= 60 ? '#22c55e' : v >= 40 ? '#f59e0b' : v > 0 ? '#ef4444' : '#4b6280');

  if (classAvgChart) classAvgChart.destroy();
  classAvgChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Avg Prelims %', data, backgroundColor: colors, borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { color:'#94a3b8', callback: v=>v+'%' }, grid: { color:'#1e293b' } },
        x: { ticks: { color:'#94a3b8' }, grid: { display: false } }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// STUDENTS SECTION
// ─────────────────────────────────────────────────────────────
async function loadStudentsGrid(filter = '') {
  const container = document.getElementById('students-grid');
  const students  = allStudents.length > 0 ? allStudents : await loadAllStudents();
  const filtered  = filter
    ? students.filter(s => (s.name||'').toLowerCase().includes(filter) || (s.email||'').toLowerCase().includes(filter))
    : students;

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-msg">No students found.</p>'; return;
  }

  const statsArr = await Promise.all(filtered.map(s => getStudentStats(s.uid)));

  container.innerHTML = filtered.map((s, i) => {
    const st  = statsArr[i];
    const pct = st.avgScore;
    return `
      <div class="student-card" onclick="openStudentDetail('${s.uid}')">
        <div class="student-card-header">
          <div class="student-avatar-lg">${getInitials(s.name)}</div>
          <div>
            <div class="student-card-name">${s.name || '—'}</div>
            <div class="student-card-email">${s.email || ''}</div>
            <div class="student-card-joined">Joined: ${s.createdAt?.toDate ? formatDate(s.createdAt.toDate().toISOString().split('T')[0]) : '—'}</div>
          </div>
        </div>
        <div class="student-card-stats">
          <div class="sc-stat">
            <div class="sc-stat-val">${st.completion}%</div>
            <div class="sc-stat-lbl">Completion</div>
          </div>
          <div class="sc-stat">
            <div class="sc-stat-val ${pct !== null ? (pct>=60?'':'') : ''}" style="color:${pct===null?'var(--text-muted)':pct>=60?'var(--success)':pct>=40?'var(--warning)':'var(--danger)'}">${pct !== null ? pct+'%' : '—'}</div>
            <div class="sc-stat-lbl">Avg Score</div>
          </div>
          <div class="sc-stat">
            <div class="sc-stat-val">${st.testsCount}</div>
            <div class="sc-stat-lbl">Tests</div>
          </div>
        </div>
        <button class="view-btn" style="width:100%;margin-top:4px">View Details →</button>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// STUDENT DETAIL VIEW
// ─────────────────────────────────────────────────────────────
window.openStudentDetail = async function(uid) {
  selectedStudent = allStudents.find(s => s.uid === uid) || { uid };
  if (!selectedStudent.name) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) Object.assign(selectedStudent, snap.data());
  }

  switchSection('student-detail');

  document.getElementById('detail-student-name').textContent = selectedStudent.name || 'Student';

  // Info card
  const st = await getStudentStats(uid);
  document.getElementById('detail-student-info').innerHTML = `
    <div class="detail-info-grid">
      <div class="detail-avatar">${getInitials(selectedStudent.name)}</div>
      <div>
        <div style="font-size:18px;font-weight:700">${selectedStudent.name || '—'}</div>
        <div style="font-size:13px;color:var(--text-muted)">${selectedStudent.email || ''}</div>
        <div class="detail-stats-row">
          <div class="detail-stat"><div class="detail-stat-val">${st.completion}%</div><div class="detail-stat-lbl">Completion</div></div>
          <div class="detail-stat"><div class="detail-stat-val" style="color:${st.avgScore===null?'var(--text-muted)':st.avgScore>=60?'var(--success)':st.avgScore>=40?'var(--warning)':'var(--danger)'}">${st.avgScore !== null ? st.avgScore+'%' : '—'}</div><div class="detail-stat-lbl">Avg Score</div></div>
          <div class="detail-stat"><div class="detail-stat-val">${st.testsCount}</div><div class="detail-stat-lbl">Tests</div></div>
          <div class="detail-stat"><div class="detail-stat-val">${st.doneTasks}/${st.totalTasks}</div><div class="detail-stat-lbl">Tasks Done</div></div>
        </div>
      </div>
    </div>`;

  // Load default tab
  loadStudentSchedule(uid, 'today');
  loadStudentScores(uid);
  loadSentMessages(uid);

  // Detail filter buttons
  document.querySelectorAll('.detail-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.detail-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadStudentSchedule(uid, btn.dataset.filter);
    };
  });

  // Tabs
  document.querySelectorAll('#section-student-detail .tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#section-student-detail .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#section-student-detail .tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab)?.classList.add('active');
    };
  });
};

async function loadStudentSchedule(uid, filter = 'today') {
  const container = document.getElementById('detail-schedule-list');
  if (!container) return;
  try {
    let q;
    if (filter === 'today') {
      q = query(collection(db,'users',uid,'schedules'), where('date','==',today()));
    } else if (filter === 'week') {
      q = query(collection(db,'users',uid,'schedules'), where('date','>=',weekStart()), where('date','<=',today()));
    } else {
      q = query(collection(db,'users',uid,'schedules'), orderBy('date','desc'));
    }
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => d.data()).sort((a,b) => (a.date||'').localeCompare(b.date||''));

    if (tasks.length === 0) { container.innerHTML = '<p class="empty-msg">No tasks found for this period.</p>'; return; }

    // Group by date
    const grouped = {};
    tasks.forEach(t => { (grouped[t.date] = grouped[t.date]||[]).push(t); });

    container.innerHTML = Object.entries(grouped).map(([date, items]) => `
      <div style="margin-bottom:16px">
        <div class="date-header">${date === today() ? '📅 Today' : formatDate(date)}</div>
        ${items.map(t => `
          <div class="faculty-schedule-item">
            <div class="fsi-status ${t.completed ? 'fsi-done' : 'fsi-pending'}"></div>
            <div class="fsi-info">
              <div class="fsi-subject">${t.subject || '—'}</div>
              <div class="fsi-topic">${t.topic || '—'}</div>
              <div class="fsi-meta">⏰ ${t.startTime||'?'} – ${t.endTime||'?'} &nbsp;|&nbsp; ${(t.priority||'medium').toUpperCase()} &nbsp;|&nbsp; ${t.completed ? '✅ Done' : '⏳ Pending'}</div>
            </div>
          </div>`).join('')}
      </div>`).join('');
  } catch (e) { container.innerHTML = `<p class="empty-msg">Error: ${e.message}</p>`; }
}

async function loadStudentScores(uid) {
  const container = document.getElementById('detail-scores-list');
  try {
    const [prelSnap, mainsSnap] = await Promise.all([
      getDocs(query(collection(db,'users',uid,'prelims_tests'), orderBy('date','desc'))),
      getDocs(query(collection(db,'users',uid,'mains_tests'), orderBy('date','desc')))
    ]);
    const prelims = prelSnap.docs.map(d=>({...d.data(),type:'Prelims'}));
    const mains   = mainsSnap.docs.map(d=>({...d.data(),type:'Mains'}));
    const all     = [...prelims, ...mains].sort((a,b)=>(b.date||'').localeCompare(a.date||''));

    if (all.length === 0) { container.innerHTML = '<p class="empty-msg">No test scores recorded.</p>'; return; }

    container.innerHTML = `
      <div style="overflow-x:auto">
        <table class="overview-table">
          <thead><tr><th>Type</th><th>Name/Subject</th><th>Date</th><th>Marks</th><th>Score</th></tr></thead>
          <tbody>${all.map(t => {
            const pct = t.total > 0 ? Math.round((t.obtained/t.total)*100) : 0;
            return `<tr>
              <td><span class="score-pill ${t.type==='Prelims'?'badge-prelims':'badge-mains'}" style="font-size:11px">${t.type}</span></td>
              <td>${t.name || t.subject || '—'}</td>
              <td>${formatDate(t.date)}</td>
              <td>${t.obtained}/${t.total}</td>
              <td><span class="score-pill ${scoreClass(pct)}">${pct}%</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;

    // Build score trend chart
    buildStudentScoreChart(prelims);
  } catch (e) { container.innerHTML = `<p class="empty-msg">Error loading scores.</p>`; }
}

function buildStudentScoreChart(prelims) {
  const ctx = document.getElementById('student-score-chart')?.getContext('2d');
  if (!ctx) return;
  const sorted = [...prelims].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const labels = sorted.map(t => formatDate(t.date));
  const data   = sorted.map(t => t.total > 0 ? Math.round((t.obtained/t.total)*100) : 0);

  if (studentScoreChart) studentScoreChart.destroy();
  studentScoreChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['No data'],
      datasets: [{
        label: 'Prelims %', data: data.length > 0 ? data : [0],
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)',
        fill: true, tension: 0.4, pointBackgroundColor: '#6366f1', pointRadius: 5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color:'#94a3b8' } } },
      scales: {
        y: { beginAtZero:true, max:100, ticks:{ color:'#94a3b8', callback:v=>v+'%' }, grid:{ color:'#1e293b' } },
        x: { ticks:{ color:'#94a3b8' }, grid:{ display:false } }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// ALL SCHEDULES VIEW
// ─────────────────────────────────────────────────────────────
async function loadAllSchedules(studentFilter = 'all', dateFilter = 'today') {
  const container = document.getElementById('all-schedules-list');
  container.innerHTML = '<p class="empty-msg">Loading...</p>';

  const students = allStudents.length > 0 ? allStudents : await loadAllStudents();
  const targets  = studentFilter === 'all' ? students : students.filter(s => s.uid === studentFilter);

  const allTasks = [];
  await Promise.all(targets.map(async s => {
    try {
      let q;
      if (dateFilter === 'today') {
        q = query(collection(db,'users',s.uid,'schedules'), where('date','==',today()));
      } else if (dateFilter === 'week') {
        q = query(collection(db,'users',s.uid,'schedules'), where('date','>=',weekStart()));
      } else {
        q = query(collection(db,'users',s.uid,'schedules'), orderBy('date','desc'));
      }
      const snap = await getDocs(q);
      snap.docs.forEach(d => allTasks.push({ ...d.data(), studentName: s.name, studentUid: s.uid }));
    } catch {}
  }));

  if (allTasks.length === 0) { container.innerHTML = '<p class="empty-msg">No schedule data found.</p>'; return; }
  allTasks.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  container.innerHTML = allTasks.map(t => `
    <div class="faculty-schedule-item">
      <div class="fsi-status ${t.completed ? 'fsi-done' : 'fsi-pending'}"></div>
      <div class="fsi-info">
        <div class="fsi-subject">${t.subject||'—'} <span style="font-size:11px;color:var(--text-muted)">— ${t.topic||''}</span></div>
        <div class="fsi-meta">📅 ${formatDate(t.date)} &nbsp;|&nbsp; ⏰ ${t.startTime||'?'}–${t.endTime||'?'} &nbsp;|&nbsp; ${t.completed?'✅ Done':'⏳ Pending'}</div>
      </div>
      <div class="fsi-student" onclick="openStudentDetail('${t.studentUid}')" style="cursor:pointer">${t.studentName||'—'} →</div>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────
// ALL SCORES VIEW
// ─────────────────────────────────────────────────────────────
async function loadAllScores(studentFilter = 'all', type = 'prelims') {
  const container = document.getElementById('all-scores-list');
  container.innerHTML = '<p class="empty-msg">Loading...</p>';

  const students = allStudents.length > 0 ? allStudents : await loadAllStudents();
  const targets  = studentFilter === 'all' ? students : students.filter(s => s.uid === studentFilter);
  const collName = type === 'prelims' ? 'prelims_tests' : 'mains_tests';

  const allTests = [];
  await Promise.all(targets.map(async s => {
    try {
      const snap = await getDocs(collection(db,'users',s.uid, collName));
      snap.docs.forEach(d => allTests.push({ ...d.data(), studentName: s.name, studentUid: s.uid }));
    } catch {}
  }));

  if (allTests.length === 0) { container.innerHTML = '<p class="empty-msg">No test scores found.</p>'; return; }
  allTests.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="overview-table">
        <thead><tr>
          <th>Student</th>
          <th>${type==='prelims'?'Test Name':'Subject'}</th>
          <th>Date</th><th>Marks</th><th>Score</th>
        </tr></thead>
        <tbody>${allTests.map(t => {
          const pct = t.total > 0 ? Math.round((t.obtained/t.total)*100) : 0;
          return `<tr>
            <td>
              <span style="color:var(--accent);cursor:pointer;font-weight:600" onclick="openStudentDetail('${t.studentUid}')">${t.studentName||'—'}</span>
            </td>
            <td>${t.name || t.subject || '—'}</td>
            <td>${formatDate(t.date)}</td>
            <td>${t.obtained}/${t.total}</td>
            <td><span class="score-pill ${scoreClass(pct)}">${pct}%</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;

  // Build class subject chart for mains
  if (type === 'mains') buildClassSubjectChart(allTests);
}

function buildClassSubjectChart(mainsTests) {
  const ctx = document.getElementById('class-subject-chart')?.getContext('2d');
  if (!ctx) return;

  const subjects = {};
  mainsTests.forEach(t => {
    if (!subjects[t.subject]) subjects[t.subject] = { total:0, obtained:0 };
    subjects[t.subject].total   += Number(t.total)||0;
    subjects[t.subject].obtained += Number(t.obtained)||0;
  });

  const labels = Object.keys(subjects);
  const data   = labels.map(s => subjects[s].total > 0 ? Math.round((subjects[s].obtained/subjects[s].total)*100) : 0);
  const colors = data.map(v => v>=60?'#22c55e':v>=40?'#f59e0b':'#ef4444');

  if (classSubjectChart) classSubjectChart.destroy();
  classSubjectChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length>0 ? labels : ['No data'],
      datasets: [{ label:'Class Avg %', data: data.length>0?data:[0], backgroundColor: colors.length>0?colors:['#4b6280'], borderRadius:6 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ display:false } },
      scales: {
        y: { beginAtZero:true, max:100, ticks:{ color:'#94a3b8', callback:v=>v+'%' }, grid:{ color:'#1e293b' } },
        x: { ticks:{ color:'#94a3b8' }, grid:{ display:false } }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────
async function sendMessage(studentUid, msgType, subject, message, isBroadcast = false) {
  if (!studentUid) throw new Error('No student selected');
  if (!currentFaculty) throw new Error('Not logged in');

  const msgData = {
    from: currentFaculty.email || '',
    fromName: currentFaculty.displayName || currentFaculty.email || 'Faculty',
    to: studentUid,
    msgType: msgType || 'feedback',
    subject: subject || '',
    message: message || '',
    isBroadcast: isBroadcast || false,
    createdAt: serverTimestamp(),
    read: false
  };

  try {
    // Store in student's messages subcollection
    await addDoc(
      collection(db, 'users', studentUid, 'messages'),
      msgData
    );
  } catch (e) {
    console.error('Failed to write to student messages:', e);
    throw new Error('Could not deliver message to student: ' + e.message);
  }

  try {
    // Store in faculty sent messages collection
    await addDoc(
      collection(db, 'faculty_messages'),
      { ...msgData, studentUid }
    );
  } catch (e) {
    console.error('Failed to write to faculty_messages:', e);
    throw new Error('Could not save sent message: ' + e.message);
  }
}
async function loadSentMessages(studentUid) {
  const container = document.getElementById('sent-messages-list');
  if (!container) return;
  try {
    const q = query(
      collection(db, 'faculty_messages'),
      where('to', '==', studentUid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) { container.innerHTML = '<p class="empty-msg">No messages sent yet.</p>'; return; }

    container.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('en-IN') : '—';
      return `
        <div class="msg-bubble">
          <div class="msg-bubble-header">
            <span class="msg-type-badge msg-${m.msgType}">${m.msgType.charAt(0).toUpperCase()+m.msgType.slice(1)}</span>
            <span class="msg-time">${time}</span>
          </div>
          <div class="msg-subject">${m.subject}</div>
          <div class="msg-text">${m.message}</div>
        </div>`;
    }).join('');
  } catch { container.innerHTML = '<p class="empty-msg">Could not load messages.</p>'; }
}

async function loadAllConversations() {
  const container = document.getElementById('conversations-list');
  if (!container) return;
  try {
    const q = query(collection(db,'faculty_messages'), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    if (snap.empty) { container.innerHTML = '<p class="empty-msg">No messages sent yet.</p>'; return; }

    // Group by student
    const byStudent = {};
    snap.docs.forEach(d => {
      const m = d.data();
      if (!byStudent[m.to]) byStudent[m.to] = { ...m, studentUid: m.to };
    });

    container.innerHTML = Object.values(byStudent).map(m => {
      const student = allStudents.find(s => s.uid === m.to);
      const name = student?.name || m.to;
      return `
        <div class="conversation-item" onclick="openStudentDetail('${m.to}'); setTimeout(()=>{document.querySelectorAll('#section-student-detail .tab-btn')[2].click()},300)">
          <div class="conv-avatar">${getInitials(name)}</div>
          <div class="conv-info">
            <div class="conv-name">${name}</div>
            <div class="conv-preview">${m.subject||''}</div>
          </div>
        </div>`;
    }).join('');
  } catch { container.innerHTML = '<p class="empty-msg">Could not load conversations.</p>'; }
}

// ─────────────────────────────────────────────────────────────
// SECTION NAVIGATION
// ─────────────────────────────────────────────────────────────
window.switchSection = function(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`section-${sectionId}`)?.classList.add('active');
  document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');
  document.getElementById('sidebar')?.classList.remove('open');

  switch(sectionId) {
    case 'overview':  loadOverview(); break;
    case 'students':  loadStudentsGrid(); break;
    case 'schedules': loadAllSchedules(); break;
    case 'scores':    loadAllScores(); break;
    case 'messages':  loadAllConversations(); break;
  }
};

// ─────────────────────────────────────────────────────────────
// DROPDOWN HELPERS
// ─────────────────────────────────────────────────────────────
function updateStudentDropdowns(students) {
  ['schedule-student-filter', 'scores-student-filter'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const existing = sel.innerHTML;
    sel.innerHTML = '<option value="all">All Students</option>' +
      students.map(s => `<option value="${s.uid}">${s.name||s.email}</option>`).join('');
  });
}

// ─────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────
function setupForms() {
  // Login
  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await loginFaculty(e.target.email.value.trim(), e.target.password.value);
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await signOut(auth);
    showToast('Signed out.', 'info');
  });

  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    document.getElementById('theme-toggle').textContent = isLight ? '🌙' : '☀️';
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchSection(item.dataset.section));
  });

  // Feedback form (send to single student)
  document.getElementById('feedback-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!selectedStudent || !selectedStudent.uid) {
      showToast('No student selected. Please go back and select a student.', 'error');
      return;
    }
    const f = e.target;
    const btn = f.querySelector('button[type="submit"]');
    btn.textContent = 'Sending...';
    btn.disabled = true;
    try {
      await sendMessage(
        selectedStudent.uid,
        f.msgType.value,
        f.subject.value.trim(),
        f.message.value.trim()
      );
      showToast(`✅ Message sent to ${selectedStudent.name || 'student'}!`, 'success');
      f.reset();
      loadSentMessages(selectedStudent.uid);
    } catch (err) {
      showToast('Failed to send: ' + err.message, 'error');
      console.error(err);
    } finally {
      btn.textContent = 'Send Message →';
      btn.disabled = false;
    }
  });

  // Broadcast form
  document.getElementById('broadcast-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type="submit"]');

    // Load students if not already loaded
    const students = allStudents.length > 0 ? allStudents : await loadAllStudents();

    if (students.length === 0) {
      showToast('No students found. Make sure students have registered.', 'warning');
      return;
    }

    if (!confirm(`Send this message to all ${students.length} students?`)) return;

    btn.textContent = `Sending to ${students.length} students...`;
    btn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    // Send one by one so a single failure doesn't stop others
    for (const s of students) {
      try {
        await sendMessage(
          s.uid,
          f.msgType.value,
          f.subject.value.trim(),
          f.message.value.trim(),
          true
        );
        successCount++;
      } catch (err) {
        console.error(`Failed for ${s.name}:`, err);
        failCount++;
      }
    }

    if (failCount === 0) {
      showToast(`📢 Broadcast sent to all ${successCount} students!`, 'success');
    } else {
      showToast(`⚠️ Sent to ${successCount} students. Failed for ${failCount}.`, 'warning');
    }

    f.reset();
    btn.textContent = '📢 Send to All Students';
    btn.disabled = false;
    loadAllConversations();
  });

  // Schedule filters (in schedules section)
  document.getElementById('schedule-student-filter')?.addEventListener('change', e => {
    const dateFilter = document.getElementById('schedule-date-filter').value;
    loadAllSchedules(e.target.value, dateFilter);
  });
  document.getElementById('schedule-date-filter')?.addEventListener('change', e => {
    const studentFilter = document.getElementById('schedule-student-filter').value;
    loadAllSchedules(studentFilter, e.target.value);
  });

  // Scores filters
  document.getElementById('scores-student-filter')?.addEventListener('change', e => {
    const type = document.getElementById('scores-type-filter').value;
    loadAllScores(e.target.value, type);
  });
  document.getElementById('scores-type-filter')?.addEventListener('change', e => {
    const student = document.getElementById('scores-student-filter').value;
    loadAllScores(student, e.target.value);
  });

  // Student search
  document.getElementById('student-search')?.addEventListener('input', e => {
    loadStudentsGrid(e.target.value.toLowerCase());
  });

  // Live date in header
  const dateEl = document.getElementById('live-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
}

function showApp(user) {
  currentFaculty = user;
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('app-container').style.display  = 'flex';
  document.getElementById('user-name-display').textContent = user.displayName || user.email;

  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('faculty-greeting');
  if (el) el.textContent = `${greet}, ${(user.displayName||'Faculty').split(' ')[0]}! 👋`;

  switchSection('overview');
}

function showAuth() {
  currentFaculty = null;
  document.getElementById('auth-container').style.display = 'flex';
  document.getElementById('app-container').style.display  = 'none';
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Apply stored theme
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = '🌙';
  }

  setupForms();

  onAuthStateChanged(auth, user => {
    if (user && FACULTY_EMAILS.includes(user.email.toLowerCase())) {
      showApp(user);
    } else {
      if (user) signOut(auth); // non-faculty user — sign them out
      showAuth();
    }
  });
});

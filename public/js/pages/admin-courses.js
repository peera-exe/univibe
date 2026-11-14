const el = ui.el;
const message = document.querySelector('#message');
const rowsBox = document.querySelector('#course-rows');
const form = document.querySelector('#course-form');
const formMessage = document.querySelector('#form-message');
const enrollCard = document.querySelector('#enroll-card');
const enrollMessage = document.querySelector('#enroll-message');
const f = function (name) { return document.querySelector('#f-' + name); };
let editing = null;     // null = เพิ่มวิชาใหม่
let enrollingId = null;
let courses = [];
let teachers = [];      // อาจารย์ที่เลือกไว้ในฟอร์ม [{ username, displayName }]
const editor = ScheduleEditor.create(f('schedule'), []);

function openForm(course) {
  editing = course || null;
  document.querySelector('#form-title').textContent = course ? 'แก้ไขวิชา ' + course.code : 'เพิ่มวิชา';
  f('code').value = course ? course.code : '';
  f('section').value = course ? course.section : '1';
  f('name').value = course ? course.name.replace(/^\S+\s/, '') : '';
  f('semester').value = course ? course.semester : '1/2569';
  f('credits').value = course ? course.credits : '3';
  f('desc').value = course ? course.description : '';
  teachers = course ? course.teachers.map(function (t) { return { username: t.username, displayName: t.displayName }; }) : [];
  paintTeachers();
  f('teacher-q').value = '';
  f('teacher-results').classList.add('hidden');
  editor.setValue(course ? course.schedule : []);
  showAlert(formMessage, '');
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

function paintTeachers() {
  const box = f('teachers');
  box.replaceChildren();
  if (!teachers.length) box.appendChild(el('span', 'muted small', 'ยังไม่ได้เลือกอาจารย์'));
  teachers.forEach(function (t) {
    const chip = el('span', 'chip', t.displayName + ' ');
    const x = el('button', 'chip-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'เอา ' + t.displayName + ' ออก');
    x.addEventListener('click', function () { teachers = teachers.filter(function (o) { return o.username !== t.username; }); paintTeachers(); });
    chip.appendChild(x);
    box.appendChild(chip);
  });
}

let teacherTimer = null;
function searchTeachers() {
  const q = f('teacher-q').value.trim();
  const results = f('teacher-results');
  api.get('/api/admin/courses/teachers?q=' + encodeURIComponent(q)).then(function (data) {
    results.replaceChildren();
    const found = data.teachers.filter(function (t) { return !teachers.some(function (o) { return o.username === t.username; }); });
    if (!found.length) results.appendChild(el('div', 'picker-empty muted small', 'ไม่พบอาจารย์ที่ตรงกัน'));
    found.forEach(function (t) {
      const item = el('button', 'picker-item');
      item.type = 'button';
      item.appendChild(el('strong', '', t.displayName));
      item.appendChild(el('span', 'muted small', ' @' + t.username + (t.department ? ' · ' + t.department : '')));
      item.addEventListener('click', function () {
        if (teachers.length >= 5) return showAlert(formMessage, 'กำหนดอาจารย์ได้ไม่เกิน 5 คน');
        teachers.push({ username: t.username, displayName: t.displayName });
        paintTeachers();
        f('teacher-q').value = '';
        results.classList.add('hidden');
        f('teacher-q').focus();
      });
      results.appendChild(item);
    });
    results.classList.remove('hidden');
  }).catch(function (err) { showAlert(formMessage, err.message); });
}
f('teacher-q').addEventListener('input', function () { clearTimeout(teacherTimer); teacherTimer = setTimeout(searchTeachers, 250); });
f('teacher-q').addEventListener('focus', searchTeachers);
document.addEventListener('click', function (e) { if (!e.target.closest('.picker')) f('teacher-results').classList.add('hidden'); });

function payload() {
  return {
    code: f('code').value, section: f('section').value, name: f('name').value, semester: f('semester').value,
    credits: f('credits').value, description: f('desc').value,
    teachers: teachers.map(function (t) { return t.username; }),
    schedule: editor.getValue(),
  };
}

async function save(confirmStudentClash) {
  const body = Object.assign(payload(), { confirmStudentClash: confirmStudentClash === true });
  try {
    if (editing) await api.send('PATCH', '/api/admin/courses/' + editing._id, body);
    else await api.post('/api/admin/courses', body);
    form.classList.add('hidden');
    showAlert(message, 'บันทึกวิชาแล้ว', 'success');
    load();
  } catch (err) {
    if (err.data && err.data.code === 'STUDENT_CLASH') {
      const names = Array.from(new Set(err.data.clashes.map(function (c) { return c.name + ' (ชนกับ ' + c.course + ')'; })));
      if (confirm(err.message + '\n\n' + names.slice(0, 10).join('\n'))) return save(true);
    } else {
      showAlert(formMessage, err.message);
    }
  }
}

form.addEventListener('submit', function (e) { e.preventDefault(); save(false); });
document.querySelector('#cancel-form').addEventListener('click', function () { form.classList.add('hidden'); });
document.querySelector('#new-course').addEventListener('click', function () { openForm(null); });

function actionButton(label, cls, fn) {
  const b = el('button', 'btn btn-sm ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

async function load() {
  try {
    courses = (await api.get('/api/admin/courses')).courses;
    rowsBox.replaceChildren();
    if (!courses.length) {
      const tr = el('tr'); const td = el('td', 'muted', 'ยังไม่มีวิชา'); td.colSpan = 6; tr.appendChild(td); rowsBox.appendChild(tr);
    }
    courses.forEach(function (c) {
      const tr = el('tr');
      const name = el('td'); name.appendChild(el('strong', '', c.code)); name.appendChild(el('div', 'small', c.name.replace(/^\S+\s/, '') + ' (กลุ่ม ' + c.section + ')'));
      tr.appendChild(name);
      tr.appendChild(el('td', '', c.semester));
      tr.appendChild(el('td', 'small', c.teachers.map(function (t) { return t.displayName; }).join(', ') || '—'));
      const sch = el('td', 'small');
      c.schedule.forEach(function (s) { sch.appendChild(el('div', '', ScheduleEditor.describe(s))); });
      tr.appendChild(sch);
      tr.appendChild(el('td', '', c.enrolledCount + ' คน'));
      const act = el('td'); const wrap = el('div', 'row-actions');
      wrap.appendChild(actionButton('แก้ไข', 'btn-ghost', function () { openForm(c); }));
      wrap.appendChild(actionButton('ลงทะเบียน', 'btn-ghost', function () { openEnroll(c); }));
      wrap.appendChild(actionButton('ลบ', 'btn-danger', function () {
        if (!confirm('ซ่อนวิชา ' + c.code + ' ออกจากระบบ?')) return;
        api.send('DELETE', '/api/admin/courses/' + c._id).then(load).catch(function (e) { showAlert(message, e.message); });
      }));
      act.appendChild(wrap); tr.appendChild(act);
      rowsBox.appendChild(tr);
    });
  } catch (err) { showAlert(message, err.message); }
}

// ---------- ลงทะเบียนนักศึกษา ----------
async function loadEnrollments() {
  const list = document.querySelector('#enroll-list');
  const data = await api.get('/api/admin/courses/' + enrollingId + '/enrollments');
  list.replaceChildren();
  data.enrollments.forEach(function (e) {
    const tr = el('tr');
    tr.appendChild(el('td', '', e.studentId));
    tr.appendChild(el('td', '', e.fullName));
    tr.appendChild(el('td', 'small muted', e.account ? '@' + e.account.username : 'ยังไม่สมัครใช้งาน'));
    const td = el('td');
    td.appendChild(actionButton('ถอน', 'btn-ghost', function () {
      if (!confirm('ถอนรหัส ' + e.studentId + ' ออกจากวิชา?')) return;
      api.send('DELETE', '/api/admin/courses/' + enrollingId + '/enrollments/' + e.studentId).then(function () { loadEnrollments(); load(); }).catch(function (er) { showAlert(enrollMessage, er.message); });
    }));
    tr.appendChild(td);
    list.appendChild(tr);
  });
}

function openEnroll(c) {
  enrollingId = c._id;
  document.querySelector('#enroll-title').textContent = 'ลงทะเบียนนักศึกษา: ' + c.code;
  document.querySelector('#enroll-ids').value = '';
  showAlert(enrollMessage, '');
  enrollCard.classList.remove('hidden');
  loadEnrollments().catch(function (e) { showAlert(enrollMessage, e.message); });
  enrollCard.scrollIntoView({ behavior: 'smooth' });
}
document.querySelector('#enroll-close').addEventListener('click', function () { enrollCard.classList.add('hidden'); });
document.querySelector('#enroll-btn').addEventListener('click', async function () {
  try {
    const res = await api.post('/api/admin/courses/' + enrollingId + '/enrollments', { studentIds: document.querySelector('#enroll-ids').value });
    showAlert(enrollMessage, 'เพิ่มใหม่ ' + res.added + ' จาก ' + res.total + ' รหัส', 'success');
    document.querySelector('#enroll-ids').value = '';
    loadEnrollments();
    load();
  } catch (err) { showAlert(enrollMessage, err.message); }
});

requireUser({ role: 'admin', active: 'admin' }).then(function (u) { if (u) load(); });

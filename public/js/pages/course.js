const el = ui.el;
const message = document.querySelector('#message');
const head = document.querySelector('#course-head');
const tabsBox = document.querySelector('#course-tabs');
const panel = document.querySelector('#course-panel');
const id = new URLSearchParams(location.search).get('id');
let me = null;
let course = null;
let currentTab = new URLSearchParams(location.search).get('tab') || null;

// แท็บทั้งหมดของหน้าวิชา: ช่วงถัดไปจะเพิ่มแท็บ "ประกาศ" และ "งาน" ในรายการนี้
const TABS = [
  { id: 'schedule', label: 'เวลาเรียน', visible: function () { return true; }, render: renderSchedule },
  { id: 'members', label: 'สมาชิก', visible: function (c) { return isMember(c); }, render: renderMembers },
  { id: 'requests', label: 'คำขอเข้าร่วม', visible: function (c) { return c.canManage; }, render: renderRequests },
];
const isMember = function (c) { return c.myStatus === 'member' || c.myStatus === 'manager'; };

// แท็บ "ประกาศ" และ "งาน" อยู่ใน course-work.js
const ctx = {
  get course() { return course; }, get me() { return me; }, id: id, panel: panel, message: message,
  reload: function () { return reload(); },
};
(window.CourseWorkTabs || []).slice().reverse().forEach(function (t) {
  TABS.unshift({
    id: t.id, label: t.label,
    visible: function (c) { return isMember(c) || c.canManage; },
    render: function () { return t.render(ctx); },
  });
});

function renderHead() {
  head.replaceChildren();
  const top = el('div', 'course-code-row');
  top.appendChild(el('h1', '', course.code + ' ' + course.name.replace(/^\S+\s/, '')));
  head.appendChild(top);
  head.appendChild(el('div', 'muted', 'กลุ่ม ' + course.section + ' · ภาคเรียน ' + course.semester + ' · ' + course.credits + ' หน่วยกิต'));
  if (course.teachers.length) {
    const line = el('div', 'small', 'อาจารย์ผู้ดูแล: ');
    course.teachers.forEach(function (t, i) { if (i) line.appendChild(document.createTextNode(', ')); line.appendChild(ui.userLink(t)); });
    head.appendChild(line);
  }
  if (course.description) head.appendChild(el('p', 'muted', course.description));

  const actions = el('div', 'row-actions');
  if (isMember(course)) {
    const chat = el('a', 'btn btn-sm', 'เปิดแชทวิชา');
    chat.href = '/chat.html';
    actions.appendChild(chat);
  }
  if (course.myStatus === null && me.role === 'user' && me.status === 'student') {
    actions.appendChild(button('ขอเข้าร่วมเป็นกรณีพิเศษ', 'btn btn-sm', function () { return api.post('/api/courses/' + id + '/join'); }));
  }
  if (course.myStatus === 'pending') {
    actions.appendChild(el('span', 'badge group-privacy', 'รออนุมัติคำขอ'));
    actions.appendChild(button('ยกเลิกคำขอ', 'btn btn-ghost btn-sm', function () { return api.post('/api/courses/' + id + '/cancel-request'); }));
  }
  if (course.myStatus === 'member') {
    actions.appendChild(button('ออกจากวิชา', 'btn btn-ghost btn-sm', function () {
      if (!confirm('ออกจากวิชานี้ใช่หรือไม่?')) return Promise.reject(new Error(''));
      return api.post('/api/courses/' + id + '/leave');
    }));
  }
  if (actions.children.length) head.appendChild(actions);
  renderUpcoming();
}

// งานที่ใกล้ถึงกำหนด (นักศึกษา) หรืองานที่รอตรวจ (อาจารย์ผู้ดูแล) แสดงใต้หัวข้อวิชาเพื่อเห็นสิ่งที่ต้องทำก่อน
async function renderUpcoming() {
  if (!isMember(course) && !course.canManage) return;
  const forCourse = course;
  let data;
  try { data = await api.get('/api/courses/' + id + '/assignments'); } catch (e) { return; }
  if (forCourse !== course) return; // มีการโหลดหน้าใหม่ระหว่างรอ
  const isTeacher = course.teachers.some(function (t) { return t._id === me._id; });
  const box = el('div', 'upcoming');
  const open = function () { currentTab = 'assignments'; renderTabs(); };
  if (isTeacher || me.role === 'admin') {
    const waiting = data.assignments.reduce(function (n, a) { return n + (a.counts ? a.counts.submitted - a.counts.graded : 0); }, 0);
    if (!waiting) return;
    box.appendChild(el('div', 'upcoming-title', 'รอตรวจ'));
    const row = el('button', 'upcoming-item');
    row.type = 'button';
    row.append(el('span', 'upcoming-name', 'มีงานที่นักศึกษาส่งแล้วและยังไม่ได้ให้คะแนน ' + waiting + ' ชิ้น'), el('span', 'upcoming-when', 'ดูงาน'));
    row.addEventListener('click', open);
    box.appendChild(row);
  } else {
    const todo = data.assignments.filter(function (a) { return !a.mySubmission && !a.isClosed; }).slice(0, 3);
    if (!todo.length) return;
    box.appendChild(el('div', 'upcoming-title', 'งานที่ต้องส่ง'));
    todo.forEach(function (a) {
      const hours = (new Date(a.dueAt) - Date.now()) / 3600000;
      const when = hours < 0 ? 'เลยกำหนดส่ง' : hours < 24 ? 'ส่งภายใน ' + Math.max(1, Math.round(hours)) + ' ชม.' : 'ส่ง ' + new Date(a.dueAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      const row = el('button', 'upcoming-item');
      row.type = 'button';
      row.append(el('span', 'upcoming-name', a.title), el('span', 'upcoming-when' + (hours < 24 ? ' soon' : ''), when));
      row.addEventListener('click', open);
      box.appendChild(row);
    });
  }
  head.appendChild(box);
}

function button(label, cls, action) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', function () {
    b.disabled = true;
    action().then(reload).catch(function (err) { if (err.message) showAlert(message, err.message); b.disabled = false; });
  });
  return b;
}

function renderTabs() {
  tabsBox.replaceChildren();
  TABS.filter(function (t) { return t.visible(course); }).forEach(function (t) {
    const b = el('button', 'tab', t.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t.id === currentTab));
    b.addEventListener('click', function () { currentTab = t.id; renderTabs(); });
    if (t.id === 'requests' && course.pendingCount) b.appendChild(el('span', 'bell-count tab-count', String(course.pendingCount)));
    tabsBox.appendChild(b);
  });
  const tab = TABS.find(function (t) { return t.id === currentTab && t.visible(course); }) || TABS[0];
  panel.replaceChildren();
  tab.render();
}

// ---------- เวลาเรียน ----------
function renderSchedule() {
  panel.appendChild(el('h2', '', 'เวลาเรียน'));
  if (!course.schedule.length) panel.appendChild(el('p', 'muted', 'ยังไม่ได้กำหนดเวลาเรียน'));
  const list = el('ul', 'slot-list');
  course.schedule.forEach(function (s) { list.appendChild(el('li', '', ScheduleEditor.describe(s))); });
  panel.appendChild(list);
  if (!course.canManage) return;

  const editBtn = el('button', 'btn btn-ghost btn-sm', 'แก้ไขเวลาเรียน');
  editBtn.type = 'button';
  panel.appendChild(editBtn);
  const form = el('div', 'schedule-form hidden');
  const holder = el('div');
  const alertBox = el('p', 'alert');
  alertBox.setAttribute('role', 'alert');
  const actions = el('div', 'row-actions');
  const save = el('button', 'btn btn-sm', 'บันทึก');
  save.type = 'button';
  const cancel = el('button', 'btn btn-ghost btn-sm', 'ยกเลิก');
  cancel.type = 'button';
  actions.append(save, cancel);
  form.append(holder, alertBox, actions);
  panel.appendChild(form);
  const editor = ScheduleEditor.create(holder, course.schedule);

  editBtn.addEventListener('click', function () { form.classList.remove('hidden'); editBtn.classList.add('hidden'); });
  cancel.addEventListener('click', reload);
  async function submit(confirmStudentClash) {
    save.disabled = true;
    try {
      await api.send('PATCH', '/api/courses/' + id + '/schedule', { schedule: editor.getValue(), confirmStudentClash: confirmStudentClash === true });
      await reload();
    } catch (err) {
      if (err.data && err.data.code === 'STUDENT_CLASH') {
        const names = Array.from(new Set(err.data.clashes.map(function (c) { return c.name + ' (ชนกับ ' + c.course + ')'; })));
        if (confirm(err.message + '\n\n' + names.slice(0, 10).join('\n') + (names.length > 10 ? '\n...' : ''))) return submit(true);
      } else {
        showAlert(alertBox, err.message);
      }
      save.disabled = false;
    }
  }
  save.addEventListener('click', function () { submit(false); });
}

// ---------- สมาชิก ----------
async function renderMembers() {
  panel.appendChild(el('h2', '', 'สมาชิก'));
  const box = el('div');
  panel.appendChild(box);
  try {
    const data = await api.get('/api/courses/' + id + '/members');
    if (currentTab !== 'members') return;
    box.appendChild(el('p', 'muted small', data.members.length + ' คน'));
    data.members.forEach(function (m) {
      const row = el('div', 'member-row');
      row.appendChild(ui.avatar(m, 'md'));
      const info = el('div', 'member-info');
      info.appendChild(ui.userLink(m, 'member-name'));
      const sub = el('div', 'muted small', m.memberRole === 'manager' ? 'อาจารย์ผู้ดูแล' : (m.source === 'request' ? 'เข้าร่วมกรณีพิเศษ' : 'ลงทะเบียนเรียน'));
      info.appendChild(sub);
      row.appendChild(info);
      if (course.canManage && m.memberRole !== 'manager' && (m.source !== 'registration' || me.role === 'admin') && m._id) {
        const del = el('button', 'btn btn-ghost btn-sm', 'นำออก');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!confirm('นำ ' + m.displayName + ' ออกจากวิชา?')) return;
          api.send('DELETE', '/api/courses/' + id + '/members/' + m._id).then(reload).catch(function (e) { showAlert(message, e.message); });
        });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  } catch (err) { showAlert(message, err.message); }
}

// ---------- คำขอเข้าร่วมกรณีพิเศษ ----------
async function renderRequests() {
  panel.appendChild(el('h2', '', 'คำขอเข้าร่วมเป็นกรณีพิเศษ'));
  const box = el('div');
  panel.appendChild(box);
  try {
    const data = await api.get('/api/courses/' + id + '/requests');
    if (!data.requests.length) box.appendChild(el('p', 'muted', 'ไม่มีคำขอที่รออนุมัติ'));
    data.requests.forEach(function (r) {
      const row = el('div', 'member-row');
      row.appendChild(ui.avatar(r, 'md'));
      const info = el('div', 'member-info');
      info.appendChild(ui.userLink(r, 'member-name'));
      info.appendChild(el('div', 'muted small', 'รหัส ' + r.studentId + ' · ขอเมื่อ ' + ui.timeAgo(r.requestedAt)));
      row.appendChild(info);
      const act = function (kind) {
        return function () { api.post('/api/courses/' + id + '/requests/' + r._id + '/' + kind).then(reload).catch(function (e) { showAlert(message, e.message); }); };
      };
      const ok = el('button', 'btn btn-sm', 'อนุมัติ'); ok.type = 'button'; ok.addEventListener('click', act('approve'));
      const no = el('button', 'btn btn-ghost btn-sm', 'ปฏิเสธ'); no.type = 'button'; no.addEventListener('click', act('reject'));
      row.append(ok, no);
      box.appendChild(row);
    });
  } catch (err) { showAlert(message, err.message); }
}

async function reload() {
  try {
    course = (await api.get('/api/courses/' + id)).course;
    if (!currentTab || currentTab === 'announcements' && !(isMember(course) || course.canManage)) {
      currentTab = (isMember(course) || course.canManage) ? 'announcements' : 'schedule';
    }
    showAlert(message, '');
    renderHead();
    renderTabs();
  } catch (err) { showAlert(message, err.message); }
}

requireUser({ active: 'courses' }).then(function (user) {
  me = user;
  if (!user) return;
  if (!id) return showAlert(message, 'ไม่พบรหัสวิชา');
  reload();
});

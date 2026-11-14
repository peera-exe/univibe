const el = ui.el;
const message = document.querySelector('#message');
const listBox = document.querySelector('#course-list');
const tabMine = document.querySelector('#tab-mine');
const tabFind = document.querySelector('#tab-find');
const findForm = document.querySelector('#find-form');
const findInput = document.querySelector('#find-q');
const semesterSelect = document.querySelector('#semester');
let mode = 'mine';

const STATUS_TEXT = { member: 'นักศึกษาในวิชา', manager: 'อาจารย์ผู้ดูแล', pending: 'รออนุมัติ' };

function card(c, canRequest) {
  const open = function () { location.href = '/course.html?id=' + c._id; };
  const box = el('article', 'card group-card');
  box.tabIndex = 0;
  box.addEventListener('click', open);
  box.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });

  const head = el('div', 'course-code-row');
  head.appendChild(el('strong', 'course-code', c.code));
  head.appendChild(el('span', 'muted small', 'กลุ่ม ' + c.section + ' · ' + c.semester + ' · ' + c.credits + ' หน่วยกิต'));
  box.appendChild(head);
  box.appendChild(el('div', '', c.name.replace(/^\S+\s/, '')));
  if (c.teachers.length) box.appendChild(el('div', 'muted small', 'อาจารย์: ' + c.teachers.map(function (t) { return t.displayName; }).join(', ')));
  c.schedule.forEach(function (s) { box.appendChild(el('div', 'muted small', ScheduleEditor.describe(s))); });
  if (c.myStatus) {
    const badge = el('span', 'badge group-privacy', STATUS_TEXT[c.myStatus] || c.myStatus);
    box.appendChild(badge);
  } else if (canRequest) {
    const btn = el('button', 'btn btn-ghost btn-sm', 'ขอเข้าร่วมเป็นกรณีพิเศษ');
    btn.type = 'button';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      btn.disabled = true;
      api.post('/api/courses/' + c._id + '/join').then(load).catch(function (err) { showAlert(message, err.message); btn.disabled = false; });
    });
    box.appendChild(btn);
  }
  return box;
}

let me = null;

async function load() {
  const params = new URLSearchParams({ scope: mode });
  if (mode === 'find') {
    if (findInput.value.trim()) params.set('q', findInput.value.trim());
    if (semesterSelect.value) params.set('semester', semesterSelect.value);
  }
  try {
    const data = await api.get('/api/courses?' + params);
    if (mode === 'find' && semesterSelect.options.length <= 1) {
      data.semesters.forEach(function (s) { const o = el('option', '', 'ภาคเรียน ' + s); o.value = s; semesterSelect.appendChild(o); });
    }
    listBox.replaceChildren();
    if (!data.courses.length) {
      listBox.appendChild(el('p', 'muted', mode === 'mine' ? 'คุณยังไม่มีวิชา ลองค้นหาวิชาหรือรอแอดมินลงทะเบียนให้' : 'ไม่พบวิชาที่ตรงกับคำค้น'));
    }
    const canRequest = me.role === 'user' && me.status === 'student';
    data.courses.forEach(function (c) { listBox.appendChild(card(c, canRequest)); });
    showAlert(message, '');
  } catch (err) { showAlert(message, err.message); }
}

function selectMode(next) {
  mode = next;
  tabMine.setAttribute('aria-selected', String(next === 'mine'));
  tabFind.setAttribute('aria-selected', String(next === 'find'));
  findForm.classList.toggle('hidden', next === 'mine');
  load();
}
tabMine.addEventListener('click', function () { selectMode('mine'); });
tabFind.addEventListener('click', function () { selectMode('find'); });
findForm.addEventListener('submit', function (e) { e.preventDefault(); load(); });
semesterSelect.appendChild(Object.assign(el('option', '', 'ทุกภาคเรียน'), { value: '' }));
semesterSelect.addEventListener('change', load);
let timer = null;
findInput.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(load, 300); });

requireUser({ active: 'courses' }).then(function (user) { me = user; if (user) load(); });

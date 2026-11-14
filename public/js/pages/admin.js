// หน้าจัดการระบบ: อาจารย์รออนุมัติ / คิวรายงานโพสต์ / ผู้ใช้ (ระงับบัญชี) / โพสต์และความคิดเห็น
const el = ui.el;
const tabsBox = document.querySelector('#admin-tabs');
const panel = document.querySelector('#panel');
const message = document.querySelector('#message');
let current = new URLSearchParams(location.search).get('tab') || 'teachers';
let openReports = 0;

function btn(label, cls, fn) {
  const b = el('button', 'btn btn-sm ' + (cls || ''), label);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}
const fail = function (err) { showAlert(message, err.message); };
const when = function (iso) { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); };
const snippet = function (text) { text = text || '(ไม่มีข้อความ)'; return text.length > 160 ? text.slice(0, 160) + '…' : text; };

function searchBar(placeholder, onSearch) {
  const form = el('form', 'admin-search');
  form.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = placeholder; input.setAttribute('aria-label', placeholder);
  const go = el('button', 'btn btn-sm', 'ค้นหา');
  go.type = 'submit';
  form.append(input, go);
  form.addEventListener('submit', function (e) { e.preventDefault(); onSearch(input.value.trim()); });
  return form;
}

// ---------- อาจารย์รออนุมัติ ----------
async function renderTeachers() {
  panel.appendChild(el('h2', '', 'อาจารย์ที่รออนุมัติ'));
  panel.appendChild(el('p', 'muted', 'ตรวจสอบข้อมูลของผู้สมัครเป็นอาจารย์ แล้วเลือกอนุมัติหรือไม่อนุมัติ'));
  const data = await api.get('/api/admin/teachers?status=pending');
  if (!data.teachers.length) return panel.appendChild(el('p', 'muted', 'ไม่มีคำขอที่รออนุมัติ'));
  const wrap = el('div', 'table-wrap');
  const table = el('table', 'table');
  const hr = el('tr');
  ['ชื่อ-นามสกุล', 'คณะ / ภาควิชา', 'รหัสบุคลากร', 'อีเมล', 'สมัครเมื่อ', ''].forEach(function (h) { hr.appendChild(el('th', '', h)); });
  table.appendChild(el('thead')).appendChild(hr);
  const body = el('tbody');
  data.teachers.forEach(function (t) {
    const tr = el('tr');
    [t.realName, [t.faculty, t.department].join(' / '), t.staffId, t.email, when(t.createdAt)].forEach(function (v) { tr.appendChild(el('td', '', v)); });
    const td = el('td'); const box = el('div', 'row-actions');
    const decide = function (action) {
      return function () {
        api.post('/api/admin/teachers/' + t._id + '/' + action).then(function () {
          showAlert(message, (action === 'approve' ? 'อนุมัติ ' : 'ไม่อนุมัติ ') + t.displayName + ' แล้ว', 'success');
          render();
        }).catch(fail);
      };
    };
    box.append(btn('อนุมัติ', '', decide('approve')), btn('ไม่อนุมัติ', 'btn-danger', decide('reject')));
    td.appendChild(box); tr.appendChild(td); body.appendChild(tr);
  });
  table.appendChild(body); wrap.appendChild(table); panel.appendChild(wrap);
}

// ---------- รายงานโพสต์ ----------
async function renderReports() {
  panel.appendChild(el('h2', '', 'รายงานโพสต์'));
  const filter = document.createElement('select');
  filter.setAttribute('aria-label', 'สถานะรายงาน');
  [['open', 'รอดำเนินการ'], ['resolved', 'ลบโพสต์แล้ว'], ['dismissed', 'ไม่พบการละเมิด']].forEach(function (s) {
    const o = el('option', '', s[1]); o.value = s[0]; filter.appendChild(o);
  });
  filter.value = renderReports.status || 'open';
  filter.addEventListener('change', function () { renderReports.status = filter.value; render(); });
  panel.appendChild(filter);
  const status = filter.value;
  const data = await api.get('/api/admin/reports?status=' + status);
  openReports = data.openCount; updateTabs();
  if (!data.reports.length) panel.appendChild(el('p', 'muted', 'ไม่มีรายงานในหมวดนี้'));
  data.reports.forEach(function (g) {
    const box = el('article', 'report-group');
    const head = el('div', 'small muted');
    head.appendChild(document.createTextNode('ถูกรายงาน ' + g.reports.length + ' ครั้ง · ครั้งแรก ' + when(g.firstReportedAt) + ' · เจ้าของโพสต์: '));
    head.appendChild(g.post ? ui.userLink(g.post.author) : document.createTextNode('—'));
    box.appendChild(head);
    box.appendChild(el('div', 'report-post', g.post ? snippet(g.post.text) + (g.post.images.length ? ' [รูป ' + g.post.images.length + ']' : '') : '(ไม่พบโพสต์)'));
    if (g.post && g.post.isDeleted) box.appendChild(el('span', 'badge badge-danger', 'โพสต์ถูกลบแล้ว'));
    const list = el('ul', 'report-reasons');
    g.reports.forEach(function (r) {
      const li = el('li', 'small');
      li.appendChild(ui.userLink(r.reporter));
      li.appendChild(document.createTextNode(': ' + r.reason));
      list.appendChild(li);
    });
    box.appendChild(list);
    if (status === 'open' && g.post) {
      const note = document.createElement('input');
      note.type = 'text'; note.maxLength = 500; note.placeholder = 'บันทึกของแอดมิน (ไม่บังคับ)'; note.setAttribute('aria-label', 'บันทึกของแอดมิน');
      const actions = el('div', 'row-actions');
      const resolve = function (action) {
        return function () {
          if (action === 'delete' && !confirm('ลบโพสต์นี้ออกจากระบบ?')) return;
          api.post('/api/admin/reports/post/' + g.post._id + '/resolve', { action: action, note: note.value }).then(function () {
            showAlert(message, action === 'delete' ? 'ลบโพสต์และแจ้งผู้รายงานแล้ว' : 'ยกเลิกรายงานและแจ้งผู้รายงานแล้ว', 'success');
            render();
          }).catch(fail);
        };
      };
      actions.append(btn('ลบโพสต์', 'btn-danger', resolve('delete')), btn('ไม่พบการละเมิด', 'btn-ghost', resolve('dismiss')));
      box.append(note, actions);
    } else if (g.resolutionNote) {
      box.appendChild(el('p', 'muted small', 'บันทึก: ' + g.resolutionNote));
    }
    panel.appendChild(box);
  });
}

// ---------- ผู้ใช้ / ระงับบัญชี ----------
async function renderUsers() {
  panel.appendChild(el('h2', '', 'ผู้ใช้'));
  const state = renderUsers.state || (renderUsers.state = { q: '', filter: 'all' });
  panel.appendChild(searchBar('ค้นหาชื่อ username รหัสนักศึกษา หรืออีเมล', function (q) { state.q = q; render(); }));
  const tabs = el('div', 'row-actions');
  [['all', 'ทั้งหมด'], ['suspended', 'ที่ถูกระงับ']].forEach(function (f) {
    tabs.appendChild(btn(f[1], state.filter === f[0] ? '' : 'btn-ghost', function () { state.filter = f[0]; render(); }));
  });
  panel.appendChild(tabs);
  const data = await api.get('/api/admin/users?filter=' + state.filter + '&q=' + encodeURIComponent(state.q));
  if (!data.users.length) return panel.appendChild(el('p', 'muted', 'ไม่พบผู้ใช้'));
  const wrap = el('div', 'table-wrap'); const table = el('table', 'table');
  const hr = el('tr');
  ['ผู้ใช้', 'สถานะ', 'เข้าสู่ระบบล่าสุด', ''].forEach(function (h) { hr.appendChild(el('th', '', h)); });
  table.appendChild(el('thead')).appendChild(hr);
  const body = el('tbody');
  data.users.forEach(function (u) {
    const tr = el('tr');
    const name = el('td'); name.appendChild(ui.userLink(u, 'member-name'));
    name.appendChild(el('div', 'muted small', '@' + u.username + (u.studentId ? ' · ' + u.studentId : '') + ' · ' + u.email));
    tr.appendChild(name);
    const st = el('td', 'small', ({ admin: 'แอดมิน', teacher: 'อาจารย์' })[u.role] || (u.status === 'alumni' ? 'ศิษย์เก่า' : 'นักศึกษา'));
    if (u.isSuspended) { st.appendChild(el('br')); st.appendChild(el('span', 'badge badge-danger', 'ถูกระงับ' + (u.suspendedReason ? ': ' + u.suspendedReason : ''))); }
    tr.appendChild(st);
    tr.appendChild(el('td', 'small', u.lastLoginAt ? when(u.lastLoginAt) : '—'));
    const td = el('td');
    if (u.role !== 'admin') {
      if (u.isSuspended) {
        td.appendChild(btn('ปลดระงับ', 'btn-ghost', function () {
          api.post('/api/admin/users/' + u._id + '/unsuspend').then(function () { showAlert(message, 'ปลดระงับ ' + u.displayName + ' แล้ว', 'success'); render(); }).catch(fail);
        }));
      } else {
        td.appendChild(btn('ระงับ', 'btn-danger', function () {
          const reason = window.prompt('เหตุผลที่ระงับบัญชี ' + u.displayName + ' (ไม่บังคับ)', '');
          if (reason === null) return;
          api.post('/api/admin/users/' + u._id + '/suspend', { reason: reason }).then(function () { showAlert(message, 'ระงับ ' + u.displayName + ' แล้ว ผู้ใช้จะถูกออกจากระบบทันที', 'success'); render(); }).catch(fail);
        }));
      }
    }
    tr.appendChild(td); body.appendChild(tr);
  });
  table.appendChild(body); wrap.appendChild(table); panel.appendChild(wrap);
}

// ---------- โพสต์และความคิดเห็น ----------
async function renderContent() {
  panel.appendChild(el('h2', '', 'โพสต์และความคิดเห็น'));
  const state = renderContent.state || (renderContent.state = { q: '', kind: 'posts' });
  panel.appendChild(searchBar('ค้นหาข้อความในโพสต์หรือความคิดเห็น', function (q) { state.q = q; render(); }));
  const kinds = el('div', 'row-actions');
  [['posts', 'โพสต์'], ['comments', 'ความคิดเห็น']].forEach(function (k) {
    kinds.appendChild(btn(k[1], state.kind === k[0] ? '' : 'btn-ghost', function () { state.kind = k[0]; render(); }));
  });
  panel.appendChild(kinds);
  const list = el('div');
  panel.appendChild(list);
  const more = btn('โหลดเพิ่ม', 'btn-ghost', function () { loadMore(); });
  more.classList.add('hidden');
  panel.appendChild(more);
  let before = '';

  async function loadMore() {
    const params = new URLSearchParams({ q: state.q });
    if (before) params.set('before', before);
    const data = await api.get('/api/admin/' + state.kind + '?' + params);
    const rows = data[state.kind];
    rows.forEach(function (item) {
      const row = el('article', 'report-group');
      const meta = el('div', 'small muted');
      meta.appendChild(ui.userLink(item.author));
      meta.appendChild(document.createTextNode(' · ' + when(item.createdAt) + (state.kind === 'posts' ? ' · ความคิดเห็น ' + item.commentsCount + (item.imagesCount ? ' · รูป ' + item.imagesCount : '') : '')));
      row.appendChild(meta);
      const text = el('div', 'snippet', snippet(item.text));
      row.appendChild(text);
      const actions = el('div', 'row-actions');
      const link = el('a', 'btn btn-ghost btn-sm', 'เปิดดู');
      link.href = '/post.html?id=' + (state.kind === 'posts' ? item._id : item.post);
      actions.appendChild(link);
      actions.appendChild(btn('ลบ', 'btn-danger', function () {
        if (!confirm('ลบ' + (state.kind === 'posts' ? 'โพสต์' : 'ความคิดเห็น') + 'นี้?')) return;
        api.send('DELETE', '/api/' + state.kind + '/' + item._id).then(function () { row.remove(); showAlert(message, 'ลบแล้ว', 'success'); }).catch(fail);
      }));
      row.appendChild(actions);
      list.appendChild(row);
    });
    if (rows.length) before = rows[rows.length - 1]._id;
    more.classList.toggle('hidden', rows.length < 20);
    if (!list.children.length) list.appendChild(el('p', 'muted', 'ไม่พบเนื้อหา'));
  }
  await loadMore();
}

const TABS = [
  { id: 'teachers', label: 'อาจารย์รออนุมัติ', render: renderTeachers },
  { id: 'reports', label: 'รายงานโพสต์', render: renderReports },
  { id: 'users', label: 'ผู้ใช้', render: renderUsers },
  { id: 'content', label: 'โพสต์/ความคิดเห็น', render: renderContent },
];

function updateTabs() {
  tabsBox.replaceChildren();
  TABS.forEach(function (t) {
    const b = el('button', 'tab', t.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t.id === current));
    if (t.id === 'reports' && openReports) b.appendChild(el('span', 'bell-count tab-count', String(openReports)));
    b.addEventListener('click', function () { current = t.id; showAlert(message, ''); render(); });
    tabsBox.appendChild(b);
  });
}

async function render() {
  updateTabs();
  panel.replaceChildren();
  const tab = TABS.find(function (t) { return t.id === current; }) || TABS[0];
  try { await tab.render(); } catch (err) { fail(err); }
}

requireUser({ role: 'admin', active: 'admin' }).then(function (user) {
  if (!user) return;
  api.get('/api/admin/reports?status=open').then(function (d) { openReports = d.openCount; updateTabs(); }).catch(function () {});
  render();
});

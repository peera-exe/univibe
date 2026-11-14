const el = ui.el;
const id = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#message');
const cardBox = document.querySelector('#group-card');
const editForm = document.querySelector('#edit-form');
const editMessage = document.querySelector('#edit-message');
const requestsCard = document.querySelector('#requests-card');
const membersCard = document.querySelector('#members-card');
let me = null;
let group = null;

function fail(err) { showAlert(message, err.message); }

function actionButton(label, className, handler) {
  const b = el('button', 'btn btn-sm ' + (className || ''), label);
  b.type = 'button';
  b.addEventListener('click', handler);
  return b;
}

function renderCard() {
  cardBox.replaceChildren();
  document.title = group.name + ' - UniVibe';
  const head = el('div', 'group-head');
  head.appendChild(ui.avatar({ displayName: group.name, avatarUrl: group.avatarUrl }, 'xl'));
  const info = el('div', 'group-head-info');
  const nameRow = el('div', 'post-name');
  nameRow.appendChild(el('h1', '', group.name));
  nameRow.appendChild(el('span', 'badge', group.privacy === 'open' ? 'กลุ่มเปิด' : 'กลุ่มปิด'));
  info.appendChild(nameRow);
  info.appendChild(el('div', 'muted small', 'สมาชิก ' + group.membersCount + ' คน'));
  if (group.description) info.appendChild(el('p', 'group-desc', group.description));
  head.appendChild(info);
  cardBox.appendChild(head);

  const actions = el('div', 'row-actions group-actions');
  const isMember = group.myStatus === 'owner' || group.myStatus === 'member';
  if (isMember && group.conversationId) {
    const chat = el('a', 'btn btn-sm', 'เปิดแชทกลุ่ม');
    chat.href = '/chat.html?c=' + group.conversationId;
    actions.appendChild(chat);
  }
  if (group.myStatus === 'owner') {
    actions.appendChild(actionButton('แก้ไขกลุ่ม', 'btn-ghost', openEdit));
  } else if (group.myStatus === 'member') {
    actions.appendChild(actionButton('ออกจากกลุ่ม', 'btn-ghost', function () {
      if (window.confirm('ออกจากกลุ่มนี้ใช่หรือไม่?')) post('/leave');
    }));
  } else if (group.myStatus === 'pending') {
    actions.appendChild(el('span', 'badge', 'รอการอนุมัติ'));
    actions.appendChild(actionButton('ยกเลิกคำขอ', 'btn-ghost', function () { post('/leave'); }));
  } else {
    actions.appendChild(actionButton(group.privacy === 'open' ? 'เข้าร่วมกลุ่ม' : 'ขอเข้าร่วมกลุ่ม', '', function () { post('/join'); }));
  }
  cardBox.appendChild(actions);
  if (!isMember) cardBox.appendChild(el('p', 'muted small', 'เข้าร่วมกลุ่มเพื่อดูรายชื่อสมาชิกและแชทกับสมาชิก'));
}

async function post(path) {
  try {
    await api.post('/api/groups/' + id + path);
    showAlert(message, '');
    await load();
  } catch (err) { fail(err); }
}

function personRow(u, buttons) {
  const row = el('div', 'person-row');
  row.appendChild(ui.avatar(u, 'md'));
  const info = el('div', 'person-info');
  info.appendChild(ui.userLink(u, 'name-link'));
  const meta = el('div', 'muted small', '@' + u.username);
  if (u.role === 'owner') meta.appendChild(el('span', 'badge', 'เจ้าของกลุ่ม'));
  info.appendChild(meta);
  row.appendChild(info);
  const box = el('div', 'row-actions');
  buttons.forEach(function (b) { box.appendChild(b); });
  row.appendChild(box);
  return row;
}

async function loadMembers() {
  const list = document.querySelector('#member-list');
  const data = await api.get('/api/groups/' + id + '/members');
  list.replaceChildren();
  data.members.forEach(function (m) {
    const buttons = [];
    if (group.isOwner && m.role !== 'owner') {
      buttons.push(actionButton('นำออก', 'btn-danger', async function () {
        if (!window.confirm('นำ ' + m.displayName + ' ออกจากกลุ่มใช่หรือไม่?')) return;
        try { await api.send('DELETE', '/api/groups/' + id + '/members/' + m._id); await load(); } catch (err) { fail(err); }
      }));
    }
    list.appendChild(personRow(m, buttons));
  });
}

async function loadRequests() {
  const list = document.querySelector('#request-list');
  const data = await api.get('/api/groups/' + id + '/requests');
  requestsCard.classList.toggle('hidden', data.requests.length === 0);
  list.replaceChildren();
  data.requests.forEach(function (u) {
    const decide = function (action) {
      return async function () {
        try { await api.post('/api/groups/' + id + '/requests/' + u._id + '/' + action); await load(); } catch (err) { fail(err); }
      };
    };
    list.appendChild(personRow(u, [actionButton('อนุมัติ', '', decide('approve')), actionButton('ปฏิเสธ', 'btn-danger', decide('reject'))]));
  });
}

function openEdit() {
  document.querySelector('#e-name').value = group.name;
  document.querySelector('#e-desc').value = group.description || '';
  document.querySelector('#e-privacy').value = group.privacy;
  document.querySelector('#e-image').value = '';
  showAlert(editMessage, '');
  editForm.classList.remove('hidden');
}

document.querySelector('#cancel-edit').addEventListener('click', function () { editForm.classList.add('hidden'); });
editForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  const name = document.querySelector('#e-name').value.trim();
  if (!name) return showAlert(editMessage, 'กรุณากรอกชื่อกลุ่ม');
  const file = document.querySelector('#e-image').files[0];
  if (file && file.size > 2 * 1024 * 1024) return showAlert(editMessage, 'รูปกลุ่มต้องมีขนาดไม่เกิน 2 MB');
  const form = new FormData();
  form.append('name', name);
  form.append('description', document.querySelector('#e-desc').value);
  form.append('privacy', document.querySelector('#e-privacy').value);
  if (file) form.append('image', file);
  try {
    const res = await fetch('/api/groups/' + id, { method: 'PATCH', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
    editForm.classList.add('hidden');
    await load();
  } catch (err) { showAlert(editMessage, err.message); }
});

async function load() {
  try {
    group = (await api.get('/api/groups/' + encodeURIComponent(id || ''))).group;
  } catch (err) {
    cardBox.replaceChildren();
    return showAlert(message, err.status === 404 ? 'ไม่พบกลุ่มนี้' : err.message);
  }
  renderCard();
  const isMember = group.myStatus === 'owner' || group.myStatus === 'member';
  membersCard.classList.toggle('hidden', !isMember);
  if (isMember) loadMembers().catch(fail);
  if (group.isOwner) loadRequests().catch(fail); else requestsCard.classList.add('hidden');
}

requireUser({ active: 'groups' }).then(function (user) {
  if (!user) return;
  me = user;
  load();
});

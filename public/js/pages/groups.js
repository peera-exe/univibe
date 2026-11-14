const el = ui.el;
const message = document.querySelector('#message');
const listBox = document.querySelector('#group-list');
const tabMine = document.querySelector('#tab-mine');
const tabFind = document.querySelector('#tab-find');
const findForm = document.querySelector('#find-form');
const findInput = document.querySelector('#find-q');
const createForm = document.querySelector('#create-form');
const createMessage = document.querySelector('#create-message');
let mode = 'mine';

function statusButton(g, refresh) {
  const btn = el('button', 'btn btn-sm');
  btn.type = 'button';
  const act = function (path, after) {
    return function (event) {
      event.stopPropagation();
      btn.disabled = true;
      api.post('/api/groups/' + g._id + path).then(after || refresh).catch(function (err) { showAlert(message, err.message); btn.disabled = false; });
    };
  };
  if (g.myStatus === 'owner' || g.myStatus === 'member') {
    btn.textContent = 'เปิดกลุ่ม';
    btn.addEventListener('click', function (e) { e.stopPropagation(); location.href = '/group.html?id=' + g._id; });
  } else if (g.myStatus === 'pending') {
    btn.textContent = 'ยกเลิกคำขอ';
    btn.classList.add('btn-ghost');
    btn.addEventListener('click', act('/leave'));
  } else {
    btn.textContent = g.privacy === 'open' ? 'เข้าร่วม' : 'ขอเข้าร่วม';
    btn.addEventListener('click', act('/join'));
  }
  return btn;
}

function card(g, refresh) {
  const c = el('article', 'card group-card');
  c.tabIndex = 0;
  c.addEventListener('click', function () { location.href = '/group.html?id=' + g._id; });
  c.addEventListener('keydown', function (e) { if (e.key === 'Enter') location.href = '/group.html?id=' + g._id; });
  const head = el('div', 'group-card-head');
  head.appendChild(ui.avatar({ displayName: g.name, avatarUrl: g.avatarUrl }, 'lg'));
  const info = el('div', 'group-card-info');
  info.appendChild(el('strong', '', g.name));
  const meta = el('div', 'muted small', 'สมาชิก ' + g.membersCount + ' คน');
  meta.appendChild(el('span', 'badge group-privacy', g.privacy === 'open' ? 'กลุ่มเปิด' : 'กลุ่มปิด'));
  info.appendChild(meta);
  head.appendChild(info);
  c.appendChild(head);
  if (g.description) c.appendChild(el('p', 'group-desc muted small', g.description));
  c.appendChild(statusButton(g, refresh));
  return c;
}

async function load() {
  const url = mode === 'mine' ? '/api/groups/mine' : '/api/groups?q=' + encodeURIComponent(findInput.value.trim());
  try {
    const data = await api.get(url);
    listBox.replaceChildren();
    if (!data.groups.length) {
      listBox.appendChild(el('p', 'muted', mode === 'mine' ? 'คุณยังไม่ได้เข้าร่วมกลุ่มใด ลองค้นหากลุ่มหรือสร้างกลุ่มใหม่' : 'ไม่พบกลุ่มที่ตรงกับคำค้น'));
    }
    data.groups.forEach(function (g) { listBox.appendChild(card(g, load)); });
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
let findTimer = null;
findInput.addEventListener('input', function () { clearTimeout(findTimer); findTimer = setTimeout(load, 300); });

document.querySelector('#toggle-create').addEventListener('click', function () { createForm.classList.toggle('hidden'); });
document.querySelector('#cancel-create').addEventListener('click', function () { createForm.classList.add('hidden'); });

createForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  const name = document.querySelector('#g-name').value.trim();
  if (!name) return showAlert(createMessage, 'กรุณากรอกชื่อกลุ่ม');
  const file = document.querySelector('#g-image').files[0];
  if (file && file.size > 2 * 1024 * 1024) return showAlert(createMessage, 'รูปกลุ่มต้องมีขนาดไม่เกิน 2 MB');
  const form = new FormData();
  form.append('name', name);
  form.append('description', document.querySelector('#g-desc').value);
  form.append('privacy', document.querySelector('#g-privacy').value);
  if (file) form.append('image', file);
  try {
    const res = await fetch('/api/groups', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'สร้างกลุ่มไม่สำเร็จ');
    location.href = '/group.html?id=' + data.group._id;
  } catch (err) { showAlert(createMessage, err.message); }
});

requireUser({ active: 'groups' }).then(function (user) { if (user) load(); });

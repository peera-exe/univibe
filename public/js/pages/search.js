const el = ui.el;
const q = (new URLSearchParams(location.search).get('q') || '').trim();
const tabUsers = document.querySelector('#tab-users');
const tabPosts = document.querySelector('#tab-posts');
const userPanel = document.querySelector('#user-panel');
const postPanel = document.querySelector('#post-panel');
const usersBox = document.querySelector('#users');
const statusFilter = document.querySelector('#status-filter');
let postList = null;

document.querySelector('#title').textContent = q ? 'ค้นหา: ' + q : 'ค้นหา';

function userCard(u) {
  const a = el('a', 'card user-card');
  a.href = '/profile.html?u=' + encodeURIComponent(u.username);
  a.appendChild(ui.avatar(u, 'lg'));
  const info = el('div', 'user-card-info');
  const row = el('div', 'post-name');
  row.appendChild(el('strong', '', u.displayName));
  row.appendChild(roleBadge(u));
  info.appendChild(row);
  info.appendChild(el('div', 'muted small', '@' + u.username));
  const detail = [u.faculty, u.major || u.department].filter(Boolean).join(' · ');
  if (detail) info.appendChild(el('div', 'muted small', detail));
  a.appendChild(info);
  return a;
}

function loadUsers() {
  const params = new URLSearchParams({ q: q });
  if (statusFilter.value) params.set('status', statusFilter.value);
  api.get('/api/users/search?' + params.toString()).then(function (d) {
    usersBox.replaceChildren();
    if (!d.users.length) usersBox.appendChild(el('p', 'muted', 'ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข'));
    d.users.forEach(function (u) { usersBox.appendChild(userCard(u)); });
  }).catch(function (err) { usersBox.replaceChildren(el('p', 'alert alert-error', err.message)); });
}

function selectTab(users) {
  tabUsers.setAttribute('aria-selected', String(users));
  tabPosts.setAttribute('aria-selected', String(!users));
  userPanel.classList.toggle('hidden', !users);
  postPanel.classList.toggle('hidden', users);
  if (!users && !postList) {
    postList = createPostList(document.querySelector('#posts'), function (cursor) {
      const params = new URLSearchParams({ q: q });
      if (cursor) params.set('before', cursor);
      return api.get('/api/posts/search?' + params.toString());
    });
    postList.reload();
  }
}

tabUsers.addEventListener('click', function () { selectTab(true); });
tabPosts.addEventListener('click', function () { selectTab(false); });
statusFilter.addEventListener('change', loadUsers);

requireUser().then(function (user) {
  if (!user) return;
  document.querySelector('#topbar input[type="search"]').value = q;
  loadUsers();
});

const el = ui.el;
const username = new URLSearchParams(location.search).get('u');
const box = document.querySelector('#profile');
const postsBox = document.querySelector('#posts');

// กดที่ตัวเลขผู้ติดตาม/กำลังติดตามเพื่อดูรายชื่อ (ถ้าเจ้าของโปรไฟล์อนุญาต)
function stat(number, label, u, kind) {
  const clickable = Boolean(kind) && u.canViewConnections;
  const s = el(clickable ? 'button' : 'div', 'stat' + (clickable ? ' stat-btn' : ''));
  if (clickable) { s.type = 'button'; s.addEventListener('click', function () { openConnections(u, kind); }); }
  else if (kind) s.title = 'ผู้ใช้นี้ไม่เปิดให้ดูรายชื่อ';
  s.appendChild(el('strong', '', String(number)));
  s.appendChild(el('span', 'muted small', label));
  return s;
}

function openConnections(u, startKind) {
  const overlay = el('div', 'modal-overlay');
  const dlg = el('div', 'modal');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', 'ผู้ติดตามและกำลังติดตามของ ' + u.displayName);
  const head = el('div', 'modal-head');
  head.appendChild(el('strong', '', '@' + u.username));
  const close = el('button', 'btn btn-ghost btn-sm modal-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'ปิด');
  head.appendChild(close);
  const tabs = el('div', 'modal-tabs');
  const body = el('div', 'modal-body');
  dlg.appendChild(head); dlg.appendChild(tabs); dlg.appendChild(body);
  overlay.appendChild(dlg);

  const buttons = {};
  [['followers', 'ผู้ติดตาม', u.followers], ['following', 'กำลังติดตาม', u.following]].forEach(function (t) {
    const b = el('button', 'modal-tab', t[2] + ' ' + t[1]);
    b.type = 'button';
    b.addEventListener('click', function () { show(t[0]); });
    buttons[t[0]] = b;
    tabs.appendChild(b);
  });

  async function show(kind) {
    Object.keys(buttons).forEach(function (k) { buttons[k].classList.toggle('active', k === kind); });
    body.replaceChildren(el('p', 'muted small pad', 'กำลังโหลด...'));
    try {
      const data = await api.get('/api/users/' + encodeURIComponent(u.username) + '/' + kind);
      body.replaceChildren();
      if (!data.users.length) body.appendChild(el('p', 'muted pad', kind === 'followers' ? 'ยังไม่มีผู้ติดตาม' : 'ยังไม่ได้ติดตามใคร'));
      data.users.forEach(function (p) {
        const row = el('div', 'person-row');
        row.appendChild(ui.avatar(p, 'md'));
        const info = el('div', 'person-info');
        info.appendChild(ui.userLink(p, 'name-link'));
        info.appendChild(el('div', 'muted small', '@' + p.username));
        row.appendChild(info);
        if (!p.isMe && !u.isBlocked) {
          const fb = el('button', 'btn btn-sm follow-mini');
          fb.type = 'button';
          const paint = function () { fb.textContent = p.isFollowing ? 'กำลังติดตาม' : 'ติดตาม'; fb.classList.toggle('btn-ghost', p.isFollowing); };
          paint();
          fb.addEventListener('click', function () {
            fb.disabled = true;
            api.send(p.isFollowing ? 'DELETE' : 'POST', '/api/users/' + p._id + '/follow')
              .then(function (d) { p.isFollowing = d.following; paint(); })
              .catch(function (err) { alert(err.message); })
              .then(function () { fb.disabled = false; });
          });
          row.appendChild(fb);
        }
        body.appendChild(row);
      });
    } catch (err) {
      body.replaceChildren(el('p', 'muted pad', err.message));
    }
  }

  function closeIt() { document.removeEventListener('keydown', onKey); overlay.remove(); }
  function onKey(e) { if (e.key === 'Escape') closeIt(); }
  close.addEventListener('click', closeIt);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeIt(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  close.focus();
  show(startKind);
}

function render(u) {
  box.replaceChildren();
  const cover = el('div', 'profile-cover');
  if (u.coverUrl) {
    const img = document.createElement('img');
    img.src = u.coverUrl;
    img.alt = '';
    cover.appendChild(img);
  }
  box.appendChild(cover);

  const head = el('div', 'profile-head');
  head.appendChild(ui.avatar(u, 'xl'));
  const info = el('div', 'profile-info');
  const nameRow = el('div', 'post-name');
  nameRow.appendChild(el('h1', '', u.displayName));
  nameRow.appendChild(roleBadge(u));
  info.appendChild(nameRow);
  info.appendChild(el('div', 'muted', '@' + u.username));
  const detail = [u.faculty, u.major || u.department].filter(Boolean).join(' · ');
  if (detail) info.appendChild(el('div', 'muted small', detail));
  head.appendChild(info);

  const actions = el('div', 'profile-actions');
  if (u.isMe) {
    const edit = el('a', 'btn btn-ghost btn-sm', 'แก้ไขโปรไฟล์');
    edit.href = '/settings.html';
    actions.appendChild(edit);
  } else {
    const canInteract = !u.isBlocked && !u.blockedMe;
    if (canInteract) {
      const btn = el('button', 'btn btn-sm');
      btn.type = 'button';
      const paint = function () {
        btn.textContent = u.isFollowing ? 'เลิกติดตาม' : 'ติดตาม';
        btn.classList.toggle('btn-ghost', u.isFollowing);
      };
      paint();
      btn.addEventListener('click', function () {
        btn.disabled = true;
        api.send(u.isFollowing ? 'DELETE' : 'POST', '/api/users/' + u._id + '/follow')
          .then(function (d) {
            u.isFollowing = d.following;
            u.followers += d.following ? 1 : -1;
            render(u);
          })
          .catch(function (err) { alert(err.message); btn.disabled = false; });
      });
      actions.appendChild(btn);

      const chat = el('a', 'btn btn-ghost btn-sm', 'ส่งข้อความ');
      chat.href = '/chat.html?u=' + u._id;
      actions.appendChild(chat);
    }
    const blockBtn = el('button', 'btn btn-ghost btn-sm', u.isBlocked ? 'เลิกบล็อก' : 'บล็อก');
    blockBtn.type = 'button';
    blockBtn.addEventListener('click', function () {
      if (!u.isBlocked && !window.confirm('บล็อก ' + u.displayName + '? จะส่งข้อความหรือติดตามกันไม่ได้ และการติดตามที่มีอยู่จะถูกยกเลิก')) return;
      blockBtn.disabled = true;
      api.send(u.isBlocked ? 'DELETE' : 'POST', '/api/users/' + u._id + '/block')
        .then(function () { return loadProfile(); })
        .catch(function (err) { alert(err.message); blockBtn.disabled = false; });
    });
    actions.appendChild(blockBtn);
  }
  head.appendChild(actions);
  box.appendChild(head);

  if (u.isBlocked) box.appendChild(el('p', 'profile-note muted small', 'คุณบล็อกผู้ใช้นี้อยู่ จะติดตามหรือส่งข้อความถึงกันไม่ได้'));
  else if (u.blockedMe) box.appendChild(el('p', 'profile-note muted small', 'ไม่สามารถติดตามหรือส่งข้อความถึงผู้ใช้นี้ได้'));
  if (u.bio) box.appendChild(el('p', 'profile-bio', u.bio));
  const stats = el('div', 'stats');
  stats.appendChild(stat(u.postsCount, 'โพสต์'));
  stats.appendChild(stat(u.followers, 'ผู้ติดตาม', u, 'followers'));
  stats.appendChild(stat(u.following, 'กำลังติดตาม', u, 'following'));
  box.appendChild(stats);
}

// ---------- แท็บ โพสต์ / รูป (คล้าย IG) ----------
let photosLoaded = false;
let photoCursor = null;

function setupTabs() {
  const tabs = { posts: document.querySelector('#ptab-posts'), photos: document.querySelector('#ptab-photos') };
  const panes = { posts: postsBox, photos: document.querySelector('#photos') };
  function select(name) {
    Object.keys(tabs).forEach(function (k) {
      tabs[k].classList.toggle('active', k === name);
      tabs[k].setAttribute('aria-selected', String(k === name));
      panes[k].classList.toggle('hidden', k !== name);
    });
    if (name === 'photos' && !photosLoaded) { photosLoaded = true; loadPhotos(); }
  }
  tabs.posts.addEventListener('click', function () { select('posts'); });
  tabs.photos.addEventListener('click', function () { select('photos'); });
  document.querySelector('#photo-more').addEventListener('click', loadPhotos);
}

async function loadPhotos() {
  const grid = document.querySelector('#photo-grid');
  const more = document.querySelector('#photo-more');
  more.disabled = true;
  try {
    const data = await api.get('/api/users/' + encodeURIComponent(username) + '/photos' + (photoCursor ? '?before=' + photoCursor : ''));
    data.photos.forEach(function (p) {
      const a = el('a', 'photo-tile');
      a.href = '/post.html?id=' + p.postId;
      a.setAttribute('aria-label', 'เปิดโพสต์');
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = '';
      img.loading = 'lazy';
      a.appendChild(img);
      if (p.count > 1 && p.index === 0) a.appendChild(el('span', 'photo-multi', '1/' + p.count));
      grid.appendChild(a);
    });
    photoCursor = data.nextCursor;
    more.classList.toggle('hidden', !photoCursor);
    document.querySelector('#photo-empty').classList.toggle('hidden', grid.children.length > 0);
  } catch (err) {
    document.querySelector('#photo-empty').textContent = err.message;
    document.querySelector('#photo-empty').classList.remove('hidden');
  }
  more.disabled = false;
}

async function loadProfile() {
  const data = await api.get('/api/users/' + encodeURIComponent(username));
  document.title = data.user.displayName + ' - UniVibe';
  render(data.user);
}

requireUser({ active: 'profile' }).then(async function (me) {
  if (!me) return;
  if (!username) { location.replace('/profile.html?u=' + encodeURIComponent(me.username)); return; }
  try {
    await loadProfile();
    createPostList(postsBox, function (cursor) {
      const q = cursor ? '?before=' + cursor : '';
      return api.get('/api/users/' + encodeURIComponent(username) + '/posts' + q);
    }).reload();
    setupTabs();
  } catch (err) {
    box.replaceChildren(el('p', 'muted', err.status === 404 ? 'ไม่พบผู้ใช้นี้' : err.message));
    document.querySelector('#profile-tabs').classList.add('hidden');
  }
});

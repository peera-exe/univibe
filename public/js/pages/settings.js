const el = ui.el;
let current = null;

function paintImages() {
  const av = document.querySelector('#avatar-preview');
  av.replaceChildren(ui.avatar(current, 'xl'));
  const cv = document.querySelector('#cover-preview');
  cv.replaceChildren();
  if (current.coverUrl) {
    const img = document.createElement('img');
    img.src = current.coverUrl;
    img.alt = 'รูปปก';
    cv.appendChild(img);
  } else {
    cv.appendChild(el('span', 'muted small', 'ยังไม่มีรูปปก'));
  }
}

function fillForm() {
  document.querySelector('#displayName').value = current.displayName;
  document.querySelector('#username').value = current.username;
  document.querySelector('#connectionsVisibility').value = current.connectionsVisibility || 'everyone';
  document.querySelector('#allowMessagesFrom').value = current.allowMessagesFrom || 'everyone';
  document.querySelector('#showFacultyMajor').checked = current.showFacultyMajor !== false;
  document.querySelector('#showOnlineStatus').checked = current.showOnlineStatus !== false;
  document.querySelector('#bio').value = current.bio || '';
  document.querySelector('#email').value = current.email;
  const parts = [current.realName];
  if (current.studentId) parts.push('รหัส ' + current.studentId);
  if (current.faculty) parts.push(current.faculty);
  document.querySelector('#registry-info').textContent = parts.join(' · ');
  paintImages();
}

function msg(id) { return document.querySelector(id); }

async function uploadImage(kind, input, message) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { input.value = ''; return showAlert(message, 'รูปต้องมีขนาดไม่เกิน 2 MB'); }
  const form = new FormData();
  form.append('image', file);
  try {
    const res = await fetch('/api/users/me/' + kind, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'อัปโหลดไม่สำเร็จ');
    current = Object.assign(current, data.user);
    paintImages();
    showAlert(message, 'อัปโหลดรูปแล้ว', 'success');
  } catch (err) {
    showAlert(message, err.message);
  }
  input.value = '';
}

async function loadBlocks() {
  const box = document.querySelector('#block-list');
  const data = await api.get('/api/users/me/blocks');
  box.replaceChildren();
  if (!data.users.length) box.appendChild(el('p', 'muted small', 'ยังไม่มีผู้ใช้ที่ถูกบล็อก'));
  data.users.forEach(function (u) {
    const row = el('div', 'person-row');
    row.appendChild(ui.avatar(u, 'md'));
    const info = el('div', 'person-info');
    info.appendChild(ui.userLink(u, 'name-link'));
    info.appendChild(el('div', 'muted small', '@' + u.username));
    row.appendChild(info);
    const btn = el('button', 'btn btn-ghost btn-sm', 'เลิกบล็อก');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      api.send('DELETE', '/api/users/' + u._id + '/block').then(loadBlocks).catch(function (err) { alert(err.message); });
    });
    row.appendChild(btn);
    box.appendChild(row);
  });
}

requireUser({ active: 'settings' }).then(function (user) {
  if (!user) return;
  current = user;
  fillForm();
  loadBlocks().catch(function () {});

  document.querySelector('#avatar-file').addEventListener('change', function (e) { uploadImage('avatar', e.target, msg('#profile-message')); });
  document.querySelector('#cover-file').addEventListener('change', function (e) { uploadImage('cover', e.target, msg('#profile-message')); });

  document.querySelector('#profile-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const m = msg('#profile-message');
    const username = document.querySelector('#username').value.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return showAlert(m, 'username ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว');
    try {
      const d = await api.send('PATCH', '/api/users/me', {
        username: username,
        bio: document.querySelector('#bio').value,
      });
      current = Object.assign(current, d.user);
      document.querySelector('#username').value = current.username;
      showAlert(m, 'บันทึกโปรไฟล์แล้ว', 'success');
    } catch (err) { showAlert(m, err.message); }
  });

  document.querySelector('#privacy-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const m = msg('#privacy-message');
    try {
      const d = await api.send('PATCH', '/api/users/me', {
        connectionsVisibility: document.querySelector('#connectionsVisibility').value,
        allowMessagesFrom: document.querySelector('#allowMessagesFrom').value,
        showFacultyMajor: document.querySelector('#showFacultyMajor').checked,
        showOnlineStatus: document.querySelector('#showOnlineStatus').checked,
      });
      current = Object.assign(current, d.user);
      showAlert(m, 'บันทึกความเป็นส่วนตัวแล้ว', 'success');
    } catch (err) { showAlert(m, err.message); }
  });

  document.querySelector('#password-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const m = msg('#password-message');
    const oldPassword = document.querySelector('#oldPassword').value;
    const newPassword = document.querySelector('#newPassword').value;
    if (newPassword.length < 8) return showAlert(m, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร');
    if (newPassword !== document.querySelector('#confirmPassword').value) return showAlert(m, 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
    try {
      await api.post('/api/users/me/password', { oldPassword: oldPassword, newPassword: newPassword });
      e.target.reset();
      showAlert(m, 'เปลี่ยนรหัสผ่านแล้ว', 'success');
    } catch (err) { showAlert(m, err.message); }
  });

  document.querySelector('#email-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const m = msg('#email-message');
    try {
      const d = await api.post('/api/users/me/email', {
        email: document.querySelector('#email').value,
        password: document.querySelector('#emailPassword').value,
      });
      current = Object.assign(current, d.user);
      document.querySelector('#emailPassword').value = '';
      showAlert(m, 'เปลี่ยนอีเมลแล้ว', 'success');
    } catch (err) { showAlert(m, err.message); }
  });
});

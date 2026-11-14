const el = ui.el;
const layout = document.querySelector('#chat-layout');
const listBox = document.querySelector('#conv-list');
const threadPane = document.querySelector('#thread-pane');

let me = null;
let socket = null;
let conversations = [];
let current = null;        // ห้องที่เปิดอยู่ (ข้อมูลห้อง)
let messages = [];         // ข้อความของห้องที่เปิดอยู่ เรียงเก่า → ใหม่
let hasMore = false;
let typingTimer = null;
let typingSent = false;
const typingNow = new Map(); // userId -> { name, timer }
const EMPTY_HTML = '<div class="chat-empty"><div class="chat-empty-icon" aria-hidden="true">💬</div><strong>ข้อความของคุณ</strong><span class="muted">เลือกห้องแชททางซ้าย หรือกด "แชทใหม่" เพื่อเริ่มคุยกับเพื่อน</span></div>';
const els = {};            // ชิ้นส่วนของหน้าต่างแชทที่เปิดอยู่

function convName(c) { return c.name || 'ห้องแชท'; }

function onlineDot(online) {
  return el('span', 'online-dot' + (online ? ' on' : ''));
}

// ---------- รายการห้อง ----------
function renderList() {
  listBox.replaceChildren();
  if (!conversations.length) {
    listBox.appendChild(el('p', 'muted small pad', 'ยังไม่มีห้องแชท กด "แชทใหม่" เพื่อเริ่มคุย'));
    return;
  }
  const q = (document.querySelector('#conv-filter').value || '').trim().toLowerCase();
  const shown = q ? conversations.filter(function (c) { return convName(c).toLowerCase().indexOf(q) !== -1; }) : conversations;
  if (!shown.length) { listBox.appendChild(el('p', 'muted small pad', 'ไม่พบห้องแชทที่ค้นหา')); return; }
  shown.forEach(function (c) {
    const row = el('button', 'conv-item' + (current && current._id === c._id ? ' active' : '') + (c.unread ? ' unread' : ''));
    row.type = 'button';
    const av = el('span', 'conv-avatar');
    av.appendChild(ui.avatar({ displayName: convName(c), avatarUrl: c.avatarUrl }, 'lg'));
    if (c.type === 'direct') av.appendChild(onlineDot(c.partner && c.partner.online));
    row.appendChild(av);

    const body = el('div', 'conv-body');
    const top = el('div', 'conv-top');
    top.appendChild(el('strong', 'conv-name', convName(c)));
    if (c.type === 'group') top.appendChild(el('span', 'badge', c.group && c.group.type === 'course' ? 'วิชา' : 'กลุ่ม'));
    body.appendChild(top);
    body.appendChild(el('div', 'conv-preview muted small', c.lastMessagePreview || 'ยังไม่มีข้อความ'));
    row.appendChild(body);

    const side = el('div', 'conv-side');
    if (c.lastMessageAt && c.lastMessagePreview) side.appendChild(el('span', 'muted small', ui.timeAgo(c.lastMessageAt)));
    if (c.unread) side.appendChild(el('span', 'unread-badge', c.unread > 99 ? '99+' : String(c.unread)));
    row.appendChild(side);

    row.addEventListener('click', function () { openConversation(c._id); });
    listBox.appendChild(row);
  });
}

async function loadList() {
  const data = await api.get('/api/chat/conversations');
  conversations = data.conversations;
  if (current) {
    const fresh = conversations.find(function (c) { return c._id === current._id; });
    if (fresh) current = fresh;
  }
  renderList();
}

function touchConversation(id, preview, at) {
  const c = conversations.find(function (x) { return x._id === id; });
  if (!c) return false;
  c.lastMessagePreview = preview;
  c.lastMessageAt = at;
  conversations.sort(function (a, b) { return new Date(b.lastMessageAt) - new Date(a.lastMessageAt); });
  return true;
}

// ---------- ข้อความ ----------
function senderIsMe(m) { return m.sender && m.sender._id === me._id; }

function canDelete(m) {
  return senderIsMe(m) || Boolean(current && current.group && current.group.isOwner);
}

function bubble(m) {
  const mine = senderIsMe(m);
  const row = el('div', 'msg ' + (mine ? 'mine' : 'other'));
  row.dataset.id = m._id;
  if (!mine) row.appendChild(ui.avatar(m.sender, 'sm'));
  const col = el('div', 'msg-col');
  if (!mine && current.type === 'group') col.appendChild(el('div', 'msg-name muted small', m.sender.displayName));

  const body = el('div', 'msg-bubble' + (m.isDeleted ? ' deleted' : ''));
  if (m.isDeleted) {
    body.textContent = 'ข้อความนี้ถูกลบ';
  } else {
    if (m.text) body.appendChild(el('div', 'msg-text', m.text));
    if (m.images.length) body.appendChild(window.imageGrid(m.images));
  }
  col.appendChild(body);

  const meta = el('div', 'msg-meta muted small');
  meta.appendChild(document.createTextNode(ui.timeAgo(m.createdAt) + (m.editedAt && !m.isDeleted ? ' · แก้ไขแล้ว' : '')));
  if (!m.isDeleted) {
    if (mine && m.text) {
      const edit = el('button', 'link-btn', 'แก้ไข');
      edit.type = 'button';
      edit.addEventListener('click', function () { editMessage(m); });
      meta.appendChild(edit);
    }
    if (canDelete(m)) {
      const del = el('button', 'link-btn danger', 'ลบ');
      del.type = 'button';
      del.addEventListener('click', function () { removeMessage(m); });
      meta.appendChild(del);
    }
  }
  col.appendChild(meta);
  const receipt = el('div', 'msg-receipt muted small');
  receipt.dataset.receipt = m._id;
  col.appendChild(receipt);
  row.appendChild(col);
  return row;
}

// แสดง "อ่านแล้ว" ใต้ข้อความล่าสุดของเราเท่านั้น
function updateReceipts() {
  els.messages.querySelectorAll('[data-receipt]').forEach(function (n) { n.textContent = ''; });
  const mineMsgs = messages.filter(function (m) { return senderIsMe(m) && !m.isDeleted; });
  const last = mineMsgs[mineMsgs.length - 1];
  if (!last) return;
  const others = last.readBy.filter(function (id) { return id !== me._id; });
  const node = els.messages.querySelector('[data-receipt="' + last._id + '"]');
  if (!node) return;
  if (current.type === 'direct') { if (others.length) node.textContent = 'อ่านแล้ว'; }
  else if (others.length) node.textContent = 'อ่านโดย ' + others.length + ' คน';
}

function renderMessages(keepScroll) {
  const box = els.messages;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const prevHeight = box.scrollHeight;
  box.replaceChildren();
  if (hasMore) {
    const more = el('button', 'btn btn-ghost btn-sm load-older', 'โหลดข้อความเก่า');
    more.type = 'button';
    more.addEventListener('click', loadOlder);
    box.appendChild(more);
  }
  messages.forEach(function (m) { box.appendChild(bubble(m)); });
  updateReceipts();
  if (keepScroll === 'older') box.scrollTop = box.scrollHeight - prevHeight;
  else if (keepScroll === 'bottom' || nearBottom) box.scrollTop = box.scrollHeight;
}

async function loadOlder() {
  if (!messages.length) return;
  const data = await api.get('/api/chat/conversations/' + current._id + '/messages?before=' + messages[0]._id);
  messages = data.messages.concat(messages);
  hasMore = data.hasMore;
  renderMessages('older');
}

async function editMessage(m) {
  const next = window.prompt('แก้ไขข้อความ', m.text);
  if (next === null) return;
  try { await api.send('PATCH', '/api/chat/messages/' + m._id, { text: next }); } catch (err) { showAlert(els.alert, err.message); }
}

async function removeMessage(m) {
  if (!window.confirm('ลบข้อความนี้ใช่หรือไม่?')) return;
  try { await api.send('DELETE', '/api/chat/messages/' + m._id); } catch (err) { showAlert(els.alert, err.message); }
}

// ---------- หน้าต่างสนทนา ----------
function statusLine() {
  if (!current) return '';
  if (current.type === 'direct') return current.partner && current.partner.online ? 'ออนไลน์' : 'ออฟไลน์';
  return current.group && current.group.type === 'course' ? 'แชทกลุ่มรายวิชา' : 'แชทกลุ่ม';
}

function renderTyping() {
  const names = Array.from(typingNow.values()).map(function (t) { return t.name; });
  els.typing.textContent = names.length ? names.join(', ') + ' กำลังพิมพ์...' : '';
}

function buildThread() {
  threadPane.replaceChildren();
  const head = el('div', 'thread-head');
  const back = el('button', 'btn btn-ghost btn-sm thread-back', '←');
  back.type = 'button';
  back.setAttribute('aria-label', 'กลับไปรายการแชท');
  back.addEventListener('click', closeThread);
  head.appendChild(back);
  head.appendChild(ui.avatar({ displayName: convName(current), avatarUrl: current.avatarUrl }, 'md'));
  const info = el('div', 'thread-info');
  info.appendChild(el('strong', '', convName(current)));
  els.status = el('div', 'muted small', statusLine());
  info.appendChild(els.status);
  head.appendChild(info);
  if (current.type === 'direct' && current.partner && current.partner.username) {
    const link = el('a', 'btn btn-ghost btn-sm', 'โปรไฟล์');
    link.href = '/profile.html?u=' + encodeURIComponent(current.partner.username);
    head.appendChild(link);
  } else if (current.group && current.group.type === 'course') {
    const link = el('a', 'btn btn-ghost btn-sm', 'ดูวิชา');
    link.href = '/course.html?id=' + current.group._id;
    head.appendChild(link);
  } else if (current.group && current.group.type === 'general') {
    const link = el('a', 'btn btn-ghost btn-sm', 'ดูกลุ่ม');
    link.href = '/group.html?id=' + current.group._id;
    head.appendChild(link);
  }

  els.messages = el('div', 'thread-messages');
  els.typing = el('div', 'thread-typing muted small');
  els.alert = el('p', 'alert', '');
  els.alert.setAttribute('role', 'alert');
  threadPane.appendChild(head);
  threadPane.appendChild(els.messages);
  threadPane.appendChild(els.typing);
  threadPane.appendChild(els.alert);

  if (!current.canSend) {
    const note = current.blocked
      ? 'ไม่สามารถส่งข้อความในแชทนี้ได้เนื่องจากมีการบล็อก'
      : 'ไม่สามารถส่งข้อความในแชทนี้ได้ (บัญชีนี้ถูกลบแล้ว)';
    threadPane.appendChild(el('div', 'thread-notice muted', note));
    return;
  }

  const form = el('form', 'chat-composer');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'พิมพ์ข้อความ...';
  input.maxLength = 2000;
  input.autocomplete = 'off';
  const picker = createImagePicker({ max: 4, label: 'รูป', onError: function (msg) { showAlert(els.alert, msg); } });
  const send = el('button', 'btn btn-sm', 'ส่ง');
  send.type = 'submit';
  const row = el('div', 'composer-row');
  row.appendChild(picker.button);
  row.appendChild(input);
  row.appendChild(send);
  form.appendChild(picker.previews);
  form.appendChild(picker.input);
  form.appendChild(row);
  threadPane.appendChild(form);

  input.addEventListener('input', function () {
    if (!socket) return;
    if (!typingSent) { socket.emit('typing', { conversationId: current._id, isTyping: true }); typingSent = true; }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 2000);
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text && picker.files().length === 0) return;
    send.disabled = true;
    stopTyping();
    try {
      const data = await sendForm('/api/chat/conversations/' + current._id + '/messages', { text: text }, picker.files());
      input.value = '';
      picker.clear();
      showAlert(els.alert, '');
      addMessage(data.message); // ถ้า socket ส่งมาก่อนแล้ว จะไม่เพิ่มซ้ำ
    } catch (err) {
      showAlert(els.alert, err.message);
    }
    send.disabled = false;
    input.focus();
  });
  input.focus();
}

function stopTyping() {
  clearTimeout(typingTimer);
  if (socket && typingSent && current) socket.emit('typing', { conversationId: current._id, isTyping: false });
  typingSent = false;
}

function addMessage(message) {
  if (messages.some(function (m) { return m._id === message._id; })) return;
  messages.push(message);
  renderMessages('bottom');
}

async function openConversation(id) {
  stopTyping();
  typingNow.forEach(function (t) { clearTimeout(t.timer); });
  typingNow.clear();
  const data = await api.get('/api/chat/conversations/' + id);
  current = data.conversation;
  buildThread();
  layout.classList.add('thread-open');
  history.replaceState(null, '', '/chat.html?c=' + id);

  const page = await api.get('/api/chat/conversations/' + id + '/messages');
  messages = page.messages;
  hasMore = page.hasMore;
  renderMessages('bottom');

  const idx = conversations.findIndex(function (c) { return c._id === id; });
  if (idx === -1) await loadList(); else conversations[idx] = Object.assign(conversations[idx], current);
  markRead();
  renderList();
}

function closeThread() {
  stopTyping();
  current = null;
  messages = [];
  layout.classList.remove('thread-open');
  threadPane.innerHTML = EMPTY_HTML;
  history.replaceState(null, '', '/chat.html');
  renderList();
}

async function markRead() {
  if (!current) return;
  const c = conversations.find(function (x) { return x._id === current._id; });
  if (c) c.unread = 0;
  try { await api.post('/api/chat/conversations/' + current._id + '/read'); } catch (e) { /* ไม่ต้องแจ้งผู้ใช้ */ }
  renderList();
}

// ---------- เหตุการณ์เรียลไทม์ ----------
function bindSocket() {
  socket.on('message:new', async function (p) {
    const known = touchConversation(p.conversationId, p.message.isDeleted ? 'ข้อความนี้ถูกลบ' : (p.message.text || 'ส่งรูปภาพ'), p.message.createdAt);
    if (!known) { await loadList(); }
    if (current && current._id === p.conversationId) {
      addMessage(p.message);
      if (!senderIsMe(p.message) && !document.hidden) markRead();
      const t = typingNow.get(p.message.sender._id);
      if (t) { clearTimeout(t.timer); typingNow.delete(p.message.sender._id); renderTyping(); }
    } else if (!senderIsMe(p.message)) {
      const c = conversations.find(function (x) { return x._id === p.conversationId; });
      if (c) c.unread = (c.unread || 0) + 1;
    }
    renderList();
  });

  socket.on('message:update', function (p) {
    if (current && current._id === p.conversationId) {
      const i = messages.findIndex(function (m) { return m._id === p.message._id; });
      if (i !== -1) { messages[i] = p.message; renderMessages(); }
    }
    const c = conversations.find(function (x) { return x._id === p.conversationId; });
    if (c && messages.length && current && current._id === c._id && messages[messages.length - 1]._id === p.message._id) {
      c.lastMessagePreview = p.message.isDeleted ? 'ข้อความนี้ถูกลบ' : (p.message.text || 'ส่งรูปภาพ');
      renderList();
    }
  });

  socket.on('messages:read', function (p) {
    if (!current || current._id !== p.conversationId || p.userId === me._id) return;
    messages.forEach(function (m) { if (m.readBy.indexOf(p.userId) === -1) m.readBy.push(p.userId); });
    updateReceipts();
  });

  socket.on('typing', function (p) {
    if (!current || current._id !== p.conversationId || p.userId === me._id) return;
    const old = typingNow.get(p.userId);
    if (old) clearTimeout(old.timer);
    if (p.isTyping) {
      typingNow.set(p.userId, {
        name: p.displayName,
        timer: setTimeout(function () { typingNow.delete(p.userId); renderTyping(); }, 4000),
      });
    } else {
      typingNow.delete(p.userId);
    }
    renderTyping();
  });

  socket.on('presence', function (p) {
    conversations.forEach(function (c) {
      if (c.type === 'direct' && c.partner && c.partner._id === p.userId) c.partner.online = p.online;
    });
    if (current && current.type === 'direct' && current.partner && current.partner._id === p.userId) {
      current.partner.online = p.online;
      if (els.status) els.status.textContent = statusLine();
    }
    renderList();
  });

  socket.on('connect', function () { loadList().catch(function () {}); });
}

// ---------- แชทใหม่ ----------
document.querySelector('#conv-filter').addEventListener('input', renderList);

function setupNewChat() {
  const box = document.querySelector('#new-chat-box');
  const input = document.querySelector('#new-chat-q');
  const results = document.querySelector('#new-chat-results');
  let timer = null;

  document.querySelector('#new-chat').addEventListener('click', function () {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) input.focus();
  });

  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(async function () {
      const q = input.value.trim();
      results.replaceChildren();
      if (!q) return;
      try {
        const data = await api.get('/api/users/search?q=' + encodeURIComponent(q));
        const users = data.users.filter(function (u) { return u._id !== me._id; });
        if (!users.length) results.appendChild(el('p', 'muted small pad', 'ไม่พบผู้ใช้'));
        users.forEach(function (u) {
          const row = el('button', 'conv-item');
          row.type = 'button';
          row.appendChild(ui.avatar(u, 'md'));
          const body = el('div', 'conv-body');
          body.appendChild(el('strong', '', u.displayName));
          body.appendChild(el('div', 'muted small', '@' + u.username));
          row.appendChild(body);
          row.addEventListener('click', function () { startDirect(u._id); });
          results.appendChild(row);
        });
      } catch (err) { results.appendChild(el('p', 'alert alert-error', err.message)); }
    }, 250);
  });
}

async function startDirect(userId) {
  try {
    const data = await api.post('/api/chat/direct', { userId: userId });
    document.querySelector('#new-chat-box').classList.add('hidden');
    document.querySelector('#new-chat-q').value = '';
    document.querySelector('#new-chat-results').replaceChildren();
    await loadList();
    await openConversation(data.conversation._id);
  } catch (err) {
    alert(err.message);
  }
}

requireUser({ active: 'chat' }).then(async function (user) {
  if (!user) return;
  me = user;
  setupNewChat();
  await loadList();
  socket = await getSocket();
  if (socket) bindSocket();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && current) markRead();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('u')) await startDirect(params.get('u'));
  else if (params.get('c')) await openConversation(params.get('c')).catch(function () { closeThread(); });
});

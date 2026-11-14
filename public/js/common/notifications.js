// ปุ่มกระดิ่งแจ้งเตือน: ตัวเลขที่ยังไม่อ่าน + รายการแบบเปิด/ปิด (ดึงข้อมูลด้วย fetch ทุก 30 วินาที)
(function () {
  const el = ui.el;
  const POLL_MS = 30000;

  window.createNotificationBell = function () {
    const wrap = el('div', 'bell-wrap');
    const button = el('button', 'icon-btn bell-btn');
    button.type = 'button';
    button.setAttribute('aria-label', 'การแจ้งเตือน');
    button.title = 'การแจ้งเตือน';
    button.appendChild(ui.icon('bell', 22));
    const count = el('span', 'bell-count hidden', '0');
    button.appendChild(count);

    const panel = el('div', 'bell-panel hidden');
    const panelHead = el('div', 'bell-head');
    panelHead.appendChild(el('strong', '', 'การแจ้งเตือน'));
    const readAll = el('button', 'link-btn', 'อ่านทั้งหมด');
    readAll.type = 'button';
    panelHead.appendChild(readAll);
    const list = el('div', 'bell-list');
    panel.appendChild(panelHead);
    panel.appendChild(list);
    wrap.appendChild(button);
    wrap.appendChild(panel);

    function setCount(n) {
      count.textContent = n > 99 ? '99+' : String(n);
      count.classList.toggle('hidden', n === 0);
    }

    function refreshCount() {
      api.get('/api/notifications/unread-count').then(function (d) { setCount(d.count); }).catch(function () {});
    }

    function item(n) {
      const row = el('button', 'bell-item' + (n.read ? '' : ' unread'));
      row.type = 'button';
      row.appendChild(ui.avatar(n.actor, 'sm'));
      const body = el('div', 'bell-text');
      body.appendChild(el('div', '', n.text));
      body.appendChild(el('div', 'muted small', ui.timeAgo(n.createdAt)));
      row.appendChild(body);
      row.addEventListener('click', function () {
        api.post('/api/notifications/' + n._id + '/read').catch(function () {}).then(function () {
          if (n.link) location.href = n.link; else { row.classList.remove('unread'); refreshCount(); }
        });
      });
      return row;
    }

    function load() {
      list.replaceChildren(el('p', 'muted small pad', 'กำลังโหลด...'));
      api.get('/api/notifications?limit=15').then(function (d) {
        list.replaceChildren();
        if (!d.notifications.length) list.appendChild(el('p', 'muted small pad', 'ยังไม่มีการแจ้งเตือน'));
        d.notifications.forEach(function (n) { list.appendChild(item(n)); });
      }).catch(function () { list.replaceChildren(el('p', 'muted small pad', 'โหลดไม่สำเร็จ')); });
    }

    ui.popover(wrap, panel, button, load);
    readAll.addEventListener('click', function () {
      api.post('/api/notifications/read-all').then(function () { setCount(0); load(); }).catch(function () {});
    });

    refreshCount();
    setInterval(refreshCount, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshCount(); });
    return wrap;
  };
})();

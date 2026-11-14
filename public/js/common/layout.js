// แถบเมนูด้านบนของหน้าที่ต้องเข้าสู่ระบบก่อน + ตรวจว่าล็อกอินอยู่
(function () {
  const STATUS_LABEL = { student: 'นักศึกษา', alumni: 'ศิษย์เก่า' };

  window.roleBadge = function (user) {
    const span = document.createElement('span');
    let kind = user.role;
    let label = user.role === 'admin' ? 'แอดมิน' : 'อาจารย์';
    if (user.role === 'user') { kind = user.status; label = STATUS_LABEL[user.status] || 'สมาชิก'; }
    span.className = 'badge badge-' + kind;
    span.textContent = label;
    return span;
  };

  // เชื่อมต่อ Socket.io ครั้งเดียวต่อหน้า (ใช้ทั้งแชท สถานะออนไลน์ และตัวเลขข้อความใหม่)
  let socketPromise = null;
  window.getSocket = function () {
    if (!socketPromise) {
      socketPromise = new Promise(function (resolve) {
        const tag = document.createElement('script');
        tag.src = '/socket.io/socket.io.js';
        tag.onload = function () { resolve(window.io()); };
        tag.onerror = function () { resolve(null); };
        document.head.appendChild(tag);
      });
    }
    return socketPromise;
  };

  // เรียกในหน้าที่ต้องล็อกอิน คืนค่า user (ถ้าไม่ได้ล็อกอินจะพาไปหน้าเข้าสู่ระบบ)
  window.requireUser = async function (options) {
    options = options || {};
    let user;
    try {
      user = (await api.get('/api/auth/me')).user;
    } catch (e) {
      location.href = '/login.html';
      return null;
    }
    if (options.role && user.role !== options.role) {
      location.href = '/feed.html';
      return null;
    }
    renderTopbar(user, options.active);
    return user;
  };

  // เมนูบัญชี: กดที่รูปโปรไฟล์แล้วเปิดเมนู (โปรไฟล์ ตั้งค่า สลับธีม ออกจากระบบ)
  function createAccountMenu(user) {
    const el = ui.el;
    const wrap = el('div', 'menu-wrap');

    const button = el('button', 'avatar-btn');
    button.type = 'button';
    button.setAttribute('aria-label', 'เมนูบัญชี');
    button.title = 'บัญชีของฉัน';
    button.appendChild(ui.avatar(user, 'md'));
    button.appendChild(el('span', 'caret', '▾'));

    const panel = el('div', 'menu-panel hidden');

    const profile = el('a', 'menu-profile');
    profile.href = '/profile.html?u=' + encodeURIComponent(user.username);
    profile.appendChild(ui.avatar(user, 'lg'));
    const info = el('div', 'menu-profile-info');
    info.appendChild(el('strong', '', user.displayName));
    const meta = el('div', 'menu-profile-meta');
    meta.appendChild(roleBadge(user));
    meta.appendChild(el('span', 'muted small', 'ดูโปรไฟล์'));
    info.appendChild(meta);
    profile.appendChild(info);
    panel.appendChild(profile);

    const settings = el('a', 'menu-item', 'ตั้งค่าบัญชี');
    settings.href = '/settings.html';
    panel.appendChild(settings);

    if (user.role === 'admin') {
      const admin = el('a', 'menu-item', 'จัดการระบบ');
      admin.href = '/admin.html';
      panel.appendChild(admin);
      const adminCourses = el('a', 'menu-item', 'จัดการวิชา');
      adminCourses.href = '/admin-courses.html';
      panel.appendChild(adminCourses);
    }

    const theme = el('button', 'menu-item', 'โหมดมืด');
    theme.type = 'button';
    theme.setAttribute('data-theme-toggle', '');
    panel.appendChild(theme);

    const out = el('button', 'menu-item menu-logout', 'ออกจากระบบ');
    out.type = 'button';
    out.addEventListener('click', async function () {
      try { await api.post('/api/auth/logout'); } finally { location.href = '/login.html'; }
    });
    panel.appendChild(out);

    wrap.appendChild(button);
    wrap.appendChild(panel);
    ui.popover(wrap, panel, button);
    return wrap;
  }

  // ปุ่มแชท (วงกลม) พร้อมตัวเลขข้อความที่ยังไม่อ่าน
  function createChatButton(isActive) {
    const el = ui.el;
    const a = el('a', 'icon-btn chat-btn' + (isActive ? ' active' : ''));
    a.href = '/chat.html';
    a.setAttribute('aria-label', 'แชท');
    a.title = 'แชท';
    a.appendChild(ui.icon('chat', 22));
    a.appendChild(el('span', 'bell-count chat-count hidden', '0'));

    // อัปเดตตัวเลขข้อความใหม่ทุกที่ที่มี (ปุ่มบน + แถบเมนูล่างบนมือถือ)
    function refresh() {
      api.get('/api/chat/unread-count').then(function (d) {
        document.querySelectorAll('.chat-count').forEach(function (count) {
          count.textContent = d.count > 99 ? '99+' : String(d.count);
          count.classList.toggle('hidden', d.count === 0);
        });
      }).catch(function () {});
    }
    refresh();
    getSocket().then(function (socket) {
      if (!socket) return;
      ['message:new', 'message:update', 'messages:read'].forEach(function (ev) { socket.on(ev, refresh); });
    });
    return a;
  }

  function navIcon(href, label, iconName, isActive) {
    const a = ui.el('a', 'nav-icon' + (isActive ? ' active' : ''));
    a.href = href;
    a.setAttribute('aria-label', label);
    a.title = label;
    if (isActive) a.setAttribute('aria-current', 'page');
    a.appendChild(ui.icon(iconName, 22));
    a.appendChild(ui.el('span', 'nav-label', label));
    return a;
  }

  // แถบเมนูล่างสำหรับมือถือ (จอแคบจะซ่อนเมนูกลางด้านบนและใช้แถบนี้แทน)
  function renderBottomNav(active) {
    const el = ui.el;
    document.querySelector('#bottom-nav') && document.querySelector('#bottom-nav').remove();
    const nav = el('nav', 'bottom-nav');
    nav.id = 'bottom-nav';
    nav.setAttribute('aria-label', 'เมนูหลัก');
    [['/feed.html', 'ฟีด', 'home', 'feed'], ['/courses.html', 'วิชา', 'book', 'courses'],
      ['/timetable.html', 'ตารางเรียน', 'calendar', 'timetable'], ['/chat.html', 'แชท', 'chat', 'chat'],
      ['/groups.html', 'กลุ่ม', 'groups', 'groups']].forEach(function (item) {
      const a = el('a', 'bottom-item' + (active === item[3] ? ' active' : ''));
      a.href = item[0];
      if (active === item[3]) a.setAttribute('aria-current', 'page');
      a.appendChild(ui.icon(item[2], 24));
      a.appendChild(el('span', '', item[1]));
      if (item[3] === 'chat') a.appendChild(el('span', 'bell-count chat-count hidden', '0'));
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
  }

  function renderTopbar(user, active) {
    const el = ui.el;
    const bar = document.querySelector('#topbar');
    if (!bar) return;
    bar.className = 'topbar topbar-app';

    // โลโก้เต็มบนจอใหญ่ / ไอคอน UV บนมือถือ
    const logo = el('a', 'logo-badge');
    logo.href = '/feed.html';
    logo.setAttribute('aria-label', 'UniVibe หน้าแรก');
    const full = document.createElement('img');
    full.src = '/assets/logo-full.png';
    full.alt = 'UniVibe';
    full.className = 'logo-full';
    const mark = document.createElement('img');
    mark.src = '/assets/logo-mark.png';
    mark.alt = '';
    mark.className = 'logo-mark';
    logo.appendChild(full);
    logo.appendChild(mark);

    // ช่องค้นหา
    const search = el('form', 'search-form');
    search.setAttribute('role', 'search');
    const glass = el('span', 'search-icon');
    glass.appendChild(ui.icon('search', 18));
    const q = document.createElement('input');
    q.type = 'search';
    q.name = 'q';
    q.placeholder = 'ค้นหาใน UniVibe';
    q.setAttribute('aria-label', 'ค้นหา');
    q.maxLength = 100;
    search.appendChild(glass);
    search.appendChild(q);
    search.addEventListener('submit', function (event) {
      event.preventDefault();
      const term = q.value.trim();
      if (term) location.href = '/search.html?q=' + encodeURIComponent(term);
    });

    // เมนูหลักตรงกลาง (ไอคอนอย่างเดียว)
    const nav = el('nav', 'topbar-nav');
    nav.setAttribute('aria-label', 'เมนูหลัก');
    nav.appendChild(navIcon('/feed.html', 'ฟีด', 'home', active === 'feed'));
    nav.appendChild(navIcon('/courses.html', 'วิชา', 'book', active === 'courses'));
    nav.appendChild(navIcon('/timetable.html', 'ตารางเรียน', 'calendar', active === 'timetable'));
    nav.appendChild(navIcon('/groups.html', 'กลุ่ม', 'groups', active === 'groups'));
    if (user.role === 'admin') nav.appendChild(navIcon('/admin.html', 'จัดการระบบ', 'shield', active === 'admin'));

    // ฝั่งขวา: แจ้งเตือน + เมนูบัญชี
    const right = el('div', 'topbar-right');
    right.appendChild(createChatButton(active === 'chat'));
    right.appendChild(createNotificationBell());
    right.appendChild(createAccountMenu(user));

    // ซ้าย (โลโก้+ค้นหา) / กลาง (เมนู) / ขวา แบ่งเป็น 3 ช่อง 1fr auto 1fr เพื่อให้เมนูอยู่กลางจอจริง
    const left = el('div', 'topbar-left');
    left.appendChild(logo);
    left.appendChild(search);
    bar.replaceChildren(left, nav, right);
    renderBottomNav(active);
    if (window.UniVibeTheme) window.UniVibeTheme.refresh();
    getSocket(); // ต่อ socket ทุกหน้า เพื่อให้คนอื่นเห็นว่าเราออนไลน์
  }
})();

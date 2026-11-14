// ตัวช่วยสร้าง DOM และจัดรูปแบบที่ใช้ร่วมกัน (ใช้ textContent เสมอ ปลอดภัยจาก XSS)
(function () {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // "5 นาทีที่แล้ว" / "เมื่อวาน 14:30" / "3 ม.ค. 2569"
  function timeAgo(value) {
    const d = new Date(value);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 45) return 'เมื่อสักครู่';
    if (sec < 3600) return Math.floor(sec / 60) + ' นาทีที่แล้ว';
    if (sec < 86400) return Math.floor(sec / 3600) + ' ชั่วโมงที่แล้ว';
    if (sec < 7 * 86400) return Math.floor(sec / 86400) + ' วันที่แล้ว';
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // วงกลมรูปโปรไฟล์ (ไม่มีรูปแสดงตัวอักษรแรกของชื่อ)
  function avatar(user, size) {
    const box = el('span', 'avatar avatar-' + (size || 'md'));
    if (user && user.avatarUrl) {
      const img = document.createElement('img');
      img.src = user.avatarUrl;
      img.alt = '';
      box.appendChild(img);
    } else {
      box.textContent = user && user.displayName ? Array.from(user.displayName)[0] : '?';
    }
    return box;
  }

  // ลิงก์ไปโปรไฟล์ (บัญชีที่ถูกลบไม่มีลิงก์)
  function userLink(user, className) {
    if (!user || user.deleted || !user.username) return el('span', className, user ? user.displayName : '');
    const a = el('a', className, user.displayName);
    a.href = '/profile.html?u=' + encodeURIComponent(user.username);
    return a;
  }

  // แปลงข้อความเป็นโหนดพร้อมลิงก์แฮชแท็ก (#...) โดยไม่ใช้ innerHTML
  function richText(text) {
    const frag = document.createDocumentFragment();
    const re = /#([\p{L}\p{M}\p{N}_]{1,50})/gu;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = el('a', 'hashtag', m[0]);
      a.href = '/hashtag.html?tag=' + encodeURIComponent(m[1].toLowerCase());
      frag.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  // ไอคอน SVG แบบฝังในโค้ด (ไม่ต้องโหลดไฟล์ภายนอก) สีตามตัวอักษรรอบข้าง
  const ICONS = {
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
    shield: 'M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
    chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
    groups: 'M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58A2.01 2.01 0 0 0 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85A6.95 6.95 0 0 0 20 14c-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z',
    calendar: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM7 11h5v5H7z',
    book: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
    search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  };

  function icon(name, size) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 22));
    svg.setAttribute('height', String(size || 22));
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  // ให้เมนูแบบเปิด/ปิด (กระดิ่ง เมนูบัญชี) ปิดกันเองเมื่อมีอีกอันเปิด
  function popover(wrap, panel, button, onOpen) {
    function close() {
      panel.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    }
    function open() {
      document.dispatchEvent(new CustomEvent('univibe-popover', { detail: wrap }));
      panel.classList.remove('hidden');
      button.setAttribute('aria-expanded', 'true');
      if (onOpen) onOpen();
    }
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('hidden')) open(); else close();
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.addEventListener('univibe-popover', function (e) { if (e.detail !== wrap) close(); });
    return { open: open, close: close };
  }

  window.ui = { el: el, timeAgo: timeAgo, avatar: avatar, userLink: userLink, richText: richText, icon: icon, popover: popover };
})();

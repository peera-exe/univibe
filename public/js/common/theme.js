// สลับธีมสว่าง/มืด จำค่าไว้ในเบราว์เซอร์ (ใช้ได้ทุกหน้า)
(function () {
  const KEY = 'univibe-theme';

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function current() {
    const saved = stored();
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.textContent = theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด';
    });
  }

  function toggle() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) { /* ใช้ต่อได้แม้เก็บค่าไม่ได้ */ }
    apply(next);
  }

  // ผูกปุ่มสลับธีมทุกปุ่มที่ยังไม่ได้ผูก (ปุ่มที่สร้างทีหลังด้วย JavaScript เรียก refresh())
  function refresh() {
    apply(document.documentElement.dataset.theme || current());
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', toggle);
    });
  }

  window.UniVibeTheme = { refresh: refresh };
  apply(current()); // ตั้งค่าทันทีที่โหลดสคริปต์ ลดอาการหน้าวาบ
  document.addEventListener('DOMContentLoaded', refresh);
})();

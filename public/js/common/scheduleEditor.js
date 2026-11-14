// ตัวแก้ตารางเรียน (เพิ่ม/ลบช่วงเวลา: วัน เวลาเริ่ม-สิ้นสุด ห้อง) ใช้ในหน้าวิชาและหน้าแอดมินจัดการวิชา
(function () {
  const DAYS = [['mon', 'จันทร์'], ['tue', 'อังคาร'], ['wed', 'พุธ'], ['thu', 'พฤหัสบดี'], ['fri', 'ศุกร์'], ['sat', 'เสาร์'], ['sun', 'อาทิตย์']];
  const DAY_LABEL = Object.fromEntries(DAYS);

  // ข้อความสั้น ๆ เช่น "จันทร์ 09:00–12:00 ห้อง 301"
  function describe(slot) {
    const room = slot.room ? (/^ห้อง/.test(slot.room) ? slot.room : 'ห้อง ' + slot.room) : '';
    return DAY_LABEL[slot.day] + ' ' + slot.start + '–' + slot.end + (room ? ' · ' + room : '');
  }

  function create(container, initial) {
    const el = ui.el;
    const rows = el('div', 'slot-rows');
    const add = el('button', 'btn btn-ghost btn-sm', '+ เพิ่มช่วงเวลา');
    add.type = 'button';
    container.replaceChildren(rows, add);

    function addRow(slot) {
      slot = slot || { day: 'mon', start: '09:00', end: '12:00', room: '' };
      const row = el('div', 'slot-row');
      const day = document.createElement('select');
      day.setAttribute('aria-label', 'วัน');
      DAYS.forEach(function (d) {
        const o = el('option', '', d[1]);
        o.value = d[0];
        day.appendChild(o);
      });
      day.value = slot.day;
      const start = document.createElement('input');
      start.type = 'time'; start.value = slot.start; start.setAttribute('aria-label', 'เวลาเริ่ม');
      const end = document.createElement('input');
      end.type = 'time'; end.value = slot.end; end.setAttribute('aria-label', 'เวลาสิ้นสุด');
      const room = document.createElement('input');
      room.type = 'text'; room.value = slot.room; room.placeholder = 'ห้องเรียน เช่น ท.139'; room.maxLength = 40; room.setAttribute('aria-label', 'ห้องเรียน');
      const del = el('button', 'btn btn-ghost btn-sm', 'ลบ');
      del.type = 'button';
      del.addEventListener('click', function () { row.remove(); });
      [day, start, el('span', 'muted', 'ถึง'), end, room, del].forEach(function (n) { row.appendChild(n); });
      row._get = function () { return { day: day.value, start: start.value, end: end.value, room: room.value.trim() }; };
      rows.appendChild(row);
    }

    add.addEventListener('click', function () { addRow(); });
    (initial || []).forEach(addRow);

    return {
      getValue: function () { return Array.from(rows.children).map(function (r) { return r._get(); }); },
      setValue: function (slots) { rows.replaceChildren(); (slots || []).forEach(addRow); },
    };
  }

  window.ScheduleEditor = { create: create, describe: describe, DAYS: DAYS, DAY_LABEL: DAY_LABEL };
})();

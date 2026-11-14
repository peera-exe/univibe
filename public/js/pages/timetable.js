const el = ui.el;
const message = document.querySelector('#message');
const box = document.querySelector('#timetable');
const select = document.querySelector('#semester');
const viewBtns = document.querySelectorAll('[data-view]');
const mm = function (n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };

const HOUR_W = 110;   // ความกว้างต่อ 1 ชั่วโมง (px)
const LANE_H = 92;    // ความสูงของการ์ดวิชา 1 ช่อง (px)
const HUES = [172, 215, 265, 330, 25, 48, 130, 0];

let lastData = null;
let view = localStorage.getItem('tt-view') || (window.matchMedia('(max-width: 760px)').matches ? 'list' : 'grid');

function shortName(s) { return s.name.replace(/^\S+\s/, ''); }

// ---------- มุมมองตาราง: แถว = วัน, แกนนอน = เวลา ----------
function renderGrid(data) {
  const slots = data.slots;
  const startH = Math.min(8, Math.floor(Math.min.apply(null, slots.map(function (s) { return s.startMin; })) / 60));
  const endH = Math.max(17, Math.ceil(Math.max.apply(null, slots.map(function (s) { return s.endMin; })) / 60));
  const t0 = startH * 60;
  const width = (endH - startH) * HOUR_W;

  // สีประจำวิชา (วิชาเดียวกันสีเดียวกัน)
  const hueOf = {};
  data.slots.forEach(function (s) { if (!(s.courseId in hueOf)) hueOf[s.courseId] = HUES[Object.keys(hueOf).length % HUES.length]; });

  const days = ScheduleEditor.DAYS.filter(function (d, i) {
    return i < 5 || slots.some(function (s) { return s.day === d[0]; });
  });
  const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

  const wrap = el('div', 'tt-wrap');
  const inner = el('div', 'tt');
  inner.style.setProperty('--hw', HOUR_W + 'px');

  // แถวหัวเวลา
  const head = el('div', 'tt-row tt-head');
  head.appendChild(el('div', 'tt-day tt-corner', 'วัน / เวลา'));
  const ticks = el('div', 'tt-track');
  ticks.style.width = width + 'px';
  for (let h = startH; h < endH; h++) {
    const t = el('div', 'tt-tick', String(h).padStart(2, '0') + ':00');
    t.style.width = HOUR_W + 'px';
    ticks.appendChild(t);
  }
  head.appendChild(ticks);
  inner.appendChild(head);

  days.forEach(function (d) {
    const daySlots = slots.filter(function (s) { return s.day === d[0]; }).sort(function (a, b) { return a.startMin - b.startMin; });

    // จัดช่อง (lane) ให้วิชาที่เวลาทับกันไม่ซ้อนกัน
    const laneEnds = [];
    daySlots.forEach(function (s) {
      let lane = laneEnds.findIndex(function (end) { return end <= s.startMin; });
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = s.endMin;
      s._lane = lane;
    });
    const lanes = Math.max(1, laneEnds.length);

    const row = el('div', 'tt-row' + (d[0] === todayKey ? ' tt-today' : ''));
    row.appendChild(el('div', 'tt-day', d[1]));
    const track = el('div', 'tt-track');
    track.style.width = width + 'px';
    track.style.height = (lanes * (LANE_H + 6) + 6) + 'px';

    daySlots.forEach(function (s) {
      const a = el('a', 'tt-block' + (s.clash ? ' tt-clash' : ''));
      a.href = '/course.html?id=' + s.courseId;
      a.style.setProperty('--h', hueOf[s.courseId]);
      a.style.left = ((s.startMin - t0) / 60 * HOUR_W + 2) + 'px';
      a.style.width = ((s.endMin - s.startMin) / 60 * HOUR_W - 4) + 'px';
      a.style.top = (6 + s._lane * (LANE_H + 6)) + 'px';
      a.style.height = LANE_H + 'px';
      a.title = s.code + ' ' + shortName(s) + '\nกลุ่ม ' + s.section + ' · ' + s.room + '\n' + mm(s.startMin) + '–' + mm(s.endMin);
      a.appendChild(el('strong', 'tt-code', s.code));
      a.appendChild(el('div', 'tt-name', shortName(s)));
      a.appendChild(el('div', 'tt-meta', 'กลุ่ม ' + s.section + (s.room ? ' · ' + s.room : '')));
      a.appendChild(el('div', 'tt-time', mm(s.startMin) + '–' + mm(s.endMin) + (s.clash ? ' · ชนกัน' : '')));
      track.appendChild(a);
    });
    row.appendChild(track);
    inner.appendChild(row);
  });

  wrap.appendChild(inner);
  box.appendChild(wrap);
}

// ---------- มุมมองรายการ: การ์ดแยกตามวัน (เหมาะกับมือถือ) ----------
function renderList(data) {
  const list = el('div', 'timetable-grid');
  ScheduleEditor.DAYS.forEach(function (d) {
    const slots = data.slots.filter(function (s) { return s.day === d[0]; });
    if (!slots.length) return;
    const col = el('section', 'card day-col');
    col.appendChild(el('h2', '', d[1]));
    slots.forEach(function (s) {
      const a = el('a', 'slot-card' + (s.clash ? ' slot-clash' : ''));
      a.href = '/course.html?id=' + s.courseId;
      a.appendChild(el('strong', '', mm(s.startMin) + '–' + mm(s.endMin)));
      a.appendChild(el('div', '', s.code + ' กลุ่ม ' + s.section));
      a.appendChild(el('div', 'muted small', shortName(s) + ' · ' + s.room));
      if (s.clash) a.appendChild(el('span', 'badge badge-warn', 'เวลาเรียนชนกัน'));
      col.appendChild(a);
    });
    list.appendChild(col);
  });
  box.appendChild(list);
}

function render(data) {
  box.replaceChildren();
  box.className = '';
  viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === view)); });
  if (!data.slots.length) {
    box.appendChild(el('p', 'muted', 'ยังไม่มีวิชาที่มีเวลาเรียนในภาคเรียนนี้'));
    return;
  }
  if (view === 'grid') renderGrid(data); else renderList(data);
}

viewBtns.forEach(function (b) {
  b.addEventListener('click', function () {
    view = b.dataset.view;
    try { localStorage.setItem('tt-view', view); } catch (e) {}
    if (lastData) render(lastData);
  });
});

async function load() {
  try {
    const data = await api.get('/api/courses/timetable' + (select.value ? '?semester=' + encodeURIComponent(select.value) : ''));
    if (!select.options.length) {
      data.semesters.forEach(function (s) { const o = el('option', '', 'ภาคเรียน ' + s); o.value = s; select.appendChild(o); });
    }
    if (data.semester) select.value = data.semester;
    lastData = data;
    render(data);
    showAlert(message, '');
  } catch (err) { showAlert(message, err.message); }
}
select.addEventListener('change', load);
requireUser({ active: 'timetable' }).then(function (u) { if (u) load(); });

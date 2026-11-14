const tabAll = document.querySelector('#tab-all');
const tabFollowing = document.querySelector('#tab-following');
const postsBox = document.querySelector('#posts');
let scope = 'all';
let list = null;

function startList() {
  list = createPostList(postsBox, function (cursor) {
    const params = new URLSearchParams({ scope: scope });
    if (cursor) params.set('before', cursor);
    return api.get('/api/posts/feed?' + params.toString());
  });
  list.reload();
}

function selectTab(next) {
  scope = next;
  tabAll.setAttribute('aria-selected', String(next === 'all'));
  tabFollowing.setAttribute('aria-selected', String(next === 'following'));
  startList();
}
tabAll.addEventListener('click', function () { selectTab('all'); });
tabFollowing.addEventListener('click', function () { selectTab('following'); });

requireUser({ active: 'feed' }).then(function (user) {
  if (!user) return;
  document.querySelector('#composer-slot').appendChild(createComposer(function (post) {
    if (list) list.prepend(post);
  }, user));
  startList();
  loadNextClass();
});

// ---------- การ์ด "คาบเรียนถัดไป" (ใช้ข้อมูลตารางเรียนที่มีอยู่) ----------
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_TH = { sun: 'วันอาทิตย์', mon: 'วันจันทร์', tue: 'วันอังคาร', wed: 'วันพุธ', thu: 'วันพฤหัสบดี', fri: 'วันศุกร์', sat: 'วันเสาร์' };
const hhmm = function (n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };

function findNextClass(slots) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let add = 0; add < 7; add++) {
    const key = DAY_KEYS[(now.getDay() + add) % 7];
    const list = slots.filter(function (s) { return s.day === key && (add > 0 || s.endMin > nowMin); })
      .sort(function (a, b) { return a.startMin - b.startMin; });
    if (list.length) return { slot: list[0], add: add, key: key, live: add === 0 && list[0].startMin <= nowMin };
  }
  return null;
}

function paintNextClass(data) {
  const box = document.querySelector('#next-class');
  box.replaceChildren();
  const next = findNextClass(data.slots || []);
  if (!next) return;
  const s = next.slot;
  const a = el('a', 'card next-class' + (next.live ? ' live' : ''));
  a.href = '/course.html?id=' + s.courseId;
  const when = next.live ? 'กำลังเรียนอยู่' : (next.add === 0 ? 'คาบถัดไปวันนี้' : next.add === 1 ? 'คาบถัดไป พรุ่งนี้' : 'คาบถัดไป ' + DAY_TH[next.key]);
  a.appendChild(el('div', 'next-class-label', when));
  a.appendChild(el('strong', '', s.code + ' ' + s.name.replace(/^\S+\s/, '')));
  a.appendChild(el('div', 'muted small', hhmm(s.startMin) + '–' + hhmm(s.endMin) + (s.room ? ' · ' + s.room : '') + ' · กลุ่ม ' + s.section));
  box.appendChild(a);
}

function loadNextClass() {
  api.get('/api/courses/timetable').then(paintNextClass).catch(function () { /* ไม่มีตารางก็ไม่ต้องแสดงการ์ด */ });
}

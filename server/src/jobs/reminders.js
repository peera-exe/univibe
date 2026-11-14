// เตือนอัตโนมัติ: (1) ก่อนเริ่มคาบเรียน 30 นาที (2) ก่อนกำหนดส่งงาน 24 ชั่วโมง และ (3) 1 ชั่วโมงสุดท้าย
// สองข้อหลังเตือนเฉพาะนักศึกษาที่ยังไม่ส่งงาน แต่ละคนได้เตือนแต่ละครั้งเพียงครั้งเดียว (ผ่าน dedupeKey)
const Group = require('../models/Group');
const Membership = require('../models/Membership');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const notifications = require('../services/notificationService');
const { fromMinutes } = require('../utils/time');

const TZ = 'Asia/Bangkok';
const CLASS_LEAD_MIN = 30;
const HOUR = 3600 * 1000;
const INTERVAL_MS = 60 * 1000;

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// วัน/เวลาตามเขตเวลาไทย (ไม่ขึ้นกับเขตเวลาของเครื่องเซิร์ฟเวอร์)
function bangkokParts(date) {
  const p = Object.fromEntries(formatter.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: p.weekday.slice(0, 3).toLowerCase(), ymd: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// "1/2569" -> ค่าที่เรียงลำดับได้ (ปี*10 + ภาค)
const semesterRank = (s) => { const [t, y] = String(s).split('/').map(Number); return y * 10 + t; };

async function classReminders(now) {
  const courses = await Group.find({ type: 'course', isDeleted: false });
  if (!courses.length) return 0;
  const latest = Math.max(...courses.map((c) => semesterRank(c.course.semester)));
  const { day, ymd, minutes } = bangkokParts(now);
  let sent = 0;
  for (const g of courses) {
    if (semesterRank(g.course.semester) !== latest) continue; // เตือนเฉพาะภาคเรียนล่าสุด
    const slots = g.course.schedule.filter((s) => s.day === day && s.startMin > minutes && s.startMin - minutes <= CLASS_LEAD_MIN);
    if (!slots.length) continue;
    const members = await Membership.find({ group: g._id, status: 'active' }).select('user').lean();
    for (const slot of slots) {
      for (const m of members) {
        const n = await notifications.notify({
          user: m.user, type: 'reminder_class', group: g._id, link: `/course.html?id=${g._id}&tab=schedule`,
          text: `อีก ${slot.startMin - minutes} นาทีเริ่มเรียน ${g.course.code} เวลา ${fromMinutes(slot.startMin)} ห้อง ${slot.room}`,
          dedupeKey: `class:${g._id}:${ymd}:${slot.startMin}:${m.user}`,
        });
        if (n) sent += 1;
      }
    }
  }
  return sent;
}

async function assignmentReminders(now) {
  const upcoming = await Assignment.find({ isDeleted: false, dueAt: { $gt: now, $lte: new Date(now.getTime() + 24 * HOUR) } });
  let sent = 0;
  for (const a of upcoming) {
    const g = await Group.findOne({ _id: a.group, type: 'course', isDeleted: false });
    if (!g) continue;
    const last = a.dueAt.getTime() - now.getTime() <= HOUR; // ภายใน 1 ชม. = เตือนครั้งสุดท้าย (ไม่ส่งเตือน 24 ชม. ซ้อน)
    const submitted = await Submission.find({ assignment: a._id }).distinct('student');
    const students = await Membership.find({ group: g._id, status: 'active', role: 'member', user: { $nin: submitted } }).select('user').lean();
    const kind = last ? 'last' : '24h';
    for (const s of students) {
      const n = await notifications.notify({
        user: s.user, type: last ? 'reminder_assignment_last' : 'reminder_assignment', group: g._id, assignment: a._id,
        link: `/course.html?id=${g._id}&tab=assignments`,
        text: last ? `เหลือไม่ถึง 1 ชั่วโมงก่อนส่งงาน "${a.title}" (${g.course.code})` : `งาน "${a.title}" (${g.course.code}) ครบกำหนดส่งภายใน 24 ชั่วโมง`,
        // ผูกกับเวลากำหนดส่ง: ถ้าอาจารย์เลื่อนกำหนด จะได้รับการเตือนรอบใหม่
        dedupeKey: `assignment_${kind}:${a._id}:${a.dueAt.getTime()}:${s.user}`,
      });
      if (n) sent += 1;
    }
  }
  return sent;
}

// ใช้ now จำลองเวลาเพื่อทดสอบได้
async function runReminders(now = new Date()) {
  const classes = await classReminders(now);
  const assignments = await assignmentReminders(now);
  return { classes, assignments };
}

let timer = null;
function startReminders() {
  if (timer) return;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await runReminders(); } catch (err) { console.error('เตือนอัตโนมัติผิดพลาด:', err.message); } finally { running = false; }
  }, INTERVAL_MS);
}

module.exports = { runReminders, startReminders, bangkokParts };

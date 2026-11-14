// สร้างข้อมูลตัวอย่างในหน่วยความจำและตรวจความถูกต้อง (ไม่แตะฐานข้อมูล)
const bcrypt = require('bcryptjs');
const M = require('../src/models');
const { toMinutes } = require('../src/utils/time');

const studentsData = require('./data/students.json');
const usersData = require('./data/users.json');
const coursesData = require('./data/courses.json');
const enrollmentsData = require('./data/enrollments.json');

function findOverlaps(groups) {
  // ห้องเดียวกัน วันเดียวกัน เวลาซ้อนกัน
  const slots = [];
  for (const g of groups) {
    for (const s of g.course.schedule) slots.push({ code: g.course.code, ...s.toObject() });
  }
  const problems = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a.day === b.day && a.room === b.room && a.startMin < b.endMin && b.startMin < a.endMin) {
        problems.push(`ห้อง ${a.room} วัน ${a.day} ชน: ${a.code} กับ ${b.code}`);
      }
    }
  }
  return problems;
}

async function buildSeed() {
  const problems = [];

  // 1) ทะเบียนนักศึกษา
  const registry = studentsData.map((s) => new M.StudentRegistry(s));
  const registryById = new Map(studentsData.map((s) => [s.studentId, s]));

  // 2) บัญชีผู้ใช้ตัวอย่าง
  const users = [];
  for (const u of usersData) {
    const { password, teaches, ...fields } = u;
    if (fields.studentId) {
      const r = registryById.get(fields.studentId);
      if (!r) { problems.push(`ไม่พบรหัสนักศึกษา ${fields.studentId} ในทะเบียน`); continue; }
      Object.assign(fields, { realName: r.fullName, displayName: r.fullName, status: r.status, faculty: r.faculty, major: r.major });
    }
    const doc = new M.User({ ...fields, passwordHash: await bcrypt.hash(password, 10) });
    doc.$locals = { teaches: teaches || [] };
    users.push(doc);
  }
  const admin = users.find((u) => u.role === 'admin');
  const teachers = users.filter((u) => u.role === 'teacher');

  // 3) กลุ่มรายวิชา
  const groups = coursesData.map((c) => new M.Group({
    type: 'course',
    name: `${c.code} ${c.name}`,
    description: c.description,
    owner: admin._id,
    course: {
      code: c.code,
      section: c.section,
      semester: c.semester,
      credits: c.credits,
      teachers: teachers.filter((t) => t.$locals.teaches.includes(c.code)).map((t) => t._id),
      schedule: c.schedule.map((s) => ({ day: s.day, startMin: toMinutes(s.start), endMin: toMinutes(s.end), room: s.room })),
    },
  }));
  const groupByCode = new Map(groups.map((g) => [g.course.code, g]));

  // 4) สมาชิกกลุ่ม: อาจารย์ผู้จัดการ + นักศึกษาตัวอย่างที่ลงทะเบียนวิชานั้น
  const memberships = [];
  for (const g of groups) {
    for (const t of g.course.teachers) {
      memberships.push(new M.Membership({ group: g._id, user: t, role: 'manager', status: 'active', source: 'assigned' }));
    }
  }
  const enrollments = [];
  for (const e of enrollmentsData) {
    const g = groupByCode.get(e.courseCode);
    if (!g) { problems.push(`ไม่พบวิชา ${e.courseCode}`); continue; }
    if (!registryById.has(e.studentId)) problems.push(`ลงทะเบียนเรียนรหัสที่ไม่อยู่ในทะเบียน: ${e.studentId}`);
    enrollments.push(new M.Enrollment({ studentId: e.studentId, group: g._id }));
    const account = users.find((u) => u.studentId === e.studentId);
    if (account) {
      memberships.push(new M.Membership({ group: g._id, user: account._id, role: 'member', status: 'active', source: 'registration' }));
    }
  }

  // 5) ห้องแชทของแต่ละกลุ่ม
  const conversations = groups.map((g) => new M.Conversation({ type: 'group', group: g._id }));

  // ตรวจความถูกต้องตาม schema
  const all = { registry, users, groups, memberships, enrollments, conversations };
  for (const [name, docs] of Object.entries(all)) {
    for (const d of docs) {
      try {
        await d.validate();
      } catch (err) {
        problems.push(`${name}: ${Object.values(err.errors || {}).map((x) => x.message).join('; ') || err.message}`);
      }
    }
  }
  const dupIds = studentsData.map((s) => s.studentId).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupIds.length) problems.push(`รหัสนักศึกษาซ้ำ: ${dupIds.join(', ')}`);
  problems.push(...findOverlaps(groups));

  return { ...all, problems };
}

module.exports = { buildSeed };

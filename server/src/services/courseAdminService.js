// แอดมินจัดการวิชา: สร้าง/แก้/ลบวิชา กำหนดอาจารย์ผู้ดูแล และลงทะเบียนนักศึกษา
const Group = require('../models/Group');
const Membership = require('../models/Membership');
const Enrollment = require('../models/Enrollment');
const Conversation = require('../models/Conversation');
const StudentRegistry = require('../models/StudentRegistry');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { escapeRegex } = require('../utils/text');
const C = require('../utils/constants');
const { parseSchedule } = require('../utils/schedule');
const { USER_FIELDS, publicUser } = require('../utils/serialize');
const course = require('./courseService');

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function cleanInfo(body, partial) {
  const out = {};
  const need = (cond, msg) => { if (!cond) throw new HttpError(400, msg); };
  if (!partial || body.code !== undefined) {
    const code = str(body.code).toUpperCase();
    need(/^[A-Z0-9]{3,12}$/.test(code), 'รหัสวิชาต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 3–12 ตัว');
    out.code = code;
  }
  if (!partial || body.name !== undefined) {
    const name = str(body.name);
    need(name && name.length <= 80, 'ชื่อวิชาต้องยาว 1–80 ตัวอักษร');
    out.name = name;
  }
  if (!partial || body.section !== undefined) {
    const section = str(String(body.section === undefined ? '1' : body.section));
    need(/^[A-Za-z0-9]{1,5}$/.test(section), 'กลุ่มเรียน (section) ต้องเป็นตัวอักษรหรือตัวเลข 1–5 ตัว');
    out.section = section;
  }
  if (!partial || body.semester !== undefined) {
    const semester = str(body.semester);
    need(/^[1-3]\/\d{4}$/.test(semester), 'ภาคเรียนต้องอยู่ในรูปแบบ 1/2569');
    out.semester = semester;
  }
  if (body.credits !== undefined || !partial) {
    const credits = body.credits === undefined || body.credits === '' ? 3 : Number(body.credits);
    need(Number.isFinite(credits) && credits >= 0 && credits <= 12, 'หน่วยกิตต้องอยู่ระหว่าง 0–12');
    out.credits = credits;
  }
  if (body.description !== undefined) {
    const description = str(body.description);
    need(description.length <= 500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร');
    out.description = description;
  }
  return out;
}

async function resolveTeachers(usernames) {
  if (usernames === undefined) return undefined;
  if (!Array.isArray(usernames)) throw new HttpError(400, 'รายชื่ออาจารย์ไม่ถูกต้อง');
  const names = [...new Set(usernames.map((u) => str(u).toLowerCase()).filter(Boolean))];
  if (names.length > 5) throw new HttpError(400, 'กำหนดอาจารย์ผู้ดูแลได้ไม่เกิน 5 คน');
  const users = await User.find({ username: { $in: names }, role: 'teacher', approval: 'approved', isDeleted: false });
  const missing = names.filter((n) => !users.some((u) => u.username === n));
  if (missing.length) throw new HttpError(400, `ไม่พบอาจารย์ที่อนุมัติแล้ว: ${missing.join(', ')}`);
  return users.map((u) => u._id);
}

async function syncTeacherMemberships(group, teacherIds) {
  const keep = teacherIds.map(String);
  await Membership.deleteMany({ group: group._id, role: 'manager', user: { $nin: teacherIds } });
  for (const t of teacherIds) {
    await Membership.updateOne(
      { group: group._id, user: t },
      { $set: { role: 'manager', status: 'active', source: 'assigned' } },
      { upsert: true },
    );
  }
  return keep;
}

async function view(user, group) {
  const [item] = await course.summaries([group], user);
  item.enrolledCount = await Enrollment.countDocuments({ group: group._id });
  return item;
}

async function list(user, { semester, q }) {
  return course.list(user, { scope: 'all', semester, q }).then(async (items) => {
    const counts = await Enrollment.aggregate([{ $group: { _id: '$group', n: { $sum: 1 } } }]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));
    return items.map((i) => ({ ...i, enrolledCount: byId.get(String(i._id)) || 0 }));
  });
}

async function create(user, body) {
  const info = cleanInfo(body, false);
  const slots = parseSchedule(body.schedule === undefined ? [] : body.schedule);
  const teacherIds = (await resolveTeachers(body.teachers)) || [];
  const duplicate = await Group.exists({ type: 'course', isDeleted: false, 'course.code': info.code, 'course.section': info.section, 'course.semester': info.semester });
  if (duplicate) throw new HttpError(409, 'มีวิชารหัสเดียวกัน กลุ่มเรียนเดียวกัน ในภาคเรียนนี้แล้ว');

  const group = new Group({
    type: 'course',
    name: `${info.code} ${info.name}`,
    description: info.description || '',
    owner: user._id,
    course: { code: info.code, section: info.section, semester: info.semester, credits: info.credits, teachers: teacherIds, schedule: slots },
  });
  await group.validate();
  await course.assertNoConflicts(group, slots, teacherIds, info.semester, true);
  await group.save();
  await Conversation.create({ type: 'group', group: group._id });
  await syncTeacherMemberships(group, teacherIds);
  return view(user, group);
}

async function update(user, id, body) {
  const group = await course.loadCourse(id);
  const info = cleanInfo(body, true);
  const slots = parseSchedule(body.schedule);
  const teacherIds = await resolveTeachers(body.teachers);

  const next = {
    code: info.code || group.course.code,
    section: info.section || group.course.section,
    semester: info.semester || group.course.semester,
  };
  const duplicate = await Group.exists({
    type: 'course', isDeleted: false, _id: { $ne: group._id },
    'course.code': next.code, 'course.section': next.section, 'course.semester': next.semester,
  });
  if (duplicate) throw new HttpError(409, 'มีวิชารหัสเดียวกัน กลุ่มเรียนเดียวกัน ในภาคเรียนนี้แล้ว');

  const finalSlots = slots || group.course.schedule.map((s) => ({ day: s.day, startMin: s.startMin, endMin: s.endMin, room: s.room }));
  const finalTeachers = teacherIds || group.course.teachers;
  if (slots || teacherIds || info.semester) {
    await course.assertNoConflicts(group, finalSlots, finalTeachers, next.semester, body.confirmStudentClash === true);
  }

  if (info.code || info.name) {
    group.name = `${info.code || group.course.code} ${info.name || group.name.replace(/^\S+\s/, '')}`;
  }
  if (info.description !== undefined) group.description = info.description;
  Object.assign(group.course, next);
  if (info.credits !== undefined) group.course.credits = info.credits;
  group.course.schedule = finalSlots;
  if (teacherIds) group.course.teachers = teacherIds;
  await group.save();
  if (teacherIds) await syncTeacherMemberships(group, teacherIds);
  return view(user, group);
}

async function remove(id) {
  const group = await course.loadCourse(id);
  group.isDeleted = true; // ซ่อนวิชา (เก็บข้อมูลงาน/ประกาศไว้ ไม่ลบถาวร)
  await group.save();
  return { removed: true };
}

// ---------- ลงทะเบียนเรียน ----------
async function enrollments(id) {
  const group = await course.loadCourse(id);
  const rows = await Enrollment.find({ group: group._id }).sort({ studentId: 1 }).lean();
  const ids = rows.map((r) => r.studentId);
  const [registry, accounts] = await Promise.all([
    StudentRegistry.find({ studentId: { $in: ids } }).select('studentId fullName').lean(),
    User.find({ studentId: { $in: ids }, isDeleted: false }).select(USER_FIELDS + ' studentId'),
  ]);
  const nameById = new Map(registry.map((r) => [r.studentId, r.fullName]));
  const accById = new Map(accounts.map((a) => [a.studentId, a]));
  return rows.map((r) => ({
    studentId: r.studentId,
    fullName: nameById.get(r.studentId) || '(ไม่พบในทะเบียน)',
    account: accById.has(r.studentId) ? publicUser(accById.get(r.studentId)) : null, // null = ยังไม่สมัครใช้งาน
  }));
}

function parseStudentIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
  const ids = [...new Set(raw.map((s) => str(String(s))).filter(Boolean))];
  if (!ids.length) throw new HttpError(400, 'กรุณากรอกรหัสนักศึกษาอย่างน้อย 1 รหัส');
  if (ids.length > 200) throw new HttpError(400, 'เพิ่มได้ครั้งละไม่เกิน 200 รหัส');
  const bad = ids.filter((i) => !C.STUDENT_ID_REGEX.test(i));
  if (bad.length) throw new HttpError(400, `รหัสนักศึกษาต้องเป็นตัวเลข 9 หลัก: ${bad.slice(0, 5).join(', ')}`);
  return ids;
}

async function enroll(id, body) {
  const group = await course.loadCourse(id);
  const ids = parseStudentIds(body.studentIds);
  const known = await StudentRegistry.find({ studentId: { $in: ids }, status: 'student' }).select('studentId').lean();
  const knownSet = new Set(known.map((k) => k.studentId));
  const unknown = ids.filter((i) => !knownSet.has(i));
  if (unknown.length) throw new HttpError(400, `ไม่พบในทะเบียนนักศึกษา (หรือเป็นศิษย์เก่า): ${unknown.slice(0, 5).join(', ')}`);

  let added = 0;
  for (const studentId of ids) {
    const res = await Enrollment.updateOne({ studentId, group: group._id }, { $setOnInsert: { studentId, group: group._id } }, { upsert: true });
    if (res.upsertedCount) added += 1;
  }
  // นักศึกษาที่สมัครบัญชีแล้วเข้าห้องทันที ส่วนคนที่ยังไม่สมัครจะเข้าตอนสมัคร/ล็อกอิน
  const accounts = await User.find({ studentId: { $in: ids }, isDeleted: false }).select('_id');
  for (const a of accounts) {
    await Membership.updateOne(
      { group: group._id, user: a._id },
      { $setOnInsert: { role: 'member', status: 'active', source: 'registration' } },
      { upsert: true },
    );
    // คนที่ขอเข้าร่วมพิเศษอยู่ก่อน (pending) กลายเป็นสมาชิกเต็มตัว
    await Membership.updateOne({ group: group._id, user: a._id, status: 'pending' }, { $set: { status: 'active', source: 'registration' } });
  }
  return { added, total: ids.length };
}

async function unenroll(id, studentId) {
  const group = await course.loadCourse(id);
  if (!C.STUDENT_ID_REGEX.test(studentId)) throw new HttpError(400, 'รหัสนักศึกษาไม่ถูกต้อง');
  const res = await Enrollment.deleteOne({ studentId, group: group._id });
  if (!res.deletedCount) throw new HttpError(404, 'ไม่พบการลงทะเบียนนี้');
  const account = await User.findOne({ studentId }).select('_id');
  if (account) await Membership.deleteOne({ group: group._id, user: account._id, role: 'member' });
  return { removed: true };
}

// ค้นหาอาจารย์ที่อนุมัติแล้ว (ใช้เลือกอาจารย์ผู้สอนตอนสร้าง/แก้ไขวิชา)
async function searchTeachers(q) {
  const filter = { role: 'teacher', approval: 'approved', isDeleted: false };
  const term = str(q).replace(/^@/, '');
  if (term) {
    const re = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ displayName: re }, { username: re }, { department: re }];
  }
  const users = await User.find(filter).sort({ displayName: 1 }).limit(20).select(USER_FIELDS + ' faculty department');
  return users.map((u) => ({ ...publicUser(u), faculty: u.faculty, department: u.department }));
}

module.exports = { searchTeachers, list, create, update, remove, enrollments, enroll, unenroll };

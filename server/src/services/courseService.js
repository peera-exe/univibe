// กลุ่มรายวิชา: รายการวิชา สิทธิ์เข้าถึง การเข้าร่วม สมาชิก คำขอพิเศษ ตารางเรียน และการตรวจความขัดแย้ง
const mongoose = require('mongoose');
const Group = require('../models/Group');
const Membership = require('../models/Membership');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { escapeRegex } = require('../utils/text');
const { publicUser, USER_FIELDS } = require('../utils/serialize');
const { parseSchedule, overlap, describeSlot, serializeSlots } = require('../utils/schedule');
const notifications = require('./notificationService');

const same = (a, b) => String(a && a._id ? a._id : a) === String(b && b._id ? b._id : b);

function assertId(id, label = 'รหัสวิชา') {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
}

async function loadCourse(id) {
  assertId(id);
  const group = await Group.findOne({ _id: id, type: 'course', isDeleted: false });
  if (!group) throw new HttpError(404, 'ไม่พบวิชานี้');
  return group;
}

// แอดมินหรืออาจารย์ผู้ดูแลวิชานี้
const canManage = (user, group) => user.role === 'admin' || group.course.teachers.some((t) => same(t, user));

async function requireManager(user, id) {
  const group = await loadCourse(id);
  if (!canManage(user, group)) throw new HttpError(403, 'เฉพาะอาจารย์ผู้ดูแลวิชาหรือแอดมินเท่านั้น');
  return group;
}

// ---------- รูปแบบข้อมูลที่ส่งให้หน้าเว็บ ----------
async function teacherMap(groups) {
  const ids = [...new Set(groups.flatMap((g) => g.course.teachers.map(String)))];
  const users = await User.find({ _id: { $in: ids } }).select(USER_FIELDS);
  return new Map(users.map((u) => [String(u._id), publicUser(u)]));
}

async function summaries(groups, user) {
  const ids = groups.map((g) => g._id);
  const [memberships, counts, teachers] = await Promise.all([
    Membership.find({ group: { $in: ids }, user: user._id }).lean(),
    Membership.aggregate([
      { $match: { group: { $in: ids }, status: 'active', role: 'member' } },
      { $group: { _id: '$group', n: { $sum: 1 } } },
    ]),
    teacherMap(groups),
  ]);
  const mine = new Map(memberships.map((m) => [String(m.group), m]));
  const count = new Map(counts.map((r) => [String(r._id), r.n]));
  return groups.map((g) => {
    const m = mine.get(String(g._id));
    const manage = canManage(user, g);
    return {
      _id: g._id,
      name: g.name,
      description: g.description,
      code: g.course.code,
      section: g.course.section,
      semester: g.course.semester,
      credits: g.course.credits,
      teachers: g.course.teachers.map((t) => teachers.get(String(t))).filter(Boolean),
      schedule: serializeSlots(g.course.schedule),
      studentsCount: count.get(String(g._id)) || 0,
      canManage: manage,
      // null = ยังไม่เข้าร่วม | pending = รออนุมัติ | member | manager
      myStatus: m ? (m.status === 'pending' ? 'pending' : m.role) : (manage ? 'manager' : null),
    };
  });
}

// ---------- รายการวิชา ----------
async function list(user, { scope, q, semester }) {
  const filter = { type: 'course', isDeleted: false };
  if (semester) filter['course.semester'] = String(semester);
  if (scope === 'mine') {
    const ids = await Membership.find({ user: user._id, status: 'active' }).distinct('group');
    filter._id = { $in: ids };
  }
  const term = String(q || '').trim();
  if (term) {
    const rx = { $regex: escapeRegex(term), $options: 'i' };
    filter.$or = [{ name: rx }, { 'course.code': rx }];
  }
  const groups = await Group.find(filter).sort({ 'course.semester': -1, 'course.code': 1, 'course.section': 1 }).limit(100);
  return summaries(groups, user);
}

async function semesters() {
  const list = await Group.distinct('course.semester', { type: 'course', isDeleted: false });
  return list.sort().reverse();
}

async function detail(user, id) {
  const group = await loadCourse(id);
  const base = (await summaries([group], user))[0];
  const isMember = ['member', 'manager'].includes(base.myStatus);
  const result = { ...base };
  if (isMember) {
    const conv = await Conversation.findOne({ type: 'group', group: group._id }).select('_id');
    result.conversationId = conv ? conv._id : null;
  }
  if (base.canManage) result.pendingCount = await Membership.countDocuments({ group: group._id, status: 'pending' });
  return result;
}

// ---------- สมาชิก / คำขอพิเศษ ----------
async function members(user, id) {
  const group = await loadCourse(id);
  const me = await Membership.findOne({ group: group._id, user: user._id, status: 'active' });
  if (!me && !canManage(user, group)) throw new HttpError(403, 'ดูรายชื่อสมาชิกได้เฉพาะสมาชิกของวิชา');
  const rows = await Membership.find({ group: group._id, status: 'active' }).sort({ createdAt: 1 }).populate('user', USER_FIELDS);
  const list = rows.filter((r) => r.user && !r.user.isDeleted).map((r) => ({
    ...publicUser(r.user), memberRole: r.role, source: r.source,
  }));
  return [...list.filter((m) => m.memberRole === 'manager'), ...list.filter((m) => m.memberRole !== 'manager')];
}

// นักศึกษาที่ไม่ได้ลงทะเบียนวิชานี้ขอเข้าร่วมเป็นกรณีพิเศษ ต้องให้อาจารย์ผู้ดูแลหรือแอดมินอนุมัติ
async function requestJoin(user, id) {
  const group = await loadCourse(id);
  if (user.role !== 'user' || user.status !== 'student') {
    throw new HttpError(403, 'เฉพาะนักศึกษาเท่านั้นที่ขอเข้าร่วมวิชาได้');
  }
  if (canManage(user, group)) throw new HttpError(400, 'คุณเป็นผู้ดูแลวิชานี้อยู่แล้ว');
  const existing = await Membership.findOne({ group: group._id, user: user._id });
  if (existing) return { status: existing.status === 'pending' ? 'pending' : existing.role };
  await Membership.create({ group: group._id, user: user._id, role: 'member', status: 'pending', source: 'request' });
  const link = `/course.html?id=${group._id}`;
  const text = `${user.displayName} ขอเข้าร่วมวิชา ${group.course.code} เป็นกรณีพิเศษ`;
  for (const t of group.course.teachers) {
    await notifications.notify({ user: t, type: 'group_request', actor: user._id, group: group._id, link, text, dedupeKey: `courserequest:${group._id}:${user._id}:${t}` });
  }
  return { status: 'pending' };
}

async function cancelRequest(user, id) {
  const group = await loadCourse(id);
  const res = await Membership.deleteOne({ group: group._id, user: user._id, status: 'pending' });
  if (!res.deletedCount) throw new HttpError(404, 'ไม่พบคำขอที่รออนุมัติ');
  return { status: null };
}

async function requests(user, id) {
  const group = await requireManager(user, id);
  const rows = await Membership.find({ group: group._id, status: 'pending' }).sort({ createdAt: 1 }).populate('user', USER_FIELDS + ' studentId');
  return rows.filter((r) => r.user && !r.user.isDeleted).map((r) => ({
    ...publicUser(r.user), studentId: r.user.studentId, requestedAt: r.createdAt,
  }));
}

async function decide(user, id, targetId, approve) {
  const group = await requireManager(user, id);
  assertId(targetId, 'รหัสผู้ใช้');
  const pending = await Membership.findOne({ group: group._id, user: targetId, status: 'pending' });
  if (!pending) throw new HttpError(404, 'ไม่พบคำขอเข้าร่วมของผู้ใช้นี้');
  if (approve) {
    pending.status = 'active';
    await pending.save();
  } else {
    await pending.deleteOne();
  }
  await notifications.notify({
    user: targetId, type: approve ? 'group_approved' : 'group_rejected', actor: user._id, group: group._id,
    link: approve ? `/course.html?id=${group._id}` : undefined,
    text: approve ? `คุณได้เข้าร่วมวิชา ${group.course.code} แล้ว` : `คำขอเข้าร่วมวิชา ${group.course.code} ไม่ได้รับการอนุมัติ`,
  });
  return { status: approve ? 'member' : null };
}

// นำสมาชิกออก: ใช้กับคนที่เข้ามาด้วยคำขอพิเศษ (คนที่ลงทะเบียนจริงให้แอดมินถอนที่หน้าจัดการวิชา)
async function removeMember(user, id, targetId) {
  const group = await requireManager(user, id);
  assertId(targetId, 'รหัสผู้ใช้');
  const m = await Membership.findOne({ group: group._id, user: targetId, status: 'active' });
  if (!m) throw new HttpError(404, 'ไม่พบสมาชิกคนนี้ในวิชา');
  if (m.role === 'manager') throw new HttpError(400, 'ไม่สามารถนำอาจารย์ผู้ดูแลออกได้');
  if (m.source === 'registration' && user.role !== 'admin') {
    throw new HttpError(403, 'นักศึกษาที่ลงทะเบียนเรียนแล้วให้แอดมินเป็นผู้ถอนที่หน้าจัดการวิชา');
  }
  await m.deleteOne();
  return { removed: true };
}

async function leave(user, id) {
  const group = await loadCourse(id);
  const m = await Membership.findOne({ group: group._id, user: user._id });
  if (!m) throw new HttpError(404, 'คุณไม่ได้อยู่ในวิชานี้');
  if (m.role === 'manager') throw new HttpError(400, 'อาจารย์ผู้ดูแลออกจากวิชาไม่ได้');
  if (m.source === 'registration') throw new HttpError(400, 'วิชาที่ลงทะเบียนเรียนแล้วออกเองไม่ได้ (ถอนที่งานทะเบียน)');
  await m.deleteOne();
  return { status: null };
}

// ---------- ตารางเรียน: ตรวจความขัดแย้ง ----------
// คืนรายการสิ่งที่ชนกันเมื่อวิชา group ใช้ตาราง slots (ไม่ได้บันทึกอะไร)
//  - roomClashes / teacherClashes: บล็อกเสมอ
//  - studentClashes: เตือน ผู้แก้ยืนยันข้ามได้
async function findConflicts(group, slots, teacherIds, semester) {
  const others = await Group.find({ type: 'course', isDeleted: false, _id: { $ne: group._id }, 'course.semester': semester });
  const roomClashes = [];
  const teacherClashes = [];
  const teacherSet = new Set(teacherIds.map(String));
  for (const o of others) {
    const shareTeacher = o.course.teachers.some((t) => teacherSet.has(String(t)));
    for (const a of slots) {
      for (const b of o.course.schedule) {
        if (!overlap(a, b)) continue;
        const label = `${o.course.code} (${describeSlot(b)})`;
        if (a.room === b.room) roomClashes.push(`ห้อง ${a.room} ชนกับ ${label}`);
        if (shareTeacher) teacherClashes.push(`อาจารย์ผู้สอนมีสอนซ้อนกับ ${label}`);
      }
    }
  }

  // นักศึกษาของวิชานี้ที่มีวิชาอื่นเรียนซ้อนเวลา
  const studentClashes = [];
  const memberRows = await Membership.find({ group: group._id, status: 'active', role: 'member' }).select('user').lean();
  if (memberRows.length && others.length) {
    const memberIds = memberRows.map((m) => m.user);
    const otherIds = others.map((o) => o._id);
    const theirMemberships = await Membership.find({ user: { $in: memberIds }, group: { $in: otherIds }, status: 'active' }).lean();
    const otherById = new Map(others.map((o) => [String(o._id), o]));
    const users = await User.find({ _id: { $in: memberIds } }).select('displayName');
    const nameById = new Map(users.map((u) => [String(u._id), u.displayName]));
    for (const tm of theirMemberships) {
      const o = otherById.get(String(tm.group));
      const hit = slots.some((a) => o.course.schedule.some((b) => overlap(a, b)));
      if (hit) studentClashes.push({ userId: String(tm.user), name: nameById.get(String(tm.user)) || 'นักศึกษา', course: o.course.code });
    }
  }
  return {
    roomClashes: [...new Set(roomClashes)],
    teacherClashes: [...new Set(teacherClashes)],
    studentClashes,
  };
}

// ตรวจแล้วโยน error: ห้อง/อาจารย์ชนบล็อกเสมอ นักศึกษาชนต้อง confirm
async function assertNoConflicts(group, slots, teacherIds, semester, confirmStudentClash) {
  const c = await findConflicts(group, slots, teacherIds, semester);
  const blocking = [...c.roomClashes, ...c.teacherClashes];
  if (blocking.length) {
    const err = new HttpError(409, `บันทึกไม่ได้: ${blocking.join(' / ')}`);
    err.details = { code: 'BLOCKING_CLASH', conflicts: blocking };
    throw err;
  }
  if (c.studentClashes.length && !confirmStudentClash) {
    const names = [...new Set(c.studentClashes.map((s) => s.name))];
    const err = new HttpError(409, `มีนักศึกษา ${names.length} คนที่เรียนวิชาอื่นซ้อนเวลานี้ ต้องการบันทึกต่อหรือไม่`);
    err.details = { code: 'STUDENT_CLASH', clashes: c.studentClashes };
    throw err;
  }
}

// อาจารย์ผู้ดูแลหรือแอดมินแก้เวลาเรียน (ใช้การตรวจชนชุดเดียวกับตอนแอดมินสร้างวิชา)
async function updateSchedule(user, id, body) {
  const group = await requireManager(user, id);
  const slots = parseSchedule(body.schedule);
  if (!slots) throw new HttpError(400, 'กรุณาส่งตารางเรียน');
  await assertNoConflicts(group, slots, group.course.teachers, group.course.semester, body.confirmStudentClash === true);
  group.course.schedule = slots;
  await group.save();
  return (await summaries([group], user))[0];
}

// ---------- ตารางเรียนของฉัน ----------
async function myTimetable(user, semester) {
  const memberIds = await Membership.find({ user: user._id, status: 'active' }).distinct('group');
  const filter = { type: 'course', isDeleted: false, $or: [{ _id: { $in: memberIds } }, { 'course.teachers': user._id }] };
  const all = await Group.find(filter);
  const available = [...new Set(all.map((g) => g.course.semester))].sort().reverse();
  const chosen = semester || available[0] || null;
  const groups = all.filter((g) => g.course.semester === chosen);

  const slots = [];
  for (const g of groups) {
    for (const s of g.course.schedule) {
      slots.push({ courseId: g._id, code: g.course.code, name: g.name, section: g.course.section, day: s.day, startMin: s.startMin, endMin: s.endMin, room: s.room, clash: false });
    }
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (overlap(slots[i], slots[j])) { slots[i].clash = true; slots[j].clash = true; }
    }
  }
  slots.sort((a, b) => a.startMin - b.startMin);
  return { semester: chosen, semesters: available, slots };
}

module.exports = {
  loadCourse, canManage, requireManager, summaries, list, semesters, detail, members, requestJoin, cancelRequest,
  requests, decide, removeMember, leave, findConflicts, assertNoConflicts, updateSchedule, myTimetable,
};

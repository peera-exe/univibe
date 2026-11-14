// ประกาศของวิชา: อาจารย์ผู้ดูแลสร้าง/แก้ได้ แอดมินลบได้ นักศึกษาในวิชาอ่านได้
const mongoose = require('mongoose');
const Announcement = require('../models/Announcement');
const Membership = require('../models/Membership');
const HttpError = require('../utils/httpError');
const { publicUser, USER_FIELDS } = require('../utils/serialize');
const course = require('./courseService');
const notifications = require('./notificationService');

const isTeacherOf = (user, group) => group.course.teachers.some((t) => String(t) === String(user._id));

async function assertMember(user, group) {
  if (course.canManage(user, group)) return;
  const m = await Membership.exists({ group: group._id, user: user._id, status: 'active' });
  if (!m) throw new HttpError(403, 'ดูประกาศได้เฉพาะสมาชิกของวิชา');
}

function clean(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!title || title.length > 150) throw new HttpError(400, 'หัวข้อประกาศต้องยาว 1–150 ตัวอักษร');
  if (!text || text.length > 5000) throw new HttpError(400, 'เนื้อหาประกาศต้องยาว 1–5,000 ตัวอักษร');
  return { title, body: text };
}

const view = (a, author, group, user) => ({
  _id: a._id, title: a.title, body: a.body, createdAt: a.createdAt, updatedAt: a.updatedAt,
  author: publicUser(author),
  canEdit: isTeacherOf(user, group),
  canDelete: isTeacherOf(user, group) || user.role === 'admin',
});

async function list(user, courseId) {
  const group = await course.loadCourse(courseId);
  await assertMember(user, group);
  const rows = await Announcement.find({ group: group._id, isDeleted: false }).sort({ createdAt: -1 }).limit(100).populate('author', USER_FIELDS);
  return rows.map((a) => view(a, a.author, group, user));
}

async function create(user, courseId, body) {
  const group = await course.loadCourse(courseId);
  if (!isTeacherOf(user, group)) throw new HttpError(403, 'เฉพาะอาจารย์ผู้ดูแลวิชาเท่านั้นที่สร้างประกาศได้');
  const a = await Announcement.create({ group: group._id, author: user._id, ...clean(body) });
  const students = await Membership.find({ group: group._id, status: 'active', role: 'member' }).select('user').lean();
  const link = `/course.html?id=${group._id}`;
  for (const s of students) {
    await notifications.notify({ user: s.user, type: 'announcement', actor: user._id, group: group._id, link, text: `ประกาศใหม่ใน ${group.course.code}: ${a.title}`.slice(0, 300), dedupeKey: `announcement:${a._id}:${s.user}` });
  }
  return view(a, user, group, user);
}

async function load(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'รหัสประกาศไม่ถูกต้อง');
  const a = await Announcement.findOne({ _id: id, isDeleted: false });
  if (!a) throw new HttpError(404, 'ไม่พบประกาศนี้');
  const group = await course.loadCourse(a.group);
  return { a, group };
}

async function update(user, id, body) {
  const { a, group } = await load(id);
  if (!isTeacherOf(user, group)) throw new HttpError(403, 'เฉพาะอาจารย์ผู้ดูแลวิชาเท่านั้นที่แก้ประกาศได้');
  Object.assign(a, clean(body));
  await a.save();
  await a.populate('author', USER_FIELDS);
  return view(a, a.author, group, user);
}

async function remove(user, id) {
  const { a, group } = await load(id);
  if (!isTeacherOf(user, group) && user.role !== 'admin') throw new HttpError(403, 'ไม่มีสิทธิ์ลบประกาศนี้');
  a.isDeleted = true;
  await a.save();
  return { removed: true };
}

module.exports = { list, create, update, remove, isTeacherOf };

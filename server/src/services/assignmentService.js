// งานในวิชา: อาจารย์ผู้ดูแลสร้าง/แก้/ตรวจ นักศึกษาส่งไฟล์ แอดมินลบงานได้แต่สร้างไม่ได้
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Membership = require('../models/Membership');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { publicUser, USER_FIELDS } = require('../utils/serialize');
const { removeFiles } = require('../middleware/upload');
const { UPLOAD_DIR } = require('../config/env');
const course = require('./courseService');
const { isTeacherOf } = require('./announcementService');
const notifications = require('./notificationService');

const SUB_DIR = path.join(UPLOAD_DIR, 'submissions');

function parseDate(value, label) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw new HttpError(400, `${label}ไม่ถูกต้อง`);
  return d;
}

function clean(body, partial, current) {
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 150) throw new HttpError(400, 'ชื่องานต้องยาว 1–150 ตัวอักษร');
    out.title = title;
  }
  if (body.description !== undefined) {
    const d = typeof body.description === 'string' ? body.description.trim() : '';
    if (d.length > 5000) throw new HttpError(400, 'รายละเอียดงานต้องไม่เกิน 5,000 ตัวอักษร');
    out.description = d;
  }
  if (!partial || body.dueAt !== undefined) out.dueAt = parseDate(body.dueAt, 'กำหนดส่ง');
  if (!partial || body.closeAt !== undefined) out.closeAt = parseDate(body.closeAt, 'เวลาปิดรับงาน');
  if (!partial || body.maxScore !== undefined) {
    const max = body.maxScore === undefined || body.maxScore === '' ? 100 : Number(body.maxScore);
    if (!Number.isFinite(max) || max < 1 || max > 1000) throw new HttpError(400, 'คะแนนเต็มต้องอยู่ระหว่าง 1–1000');
    out.maxScore = max;
  }
  const due = out.dueAt || (current && current.dueAt);
  const close = out.closeAt || (current && current.closeAt);
  if (due && close && close < due) throw new HttpError(400, 'เวลาปิดรับงานต้องไม่ก่อนกำหนดส่ง');
  return out;
}

async function loadAssignment(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'รหัสงานไม่ถูกต้อง');
  const a = await Assignment.findOne({ _id: id, isDeleted: false });
  if (!a) throw new HttpError(404, 'ไม่พบงานนี้');
  const group = await course.loadCourse(a.group);
  return { a, group };
}

async function assertMember(user, group) {
  if (course.canManage(user, group)) return;
  if (!(await Membership.exists({ group: group._id, user: user._id, status: 'active' }))) {
    throw new HttpError(403, 'ดูงานได้เฉพาะสมาชิกของวิชา');
  }
}

const isStudentMember = async (user, group) =>
  Boolean(await Membership.exists({ group: group._id, user: user._id, status: 'active', role: 'member' }));

function subView(s) {
  if (!s) return null;
  return {
    _id: s._id, submittedAt: s.submittedAt, isLate: s.isLate, fileName: s.file.originalName, fileSize: s.file.size,
    score: s.score === undefined ? null : s.score, feedback: s.feedback || '', gradedAt: s.gradedAt || null,
  };
}

function view(a, group, user, mySub, counts) {
  const now = new Date();
  return {
    _id: a._id, courseId: group._id, title: a.title, description: a.description,
    dueAt: a.dueAt, closeAt: a.closeAt, maxScore: a.maxScore, createdAt: a.createdAt,
    isClosed: now > a.closeAt, isPastDue: now > a.dueAt,
    canManage: isTeacherOf(user, group), canDelete: isTeacherOf(user, group) || user.role === 'admin',
    mySubmission: subView(mySub),
    counts: counts || undefined,
  };
}

async function list(user, courseId) {
  const group = await course.loadCourse(courseId);
  await assertMember(user, group);
  const items = await Assignment.find({ group: group._id, isDeleted: false }).sort({ dueAt: 1 });
  const ids = items.map((a) => a._id);
  const manage = isTeacherOf(user, group) || user.role === 'admin';
  const [mine, counts, total] = await Promise.all([
    Submission.find({ assignment: { $in: ids }, student: user._id }),
    manage ? Submission.aggregate([
      { $match: { assignment: { $in: ids } } },
      { $group: { _id: '$assignment', submitted: { $sum: 1 }, graded: { $sum: { $cond: [{ $ifNull: ['$gradedAt', false] }, 1, 0] } } } },
    ]) : [],
    manage ? Membership.countDocuments({ group: group._id, status: 'active', role: 'member' }) : 0,
  ]);
  const mineBy = new Map(mine.map((s) => [String(s.assignment), s]));
  const countBy = new Map(counts.map((c) => [String(c._id), c]));
  return items.map((a) => view(a, group, user, mineBy.get(String(a._id)), manage ? { students: total, submitted: (countBy.get(String(a._id)) || {}).submitted || 0, graded: (countBy.get(String(a._id)) || {}).graded || 0 } : null));
}

async function get(user, id) {
  const { a, group } = await loadAssignment(id);
  await assertMember(user, group);
  const mine = await Submission.findOne({ assignment: a._id, student: user._id });
  return view(a, group, user, mine);
}

async function create(user, courseId, body) {
  const group = await course.loadCourse(courseId);
  if (!isTeacherOf(user, group)) throw new HttpError(403, 'เฉพาะอาจารย์ผู้ดูแลวิชาเท่านั้นที่สร้างงานได้');
  const data = clean(body, false);
  if (data.closeAt <= new Date()) throw new HttpError(400, 'เวลาปิดรับงานต้องอยู่ในอนาคต');
  const a = await Assignment.create({ ...data, group: group._id, createdBy: user._id });
  const students = await Membership.find({ group: group._id, status: 'active', role: 'member' }).select('user').lean();
  const link = `/course.html?id=${group._id}&tab=assignments`;
  for (const s of students) {
    await notifications.notify({ user: s.user, type: 'assignment_new', actor: user._id, group: group._id, assignment: a._id, link, text: `งานใหม่ใน ${group.course.code}: ${a.title}`.slice(0, 300), dedupeKey: `assignment_new:${a._id}:${s.user}` });
  }
  return view(a, group, user, null);
}

async function update(user, id, body) {
  const { a, group } = await loadAssignment(id);
  if (!isTeacherOf(user, group)) throw new HttpError(403, 'เฉพาะอาจารย์ผู้ดูแลวิชาเท่านั้นที่แก้งานได้');
  const data = clean(body, true, a);
  if (data.maxScore !== undefined && data.maxScore < a.maxScore) {
    const over = await Submission.exists({ assignment: a._id, score: { $gt: data.maxScore } });
    if (over) throw new HttpError(400, 'มีคะแนนที่ตรวจแล้วสูงกว่าคะแนนเต็มใหม่');
  }
  Object.assign(a, data);
  await a.save();
  return view(a, group, user, null);
}

async function remove(user, id) {
  const { a, group } = await loadAssignment(id);
  if (!isTeacherOf(user, group) && user.role !== 'admin') throw new HttpError(403, 'ไม่มีสิทธิ์ลบงานนี้');
  a.isDeleted = true;
  await a.save();
  return { removed: true };
}

// ---------- ส่งงาน ----------
async function submit(user, id, file) {
  try {
    const { a, group } = await loadAssignment(id);
    if (!(await isStudentMember(user, group))) throw new HttpError(403, 'เฉพาะนักศึกษาในวิชานี้เท่านั้นที่ส่งงานได้');
    const now = new Date();
    if (now > a.closeAt) throw new HttpError(400, 'งานนี้ปิดรับแล้ว');
    const fileDoc = { path: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size };
    const existing = await Submission.findOne({ assignment: a._id, student: user._id });
    if (existing) {
      const oldName = existing.file.path;
      existing.file = fileDoc;
      existing.submittedAt = now;
      existing.isLate = now > a.dueAt;
      // ส่งใหม่ = เนื้อหาเปลี่ยน คะแนนและคำติชมเดิมถูกล้างเพื่อตรวจใหม่
      existing.score = undefined; existing.feedback = undefined; existing.gradedAt = undefined; existing.gradedBy = undefined;
      await existing.save();
      try { fs.unlinkSync(path.join(SUB_DIR, oldName)); } catch (e) { /* ไม่มีไฟล์เก่าแล้ว */ }
      return subView(existing);
    }
    const s = await Submission.create({ assignment: a._id, student: user._id, file: fileDoc, submittedAt: now, isLate: now > a.dueAt });
    return subView(s);
  } catch (err) {
    removeFiles([file]);
    throw err;
  }
}

async function submissions(user, id) {
  const { a, group } = await loadAssignment(id);
  if (!isTeacherOf(user, group) && user.role !== 'admin') throw new HttpError(403, 'เฉพาะอาจารย์ผู้ดูแลวิชาหรือแอดมินเท่านั้น');
  const members = await Membership.find({ group: group._id, status: 'active', role: 'member' }).populate('user', USER_FIELDS + ' studentId');
  const subs = await Submission.find({ assignment: a._id });
  const byStudent = new Map(subs.map((s) => [String(s.student), s]));
  const rows = members.filter((m) => m.user && !m.user.isDeleted).map((m) => ({
    student: { ...publicUser(m.user), studentId: m.user.studentId },
    submission: subView(byStudent.get(String(m.user._id))),
  }));
  rows.sort((x, y) => String(x.student.studentId).localeCompare(String(y.student.studentId)));
  return { assignment: view(a, group, user, null), rows };
}

async function loadSubmission(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'รหัสการส่งงานไม่ถูกต้อง');
  const s = await Submission.findById(id);
  if (!s) throw new HttpError(404, 'ไม่พบการส่งงานนี้');
  const { a, group } = await loadAssignment(s.assignment);
  return { s, a, group };
}

// เจ้าของงานหรืออาจารย์ผู้ดูแล/แอดมิน ดาวน์โหลดได้
async function fileFor(user, id) {
  const { s, group } = await loadSubmission(id);
  const owner = String(s.student) === String(user._id);
  if (!owner && !isTeacherOf(user, group) && user.role !== 'admin') throw new HttpError(403, 'ไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้');
  return { absolute: path.join(SUB_DIR, path.basename(s.file.path)), name: s.file.originalName, mime: s.file.mimeType };
}

async function grade(user, id, body) {
  const { s, a, group } = await loadSubmission(id);
  if (!isTeacherOf(user, group)) throw new HttpError(403, 'เฉพาะอาจารย์ผู้ดูแลวิชาเท่านั้นที่ให้คะแนนได้');
  const score = Number(body.score);
  if (body.score === '' || body.score === null || !Number.isFinite(score) || score < 0 || score > a.maxScore) {
    throw new HttpError(400, `คะแนนต้องอยู่ระหว่าง 0–${a.maxScore}`);
  }
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
  if (feedback.length > 2000) throw new HttpError(400, 'คำติชมต้องไม่เกิน 2,000 ตัวอักษร');
  s.score = score; s.feedback = feedback || undefined; s.gradedAt = new Date(); s.gradedBy = user._id;
  await s.save();
  await notifications.notify({
    user: s.student, type: 'assignment_graded', actor: user._id, group: group._id, assignment: a._id,
    link: `/course.html?id=${group._id}&tab=assignments`, text: `งาน "${a.title}" ได้รับคะแนนแล้ว`.slice(0, 300),
    dedupeKey: `assignment_graded:${s._id}:${s.gradedAt.getTime()}`,
  });
  return subView(s);
}

module.exports = { list, get, create, update, remove, submit, submissions, fileFor, grade, loadAssignment };

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const StudentRegistry = require('../models/StudentRegistry');
const Enrollment = require('../models/Enrollment');
const Membership = require('../models/Membership');
const Notification = require('../models/Notification');
const HttpError = require('../utils/httpError');
const C = require('../utils/constants');

const BCRYPT_COST = 10;

// ---------- ตรวจข้อมูลที่ฝั่งเซิร์ฟเวอร์ (หน้าเว็บตรวจเพื่อช่วยผู้ใช้เท่านั้น) ----------
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function checkUsername(username) {
  if (!C.USERNAME_REGEX.test(username)) {
    throw new HttpError(400, 'username ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว');
  }
}

function checkEmail(email) {
  if (!C.EMAIL_REGEX.test(email) || email.length > 120) throw new HttpError(400, 'รูปแบบอีเมลไม่ถูกต้อง');
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < C.MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `รหัสผ่านต้องยาวอย่างน้อย ${C.MIN_PASSWORD_LENGTH} ตัวอักษร`);
  }
  if (password.length > 64) throw new HttpError(400, 'รหัสผ่านยาวเกินไป (ไม่เกิน 64 ตัวอักษร)');
}

function requireText(value, label, max = 100) {
  if (!value) throw new HttpError(400, `กรุณากรอก${label}`);
  if (value.length > max) throw new HttpError(400, `${label}ยาวเกินไป`);
}

// ---------- ยืนยันตัวตนด้วยทะเบียนนักศึกษา ----------
// ข้อความ error เหมือนกันทุกกรณี ไม่บอกว่ารหัสหรือวันเกิดอย่างใดผิด
async function verifyStudent(studentId, birthDate) {
  const invalid = new HttpError(400, 'รหัสนักศึกษาหรือวันเกิดไม่ตรงกับทะเบียน');
  if (!C.STUDENT_ID_REGEX.test(studentId) || !C.DATE_REGEX.test(birthDate)) throw invalid;
  const record = await StudentRegistry.findOne({ studentId, birthDate });
  if (!record) throw invalid;
  return record;
}

// นักศึกษาที่ลงทะเบียนวิชาไหนไว้ ให้เข้ากลุ่มรายวิชานั้นอัตโนมัติ
async function joinRegisteredCourses(user) {
  const enrollments = await Enrollment.find({ studentId: user.studentId });
  if (!enrollments.length) return 0;
  const ops = enrollments.map((e) => ({
    updateOne: {
      filter: { group: e.group, user: user._id },
      update: { $setOnInsert: { role: 'member', status: 'active', source: 'registration' } },
      upsert: true,
    },
  }));
  await Membership.bulkWrite(ops);
  return enrollments.length;
}

// ---------- สมัครสมาชิก ----------
async function registerStudent(body) {
  const username = str(body.username).toLowerCase();
  const email = str(body.email).toLowerCase();
  const studentId = str(body.studentId);
  const birthDate = str(body.birthDate);
  checkUsername(username);
  checkEmail(email);
  checkPassword(body.password);

  const record = await verifyStudent(studentId, birthDate);
  if (await User.exists({ studentId })) {
    throw new HttpError(409, 'รหัสนักศึกษานี้สมัครใช้งานแล้ว');
  }

  const user = await User.create({
    username,
    email,
    passwordHash: await bcrypt.hash(body.password, BCRYPT_COST),
    role: 'user',
    studentId,
    realName: record.fullName,
    displayName: record.fullName,
    status: record.status, // student หรือ alumni มาจากทะเบียน ผู้ใช้เลือกเองไม่ได้
    faculty: record.faculty,
    major: record.major,
  });
  await joinRegisteredCourses(user);
  return user;
}

async function registerTeacher(body) {
  const username = str(body.username).toLowerCase();
  const email = str(body.email).toLowerCase();
  const fullName = str(body.fullName);
  const faculty = str(body.faculty);
  const department = str(body.department);
  const staffId = str(body.staffId);
  checkUsername(username);
  checkEmail(email);
  checkPassword(body.password);
  requireText(fullName, 'ชื่อ-นามสกุล', 80);
  requireText(faculty, 'คณะ');
  requireText(department, 'ภาควิชา');
  requireText(staffId, 'รหัสบุคลากร', 20);

  return User.create({
    username,
    email,
    passwordHash: await bcrypt.hash(body.password, BCRYPT_COST),
    role: 'teacher',
    realName: fullName,
    displayName: fullName,
    faculty,
    department,
    staffId,
    approval: 'pending', // ต้องรอแอดมินอนุมัติก่อนล็อกอินได้
  });
}

// ---------- เข้าสู่ระบบ ----------
async function login(usernameInput, password) {
  const wrong = new HttpError(401, 'username หรือรหัสผ่านไม่ถูกต้อง'); // ข้อความเดียวกัน กันเดาว่ามีบัญชีไหน
  const username = str(usernameInput).toLowerCase();
  if (!username || typeof password !== 'string') throw wrong;

  const user = await User.findOne({ username, isDeleted: false }).select('+passwordHash');
  const hash = user ? user.passwordHash : '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'; // เวลาตอบใกล้เคียงกันทั้งสองกรณี
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw wrong;

  // ตรวจสถานะหลังรหัสผ่านถูกเท่านั้น
  if (user.isSuspended) throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
  if (user.approval === 'pending') throw new HttpError(403, 'บัญชีอาจารย์ของคุณรอแอดมินอนุมัติ');
  if (user.approval === 'rejected') throw new HttpError(403, 'คำขอเป็นอาจารย์ของคุณไม่ได้รับการอนุมัติ');

  user.loginCount += 1;
  user.lastLoginAt = new Date();
  await user.save();
  if (user.studentId) await joinRegisteredCourses(user); // ลงทะเบียนเพิ่มภายหลังก็เข้ากลุ่มให้เอง
  return user;
}

// ---------- ลืมรหัสผ่าน (ยืนยันด้วยรหัสนักศึกษา + วันเกิด) ----------
async function resetPassword(body) {
  checkPassword(body.newPassword);
  const studentId = str(body.studentId);
  const record = await verifyStudent(studentId, str(body.birthDate));
  const user = await User.findOne({ studentId: record.studentId, isDeleted: false });
  if (!user) throw new HttpError(400, 'รหัสนักศึกษานี้ยังไม่ได้สมัครใช้งาน');
  user.passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_COST);
  await user.save();
  return user;
}

// ---------- แอดมินอนุมัติอาจารย์ ----------
async function listTeachers(approval) {
  const filter = { role: 'teacher', isDeleted: false };
  if (approval) filter.approval = approval;
  return User.find(filter).sort({ createdAt: 1 });
}

async function decideTeacher(id, decision) {
  const teacher = await User.findOne({ _id: id, role: 'teacher', isDeleted: false });
  if (!teacher) throw new HttpError(404, 'ไม่พบอาจารย์ที่ต้องการ');
  if (teacher.approval !== 'pending') throw new HttpError(409, 'คำขอนี้ถูกดำเนินการไปแล้ว');
  teacher.approval = decision === 'approve' ? 'approved' : 'rejected';
  await teacher.save();
  await Notification.create({
    user: teacher._id,
    type: decision === 'approve' ? 'teacher_approved' : 'teacher_rejected',
    text: decision === 'approve' ? 'แอดมินอนุมัติบัญชีอาจารย์ของคุณแล้ว' : 'คำขอเป็นอาจารย์ของคุณไม่ได้รับการอนุมัติ',
  });
  return teacher;
}

module.exports = {
  registerStudent, registerTeacher, login, resetPassword, listTeachers, decideTeacher, verifyStudent,
  checkPassword, checkEmail, checkUsername, BCRYPT_COST,
};

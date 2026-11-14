const authService = require('../services/authService');

// สร้าง session ใหม่หลังล็อกอิน/สมัคร (regenerate กัน session fixation)
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = String(user._id);
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

async function register(req, res) {
  const user = await authService.registerStudent(req.body || {});
  await startSession(req, user);
  res.status(201).json({ user });
}

async function registerTeacher(req, res) {
  const user = await authService.registerTeacher(req.body || {});
  res.status(201).json({ message: 'ส่งคำขอเป็นอาจารย์แล้ว กรุณารอแอดมินอนุมัติก่อนเข้าสู่ระบบ', user });
}

async function login(req, res) {
  const { username, password } = req.body || {};
  const user = await authService.login(username, password);
  if (req.loginLimiter) req.loginLimiter.reset(req.rateLimitKey); // ล็อกอินสำเร็จ ล้างตัวนับ
  await startSession(req, user);
  res.json({ message: 'เข้าสู่ระบบสำเร็จ', user });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('univibe.sid');
    res.json({ message: 'ออกจากระบบแล้ว' });
  });
}

function me(req, res) {
  if (!req.user) return res.status(401).json({ error: 'ยังไม่ได้เข้าสู่ระบบ' });
  res.json({ user: req.user });
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.body || {});
  res.json({ message: 'ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' });
}

module.exports = { register, registerTeacher, login, logout, me, resetPassword };

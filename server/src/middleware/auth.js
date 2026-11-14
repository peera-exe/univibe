const User = require('../models/User');
const HttpError = require('../utils/httpError');

// โหลดผู้ใช้จาก session ทุกคำขอ: ถ้าถูกระงับ/ลบ/ยังไม่อนุมัติ จะถูกเตะออกทันที
async function loadUser(req, res, next) {
  const id = req.session && req.session.userId;
  if (!id) return next();

  const user = await User.findById(id);
  const active = user && !user.isDeleted && !user.isSuspended && user.approval === 'approved';
  if (!active) {
    await new Promise((resolve) => req.session.destroy(resolve));
    res.clearCookie('univibe.sid');
    return next();
  }
  req.user = user;
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'กรุณาเข้าสู่ระบบ'));
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'กรุณาเข้าสู่ระบบ'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'ไม่มีสิทธิ์ใช้งานส่วนนี้'));
    next();
  };
}

// กันคำขอเปลี่ยนข้อมูลที่ส่งมาจากเว็บอื่น (Origin ต้องตรงกับ host ของเรา)
function sameOrigin(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const origin = req.get('origin');
  if (!safe && origin) {
    let host = null;
    try { host = new URL(origin).host; } catch (e) { /* ปล่อยให้ถูกปฏิเสธ */ }
    if (host !== req.get('host')) return next(new HttpError(403, 'คำขอไม่ได้มาจากเว็บไซต์นี้'));
  }
  next();
}

module.exports = { loadUser, requireLogin, requireRole, sameOrigin };

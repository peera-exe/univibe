const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireLogin } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

// ล็อกอินผิดเกิน 10 ครั้งใน 15 นาที (ต่อ IP + username) จะถูกชะลอ
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `${req.ip}:${String((req.body && req.body.username) || '').toLowerCase()}`,
  message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
});
const attachLimiter = (req, res, next) => { req.loginLimiter = loginLimiter; next(); };

// Express 5 จับ error ใน async handler ให้อัตโนมัติ
router.post('/register', ctrl.register);
router.post('/register-teacher', ctrl.registerTeacher);
router.post('/login', loginLimiter, attachLimiter, ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', ctrl.me);
router.post('/reset-password', ctrl.resetPassword);

module.exports = router;

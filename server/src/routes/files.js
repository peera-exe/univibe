const path = require('path');
const router = require('express').Router();
const { UPLOAD_DIR } = require('../config/env');
const { requireLogin } = require('../middleware/auth');
const HttpError = require('../utils/httpError');

const FOLDERS = ['avatars', 'posts', 'chat']; // ไฟล์ส่งงานเปิดผ่านเส้นทางตรวจสิทธิ์ของงานโดยเฉพาะ
const NAME_REGEX = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

// ดูรูปได้เฉพาะผู้ที่ล็อกอินแล้ว และกัน path traversal ด้วยการจำกัดชื่อไฟล์
router.get('/:folder/:name', requireLogin, (req, res, next) => {
  const { folder, name } = req.params;
  if (!FOLDERS.includes(folder) || !NAME_REGEX.test(name)) return next(new HttpError(404, 'ไม่พบไฟล์'));
  res.set('Cache-Control', 'private, max-age=86400');
  res.sendFile(name, { root: path.join(UPLOAD_DIR, folder) }, (err) => {
    if (err) next(new HttpError(404, 'ไม่พบไฟล์'));
  });
});

module.exports = router;

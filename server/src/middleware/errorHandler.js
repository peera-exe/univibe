// จัดการ error ทั้งหมดให้ตอบเป็น JSON รูปแบบเดียวกัน { error: "ข้อความ" }
function notFound(req, res) {
  res.status(404).json({ error: 'ไม่พบเส้นทางที่ร้องขอ' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first ? first.message : 'ข้อมูลไม่ถูกต้อง' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'รูปแบบรหัสอ้างอิงไม่ถูกต้อง' });
  }
  if (err.code === 11000) {
    const labels = { username: 'username', email: 'อีเมล', studentId: 'รหัสนักศึกษา', staffId: 'รหัสบุคลากร' };
    const key = Object.keys(err.keyPattern || {}).find((k) => labels[k]);
    return res.status(409).json({ error: key ? `${labels[key]}นี้ถูกใช้แล้ว` : 'ข้อมูลนี้ถูกใช้แล้ว' });
  }
  if (err.name === 'MulterError') {
    const msg = {
      LIMIT_FILE_SIZE: req.originalUrl.includes('/assignments') ? 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB' : 'รูปแต่ละรูปต้องมีขนาดไม่เกิน 2 MB',
      LIMIT_FILE_COUNT: 'แนบรูปได้ไม่เกินจำนวนที่กำหนด',
      LIMIT_UNEXPECTED_FILE: 'แนบรูปได้ไม่เกินจำนวนที่กำหนด',
    }[err.code] || 'อัปโหลดรูปไม่สำเร็จ';
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'รูปแบบ JSON ไม่ถูกต้อง' });
  }

  if (!err.status || err.status >= 500) console.error(err); // ไม่บันทึก error ที่เกิดจากผู้ใช้ส่งข้อมูลผิด (4xx)
  res.status(err.status || 500).json({
    error: err.status ? err.message : 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
    ...(err.status && err.details ? err.details : {}), // ข้อมูลเพิ่มเติม เช่น รายการที่ชนกัน
  });
}

module.exports = { notFound, errorHandler };

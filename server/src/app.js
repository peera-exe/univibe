const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const sessionMiddleware = require('./config/session');
const { loadUser, sameOrigin } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

app.use(['/api', '/files'], sessionMiddleware, sameOrigin, loadUser);

// ตรวจสอบว่าเซิร์ฟเวอร์และฐานข้อมูลพร้อมใช้งาน
app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'UniVibe', db: mongoose.connection.readyState === 1 });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin/courses', require('./routes/adminCourses'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/chat', require('./routes/chat'));
app.use('/files', require('./routes/files'));
// routes ของงาน/ประกาศ/รายงาน จะถูกเพิ่มที่นี่ในช่วงถัดไป

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;

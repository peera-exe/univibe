const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { UPLOAD_DIR } = require('../config/env');
const HttpError = require('../utils/httpError');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB ต่อรูป
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// สร้างตัวอัปโหลดรูปไปเก็บใน uploads/<folder>/ ด้วยชื่อไฟล์สุ่ม (เดาลิงก์ไม่ได้)
function imageUploader(folder, maxFiles) {
  const dir = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT_BY_MIME[file.mimetype]),
  });

  return multer({
    storage,
    limits: { fileSize: MAX_IMAGE_BYTES, files: maxFiles },
    fileFilter: (req, file, cb) => {
      if (!EXT_BY_MIME[file.mimetype]) return cb(new HttpError(400, 'รองรับเฉพาะรูป JPG, PNG และ WebP'));
      cb(null, true);
    },
  });
}

// ตรวจ "ลายเซ็น" ของไฟล์จริง กันการเปลี่ยนนามสกุลไฟล์อื่นมาอัปโหลดเป็นรูป
function looksLikeImage(buffer) {
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';
  return jpeg || png || webp;
}

function removeFiles(files) {
  for (const f of files || []) {
    try { fs.unlinkSync(f.path); } catch (e) { /* ไฟล์ถูกลบไปแล้ว */ }
  }
}

// เรียกหลัง multer: ตรวจไฟล์ทุกไฟล์ ถ้ามีไฟล์ปลอมลบทิ้งทั้งหมดแล้วตอบ 400
function verifyImages(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  try {
    for (const f of files) {
      const fd = fs.openSync(f.path, 'r');
      const head = Buffer.alloc(12);
      fs.readSync(fd, head, 0, 12, 0);
      fs.closeSync(fd);
      if (!looksLikeImage(head)) throw new HttpError(400, 'ไฟล์ที่อัปโหลดไม่ใช่รูปภาพที่ถูกต้อง');
    }
  } catch (err) {
    removeFiles(files);
    return next(err);
  }
  next();
}

// แปลงไฟล์ที่อัปโหลดเป็น URL สำหรับเก็บในฐานข้อมูล (เปิดผ่าน /files ที่ต้องล็อกอิน)
function toUrls(folder, files) {
  return (files || []).map((f) => `/files/${folder}/${f.filename}`);
}

// ---------- ไฟล์ส่งงาน (PDF / Word / zip / รูป ไม่เกิน 10 MB) ----------
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const DOC_EXT = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  ...EXT_BY_MIME,
};

function documentUploader(folder) {
  const dir = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + DOC_EXT[file.mimetype]),
  });
  return multer({
    storage,
    limits: { fileSize: MAX_DOC_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!DOC_EXT[file.mimetype]) return cb(new HttpError(400, 'รองรับเฉพาะไฟล์ PDF, docx, zip และรูป JPG/PNG/WebP'));
      cb(null, true);
    },
  });
}

// ตรวจลายเซ็นไฟล์จริงให้ตรงกับชนิดที่ประกาศ (docx และ zip คือ zip ทั้งคู่)
function verifyDocument(req, res, next) {
  const file = req.file;
  if (!file) return next(new HttpError(400, 'กรุณาเลือกไฟล์ที่จะส่ง'));
  try {
    const fd = fs.openSync(file.path, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    const ext = DOC_EXT[file.mimetype];
    const isPdf = head.slice(0, 5).toString() === '%PDF-';
    const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    const valid = ext === '.pdf' ? isPdf : (ext === '.docx' || ext === '.zip') ? isZip : looksLikeImage(head);
    if (!valid) throw new HttpError(400, 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่เลือก');
  } catch (err) {
    removeFiles([file]);
    return next(err);
  }
  // multer อ่านชื่อไฟล์เป็น latin1 ต้องแปลงกลับเป็น UTF-8 เพื่อให้ชื่อไฟล์ภาษาไทยไม่เพี้ยน
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 150);
  next();
}

module.exports = { imageUploader, verifyImages, documentUploader, verifyDocument, removeFiles, toUrls, MAX_IMAGE_BYTES, MAX_DOC_BYTES };

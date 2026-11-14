const { Schema, model } = require('mongoose');
const C = require('../utils/constants');

const userSchema = new Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [C.USERNAME_REGEX, 'username ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว'] },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [C.EMAIL_REGEX, 'รูปแบบอีเมลไม่ถูกต้อง'] },
  passwordHash: { type: String, required: true, select: false }, // ไม่ถูกดึงมาโดยปริยาย ต้อง .select('+passwordHash')
  role: { type: String, enum: C.ROLES, default: 'user', index: true },

  usernameChangedAt: Date, // จำกัดการเปลี่ยน username ทุก 14 วัน

  displayName: { type: String, required: true, trim: true, maxlength: 60 },
  realName: { type: String, required: true, trim: true }, // มาจากทะเบียน แก้เองไม่ได้
  bio: { type: String, default: '', maxlength: 300 },
  avatarUrl: String,
  coverUrl: String,

  // ใครดูรายชื่อ "ผู้ติดตาม/กำลังติดตาม" ของเราได้ (เหมือน IG): everyone | followers | only_me
  // ความเป็นส่วนตัวเพิ่มเติม
  showFacultyMajor: { type: Boolean, default: true },                                     // แสดงคณะ/สาขา/ภาควิชาบนโปรไฟล์
  showOnlineStatus: { type: Boolean, default: true },                                     // แสดงสถานะออนไลน์ในแชท
  allowMessagesFrom: { type: String, enum: ['everyone', 'following', 'nobody'], default: 'everyone' }, // ใครส่งข้อความหาเราได้
  connectionsVisibility: { type: String, enum: ['everyone', 'followers', 'only_me'], default: 'everyone' },

  // นักศึกษา/ศิษย์เก่า
  studentId: { type: String, match: [C.STUDENT_ID_REGEX, 'รหัสนักศึกษาต้องเป็นตัวเลข 9 หลัก'] },
  status: { type: String, enum: C.STATUSES },
  faculty: String,
  major: String,

  // อาจารย์
  department: String,
  staffId: String,
  approval: { type: String, enum: C.APPROVALS, default: 'approved' }, // อาจารย์เริ่มที่ pending

  isSuspended: { type: Boolean, default: false },
  suspendedReason: String,
  isDeleted: { type: Boolean, default: false },

  loginCount: { type: Number, default: 0 },
  lastLoginAt: Date,
}, { timestamps: true });

// รหัสนักศึกษา/รหัสบุคลากรห้ามซ้ำ (เฉพาะบัญชีที่มีค่านี้)
userSchema.index({ studentId: 1 }, { unique: true, partialFilterExpression: { studentId: { $type: 'string' } } });
userSchema.index({ staffId: 1 }, { unique: true, partialFilterExpression: { staffId: { $type: 'string' } } });

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = model('User', userSchema);

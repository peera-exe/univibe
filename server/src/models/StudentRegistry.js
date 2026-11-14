// ทะเบียนนักศึกษาจำลอง (ใช้ยืนยันตัวตนตอนสมัคร: รหัสนักศึกษา + วันเกิดต้องตรงกัน)
const { Schema, model } = require('mongoose');
const { STUDENT_ID_REGEX, DATE_REGEX, STATUSES } = require('../utils/constants');

const studentRegistrySchema = new Schema({
  studentId: { type: String, required: true, unique: true, match: [STUDENT_ID_REGEX, 'รหัสนักศึกษาต้องเป็นตัวเลข 9 หลัก'] },
  fullName: { type: String, required: true, trim: true },
  birthDate: { type: String, required: true, match: [DATE_REGEX, 'วันเกิดต้องอยู่ในรูปแบบ YYYY-MM-DD'] },
  faculty: { type: String, required: true, trim: true },
  major: { type: String, required: true, trim: true },
  status: { type: String, enum: STATUSES, required: true }, // student = กำลังศึกษา, alumni = ศิษย์เก่า
}, { timestamps: true, collection: 'registry_students' });

module.exports = model('StudentRegistry', studentRegistrySchema);

// ข้อมูลลงทะเบียนเรียนจำลอง: นักศึกษารหัสนี้ลงทะเบียนวิชา (กลุ่มรายวิชา) ไหน
const { Schema, model } = require('mongoose');
const { STUDENT_ID_REGEX } = require('../utils/constants');

const enrollmentSchema = new Schema({
  studentId: { type: String, required: true, match: STUDENT_ID_REGEX },
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
}, { timestamps: true });

enrollmentSchema.index({ studentId: 1, group: 1 }, { unique: true });
enrollmentSchema.index({ group: 1 });

module.exports = model('Enrollment', enrollmentSchema);

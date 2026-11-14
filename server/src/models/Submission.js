const { Schema, model } = require('mongoose');

const submissionSchema = new Schema({
  assignment: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  file: {
    path: { type: String, required: true },      // ที่เก็บไฟล์ใน uploads/submissions/
    originalName: { type: String, required: true },
    mimeType: String,
    size: Number,
  },
  submittedAt: { type: Date, default: Date.now },
  isLate: { type: Boolean, default: false },
  score: { type: Number, min: 0 },
  feedback: { type: String, maxlength: 2000 },
  gradedAt: Date,
  gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true }); // ส่งซ้ำคือแทนที่ไฟล์เดิม
submissionSchema.index({ student: 1 });

module.exports = model('Submission', submissionSchema);

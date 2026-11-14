const { Schema, model } = require('mongoose');

const announcementSchema = new Schema({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

announcementSchema.index({ group: 1, createdAt: -1 });

module.exports = model('Announcement', announcementSchema);

module.exports = {
  ROLES: ['user', 'teacher', 'admin'],          // user = นักศึกษา/ศิษย์เก่า
  STATUSES: ['student', 'alumni'],              // สถานะจากทะเบียนนักศึกษา
  APPROVALS: ['approved', 'pending', 'rejected'],
  DAYS: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  GROUP_TYPES: ['course', 'general'],
  VISIBILITY: ['public', 'followers'],
  USERNAME_REGEX: /^[a-z0-9_]{3,20}$/,
  STUDENT_ID_REGEX: /^\d{9}$/,
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,            // วันเกิดเก็บเป็นข้อความ YYYY-MM-DD
  EMAIL_REGEX: /^\S+@\S+\.\S+$/,
  MIN_PASSWORD_LENGTH: 8,
};

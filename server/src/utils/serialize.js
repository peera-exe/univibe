// แปลงข้อมูลผู้ใช้เป็นรูปแบบสาธารณะที่ส่งให้หน้าเว็บ (ไม่มีอีเมล/รหัสนักศึกษา)
function publicUser(u) {
  if (!u || u.isDeleted) return { deleted: true, displayName: 'บัญชีที่ถูกลบ' };
  return { _id: u._id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, role: u.role, status: u.status };
}

module.exports = { publicUser, USER_FIELDS: 'username displayName avatarUrl role status isDeleted' };

const id = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#message');

requireUser().then(function (user) {
  if (!user) return;
  api.get('/api/posts/' + encodeURIComponent(id || ''))
    .then(function (d) {
      document.querySelector('#post').appendChild(createPostCard(d.post, {
        expanded: true,
        onDeleted: function () { location.href = '/feed.html'; },
      }));
    })
    .catch(function (err) { showAlert(message, err.status === 404 ? 'ไม่พบโพสต์นี้ หรือคุณไม่มีสิทธิ์ดู' : err.message); });
});

const tag = (new URLSearchParams(location.search).get('tag') || '').toLowerCase();
document.querySelector('#title').textContent = '#' + tag;

requireUser().then(function (user) {
  if (!user) return;
  createPostList(document.querySelector('#posts'), function (cursor) {
    const q = cursor ? '?before=' + cursor : '';
    return api.get('/api/posts/hashtag/' + encodeURIComponent(tag) + q);
  }).reload();
});

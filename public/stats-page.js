// Stats page logic (moved out of an inline <script> so the site can run under a
// strict Content-Security-Policy with script-src 'self' - no inline scripts).
(function () {
  var out = document.getElementById('out');
  var daysSel = document.getElementById('days');

  // Escape any value that comes from the data (e.g. a client id set on an
  // embedding site) before putting it in innerHTML - stops stored XSS.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // If a password is set, append it to the URL as ?token=... once and the
  // page remembers it. Open the page as stats.html?token=YOURPASSWORD.
  function tokenParam() {
    var m = location.search.match(/[?&]token=([^&]+)/);
    if (m) { try { sessionStorage.setItem('nmbau_token', m[1]); } catch (e) {} return '&token=' + encodeURIComponent(decodeURIComponent(m[1])); }
    try { var t = sessionStorage.getItem('nmbau_token'); if (t) return '&token=' + encodeURIComponent(t); } catch (e) {}
    return '';
  }

  function fmt(n) { return (n == null ? 0 : n).toLocaleString(); }

  function load() {
    out.className = 'msg';
    out.textContent = 'Loading...';
    var days = encodeURIComponent(daysSel.value);
    fetch('/api/stats?days=' + days + tokenParam())
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          out.className = 'msg err';
          out.textContent = 'Error: ' + (res.j.error || 'could not load') + (res.j.detail ? ' - ' + res.j.detail : '');
          return;
        }
        render(res.j.rows || []);
      })
      .catch(function (e) {
        out.className = 'msg err';
        out.textContent = 'Error: ' + e.message;
      });
  }

  function render(rows) {
    if (!rows.length) {
      out.className = 'msg';
      out.textContent = 'No data yet for this period.';
      return;
    }
    var html = '<table><thead><tr>' +
      '<th>Client</th><th>People</th><th>Loaded</th><th>Opened chat</th>' +
      '<th>Started quote</th><th>Finished quote</th><th>Finished %</th><th>Wanted email</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var pct = r.started ? Math.round((r.completed / r.started) * 100) : 0;
      html += '<tr>' +
        '<td class="client">' + esc(r.client || '(unknown)') + '</td>' +
        '<td>' + fmt(r.people) + '</td>' +
        '<td>' + fmt(r.loaded) + '</td>' +
        '<td>' + fmt(r.opened) + '</td>' +
        '<td>' + fmt(r.started) + '</td>' +
        '<td>' + fmt(r.completed) + '</td>' +
        '<td class="pct">' + pct + '%</td>' +
        '<td>' + fmt(r.emails) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    out.className = '';
    out.innerHTML = html;
  }

  document.getElementById('refresh').addEventListener('click', load);
  daysSel.addEventListener('change', load);
  load();
})();

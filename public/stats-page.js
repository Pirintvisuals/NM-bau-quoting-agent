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
        render(res.j.rows || [], res.j.dropoff || {});
      })
      .catch(function (e) {
        out.className = 'msg err';
        out.textContent = 'Error: ' + e.message;
      });
  }

  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '–'; }

  function render(rows, dropoff) {
    if (!rows.length) {
      out.className = 'msg';
      out.textContent = 'No data yet for this period.';
      return;
    }
    var html = '<h2>Funnel (unique visits)</h2><div class="scroll"><table><thead><tr>' +
      '<th>Widget</th><th>Saw it</th><th>Opened</th><th>Answered 1+</th>' +
      '<th>Contact step</th><th>Finished</th><th>Open → finish</th><th>Wanted email</th><th>Errors</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr>' +
        '<td class="client">' + esc(r.client || '(unknown)') + '</td>' +
        '<td>' + fmt(r.loaded) + '</td>' +
        '<td>' + fmt(r.opened) + ' <span class="pct">' + pct(r.opened, r.loaded) + '</span></td>' +
        '<td>' + fmt(r.answeredOne) + ' <span class="pct">' + pct(r.answeredOne, r.opened) + '</span></td>' +
        '<td>' + fmt(r.contactForm) + '</td>' +
        '<td>' + fmt(r.completed) + '</td>' +
        '<td class="pct">' + pct(r.completed, r.opened) + '</td>' +
        '<td>' + fmt(r.emails) + '</td>' +
        '<td>' + fmt(r.errors) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';

    html += '<h2>Where they stopped</h2><p class="sub">Visits that started but never finished, by the last question they answered.</p>';
    var clients = Object.keys(dropoff);
    if (!clients.length) html += '<p class="msg">No drop-offs recorded yet.</p>';
    clients.forEach(function (c) {
      var counts = dropoff[c];
      var total = Object.keys(counts).reduce(function (n, k) { return n + counts[k]; }, 0);
      var list = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; });
      html += '<h3>' + esc(c) + ' <span class="pct">(' + fmt(total) + ' dropped)</span></h3><div class="scroll"><table><thead><tr>' +
        '<th>Last answered</th><th>Visits</th><th>Share</th></tr></thead><tbody>';
      list.forEach(function (k) {
        html += '<tr><td class="client">' + esc(k === '(none)' ? 'nothing (left before 1st answer)' : k) + '</td>' +
          '<td>' + fmt(counts[k]) + '</td><td class="pct">' + pct(counts[k], total) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    });

    out.className = '';
    out.innerHTML = html;
  }

  document.getElementById('refresh').addEventListener('click', load);
  daysSel.addEventListener('change', load);
  load();
})();

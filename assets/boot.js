/* Zagonska diagnostika.
   Če se glavna skripta ne naloži ali ne prevede — na primer na starejšem
   brskalniku — uporabnik ne sme ostati pred gumbom, ki tiho ne dela nič.
   Ta datoteka je namenoma napisana v stari skladnji, da se naloži povsod. */
(function () {
  window.__SC = { ok: false, napake: [] };

  window.addEventListener('error', function (e) {
    var kje = (e.filename || '').split('/').pop();
    window.__SC.napake.push((e.message || 'napaka') + (kje ? ' [' + kje + ':' + (e.lineno || 0) + ']' : ''));
  }, true);

  function pokazi() {
    if (window.__SC.ok) return;
    var m = document.getElementById('loginMsg');
    if (!m) return;
    var t = 'Portal se na tej napravi ni zagnal.';
    if (!window.supabase) t += ' Knjižnica se ni naložila.';
    if (window.__SC.napake.length) t += ' ' + window.__SC.napake[0];
    var ua = navigator.userAgent || '';
    var ch = ua.match(/Chrome\/(\d+)/);
    t += ' Brskalnik: ' + (ch ? 'Chrome ' + ch[1] : ua.slice(0, 60));
    m.className = 'msg bad show';
    m.textContent = t;
    var b = document.getElementById('loginBtn');
    if (b) b.disabled = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(pokazi, 2500); });
  } else {
    setTimeout(pokazi, 2500);
  }
})();

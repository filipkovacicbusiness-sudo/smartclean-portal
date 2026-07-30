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
    if (/Unexpected token/.test(window.__SC.napake[0] || ''))
      t += ' Verjetno stara datoteka iz predpomnilnika — počistite podatke strani.';
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

/* Počisti service worker, ki je ostal iz napačne objave.
   Bil je nastavljen tako, da streže iz predpomnilnika in nikoli ne
   preveri strežnika — zato je tablica dobivala stare datoteke.
   Pisano v stari skladnji, da se izvede tudi na starejših brskalnikih. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (rs) {
    var tuji = [];
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].scope.indexOf('/tablica/') === -1) tuji.push(rs[i]);
    }
    if (!tuji.length) return;
    var koraki = [];
    for (var j = 0; j < tuji.length; j++) koraki.push(tuji[j].unregister());
    return Promise.all(koraki).then(function () {
      if (!window.caches || !caches.keys) return;
      return caches.keys().then(function (ks) {
        var d = [];
        for (var k = 0; k < ks.length; k++) d.push(caches.delete(ks[k]));
        return Promise.all(d);
      });
    }).then(function () {
      var ze = false;
      try { ze = sessionStorage.getItem('sc-sw') === '1'; } catch (e) {}
      if (ze) return;                       /* samo enkrat, brez zanke */
      try { sessionStorage.setItem('sc-sw', '1'); } catch (e) {}
      location.reload();
    });
  }).catch(function () {});
})();

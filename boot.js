/* Zagon: tema PRED prvim izrisom + upravljanje zagonskega zaslona (splash).
   Zunanja datoteka (ne inline), ker CSP dovoli samo script-src 'self'. */
(function () {
  // 1) Tema pred prvim izrisom — brez preskoka temna→svetla.
  try {
    var p = localStorage.getItem('sc-portal-theme') || 'dark';
    var h = new Date().getHours();
    var eff = p === 'auto' ? ((h >= 7 && h < 19) ? 'light' : 'dark') : (p === 'light' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', eff);
    var mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', eff === 'light' ? '#ffffff' : '#0a0a0a');
  } catch (e) {}

  // 2) Med splashem zakleni pomikanje strani.
  try { document.documentElement.classList.add('sc-booting'); } catch (e) {}

  // 3) Umik splasha — kliče ga portal.js, ko je portal pripravljen; varovalo po 6 s.
  window.scBootDone = function () {
    try { document.documentElement.classList.remove('sc-booting'); } catch (e) {}
    var b = document.getElementById('scBoot');
    if (!b || b.__d) return;
    b.__d = 1;
    b.classList.add('scBoot-hide');
    setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 560);
  };
  setTimeout(function () { try { window.scBootDone(); } catch (e) {} }, 6000);
})();

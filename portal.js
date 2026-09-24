/* SmartClean portal */
(function () {

  const $ = id => document.getElementById(id);
  const cfg = window.SC_CONFIG || {};
  const createClient = window.supabase.createClient;
  function escape_(s) {
    return String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }
  const stevilo = n => Number(n || 0).toLocaleString('sl-SI');
  const datum = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }) : '—';
  const datumcas = d => d ? new Date(d).toLocaleString('sl-SI', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '';

  /* ── tema (svetlo / temno / samodejno) ────────────────────────────── */
  function temaPref() { try { return localStorage.getItem('sc-portal-theme') || 'dark'; } catch (e) { return 'dark'; } }
  function autoTemna() { const h = new Date().getHours(); return !(h >= 7 && h < 19); }
  function uporabiTemo() {
    const p = temaPref();
    const eff = p === 'auto' ? (autoTemna() ? 'dark' : 'light') : (p === 'light' ? 'light' : 'dark');
    var de = document.documentElement;
    if (de.dataset.theme && de.dataset.theme !== eff) {
      // Gladka animacija preklopa teme brez zatikanja:
      // View Transitions naredi GPU-navzkrižno pretapljanje (smooth), fallback je hipen preklop.
      if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        de.classList.add('sc-notrans');
        try {
          var vt = document.startViewTransition(function () { de.dataset.theme = eff; });
          vt.finished.then(function () { de.classList.remove('sc-notrans'); }, function () { de.classList.remove('sc-notrans'); });
        } catch (e) { de.dataset.theme = eff; de.classList.remove('sc-notrans'); }
      } else {
        de.classList.add('sc-notrans');
        de.dataset.theme = eff;
        void de.offsetWidth;
        requestAnimationFrame(function () { requestAnimationFrame(function () { de.classList.remove('sc-notrans'); }); });
      }
    } else {
      de.dataset.theme = eff;
    }
  }
  function oznaciTemo() {
    const p = temaPref();
    document.querySelectorAll('[data-tema]').forEach(b => b.classList.toggle('on', b.dataset.tema === p));
  }
  function nastaviTemo(pref) { try { localStorage.setItem('sc-portal-theme', pref); } catch (e) {} uporabiTemo(); oznaciTemo(); if (typeof shraniNastavitve === 'function') shraniNastavitve(); }
  uporabiTemo();

  /* ── PWA namestitev ──────────────────────────────────────────────── */
  let _pwaPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _pwaPrompt = e;
    const b = $('pwaInstall');
    if (b) b.style.display = '';
  });
  window.addEventListener('appinstalled', () => {
    _pwaPrompt = null;
    const b = $('pwaInstall'); if (b) b.style.display = 'none';
    const h = $('pwaHint'); if (h) h.textContent = 'Aplikacija je nameščena. ✓';
  });

  $('themeBtn').addEventListener('click', () => {
    nastaviTemo(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  { var _tba = $('themeBtnAuth'); if (_tba) _tba.addEventListener('click', () => { nastaviTemo(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }); }

  /* ── samodejna prijava (segment kot redni/izredni na tablici) ─────── */
  function autoLoginOn() { try { return localStorage.getItem('sc-autologin') !== '0'; } catch (e) { return true; } }
  function nastaviAuto(on) { try { localStorage.setItem('sc-autologin', on ? '1' : '0'); } catch (e) {} }
  function osveziAutoSege() {
    const on = autoLoginOn();
    document.querySelectorAll('.auto-seg').forEach(seg => {
      seg.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', (b.dataset.auto === '1') === on));
    });
  }
  (function initAutoSeg() {
    document.querySelectorAll('.auto-seg .seg-b').forEach(b => b.addEventListener('click', () => {
      nastaviAuto(b.dataset.auto === '1');
      osveziAutoSege();
    }));
    osveziAutoSege();
  })();

  /* ── pogled: seznam / mreža (Arhiv, Fakture, Ceniki, Stranke) ─────── */
  function pogledPref() { try { return localStorage.getItem('sc-view') === 'grid' ? 'grid' : 'list'; } catch (e) { return 'list'; } }
  function uporabiPogled() { document.documentElement.dataset.view = pogledPref(); }
  function osveziPogledSege() {
    const v = pogledPref();
    document.querySelectorAll('.pogled-seg').forEach(seg => seg.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', b.dataset.view === v)));
  }
  function nastaviPogled(v) { try { localStorage.setItem('sc-view', v === 'grid' ? 'grid' : 'list'); } catch (e) {} uporabiPogled(); osveziPogledSege(); if (typeof shraniNastavitve === 'function') shraniNastavitve(); }
  (function initPogled() {
    document.querySelectorAll('.pogled-seg .seg-b').forEach(b => b.addEventListener('click', () => nastaviPogled(b.dataset.view)));
    uporabiPogled(); osveziPogledSege();
  })();
  // ── Sinhronizacija nastavitev med napravami (shranjeno v profil uporabnika) ──
  var SINH_KLJUCI = ['sc-portal-theme', 'sc-view', 'sc-menu-order', 'sc-cust-order', 'sc-cenik-order'];
  function zberiNastavitve() { var o = {}; SINH_KLJUCI.forEach(function (k) { try { var v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) {} }); return o; }
  function uporabiNastavitve(o) { if (!o || typeof o !== 'object') return; SINH_KLJUCI.forEach(function (k) { if (o[k] != null) { try { localStorage.setItem(k, o[k]); } catch (e) {} } }); }
  var _shraniNastT = null;
  function shraniNastavitve() {
    if (!JAZ) return;
    clearTimeout(_shraniNastT);
    _shraniNastT = setTimeout(function () {
      var n = zberiNastavitve();
      try {
        sb.rpc('shrani_nastavitve', { n: n }).then(function (r) {
          if (r && r.error) { try { sb.from('profiles').update({ nastavitve: n }).eq('id', JAZ).then(function () {}, function () {}); } catch (e) {} }
        }, function () {});
      } catch (e) {}
    }, 400);
  }

  /* ── nastavitve ───────────────────────────────────────────────────── */
  let KEY = cfg.key && !cfg.key.startsWith('TUKAJ') ? cfg.key : null;
  let URL_ = cfg.url || null;
  if (!KEY) {
    try {
      KEY = localStorage.getItem('sc-portal-key');
    } catch (e) {}
  }
  if (!URL_) {
    try {
      URL_ = localStorage.getItem('sc-portal-url');
    } catch (e) {}
  }
  if (!KEY || !URL_) {
    $('loginForm').style.display = 'none';
    const box = document.createElement('div');
    box.innerHTML = '<div class="field"><label for="kUrl">Naslov projekta</label>' + '<input type="text" id="kUrl" value="' + escape_(URL_ || '') + '" placeholder="https://….supabase.co"/></div>' + '<div class="field"><label for="kKey">Publishable key</label>' + '<input type="text" id="kKey" placeholder="sb_publishable_…"/></div>' + '<button type="button" class="btn" id="kSave">Shrani in nadaljuj</button>';
    $('loginForm').parentNode.insertBefore(box, $('loginMsg'));
    document.querySelector('.sub').textContent = 'Portal še ne ve, kje je vaša baza. Vpišite podatke iz Supabase → Project Settings → API Keys.';
    $('kSave').addEventListener('click', () => {
      const u = document.getElementById('kUrl').value.trim();
      const k = document.getElementById('kKey').value.trim();
      if (!/^https:\/\/.+\.supabase\.co\/?$/.test(u) || !k.startsWith('sb_publishable_')) {
        const m = $('loginMsg');
        m.className = 'msg bad show';
        m.textContent = !k.startsWith('sb_publishable_') ? 'Ključ se mora začeti s sb_publishable_. Če se začne s sb_secret_, je napačen in ne sme v brskalnik.' : 'Naslov mora izgledati kot https://nekaj.supabase.co';
        return;
      }
      try {
        localStorage.setItem('sc-portal-url', u.replace(/\/$/, ''));
        localStorage.setItem('sc-portal-key', k);
      } catch (e) {}
      location.reload();
    });
  }
  const sb = URL_ && KEY ? createClient(URL_, KEY) : null;

  /* ══════════ PRIJAVA ══════════ */
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!sb) return;
    const m = $('loginMsg'),
      btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Prijavljam …';
    m.className = 'msg';
    const {
      error
    } = await sb.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });
    btn.disabled = false;
    btn.textContent = 'Prijavi se';
    if (error) {
      m.className = 'msg bad show';
      m.textContent = /invalid/i.test(error.message) ? 'E-naslov ali geslo se ne ujemata.' : /confirm/i.test(error.message) ? 'Ta račun še ni potrjen. Javite se administratorju.' : 'Prijava ni uspela: ' + error.message;
      return;
    }
    start();
  });
  function showAuthPane(which) {
    ['loginForm', 'resetForm', 'newPwForm'].forEach(id => {
      const el = $(id);
      if (el) el.classList.toggle('hidden', id !== which);
    });
    const f = $('forgotBtn');
    if (f) f.classList.toggle('hidden', which !== 'loginForm');
    const bp = $('backToPickerBtn');
    if (bp && which !== 'loginForm') bp.style.display = 'none';
    const m = $('loginMsg');
    if (m) m.className = 'msg';
  }
  $('forgotBtn').addEventListener('click', () => {
    $('resetEmail').value = $('email').value.trim();
    showAuthPane('resetForm');
    document.querySelector('.auth-box .sub').textContent = 'Vpišite svoj e-naslov in poslali vam bomo povezavo za nastavitev novega gesla.';
  });
  $('backBtn').addEventListener('click', () => {
    showAuthPane('loginForm');
    document.querySelector('.auth-box .sub').textContent = 'Vpišite se s podatki, ki ste jih prejeli od nas.';
  });
  if ($('backToPickerBtn')) $('backToPickerBtn').addEventListener('click', () => {
    pokaziIzbirnik();
  });
  $('resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!sb) return;
    const m = $('loginMsg'),
      btn = $('resetBtn');
    btn.disabled = true;
    btn.textContent = 'Pošiljam …';
    const {
      error
    } = await sb.auth.resetPasswordForEmail($('resetEmail').value.trim(), {
      redirectTo: location.origin + location.pathname
    });
    btn.disabled = false;
    btn.textContent = 'Pošlji povezavo za ponastavitev';
    m.className = error ? 'msg bad show' : 'msg show';
    m.textContent = error ? /rate|limit/i.test(error.message) ? 'Preveč poskusov zapored. Počakajte nekaj minut in poskusite znova.' : 'Pošiljanje ni uspelo: ' + error.message : 'Če ta e-naslov pri nas obstaja, je povezava na poti. Preverite tudi mapo z neželeno pošto.';
  });
  $('newPwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('loginMsg'),
      btn = $('newPwBtn');
    const p1 = $('newPw1').value,
      p2 = $('newPw2').value;
    if (p1 !== p2) {
      m.className = 'msg bad show';
      m.textContent = 'Gesli se ne ujemata.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Shranjujem …';
    const {
      error
    } = await sb.auth.updateUser({
      password: p1
    });
    btn.disabled = false;
    btn.textContent = 'Nastavi geslo';
    if (error) {
      m.className = 'msg bad show';
      m.textContent = /weak|short|password/i.test(error.message) ? 'Geslo je prešibko. Uporabite vsaj 12 znakov, z velikimi in malimi črkami, številko in simbolom.' : 'Ni uspelo: ' + error.message;
      return;
    }
    m.className = 'msg show';
    m.textContent = 'Geslo je nastavljeno. Odpiram portal …';
    setTimeout(start, 900);
  });
  $('logoutBtn').addEventListener('click', async () => {
    ustaviUtrip();
    // Odjava VEDNO popolnoma ukine sejo (kot pri velikih). Ob vrnitvi te spusti noter
    // biometrija (strežniški WebAuthn izda novo sejo) ali geslo. Osvežitev strani te
    // NE odjavi — to ureja obnovitev seje ob nalaganju.
    try { await sb.auth.signOut(); } catch (e) {}
    location.reload();
  });

  // Ura in datum na sredini glave
  (function () {
    var el = document.getElementById('clock'); if (!el) return;
    function tick() {
      var d = new Date();
      var cas = d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
      var dat = d.toLocaleDateString('sl-SI', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      el.innerHTML = '<span class="clk-time">' + cas + '</span><span class="clk-date">' + dat + '</span>';
    }
    tick(); setInterval(tick, 15000);
  })();

  /* ── Prisotnost / zadnja prijava ─────────────────────────────────
     last_login = čas prijave; last_seen = zadnji utrip (na spletu, če < 2 min).
     Uporabimo varno RPC funkcijo, z rezervo na neposredni zapis (osebje sme). */
  var _utripTimer = null;
  function zabeleziPrijavo(uid) {
    // ločeni klici, da last_login deluje tudi če stolpca last_seen (še) ni
    try { sb.rpc('touch_last_login').then(function () {}, function () {}); } catch (e) {}
    try { sb.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', uid).then(function () {}, function () {}); } catch (e) {}
    try { sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid).then(function () {}, function () {}); } catch (e) {}
  }
  function utripni(uid) {
    try { sb.rpc('touch_seen').then(function () {}, function () {}); } catch (e) {}
    try { sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid).then(function () {}, function () {}); } catch (e) {}
  }
  function zacniUtrip(uid) {
    ustaviUtrip();
    utripni(uid);
    _utripTimer = setInterval(function () { if (!document.hidden) utripni(uid); }, 45000);
    document.addEventListener('visibilitychange', _vis);
    function _vis() { if (!document.hidden && JAZ) utripni(JAZ); }
    zacniUtrip._vis = _vis;
  }
  function ustaviUtrip() {
    if (_utripTimer) { clearInterval(_utripTimer); _utripTimer = null; }
    if (zacniUtrip._vis) { document.removeEventListener('visibilitychange', zacniUtrip._vis); zacniUtrip._vis = null; }
  }

  /* ══════════ STANJE ══════════ */
  let JAZ = null,
    JAZIME = '',
    JAZMAIL = '',
    OSEBJE = false,
    MOJEPODJETJE = null;
  var MOJPROFIL = {};
  var APP_VERZIJA = '4.19 · BETA';
  var NALAGANJE = '<div class="sc-load" aria-hidden="true"><span class="sc-load-line"></span></div>';
  // Stale-while-revalidate: ob ponovnem obisku razdelka NE pobriši vsebine v nalagalnik —
  // obdrži prejšnjo (takojšen prikaz) in jo osveži v ozadju. Trak le ob prvem nalaganju.
  function pokaziNalaganje(box) { if (box && !box.dataset.loaded) box.innerHTML = NALAGANJE; }
  var _reloadVal = null;   // vrednost 'reload' ob nalaganju (za potisnjeno osvežitev)
  const JE_LASTNIK = () => (JAZMAIL || '').trim().toLowerCase() === 'filip@eflitte.si';
  // Super admin = lastnik ali profil s super_admin=true. Samo super admin vidi Fakture.
  const JE_SUPER = () => JE_LASTNIK() || !!(MOJPROFIL && MOJPROFIL.super_admin);
  const JE_ZAPOSLENI = () => !OSEBJE && !!(MOJPROFIL && MOJPROFIL.zaposleni);
  // Rang vloge (za hierarhijo urejanja): super=4, admin=3, osebje=2, zaposleni=1, stranka=0.
  function vlogaRang(v) { return v === 'super' ? 4 : v === 'admin' ? 3 : v === 'osebje' ? 2 : v === 'zaposleni' ? 1 : 0; }
  function mojRang() { if (JE_LASTNIK()) return 99; if (MOJPROFIL && MOJPROFIL.super_admin) return 3; if (OSEBJE) return 2; if (JE_ZAPOSLENI()) return 1; return 0; }

  /* ══════════ VLOGE & PRAVICE (Admin — ureja samo lastnik) ══════════ */
  // Razdelki, katerih vidnost/pravice je mogoče nastavljati po vlogah.
  var ADMIN_RAZDELKI = [
    ['domov', 'Domov'], ['dokumenti', 'Dokumenti'], ['prisotnost', 'Prisotnost'], ['stranke', 'Stranke'],
    ['arhiv', 'Arhiv'], ['artikli', 'Cenik & Artikli'], ['fakture', 'Fakture'], ['uporabniki', 'Uporabniki'],
    ['statistika', 'Statistika'], ['gorivo', 'Gorivo'], ['konzola', 'Konzola'], ['aplikacija', 'Programska oprema'], ['katalog', 'Katalog']
  ];
  var ADMIN_VLOGE = ['super', 'admin', 'osebje', 'zaposleni', 'stranka'];
  var ADMIN_IMENA_PRIVZ = { super: 'Super admin', admin: 'Admin', osebje: 'Osebje', zaposleni: 'Zaposleni', stranka: 'Stranka' };
  // Privzete vidne pravice (r,w,x,d) — ujemajo se z obstajajočim obnašanjem.
  function _perm(r, w, x, d) { return { r: !!r, w: !!w, x: !!x, d: !!d }; }
  var ADMIN_PRIVZ = {
    super: { gorivo: _perm(1, 1, 1, 1), domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(1, 1, 1, 1), uporabniki: _perm(1, 1, 1, 1) },
    admin: { gorivo: _perm(1, 1, 1, 1), domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(1, 1, 1, 1), uporabniki: _perm(1, 1, 1, 1) },
    osebje: { gorivo: _perm(0, 0, 0, 0), domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) },
    zaposleni: { gorivo: _perm(0, 0, 0, 0), domov: _perm(1, 0, 0, 0), prisotnost: _perm(1, 0, 0, 1), arhiv: _perm(0, 0, 0, 0), katalog: _perm(0, 0, 0, 0), statistika: _perm(0, 0, 0, 0), artikli: _perm(0, 0, 0, 0), stranke: _perm(0, 0, 0, 0), dokumenti: _perm(0, 0, 0, 0), aplikacija: _perm(0, 0, 0, 0), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) },
    stranka: { gorivo: _perm(0, 0, 0, 0), domov: _perm(1, 0, 0, 0), prisotnost: _perm(0, 0, 0, 0), arhiv: _perm(1, 0, 0, 1), katalog: _perm(1, 0, 0, 0), statistika: _perm(0, 0, 0, 0), artikli: _perm(0, 0, 0, 0), stranke: _perm(0, 0, 0, 0), dokumenti: _perm(0, 0, 0, 0), aplikacija: _perm(0, 0, 0, 0), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) }
  };
  var ROLE_CFG = null;  // { imena:{...}, perm:{ vloga:{ razdelek:{r,w,x,d} } } }
  function roleIme(v) { return (ROLE_CFG && ROLE_CFG.imena && ROLE_CFG.imena[v]) || ADMIN_IMENA_PRIVZ[v] || v; }
  function rolePerm(v, razdelek, vrsta) {
    var base = (ROLE_CFG && ROLE_CFG.perm && ROLE_CFG.perm[v] && ROLE_CFG.perm[v][razdelek]) || (ADMIN_PRIVZ[v] && ADMIN_PRIVZ[v][razdelek]) || _perm(0, 0, 0, 0);
    return !!base[vrsta || 'r'];
  }
  function mojaVloga() { if (JE_LASTNIK()) return 'super'; if (MOJPROFIL && MOJPROFIL.super_admin) return 'admin'; if (OSEBJE) return 'osebje'; if (JE_ZAPOSLENI()) return 'zaposleni'; return 'stranka'; }
  // Sme trenutni uporabnik? Lastnik vedno; sicer po konfiguraciji vloge.
  function sme(razdelek, vrsta) { if (JE_LASTNIK()) return true; return rolePerm(mojaVloga(), razdelek, vrsta); }
  async function naloziRoleCfg() {
    // POZOR: če to ne uspe, portal MOLČE dela po ADMIN_PRIVZ (privzetih pravicah),
    // zato razlog vedno zabeležimo.
    try {
      var r = await sb.from('app_config').select('vrednost').eq('kljuc', 'role_config').maybeSingle();
      if (r && r.error) throw r.error;
      if (r && r.data && r.data.vrednost) {
        var o = JSON.parse(r.data.vrednost);
        if (o && typeof o === 'object') { ROLE_CFG = o; return; }
        throw new Error('role_config ni veljaven objekt');
      }
    } catch (e) {
      ROLE_CFG = null;
      try { console.warn('[vloge] nastavitev pravic ni bilo mogoče naložiti, veljajo PRIVZETE pravice. Razlog:', (e && e.message) || e); } catch (_) {}
    }
  }
  // Dnevnik sprememb — zapiši dejanje (tiho; če tabele ni, se ne zgodi nič).
  // Napake se ne prikažejo uporabniku, a se zapišejo v konzolo — če dnevnik
  // ostane prazen, tu vidiš razlog (npr. manjka RLS pravilo → zaženi 33_audit_log.sql).
  function logDodaj(razdelek, akcija, opis) {
    try {
      sb.from('audit_log').insert({ razdelek: razdelek, akcija: akcija, opis: (opis || '').slice(0, 500), kdo_ime: JAZIME || JAZMAIL || 'osebje' })
        .then(function (r) { if (r && r.error) { try { console.warn('[audit_log] vpis zavrnjen:', r.error.message || r.error, '— preveri 33_audit_log.sql (RLS/pravice).'); } catch (e) {} } },
              function (e) { try { console.warn('[audit_log] vpis ni uspel:', e); } catch (_) {} });
    } catch (e) {}
  }
  function nastaviWho(ime) {
    $('who').innerHTML = '<span class="who-name">' + escape_(ime || '') + '</span>' + (OSEBJE ? '<span class="who-role">osebje</span>' : '');
  }
  function prvoIme() {
    let n = (JAZIME || '').trim();
    if (!n) return 'ekipa';
    if (n.indexOf('@') >= 0 && n.indexOf(' ') < 0) n = n.split('@')[0];
    n = n.split(/\s+/)[0].replace(/[._-]+/g, ' ').split(' ')[0];
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'ekipa';
  }
  let ORGSEZNAM = [],
    ORGIME = {},
    LISTI = [],
    LISTI_NAPAKA = false,   // true = nalaganje ni uspelo (loči napako od praznega arhiva)
    VSEHLISTOV = 0,
    _softDelDN = true,      // ali obstaja stolpec delivery_notes.deleted_at (migracija 50)
    _softDelDoc = true,     // ali obstaja stolpec documents.deleted_at (migracija 50)
    STAR_SET = new Set();   // note_id-ji, ki vsebujejo star zapis (postavka brez article_id)

  async function naloziOrge() {
    // skrij izbrisane stranke; če stolpca še ni, beri vse. Stranično (brez meje 1000).
    let r = await vseVrstice(function (a, b) { return sb.from('orgs').select('id,name,legal_name,address,vat_id,sort_order').is('deleted_at', null).order('name').range(a, b); });
    if (r.error) r = await vseVrstice(function (a, b) { return sb.from('orgs').select('id,name,legal_name,address,vat_id').order('name').range(a, b); });
    // Če tudi rezerva pade, ostane seznam prazen — brez te vrstice je videti kot »ni strank«.
    if (r.error) { try { console.warn('[stranke] seznama strank ni bilo mogoče naložiti:', (r.error.message || r.error)); } catch (_) {} }
    // Vedno po abecedi. orgs.sort_order je ostanek ročnega razvrščanja strank, ki ga v
    // portalu ni več; stare vrednosti so nekatere stranke (npr. Gostišče Jezersko) vlekle na vrh.
    ORGSEZNAM = razvrstiStranke(r.data || [], 'abeceda');
    ORGIME = {};
    ORGSEZNAM.forEach(o => { ORGIME[o.id] = o.name; });
    return ORGSEZNAM;
  }
  /* ── vlečenje za razvrščanje (miška + dotik), prek namenskega ročaja ── */
  function dndSort(container, itemSel, handleSel, onDrop) {
    if (!container) return;
    container.querySelectorAll(handleSel).forEach(function (handle) {
      if (handle.dataset.dndWired) return;   // varno za večkraten klic (dinamično dodane vrstice)
      handle.dataset.dndWired = '1';
      handle.style.touchAction = 'none';
      handle.addEventListener('pointerdown', function (e) {
        var item = handle.closest(itemSel); if (!item) return;
        e.preventDefault(); e.stopPropagation();
        if (item.setPointerCapture) { try { item.setPointerCapture(e.pointerId); } catch (er) {} }
        var startY = e.clientY, startX = e.clientX;
        var rect = item.getBoundingClientRect();
        var cs = getComputedStyle(item);
        // rezervni prostor (placeholder) na mestu elementa
        var ph = document.createElement(item.tagName);
        ph.className = 'dnd-ph';
        ph.style.height = rect.height + 'px';
        ph.style.margin = cs.margin;
        item.parentNode.insertBefore(ph, item);
        // dvigni element, da sledi kazalcu (brez preračunavanja postavitve seznama)
        item.classList.add('dnd-lift');
        item.style.width = rect.width + 'px';
        item.style.height = rect.height + 'px';
        item.style.position = 'fixed';
        item.style.left = rect.left + 'px';
        item.style.top = rect.top + 'px';
        item.style.margin = '0';
        var moved = false;
        function reals() {
          return [].slice.call(container.querySelectorAll(itemSel)).filter(function (el) { return el !== item && !el.classList.contains('dnd-ph'); });
        }
        function move(ev) {
          moved = true; if (ev.cancelable) ev.preventDefault();
          item.style.transform = 'translate(' + (ev.clientX - startX) + 'px,' + (ev.clientY - startY) + 'px)';
          var list = reals(); if (!list.length) return;
          // ZAZNAVA cilja iz POSTAVITVE (offset*), ne iz getBoundingClientRect —
          // ker transformi med FLIP-animacijo NE vplivajo na offset, se cilj ne trese.
          var op = ph.offsetParent || container;
          var opr = op.getBoundingClientRect();
          var px = ev.clientX - opr.left + op.scrollLeft;
          var py = ev.clientY - opr.top + op.scrollTop;
          var boxes = list.map(function (el) { return { el: el, L: el.offsetLeft, T: el.offsetTop, W: el.offsetWidth, H: el.offsetHeight }; });
          var isGrid = boxes.length > 1 && Math.abs(boxes[0].T - boxes[1].T) < boxes[0].H / 2;
          var target = null;
          for (var i = 0; i < boxes.length; i++) {
            var b = boxes[i], cy = b.T + b.H / 2, cx = b.L + b.W / 2, after;
            if (!isGrid) { after = py < cy; }
            else { after = (b.T > py + 1) || (Math.abs(cy - py) <= b.H / 2 && cx > px); }
            if (after) { target = b.el; break; }
          }
          // če je rezervni prostor že na pravem mestu, ne premikaj (prepreči utripanje)
          var refNow = ph.nextElementSibling; while (refNow === item) { refNow = refNow ? refNow.nextElementSibling : null; }
          if (refNow === (target || null)) return;
          // FLIP: zabeleži prikazane pozicije, premakni placeholder, animiraj razliko
          var before = list.map(function (el) { return el.getBoundingClientRect(); });
          if (target) container.insertBefore(ph, target); else container.appendChild(ph);
          list.forEach(function (el, idx) {
            var nb = el.getBoundingClientRect(); var dX = before[idx].left - nb.left, dY = before[idx].top - nb.top;
            if (dX || dY) { el.style.transition = 'none'; el.style.transform = 'translate(' + dX + 'px,' + dY + 'px)';
              requestAnimationFrame(function () { el.style.transition = 'transform .18s cubic-bezier(.2,0,0,1)'; el.style.transform = ''; }); }
          });
        }
        function up() {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
          // posedi element na mesto placeholderja (mehak doskok — X in Y, tudi v mreži)
          var endRect = ph.getBoundingClientRect();
          item.style.transition = 'transform .18s cubic-bezier(.2,0,0,1)';
          item.style.transform = 'translate(' + (endRect.left - rect.left) + 'px,' + (endRect.top - rect.top) + 'px)';
          var done = function () {
            if (ph.parentNode) ph.parentNode.insertBefore(item, ph);
            if (ph.parentNode) ph.parentNode.removeChild(ph);
            item.classList.remove('dnd-lift');
            item.style.position = ''; item.style.left = ''; item.style.top = ''; item.style.width = '';
            item.style.height = ''; item.style.margin = ''; item.style.transform = ''; item.style.transition = '';
            // počisti morebitne preostale prehode/transforme na sosedih
            reals().forEach(function (el) { el.style.transition = ''; el.style.transform = ''; });
            if (moved && onDrop) onDrop([].slice.call(container.querySelectorAll(itemSel)));
          };
          if (moved) setTimeout(done, 180); else done();
        }
        document.addEventListener('pointermove', move, { passive: false }); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
      });
    });
  }
  var DND_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  // Oceni postavko: RDEČ, če ni izbran artikel; ORANŽEN, če je artikel brez količine.
  function _ocenaPostavke(row) {
    if (!row) return;
    var sel = row.querySelector('[data-pn]'), pk = row.querySelector('[data-pk]');
    var hasArt = !!(sel && (sel.value || '').trim());
    var qv = pk ? (pk.value || '').trim() : '';
    var hasQty = qv !== '' && Number(qv) > 0;
    if (sel) sel.classList.toggle('post-err', !hasArt);
    var btn = row.querySelector('[data-artbtn]'); if (btn) btn.classList.toggle('post-err', !hasArt);   // rdeč okvir na po meri izbirniku
    if (pk) pk.classList.toggle('post-warn', hasArt && !hasQty);
  }
  // Izolirani okvirček z ID izbranega artikla (levo od imena); prazen, dokler ni izbire.
  function _osveziPid(row) {
    if (!row) return;
    var sel = row.querySelector('[data-pn]'), pid = row.querySelector('[data-pid]');
    if (!sel || !pid) return;
    var o = sel.options[sel.selectedIndex] || null;
    pid.textContent = (o && o.value) ? (o.getAttribute('data-koda') || '') : '';
  }
  // Tipkovnica v polju za količino: Backspace/Delete pobriše CELO število (ne le zadnje števke),
  // Enter skoči na količino naslednjega artikla (hitrejši vnos).
  function _pkEnter(e) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (e.target.value !== '') { e.target.value = ''; e.target.dispatchEvent(new Event('input', { bubbles: true })); }
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var row = e.target.closest ? e.target.closest('.ur-post') : null; if (!row) return;
    var next = row.nextElementSibling;
    while (next && !(next.classList && next.classList.contains('ur-post'))) next = next.nextElementSibling;
    var pk = next ? next.querySelector('[data-pk]') : null;
    if (pk) { pk.focus(); try { pk.select(); } catch (e2) {} } else { try { e.target.blur(); } catch (e3) {} }
  }
  // Ob fokusu količine se CELOTNO število označi — jasno se vidi, katero celico urejaš,
  // tipkanje pa število nadomesti (kot v Excelu). setTimeout, da klik ne razveljavi označbe.
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('.ur-post input[data-pk]')) {
      setTimeout(function () { try { t.select(); } catch (e2) {} }, 0);
    }
  });
  // Po meri izdelan izbirnik artikla: skrit <select data-pn> ostane vir resnice (vsa
  // ostala logika bere njega); zgoraj narišemo gumb + meni z ID v okvirčku levo (kot katalog).
  function artPickWire(row) {
    var pick = row && row.querySelector('[data-artpick]'); if (!pick || pick._wired) return;
    var sel = pick.querySelector('[data-pn]'), btn = pick.querySelector('[data-artbtn]'), menu = pick.querySelector('[data-artmenu]');
    if (!sel || !btn || !menu) return;
    pick._wired = true;
    function sync() {
      var o = sel.options[sel.selectedIndex] || null;
      var koda = o ? (o.getAttribute('data-koda') || '') : '';
      var t = btn.querySelector('.ur-artbtn-txt');
      if (o && o.value) t.innerHTML = (koda ? '<span class="ur-opt-id">' + escape_(koda) + '</span>' : '') + '<span class="ur-opt-nm">' + escape_(o.value) + '</span>';
      else t.innerHTML = '<span class="ur-artbtn-ph">' + escape_(o ? o.textContent : '— izberi artikel —') + '</span>';
      btn.classList.toggle('ima', !!(o && o.value));
    }
    function zapri() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', vzunaj, true); }
    function vzunaj(e) { if (!pick.contains(e.target)) zapri(); }
    function odpri() {
      var html = '';
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i];
        var koda = o.getAttribute('data-koda') || '';
        var ime = o.value || o.textContent;
        html += '<button type="button" class="ur-artopt' + (i === sel.selectedIndex ? ' sel' : '') + '" role="option" data-i="' + i + '">' +
          '<span class="ur-opt-id' + (koda ? '' : ' prazno') + '">' + escape_(koda) + '</span>' +
          '<span class="ur-opt-nm">' + escape_(ime) + '</span></button>';
      }
      menu.innerHTML = html; menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      var s = menu.querySelector('.ur-artopt.sel'); if (s) { try { s.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
      setTimeout(function () { document.addEventListener('click', vzunaj, true); }, 0);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); if (menu.hidden) odpri(); else zapri(); });
    menu.addEventListener('click', function (e) {
      var it = e.target.closest ? e.target.closest('.ur-artopt') : null; if (!it) return;
      sel.selectedIndex = parseInt(it.getAttribute('data-i'), 10);
      zapri();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
    sel.addEventListener('change', sync);
    sync();
  }
  // Ključ artikla v vrstici (sifra > article_id > ime) — za zaznavo dvojnikov.
  function _artKljuc(row) {
    var sel = row && row.querySelector('[data-pn]'); if (!sel) return '';
    var opt = sel.selectedOptions && sel.selectedOptions[0];
    var sif = opt && opt.dataset.sifra ? opt.dataset.sifra : '';
    var aid = opt && opt.dataset.aid ? opt.dataset.aid : '';
    var nm = (sel.value || '').trim().toLowerCase();
    if (sif) return 's' + sif; if (aid) return 'a' + aid; return nm ? ('n' + nm) : '';
  }
  // Če je isti artikel že v drugi vrstici: scrolla do nje, obrobo utripne in vrne true.
  function _dvojnikArtikla(row) {
    var k = _artKljuc(row); if (!k) return false;
    var cont = row.closest('[data-postavke]') || row.parentNode; if (!cont) return false;
    var rows = [].slice.call(cont.querySelectorAll('.ur-post'));
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] === row) continue;
      if (_artKljuc(rows[i]) === k) {
        var obst = rows[i];
        try { obst.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        obst.classList.remove('post-flash'); void obst.offsetWidth; obst.classList.add('post-flash');
        setTimeout(function () { obst.classList.remove('post-flash'); }, 1400);
        return true;
      }
    }
    return false;
  }
  var EYE_ON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4l16 16"/><path d="M9.5 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.6"/><path d="M6.2 7.3A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.3-.6"/></svg>';

  /* ══════════ ZAGON ══════════ */
  async function start() {
    const {
      data: {
        user
      }
    } = await sb.auth.getUser();
    if (!user) return;
    JAZ = user.id;
    let profil = null;
    { const _pr = await sb.from('profiles').select('full_name,is_staff,super_admin,zaposleni,nastavitve,avatar_url,phone,contact_email').eq('id', user.id).maybeSingle();
      profil = _pr && _pr.data ? _pr.data : null;
      if (_pr && _pr.error) { const _pr2 = await sb.from('profiles').select('full_name,is_staff').eq('id', user.id).maybeSingle(); profil = _pr2 && _pr2.data ? _pr2.data : null; } }
    MOJPROFIL = profil || {};
    prednaloziAvatar(MOJPROFIL.avatar_url);   // Moj račun: slika je ob odprtju že naložena in dekodirana
    // uveljavi sinhronizirane nastavitve (tema, pogled, vrstni red menija, razvrstitve)
    if (profil && profil.nastavitve) { uporabiNastavitve(profil.nastavitve); uporabiTemo(); oznaciTemo(); uporabiPogled(); osveziPogledSege(); }
    OSEBJE = !!(profil !== null && profil !== void 0 && profil.is_staff);
    nastaviWho((profil && profil.full_name) || user.email);
    JAZIME = (profil && profil.full_name) || user.email;
    JAZMAIL = user.email || '';
    zapomniProfil({ email: user.email, name: JAZIME, avatar: (profil && profil.avatar_url) || '', uid: user.id });
    $('racunPod').textContent = user.email;
    /* Zabeleži čas te prijave in začni sporočati prisotnost (kdo je na spletu). */
    zabeleziPrijavo(user.id);
    zacniUtrip(user.id);
    /* Naslov nastavimo že pred prikazom, da za trenutek ne utripne »Pregled«. */
    if ($('domovNaslov')) $('domovNaslov').textContent = OSEBJE ? ('Pozdravljen/a, ' + prvoIme()) : 'Vaš pregled';
    $('auth').style.display = 'none';
    $('app').classList.add('show');
    await naloziOrge();
    if (!OSEBJE && ORGSEZNAM.length === 1) MOJEPODJETJE = ORGSEZNAM[0];
    try { await naloziRoleCfg(); } catch (e) {}
    meni();
    await naloziListe();
    pojdi('domov');
    // Portal je sestavljen in prva stran izrisana → gladko umakni zagonski zaslon.
    try { requestAnimationFrame(function () { if (window.scBootDone) window.scBootDone(); }); } catch (e) { try { if (window.scBootDone) window.scBootDone(); } catch (_) {} }
    zazeniCustomSelecte();
    try { pokaziObvestila(); } catch (e) {}
    try { narociObvestila(); } catch (e) {}
    try { preberiReload(); } catch (e) {}
    try { morebitiPromoBio(); } catch (e) {}
    // V OZADJU prednaloži razdelke, do katerih ima uporabnik dostop, da se ob
    // kliku odprejo TAKOJ (brez nalagalnega traku). Zamik, da ne moti prvega izrisa.
    try { setTimeout(prednaloziRazdelke, 700); } catch (e) {}
  }
  // Prednalaganje: renderira razdelke v skrite bloke (nastavi dataset.loaded), zamaknjeno,
  // da ne pošljemo vseh poizvedb naenkrat. Napake tiho spregleda.
  function prednaloziRazdelke() {
    var op = [];
    try {
      if (OSEBJE) {
        op.push(risiArhiv);
        if (sme('prisotnost', 'r')) op.push(risiPrisotnost);
        if (sme('statistika', 'r')) op.push(function () { return risiUcinek(true); });
        if (sme('stranke', 'r')) op.push(risiStranke);
        if (sme('artikli', 'r')) op.push(risiArtikli);
        if (JE_SUPER()) op.push(risiFakture);
        if (sme('uporabniki', 'r')) op.push(loadUsers);
      } else if (JE_ZAPOSLENI()) {
        op.push(risiPrisotnost);
      } else if (MOJEPODJETJE) {
        op.push(risiKatalog);
      }
    } catch (e) {}
    var i = 0;
    (function naprej() {
      if (i >= op.length) return;
      var fn = op[i++];
      try { Promise.resolve(fn()).catch(function () {}); } catch (e) {}
      setTimeout(naprej, 450);   // zamik med razdelki
    })();
  }

  /* ══════════ STRANSKI MENI ══════════ */
  const IKONE = {
    domov: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
    arhiv: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V8"/><path d="M10 12h4"/>',
    stranke: '<path d="M3 20h18"/><path d="M5 20V6l7-3 7 3v14"/><path d="M9.5 20v-4h5v4"/>',
    katalog: '<path d="M4 5.5h7v13H4Z"/><path d="M13 5.5h7v13h-7Z"/>',
    uporabniki: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="10" r="2.4"/><path d="M15.5 19a4.5 4.5 0 0 1 5-4.4"/>',
    racun: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    uvoz: '<path d="M12 3v11"/><path d="M8 10.5 12 14.5l4-4"/><path d="M4 16v3.5h16V16"/>',
    fakture: '<path d="M6 3h9l3 3v15l-2.5-1.5L13 22l-2.5-1.5L8 22l-2-1.5L6 3Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    statistika: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="14" width="3" height="4" rx="1"/>',
    ceniki: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    prijave: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/><path d="M12 8v0"/>',
    prisotnost: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    ucinek: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15l4-4"/><circle cx="12" cy="15" r="1.3"/>',
    artikli: '<path d="M3 12l8.5-8.5a2 2 0 0 1 1.4-.5H19a2 2 0 0 1 2 2v6.1a2 2 0 0 1-.6 1.4L12 21Z"/><circle cx="16.5" cy="7.5" r="1.3"/>',
    aplikacija: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5.5h3"/><path d="M12 18.2h.01"/>',
    dokumenti: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    konzola: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15 8a4 4 0 0 1 0 8"/><path d="M18 5a8 8 0 0 1 0 14"/>',
    nastavitve: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    admin: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9.5 12.2l1.8 1.8 3.4-3.6"/>',
    gorivo: '<path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V20"/><path d="M3 20h11"/><path d="M6 8h4"/><path d="M13 10h3.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>'
  };
  const ikona = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IKONE[k] + '</svg>';
  // Osnovni (privzeti) glavni razdelki menija za trenutnega uporabnika.
  function glavniMeni() {
    // Lastnik: vedno vse (Admin ureja pravice ostalih, sebi jih ne more odvzeti).
    if (JE_LASTNIK()) {
      return [['domov', 'Domov'], ['dokumenti', 'Dokumenti'], ['prisotnost', 'Prisotnost'], ['stranke', 'Stranke'],
        ['arhiv', 'Arhiv'], ['artikli', 'Cenik & Artikli'], ['fakture', 'Fakture'], ['uporabniki', 'Uporabniki'],
        ['statistika', 'Statistika'], ['gorivo', 'Gorivo'], ['konzola', 'Konzola'], ['aplikacija', 'Programska oprema']];
    }
    // Ostali: vidnost razdelkov po pravicah vloge (nastavljivo v Admin).
    var vl = mojaVloga(), out = [];
    ADMIN_RAZDELKI.forEach(function (s) { if (s[0] !== 'konzola' && rolePerm(vl, s[0], 'r')) out.push(s); });
    if (!out.some(function (x) { return x[0] === 'domov'; })) out.unshift(['domov', 'Domov']);
    return out;
  }
  function menijVrstni() { try { return JSON.parse(localStorage.getItem('sc-menu-order') || '[]') || []; } catch (e) { return []; } }
  // Uporabi shranjeni vrstni red; nove razdelke pripni na konec, neveljavne izpusti.
  // »Pregled« (domov) je vedno prvi in ga ni mogoče premakniti.
  function urediGlavni(g) {
    var ord = menijVrstni();
    var out;
    if (!ord.length) { out = g.slice(); }
    else {
      var poK = {}; g.forEach(function (x) { poK[x[0]] = x; });
      out = [];
      ord.forEach(function (k) { if (poK[k]) { out.push(poK[k]); delete poK[k]; } });
      g.forEach(function (x) { if (poK[x[0]]) out.push(x); });
    }
    // Prisili »domov« na prvo mesto.
    var di = out.findIndex(function (x) { return x[0] === 'domov'; });
    if (di > 0) { var d = out.splice(di, 1)[0]; out.unshift(d); }
    return out;
  }
  function meni() {
    let glavni, nast;
    glavni = urediGlavni(glavniMeni());
    nast = OSEBJE ? [['nastavitve', 'Nastavitve'], ['racun', 'Moj račun']] : [['racun', 'Moj račun']];
    if (JE_LASTNIK()) nast.push(['admin', 'Admin']);
    const veja = ([k, l]) => `<a data-go="${k}">${ikona(k)}${l}</a>`;
    $('side').innerHTML = '<span class="side-slider" aria-hidden="true"></span>' + glavni.map(veja).join('') + '<div class="side-sep"></div>' + nast.map(veja).join('') +
      '<div class="side-foot"><span class="side-ver">Različica ' + escape_(APP_VERZIJA) + '</span><a class="side-eflitte" href="https://eflitte.si" target="_blank" rel="noopener">Izdelava <b>eflitte</b></a></div>';
    const _side = $('side');
    const _sl = _side.querySelector('.side-slider');
    const premakniDrsnik = a => {
      if (!_sl || !a) return;
      _sl.style.transform = 'translateY(' + a.offsetTop + 'px)';
      _sl.style.left = a.offsetLeft + 'px';
      _sl.style.width = a.offsetWidth + 'px';
      _sl.style.height = a.offsetHeight + 'px';
      _side.classList.add('sl-on');
    };
    meni._drsnik = () => { premakniDrsnik(_side.querySelector('a.on')); };
    _side.querySelectorAll('a[data-go]').forEach(a => {
      a.addEventListener('click', () => { pojdi(a.dataset.go); zapriMeni(); });
      a.addEventListener('mouseenter', () => premakniDrsnik(a));
    });
    _side.addEventListener('mouseleave', () => meni._drsnik());
  }
  function zapriMeni() {
    $('side').classList.remove('on');
    $('scrim').classList.remove('on');
    $('burger').classList.remove('open');
    $('burger').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('meni-odprt');
  }
  $('burger').addEventListener('click', () => {
    const on = $('side').classList.toggle('on');
    $('scrim').classList.toggle('on', on);
    $('burger').classList.toggle('open', on);
    $('burger').setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.classList.toggle('meni-odprt', on);
  });
  $('scrim').addEventListener('click', zapriMeni);
  // Klik na logotip (zgoraj levo) → Domov.
  { var _hl = $('homeLogo'); if (_hl) { _hl.style.cursor = 'pointer'; _hl.addEventListener('click', function () { pojdi('domov'); }); _hl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pojdi('domov'); } }); } }
  // Onemogoči nehoteno spreminjanje števil s kolescem miške (scroll) — velja povsod.
  // Ko z miško podrsaš nad izbranim number poljem, se polje odjavi (blur) in stran se normalno pomika, vrednost pa ostane.
  document.addEventListener('wheel', function (e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && (t.type === 'number') && t === document.activeElement) { t.blur(); }
  }, { passive: true });

  /* ══════════ USMERJANJE ══════════ */
  function pojdi(kam) {
    if (_okno) oknoZapri(true);
    // Admin & Konzola: samo lastnik.
    if ((kam === 'admin' || kam === 'konzola') && !JE_LASTNIK()) kam = 'domov';
    // Fakture so na voljo samo super adminom.
    if (kam === 'fakture' && !JE_SUPER()) kam = 'domov';
    // Dostop do razdelka po pravicah vloge (lastnik ima vedno vse).
    if (!JE_LASTNIK() && ['racun', 'nastavitve', 'ceniki', 'ucinek'].indexOf(kam) < 0) {
      var _r = ADMIN_RAZDELKI.some(function (s) { return s[0] === kam; });
      if (_r && !sme(kam, 'r')) kam = 'domov';
    }
    // Zaposleni vidi samo Pregled, Prisotnost in Moj račun.
    if (JE_ZAPOSLENI() && ['domov', 'prisotnost', 'racun'].indexOf(kam) < 0) kam = 'domov';
    document.querySelectorAll('.sec').forEach(s => {
      s.classList.toggle('hidden', s.id !== 'sec-' + kam);
    });
    // Gladek prehod na novo prikazani razdelek.
    var _ns = document.getElementById('sec-' + kam);
    if (_ns) { _ns.classList.remove('sec-anim'); void _ns.offsetWidth; _ns.classList.add('sec-anim'); }
    document.querySelectorAll('#side a[data-go]').forEach(a => {
      a.classList.toggle('on', a.dataset.go === kam);
    });
    if (meni._drsnik) meni._drsnik();
    window.scrollTo(0, 0);
    if (kam === 'domov') risiPregled();
    if (kam === 'arhiv') risiArhiv();
    if (kam === 'fakture') risiFakture();
    if (kam === 'stranke') risiStranke();
    if (kam === 'katalog') risiKatalog();
    if (kam === 'uporabniki') loadUsers();
    if (kam === 'nastavitve') { risiNastavitve(); napolniBio(); }
    if (kam === 'racun') { napolniProfil(); }
    if (kam === 'konzola') { risiKonzola(); }
    if (kam === 'aplikacija') risiAplikacijo();
    if (kam === 'dokumenti') risiDokumenti();
    if (kam === 'ceniki') risiCeniki();
    if (kam === 'prisotnost') risiPrisotnost();
    if (kam === 'statistika' || kam === 'ucinek') risiUcinek();
    if (kam === 'artikli') risiArtikli();
    if (kam === 'gorivo') risiGorivo();
    if (kam === 'admin') risiAdmin();
  }

  /* ══════════ GORIVO (tankanja + računi) ══════════
     Eno vozilo. Poraba se računa iz razlike stanj števca med zaporednima
     tankanjema in litrov POZNEJŠEGA tankanja — standardni način »od polnega
     do polnega«. Ob delnem tankanju je posamezen odsek previsok ali prenizek,
     povprečje čez več tankanj pa se izravna; v kartici to tudi piše.
     Računi so v svojem bucketu »gorivo« (glej baza/55_gorivo.sql), ne med
     Dokumenti — tam ima pravila vse osebje, Gorivo pa je samo za vodstvo. */
  var GORIVO = null, GOR_NAPAKA = null, GOR_URL = {}, _gorLeto = 'vse';
  var GOR_CENE = null, GOR_CENE_NAPAKA = null, _gorCeneTecejo = false, _gorCeneZadnjiPoskus = 0;
  var GOR_MAX_MB = 10, GOR_DDV = 22;

  // Znesek na računu je Z DDV; neto izpeljemo. Stopnja je shranjena pri zapisu,
  // zato sprememba DDV ne premakne preteklih tankanj.
  function gorNeto(znesek, ddv) { var d = (ddv == null ? GOR_DDV : Number(ddv)); return (Number(znesek) || 0) / (1 + d / 100); }
  function gorEurPar(bruto, ddv) { return cenaFmt(bruto) + '<small class="gor-neto">' + cenaFmt(gorNeto(bruto, ddv)) + ' brez DDV</small>'; }
  // Uradna cena je objavljena na tri decimalke (2,012 €/l) — zaokrožitev na dve
  // bi jo popačila prav tam, kjer se primerja s plačano.
  function gorCena3(v) { return (Number(v) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €'; }

  // Uradna (najvišja dovoljena) maloprodajna cena dizla za ta dan — z gov.si.
  // Ni nujno cena, ki si jo plačal: servis sme prodajati ceneje, avtocestni dražje.
  function gorUradnaCena(dat) {
    if (!dat) return null;
    var c = (GOR_CENE || []).find(function (x) { return x.velja_od <= dat && dat <= x.velja_do; });
    return c || null;
  }

  async function naloziCeneGoriva() {
    try {
      var r = await sb.from('fuel_prices').select('velja_od,velja_do,dizel,nmb95,ddv')
        .order('velja_od', { ascending: false }).limit(500);
      if (r.error) throw r.error;
      GOR_CENE = r.data || []; GOR_CENE_NAPAKA = null;
    } catch (e) {
      GOR_CENE = []; GOR_CENE_NAPAKA = (e && e.message) || String(e);
    }
  }

  // Sveže cene rabimo takrat, ko za DANES nimamo nobene — torej v trenutku, ko
  // se izteče zadnje objavljeno obdobje.
  //
  // Prej je bil pogoj »najnovejša je starejša od dveh dni«. Ker vlada objavlja
  // po tednih, je to pomenilo do dva dni brez cene: staro obdobje se je izteklo,
  // novega pa še nismo pobrali, ker »še ni dovolj staro«. Prvi dnevi vsakega
  // novega tedna bi bili brez predloga v obrazcu.
  function gorRabiSveze(zadnjaVeljaDo, danes) {
    if (!zadnjaVeljaDo) return true;
    return zadnjaVeljaDo < danes;
  }

  // Osveži z gov.si. Urnika ni treba nastavljati — preverimo ob vsakem odprtju
  // razdelka, klic pa je poceni, ker funkcija piše samo spremembe.
  async function osveziCeneGoriva() {
    if (_gorCeneTecejo) return false;
    var zadnja = (GOR_CENE || [])[0];
    if (!gorRabiSveze(zadnja && zadnja.velja_do, danes10())) return false;
    // Kadar vlada novega obdobja še ni objavila, ne trkamo ob vsakem odprtju.
    if (Date.now() - _gorCeneZadnjiPoskus < 30 * 60 * 1000) return false;
    _gorCeneZadnjiPoskus = Date.now();
    _gorCeneTecejo = true;
    try {
      var r = await sb.functions.invoke('cene-goriva', { body: {} });
      if (r && r.data && r.data.ok) { await naloziCeneGoriva(); return true; }
      GOR_CENE_NAPAKA = (r && r.data && r.data.error) || 'cen ni bilo mogoče osvežiti';
    } catch (e) {
      GOR_CENE_NAPAKA = (e && e.message) || String(e);
    } finally { _gorCeneTecejo = false; }
    return false;
  }

  function gorLitriFmt(l) { return (Number(l) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' l'; }
  function gorKmFmt(km) { return km == null ? '—' : stevilo(km) + ' km'; }

  async function naloziGorivo() {
    try {
      var r = await sb.from('fuel_logs')
        .select('id,datum,litri,znesek,ddv,km,tankal,opomba,storage_path,mime,velikost,created_at,popravil,popravljeno_at')
        .is('deleted_at', null).order('datum', { ascending: false }).order('created_at', { ascending: false });
      if (r.error) throw r.error;
      GORIVO = (r.data || []).map(function (x) {
        return { id: x.id, datum: x.datum, litri: parseFloat(x.litri) || 0, znesek: parseFloat(x.znesek) || 0,
          ddv: (x.ddv == null ? GOR_DDV : parseFloat(x.ddv)),
          km: (x.km == null ? null : parseInt(x.km, 10)), tankal: x.tankal || '', opomba: x.opomba || '',
          storage_path: x.storage_path || '', mime: x.mime || '', velikost: x.velikost || 0,
          popravil: x.popravil || '', popravljeno_at: x.popravljeno_at || null };
      });
      GOR_NAPAKA = null;
    } catch (e) {
      // Prej bi seznam ostal prazen in videti bi bilo, kot da ni tankanj.
      GORIVO = []; GOR_NAPAKA = (e && e.message) || String(e);
    }
  }

  // Poraba na odsek: tankanja uredi po števcu naraščajoče in vsakemu pripiši
  // prevožene km od prejšnjega ter l/100 km. Odsek brez enega od stanj števca
  // ali z nesmiselno razliko ostane brez izračuna.
  function gorPoraba(vrstice) {
    var s = vrstice.filter(function (x) { return x.km != null; })
      .slice().sort(function (a, b) { return a.km - b.km; });
    var po = {};
    for (var i = 1; i < s.length; i++) {
      var d = s[i].km - s[i - 1].km;
      if (d > 0 && s[i].litri > 0) po[s[i].id] = { km: d, l100: s[i].litri / d * 100 };
    }
    return po;
  }

  function gorLeta() {
    var l = {};
    (GORIVO || []).forEach(function (x) { if (x.datum) l[x.datum.slice(0, 4)] = 1; });
    return Object.keys(l).sort().reverse();
  }
  function gorIzbrane() {
    var v = GORIVO || [];
    return _gorLeto === 'vse' ? v : v.filter(function (x) { return (x.datum || '').slice(0, 4) === _gorLeto; });
  }

  // Poraba in €/km se računata SAMO iz tankanj, ki imajo izmerjen odsek —
  // prvo tankanje in tista brez stanja števca nimajo prevoženih km, zato bi
  // njihovi litri in evri spačili razmerje.
  function gorPovzetek(vrstice, poraba) {
    var litri = 0, znesek = 0, neto = 0, kmSkup = 0, litriMer = 0, znesekMer = 0, netoMer = 0;
    vrstice.forEach(function (x) {
      var n = gorNeto(x.znesek, x.ddv);
      litri += x.litri; znesek += x.znesek; neto += n;
      var p = poraba[x.id];
      if (p) { kmSkup += p.km; litriMer += x.litri; znesekMer += x.znesek; netoMer += n; }
    });
    return {
      litri: litri, znesek: znesek, neto: neto, km: kmSkup,
      cenaL: litri > 0 ? znesek / litri : null,
      cenaLneto: litri > 0 ? neto / litri : null,
      l100: kmSkup > 0 ? litriMer / kmSkup * 100 : null,
      eurKm: kmSkup > 0 ? znesekMer / kmSkup : null,
      eurKmNeto: kmSkup > 0 ? netoMer / kmSkup : null
    };
  }

  async function gorPodpisiUrl(pot) {
    if (!pot) return null;
    if (GOR_URL[pot]) return GOR_URL[pot];
    try {
      var s = await sb.storage.from('gorivo').createSignedUrl(pot, 3600);
      if (s && s.data && s.data.signedUrl) { GOR_URL[pot] = s.data.signedUrl; return GOR_URL[pot]; }
    } catch (e) {}
    return null;
  }

  async function risiGorivo() {
    var box = $('gorList'); if (!box) return;
    if (!sme('gorivo', 'r')) { box.innerHTML = '<p class="u-sub">Za to vlogo Gorivo ni na voljo.</p>'; return; }
    if (GORIVO === null) {
      box.innerHTML = '<p class="u-sub" style="padding:8px 2px">Nalagam …</p>';
      await naloziGorivo();
    }
    if (GOR_CENE === null) await naloziCeneGoriva();
    gorRisi();
    // Uradne cene dopolnimo v ozadju — izris ne čaka na gov.si.
    osveziCeneGoriva().then(function (novo) { if (novo) gorRisi(); });
  }

  function gorRisi() {
    var box = $('gorList'); if (!box) return;
    if (GOR_NAPAKA) {
      box.innerHTML = '<div class="pris-card"><p class="msg bad show">Tankanj ni bilo mogoče naložiti: ' + escape_(GOR_NAPAKA) + '</p>' +
        '<p class="u-sub">Če razdelek uporabljaš prvič, v Supabase → SQL Editor zaženi <b>baza/55_gorivo.sql</b>.</p></div>';
      return;
    }
    var vse = gorIzbrane();
    var poraba = gorPoraba(GORIVO || []);
    var p = gorPovzetek(vse, poraba);
    var lahkoPise = sme('gorivo', 'w');

    var leta = gorLeta();
    var letoSel = '<select class="gor-leto" aria-label="Leto"><option value="vse"' + (_gorLeto === 'vse' ? ' selected' : '') + '>Vsa leta</option>' +
      leta.map(function (l) { return '<option value="' + l + '"' + (_gorLeto === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select>';

    var kart = '<div class="gor-stat">' +
      '<div class="gor-s"><span>Skupaj gorivo</span><b>' + gorLitriFmt(p.litri) + '</b></div>' +
      '<div class="gor-s"><span>Skupaj strošek</span><b>' + cenaFmt(p.znesek) + '</b><small>' + cenaFmt(p.neto) + ' brez DDV</small></div>' +
      '<div class="gor-s"><span>Povprečna cena</span><b>' + (p.cenaL != null ? cenaFmt(p.cenaL) + '/l' : '—') + '</b>' +
      (p.cenaLneto != null ? '<small>' + cenaFmt(p.cenaLneto) + '/l brez DDV</small>' : '') + '</div>' +
      '<div class="gor-s"><span>Povprečna poraba</span><b>' + (p.l100 != null ? fmtStevilo1(p.l100) + ' l/100 km' : '—') + '</b>' +
      (p.km > 0 ? '<small>' + stevilo(p.km) + ' km' + (p.eurKm != null ? ' · ' + cenaFmt(p.eurKm) + '/km · ' + cenaFmt(p.eurKmNeto) + '/km brez DDV' : '') + '</small>' : '') + '</div>' +
      '</div>';

    var vrstice = vse.map(function (x) {
      var po = poraba[x.id];
      var racun = x.storage_path
        ? '<button type="button" class="gor-rac" data-rac="' + escape_(x.id) + '" title="Odpri račun">' + GOR_IKONA_PDF + '</button>'
        : '<span class="u-sub gor-brez" title="Račun ni priložen">—</span>';
      return '<tr' + (x.storage_path ? '' : ' class="gor-nerac"') + '>' +
        '<td>' + datum(x.datum) + '</td>' +
        '<td class="pris-ure">' + gorLitriFmt(x.litri) + '</td>' +
        '<td class="pris-ure">' + gorEurPar(x.znesek, x.ddv) + '</td>' +
        '<td class="pris-ure">' + (x.litri > 0 ? gorEurPar(x.znesek / x.litri, x.ddv) : '—') + '</td>' +
        '<td class="pris-ure">' + gorKmFmt(x.km) + '</td>' +
        '<td class="pris-ure">' + (po ? fmtStevilo1(po.l100) : '<span class="u-sub">—</span>') + '</td>' +
        '<td>' + escape_(x.tankal || '—') + '</td>' +
        '<td class="gor-c">' + racun + '</td>' +
        (lahkoPise ? '<td class="gor-c"><button type="button" class="gor-ur" data-ur="' + escape_(x.id) + '" title="Uredi">Uredi</button></td>' : '') +
        '</tr>';
    }).join('');

    var glave = '<tr><th>Datum</th><th>Litri</th><th>Znesek<small>z DDV / brez</small></th><th>€/l<small>z DDV / brez</small></th><th>Števec</th><th>l/100&nbsp;km</th><th>Tankal</th><th class="gor-c">Račun</th>' +
      (lahkoPise ? '<th></th>' : '') + '</tr>';
    var stolpcev = lahkoPise ? 9 : 8;
    var tbl = '<div class="gor-scroll"><table class="pris-tbl gor-tbl"><thead>' + glave + '</thead><tbody>' +
      (vrstice || '<tr><td colspan="' + stolpcev + '" class="u-sub">V izbranem obdobju ni tankanj.</td></tr>') + '</tbody></table></div>';

    box.innerHTML = kart +
      '<div class="pris-card"><div class="pris-h">' +
      '<div><h3 class="sec-h">Tankanja</h3><p class="uc-obd-lbl">poraba računana od polnega do polnega rezervoarja</p></div>' +
      '<span class="pris-hbtns">' + letoSel +
      (lahkoPise ? '<button type="button" class="cgrp-btn gor-novo">Novo tankanje</button>' : '') + '</span></div>' +
      tbl + '</div>';

    var ls = box.querySelector('.gor-leto');
    if (ls) ls.addEventListener('change', function () { _gorLeto = this.value; gorRisi(); });
    var nb = box.querySelector('.gor-novo');
    if (nb) nb.addEventListener('click', function () { gorObrazec(null); });
    box.querySelectorAll('[data-ur]').forEach(function (b) {
      b.addEventListener('click', function () { gorObrazec((GORIVO || []).find(function (x) { return x.id === b.dataset.ur; }) || null); });
    });
    box.querySelectorAll('[data-rac]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var rec = (GORIVO || []).find(function (x) { return x.id === b.dataset.rac; });
        if (!rec) return;
        var url = await gorPodpisiUrl(rec.storage_path);
        if (!url) { toast('Računa ni bilo mogoče odpreti.'); return; }
        window.open(url, '_blank', 'noopener');
      });
    });
  }

  var GOR_IKONA_PDF = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14h6"/><path d="M9 17h4"/></svg>';

  /* Obrazec za novo tankanje ali urejanje obstoječega. rec = null → novo. */
  function gorObrazec(rec) {
    if (!sme('gorivo', 'w')) { toast('Za to vlogo vnos ni dovoljen.'); return; }
    var nov = !rec;
    var back = document.createElement('div');
    back.className = 'sc-modal-back show';
    back.innerHTML = '<div class="sc-modal gor-modal" role="dialog" aria-modal="true">' +
      '<h4>' + (nov ? 'Novo tankanje' : 'Uredi tankanje') + '</h4>' +
      '<div class="ur-form">' +
      '<div class="ur-grid ur-grid-3">' +
      '<label class="ur-f"><span>Datum</span><input type="date" data-datum value="' + escape_(nov ? danes10() : rec.datum) + '"></label>' +
      '<label class="ur-f"><span>Litri</span><input type="number" step="0.01" min="0" inputmode="decimal" data-litri value="' + (nov ? '' : rec.litri) + '"></label>' +
      '<label class="ur-f"><span>Cena na liter (€ z DDV)</span><input type="number" step="0.001" min="0" inputmode="decimal" data-cenal></label>' +
      '</div>' +
      '<div class="ur-grid ur-grid-3">' +
      '<label class="ur-f"><span>Znesek (€ z DDV)</span><input type="number" step="0.01" min="0" inputmode="decimal" data-znesek value="' + (nov ? '' : rec.znesek) + '"></label>' +
      '<label class="ur-f"><span>Brez DDV (' + fmtStevilo1(GOR_DDV) + ' %)</span><output class="ur-kg-auto" data-neto>—</output></label>' +
      '<label class="ur-f"><span>Stanje števca (km)</span><input type="number" step="1" min="0" inputmode="numeric" data-km value="' + (nov || rec.km == null ? '' : rec.km) + '"></label>' +
      '</div>' +
      '<p class="u-sub gor-uradna" data-uradna></p>' +
      '<label class="ur-f"><span>Tankal</span><input type="text" data-tankal maxlength="60" value="' + escape_(nov ? (JAZIME || '') : rec.tankal) + '"></label>' +
      '<label class="ur-f"><span>Opomba (neobvezno)</span><input type="text" data-opomba maxlength="200" value="' + escape_(nov ? '' : rec.opomba) + '"></label>' +
      '<label class="ur-f"><span>Račun (PDF ali slika, do ' + GOR_MAX_MB + ' MB)</span>' +
      '<input type="file" data-rac accept="application/pdf,image/*"></label>' +
      '<p class="u-sub gor-rac-stanje" data-racst></p>' +
      '<p class="u-sub ur-msg" data-msg></p>' +
      '</div>' +
      '<div class="sc-modal-acts">' +
      (nov ? '' : '<button type="button" class="sc-modal-btn danger" data-brisi>Izbriši</button>') +
      '<button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button>' +
      '<button type="button" class="sc-modal-btn primary" data-yes>' + (nov ? 'Shrani' : 'Shrani spremembe') + '</button>' +
      '</div></div>';
    document.body.appendChild(back);
    _modalA11y(back);

    var q = function (s2) { return back.querySelector(s2); };
    var msg = q('[data-msg]'), racst = q('[data-racst]');
    function zapri() { back.remove(); _modalVrniFokus(); }

    // Cena se predizpolni z uradno za izbrani dan, znesek pa sledi litrom —
    // dokler ju uporabnik ne vpiše sam. Ko vpiše, portal njegove vrednosti ne
    // povozi več: na računu je merodajen znesek, uradna cena je le najvišja
    // dovoljena in je servis lahko prodajal ceneje.
    var cenaRocno = !nov, znesekRocno = !nov;

    function osveziNeto() {
      var z = parseFloat(q('[data-znesek]').value);
      q('[data-neto]').textContent = (z >= 0 && !isNaN(z)) ? cenaFmt(gorNeto(z, GOR_DDV)) : '—';
    }
    function osveziUradno() {
      var c = gorUradnaCena(q('[data-datum]').value);
      var el = q('[data-uradna]');
      if (c) {
        el.innerHTML = 'Uradna cena dizla za ta dan: <b>' + gorCena3(c.dizel) + '/l</b> z DDV · ' +
          gorCena3(gorNeto(c.dizel, c.ddv)) + '/l brez · velja ' + datum(c.velja_od) + '–' + datum(c.velja_do) +
          ' <span class="gor-uradna-op">(najvišja dovoljena zunaj avtocest)</span>';
      } else if (GOR_CENE_NAPAKA) {
        el.textContent = 'Uradnih cen ni bilo mogoče naložiti: ' + GOR_CENE_NAPAKA;
      } else {
        el.textContent = 'Za ta dan uradne cene ni.';
      }
      return c;
    }
    function izracunajZnesek() {
      if (znesekRocno) return;
      var l = parseFloat(q('[data-litri]').value), c = parseFloat(q('[data-cenal]').value);
      if (l > 0 && c > 0) { q('[data-znesek]').value = (Math.round(l * c * 100) / 100).toFixed(2); osveziNeto(); }
    }
    function nastaviUradnoCeno() {
      var c = osveziUradno();
      if (!cenaRocno) { q('[data-cenal]').value = c ? c.dizel : ''; izracunajZnesek(); }
    }

    if (!nov) q('[data-cenal]').value = rec.litri > 0 ? (Math.round(rec.znesek / rec.litri * 1000) / 1000) : '';
    nastaviUradnoCeno();
    osveziNeto();

    q('[data-datum]').addEventListener('change', nastaviUradnoCeno);
    q('[data-litri]').addEventListener('input', izracunajZnesek);
    q('[data-cenal]').addEventListener('input', function () { cenaRocno = true; izracunajZnesek(); });
    q('[data-znesek]').addEventListener('input', function () {
      znesekRocno = true; cenaRocno = true;
      var l = parseFloat(q('[data-litri]').value), z = parseFloat(q('[data-znesek]').value);
      if (l > 0 && z >= 0 && !isNaN(z)) q('[data-cenal]').value = Math.round(z / l * 1000) / 1000;
      osveziNeto();
    });

    if (!nov && rec.storage_path) {
      racst.innerHTML = 'Priložen je račun. Če izbereš novo datoteko, stara se zamenja. ' +
        '<button type="button" class="gor-odstrani" data-odstrani>Odstrani račun</button>';
      var _odstranjen = false;
      racst.querySelector('[data-odstrani]').addEventListener('click', function () {
        _odstranjen = true; racst.textContent = 'Račun bo odstranjen ob shranjevanju.';
        back._odstraniRacun = true;
      });
    }

    q('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });

    var brisi = q('[data-brisi]');
    if (brisi) brisi.addEventListener('click', async function () {
      var ok = await potrdiModal({ naslov: 'Izbrišem tankanje?', nevarno: true,
        sporocilo: datum(rec.datum) + ' · ' + gorLitriFmt(rec.litri) + ' · ' + cenaFmt(rec.znesek), potrdi: 'Izbriši' });
      if (!ok) return;
      msg.textContent = 'Brišem …';
      var r = await sb.from('fuel_logs').update({ deleted_at: new Date().toISOString() }).eq('id', rec.id);
      if (r.error) { msg.textContent = 'Napaka: ' + r.error.message; return; }
      logDodaj('Gorivo', 'Izbrisano', 'Tankanje ' + datum(rec.datum) + ' · ' + gorLitriFmt(rec.litri));
      GORIVO = (GORIVO || []).filter(function (x) { return x.id !== rec.id; });
      zapri(); toast('Tankanje izbrisano.'); gorRisi();
    });

    q('[data-yes]').addEventListener('click', async function () {
      var dat = q('[data-datum]').value;
      var litri = parseFloat(q('[data-litri]').value);
      var znesek = parseFloat(q('[data-znesek]').value);
      var kmStr = q('[data-km]').value.trim();
      var km = kmStr === '' ? null : parseInt(kmStr, 10);
      var tankal = q('[data-tankal]').value.trim();
      var opomba = q('[data-opomba]').value.trim();
      var dat10 = danes10();

      if (!dat) { msg.textContent = 'Vpiši datum.'; return; }
      if (dat > dat10) { msg.textContent = 'Datum je v prihodnosti.'; return; }
      if (!(litri > 0)) { msg.textContent = 'Vpiši litre.'; return; }
      if (!(znesek >= 0) || isNaN(znesek)) { msg.textContent = 'Vpiši znesek.'; return; }
      if (kmStr !== '' && (isNaN(km) || km < 0)) { msg.textContent = 'Stanje števca ni veljavno.'; return; }

      // Števec ne sme nazaj: to bi pokvarilo izračun porabe, zato raje opozorimo.
      if (km != null) {
        var prej = (GORIVO || []).filter(function (x) { return x.id !== (rec && rec.id) && x.km != null && x.datum <= dat; })
          .sort(function (a, b) { return a.datum < b.datum ? 1 : -1; })[0];
        if (prej && km < prej.km) {
          var vseeno = await potrdiModal({ naslov: 'Števec gre nazaj', potrdi: 'Vseeno shrani',
            sporocilo: 'Zadnje zabeleženo stanje (' + datum(prej.datum) + ') je ' + stevilo(prej.km) + ' km, tu pa ' + stevilo(km) + ' km. Poraba za ta odsek se ne bo izračunala.' });
          if (!vseeno) return;
        }
      }

      var f = q('[data-rac]').files && q('[data-rac]').files[0];
      if (f && f.size > GOR_MAX_MB * 1024 * 1024) { msg.textContent = 'Račun je večji od ' + GOR_MAX_MB + ' MB.'; return; }

      msg.textContent = nov ? 'Shranjujem …' : 'Posodabljam …';
      try {
        var polja = { datum: dat, litri: litri, znesek: znesek, ddv: (nov ? GOR_DDV : (rec.ddv != null ? rec.ddv : GOR_DDV)), km: km, tankal: tankal || null, opomba: opomba || null };

        var novaPot = null;
        if (f) {
          var konc = (f.name.match(/\.[A-Za-z0-9]+$/) || [''])[0].toLowerCase() || (f.type === 'application/pdf' ? '.pdf' : '');
          novaPot = 'racuni/' + dat.slice(0, 4) + '/' + dat + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + konc;
          var up = await sb.storage.from('gorivo').upload(novaPot, f, { contentType: f.type || 'application/octet-stream', cacheControl: '3600', upsert: false });
          if (up.error) throw up.error;
          polja.storage_path = novaPot; polja.mime = f.type || ''; polja.velikost = f.size;
        } else if (back._odstraniRacun) {
          polja.storage_path = null; polja.mime = null; polja.velikost = null;
        }

        var staraPot = rec && rec.storage_path;
        var res;
        if (nov) {
          res = await sb.from('fuel_logs').insert(polja).select('id,datum,litri,znesek,ddv,km,tankal,opomba,storage_path,mime,velikost,popravil,popravljeno_at').single();
        } else {
          polja.popravil = JAZIME || 'osebje';
          polja.popravljeno_at = new Date().toISOString();
          res = await sb.from('fuel_logs').update(polja).eq('id', rec.id).select('id,datum,litri,znesek,ddv,km,tankal,opomba,storage_path,mime,velikost,popravil,popravljeno_at').single();
        }
        if (res.error) {
          // Vrstica ni nastala — naložene datoteke ne puščamo za sabo.
          if (novaPot) { try { await sb.storage.from('gorivo').remove([novaPot]); } catch (e2) {} }
          throw res.error;
        }
        // Šele ko je zapis res shranjen, pospravimo staro datoteko.
        if (staraPot && (novaPot || back._odstraniRacun)) { try { await sb.storage.from('gorivo').remove([staraPot]); } catch (e3) {} delete GOR_URL[staraPot]; }

        var d2 = res.data;
        var vrsta = { id: d2.id, datum: d2.datum, litri: parseFloat(d2.litri) || 0, znesek: parseFloat(d2.znesek) || 0,
          ddv: (d2.ddv == null ? GOR_DDV : parseFloat(d2.ddv)),
          km: (d2.km == null ? null : parseInt(d2.km, 10)), tankal: d2.tankal || '', opomba: d2.opomba || '',
          storage_path: d2.storage_path || '', mime: d2.mime || '', velikost: d2.velikost || 0,
          popravil: d2.popravil || '', popravljeno_at: d2.popravljeno_at || null };
        GORIVO = GORIVO || [];
        if (nov) GORIVO.push(vrsta);
        else GORIVO = GORIVO.map(function (x) { return x.id === vrsta.id ? vrsta : x; });
        GORIVO.sort(function (a, b) { return a.datum < b.datum ? 1 : (a.datum > b.datum ? -1 : 0); });

        logDodaj('Gorivo', nov ? 'Dodano' : 'Urejeno', 'Tankanje ' + datum(dat) + ' · ' + gorLitriFmt(litri) + ' · ' + cenaFmt(znesek));
        zapri();
        toast(nov ? 'Tankanje shranjeno.' : 'Tankanje posodobljeno.');
        gorRisi();
      } catch (e) {
        msg.textContent = 'Napaka: ' + ((e && e.message) || e);
      }
    });

    setTimeout(function () { try { q('[data-litri]').focus(); } catch (e) {} }, 60);
  }

  /* ══════════ PRISOTNOST (registracija delovnega časa) ══════════ */
  var ZAPOSLENI = null, PRISDOG = null, _prisDan = null, _prisMesec = false;
  var PRIS_UPO = [], PRIS_UPO_MAP = {};   // uporabniki portala (za povezavo zaposleni ↔ uporabnik)
  var _prisView = 'dan', _prisOseba = null;   // pogled: 'dan' | 'mesec' | 'oseba'
  function dniVMesecu(kljuc7) { var l = kljuc7.split('-'); return new Date(+l[0], +l[1], 0).getDate(); }
  // Premik obdobja: v dnevnem pogledu ±1 dan, v mesečnem/osebnem ±1 mesec.
  function prisPremakni(delta) {
    if (!_prisDan) _prisDan = danes10();
    var d;
    if (_prisView === 'dan') { d = new Date(_prisDan + 'T00:00:00'); d.setDate(d.getDate() + delta); }
    else { var p = _prisDan.slice(0, 7).split('-'); d = new Date(+p[0], (+p[1] - 1) + delta, 1); }
    _prisDan = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    prisObdobje();
  }
  var DNEVI_KR = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];

  function prisOrg() {
    if (ZAPOSLENI && ZAPOSLENI.length && ZAPOSLENI[0].org_id) return ZAPOSLENI[0].org_id;
    return (ORGSEZNAM && ORGSEZNAM[0]) ? ORGSEZNAM[0].id : null;
  }
  function novCardToken() { var a = new Uint8Array(16); crypto.getRandomValues(a); return [].map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function danes10() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function uraMin(ts) { return new Date(ts).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' }); }
  function trajanjeH(sek) { var m = Math.round(sek / 60); var h = Math.floor(m / 60); m = m % 60; if (!h) return m + 'min'; if (!m) return h + 'h'; return h + 'h ' + m + 'min'; }

  // Spodnja meja nalaganja dogodkov: začetek PRIKAZANEGA meseca ALI zadnjih 62 dni (kar je prej),
  // da so vidni tudi starejši meseci (npr. julij), tabela »Trenutno prisotni« pa ostane sveža.
  function _prisMejaISO() {
    var baseDan = (_prisDan && _prisDan.length >= 7) ? _prisDan : danes10();
    var monthStart = baseDan.slice(0, 7) + '-01';
    var r = new Date(Date.now() - 62 * 24 * 3600 * 1000);
    var recent = r.getFullYear() + '-' + ('0' + (r.getMonth() + 1)).slice(-2) + '-' + ('0' + r.getDate()).slice(-2);
    var dan = monthStart < recent ? monthStart : recent;   // ISO nizi se primerjajo leksikografsko
    return new Date(dan + 'T00:00:00Z').toISOString();
  }
  async function naloziPrisDog() {
    var meja = _prisMejaISO();
    var r = await vseVrstice(function (a, b) {
      return sb.from('att_events').select('id,employee_id,terminal_id,ts,type,source,potrjeno').gte('ts', meja).order('ts', { ascending: true }).range(a, b);
    });
    PRISDOG = (r && r.data) ? r.data : [];
  }
  // Po menjavi obdobja (mesec/dan): donaloži dogodke za prikazano obdobje in znova izriši.
  async function prisObdobje() {
    try { await naloziPrisDog(); } catch (e) {}
    prisRender();
  }
  async function naloziPrisotnost() {
    var e = await sb.from('employees').select('id,org_id,ime,card_token,active,created_at,profile_id').order('ime');
    if (e.error && /profile_id|column|schema/i.test(e.error.message || '')) {
      e = await sb.from('employees').select('id,org_id,ime,card_token,active,created_at').order('ime');   // pred migracijo 48
    }
    ZAPOSLENI = e.error ? [] : (e.data || []);
    // Uporabniki portala (e-pošta + geslo) — za povezavo z zaposlenim. Napake tiho spregledamo.
    try {
      var pu = await sb.from('profiles').select('id,email,full_name').order('email');
      PRIS_UPO = pu.error ? [] : (pu.data || []);
    } catch (e2) { PRIS_UPO = []; }
    PRIS_UPO_MAP = {}; PRIS_UPO.forEach(function (u) { PRIS_UPO_MAP[u.id] = u; });
    await naloziPrisDog();
  }
  function prisZadnji(empId) {
    var last = null;
    for (var i = 0; i < PRISDOG.length; i++) { var d = PRISDOG[i]; if (d.employee_id === empId && (!last || d.ts > last.ts)) last = d; }
    return last;
  }
  // Pari prihod/odhod za ključ dneva ('YYYY-MM-DD') ali meseca ('YYYY-MM').
  function prisPari(empId, kljuc) {
    var evs = PRISDOG.filter(function (d) { return d.employee_id === empId && d.ts.slice(0, kljuc.length) === kljuc; })
      .sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    var pari = [], odprt = null, sek = 0;
    evs.forEach(function (d) {
      if (d.type === 'in') { if (!odprt) odprt = d; }
      else if (d.type === 'out') { if (odprt) { pari.push([odprt, d]); sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } }
    });
    return { pari: pari, odprt: odprt, sek: sek };
  }
  // Povzetek obdobja (dan ali mesec) za enega zaposlenega: št. dni + skupne sekunde.
  function prisPovzetek(empId, kljuc) {
    var r = prisPari(empId, kljuc);
    var dnevi = {}; r.pari.forEach(function (p) { dnevi[p[0].ts.slice(0, 10)] = true; });
    return { dni: Object.keys(dnevi).length, sek: r.sek, pari: r.pari, odprt: r.odprt };
  }
  // Ali ima zaposleni kakršenkoli dogodek v obdobju (kljuc = dan 'YYYY-MM-DD' ali mesec 'YYYY-MM').
  function prisImaDogodke(empId, kljuc) {
    for (var i = 0; i < PRISDOG.length; i++) { var d = PRISDOG[i]; if (d.employee_id === empId && d.ts.slice(0, kljuc.length) === kljuc) return true; }
    return false;
  }
  // Zaposleni za prikaz v Evidenci: aktivni + deaktivirani, ki imajo v obdobju ure.
  function prisOsebeZaEvidenco(kljuc) {
    return (ZAPOSLENI || []).filter(function (z) { return z.active || prisImaDogodke(z.id, kljuc); });
  }
  // Čipi prihod–odhod za en dan enega zaposlenega (za urejanje). Vrne {html, sek}.
  function prisChipiDan(empId, dayISO) {
    var r = prisPari(empId, dayISO);
    var chips = r.pari.map(function (p) {
      var ids = p[0].id + ',' + p[1].id;
      var pot = !!(p[0].potrjeno && p[1].potrjeno);
      return '<span class="pris-chip pris-pair ' + (pot ? 'pot-ok' : 'pot-ni') + '">' +
        '<input type="checkbox" class="pris-pair-chk" data-cpair="' + ids + '"' + (pot ? ' checked' : '') + ' title="potrdi uro">' +
        '<button type="button" class="pris-chip-t" data-editpair="' + ids + '" title="uredi vpis">' + uraMin(p[0].ts) + '–' + uraMin(p[1].ts) + '</button>' +
        '<button type="button" class="pris-chip-x" data-delpair="' + ids + '" title="izbriši vpis" aria-label="izbriši">×</button></span>';
    });
    if (r.odprt) chips.push('<span class="pris-chip open"><button type="button" class="pris-chip-t" data-editpair="' + r.odprt.id + '" title="uredi vpis">' + uraMin(r.odprt.ts) + ' → v teku</button>' +
      '<button type="button" class="pris-chip-x" data-delpair="' + r.odprt.id + '" title="izbriši prihod" aria-label="izbriši">×</button></span>');
    return { html: chips.join(' ') || '<span class="u-sub">—</span>', sek: r.sek };
  }
  function decimalneUre(sek) { return (Math.round(sek / 3600 * 100) / 100).toString().replace('.', ','); }
  function csvC(s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  /* \u2500\u2500 Minimalni zapisovalnik XLSX (pravi Excel, brez knji\u017enice) \u2500\u2500 */
  function _xCrc32(buf) { var crc = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) { crc ^= buf[i]; for (var j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); } return (crc ^ 0xFFFFFFFF) >>> 0; }
  function _xB(s) { return new TextEncoder().encode(s); }
  function _xU16(n) { return [n & 255, (n >> 8) & 255]; }
  function _xU32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }
  function _xZip(files) {
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var crc = _xCrc32(f.data), nb = _xB(f.name), sz = f.data.length;
      var lh = [].concat(_xU32(0x04034b50), _xU16(20), _xU16(0), _xU16(0), _xU16(0), _xU16(0), _xU32(crc), _xU32(sz), _xU32(sz), _xU16(nb.length), _xU16(0));
      var lhb = new Uint8Array(lh.length + nb.length + sz); lhb.set(lh, 0); lhb.set(nb, lh.length); lhb.set(f.data, lh.length + nb.length);
      chunks.push(lhb);
      var cd = [].concat(_xU32(0x02014b50), _xU16(20), _xU16(20), _xU16(0), _xU16(0), _xU16(0), _xU16(0), _xU32(crc), _xU32(sz), _xU32(sz), _xU16(nb.length), _xU16(0), _xU16(0), _xU16(0), _xU16(0), _xU32(0), _xU32(offset));
      var cdb = new Uint8Array(cd.length + nb.length); cdb.set(cd, 0); cdb.set(nb, cd.length); central.push(cdb);
      offset += lhb.length;
    });
    var cdSize = 0; central.forEach(function (c) { cdSize += c.length; });
    var eocd = new Uint8Array([].concat(_xU32(0x06054b50), _xU16(0), _xU16(0), _xU16(files.length), _xU16(files.length), _xU32(cdSize), _xU32(offset), _xU16(0)));
    var total = offset + cdSize + eocd.length, out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    central.forEach(function (c) { out.set(c, pos); pos += c.length; });
    out.set(eocd, pos); return out;
  }
  function _xEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _xCol(c) { var s = ''; c++; while (c) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
  // Slogi: s=1 glava (krepko + siva podlaga), s=2 krepko (skupaj vrstica).
  function _xSheet(rows, freeze) {
    var widths = [];
    rows.forEach(function (row) { (row || []).forEach(function (cell, ci) { var t = (cell && typeof cell === 'object') ? String(cell.v) : String(cell == null ? '' : cell); widths[ci] = Math.max(widths[ci] || 0, t.length); }); });
    var cols = widths.length ? '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(Math.max((w || 8) + 3, 11), 46) + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
    var body = '';
    rows.forEach(function (row, ri) {
      var cells = '';
      (row || []).forEach(function (cell, ci) {
        var ref = _xCol(ci) + (ri + 1);
        if (cell === null || cell === undefined || cell === '') return;
        var val, s = 0, isNum;
        if (cell && typeof cell === 'object') { val = cell.v; s = cell.s || (cell.bold ? 1 : 0); isNum = (typeof val === 'number'); }
        else { val = cell; isNum = (typeof cell === 'number'); }
        var sAttr = s ? (' s="' + s + '"') : '';
        if (isNum) { cells += '<c r="' + ref + '"' + sAttr + '><v>' + val + '</v></c>'; }
        else { cells += '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + _xEsc(val) + '</t></is></c>'; }
      });
      body += '<row r="' + (ri + 1) + '">' + cells + '</row>';
    });
    var views = freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + views + cols + '<sheetData>' + body + '</sheetData></worksheet>';
  }
  var _XSTYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF2F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>';
  function _xImeSheeta(ime, i, vzeti) {
    var n = String(ime || ('List ' + (i + 1))).replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || ('List ' + (i + 1));
    var base = n, k = 2;
    while (vzeti[n.toLowerCase()]) { n = (base.slice(0, 28) + ' ' + k).slice(0, 31); k++; }
    vzeti[n.toLowerCase()] = true; return n;
  }
  // Zapiši .xlsx z več sheeti: sheets = [{name, rows, freeze?}]
  function prenesiXlsx(ime, sheets) {
    var vzeti = {}, ct = '', wbSheets = '', wbRels = '', wsFiles = [];
    sheets.forEach(function (s, i) {
      var n = i + 1, nm = _xImeSheeta(s.name, i, vzeti);
      ct += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wbSheets += '<sheet name="' + _xEsc(nm) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      wbRels += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
      wsFiles.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: _xB(_xSheet(s.rows, s.freeze !== false)) });
    });
    var stylesRid = sheets.length + 1;
    wbRels += '<Relationship Id="rId' + stylesRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    var files = [
      { name: '[Content_Types].xml', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + ct + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: '_rels/.rels', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + '</sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels + '</Relationships>') },
      { name: 'xl/styles.xml', data: _xB(_XSTYLES) }
    ].concat(wsFiles);
    var bytes = _xZip(files);
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ime; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  }
  function _mesecLabel(kljuc) { try { return new Date(kljuc + '-01T00:00:00').toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' }); } catch (e) { return kljuc; } }

  // Izvoz ur ZA IZBRANI MESEC v pravi Excel (.xlsx): povzetek + sheet za vsako zaposleno.
  async function prisIzvoz() {
    var mesecKljuc = _prisDan.slice(0, 7);
    // Zagotovi, da so naloženi dogodki za izvoženi mesec (tudi če PRISDOG še ne pokriva tega meseca).
    try { await naloziPrisDog(); } catch (e) {}
    // Izvozimo ISTE zaposlene kot v Evidenci: aktivne + deaktivirane, ki imajo v tem mesecu ure
    // (prej so bili v izvozu samo aktivni → deaktivirani z urami, npr. sezonci, so manjkali).
    var osebe = prisOsebeZaEvidenco(mesecKljuc);
    var B = function (t) { return { v: t, bold: true }; };      // glava
    var T = function (t) { return { v: t, s: 2 }; };            // krepko (skupaj)
    var dec = function (sek) { return Math.round(sek / 3600 * 100) / 100; };
    var mesecIme = _mesecLabel(mesecKljuc);
    var sheets = [];
    var imeIzvoz = function (z) { return z.ime + (z.active ? '' : ' (neaktiven)'); };
    // 1) Povzetek — vse zaposlene skupaj
    var pov = [[{ v: 'Povzetek ur — ' + mesecIme, s: 2 }], [], [B('Zaposleni'), B('Dni'), B('Ure'), B('Ure (decimalno)')]];
    var skupSek = 0, skupDni = 0;
    osebe.forEach(function (z) {
      var p = prisPovzetek(z.id, mesecKljuc);
      skupSek += p.sek; skupDni += p.dni;
      pov.push([imeIzvoz(z), p.dni, trajanjeH(p.sek), { v: dec(p.sek) }]);
    });
    pov.push([]);
    pov.push([T('SKUPAJ'), T(skupDni), T(trajanjeH(skupSek)), { v: dec(skupSek), s: 2 }]);
    sheets.push({ name: 'Povzetek', rows: pov, freeze: false });
    // 2) Sheet za vsako zaposleno — dnevne ure
    osebe.forEach(function (z) {
      var rows = [[B('Datum'), B('Prihod'), B('Odhod'), B('Ure'), B('Ure (decimalno)')]];
      var r = prisPari(z.id, mesecKljuc);
      r.pari.forEach(function (p) {
        var sek = (new Date(p[1].ts) - new Date(p[0].ts)) / 1000;
        rows.push([p[0].ts.slice(0, 10), uraMin(p[0].ts), uraMin(p[1].ts), trajanjeH(sek), dec(sek)]);
      });
      var pv = prisPovzetek(z.id, mesecKljuc);
      rows.push([]);
      rows.push([T('Skupaj (' + pv.dni + ' dni)'), '', '', T(trajanjeH(pv.sek)), { v: dec(pv.sek), s: 2 }]);
      sheets.push({ name: z.ime, rows: rows });
    });
    prenesiXlsx('ure_' + mesecKljuc + '.xlsx', sheets);
    toast('Izvoz pripravljen: ure_' + mesecKljuc + '.xlsx');
  }

  // Ročna odjava zaposlenega (če pozabi tapniti odhod). Vpiše dogodek 'out'
  // (source='manual'). Stanje je le v bazi — Pi in kartica nimata stanja.
  async function prisOdjavi(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; });
    if (!z) return;
    var l = prisZadnji(empId);
    if (!l || l.type !== 'in') { toast('Ta oseba ni prijavljena.'); return; }
    var now = new Date();
    var privzeto = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    var cas = await vnesiModal({ naslov: 'Odjavi — ' + z.ime, sporocilo: 'Ura odhoda (HH:MM):', privzeto: privzeto, potrdi: 'Odjavi', preklici: 'Prekliči' });
    if (cas == null) return;
    var m = String(cas).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { toast('Vpiši uro v obliki HH:MM.'); return; }
    var hhmm = ('0' + m[1]).slice(-2) + ':' + m[2];
    var dan = l.ts.slice(0, 10);
    var tsIso = new Date(dan + 'T' + hhmm + ':00').toISOString();
    if (new Date(tsIso) <= new Date(l.ts)) { toast('Odhod mora biti po prihodu (' + uraMin(l.ts) + ').'); return; }
    var ins = await sb.from('att_events').insert({ org_id: z.org_id, employee_id: z.id, type: 'out', source: 'manual', ts: tsIso });
    if (ins.error) { toast('Napaka: ' + ins.error.message); return; }
    toast('Odjavljen(a): ' + z.ime);
    await risiPrisotnost();
  }
  var _prisTimer = null;
  // Samodejno osveževanje table "Trenutno prisotni" (brez ročnega refresha).
  function prisAuto() {
    var sec = document.getElementById('sec-prisotnost');
    if (!sec || sec.classList.contains('hidden')) return;      // ni odprto
    if (document.querySelector('.sc-modal-back')) return;      // odprt modal → ne moti
    var ae = document.activeElement;                            // uporabnik nekaj tipka → ne moti
    if (ae && sec.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return;
    naloziPrisotnost().then(function () {
      if (!Array.isArray(ZAPOSLENI)) ZAPOSLENI = [];
      if (!Array.isArray(PRISDOG)) PRISDOG = [];
      prisRender();
    }).catch(function () {});
  }
  async function risiPrisotnost() {
    var box = $('prisList'); if (!box) return;
    pokaziNalaganje(box);
    try {
      await naloziPrisotnost();
      if (!Array.isArray(ZAPOSLENI)) ZAPOSLENI = [];
      if (!Array.isArray(PRISDOG)) PRISDOG = [];
      if (!_prisDan) _prisDan = danes10();
      prisRender();
      box.dataset.loaded = '1';
      if (!_prisTimer) _prisTimer = setInterval(prisAuto, 12000);
    } catch (e) {
      if (!box.dataset.loaded) box.innerHTML = '<div class="pris-card"><p class="u-sub">Napake pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>';
    }
  }
  function prisRender() {
    var box = $('prisList'); if (!box) return;
    var _sy = window.scrollY;
    // Zaposleni vidi SAMO svoje ure (oseben pregled, brez ostalih).
    if (JE_ZAPOSLENI()) { prisRenderMoje(box, _sy); return; }
    var aktivni = (ZAPOSLENI || []).filter(function (z) { return z.active; });
    // ── Blok 1: zaposleni (trenutno stanje + upravljanje) ──
    // Ena kartica namesto »Trenutno prisotni« + »Zaposleni«: vsak zaposleni je okvirček
    // (Seznam ali Mreža po nastavitvi Pogled), klik odpre okno s stanjem in dejanji.
    var danesD = danes10();
    var zapUrejeni = (ZAPOSLENI || []).slice().sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0); });   // aktivni najprej; sicer vrstni red ostane
    var prisotnihN = 0;
    var zapKartice = zapUrejeni.map(function (z, i) {
      var l = prisZadnji(z.id); var notri = !!(z.active && l && l.type === 'in');
      if (notri) prisotnihN++;
      var upo = z.profile_id ? PRIS_UPO_MAP[z.profile_id] : null;
      var upoLbl = upo ? (upo.email || upo.full_name || 'povezan') : '';
      var dan = prisPari(z.id, danesD);
      var danUre = dan.sek ? trajanjeH(dan.sek) : '';
      var intervali = dan.pari.map(function (p) { return uraMin(p[0].ts) + '–' + uraMin(p[1].ts); });
      if (dan.odprt) intervali.push(uraMin(dan.odprt.ts) + ' → v teku');
      var znak = !z.active ? '<span class="pris-badge out">neaktiven</span>' : (notri ? '<span class="pris-badge in">prisoten · od ' + uraMin(l.ts) + '</span>' : '<span class="pris-badge out">odsoten</span>');
      var pod = upoLbl || (z.card_token ? 'kartica dodeljena' : 'brez kartice');
      var det = '<dl class="pris-zap-dl">' +
          '<dt>Stanje</dt><dd>' + znak + (notri ? ' <button type="button" class="cgrp-btn ghost pris-odjavi" data-odjavi="' + z.id + '">Odjavi</button>' : '') + '</dd>' +
          '<dt>Danes</dt><dd>' + (intervali.length ? escape_(intervali.join(', ')) + (danUre ? ' · <b>' + danUre + '</b>' : '') : '<span class="u-sub">ni vpisov</span>') + '</dd>' +
          '<dt>Uporabnik</dt><dd>' + (upoLbl ? escape_(upoLbl) : '<span class="u-sub">ni povezan</span>') + '</dd>' +
          '<dt>Kartica</dt><dd>' + (z.card_token ? 'dodeljena' : '<span class="u-sub">ni dodeljena</span>') + '</dd>' +
        '</dl>' +
        '<div class="pris-emp-act pris-zap-act">' +
          '<button type="button" class="cgrp-btn ghost" data-uredi="' + z.id + '">Uredi</button>' +
          '<button type="button" class="cgrp-btn ghost' + (z.profile_id ? ' on' : '') + '" data-uporabnik="' + z.id + '">' + (z.profile_id ? 'Uporabnik ✓' : 'Poveži uporabnika') + '</button>' +
          '<button type="button" class="cgrp-btn ghost" data-karta="' + z.id + '">' + (z.card_token ? 'Nova kartica' : 'Dodeli kartico') + '</button>' +
          '<button type="button" class="cgrp-btn ghost" data-aktiv="' + z.id + '" data-v="' + (z.active ? '0' : '1') + '">' + (z.active ? 'Deaktiviraj' : 'Aktiviraj') + '</button>' +
          '<button type="button" class="cgrp-btn danger" data-izbrisi="' + z.id + '">Izbriši</button>' +
        '</div>';
      return '<div class="lcell' + (z.active ? '' : ' pris-neakt') + '"><button class="row has-tag" type="button" data-zid="' + z.id + '" aria-haspopup="dialog">' +
        '<span><span class="row-name"><span class="row-nm">' + escape_(z.ime) + '</span></span><br><span class="row-legal">' + escape_(pod) + '</span>' + znak + '</span>' +
        '<span class="row-pct"></span><span class="num pris-zap-ure" title="Danes">' + (danUre || '—') + '</span><span class="chev" aria-hidden="true">›</span></button>' +
        '<div class="arts pris-zap-det">' + det + '</div></div>';
    }).join('');
    var aktivnihN = aktivni.length;
    var blok1 = '<div class="pris-card pris-zap-card"><div class="pris-h"><h3 class="sec-h">Zaposleni</h3>' +
      '<span class="pris-count" title="prisotni / aktivni">' + prisotnihN + ' / ' + aktivnihN + ' prisotnih</span></div>' +
      (zapKartice ? '<div class="rows pris-zap">' + zapKartice + '</div>' : '<p class="u-sub" style="padding:10px 2px">Še ni zaposlenih.</p>') +
      '<div class="pris-add"><input type="text" class="pris-new" placeholder="Ime in priimek novega zaposlenega"><button type="button" class="cgrp-btn pris-add-btn">+ Dodaj</button></div></div>';

    // ── Blok 2: evidenca (dan/mesec/oseba) ──
    var mesecni = (_prisView === 'mesec' || _prisView === 'oseba');
    var kljuc = mesecni ? _prisDan.slice(0, 7) : _prisDan;
    var telo;
    if (_prisView === 'oseba') {
      var mk = _prisDan.slice(0, 7);
      var zsel = (ZAPOSLENI || []).find(function (z) { return z.id === _prisOseba; }) || aktivni[0] || (ZAPOSLENI || [])[0] || null;
      if (zsel) _prisOseba = zsel.id;
      var opts = (ZAPOSLENI || []).map(function (z) {
        return '<option value="' + z.id + '"' + (zsel && z.id === zsel.id ? ' selected' : '') + '>' + escape_(z.ime) + (z.active ? '' : ' (neaktiven)') + '</option>';
      }).join('');
      var oRows = '', oTot = 0, oDni = 0;
      if (zsel) {
        var nDni = dniVMesecu(mk);
        for (var di = 1; di <= nDni; di++) {
          var dayISO = mk + '-' + ('0' + di).slice(-2);
          var wd = new Date(dayISO + 'T00:00:00').getDay();
          var c = prisChipiDan(zsel.id, dayISO); oTot += c.sek; if (c.sek) oDni++;
          oRows += '<tr' + (wd === 0 || wd === 6 ? ' class="pris-vikend"' : '') + '>' +
            '<td class="pris-dan-c">' + DNEVI_KR[wd] + ' ' + di + '.</td>' +
            '<td class="pris-pairs">' + c.html + '</td>' +
            '<td class="pris-ure">' + (c.sek ? trajanjeH(c.sek) : '—') + '</td>' +
            '<td class="pris-act"><button type="button" class="cgrp-btn ghost" data-rocniday="' + zsel.id + '|' + dayISO + '">+ ročno</button></td></tr>';
        }
      }
      telo = '<div class="pris-oseba-sel"><select id="prisOsebaSel" class="sc-modal-input">' + (opts || '') + '</select></div>' +
        '<div class="pris-scroll"><table class="pris-tbl pris-tbl-oseba"><thead><tr><th>Dan</th><th>Prihod–odhod</th><th>Ur</th><th></th></tr></thead><tbody>' +
        (oRows || '<tr><td colspan="4" class="u-sub">Ni zaposlenih.</td></tr>') + '</tbody>' +
        '<tfoot><tr><td>Skupaj (' + oDni + ' dni)</td><td></td><td class="pris-ure">' + (oTot ? trajanjeH(oTot) : '—') + '</td><td></td></tr></tfoot></table></div>';
    } else if (_prisView === 'mesec') {
      var mSek = 0, mDni = 0;
      var mVrst = prisOsebeZaEvidenco(kljuc).map(function (z) {
        var pov = prisPovzetek(z.id, kljuc);
        mSek += pov.sek; mDni += pov.dni;
        return '<tr><td>' + escape_(z.ime) + (z.active ? '' : ' <span class="u-sub">(neaktiven)</span>') + '</td><td class="pris-ure">' + pov.dni + '</td><td class="pris-ure">' + (pov.sek ? trajanjeH(pov.sek) : '—') + '</td></tr>';
      }).join('');
      telo = '<div class="pris-scroll"><table class="pris-tbl"><thead><tr><th>Zaposleni</th><th>Dni</th><th>Ur skupaj</th></tr></thead><tbody>' +
        (mVrst || '<tr><td colspan="3" class="u-sub">Ni podatkov.</td></tr>') + '</tbody>' +
        (mVrst ? '<tfoot><tr><td>Skupaj</td><td class="pris-ure">' + mDni + '</td><td class="pris-ure">' + (mSek ? trajanjeH(mSek) : '—') + '</td></tr></tfoot>' : '') +
        '</table></div>';
    } else {
      var dSek = 0;
      var dVrst = prisOsebeZaEvidenco(kljuc).map(function (z) {
        var c = prisChipiDan(z.id, kljuc);
        dSek += c.sek;
        return '<tr><td>' + escape_(z.ime) + (z.active ? '' : ' <span class="u-sub">(neaktiven)</span>') + '</td><td class="pris-pairs">' + c.html + '</td><td class="pris-ure">' + (c.sek ? trajanjeH(c.sek) : '—') + '</td>' +
          '<td class="pris-act"><button type="button" class="cgrp-btn ghost" data-rocni="' + z.id + '">+ ročno</button></td></tr>';
      }).join('');
      telo = '<div class="pris-scroll"><table class="pris-tbl pris-tbl-dan"><thead><tr><th>Zaposleni</th><th>Prihod–odhod</th><th>Ur skupaj</th><th></th></tr></thead><tbody>' +
        (dVrst || '<tr><td colspan="4" class="u-sub">Ni podatkov.</td></tr>') + '</tbody>' +
        (dVrst ? '<tfoot><tr><td>Skupaj</td><td></td><td class="pris-ure">' + (dSek ? trajanjeH(dSek) : '—') + '</td><td></td></tr></tfoot>' : '') +
        '</table></div>';
    }
    var blok2 = '<div class="pris-card"><div class="pris-h"><h3 class="sec-h">Evidenca</h3>' +
      '<button type="button" class="cgrp-btn ghost pris-izvoz">Izvozi ' + escape_(_mesecLabel(_prisDan.slice(0, 7))) + '</button></div>' +
      '<div class="pris-barvrsta">' +
        '<div class="pris-datum">' +
          '<button type="button" class="pris-nav" data-nav="-1" aria-label="Prejšnji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>' +
          '<input type="' + (mesecni ? 'month' : 'date') + '" id="prisDatum" value="' + (mesecni ? _prisDan.slice(0, 7) : _prisDan) + '">' +
          '<button type="button" class="pris-nav" data-nav="1" aria-label="Naslednji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>' +
          ((mesecni ? (_prisDan.slice(0, 7) === danes10().slice(0, 7)) : (_prisDan === danes10())) ? '' : '<button type="button" class="dat-danes" id="prisDanes" title="Nazaj na danes">Danes</button>') +
        '</div>' +
        '<span class="pris-tabs"><button type="button" class="pris-tab' + (_prisView === 'dan' ? ' on' : '') + '" data-obd="dan">Dan</button>' +
        '<button type="button" class="pris-tab' + (_prisView === 'mesec' ? ' on' : '') + '" data-obd="mesec">Mesec</button>' +
        '<button type="button" class="pris-tab' + (_prisView === 'oseba' ? ' on' : '') + '" data-obd="oseba">Oseba</button></span>' +
      '</div>' +
      telo + '</div>';

    box.innerHTML = blok1 + blok2;

    var dat = $('prisDatum'); if (dat) dat.addEventListener('change', function () { var v = this.value || danes10(); if (v.length === 7) v += '-01'; _prisDan = v; prisObdobje(); });
    { var pdn = $('prisDanes'); if (pdn) pdn.addEventListener('click', function () { _prisDan = danes10(); prisObdobje(); }); }
    box.querySelectorAll('[data-obd]').forEach(function (b) { b.addEventListener('click', function () { _prisView = b.dataset.obd; _prisMesec = (_prisView !== 'dan'); prisRender(); }); });
    box.querySelectorAll('[data-nav]').forEach(function (b) { b.addEventListener('click', function () { prisPremakni(parseInt(b.dataset.nav, 10)); }); });
    { var os = $('prisOsebaSel'); if (os) os.addEventListener('change', function () { _prisOseba = this.value; prisRender(); }); }
    box.querySelectorAll('[data-rocniday]').forEach(function (b) { b.addEventListener('click', function () { var p = String(b.dataset.rocniday).split('|'); prisRocni(p[0], p[1]); }); });
    { var ib = box.querySelector('.pris-izvoz'); if (ib) ib.addEventListener('click', prisIzvoz); }
    box.querySelectorAll('[data-odjavi]').forEach(function (b) { b.addEventListener('click', function () { prisOdjavi(b.dataset.odjavi); }); });
    box.querySelectorAll('[data-rocni]').forEach(function (b) { b.addEventListener('click', function () { prisRocni(b.dataset.rocni); }); });
    box.querySelectorAll('[data-delpair]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); prisIzbrisiPar(b.dataset.delpair); }); });
    box.querySelectorAll('[data-cpair]').forEach(function (cb) { cb.addEventListener('click', function (e) { e.stopPropagation(); }); cb.addEventListener('change', function (e) { e.stopPropagation(); prisPotrdiPar(cb.dataset.cpair, cb.checked); }); });
    box.querySelectorAll('[data-editpair]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); prisUrediPar(b.dataset.editpair); }); });
    box.querySelectorAll('[data-karta]').forEach(function (b) { b.addEventListener('click', function () { prisDodeliKarto(b.dataset.karta); }); });
    box.querySelectorAll('[data-aktiv]').forEach(function (b) { b.addEventListener('click', function () { prisAktiv(b.dataset.aktiv, b.dataset.v === '1'); }); });
    box.querySelectorAll('[data-uredi]').forEach(function (b) { b.addEventListener('click', function () { prisPreimenuj(b.dataset.uredi); }); });
    box.querySelectorAll('[data-uporabnik]').forEach(function (b) { b.addEventListener('click', function () { prisPoveziUporabnika(b.dataset.uporabnik); }); });
    box.querySelectorAll('[data-izbrisi]').forEach(function (b) { b.addEventListener('click', function () { prisIzbrisi(b.dataset.izbrisi); }); });
    var nb = box.querySelector('.pris-add-btn'), ni = box.querySelector('.pris-new');
    if (nb && ni) { nb.addEventListener('click', function () { prisDodajZap(ni.value); }); ni.addEventListener('keydown', function (e) { if (e.key === 'Enter') prisDodajZap(ni.value); }); }
    box.querySelectorAll('.pris-zap .row[data-zid]').forEach(function (b) { b.addEventListener('click', function () { prisOdpriZap(b); }); });
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
    oknoPoIzrisu();   // samodejna osvežitev (vsakih 12 s) in dejanja: okno dobi sveže stanje ali se zapre
  }
  function prisNajdiZap(id) { return document.querySelector('#prisList .pris-zap .row[data-zid="' + String(id).replace(/"/g, '\\"') + '"]'); }
  function prisOdpriZap(btn) {
    if (_okno) return;
    var id = btn.dataset.zid;
    oknoOdpri(btn, btn.nextElementSibling, function () { return prisNajdiZap(id); }, {
      osvezi: function (k) { return k.nextElementSibling; }
    });
  }
  // Oseben pregled ur za vlogo »Zaposleni«.
  function prisRenderMoje(box, _sy) {
    var mk = _prisDan.slice(0, 7);
    var moj = (ZAPOSLENI || []).find(function (z) { return (z.ime || '').trim().toLowerCase() === (JAZIME || '').trim().toLowerCase(); });
    var telo;
    if (!moj) {
      telo = '<p class="u-sub" style="padding:8px 2px">Tvoj profil še ni povezan z evidenco ur. Prosi vodjo, da te v Prisotnosti doda pod imenom »' + escape_(JAZIME || '') + '«.</p>';
    } else {
      var rows = '', tot = 0, dni = 0, nDni = dniVMesecu(mk);
      for (var di = 1; di <= nDni; di++) {
        var dayISO = mk + '-' + ('0' + di).slice(-2);
        var wd = new Date(dayISO + 'T00:00:00').getDay();
        var c = prisChipiDan(moj.id, dayISO); tot += c.sek; if (c.sek) dni++;
        rows += '<tr' + (wd === 0 || wd === 6 ? ' class="pris-vikend"' : '') + '><td class="pris-dan-c">' + DNEVI_KR[wd] + ' ' + di + '.</td><td class="pris-pairs">' + c.html + '</td><td class="pris-ure">' + (c.sek ? trajanjeH(c.sek) : '—') + '</td></tr>';
      }
      telo = '<div class="pris-scroll"><table class="pris-tbl pris-tbl-oseba"><thead><tr><th>Dan</th><th>Prihod–odhod</th><th>Ur</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><td>Skupaj (' + dni + ' dni)</td><td></td><td class="pris-ure">' + (tot ? trajanjeH(tot) : '—') + '</td></tr></tfoot></table></div>';
    }
    box.innerHTML = '<div class="pris-card"><div class="pris-h"><h3 class="sec-h">Moje ure — ' + escape_(_mesecLabel(mk)) + '</h3></div>' +
      '<div class="pris-barvrsta"><div class="pris-datum">' +
      '<button type="button" class="pris-nav" data-mnav="-1" aria-label="Prejšnji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<input type="month" id="prisDatumMoj" value="' + mk + '">' +
      '<button type="button" class="pris-nav" data-mnav="1" aria-label="Naslednji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>' +
      '</div></div>' + telo + '</div>';
    function skoci(delta) { var d = new Date(mk + '-01T00:00:00'); d.setMonth(d.getMonth() + delta); _prisDan = d.toISOString().slice(0, 10); prisRender(); }
    var dm = $('prisDatumMoj'); if (dm) dm.addEventListener('change', function () { var v = this.value; if (v) { _prisDan = v + '-01'; prisRender(); } });
    box.querySelectorAll('[data-mnav]').forEach(function (b) { b.addEventListener('click', function () { skoci(parseInt(b.dataset.mnav, 10)); }); });
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  async function prisDodajZap(ime) {
    ime = (ime || '').trim(); if (!ime) { toast('Vpiši ime.'); return; }
    var org = prisOrg(); if (!org) { toast('Ni organizacije za zaposlenega.'); return; }
    var ins = await sb.from('employees').insert({ org_id: org, ime: ime, active: true }).select('id').maybeSingle();
    if (ins.error) { toast('Napaka: ' + ins.error.message); return; }
    toast('Zaposleni dodan.'); await risiPrisotnost();
  }
  async function prisAktiv(empId, on) {
    var up = await sb.from('employees').update({ active: on }).eq('id', empId);
    if (up.error) { toast('Napaka: ' + up.error.message); return; }
    await risiPrisotnost();
  }
  async function prisPreimenuj(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var novo = await vnesiModal({ naslov: 'Preimenuj zaposlenega', privzeto: z.ime, placeholder: 'Ime in priimek', potrdi: 'Shrani' });
    if (novo === null) return;
    novo = novo.trim(); if (!novo) { toast('Ime ne sme biti prazno.'); return; }
    var up = await sb.from('employees').update({ ime: novo }).eq('id', empId);
    if (up.error) { toast('Napaka: ' + up.error.message); return; }
    toast('Ime posodobljeno.'); await risiPrisotnost();
  }
  // Poveži zaposlenega (evidenca ur) z uporabnikom portala (e-pošta + geslo).
  function prisPoveziUporabnika(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    if (!PRIS_UPO || !PRIS_UPO.length) { toast('Ni uporabnikov portala za povezavo.'); return; }
    var opts = '<option value="">— brez povezave —</option>' + PRIS_UPO.map(function (u) {
      var lbl = (u.full_name ? u.full_name + ' · ' : '') + (u.email || u.id);
      return '<option value="' + u.id + '"' + (z.profile_id === u.id ? ' selected' : '') + '>' + escape_(lbl) + '</option>';
    }).join('');
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Poveži z uporabnikom — ' + escape_(z.ime) + '</h4>' +
      '<p class="u-sub" style="margin:0 0 10px">Poveži zaposlenega z uporabnikom portala (tistim z e-pošto in geslom). Uporabnike urejaš v razdelku Uporabniki.</p>' +
      '<label class="pris-lab">Uporabnik</label><select class="pu-sel sc-modal-input">' + opts + '</select>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var val = back.querySelector('.pu-sel').value || null;
      if (val) { var ze = (ZAPOSLENI || []).find(function (x) { return x.profile_id === val && x.id !== empId; }); if (ze) { toast('Ta uporabnik je že povezan z: ' + ze.ime); return; } }
      var up = await sb.from('employees').update({ profile_id: val }).eq('id', empId);
      if (up.error) { toast('Napaka: ' + (/profile_id|column|schema/i.test(up.error.message || '') ? 'najprej zaženi 48_zaposleni_uporabnik.sql v Supabase.' : up.error.message)); return; }
      logDodaj('Prisotnost', 'Urejeno', 'Zaposleni „' + z.ime + '" ' + (val ? 'povezan z uporabnikom ' + ((PRIS_UPO_MAP[val] && PRIS_UPO_MAP[val].email) || '') : 'odvezan od uporabnika'));
      toast(val ? 'Uporabnik povezan.' : 'Povezava odstranjena.'); zapri(); await risiPrisotnost();
    });
  }
  async function prisIzbrisi(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var ok = await potrdiModal({ naslov: 'Izbriši zaposlenega', sporocilo: 'Res izbrišem „' + z.ime + '"? Izbrišejo se tudi vsi njegovi vpisi ur — tega ni mogoče razveljaviti. (Če želiš ohraniti zgodovino, raje uporabi Deaktiviraj.)', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var del = await sb.from('employees').delete().eq('id', empId);
    if (del.error) { toast('Napaka: ' + del.error.message); return; }
    toast('Zaposleni izbrisan.'); await risiPrisotnost();
  }
  // Žeton s kartice DESFire je natanko 32 šestnajstiških znakov (16 bajtov).
  // Izpiše ga  vpisi_karto.py  na računalniku z bralnikom; portal bralnika nima.
  var ZETON_VZOREC = /^[0-9A-F]{32}$/;

  async function prisDodeliKarto(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var zeton = await vnesiModal({
      naslov: (z.card_token ? 'Nova kartica — ' + z.ime : 'Dodeli kartico — ' + z.ime),
      sporocilo: 'Prilepi žeton, ki ga je izpisal vpisi_karto.py — 32 šestnajstiških znakov.'
        + (z.card_token ? '\nStara kartica bo prenehala delovati.' : ''),
      placeholder: 'npr. A1B2C3D4E5F60718293A4B5C6D7E8F90',
      potrdi: 'Shrani'
    });
    if (zeton === null) return;
    // Presledki in male črke so pri lepljenju običajni — popravimo jih sami.
    zeton = (zeton || '').replace(/\s+/g, '').toUpperCase();
    if (!zeton) { toast('Prazen žeton — preklicano.'); return; }
    if (!ZETON_VZOREC.test(zeton)) {
      toast('Žeton mora biti 32 šestnajstiških znakov (vpisanih ' + zeton.length + ').');
      return;
    }
    // Enoličnost lovi tudi baza, a tu povemo IME, kar je edino uporabno.
    var drugi = (ZAPOSLENI || []).find(function (x) { return x.id !== empId && x.card_token === zeton; });
    if (drugi) { toast('Ta žeton že ima ' + drugi.ime + '.'); return; }

    // .select() je bistven: brez njega update ne pove, ali je zadel kakšno vrstico.
    // Pravila RLS vrstice SKRIJEJO — zavrnjen popravek ne javi napake, le popravi nič.
    var up = await sb.from('employees').update({ card_token: zeton }).eq('id', empId).select('id,ime,card_token');
    if (up.error) {
      var m = up.error.message || '';
      toast('Napaka: ' + (m.indexOf('duplicate') >= 0 || m.indexOf('employees_card_token_key') >= 0
        ? 'ta žeton je že dodeljen drugemu zaposlenemu.' : m));
      return;
    }
    if (!up.data || !up.data.length) { toast('Ni bilo mogoče shraniti — za to vlogo ni pravic.'); return; }
    z.card_token = up.data[0].card_token;
    toast('Kartica shranjena za ' + up.data[0].ime + '.');
    await risiPrisotnost();
  }
  // Potrdi/prekliči uro (par prihod–odhod). Označi obe (prihod + odhod).
  async function prisPotrdiPar(idsStr, on) {
    var ids = String(idsStr || '').split(',').filter(Boolean);
    if (!ids.length) return;
    var up = await sb.from('att_events').update({ potrjeno: on }).in('id', ids);
    if (up.error) { toast('Napaka: ' + up.error.message); return; }
    ids.forEach(function (id) { var d = prisDogById(id); if (d) d.potrjeno = on; });
    prisRender();
  }
  async function prisIzbrisiPar(idsStr) {
    var ids = String(idsStr || '').split(',').filter(Boolean);
    if (!ids.length) return;
    var ok = await potrdiModal({ naslov: 'Izbriši vpis', sporocilo: 'Izbrišem ta vpis ur (prihod' + (ids.length > 1 ? ' in odhod' : '') + ')? Tega ni mogoče razveljaviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var del = await sb.from('att_events').delete().in('id', ids);
    if (del.error) { toast('Napaka: ' + del.error.message); return; }
    toast('Vpis izbrisan.'); await risiPrisotnost();
  }
  function hmLocal(ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function danLocal(ts) { var d = new Date(ts); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function prisDogById(id) { return (PRISDOG || []).find(function (d) { return d.id === id; }); }
  // Uredi obstoječi vpis: popravi prihod/odhod. Če odhod izprazniš, se ta odstrani (izmena spet odprta).
  function prisUrediPar(idsStr) {
    var ids = String(idsStr || '').split(',').filter(Boolean);
    var inEv = prisDogById(ids[0]); var outEv = ids[1] ? prisDogById(ids[1]) : null;
    if (!inEv) { toast('Vpisa ni več.'); return; }
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === inEv.employee_id; }); if (!z) return;
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Uredi vpis — ' + escape_(z.ime) + '</h4>' +
      '<label class="pris-lab">Datum</label><input type="date" class="pris-r-dan sc-modal-input" value="' + danLocal(inEv.ts) + '">' +
      '<div class="pris-r-cas"><div><label class="pris-lab">Prihod</label><input type="time" class="pris-r-in sc-modal-input" value="' + hmLocal(inEv.ts) + '"></div>' +
      '<div><label class="pris-lab">Odhod <span class="u-sub">(neobvezno)</span></label><input type="time" class="pris-r-out sc-modal-input" value="' + (outEv ? hmLocal(outEv.ts) : '') + '"></div></div>' +
      '<p class="u-sub" style="margin:8px 0 0">Če odhod izprazniš, se odstrani (izmena ostane odprta).</p>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var nd = back.querySelector('.pris-r-dan').value;
      var nin = back.querySelector('.pris-r-in').value;
      var nout = back.querySelector('.pris-r-out').value;
      if (!nd || !nin) { toast('Vpiši datum in prihod.'); return; }
      if (nout && nout <= nin) { toast('Odhod mora biti za prihodom.'); return; }
      var ops = [sb.from('att_events').update({ ts: new Date(nd + 'T' + nin).toISOString() }).eq('id', inEv.id)];
      if (nout) {
        if (outEv) ops.push(sb.from('att_events').update({ ts: new Date(nd + 'T' + nout).toISOString() }).eq('id', outEv.id));
        else ops.push(sb.from('att_events').insert({ org_id: z.org_id, employee_id: z.id, type: 'out', source: 'manual', ts: new Date(nd + 'T' + nout).toISOString() }));
      } else if (outEv) {
        ops.push(sb.from('att_events').delete().eq('id', outEv.id));
      }
      var res = await Promise.all(ops);
      if (res.some(function (r) { return r.error; })) { toast('Napaka pri shranjevanju.'); return; }
      toast('Vpis posodobljen.'); zapri(); await risiPrisotnost();
    });
  }
  // Ročni vnos ur — VEČ intervalov (izmen) na en dan; vmesni čas = pavza.
  // Glavni način, dokler kartični sistem ni v uporabi.
  function prisRocni(empId, danArg) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    var dan = (danArg && danArg.length === 10) ? danArg : ((_prisMesec || !_prisDan || _prisDan.length !== 10) ? danes10() : _prisDan);
    function rowHtml(inv, outv) {
      return '<div class="pris-int-row">' +
        '<input type="time" class="pris-int-in sc-modal-input" value="' + (inv || '') + '" aria-label="Prihod">' +
        '<span class="pris-int-sep">–</span>' +
        '<input type="time" class="pris-int-out sc-modal-input" value="' + (outv || '') + '" aria-label="Odhod">' +
        '<button type="button" class="pris-int-del" title="Odstrani interval" aria-label="Odstrani interval">×</button>' +
        '</div>';
    }
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Ročni vnos ur — ' + escape_(z.ime) + '</h4>' +
      '<label class="pris-lab">Datum</label><input type="date" class="pris-r-dan sc-modal-input" value="' + dan + '">' +
      '<label class="pris-lab" style="margin-top:12px">Intervali (izmene) — prihod – odhod</label>' +
      '<div class="pris-intervali">' + rowHtml() + '</div>' +
      '<button type="button" class="pris-int-add">+ Dodaj interval</button>' +
      '<p class="u-sub" style="margin:10px 0 0">Vsak interval je ena izmena. Vmesni čas (npr. 9:00–13:00) šteje kot <b>pavza</b> in se NE všteje v ure. Zadnji odhod lahko pustiš prazen (izmena še traja).</p>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    var lst = back.querySelector('.pris-intervali');
    back.querySelector('.pris-int-add').addEventListener('click', function () { lst.insertAdjacentHTML('beforeend', rowHtml()); });
    lst.addEventListener('click', function (e) {
      var b = e.target.closest('.pris-int-del'); if (!b) return;
      var row = b.closest('.pris-int-row'), vse = lst.querySelectorAll('.pris-int-row');
      if (vse.length > 1) row.parentNode.removeChild(row);
      else { row.querySelector('.pris-int-in').value = ''; row.querySelector('.pris-int-out').value = ''; }
    });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var d = back.querySelector('.pris-r-dan').value;
      if (!d) { toast('Vpiši datum.'); return; }
      var rows = [].slice.call(lst.querySelectorAll('.pris-int-row')), intervali = [];
      for (var i = 0; i < rows.length; i++) {
        var vin = rows[i].querySelector('.pris-int-in').value, vout = rows[i].querySelector('.pris-int-out').value;
        if (!vin && !vout) continue;                                  // prazna vrstica → preskoči
        if (!vin) { toast('Vsak interval potrebuje prihod.'); return; }
        if (vout && vout <= vin) { toast('Odhod mora biti za prihodom (' + vin + '–' + vout + ').'); return; }
        intervali.push({ in: vin, out: vout });
      }
      if (!intervali.length) { toast('Vpiši vsaj en interval.'); return; }
      intervali.sort(function (a, b) { return a.in < b.in ? -1 : 1; });
      for (var k = 1; k < intervali.length; k++) {                    // prekrivanje ni dovoljeno
        if (intervali[k - 1].out && intervali[k].in < intervali[k - 1].out) { toast('Intervala se prekrivata — popravi ure.'); return; }
      }
      var vstavi = [];
      intervali.forEach(function (iv) {
        vstavi.push({ org_id: z.org_id, employee_id: z.id, type: 'in', source: 'manual', ts: new Date(d + 'T' + iv.in).toISOString() });
        if (iv.out) vstavi.push({ org_id: z.org_id, employee_id: z.id, type: 'out', source: 'manual', ts: new Date(d + 'T' + iv.out).toISOString() });
      });
      var ins = await sb.from('att_events').insert(vstavi);
      if (ins.error) { toast('Napaka: ' + ins.error.message); return; }
      try { logDodaj('Prisotnost', 'Ročni vnos', z.ime + ' · ' + d + ' · ' + intervali.map(function (iv) { return iv.in + '–' + (iv.out || '…'); }).join(', ')); } catch (e) {}
      toast('Vpisano · ' + intervali.length + ' ' + (intervali.length === 1 ? 'interval' : 'intervalov') + '.'); zapri(); await risiPrisotnost();
    });
  }

  /* ══════════ ARTIKLI (katalog po skupinah ID + teža + dodeljevanje) ══════════ */
  var _artOpen = {}, SKUPINE_IME = {};
  function artPrefix(koda) { var s = normId(koda); return /^[A-ZČŠŽ]{2}[0-9]{3}$/.test(s) ? s.slice(0, 2) : '—'; }
  function imeSkupine(pre) { return SKUPINE_IME[pre] || ('Skupina ' + pre); }
  async function naloziSkupineImena() {
    try { var r = await sb.from('article_groups').select('prefix,name'); if (!r.error) { SKUPINE_IME = {}; (r.data || []).forEach(function (x) { if (x.name) SKUPINE_IME[x.prefix] = x.name; }); } } catch (e) {}
  }
  // Enoten prikaz teže: brez presledka, vejica, nad 1000 kg v tonah.
  // 1kg · 12,45kg · 123,45kg · 1,2345t · 12,345t
  function tezaFmt(kg) {
    kg = Math.round((Number(kg) || 0) * 100) / 100;
    var v, u;
    if (kg >= 1000) { v = kg / 1000; u = 't'; } else { v = kg; u = 'kg'; }
    var s = v.toFixed(2);                 // max 2 decimalki povsod (kg in t)
    s = s.replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
    return s + u;
  }
  function fmtTeza(t) { return tezaFmt(t); }
  function artNextNum(pre) { var max = 0; (CENIK || []).forEach(function (x) { var s = normId(x.koda); if (s.slice(0, 2) === pre) { var n = parseInt(s.slice(2), 10); if (!isNaN(n) && n > max) max = n; } }); return pad3(max + 1); }
  function artikliGrupe() {
    var g = {};
    (CENIK || []).forEach(function (x) { if (x.deleted_at) return; var pre = artPrefix(x.koda); (g[pre] = g[pre] || []).push(x); });
    Object.keys(g).forEach(function (k) { g[k].sort(cenikSort); });
    return g;
  }
  function strankaSkupina(orgId) {
    if (!CLANI) return null;
    var priced = CLANI.filter(function (a) { return a.org_id === orgId && a.cena_sifra != null; });
    if (!priced.length) return null;
    var prefs = {};
    for (var i = 0; i < priced.length; i++) { var p = CENIKMAP[priced[i].cena_sifra]; if (!p) return null; prefs[artPrefix(p.koda)] = 1; }
    var ks = Object.keys(prefs); return ks.length === 1 ? ks[0] : null;
  }
  // Zamenja cenik stranke z danimi šiframi (prazen seznam → izprazni).
  // Vsak napačen odgovor baze VRŽE napako (klicatelj jo mora prestreči in prikazati) —
  // prej se je tiho pogoltnila, zato je »dodal« lokalno, v bazi pa ne.
  async function nastaviSkupinoStranki(orgId, ciljneSifre) {
    ciljneSifre = ciljneSifre || [];
    var obst = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) obst[a.cena_sifra] = a; });
    var vstavi = [];
    for (var j = 0; j < ciljneSifre.length; j++) {
      var sif = ciljneSifre[j];
      if (obst[sif]) { var u = await sb.from('articles').update({ sort_order: j }).eq('org_id', orgId).eq('cena_sifra', sif); if (u.error) throw u.error; obst[sif].sort_order = j; delete obst[sif]; }
      else { var p = CENIKMAP[sif]; vstavi.push({ org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j }); }
    }
    // Manjkajoče artikle vstavi v ENEM zahtevku (hitro + brez delnega stanja).
    if (vstavi.length) {
      var ins = await sb.from('articles').insert(vstavi).select('id,org_id,name,cena_sifra,sort_order');
      if (ins.error) throw ins.error;
      if (CLANI && ins.data) ins.data.forEach(function (r) { CLANI.push(r); });
    }
    var odstrani = Object.keys(obst);
    for (var k = 0; k < odstrani.length; k++) {
      var s2 = parseInt(odstrani[k], 10);
      var d = await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s2);
      if (d.error) throw d.error;
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s2); });
    }
    var brez = (CLANI || []).filter(function (a) { return a.org_id === orgId && a.cena_sifra == null && a.id != null; });
    for (var m = 0; m < brez.length; m++) { var d2 = await sb.from('articles').delete().eq('id', brez[m].id); if (d2.error) throw d2.error; }
    if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra == null); });
  }
  async function risiArtikli() {
    var box = $('artList'); if (!box) return;
    pokaziNalaganje(box);
    try {
      await nalozicenik(true);
      await naloziClane(true);
      await naloziSkupineImena();
      artRender();
      box.dataset.loaded = '1';
    } catch (e) { if (!box.dataset.loaded) box.innerHTML = '<div class="pris-card"><p class="u-sub">Napaka pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>'; }
  }
  function artRender() {
    var box = $('artList'); if (!box) return;
    var _sy = window.scrollY;
    var grupe = artikliGrupe();
    var preSet = {}; Object.keys(grupe).forEach(function (k) { if (k !== '—') preSet[k] = 1; }); Object.keys(SKUPINE_IME).forEach(function (k) { preSet[k] = 1; });
    var prefs = Object.keys(preSet).sort();
    if (grupe['—']) prefs.push('—');
    var strPoGrupi = {}; (ORGSEZNAM || []).forEach(function (o) { var g = strankaSkupina(o.id); if (g) (strPoGrupi[g] = strPoGrupi[g] || []).push(o); });
    // Gumba »+ Nov cenik« in »Uskladi artikle« sta v glavi razdelka (enotna orodna vrstica), ne več v seznamu.
    // Skupine se odpirajo v OKNU. _artOpen je zdaj le zahteva »odpri to skupino« (nov cenik,
    // dodan artikel, »Uredi v Ceniku ›« iz stranke) — v seznamu so skupine vedno zaprte.
    var zahtevana = Object.keys(_artOpen).filter(function (k) { return _artOpen[k]; })[0] || null;
    _artOpen = {};
    box.innerHTML = (prefs.length ? '<div class="art-skupine">' + prefs.map(function (pre) {
      var arts = grupe[pre] || []; var open = false; var str = strPoGrupi[pre] || [];
      var rows = arts.map(function (x) {
        var c = Number(x.cena1) || 0;
        var pot = !!x.cena_potrjena;
        var stanje = c <= 0 ? 'cena-nic' : (pot ? 'cena-ok' : 'cena-ni');   // rdeča / zelena / oranžna
        return '<div class="art-row ' + stanje + '" data-s="' + x.sifra + '"><span class="art-r-id">' + escape_(normId(x.koda) || '—') + '</span>' +
          '<span class="art-r-nm">' + escape_(x.naziv || '') + '</span>' +
          '<span class="art-r-cena">' + cenaFmt(x.cena1) + '</span>' +
          '<span class="art-r-acts">' +
            '<label class="art-chk' + (c <= 0 ? ' dis' : '') + '" title="' + (c <= 0 ? 'Vpiši ceno' : 'Označi, ko je cena potrjena') + '"><input type="checkbox" data-cpot="' + x.sifra + '"' + (pot ? ' checked' : '') + (c <= 0 ? ' disabled' : '') + '><span class="art-chk-box"></span></label>' +
            '<button type="button" class="art-grip dnd-handle" title="povleci za razvrščanje" aria-label="razvrsti">' + DND_ICON + '</button><button type="button" class="art-r-edit" data-aedit="' + x.sifra + '" title="uredi" aria-label="uredi">✎</button><button type="button" class="art-r-del" data-adel="' + x.sifra + '" title="izbriši" aria-label="izbriši">×</button></span></div>';
      }).join('');
      var chips = str.length ? str.map(function (o) { return '<span class="pris-chip"><span class="pris-chip-t" style="cursor:default">' + escape_(ORGIME[o.id] || o.name) + '</span></span>'; }).join(' ') : '<span class="u-sub">Ni dodeljenih strank.</span>';
      return '<div class="cgrp' + (open ? ' open' : '') + '" data-pre="' + escape_(pre) + '"><div class="cgrp-head-row"><button type="button" class="cgrp-h' + (open ? ' open' : '') + '" data-artgrp="' + escape_(pre) + '">' +
        '<span class="cgrp-name"><span class="cgrp-nm">' + escape_(imeSkupine(pre)) + '</span><span class="cgrp-sub">' + escape_(pre) + ' · ' + str.length + ' ' + (str.length === 1 ? 'stranka' : 'strank') + '</span></span>' +
        '<span class="cgrp-count">' + arts.length + ' art.</span><span class="cgrp-chev" aria-hidden="true">›</span></button></div>' +
        '<div class="cgrp-body' + (open ? ' show' : '') + '">' +
        '<div class="art-assign"><div class="art-assign-str">' + chips + '</div><div class="art-assign-acts"><button type="button" class="cgrp-btn ghost art-preime" data-pre="' + escape_(pre) + '">Preimenuj</button><button type="button" class="cgrp-btn ghost art-dodeli" data-pre="' + escape_(pre) + '">Uredi stranke</button><button type="button" class="cgrp-btn danger art-delskup" data-pre="' + escape_(pre) + '">Izbriši skupino</button></div></div>' +
        '<div class="art-thead"><span>ID</span><span>Naziv</span><span>Cena</span><span></span></div><div class="art-rows">' + rows + '</div>' +
        '<div class="art-add-new"><input type="text" class="art-nn-nm" placeholder="nov artikel"><input type="text" class="art-nn-id" maxlength="5" value="' + escape_(pre + artNextNum(pre)) + '"><input type="text" inputmode="decimal" class="art-nn-cena" placeholder="€"><button type="button" class="cgrp-btn art-nn-btn" data-pre="' + escape_(pre) + '">+ Dodaj</button></div>' +
        '</div></div>';
    }).join('') + '</div>' : '<div class="pris-card"><p class="u-sub">Ni artiklov. Ustvari nov cenik z gumbom zgoraj.</p></div>');

    box.querySelectorAll('[data-artgrp]').forEach(function (h) { h.addEventListener('click', function () { artOdpriSkupino(h.dataset.artgrp); }); });
    box.querySelectorAll('[data-aedit]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artUredi(parseInt(b.dataset.aedit, 10)); }); });
    box.querySelectorAll('[data-adel]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artIzbrisi(parseInt(b.dataset.adel, 10)); }); });
    box.querySelectorAll('.art-dodeli').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artDodeli(b.dataset.pre); }); });
    box.querySelectorAll('.art-preime').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artPreimenujSkupino(b.dataset.pre); }); });
    box.querySelectorAll('.art-delskup').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artIzbrisiSkupino(b.dataset.pre); }); });
    box.querySelectorAll('.art-nn-btn').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artDodajNov(b.dataset.pre, b.closest('.art-add-new')); }); });
    box.querySelectorAll('[data-cpot]').forEach(function (cb) { cb.addEventListener('click', function (e) { e.stopPropagation(); }); cb.addEventListener('change', function (e) { e.stopPropagation(); artPotrdiCeno(parseInt(cb.dataset.cpot, 10), cb.checked); }); });
    box.querySelectorAll('.art-rows').forEach(function (rw) { dndSort(rw, '.art-row', '.art-grip', function () { artShraniVrstniRed(rw); }); });
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
    oknoPoIzrisu();   // odprto okno skupine dobi svežo vsebino (ali se zapre, če skupine ni več)
    if (zahtevana && !_okno) artOdpriSkupino(zahtevana);
  }
  { const _an = $('artNovaBtn'); if (_an) _an.addEventListener('click', function () { artNovCenik(); }); }
  { const _au = $('artUskladiBtn'); if (_au) _au.addEventListener('click', function () { artUskladiVse(); }); }
  function artNajdiSkupino(pre) { return document.querySelector('#artList .cgrp[data-pre="' + String(pre).replace(/"/g, '\\"') + '"]'); }
  // Glava okna skupine: ime cenika, predpona, število strank in artiklov (iz trenutne kartice).
  function artGlavaOkna(k) {
    var d = document.createElement('div');
    var nm = k && k.querySelector('.cgrp-nm'), sub = k && k.querySelector('.cgrp-sub'), cnt = k && k.querySelector('.cgrp-count');
    d.innerHTML = '<h3 class="sec-h">' + escape_(nm ? nm.textContent : '') + '</h3>' +
      '<div class="okno-glava-sub">' + escape_([sub ? sub.textContent : '', cnt ? cnt.textContent : ''].filter(Boolean).join(' · ')) + '</div>';
    return d;
  }
  function artOdpriSkupino(pre) {
    if (_okno) return;
    var k = artNajdiSkupino(pre); if (!k) return;
    var body = k.querySelector('.cgrp-body'); if (!body) return;
    oknoOdpri(k, body, function () { return artNajdiSkupino(pre); }, {
      glava: artGlavaOkna,
      osvezi: function (k2) { return k2.querySelector('.cgrp-body'); }
    });
  }
  async function artPotrdiCeno(sifra, on) {
    var rec = CENIKMAP[sifra];
    var up = await sb.from('pricelist').update({ cena_potrjena: on, updated_at: new Date().toISOString() }).eq('sifra', sifra);
    if (up.error) { toast('Napaka: ' + up.error.message); artRender(); return; }
    if (rec) rec.cena_potrjena = on;
    var rec2 = (CENIK || []).find(function (p) { return p.sifra === sifra; }); if (rec2) rec2.cena_potrjena = on;
    var row = document.querySelector('.art-row[data-s="' + sifra + '"]');
    if (row) {
      var c = Number(rec ? rec.cena1 : 0) || 0;
      row.classList.remove('cena-ok', 'cena-ni', 'cena-nic');
      row.classList.add(c <= 0 ? 'cena-nic' : (on ? 'cena-ok' : 'cena-ni'));
    }
  }
  async function artShraniVrstniRed(container) {
    var els = [].slice.call(container.querySelectorAll('.art-row'));
    if (!els.length) return;
    var upd = [];
    els.forEach(function (el, i) {
      var sif = parseInt(el.dataset.s, 10); if (isNaN(sif)) return;
      upd.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', sif));
      // vrstni red prenesi tudi na artikle vseh strank (to bere tablica)
      upd.push(sb.from('articles').update({ sort_order: i }).eq('cena_sifra', sif));
      if (CENIKMAP[sif]) CENIKMAP[sif].sort_order = i;
      var rec = (CENIK || []).find(function (p) { return p.sifra === sif; }); if (rec) rec.sort_order = i;
      (CLANI || []).forEach(function (a) { if (a.cena_sifra === sif) a.sort_order = i; });
    });
    try {
      var res = await Promise.all(upd);
      if (res.some(function (r) { return r.error; })) toast('Vrstni red morda ni v celoti shranjen.');
      else toast('Vrstni red shranjen.');
    } catch (e) { toast('Napaka pri shranjevanju vrstnega reda.'); }
  }
  function artUredi(sifra) {
    var rec = CENIKMAP[sifra]; if (!rec) return;
    var row = document.querySelector('.art-row[data-s="' + sifra + '"]'); if (!row) return;
    row.classList.add('art-row-edit');
    row.innerHTML = '<div class="art-edit-form">' +
      '<label class="ae-lab ae-lab-nm">Naziv artikla<input type="text" class="ae-nm" placeholder="Naziv artikla"></label>' +
      '<div class="art-edit-r">' +
      '<label class="ae-lab">Šifra (ID)<input type="text" class="ae-id" maxlength="5" placeholder="ID"></label>' +
      '<label class="ae-lab">Cena (€)<input type="text" inputmode="decimal" class="ae-cena" placeholder="0,00"></label>' +
      '<button type="button" class="btn-mini ae-save">Shrani</button><button type="button" class="cenik-x ae-cancel" title="prekliči">×</button></div></div>';
    row.querySelector('.ae-nm').value = rec.naziv || '';
    row.querySelector('.ae-id').value = normId(rec.koda);
    row.querySelector('.ae-cena').value = String(rec.cena1 != null ? rec.cena1 : '').replace('.', ',');
    row.querySelector('.ae-cancel').addEventListener('click', function () { artRender(); });
    row.querySelector('.ae-save').addEventListener('click', async function () {
      var nm = row.querySelector('.ae-nm').value.trim();
      var nid = normId(row.querySelector('.ae-id').value);
      var cRaw = row.querySelector('.ae-cena').value.trim();
      if (!nm) { toast('Vpiši naziv.'); return; }
      if (nid && !veljavenId(nid)) { toast('ID mora biti 2 črki + 3 številke.'); return; }
      if (nid && nid !== normId(rec.koda)) { var z = idZaseden(nid, sifra); if (z) { toast('ID ' + nid + ' že obstaja.'); return; } }
      var cena = cRaw === '' ? (rec.cena1 || 0) : parseFloat(cRaw.replace(',', '.'));
      if (isNaN(cena) || cena < 0) { toast('Neveljavna cena.'); return; }
      var patch = { naziv: nm, cena1: cena, updated_at: new Date().toISOString() };
      if (nid && nid !== normId(rec.koda)) patch.koda = nid;
      if (cena !== rec.cena1) patch.cena_potrjena = false;   // spremenjena cena → znova potrebna potrditev (oranžna)
      var e1 = (await sb.from('pricelist').update(patch).eq('sifra', sifra)).error;
      if (e1) { toast('Napaka: ' + e1.message); return; }
      if (nm !== rec.naziv) await posodobiImeArtikla(sifra, nm);
      var _spr = []; if (nm !== rec.naziv) _spr.push('naziv'); if (cena !== rec.cena1) _spr.push('cena ' + cenaFmt(cena));
      rec.naziv = nm; rec.cena1 = cena; if (patch.koda) rec.koda = nid; if ('cena_potrjena' in patch) rec.cena_potrjena = false; zgradiCenikMap();
      logDodaj('Artikli', 'Urejeno', 'Artikel „' + nm + '"' + (_spr.length ? ' (' + _spr.join(', ') + ')' : ''));
      toast('Shranjeno.'); artRender();
    });
  }
  async function artIzbrisi(sifra) {
    var rec = CENIKMAP[sifra]; if (!rec) return;
    var ok = await potrdiModal({ naslov: 'Izbriši artikel', sporocilo: 'Izbrišem artikel „' + (rec.naziv || ('#' + sifra)) + '"? Odstrani se iz kataloga in iz cenikov vseh strank (obnovljivo 30 dni).', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    await sb.from('articles').delete().eq('cena_sifra', sifra);
    await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', sifra);
    if (CLANI) CLANI = CLANI.filter(function (a) { return a.cena_sifra !== sifra; });
    CENIK = CENIK.filter(function (x) { return x.sifra !== sifra; }); zgradiCenikMap();
    logDodaj('Artikli', 'Izbrisano', 'Artikel „' + (rec.naziv || ('#' + sifra)) + '"');
    toast('Artikel izbrisan.'); artRender();
  }
  async function artDodajNov(pre, wrap) {
    if (!wrap) return;
    var nm = wrap.querySelector('.art-nn-nm').value.trim();
    var id = normId(wrap.querySelector('.art-nn-id').value) || (pre + artNextNum(pre));
    var cRaw = wrap.querySelector('.art-nn-cena').value.trim();
    if (!nm) { toast('Vpiši naziv.'); return; }
    if (!veljavenId(id)) { toast('ID mora biti 2 črki + 3 številke.'); return; }
    if (idZaseden(id, null)) { toast('ID ' + id + ' že obstaja.'); return; }
    var cena = cRaw === '' ? 0 : parseFloat(cRaw.replace(',', '.'));
    if (isNaN(cena) || cena < 0) cena = 0;
    var sifra = await naslednjaSifra();
    var rec = { sifra: sifra, koda: id, naziv: nm, em: 'kos', cena1: cena, cena2: cena, org_id: null, sort_order: (CENIK ? CENIK.length : 0) };
    var e = (await sb.from('pricelist').insert(rec)).error;
    if (e) { toast('Napaka: ' + e.message); return; }
    CENIK.push(rec); zgradiCenikMap();
    // PROPAGACIJA: dodaj artikel vsem strankam, ki že uporabljajo to skupino
    var ciljOrgi = (ORGSEZNAM || []).filter(function (o) { return strankaSkupina(o.id) === pre; });
    var dodanih = 0;
    for (var ci = 0; ci < ciljOrgi.length; ci++) {
      var oid = ciljOrgi[ci].id;
      var maxo = -1; (CLANI || []).forEach(function (a) { if (a.org_id === oid && typeof a.sort_order === 'number' && a.sort_order > maxo) maxo = a.sort_order; });
      var ins = await sb.from('articles').insert({ org_id: oid, name: nm, cena_sifra: sifra, sort_order: maxo + 1 }).select('id').maybeSingle();
      if (!(ins && ins.error)) { if (CLANI) CLANI.push({ id: ins && ins.data ? ins.data.id : null, org_id: oid, name: nm, cena_sifra: sifra, sort_order: maxo + 1 }); dodanih++; }
    }
    _artOpen = {}; _artOpen[pre] = true; logDodaj('Artikli', 'Dodano', 'Artikel „' + nm + '" (' + id + ')'); toast('Artikel dodan' + (dodanih ? ' · propagirano ' + dodanih + ' strankam' : '') + '.'); artRender();
  }
  // Modal »Nov cenik (skupina)«. opts.ime = predizpolnjeno ime; opts.onCreated(pre, ime)
  // se pokliče po uspešnem ustvarjanju (če ni podan, osveži pogled Artikli).
  function novCenikModal(opts) {
    opts = opts || {};
    var imeVal = opts.ime ? escape_(opts.ime) : '';
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Nov cenik (skupina)</h4>' +
      '<label class="pris-lab">Ime cenika</label><input type="text" class="nc-ime sc-modal-input" placeholder="npr. Posteljnina" value="' + imeVal + '">' +
      '<label class="pris-lab">Predpona ID <span class="u-sub">(2 črki, npr. PO)</span></label><input type="text" class="nc-pre sc-modal-input" maxlength="2" placeholder="PO" style="text-transform:uppercase;font-family:var(--mono)">' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Ustvari</button></div></div>';
    document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    // Če je ime že predizpolnjeno (npr. iz naziva stranke), skoči na predpono.
    setTimeout(function () { var el = back.querySelector(opts.ime ? '.nc-pre' : '.nc-ime'); if (el) el.focus(); }, 60);
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var ime = back.querySelector('.nc-ime').value.trim();
      var pre = normId(back.querySelector('.nc-pre').value);
      if (!/^[A-ZČŠŽ]{2}$/.test(pre)) { toast('Predpona morata biti 2 črki (npr. PO).'); return; }
      var obst = {}; (CENIK || []).forEach(function (x) { obst[artPrefix(x.koda)] = 1; }); Object.keys(SKUPINE_IME).forEach(function (k) { obst[k] = 1; });
      if (obst[pre]) { toast('Predpona ' + pre + ' že obstaja.'); return; }
      var r = await sb.from('article_groups').upsert({ prefix: pre, name: ime || null, updated_at: new Date().toISOString() }, { onConflict: 'prefix' });
      if (r.error) { toast('Napaka: ' + r.error.message + (/relation|does not exist/i.test(r.error.message) ? ' (poženi migracijo 13_skupine.sql)' : '')); return; }
      if (ime) SKUPINE_IME[pre] = ime;
      zapri();
      if (typeof opts.onCreated === 'function') { opts.onCreated(pre, ime); }
      else { _artOpen = {}; _artOpen[pre] = true; toast('Cenik ustvarjen. Dodaj artikle.'); artRender(); }
    });
  }
  function artNovCenik() { novCenikModal({}); }
  async function artPreimenujSkupino(pre) {
    var novo = await vnesiModal({ naslov: 'Ime skupine ' + pre, sporocilo: 'Prijazno ime skupine (pusti prazno za privzeto »Skupina ' + pre + '«).', privzeto: SKUPINE_IME[pre] || '', placeholder: 'npr. Posteljnina', potrdi: 'Shrani' });
    if (novo === null) return;
    novo = novo.trim();
    var r = await sb.from('article_groups').upsert({ prefix: pre, name: novo || null, updated_at: new Date().toISOString() }, { onConflict: 'prefix' });
    if (r.error) { toast('Napaka: ' + r.error.message + (/relation|does not exist/i.test(r.error.message) ? ' (poženi migracijo 13_skupine.sql)' : '')); return; }
    if (novo) SKUPINE_IME[pre] = novo; else delete SKUPINE_IME[pre];
    toast('Ime skupine shranjeno.'); artRender();
  }
  async function artIzbrisiSkupino(pre) {
    var grupe = artikliGrupe(); var arts = grupe[pre] || []; if (!arts.length) { toast('Skupina je prazna.'); return; }
    var ok = await potrdiModal({ naslov: 'Izbriši skupino ' + pre, sporocilo: 'Izbrišem celo skupino „' + imeSkupine(pre) + '" (' + arts.length + ' artiklov)? Vsi ti artikli se odstranijo iz kataloga in iz cenikov vseh strank. (obnovljivo 30 dni)', potrdi: 'Izbriši skupino', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    toast('Brišem skupino …');
    var sifre = arts.map(function (x) { return x.sifra; });
    var e1 = (await sb.from('articles').delete().in('cena_sifra', sifre)).error;
    if (e1) { toast('Napaka: ' + e1.message); return; }
    var e2 = (await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).in('sifra', sifre)).error;
    if (e2) { toast('Napaka: ' + e2.message); return; }
    try { await sb.from('article_groups').delete().eq('prefix', pre); } catch (e) {}
    var setSif = {}; sifre.forEach(function (s) { setSif[s] = 1; });
    if (CLANI) CLANI = CLANI.filter(function (a) { return !setSif[a.cena_sifra]; });
    CENIK = CENIK.filter(function (x) { return !setSif[x.sifra]; }); zgradiCenikMap();
    delete SKUPINE_IME[pre]; delete _artOpen[pre];
    logDodaj('Artikli', 'Izbrisano', 'Skupina/cenik „' + pre + '" (' + arts.length + ' art.)'); toast('Skupina izbrisana (' + arts.length + ' art.).'); artRender();
  }
  function artDodeli(pre) {
    var grupe = artikliGrupe(); var arts = grupe[pre] || []; var sifre = arts.map(function (x) { return x.sifra; });
    var seznam = (ORGSEZNAM || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'sl'); });
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    var rows = seznam.map(function (o) { var checked = strankaSkupina(o.id) === pre; return '<label class="assign-chk"><input type="checkbox" data-org="' + o.id + '"' + (checked ? ' checked' : '') + '><span>' + escape_(o.name || '') + '</span></label>'; }).join('') || '<p class="u-sub">Ni strank.</p>';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Dodeli skupino ' + escape_(pre) + ' strankam</h4>' +
      '<p class="u-sub" style="margin:-6px 0 12px">Odkljukane stranke dobijo TE artikle — zamenja njihov cenik. Odkljukane, ki so bile v tej skupini, se izpraznijo.</p>' +
      '<div class="art-chk-list">' + rows + '</div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var checks = [].slice.call(back.querySelectorAll('.assign-chk input'));
      zapri(); toast('Posodabljam cenike …');
      try {
        for (var i = 0; i < checks.length; i++) {
          var org = checks[i].dataset.org, wasP = strankaSkupina(org) === pre, isC = checks[i].checked;
          if (isC) await nastaviSkupinoStranki(org, sifre);        // uskladi (doda manjkajoče, popravi vrstni red)
          else if (wasP) await nastaviSkupinoStranki(org, []);     // odstrani skupino
        }
        await naloziClane(true);                                  // uskladi lokalno stanje z bazo (resnica)
        toast('Stranke posodobljene.');
      } catch (e) {
        try { await naloziClane(true); } catch (e2) {}
        toast('Napaka pri shranjevanju: ' + (e && e.message ? e.message : e));
      }
      artRender();
    });
  }
  // Poskrbi, da ima vsaka stranka natanko vse artikle svojega cenika (doda manjkajoče).
  async function artUskladiVse() {
    var ok = await potrdiModal({ naslov: 'Uskladi artikle', sporocilo: 'Vsaki stranki uskladim artikle z njenim cenikom — doda manjkajoče in odstrani odvečne. Nadaljujem?', potrdi: 'Uskladi', preklici: 'Prekliči' });
    if (!ok) return;
    toast('Usklajujem …');
    var grupe = artikliGrupe();
    var dodanih = 0, obdelanih = 0;
    for (var oi = 0; oi < (ORGSEZNAM || []).length; oi++) {
      var org = ORGSEZNAM[oi];
      var pre = strankaSkupina(org.id);
      if (!pre) continue;
      var arts = grupe[pre] || [];
      var sifre = arts.map(function (x) { return x.sifra; });
      var prej = (CLANI || []).filter(function (a) { return a.org_id === org.id && a.cena_sifra != null; }).length;
      try { await nastaviSkupinoStranki(org.id, sifre); } catch (e) {}
      var potem = (CLANI || []).filter(function (a) { return a.org_id === org.id && a.cena_sifra != null; }).length;
      if (potem > prej) dodanih += (potem - prej);
      obdelanih++;
    }
    logDodaj('Artikli', 'Urejeno', 'Uskladitev artiklov (' + obdelanih + ' strank, +' + dodanih + ' artiklov)');
    toast(dodanih ? ('Usklajeno · dodanih ' + dodanih + ' artiklov.') : 'Vse stranke so že usklajene.');
    artRender();
  }

  /* ══════════ UČINKOVITOST (kilaža + produktivnost) ══════════ */
  var UCEN_LISTI = null, UCEN_DOG = null, _ucDan = null, _ucMesec = false;
  var _ucSort = 'kg_desc';   // Evidenca kg: <stolpec>_<smer> — ime_az|ime_za|kg_desc|kg_asc|eur_desc|eur_asc
  var UC_PAL = ['#4e79a7', '#59a14f', '#f28e2b', '#e15759', '#b07aa1', '#76b7b2', '#edc948'];
  var _ucDonutRange = '3m', _uc3dAnim = false, _kgVseMap = null, _uc3dRAF = null, _ucDonutMonth = null, _uc3dTweenFromSegs = null;
  var _ucLestSort = 'desc';   // lestvica kg/uro po dnevih: 'desc' padajoče / 'asc' naraščajoče
  var _ucLestEurSort = 'desc'; // lestvica €/kg po strankah: 'desc' padajoče / 'asc' naraščajoče
  // Prihodek po strankah za OBSEG diagrama (Mesec/3m/Vse) — ločeno od Evidence kg.
  var _ucDonutFak = {}, _ucDonutEurTot = null, _ucDonutEurKg = null, _ucDonutEurKljuc = null, _ucDonutEurLoading = false;
  function ucDonutObdobje() {
    var r = _ucDonutRange;
    if (r === 'mesec') {
      var mk = _ucDonutMonth || danes10().slice(0, 7);
      var y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10);
      var last = new Date(y, m, 0).getDate();
      return { od: mk + '-01', do: mk + '-' + ('0' + last).slice(-2), key: 'M' + mk };
    }
    if (r === 'vse') return { od: '2000-01-01', do: danes10(), key: 'V' };
    var d = new Date(), f = new Date(d.getFullYear(), d.getMonth() - 2, 1);
    return { od: f.getFullYear() + '-' + ('0' + (f.getMonth() + 1)).slice(-2) + '-01', do: danes10(), key: '3M' };
  }
  /* Vrstice lestvice €/kg po strankah — na osnovi OPRANEGA perila v obsegu diagrama.
     kg iz istega vira kot diagram (ucKgObseg), €/kg iz prihodka za isto obdobje. */
  function ucLestEurRows() {
    var o = ucDonutObdobje(), ready = _ucDonutEurKljuc === o.key;
    if (!ready) return '<p class="u-sub" style="padding:10px 2px">Računam prihodek…</p>';
    // Lestvica po SKUPNEM PRIHODKU (€) stranke; pod imenom kg in €/kg kot dodatek.
    var arr = Object.keys(_ucDonutFak).map(function (id) {
      var f = _ucDonutFak[id];
      return { id: id, ime: ORGIME[id] || '—', kg: f.kg, neto: f.neto, eur: (f.kg > 0 ? f.neto / f.kg : null) };
    }).filter(function (x) { return x.neto > 0 || x.kg > 0; });
    if (!arr.length) return '<p class="u-sub" style="padding:10px 2px">Ni podatkov v izbranem obdobju.</p>';
    arr.sort(function (a, b) { return _ucLestEurSort === 'asc' ? a.neto - b.neto : b.neto - a.neto; });
    function eurKg(v) { return v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' €/kg'; }
    return arr.map(function (o2, i) {
      return '<div class="uc-lest-row"><span class="uc-lest-rank">' + (i + 1) + '.</span>' +
        '<span class="uc-lest-dan">' + escape_(o2.ime) + '</span>' +
        '<span class="uc-lest-sub">' + fmtKg(o2.kg) + ' · ' + eurKg(o2.eur) + '</span>' +
        '<b class="uc-lest-v">' + cenaFmt(o2.neto) + '</b></div>';
    }).join('');
  }
  function ucLestEurTot() {
    var o = ucDonutObdobje();
    if (_ucDonutEurKljuc !== o.key || _ucDonutEurTot == null) return '';
    return '<span class="uc-lest-foot-k">Skupni promet</span><b class="uc-lest-foot-v">' + cenaFmt(_ucDonutEurTot) + '</b>';
  }
  async function ucNaloziPrihodekObseg() {
    var o = ucDonutObdobje();
    if (_ucDonutEurKljuc === o.key || _ucDonutEurLoading) return;
    _ucDonutEurLoading = true;
    var m = {}, tot = 0, tn = 0, tk = 0;
    try {
      var res = await fakZberi(o.od, o.do, null);
      if (res && res.skupine) res.skupine.forEach(function (g) {
        m[g.org_id] = { kg: g.kg || 0, neto: (g.neto != null ? g.neto : 0) };
        tot += g.neto || 0; tn += g.neto || 0; tk += g.kg || 0;
      });
    } catch (e) {}
    _ucDonutFak = m; _ucDonutEurTot = tot; _ucDonutEurKg = (tk > 0 ? tn / tk : null);
    _ucDonutEurKljuc = o.key; _ucDonutEurLoading = false;
    var box = $('ucList'), sec = $('sec-statistika');
    if (box && sec && !sec.classList.contains('hidden')) {
      var l = box.querySelector('.uc-lest-eur-list'); if (l) l.innerHTML = ucLestEurRows();
      var t = box.querySelector('.uc-lest-eur-tot'); if (t) t.innerHTML = ucLestEurTot();
      /* Dopolni SAMO stolpec €/kg v Evidenci kg — ne prezidaj kartice, sicer
         prekinemo animacijo tortnega diagrama. */
      var cela = function (v) { return v != null ? cenaFmt(v) : '<span class="u-sub">—</span>'; };
      box.querySelectorAll('.uc-eur[data-org]').forEach(function (td) {
        var f = m[td.getAttribute('data-org')];
        td.innerHTML = cela(f && f.kg > 0 && f.neto != null ? f.neto / f.kg : null);
      });
      var tt = box.querySelector('.uc-eur-tot'); if (tt) tt.innerHTML = cela(_ucDonutEurKg);
    }
  }

  async function naloziUcinek() {
    var meja = danLocal(new Date(Date.now() - 400 * 24 * 3600 * 1000).getTime());
    var rl = await vseVrstice(function (a, b) { return sb.from('delivery_notes').select('id,org_id,doc_date,weight_kg').is('deleted_at', null).gte('doc_date', meja).order('doc_date', { ascending: true }).range(a, b); });
    UCEN_LISTI = (rl && rl.data) ? rl.data : [];
    var rd = await vseVrstice(function (a, b) { return sb.from('att_events').select('id,employee_id,ts,type').gte('ts', meja + 'T00:00:00Z').order('ts', { ascending: true }).range(a, b); });
    UCEN_DOG = (rd && rd.data) ? rd.data : [];
    // Vsota kg po strankah za VES čas (za 3D krog »Vse«).
    try {
      var rv = await vseVrstice(function (a, b) { return sb.from('delivery_notes').select('org_id,weight_kg').is('deleted_at', null).range(a, b); });
      var m = {}; (rv && rv.data ? rv.data : []).forEach(function (l) { if (l.org_id) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); });
      _kgVseMap = m;
    } catch (e) { _kgVseMap = null; }
  }
  // kg po strankah za obseg 3D kroga: '3m', 'vse' ali 'mesec' (izbran mesec).
  function ucKgObseg(range) {
    if (range === 'vse') return _kgVseMap || ucKgMesecev(3);
    if (range === 'mesec') { var mk = _ucDonutMonth || danes10().slice(0, 7); var m = {}; (UCEN_LISTI || []).forEach(function (l) { if (l.doc_date && l.doc_date.slice(0, 7) === mk) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); }); return m; }
    return ucKgMesecev(3);
  }
  function ucKgMesecev(nMes) {
    var d = new Date(); var floor = new Date(d.getFullYear(), d.getMonth() - (nMes - 1), 1);
    var fk = floor.getFullYear() + '-' + ('0' + (floor.getMonth() + 1)).slice(-2) + '-01';
    var m = {};
    (UCEN_LISTI || []).forEach(function (l) { if (l.doc_date && l.doc_date.slice(0, 10) >= fk) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); });
    return m;
  }
  function ucKgPoStranki(kljuc) {
    var m = {};
    (UCEN_LISTI || []).forEach(function (l) { if (l.doc_date && l.doc_date.slice(0, kljuc.length) === kljuc) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); });
    return m;
  }
  // Napis obdobja, ki velja za CELO stran Statistika (izbirnik Mesec / 3 meseci / Vse).
  function ucObdobjeLbl() {
    if (_ucDonutRange === 'vse') return 'ves čas';
    if (_ucDonutRange === 'mesec') return ucMesecIme(_ucDonutMonth || danes10().slice(0, 7));
    return 'zadnji 3 meseci';
  }
  // Skupni vir podatkov za Evidenco kg (tabela + izvoz): kg + €/kg po strankah.
  //
  // Prej je imela Evidenca svoj izbirnik obdobja (Dan/Mesec/Vse) in svoje branje
  // prihodka. Dve obdobji na eni strani sta se razhajali in ni bilo razvidno, katero
  // velja za katero številko. Odslej velja eno samo — tisto iz glave strani:
  // kilaža iz ucKgObseg (isti vir kot tortni diagram in stolpčni graf), €/kg pa iz
  // istega izračuna prihodka kot lestvica »Promet po strankah«.
  function ucEvidencaData() {
    var o = ucDonutObdobje();
    var mapK = ucKgObseg(_ucDonutRange) || {};
    var obKratko = _ucDonutRange === 'vse' ? 'vse' : (_ucDonutRange === 'mesec' ? (_ucDonutMonth || danes10().slice(0, 7)) : '3m');
    var eurReady = _ucDonutEurKljuc === o.key;
    var arr = Object.keys(mapK).map(function (id) {
      var f = eurReady ? _ucDonutFak[id] : null;
      return {
        id: id, ime: ORGIME[id] || '—', kg: mapK[id],
        eur: (f && f.kg > 0 && f.neto != null) ? f.neto / f.kg : null
      };
    }).filter(function (x) { return x.kg > 0; });
    var del = String(_ucSort || 'kg_desc').split('_'), kol = del[0], smer = del[1];
    arr.sort(function (a, b) {
      if (kol === 'ime') { var c = String(a.ime).localeCompare(String(b.ime), 'sl', { sensitivity: 'base' }); return smer === 'za' ? -c : c; }
      // Stranke brez izračunanega €/kg gredo na konec OBEH smeri: »ni podatka«
      // ni isto kot »najceneje«, prej pa je pri naraščajočem vodila prav ta skupina.
      if (kol === 'eur') {
        if (a.eur == null || b.eur == null) return (a.eur == null ? 1 : 0) - (b.eur == null ? 1 : 0);
        return smer === 'asc' ? a.eur - b.eur : b.eur - a.eur;
      }
      return smer === 'asc' ? a.kg - b.kg : b.kg - a.kg;
    });
    var kgSkup = arr.reduce(function (s, x) { return s + x.kg; }, 0);
    return {
      arr: arr, kgSkup: kgSkup, eurReady: eurReady,
      eurTot: (eurReady ? _ucDonutEurKg : null),
      obLabel: ucObdobjeLbl(), obKratko: obKratko, ekljuc: o.key
    };
  }
  function ucUreSek(kljuc) {
    var byEmp = {};
    (UCEN_DOG || []).forEach(function (d) { if (d.ts.slice(0, kljuc.length) === kljuc) (byEmp[d.employee_id] = byEmp[d.employee_id] || []).push(d); });
    var sek = 0;
    Object.keys(byEmp).forEach(function (eid) {
      var evs = byEmp[eid].sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }); var odprt = null;
      evs.forEach(function (d) { if (d.type === 'in') { if (!odprt) odprt = d; } else if (d.type === 'out') { if (odprt) { sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } } });
    });
    return sek;
  }
  // ── Stolpčni graf se ravna po izbirniku obdobja na vrhu strani ─────────
  // Gostota se prilagodi: mesec → dnevi, 3 meseci → tedni, vse → meseci.
  function _ucK(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function _ucMesLab(mk) { var m = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']; return m[+mk.slice(5, 7) - 1] + ' ' + mk.slice(2, 4); }
  function ucBarsGostota(n) { return { gap: n <= 14 ? 12 : (n <= 24 ? 6 : 3) }; }
  // Napisi se izrišejo VSI, nato jih po dejanski meritvi toliko skrijemo, da se
  // preostali ne prekrivajo — fiksni korak tega ne zna, ker ob izrisu širine
  // kartice še ne poznamo.
  var _barsFitT = null;
  window.addEventListener('resize', function () {
    clearTimeout(_barsFitT);
    _barsFitT = setTimeout(function () { try { ucBarsFit(document); } catch (e) {} }, 150);
  });
  // Napis je celica mreže in se razpotegne čez ves stolpec, zato scrollWidth vrne
  // ŠIRINO STOLPCA, ne besedila — po njem je bil korak skoraj vedno 2, razmiki pa
  // neenakomerni. Tule izmerimo besedilo samo.
  function _barsTxtW(e) {
    try {
      var r = document.createRange();
      r.selectNodeContents(e);
      var w = r.getBoundingClientRect().width;
      return w > 0 ? w : e.scrollWidth;
    } catch (_) { return e.scrollWidth; }
  }
  var BARS_RAZMIK = 10;   // najmanjši vodoravni presledek med sosednjima napisoma (px)
  var _barsFitCakaPisave = false;
  function ucBarsFit(scope) {
    var rows = (scope || document).querySelectorAll('.bars-row');
    // Archivo se naloži šele po prvem izrisu. Dokler teče nadomestna pisava, so
    // črke drugače široke in meritev besedila zgreši — pri grafu po tednih je
    // ostal en sam napis od štirinajstih. Zato po naloženih pisavah izmerimo še
    // enkrat; takrat je status 'loaded' in se to ne ponovi.
    if (!_barsFitCakaPisave && document.fonts && document.fonts.status !== 'loaded') {
      _barsFitCakaPisave = true;
      try { document.fonts.ready.then(function () { try { ucBarsFit(document); } catch (e) {} }); } catch (e) {}
    }
    [].forEach.call(rows, function (row) {
      var cols = [].slice.call(row.querySelectorAll('.bars-col'));
      // Brez širine (skrit razdelek) bi bila meritev napačna in bi poskrili vse.
      if (!cols.length || !row.clientWidth) return;
      var colW = row.clientWidth / cols.length;
      ['.bars-lab', '.bars-val'].forEach(function (sel) {
        var els = cols.map(function (c) { return c.querySelector(sel); }).filter(Boolean);
        if (!els.length) return;
        els.forEach(function (e) { e.style.visibility = ''; });
        var w = 1;
        els.forEach(function (e) { if (e.textContent.trim()) { var t = _barsTxtW(e); if (t > w) w = t; } });
        var step = Math.max(1, Math.ceil((w + BARS_RAZMIK) / Math.max(colW, 1)));
        if (step === 1) return;
        // Zadnji stolpec je koristen (konec obdobja), a le če se ne zlepi s prejšnjim
        // prikazanim — prav zaradi tega sta se prej dotikala »367« in »—«.
        var zadnji = els.length - 1;
        var zadnjiPoKoraku = Math.floor(zadnji / step) * step;
        var kaziZadnjega = (zadnji - zadnjiPoKoraku) * colW >= w + BARS_RAZMIK;
        els.forEach(function (e, i) {
          var kaze = (i % step === 0) || (i === zadnji && kaziZadnjega);
          if (!kaze) e.style.visibility = 'hidden';
        });
      });
    });
  }
  function ucSerija(range) {
    var rows = [], naslov = '', idx = {};
    if (range === 'mesec') {
      var mk = _ucDonutMonth || danes10().slice(0, 7);
      var dni = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
      for (var i = 1; i <= dni; i++) { var k = mk + '-' + ('0' + i).slice(-2); rows.push({ key: k, lab: String(i), kg: 0, opis: datum(k) }); }
      rows.forEach(function (o) { idx[o.key] = o; });
      (UCEN_LISTI || []).forEach(function (l) { var kk = l.doc_date && l.doc_date.slice(0, 10); if (idx[kk]) idx[kk].kg += (parseFloat(l.weight_kg) || 0); });
      naslov = 'kg po dnevih · ' + ucMesecIme(mk);
    } else if (range === 'vse') {
      var kljuci = (UCEN_LISTI || []).map(function (l) { return l.doc_date ? l.doc_date.slice(0, 7) : null; }).filter(Boolean).sort();
      if (!kljuci.length) return { rows: [], naslov: 'kg po mesecih · ves čas' };
      var kon = kljuci[kljuci.length - 1], cy = +kljuci[0].slice(0, 4), cm = +kljuci[0].slice(5, 7);
      while (cy * 12 + cm <= +kon.slice(0, 4) * 12 + +kon.slice(5, 7)) {
        var mk2 = cy + '-' + ('0' + cm).slice(-2);
        rows.push({ key: mk2, lab: _ucMesLab(mk2), kg: 0, opis: ucMesecIme(mk2) });
        cm++; if (cm > 12) { cm = 1; cy++; }
      }
      rows.forEach(function (o) { idx[o.key] = o; });
      (UCEN_LISTI || []).forEach(function (l) { var km = l.doc_date && l.doc_date.slice(0, 7); if (idx[km]) idx[km].kg += (parseFloat(l.weight_kg) || 0); });
      naslov = 'kg po mesecih · ves čas';
    } else {
      var d = new Date(), fl = new Date(d.getFullYear(), d.getMonth() - 2, 1);
      var st = new Date(fl); st.setDate(st.getDate() - ((st.getDay() + 6) % 7));
      for (var c = new Date(st); c <= d; c.setDate(c.getDate() + 7)) {
        var k1 = _ucK(c), e = new Date(c); e.setDate(e.getDate() + 6);
        rows.push({ key: k1, kon: _ucK(e), lab: ('0' + c.getDate()).slice(-2) + '.' + ('0' + (c.getMonth() + 1)).slice(-2) + '.', kg: 0, opis: 'teden ' + datum(k1) + ' – ' + datum(_ucK(e)) });
      }
      (UCEN_LISTI || []).forEach(function (l) {
        var kd = l.doc_date && l.doc_date.slice(0, 10); if (!kd) return;
        for (var j = rows.length - 1; j >= 0; j--) { if (kd >= rows[j].key && kd <= rows[j].kon) { rows[j].kg += (parseFloat(l.weight_kg) || 0); break; } }
      });
      naslov = 'kg po tednih · zadnji 3 meseci';
    }
    return { rows: rows, naslov: naslov };
  }
  function ucUreSekObseg(range) {
    if (range === 'mesec') return ucUreSek(_ucDonutMonth || danes10().slice(0, 7));
    if (range === 'vse') return ucUreSek('');
    var d = new Date(), fl = new Date(d.getFullYear(), d.getMonth() - 2, 1);
    return ucUreSekOd(_ucK(fl));
  }
  function ucUreSekOd(odKljuc) {
    var byEmp = {};
    (UCEN_DOG || []).forEach(function (d) { if (d.ts.slice(0, 10) >= odKljuc) (byEmp[d.employee_id] = byEmp[d.employee_id] || []).push(d); });
    var sek = 0;
    Object.keys(byEmp).forEach(function (eid) {
      var evs = byEmp[eid].sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }); var odprt = null;
      evs.forEach(function (d) { if (d.type === 'in') { if (!odprt) odprt = d; } else if (d.type === 'out') { if (odprt) { sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } } });
    });
    return sek;
  }
  function ucMesecIme(mk) { var p = mk.split('-'); var mes = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december']; return (mes[parseInt(p[1], 10) - 1] || '') + ' ' + p[0]; }
  // Lestvica kg/uro po dnevih izbranega meseca (samo dnevi z opranim in odprtimi urami).
  function ucKgUroPoDnevih(mk) {
    var dni = {};
    (UCEN_LISTI || []).forEach(function (l) { var k = l.doc_date && l.doc_date.slice(0, 10); if (k && k.slice(0, 7) === mk) dni[k] = (dni[k] || 0) + (parseFloat(l.weight_kg) || 0); });
    var out = [];
    Object.keys(dni).forEach(function (k) { var kg = dni[k]; var ure = ucUreSek(k) / 3600; if (ure > 0 && kg > 0) out.push({ dan: k, kg: kg, ure: ure, kgh: kg / ure }); });
    return out;
  }
  function danKratek(iso) { var p = String(iso).split('-'); return p.length === 3 ? (parseInt(p[2], 10) + '. ' + parseInt(p[1], 10) + '.') : iso; }
  function fmtStevilo1(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function ucDonut(map) {
    var arr = Object.keys(map).map(function (id) { return { ime: ORGIME[id] || '—', kg: map[id] }; }).filter(function (x) { return x.kg > 0; }).sort(function (a, b) { return b.kg - a.kg; });
    var total = arr.reduce(function (s, x) { return s + x.kg; }, 0);
    if (!total) return '<p class="u-sub" style="padding:8px 0">Ni podatkov za izbrano obdobje.</p>';
    var segs = arr.slice(0, 7).map(function (x, i) { return { ime: x.ime, kg: x.kg, col: UC_PAL[i % UC_PAL.length] }; });
    var ostalo = arr.slice(7).reduce(function (s, x) { return s + x.kg; }, 0);
    if (ostalo > 0) segs.push({ ime: 'Ostalo', kg: ostalo, col: '#bab0ac' });
    var r = 52, cx = 60, cy = 60, sw = 20, C = 2 * Math.PI * r, off = 0, circles = '';
    segs.forEach(function (s) { var len = s.kg / total * C; circles += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.col + '" stroke-width="' + sw + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>'; off += len; });
    var svg = '<svg viewBox="0 0 120 120" width="116" height="116" class="uc-donut">' + circles + '</svg>';
    var leg = segs.map(function (s) { return '<div class="uc-leg"><span class="uc-dot" style="background:' + s.col + '"></span><span class="uc-leg-nm">' + escape_(s.ime) + '</span><span class="uc-leg-v">' + Math.round(s.kg / total * 100) + ' %</span></div>'; }).join('');
    return '<div class="uc-donut-wrap">' + svg + '<div class="uc-leg-list">' + leg + '</div></div>';
  }
  /* ══════════ 3D KROG: delež kg po strankah (z napisi na črtah) ══════════ */
  function _mixHex(hex, f) { // f: 0=črno, 1=barva
    var h = hex.replace('#', ''); var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function ucDonutSegs(range) {
    var map = ucKgObseg(range) || {};
    var arr = Object.keys(map).map(function (id) { return { ime: ORGIME[id] || '—', kg: map[id] }; }).filter(function (x) { return x.kg > 0; }).sort(function (a, b) { return b.kg - a.kg; });
    var total = arr.reduce(function (s, x) { return s + x.kg; }, 0);
    if (!total) return { segs: [], total: 0 };
    // Deli pod 4 % (in vse čez 7 največjih) se združijo v »Ostalo«.
    var veliki = arr.filter(function (x) { return x.kg / total >= 0.04; }).slice(0, 7);
    var segs = veliki.map(function (x, i) { return { ime: x.ime, kg: x.kg, col: UC_PAL[i % UC_PAL.length] }; });
    var ostalo = total - segs.reduce(function (s, x) { return s + x.kg; }, 0);
    if (ostalo > 0.0001) segs.push({ ime: 'Ostalo', kg: ostalo, col: '#8a9099' });
    return { segs: segs, total: total };
  }
  var _UC3D = { W: 580, H: 384, cx: 290, cy: 196, R: 150, r: 86, depth: 46 };
  var _UC3D_NEUTRAL = [91, 101, 112];               // #5b6570 — siva za začetni obroč
  function _uc3dPt(rad, ang, ky, cx, cy) { return [cx + rad * Math.cos(ang), cy + rad * ky * Math.sin(ang)]; }
  function _f2(a) { return a[0].toFixed(1) + ' ' + a[1].toFixed(1); }
  function _uc3dHx(hex) { var h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function _uc3dScale(rgb, f) { return 'rgb(' + Math.round(rgb[0] * f) + ',' + Math.round(rgb[1] * f) + ',' + Math.round(rgb[2] * f) + ')'; }
  function _uc3dBlend(c1, c2, t) { return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t]; }
  function _uc3dEio(x) { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function _uc3dEoc(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  function _uc3dSub(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }
  /* progres 0..1 → parametri koreografije: krog → razdelitev → barvanje+napisi → nagib v 3D */
  function _uc3dFrame(e) {
    // Postopna, dodelana animacija: 1) barve se napolnijo, 2) obroč se nagne v 3D,
    // 3) napisi (leader lines) se pojavijo NAZADNJE — vsak korak s svojim easingom.
    var pColor = _uc3dEoc(_uc3dSub(e, 0.08, 0.40));
    var pTilt = _uc3dEio(_uc3dSub(e, 0.34, 0.82));
    var pLab = _uc3dEoc(_uc3dSub(e, 0.74, 1.0));
    return { cmix: pColor, ky: 1 - (1 - 0.55) * pTilt, depth: _UC3D.depth * pTilt, labo: pLab, rot: pTilt * 0.08 };
  }
  function uc3dSvgBuild(segs, total, e, opts) {
    opts = opts || {};
    var P = _uc3dFrame(e);
    var G = _UC3D, cx = G.cx, cy = G.cy, R = G.R, r = G.r;
    var ky = P.ky, depth = P.depth, cmix = P.cmix, labo = P.labo, rot = P.rot || 0;
    var start = -Math.PI / 2 + rot, arr = [], a = start;
    segs.forEach(function (s) { var ang = s.kg / total * Math.PI * 2; arr.push({ s: s, a0: a, a1: a + ang, mid: a + ang / 2 }); a += ang; });
    // Poln obroč: deli se STIKAJO (brez rež). Stene se rišejo po vidljivosti —
    // ZUNANJA le na sprednjem loku (sin>0), NOTRANJA le na zadnjem loku (sin<0, skozi luknjo).
    function pathP(d, col, i) { return '<path class="uc3d-p" data-i="' + i + '" d="' + d + '" fill="' + col + '"/>'; }
    function topFace(a0, a1, col, i) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var o0 = _uc3dPt(R, a0, ky, cx, cy), o1 = _uc3dPt(R, a1, ky, cx, cy), i1 = _uc3dPt(r, a1, ky, cx, cy), i0 = _uc3dPt(r, a0, ky, cx, cy);
      return pathP('M' + _f2(o0) + ' A' + R + ' ' + (R * ky).toFixed(1) + ' 0 ' + large + ' 1 ' + _f2(o1) +
        ' L' + _f2(i1) + ' A' + r + ' ' + (r * ky).toFixed(1) + ' 0 ' + large + ' 0 ' + _f2(i0) + ' Z', col, i);
    }
    function bandWall(rad, a0, a1, col, i) {         // navpična stena med lokom (rad) in istim lokom, spuščenim za depth
      var large = (a1 - a0) > Math.PI ? 1 : 0, rr = (rad * ky).toFixed(1);
      var p0 = _uc3dPt(rad, a0, ky, cx, cy), p1 = _uc3dPt(rad, a1, ky, cx, cy), b1 = [p1[0], p1[1] + depth], b0 = [p0[0], p0[1] + depth];
      return pathP('M' + _f2(p0) + ' A' + rad + ' ' + rr + ' 0 ' + large + ' 1 ' + _f2(p1) +
        ' L' + _f2(b1) + ' A' + rad + ' ' + rr + ' 0 ' + large + ' 0 ' + _f2(b0) + ' Z', col, i);
    }
    // Razdeli lok na podloke ob prehodih skozi horizont (večkratniki π), da je vsak povsem spredaj ali zadaj.
    function subArcs(a0, a1) {
      var pts = [a0], x = Math.ceil(a0 / Math.PI) * Math.PI;
      for (; x < a1; x += Math.PI) { if (x > a0 + 1e-6 && x < a1 - 1e-6) pts.push(x); }
      pts.push(a1);
      var segs2 = [];
      for (var k = 1; k < pts.length; k++) segs2.push([pts[k - 1], pts[k]]);
      return segs2;
    }
    var backW = [], tops = [], frontW = [];   // globalno slojenje: zadnje notranje stene → vrhi → sprednje zunanje stene
    arr.forEach(function (o, i) {
      var base = _uc3dBlend(_UC3D_NEUTRAL, _uc3dHx(o.s.col), cmix);
      var topC = _uc3dScale(base, 1), outC = _uc3dScale(base, 0.72), inC = _uc3dScale(base, 0.5);
      if (depth > 0.5) {
        subArcs(o.a0, o.a1).forEach(function (sa) {
          var spredaj = Math.sin((sa[0] + sa[1]) / 2) > 0;
          if (spredaj) frontW.push(bandWall(R, sa[0], sa[1], outC, i));   // zunanja stena spredaj
          else backW.push(bandWall(r, sa[0], sa[1], inC, i));            // notranja stena zadaj (skozi luknjo)
        });
      }
      tops.push(topFace(o.a0, o.a1, topC, i));
    });
    // Nepremični »hit« sloj (prosojen vrh) — hover se lovi TU, da se pot pod miško
    // ne premakne (drugače je hover glitchy: enter/leave zanka). Vizualne poti so pointer-events:none.
    var hits = arr.map(function (o, i) {
      var large = (o.a1 - o.a0) > Math.PI ? 1 : 0;
      var o0 = _uc3dPt(R, o.a0, ky, cx, cy), o1 = _uc3dPt(R, o.a1, ky, cx, cy), i1 = _uc3dPt(r, o.a1, ky, cx, cy), i0 = _uc3dPt(r, o.a0, ky, cx, cy);
      var d = '<path class="uc3d-hit" data-i="' + i + '" fill="transparent" d="M' + _f2(o0) + ' A' + R + ' ' + (R * ky).toFixed(1) + ' 0 ' + large + ' 1 ' + _f2(o1) +
        ' L' + _f2(i1) + ' A' + r + ' ' + (r * ky).toFixed(1) + ' 0 ' + large + ' 0 ' + _f2(i0) + ' Z"/>';
      // Pokrij tudi navpične stene (3D rob) — sicer se hover na robu ploskve ne sproži
      // in ob prehodu vrh↔stena utripa. Ista data-i → isti segment.
      if (depth > 0.5) {
        subArcs(o.a0, o.a1).forEach(function (sa) {
          var spredaj = Math.sin((sa[0] + sa[1]) / 2) > 0;
          var rad = spredaj ? R : r, lw = (sa[1] - sa[0]) > Math.PI ? 1 : 0, rr = (rad * ky).toFixed(1);
          var p0 = _uc3dPt(rad, sa[0], ky, cx, cy), p1 = _uc3dPt(rad, sa[1], ky, cx, cy), b1 = [p1[0], p1[1] + depth], b0 = [p0[0], p0[1] + depth];
          d += '<path class="uc3d-hit" data-i="' + i + '" fill="transparent" d="M' + _f2(p0) + ' A' + rad + ' ' + rr + ' 0 ' + lw + ' 1 ' + _f2(p1) +
            ' L' + _f2(b1) + ' A' + rad + ' ' + rr + ' 0 ' + lw + ' 0 ' + _f2(b0) + ' Z"/>';
        });
      }
      return d;
    }).join('');
    var segOut = [backW.join('') + tops.join('') + frontW.join('') + hits];
    // napisi na črtah (leader lines) — levo/desno, brez prekrivanja
    var labels = '';
    if (labo > 0.01 && !opts.hideLabels) {
      var right = [], left = [];
      arr.forEach(function (o, i) {
        var mid = o.mid;
        var p = _uc3dPt(R, mid, ky, cx, cy), e1 = _uc3dPt(R + 18, mid, ky, cx, cy);
        var desno = Math.cos(mid) >= 0;
        (desno ? right : left).push({ o: o, i: i, p: p, e1: e1, y: e1[1] });
      });
      // Elegantna pojavitev OD LEVE PROTI DESNI: zamik po x-poziciji pike na diagramu.
      if (opts.sweep) {
        right.concat(left).slice().sort(function (a, b) { return a.p[0] - b.p[0]; })
          .forEach(function (it, k) { it._d = 110 + k * 85; });
      }
      function razporedi(list, xEdge, desno) {
        list.sort(function (a, b) { return a.y - b.y; });
        var minGap = 56;
        for (var i = 1; i < list.length; i++) if (list[i].y - list[i - 1].y < minGap) list[i].y = list[i - 1].y + minGap;
        var over = list.length ? (list[list.length - 1].y - (G.H - 16)) : 0;
        if (over > 0) list.forEach(function (it) { it.y -= over; });
        var out = '';
        // Napisi pripeti na SKRAJNI rob (desni/levi), poravnani; vodilna črta se konča
        // z RAVNIM vodoravnim odsekom do roba, napis stoji tik nad njim (brez »kota«).
        var elbow = desno ? (xEdge - 50) : (xEdge + 50);
        var anchor = desno ? 'end' : 'start';
        list.forEach(function (it) {
          var yy = Math.max(30, it.y), pct = Math.round(it.o.s.kg / total * 100);
          out += '<g class="uc3d-lab' + (opts.sweep ? ' sweep' : '') + '" data-i="' + it.i + '"' + (opts.sweep ? ' style="--d:' + (it._d || 0) + 'ms"' : '') + '>';
          // Vodilna črta in pika OSTANETA pri svoji barvi (se NE povečata ob hoverju).
          out += '<polyline class="uc3d-lead" points="' + it.p[0].toFixed(1) + ',' + it.p[1].toFixed(1) + ' ' + it.e1[0].toFixed(1) + ',' + it.e1[1].toFixed(1) + ' ' + elbow.toFixed(1) + ',' + yy.toFixed(1) + ' ' + xEdge.toFixed(1) + ',' + yy.toFixed(1) + '"/>';
          out += '<circle cx="' + it.p[0].toFixed(1) + '" cy="' + it.p[1].toFixed(1) + '" r="2.6" fill="' + it.o.s.col + '"/>';
          // Samo besedilo se ob hoverju rahlo poveča (ločena skupina).
          out += '<g class="uc3d-lab-txt">';
          out += '<text x="' + xEdge.toFixed(1) + '" y="' + (yy - 24).toFixed(1) + '" text-anchor="' + anchor + '" class="uc3d-nm">' + escape_(it.o.s.ime) + '</text>';
          out += '<text x="' + xEdge.toFixed(1) + '" y="' + (yy - 6).toFixed(1) + '" text-anchor="' + anchor + '" class="uc3d-pct">' + pct + ' %</text>';
          out += '</g></g>';
        });
        return out;
      }
      labels = '<g class="' + (opts.labFade ? 'uc3d-labfade' : '') + '" style="opacity:' + labo.toFixed(2) + '">' + razporedi(right, G.W + 96, true) + razporedi(left, -96, false) + '</g>';
    }
    return segOut.join('') + labels;
  }
  /* hover: segment se NE premika — obroби se s črto in rahlo posvetli/potemni (glede na temo). */
  function uc3dHover(svgEl) {
    if (!svgEl) return;
    function set(i, on) {
      svgEl.querySelectorAll('.uc3d-p[data-i="' + i + '"]').forEach(function (el) {
        el.classList.toggle('hot', on);
      });
      svgEl.querySelectorAll('.uc3d-lab[data-i="' + i + '"]').forEach(function (el) {
        // Besedilo se NE poveča — samo rahlo poudari (barva/debelina) prek CSS .hot.
        el.classList.toggle('hot', on);
      });
    }
    svgEl.querySelectorAll('.uc3d-hit').forEach(function (el) {
      var i = el.getAttribute('data-i');
      el.addEventListener('mouseenter', function () { set(i, true); });
      el.addEventListener('mouseleave', function () { set(i, false); });
    });
  }
  function uc3dAnimate(svgEl, range, animate) {
    if (!svgEl) return;
    if (_uc3dRAF) { cancelAnimationFrame(_uc3dRAF); _uc3dRAF = null; }
    var d = ucDonutSegs(range);
    if (!d.total) { svgEl.innerHTML = '<text x="' + (_UC3D.W / 2) + '" y="' + (_UC3D.H / 2) + '" text-anchor="middle" class="uc3d-nm">Ni podatkov za izbrano obdobje.</text>'; return; }
    var reduce = false; try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
    if (!animate || reduce) { try { svgEl.style.opacity = ''; svgEl.style.transform = ''; svgEl.style.transition = ''; } catch (e) {} svgEl.innerHTML = uc3dSvgBuild(d.segs, d.total, 1); uc3dHover(svgEl); return; }
    // Nežen vstop: cel diagram se rahlo pojavi in zraste.
    try {
      svgEl.style.transformOrigin = '50% 56%'; svgEl.style.opacity = '0'; svgEl.style.transform = 'scale(.965)';
      svgEl.style.transition = 'opacity .55s ease, transform .7s cubic-bezier(.22,.61,.36,1)';
      requestAnimationFrame(function () { svgEl.style.opacity = '1'; svgEl.style.transform = 'none'; });
    } catch (e) {}
    var t0 = 0, dur = 1600;
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      if (p < 1) {
        // Med sestavljanjem obroča napisov NE rišemo — pojavijo se šele nato, od leve proti desni.
        svgEl.innerHTML = uc3dSvgBuild(d.segs, d.total, p, { hideLabels: true });
        _uc3dRAF = requestAnimationFrame(frame);
      } else {
        _uc3dRAF = null;
        svgEl.innerHTML = uc3dSvgBuild(d.segs, d.total, 1, { sweep: true });   // napisi zaplavajo od leve proti desni
        uc3dHover(svgEl);
      }
    }
    _uc3dRAF = requestAnimationFrame(frame);
  }
  // Ob menjavi obdobja (mesec/3m/vse ali izbira meseca) NE gradimo obroča znova —
  // le PREOBLIKUJEMO obstoječega: deleži (širine) in napisi/odstotki se tekoče
  // zmanjšajo/povečajo iz starega v novo stanje. Obroč ostane ves čas v 3D.
  function uc3dTween(svgEl, from, to, dur) {
    if (!svgEl) return;
    if (_uc3dRAF) { cancelAnimationFrame(_uc3dRAF); _uc3dRAF = null; }
    var toSegs = (to && to.segs) || [], toTotal = (to && to.total) || 0;
    var fromSegs = (from && from.segs) || [], fromTotal = (from && from.total) || 0;
    var reduce = false; try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
    if (!toTotal) { svgEl.innerHTML = uc3dSvgBuild([], 0, 1); return; }
    if (!fromTotal || reduce) { svgEl.innerHTML = uc3dSvgBuild(toSegs, toTotal, 1); uc3dHover(svgEl); return; }
    // Poravnava po mestu (barve so itak po rangu): mesto i se preoblikuje iz starega v novi delež.
    var n = Math.max(fromSegs.length, toSegs.length), slots = [];
    for (var i = 0; i < n; i++) {
      var f = fromSegs[i], t = toSegs[i];
      slots.push({ ime: (t ? t.ime : (f ? f.ime : '')), col: (t ? t.col : (f ? f.col : '#8a9099')), k0: f ? f.kg : 0, k1: t ? t.kg : 0 });
    }
    var t0 = 0, D = dur || 620;
    function ease(x) { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / D), e = ease(p);
      var segs = [], total = 0;
      slots.forEach(function (s) { var kg = s.k0 + (s.k1 - s.k0) * e; if (kg > 0.00001) { segs.push({ ime: s.ime, kg: kg, col: s.col }); total += kg; } });
      if (total <= 0) total = 1;
      // Med preoblikovanjem napise SKRIJEMO (sicer se postavitev vsak okvir premešča → »glitch«);
      // rezine se gladko spreminjajo, napisi se čisto pojavijo šele na koncu.
      svgEl.innerHTML = uc3dSvgBuild(segs, total, 1, { hideLabels: true });
      if (p < 1) { _uc3dRAF = requestAnimationFrame(frame); }
      else { _uc3dRAF = null; svgEl.innerHTML = uc3dSvgBuild(toSegs, toTotal, 1, { labFade: true }); uc3dHover(svgEl); }
    }
    _uc3dRAF = requestAnimationFrame(frame);
  }
  // Odtis podatkov Statistike: ali se je po osvežitvi v ozadju kaj spremenilo.
  function ucOdtis() {
    var kg = 0; (UCEN_LISTI || []).forEach(function (l) { kg += parseFloat(l.weight_kg) || 0; });
    var vse = 0; if (_kgVseMap) Object.keys(_kgVseMap).forEach(function (k) { vse += _kgVseMap[k] || 0; });
    var dog = UCEN_DOG || [];
    return [(UCEN_LISTI || []).length, Math.round(kg * 100), dog.length, dog.length ? dog[dog.length - 1].id : '', Math.round(vse * 100)].join('|');
  }
  async function risiUcinek(prefetch) {
    var box = $('ucList'); if (!box) return;
    // Podatki so že naloženi (prednalaganje ob prijavi ali prejšnji obisk): diagram nariši in
    // animiraj TAKOJ, sveže podatke naloži v ozadju. Prej se je ob vsakem odprtju čakalo na
    // bazo in diagrama za trenutek sploh ni bilo.
    if (!prefetch && box.dataset.loaded) {
      if (!_ucDan) _ucDan = danes10();
      _uc3dAnim = true; ucRender();
      try {
        var prej = ucOdtis();
        await naloziUcinek();
        if (ucOdtis() !== prej) { _uc3dAnim = false; ucRender(); }   // spremembe pokaži brez ponovne animacije
      } catch (e) {}
      return;
    }
    // Prepreči »najprej final, nato animacija«: ob ODPRTJU sinhrono zbriši morebitni že
    // prednaloženi (končni) diagram, da se med čakanjem na podatke ne izriše in nato reset.
    if (!prefetch) { var _pre = box.querySelector('.uc3d-svg'); if (_pre) _pre.innerHTML = ''; }
    pokaziNalaganje(box);
    try {
      await naloziUcinek();
      if (!_ucDan) _ucDan = danes10();
      _uc3dAnim = !prefetch;   // med prednalaganjem (skrito) NE animiramo; animira se šele ob odprtju
      ucRender();
      box.dataset.loaded = '1';
    } catch (e) { if (!box.dataset.loaded) box.innerHTML = '<div class="uc-card"><p class="u-sub">Napaka pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>'; }
  }
  function ucRender() {
    var box = $('ucList'); if (!box) return;
    var _sy = window.scrollY;
    if (!_ucDonutMonth) _ucDonutMonth = danes10().slice(0, 7);
    var mesecKljuc = _ucDan.slice(0, 7);   // še vedno za lestvico kg/uro po dnevih
    // »Skupna učinkovitost« se ravna po izbirniku obdobja na vrhu strani.
    // Prej je brala _ucDan — to je stanje razdelka Evidenca kg, ne te glave.
    var mapMon = ucKgObseg(_ucDonutRange) || {};
    var kgMon = Object.keys(mapMon).reduce(function (s, k) { return s + mapMon[k]; }, 0);
    var ureMon = ucUreSekObseg(_ucDonutRange) / 3600;
    var kgh = ureMon > 0 ? kgMon / ureMon : 0;
    var ser = ucSerija(_ucDonutRange);
    var naj = Math.max.apply(null, ser.rows.map(function (o) { return o.kg; }).concat([1]));
    var gost = ucBarsGostota(ser.rows.length);

    var rangeLbl = _ucDonutRange === 'vse' ? 'ves čas' : (_ucDonutRange === 'mesec' ? ucMesecIme(_ucDonutMonth) : 'zadnji 3 meseci');
    var mesecInput = _ucDonutRange === 'mesec' ? '<input type="month" id="ucDonutMesec" class="uc-d3-month" value="' + escape_(_ucDonutMonth) + '">' : '';
    // Glava strani Statistika: en sam izbirnik obdobja (Mesec / 3 meseci / Vse) na vrhu.
    var rangeTabs = '<span class="pris-tabs">' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === 'mesec' ? ' on' : '') + '" data-ucrange="mesec">Mesec</button>' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === '3m' ? ' on' : '') + '" data-ucrange="3m">3 meseci</button>' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === 'vse' ? ' on' : '') + '" data-ucrange="vse">Vse</button></span>';
    var pageHead = '<div class="uc-page-head"><div><p class="uc-range-lbl">' + rangeLbl + '</p></div>' +
      '<div class="uc-d3-ctrl">' + mesecInput + rangeTabs + '</div></div>';
    var cardDonut = '<div class="uc-card uc-donut3d-card">' +
      '<h3 class="sec-h">Delež kg po strankah</h3>' +
      '<div class="uc-d3-stage"><svg class="uc3d-svg" viewBox="-110 0 ' + (_UC3D.W + 220) + ' ' + _UC3D.H + '" preserveAspectRatio="xMidYMid meet"></svg></div></div>';
    var cardBars = '<div class="uc-card"><h3 class="sec-h">' + escape_(ser.naslov) + '</h3>' +
      (ser.rows.length ? '<div class="bars-row" style="margin-top:14px;column-gap:' + gost.gap + 'px">' +
        ser.rows.map(function (o) {
          return '<div class="bars-col" title="' + escape_(o.opis + ' · ' + fmtKg(o.kg)) + '">' +
            '<span class="bars-val">' + (o.kg ? Math.round(o.kg) : '—') + '</span>' +
            '<div class="bars-bar" style="height:' + Math.round(o.kg / naj * 84) + 'px"></div>' +
            '<span class="bars-lab">' + escape_(o.lab) + '</span></div>';
        }).join('') + '</div>'
      : '<p class="u-sub" style="margin:14px 0 0">V izbranem obdobju ni podatkov.</p>') + '</div>';
    var cardProd = '<div class="uc-card uc-stat"><h3 class="sec-h">Skupna učinkovitost</h3><div class="uc-big">' + (kgh ? fmtStevilo1(kgh) : '—') + ' <span>kg/uro</span></div>' +
      '<p class="u-sub">' + fmtKg(kgMon) + ' · ' + stevilo(Math.round(ureMon)) + ' delovnih ur · ' + escape_(rangeLbl) + '</p></div>';
    // Lestvica kg/uro po dnevih (izbran mesec) — naraščajoče/padajoče.
    var lestDni = ucKgUroPoDnevih(mesecKljuc);
    lestDni.sort(function (a, b) { return _ucLestSort === 'asc' ? a.kgh - b.kgh : b.kgh - a.kgh; });
    var lestVrst = lestDni.length ? lestDni.map(function (o, i) {
      return '<div class="uc-lest-row"><span class="uc-lest-rank">' + (i + 1) + '.</span>' +
        '<span class="uc-lest-dan">' + danKratek(o.dan) + '</span>' +
        '<span class="uc-lest-sub">' + tezaFmt(o.kg) + ' · ' + fmtStevilo1(o.ure) + ' h</span>' +
        '<b class="uc-lest-v">' + fmtStevilo1(o.kgh) + '<span> kg/uro</span></b></div>';
    }).join('') : '<p class="u-sub" style="padding:8px 2px">Ni dni z opranim perilom in odprtimi urami v tem mesecu.</p>';
    var cardLestvica = '<div class="uc-card uc-lest-card"><div class="uc-lest-h"><h3 class="sec-h">kg/uro po dnevih</h3>' +
      '<button type="button" class="pris-tab uc-lest-toggle" data-uclest>' + (_ucLestSort === 'desc' ? 'Padajoče' : 'Naraščajoče') + '</button></div>' +
      '<div class="uc-lest-list">' + lestVrst + '</div></div>';
    // Lestvica €/kg po strankah — DESNO od tortnega diagrama (na osnovi opranega perila).
    var cardLestEur = '<div class="uc-card uc-lest-card uc-lest-eur"><div class="uc-lest-h"><h3 class="sec-h">Promet po strankah</h3>' +
      '<button type="button" class="pris-tab uc-lest-toggle" data-uclesteur>' + (_ucLestEurSort === 'desc' ? 'Padajoče' : 'Naraščajoče') + '</button></div>' +
      '<div class="uc-lest-list uc-lest-eur-list">' + ucLestEurRows() + '</div>' +
      '<div class="uc-lest-foot uc-lest-eur-tot">' + ucLestEurTot() + '</div></div>';
    // Zgoraj: diagram LEVO + lestvica €/kg po strankah DESNO. Spodaj: kg 7 dni + učinkovitost.
    // (Kartica »kg/uro po dnevih« odstranjena — nadomešča jo lestvica €/kg po strankah desno.)
    void cardLestvica;
    var top = pageHead + '<div class="uc-donut-row">' + cardDonut + cardLestEur + '</div>' +
      '<div class="uc-top uc-top2">' + cardBars + cardProd + '</div>';

    var d = ucEvidencaData();
    var eurReady = d.eurReady;
    function eurCela(v) { return !eurReady ? '<span class="u-sub">…</span>' : (v != null ? cenaFmt(v) : '<span class="u-sub">—</span>'); }
    var rows = d.arr.map(function (x) { return '<tr><td>' + escape_(x.ime) + '</td><td class="pris-ure">' + fmtKg(x.kg) + '</td><td class="pris-ure uc-eur" data-org="' + escape_(x.id) + '">' + eurCela(x.eur) + '</td></tr>'; }).join('');
    // Razvrščanje s klikom na naslov stolpca: prvi klik izbere stolpec, vsak naslednji
    // obrne smer. Puščico rišemo s tisto ikono, ki jo uporabljajo spustni meniji —
    // znaka ↓/↑ sta v tej pisavi višja od besedila in sedita pod črkovno črto.
    function thRazvrsti(kljuc, naslov, privzeta, razred) {
      var del = String(_ucSort || 'kg_desc').split('_');
      var na = del[0] === kljuc, smer = na ? del[1] : privzeta;
      var gor = (smer === 'asc' || smer === 'az');
      return '<th' + (razred ? ' class="' + razred + '"' : '') + (na ? ' aria-sort="' + (gor ? 'ascending' : 'descending') + '"' : '') + '>' +
        '<button type="button" class="uc-th' + (na ? ' on' + (gor ? ' gor' : '') : '') + '" data-sort="' + kljuc + '"' +
        ' title="Razvrsti po ' + escape_(naslov.toLowerCase()) + '">' + escape_(naslov) +
        '<svg class="uc-th-p" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</button></th>';
    }
    var tbl = '<table class="pris-tbl uc-ev-tbl"><thead><tr>' +
      thRazvrsti('ime', 'Stranka', 'az') + thRazvrsti('kg', 'Kilaža', 'desc') + thRazvrsti('eur', '€/kg', 'desc') +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="3" class="u-sub">Ni podatkov v izbranem obdobju.</td></tr>') + '</tbody>' +
      (rows ? '<tfoot><tr><td>Skupaj</td><td class="pris-ure">' + fmtKg(d.kgSkup) + '</td><td class="pris-ure uc-eur uc-eur-tot">' + eurCela(d.eurTot) + '</td></tr></tfoot>' : '') + '</table>';
    var ev = '<div class="pris-card"><div class="pris-h">' +
      '<div><h3 class="sec-h">Evidenca kg</h3><p class="uc-obd-lbl">' + escape_(rangeLbl) + ' · obdobje izbereš na vrhu strani</p></div>' +
      '<span class="pris-hbtns"><button type="button" class="cgrp-btn ghost uc-izvoz">Izvozi</button></span></div>' +
      tbl + '</div>';

    box.innerHTML = top + ev;
    // Napisi se redčijo po dejanski širini — šele ko je vsebina v dokumentu.
    try { ucBarsFit(box); } catch (e) {}
    var _svg3d = box.querySelector('.uc3d-svg');
    if (_svg3d) {
      if (_uc3dTweenFromSegs) { uc3dTween(_svg3d, _uc3dTweenFromSegs, ucDonutSegs(_ucDonutRange)); _uc3dTweenFromSegs = null; }
      else uc3dAnimate(_svg3d, _ucDonutRange, _uc3dAnim);
    }
    _uc3dAnim = false;
    box.querySelectorAll('[data-ucrange]').forEach(function (b) { b.addEventListener('click', function () { if (_ucDonutRange === b.dataset.ucrange) return; _uc3dTweenFromSegs = ucDonutSegs(_ucDonutRange); _ucDonutRange = b.dataset.ucrange; _uc3dAnim = false; ucRender(); }); });
    { var _lt = box.querySelector('[data-uclest]'); if (_lt) _lt.addEventListener('click', function () { _ucLestSort = (_ucLestSort === 'desc' ? 'asc' : 'desc'); ucRender(); }); }
    { var _le = box.querySelector('[data-uclesteur]'); if (_le) _le.addEventListener('click', function () { _ucLestEurSort = (_ucLestEurSort === 'desc' ? 'asc' : 'desc'); var l = box.querySelector('.uc-lest-eur-list'); if (l) l.innerHTML = ucLestEurRows(); this.textContent = (_ucLestEurSort === 'desc' ? 'Padajoče' : 'Naraščajoče'); }); }
    var _dm = $('ucDonutMesec'); if (_dm) _dm.addEventListener('change', function () { if (!this.value) return; _uc3dTweenFromSegs = ucDonutSegs(_ucDonutRange); _ucDonutMonth = this.value; _uc3dAnim = false; ucRender(); });
    var ib = box.querySelector('.uc-izvoz'); if (ib) ib.addEventListener('click', ucIzvozOdpri);
    box.querySelectorAll('.uc-th[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.sort;
        var obrni = (k === 'ime') ? { az: 'za', za: 'az' } : { desc: 'asc', asc: 'desc' };
        var privzeta = (k === 'ime') ? 'az' : 'desc';
        var del = String(_ucSort || 'kg_desc').split('_');
        _ucSort = k + '_' + (del[0] === k ? (obrni[del[1]] || privzeta) : privzeta);
        ucRender();
      });
    });
    ucNaloziPrihodekObseg();   // prihodek in €/kg za obdobje strani (lestvica + Evidenca kg)
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  // ── Izvoz Evidence kg: predogled + Excel ali PDF (za izbrano obdobje dan/mesec/vse) ──
  function ucIzvozOdpri() {
    var d = ucEvidencaData();
    if (!d.arr.length) { toast('Ni podatkov za izvoz.'); return; }
    predogledDokument({
      naslov: 'Evidenca kg · ' + d.obLabel,
      docHtml: ucKgDocHtml(d),
      xlsx: function () { ucKgXlsx(d); },
      pdf: function () { return ucKgPdf(d); }
    });
  }
  function _ucEurStr(v) { return v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
  function ucKgFileBase(d) { return 'evidenca_kg_' + (d.obKratko || 'obdobje').replace(/[^0-9A-Za-z-]/g, '_'); }
  // Predogled (HTML) — skupni slog dokumentov (glava z logotipom portala, tabela kot spremni list).
  function ucKgDocHtml(d) {
    var rows = d.arr.map(function (x) {
      return '<tr><td class="an">' + escape_(x.ime) + '</td><td class="r b">' + fmtKg(x.kg) + '</td><td class="r b">' + _ucEurStr(x.eur) + '</td></tr>';
    }).join('');
    return dokHtml('Evidenca kg ' + d.obLabel,
      '<div class="sc-box sc-num"><span>Evidenca kg</span><span class="sc-obd">' + escape_(d.obLabel) + '</span></div>' +
      '<table class="sc-table"><thead><tr><th class="l">Stranka</th><th class="r">Kilaža</th><th class="r">&euro;/kg</th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td class="an">Skupaj</td><td class="r b">' + fmtKg(d.kgSkup) + '</td><td class="r b">' + _ucEurStr(d.eurTot) + '</td></tr></tfoot></table>');
  }
  // Excel (.xlsx)
  function ucKgXlsx(d) {
    var B = function (t) { return { v: t, bold: true }; };
    var T = function (t) { return { v: t, s: 2 }; };
    var rows = [[{ v: 'Evidenca kg — ' + d.obLabel, s: 2 }], [], [B('Stranka'), B('Kilaža (kg)'), B('€/kg')]];
    d.arr.forEach(function (x) { rows.push([x.ime, { v: Math.round(x.kg * 100) / 100 }, x.eur != null ? { v: Math.round(x.eur * 100) / 100 } : '—']); });
    rows.push([]);
    rows.push([T('SKUPAJ'), { v: Math.round(d.kgSkup * 100) / 100, s: 2 }, d.eurTot != null ? { v: Math.round(d.eurTot * 100) / 100, s: 2 } : '—']);
    prenesiXlsx(ucKgFileBase(d) + '.xlsx', [{ name: 'Evidenca kg', rows: rows }]);
    toast('Excel pripravljen.');
  }
  // PDF (prava datoteka, vektorsko) — isti slog kot predogled.
  async function ucKgPdf(d) {
    if (!(await pdfPripravljen())) return;
    var doc = new PDFDoc(); doc.addPage();
    var M = DPDF.M, R = doc.W - M;
    var y = dpdfGlava(doc);
    y = dpdfNaslovOkvir(doc, y, 'Evidenca kg', d.obLabel);
    var cKg = R - 6 - 110, cEur = R - 6;
    var st = [{ t: 'Stranka', x: M + 6 }, { t: 'Kilaža', x: cKg, align: 'right' }, { t: '€/kg', x: cEur, align: 'right' }];
    y += 4 * PT; y = dpdfTabGlava(doc, y, st);
    y = dpdfTabela(doc, y, st, d.arr.map(function (x) {
      return [{ t: x.ime, x: M + 6, w: 600 }, { t: fmtKg(x.kg), x: cKg, align: 'right', w: 700 }, { t: _ucEurStr(x.eur), x: cEur, align: 'right', w: 700 }];
    }), 30, 'Evidenca kg · ' + d.obLabel);
    doc.line(M, y + 0.56, R, y + 0.56, { width: 1.5 * PT, color: DPDF.INK });
    var osn = dpdfOsnova(y + 8 * PT, 10 * PT, 15 * PT);
    doc.text(M + 6, osn, 'Skupaj', { size: 10 * PT, bold: true, color: DPDF.INK });
    doc.text(cKg, osn, fmtKg(d.kgSkup), { size: 10 * PT, bold: true, align: 'right', color: DPDF.INK });
    doc.text(cEur, osn, _ucEurStr(d.eurTot), { size: 10 * PT, bold: true, align: 'right', color: DPDF.INK });
    doc.save(ucKgFileBase(d) + '.pdf');
  }

  /* ══════════ SPREMNI LISTI ══════════ */
  async function naloziListe() {
    // Beri VSE liste po straneh (brez 1000-vrstičnega limita — mora delati še čez leta).
    // Stabilna paginacija: doc_date + id kot razločevalo.
    const _kol = 'id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,popravki,source,transport,potrjeno,legacy_id,opomba,opomba_avtor,opomba_at,opomba_stranka,opomba_evidenca';
    let r = await vseVrstice((od, do_) => sb.from('delivery_notes').select(_kol).is('deleted_at', null).order('doc_date', { ascending: false }).order('id', { ascending: false }).range(od, do_));
    // Rezerva: če stolpci za opombo/popravke še niso dodani, naloži brez njih.
    if (r.error) {
      r = await vseVrstice((od, do_) => sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport,potrjeno,legacy_id').is('deleted_at', null).order('doc_date', { ascending: false }).order('id', { ascending: false }).range(od, do_));
    }
    // Rezerva 2: če stolpca deleted_at še ni (migracija 50 ni zagnana) → beri brez tega filtra.
    if (r.error) {
      _softDelDN = false;
      r = await vseVrstice((od, do_) => sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport,potrjeno,legacy_id').order('doc_date', { ascending: false }).order('id', { ascending: false }).range(od, do_));
    }
    LISTI_NAPAKA = !!(r && r.error);
    LISTI = (r && !r.error && r.data) ? r.data : [];
    const {
      count
    } = await sb.from('delivery_notes').select('id', {
      count: 'exact',
      head: true
    }).is('deleted_at', null);
    VSEHLISTOV = count || 0;
    // Zberi liste s starim zapisom (postavka brez povezave na artikel → article_id IS NULL)
    // Pregled CELE tabele postavk je daleč najdražja poizvedba ob prijavi, rabimo
    // pa jo le za oznako »star zapis« in števec nepotrjenih — zato v ozadje.
    STAR_SET = new Set();
    if (OSEBJE) naloziStarSet();
  }
  var _starP = null;
  function naloziStarSet() {
    if (_starP) return _starP;
    _starP = (async function () {
      try {
        const rs = await vseVrstice((od, do_) =>
          sb.from('delivery_note_items').select('note_id').is('article_id', null).range(od, do_));
        if (rs && rs.error) throw rs.error;
        const set = new Set();
        (rs && rs.data ? rs.data : []).forEach(r => { if (r && r.note_id) set.add(r.note_id); });
        STAR_SET = set;
        try { risiPregled(); } catch (e) {}
        try { risiArhiv(); } catch (e) {}
      } catch (e) {
        STAR_SET = new Set();
        try { console.warn('[star_set] oznak »star zapis« ni bilo mogoče naložiti:', (e && e.message) || e); } catch (_) {}
      } finally { _starP = null; }
    })();
    return _starP;
  }
  const prazniListi = kdo => '<div class="rows"><div class="empty"><h3>Spremnih listov še ni</h3><p>' + (kdo === 'osebje' ? 'Spremni listi nastajajo na tablici v pralnici. Ko jih bomo prenesli v bazo,<br>se bodo izpisali tukaj.' : 'Ko bomo prevzeli in vrnili perilo, se bo vsak prevzem izpisal tukaj.') + '</p></div></div>';
  // Ločeno stanje za NAPAKO pri nalaganju (ne prikazuj kot »prazno«) — z gumbom za ponovni poskus.
  const napakaListi = '<div class="rows"><div class="empty"><h3>Nalaganje ni uspelo</h3><p>Podatkov trenutno ni bilo mogoče naložiti.<br>Preveri povezavo in poskusi znova.</p><button type="button" class="btn ghost" data-act="liste-ponovi" style="margin-top:14px">Poskusi znova</button></div></div>';
  document.addEventListener('click', async function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-act="liste-ponovi"]') : null;
    if (!b) return;
    b.disabled = true; b.textContent = 'Nalagam …';
    try { await naloziListe(); } catch (_) {}
    try { risiArhiv(); } catch (_) {}
    try { risiPregled(); } catch (_) {}
  });

  /* ══════════ PREGLED ══════════ */
  // Oblikovanje števke v KPI ploščici (med štetjem tone kot 0,00t; ob koncu s fmtTona).
  function _fmtStat(v, fmt, konec) {
    if (fmt === 'tona') return konec ? fmtTona(v) : ((v / 1000).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 't');
    return stevilo(Math.round(v));
  }
  // »Big-tech« štetje od 0 do cilja.
  function _countUp(el, target, fmt, dur) {
    dur = dur || 900; var t0 = 0;
    function ease(x) { return 1 - Math.pow(1 - x, 3); }
    function fr(now) { if (!t0) t0 = now; var p = Math.min(1, (now - t0) / dur); el.textContent = _fmtStat(target * ease(p), fmt, false); if (p < 1) requestAnimationFrame(fr); else el.textContent = _fmtStat(target, fmt, true); }
    requestAnimationFrame(fr);
  }
  function _animStat(grid) {
    if (!grid) return;
    var reduce = false; try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
    [].slice.call(grid.querySelectorAll('.stat')).forEach(function (t, i) { t.style.setProperty('--si', i); t.classList.add('stat-in'); });
    grid.querySelectorAll('.stat-num[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0, fmt = el.getAttribute('data-fmt') || 'int';
      if (reduce) { el.textContent = _fmtStat(target, fmt, true); return; }
      _countUp(el, target, fmt);
    });
  }
  // Oddelane ure (tekoči mesec) — iz att_events; par in/out po zaposlenih.
  async function _domUreSek() {
    var mk = danes10().slice(0, 7), evs;
    if (UCEN_DOG) { evs = UCEN_DOG.filter(function (d) { return d.ts && d.ts.slice(0, 7) === mk; }); }
    else { var r = await vseVrstice(function (a, b) { return sb.from('att_events').select('employee_id,ts,type').gte('ts', mk + '-01T00:00:00Z').order('ts', { ascending: true }).order('id', { ascending: true }).range(a, b); }); evs = (r && r.data) ? r.data : []; }
    var byEmp = {}; evs.forEach(function (d) { (byEmp[d.employee_id] = byEmp[d.employee_id] || []).push(d); });
    var sek = 0;
    Object.keys(byEmp).forEach(function (eid) { var a = byEmp[eid].sort(function (x, y) { return x.ts < y.ts ? -1 : 1; }); var odprt = null; a.forEach(function (d) { if (d.type === 'in') { if (!odprt) odprt = d; } else if (d.type === 'out') { if (odprt) { sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } } }); });
    return sek;
  }
  async function _domUreFill() {
    var el = document.querySelector('#statGrid .stat-num[data-pending="ure"]'); if (!el) return;
    var sek = 0; try { sek = await _domUreSek(); } catch (e) {}
    var ure = Math.round(sek / 3600);
    if (!document.body.contains(el)) return;
    el.setAttribute('data-count', ure); el.setAttribute('data-fmt', 'int'); el.removeAttribute('data-pending');
    var reduce = false; try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
    if (reduce) el.textContent = stevilo(ure); else _countUp(el, ure, 'int');
  }
  function risiPregled() {
    $('domovNaslov').textContent = OSEBJE ? ('Pozdravljen/a, ' + prvoIme()) : MOJEPODJETJE ? MOJEPODJETJE.name : 'Vaš pregled';
    $('domovPod').textContent = OSEBJE ? ORGSEZNAM.length + ' strank v bazi' : MOJEPODJETJE ? [MOJEPODJETJE.legal_name, MOJEPODJETJE.address].filter(Boolean).join(' · ') : '';
    const zdaj = new Date();
    const zacetekMeseca = new Date(zdaj.getFullYear(), zdaj.getMonth(), 1);
    const vMesecu = LISTI.filter(l => new Date(l.doc_date) >= zacetekMeseca);
    const kosovMesec = vMesecu.reduce((s, l) => s + (l.total_pieces || 0), 0);
    const kosovSkupaj = LISTI.reduce((s, l) => s + (l.total_pieces || 0), 0);
    const kgMesec = vMesecu.reduce((s, l) => s + (parseFloat(l.weight_kg) || 0), 0);
    const kgSkupaj = LISTI.reduce((s, l) => s + (parseFloat(l.weight_kg) || 0), 0);
    const zadnji = LISTI[0];
    const pred90 = new Date(zdaj.getTime() - 90 * 864e5);
    const aktivnih = new Set(LISTI.filter(l => new Date(l.doc_date) >= pred90).map(l => l.org_id)).size;
    const kartice = OSEBJE ? [
      { lab: 'Ta mesec', num: kgMesec, fmt: 'tona' },
      { lab: 'Oddelanih ur', pending: 'ure' },
      { lab: 'Dostav ta mesec', num: vMesecu.length, fmt: 'int' },
      { lab: 'Kosov opranih', num: kosovSkupaj, fmt: 'int' }
    ] : [
      { lab: 'Prevzemov', num: VSEHLISTOV, fmt: 'int', sub: 'skupaj' },
      { lab: 'Ta mesec', num: vMesecu.length, fmt: 'int', sub: stevilo(kosovMesec) + ' kosov' },
      { lab: 'Kosov skupaj', num: kosovSkupaj, fmt: 'int', sub: 'v vseh prevzemih' },
      { lab: 'Zadnji prevzem', text: zadnji ? datum(zadnji.doc_date) : '—', sub: zadnji ? stevilo(zadnji.total_pieces) + ' kosov' : 'še ni podatkov' }
    ];
    $('statGrid').innerHTML = kartice.map(function (k) {
      var num;
      if (k.text != null) num = escape_(k.text);
      else if (k.pending) num = '<span class="stat-dots">···</span>';
      else num = escape_(_fmtStat(k.num, k.fmt, true));
      var attr = (k.pending) ? ' data-pending="' + k.pending + '"' : ((k.text == null) ? ' data-count="' + k.num + '" data-fmt="' + k.fmt + '"' : '');
      return '<div class="stat"><div class="stat-num"' + attr + '>' + num + '</div>' +
        '<div class="stat-lab">' + escape_(k.lab) + '</div><div class="stat-sub">' + escape_(k.sub || '') + '</div></div>';
    }).join('');
    _animStat($('statGrid'));
    if (OSEBJE) _domUreFill();

    /* zadnjih šest mesecev */
    if ($('domovStatus')) $('domovStatus').innerHTML = '';
    if (!LISTI.length) {
      $('mesecni').innerHTML = '';
      $('zadnji').innerHTML = LISTI_NAPAKA ? napakaListi : prazniListi(OSEBJE ? 'osebje' : 'stranka');
      return;
    }
    const meseci = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(zdaj.getFullYear(), zdaj.getMonth() - i, 1);
      const konec = new Date(zdaj.getFullYear(), zdaj.getMonth() - i + 1, 1);
      const kos = LISTI.filter(l => {
        const x = new Date(l.doc_date);
        return x >= d && x < konec;
      }).reduce((s, l) => s + (l.total_pieces || 0), 0);
      meseci.push({
        ime: d.toLocaleDateString('sl-SI', {
          month: 'short'
        }),
        kos
      });
    }
    const naj = Math.max(...meseci.map(m => m.kos), 1);
    $('mesecni').innerHTML = '<div class="bars"><h3 class="sec-h">Kosov po mesecih</h3><div class="bars-row">' + meseci.map(m => `<div class="bars-col">
        <span class="bars-val">${m.kos ? stevilo(m.kos) : ''}</span>
        <div class="bars-bar" style="height:${Math.round(m.kos / naj * 88)}px"></div>
        <span class="bars-lab">${escape_(m.ime)}</span></div>`).join('') + '</div></div>';
    const stKljuc = l => { const d = String(l.number || '').split('/'); return (parseInt(d[1], 10) || 0) * 1e7 + (parseInt(d[0], 10) || 0); };
    const razvrsceni = LISTI.slice().sort((a, b) => stKljuc(b) - stKljuc(a));
    // Status ažurnosti arhiva (samo osebje): zadnji list naj bo od včeraj (razen če je bila včeraj nedelja → sobota).
    var statusHtml = '';
    if (OSEBJE) {
      var _iso = function (dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); };
      var zadnjiDatum = LISTI.reduce(function (m, l) { return (l.doc_date && l.doc_date > m) ? l.doc_date : m; }, '');
      var _d = new Date(); _d.setHours(0, 0, 0, 0); _d.setDate(_d.getDate() - 1); if (_d.getDay() === 0) _d.setDate(_d.getDate() - 1);
      var pricakovan = _iso(_d);
      var azuren = zadnjiDatum && zadnjiDatum >= pricakovan;
      var nepotrjeni = LISTI.filter(function (l) { return (l.total_pieces > 0) && l.potrjeno !== true && !STAR_SET.has(l.id); }).length;
      if (!azuren) statusHtml = '<div class="preg-status ps-warn"><span class="ps-ik">!</span><span>Zadnji spremni list je od <b>' + (zadnjiDatum ? datum(zadnjiDatum) : '—') + '</b> — morda manjkajo novejši.</span></div>';
      else if (nepotrjeni > 0) statusHtml = '<div class="preg-status ps-warn"><span class="ps-ik">●</span><span>Vsi dodani · <b>' + nepotrjeni + '</b> ' + (nepotrjeni === 1 ? 'list še ni pregledan' : 'listov še ni pregledanih') + ' (potrjenih).</span></div>';
      else statusHtml = '<div class="preg-status ps-ok"><span class="ps-ik">✓</span><span>Vse pregledano in dodano · zadnji list <b>' + (zadnjiDatum ? datum(zadnjiDatum) : '—') + '</b>.</span></div>';
    }
    if ($('domovStatus')) $('domovStatus').innerHTML = statusHtml;
    var kolikoNaj = Math.max(6, Math.min(40, Math.floor((window.innerHeight - 230) / 62)));
    const zadnjiListi = razvrsceni.slice(0, kolikoNaj);
    $('zadnji').innerHTML = '<h3 class="sec-h">Zadnji prevzemi</h3>' + tabelaListov(zadnjiListi, false);
    prednaloziPostavke(zadnjiListi);
  }

  /* ══════════ OKNO: kartica se razpre v okno (Arhiv, Stranke) ══════════
     Vsebina kartice (.a-det / .arts) se za čas odprtja PRESELI v okno in se ob
     zaprtju vrne na svoje mesto — urejanje, tisk, opombe in brisanje delajo naprej
     na istem elementu. Okno zraste iz kartice in se vanjo vrne: premik + clip-path,
     ne scale, zato se besedilo med animacijo ne razteguje. */
  var _okno = null;
  var OKNO_KRIVULJA = 'cubic-bezier(.22,.61,.36,1)';   // ista krivulja kot prej razpiranje kartice
  function oknoMirno() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  // Glava okna je kopija kartice (isti podatki, ista statusna barva), postavljena za okno.
  function oknoGlava() {
    var o = _okno; if (!o) return;
    if (o.glavaFn) {   // okno brez kartice (npr. nov spremni list iz gumba): naslov + ×
      o.glava.className = 'okno-glava okno-glava-naslov';
      var n = o.glavaFn(o.kartica);
      o.glava.innerHTML = ''; o.glava.appendChild(n); o.glava.appendChild(o.x);
      o.panel.setAttribute('aria-label', n.textContent.trim());
      return;
    }
    var k = o.kartica, cel = k.closest('.lcell');
    o.glava.className = 'okno-glava' + (cel ? ' ' + [].filter.call(cel.classList, function (c) { return c !== 'lcell' && c !== 'open'; }).join(' ') : '');
    var kop = document.createElement('div');
    kop.className = [].filter.call(k.classList, function (c) { return c !== 'okno-vir' && c !== 'arh-flash'; }).join(' ') + ' okno-kartica';
    kop.innerHTML = k.innerHTML;
    kop.querySelectorAll('[style]').forEach(function (el) { el.removeAttribute('style'); });   // odvito ime (marquee) ob hoverju
    var chk = kop.querySelector('.arh-chk.clk');
    if (chk) {
      var klik = function (e) {
        e.preventDefault(); e.stopPropagation();
        var izv = _okno && _okno.kartica.querySelector('.arh-chk.clk'); if (!izv) return;
        var p = potrdiList(izv); oknoGlava(); p.then(oknoGlava, oknoGlava);   // ob napaki potrdiList vrne stanje nazaj
      };
      chk.addEventListener('click', klik);
      chk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') klik(e); });
    }
    o.glava.innerHTML = ''; o.glava.appendChild(kop); o.glava.appendChild(o.x);
    var nasl = k.querySelector('.a-num, .row-nm');
    o.panel.setAttribute('aria-label', nasl ? nasl.textContent.trim() : 'Podrobnosti');
  }
  // Kartica na mestu, kjer je okno nastalo: od tam okno zraste in tja se vrne.
  // Raste OKNO SAMO (z vsebino in senco), a le s transform: okno se razteguje, njegova
  // vsebina pa z NASPROTNIM raztegom ostane v pravi velikosti in se razkriva z robom okna.
  // Vse to izvaja grafična kartica — brez ponovnega izrisa vsebine (clip-path ga je zahteval)
  // in brez ločene površine, za katero je senca okna zamujala.
  // Nasprotni razteg je pravilen le, če je v vsakem trenutku točno 1/s, zato ključe
  // izračunamo v 24 korakih z isto krivuljo (linearno med koraki).
  function oknoKrivulja(x1, y1, x2, y2) {
    function b(t, a1, a2) { var u = 1 - t; return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 28; i++) { var bx = b(t, x1, x2); if (Math.abs(bx - x) < 1e-5) break; if (bx < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return b(t, y1, y2);
    };
  }
  var OKNO_ODPRI = oknoKrivulja(.22, .61, .36, 1), OKNO_ZAPRI = oknoKrivulja(.4, 0, .2, 1);
  function oknoKljuci(o, krivulja, zapri) {
    var c = o.kartica.getBoundingClientRect(), p = o.panel.getBoundingClientRect();
    var sx0 = Math.max(0.02, c.width / p.width), sy0 = Math.max(0.02, c.height / p.height);
    var dx = c.left - p.left, dy = c.top - p.top, N = 24, okno = [], notr = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, e = krivulja(t);
      var f = zapri ? e : 1 - e;   // delež »kartice«: 1 = kartica, 0 = okno
      var sx = 1 + (sx0 - 1) * f, sy = 1 + (sy0 - 1) * f;
      okno.push({ offset: t, transform: 'translate(' + (dx * f) + 'px,' + (dy * f) + 'px) scale(' + sx + ',' + sy + ')' });
      notr.push({ offset: t, transform: 'scale(' + (1 / sx) + ',' + (1 / sy) + ')' });
    }
    return { okno: okno, notr: notr };
  }
  // Natančna kopija kartice na njenem mestu med animacijo: prvi okvir odpiranja in zadnji
  // okvir zapiranja sta videti kot kartica sama — kartica se poveča v okno (in skrči nazaj),
  // namesto da bi nad njo zrasla kopija, ona pa izginila šele na koncu.
  function oknoDuh(o) {
    // Ovoj dobi razrede starša kartice (.lcell s statusom, mreža skupin …), da kopijo
    // oblikujejo ista pravila kot kartico v seznamu.
    var k = o.kartica, r = k.getBoundingClientRect(), star = k.parentElement;
    var ovoj = document.createElement('div');
    ovoj.className = (star ? [].filter.call(star.classList, function (c) { return c !== 'open' && c !== 'hidden'; }).join(' ') + ' ' : '') + 'okno-duh';
    ovoj.style.left = r.left + 'px'; ovoj.style.top = r.top + 'px';
    ovoj.style.width = r.width + 'px'; ovoj.style.height = r.height + 'px';
    ovoj.setAttribute('aria-hidden', 'true');
    // Videz kartice v trenutku klika (tudi stanje »miška nad njo«: ozadje, obroba, senca),
    // sicer bi kopija ob kliku za trenutek utripnila v videz brez hoverja.
    var cs = getComputedStyle(k);
    var kop = k.cloneNode(true);
    kop.classList.remove('okno-vir', 'arh-flash');
    ['id', 'data-id', 'data-i', 'aria-expanded', 'style'].forEach(function (a) { kop.removeAttribute(a); });
    kop.querySelectorAll('[style],[data-pot],[tabindex]').forEach(function (el) { el.removeAttribute('style'); el.removeAttribute('data-pot'); el.removeAttribute('tabindex'); });
    kop.setAttribute('tabindex', '-1');
    kop.style.backgroundColor = cs.backgroundColor; kop.style.backgroundImage = cs.backgroundImage;
    kop.style.borderColor = cs.borderTopColor + ' ' + cs.borderRightColor + ' ' + cs.borderBottomColor + ' ' + cs.borderLeftColor;
    kop.style.boxShadow = cs.boxShadow; kop.style.transition = 'none';
    ovoj.appendChild(kop);
    o.back.appendChild(ovoj);   // nad oknom: prvi okvir odpiranja / zadnji zapiranja je kartica
    return ovoj;
  }
  // moznosti.glava: funkcija(kartica), ki vrne element glave (sicer kopija kartice);
  // moznosti.obZaprtju: klic, ko je okno zaprto in vsebina vrnjena na svoje mesto;
  // moznosti.osvezi: funkcija(nova kartica) → nova vsebina po ponovnem izrisu seznama
  //   (za razdelke, ki ob vsaki spremembi izrišejo vse na novo, npr. Cenik & Artikli).
  function oknoOdpri(kartica, vsebina, najdi, moznosti) {
    moznosti = moznosti || {};
    if (_okno) oknoZapri(true);
    var back = document.createElement('div'); back.className = 'okno-back';
    var zatemni = document.createElement('div'); zatemni.className = 'okno-zatemni'; back.appendChild(zatemni);
    var panel = document.createElement('div'); panel.className = 'okno';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    var notr = document.createElement('div'); notr.className = 'okno-notr';
    var glava = document.createElement('div');
    var telo = document.createElement('div'); telo.className = 'okno-telo';
    var x = document.createElement('button'); x.type = 'button'; x.className = 'doc-x okno-x'; x.setAttribute('aria-label', 'Zapri'); x.textContent = '×';
    notr.appendChild(glava); notr.appendChild(telo); panel.appendChild(notr); back.appendChild(panel);
    var o = _okno = { back: back, panel: panel, notr: notr, glava: glava, telo: telo, x: x, kartica: kartica, vsebina: vsebina, najdi: najdi,
      id: kartica.dataset.id, dom: { parent: vsebina.parentNode, next: vsebina.nextSibling, id: vsebina.id },
      glavaFn: moznosti.glava || null, obZaprtju: moznosti.obZaprtju || null, osvezi: moznosti.osvezi || null };
    oknoGlava();
    vsebina.removeAttribute('id');   // po ponovnem izrisu ima nova kartica element z istim id-jem
    vsebina.classList.add('show');
    telo.appendChild(vsebina);       // ponovna vstavitev znova sproži animacijo razkritja vsebine (adReveal)
    // Stran pod oknom naj ne drsi; širino drsnika nadomesti odmik, da se nič ne premakne.
    var drsnik = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add('okno-zaklep');
    if (drsnik > 0) document.documentElement.style.paddingRight = drsnik + 'px';
    document.body.appendChild(back);
    x.addEventListener('click', function () { oknoZapri(); });
    // Zapri ob kliku na ozadje — a ne, če se je izbira besedila začela v oknu in končala zunaj.
    back.addEventListener('mousedown', function (e) { o.zunaj = e.target === back; });
    back.addEventListener('click', function (e) { if (e.target === back && o.zunaj) oknoZapri(); o.zunaj = false; });
    document.addEventListener('keydown', oknoTipka, true);
    o.visina = panel.offsetHeight;
    // Menjava vsebine (podrobnosti ↔ urejanje, nalaganje) naj višino okna spremeni gladko.
    if (window.ResizeObserver && !oknoMirno()) {
      o.ro = new ResizeObserver(function () {
        var h = panel.offsetHeight;
        if (!o.morf && !o.zapiram && Math.abs(h - o.visina) > 2 && panel.animate) {
          panel.animate([{ height: o.visina + 'px' }, { height: h + 'px' }], { duration: 240, easing: OKNO_KRIVULJA });
        }
        o.visina = h;
      });
      o.ro.observe(vsebina);
    }
    void back.offsetWidth; back.classList.add('show');   // zatemnitev začne takoj (brez čakanja na naslednji okvir)
    if (oknoMirno() || !panel.animate) { kartica.classList.add('okno-vir'); oknoFokus(o); return; }
    o.morf = true;
    var kl = oknoKljuci(o, OKNO_ODPRI, false);
    var duh = oknoDuh(o);
    kartica.classList.add('okno-vir');   // kartica se spremeni v okno: njeno mesto se izprazni takoj
    // Okno (s senco) raste iz kartice; kopija kartice nad njim izgine; vsebina se pretopi.
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: 'linear' });
    duh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, delay: 60, easing: 'ease', fill: 'forwards' });
    notr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 90, easing: 'ease', fill: 'backwards' });
    notr.animate(kl.notr, { duration: 380, easing: 'linear' });
    var konecRasti = function () { duh.remove(); o.morf = false; o.visina = panel.offsetHeight; };
    panel.animate(kl.okno, { duration: 380, easing: 'linear' }).finished.then(konecRasti, konecRasti);
    oknoFokus(o);
  }
  function oknoFokus(o) { try { o.x.focus({ preventScroll: true }); } catch (e) {} }
  function oknoTipka(e) {
    if (e.key !== 'Escape' || !_okno) return;
    // Najprej naj se zapre tisto, kar je odprto NAD oknom (potrditev, predogled, spustni meni).
    if (document.querySelector('.sc-modal-back, .dok-lb, .cs-open')) return;
    e.preventDefault(); oknoZapri();
  }
  function oknoZapri(takoj) {
    var o = _okno; if (!o || o.zapiram) return;
    o.zapiram = true;
    document.removeEventListener('keydown', oknoTipka, true);
    if (o.ro) o.ro.disconnect();
    var k = (o.najdi && o.najdi()) || null;   // po ponovnem izrisu je kartica nov element
    var konec = function () {
      o.back.remove();
      var v = o.vsebina;
      v.classList.remove('show'); if (o.dom.id) v.id = o.dom.id;
      // Vsebino vrni na njeno mesto; če je seznam medtem izrisan na novo, je stara odveč.
      if (o.dom.parent && o.dom.parent.isConnected) o.dom.parent.insertBefore(v, (o.dom.next && o.dom.next.parentNode === o.dom.parent) ? o.dom.next : null);
      else v.remove();
      document.querySelectorAll('.okno-vir').forEach(function (el) { el.classList.remove('okno-vir'); });
      document.documentElement.classList.remove('okno-zaklep');
      document.documentElement.style.paddingRight = '';
      if (_okno === o) _okno = null;
      if (k && !takoj) { try { k.focus({ preventScroll: true }); } catch (e) {} }
      if (o.obZaprtju) { try { o.obZaprtju(k); } catch (e) {} }
    };
    if (takoj || oknoMirno() || !o.panel.animate) { konec(); return; }
    o.back.classList.remove('show');
    if (!k) {   // kartice ni več (izbrisana, izpadla iz filtra) → okno samo izgine
      o.panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.98)' }], { duration: 200, easing: 'ease', fill: 'forwards' }).finished.then(konec, konec);
      return;
    }
    if (o.kartica !== k) o.kartica.classList.remove('okno-vir');   // okno gre drugam (npr. gumb → kartica novega lista): izvor se vrne takoj
    o.kartica = k;
    k.classList.add('okno-vir');   // med krčenjem je mesto še prazno; kartica se vrne, ko je okno spet ona
    // Kartica mora biti na zaslonu, sicer bi se okno skrčilo nekam izven pogleda.
    var r = k.getBoundingClientRect(), tb = document.querySelector('.topbar'), vrh = tb ? tb.offsetHeight : 0;
    if (r.bottom < vrh || r.top > window.innerHeight) { try { k.scrollIntoView({ block: 'center' }); } catch (e) {} }
    // Morebitna še tekoča rast ali sprememba višine: izhodišče mora biti mirujoče okno.
    o.panel.getAnimations().forEach(function (a) { a.cancel(); });
    o.notr.getAnimations().forEach(function (a) { a.cancel(); });
    var kl = oknoKljuci(o, OKNO_ZAPRI, true);
    var duh = oknoDuh(o);
    o.notr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease', fill: 'forwards' });
    o.notr.animate(kl.notr, { duration: 320, easing: 'linear', fill: 'forwards' });
    duh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 150, easing: 'ease', fill: 'both' });
    o.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, delay: 230, easing: 'linear', fill: 'forwards' });   // senca okna ugasne, ko je okno že kartica
    o.panel.animate(kl.okno, { duration: 320, easing: 'linear', fill: 'forwards' }).finished.then(konec, konec);
  }
  // Seznam pod oknom je bil izrisan na novo (shranjevanje, brisanje, osvežitev):
  // poveži okno z novo kartico ali ga zapri, če kartice ni več.
  function oknoPoIzrisu() {
    var o = _okno; if (!o || o.zapiram) return;
    var k = o.najdi && o.najdi();
    if (!k) { oknoZapri(); return; }
    if (k !== o.kartica) { o.kartica = k; if (!o.morf) k.classList.add('okno-vir'); }
    if (o.osvezi) { var nova = o.osvezi(k); if (nova && nova !== o.vsebina) oknoZamenjajVsebino(nova); }
    if ('_kartica' in o.vsebina) o.vsebina._kartica = k;
    oknoGlava();
  }
  // Seznam je izrisan na novo in ima svežo vsebino za odprto okno: zamenjaj jo v oknu.
  // Stara vsebina je odveč; ob zaprtju se nova vrne na mesto v novem izrisu.
  function oknoZamenjajVsebino(nova) {
    var o = _okno; if (!o) return;
    if (o.ro) o.ro.unobserve(o.vsebina);
    o.vsebina.remove();
    o.dom = { parent: nova.parentNode, next: nova.nextSibling, id: nova.id };
    nova.removeAttribute('id'); nova.classList.add('show');
    o.telo.appendChild(nova); o.vsebina = nova;
    if (o.ro) o.ro.observe(nova);
  }

  /* ══════════ ARHIV ══════════ */
  function tabelaListov(vrstice, klikljivo) {
    if (!vrstice.length) return LISTI_NAPAKA ? napakaListi : prazniListi(OSEBJE ? 'osebje' : 'stranka');
    return '<div class="rows">' + vrstice.map((l, i) => {
      const prazno = !(l.total_pieces > 0);
      const legacy = STAR_SET.has(l.id);   // vsebuje star zapis (postavka brez povezave na artikel)
      const pot = l.potrjeno === true;
      const stat = prazno ? 'red' : (pot ? 'green' : 'yellow');
      const zaklep = prazno || legacy;                 // ni mogoče potrditi
      const clk = OSEBJE && !zaklep;
      const chkTitle = legacy ? 'star zapis (postavka brez artikla) — ni mogoče potrditi' : (prazno ? 'prazen list — ni mogoče potrditi' : (pot ? 'potrjeno — klikni za preklic' : 'klikni za potrditev (urejeno)'));
      const chk = '<span class="arh-chk' + (pot ? ' on' : '') + (clk ? ' clk' : ' dis') + (legacy && !prazno ? ' leg' : '') + '"' + (clk ? ' data-pot="' + l.id + '" role="button" tabindex="0"' : '') + ' title="' + chkTitle + '">' + (pot ? '✓' : (legacy && !prazno ? '★' : '')) + '</span>';
      return `<div class="lcell arh-${stat}">
    <button class="a-row" type="button" data-i="${i}" data-id="${l.id}" aria-expanded="false"
      ${klikljivo ? '' : 'style="cursor:default"'}>
      ${chk}<span class="a-num">${escape_(l.number || '—')}${l.popravljeno_at ? '<span class="a-pop" title="Popravljeno v aplikaciji' + (l.popravil ? ' · ' + escape_(l.popravil) : '') + '">✎</span>' : ''}</span>
      <span class="a-cli">${escape_(OSEBJE ? ORGIME[l.org_id] || '—' : l.issued_name || '')}${l.transport === 'izredni' ? '<span class="a-izr" title="Izredni prevoz">Izredni</span>' : ''}</span>
      <span class="a-foot"><span class="num a-date">${datum(l.doc_date)}</span>${OSEBJE && l.issued_name ? '<span class="a-izdal" title="Izdelal spremni list">' + escape_(l.issued_name) + '</span>' : ''}<span class="num a-qty">${stevilo(l.total_pieces)} kos</span></span>
      <span class="chev" aria-hidden="true">${klikljivo ? '›' : ''}</span>
    </button>
    <div class="a-det" id="det${i}"></div></div>`;
    }).join('') + '</div>';
  }
  // ── Prekrivanja (offline urejanje na tablici) ──────────────────────────
  var KONFLIKTI = [];
  async function naloziKonflikte() {
    if (!OSEBJE) { KONFLIKTI = []; return; }
    try {
      var r = await sb.from('delivery_note_conflicts').select('*').order('created_at', { ascending: true });
      KONFLIKTI = (r && !r.error && r.data) ? r.data : [];
    } catch (e) { KONFLIKTI = []; }
  }
  function risiKonflikti() {
    var box = $('arhivKonflikti'); if (!box) return;
    if (!OSEBJE || !KONFLIKTI.length) { box.innerHTML = ''; box.className = ''; box.removeAttribute('data-open'); return; }
    var open = box.dataset.open === '1';
    box.className = 'konf-card';
    box.innerHTML = '<div class="konf-head"><span class="konf-warn">⚠ ' + KONFLIKTI.length + ' ' + (KONFLIKTI.length === 1 ? 'prekrivanje' : 'prekrivanj') + ' · offline urejanje na tablici</span><button type="button" class="btn-mini konf-toggle">' + (open ? 'Skrij' : 'Reši') + '</button></div>' +
      (open ? '<div class="konf-list">' + KONFLIKTI.map(risiEnKonflikt).join('') + '</div>' : '');
    box.querySelector('.konf-toggle').addEventListener('click', function () { box.dataset.open = open ? '0' : '1'; risiKonflikti(); });
    if (open) box.querySelectorAll('[data-keep]').forEach(function (b) { b.addEventListener('click', function () { resiKonflikt(b.dataset.id, b.dataset.keep); }); });
  }
  function risiEnKonflikt(k) {
    var post = Array.isArray(k.postavke) ? k.postavke : [];
    var tItems = post.length ? post.map(function (p) { return '<li><span>' + escape_(p.naziv) + '</span><b>' + stevilo(p.kosov) + '</b></li>'; }).join('') : '<li class="u-sub">brez postavk</li>';
    var pn = (LISTI || []).find(function (l) { return l.id === k.note_id; });
    var ime = k.org_name || (pn ? (ORGIME[pn.org_id] || '') : '');
    return '<div class="konf-row"><div class="konf-title">' + escape_(k.number || '—') + ' · ' + escape_(ime) + '</div><div class="konf-cols">' +
      '<div class="konf-col"><div class="konf-h">Portal (trenutno)</div>' + (pn ? ('<div class="u-sub">' + stevilo(pn.total_pieces) + ' kos · ' + (pn.weight_kg != null ? tezaFmt(pn.weight_kg) : '—') + ' · ' + (pn.transport === 'izredni' ? 'izredni' : 'redni') + '</div>') : '<div class="u-sub">list ni najden</div>') + '<button type="button" class="btn-mini konf-keep" data-keep="portal" data-id="' + escape_(String(k.id)) + '">Obdrži portal</button></div>' +
      '<div class="konf-col"><div class="konf-h">Tablica' + (k.popravil ? ' · ' + escape_(k.popravil) : '') + '</div><ul class="konf-items">' + tItems + '</ul><div class="u-sub">teža ' + (k.weight_kg != null ? tezaFmt(k.weight_kg) : '—') + ' · ' + (k.transport === 'izredni' ? 'izredni' : 'redni') + '</div>' + (k.popravki ? '<div class="konf-log">' + escape_(k.popravki).replace(/\n/g, '<br>') + '</div>' : '') + '<button type="button" class="btn-mini primary konf-keep" data-keep="tablica" data-id="' + escape_(String(k.id)) + '">Obdrži tablico</button></div>' +
      '</div></div>';
  }
  async function resiKonflikt(id, keep) {
    var k = KONFLIKTI.find(function (x) { return String(x.id) === String(id); }); if (!k) return;
    var ok = await potrdiModal({ naslov: keep === 'tablica' ? 'Obdrži tablično verzijo' : 'Obdrži portalno verzijo', sporocilo: keep === 'tablica' ? ('Spremni list ' + (k.number || '') + ' se prepiše z verzijo s tablice. Nadaljujem?') : ('Obdržim trenutno portalno verzijo in zavržem tablično. Nadaljujem?'), potrdi: 'Potrdi', preklici: 'Prekliči' });
    if (!ok) return;
    try {
      if (keep === 'tablica' && k.note_id) {
        var patch = { weight_kg: k.weight_kg, transport: (k.transport === 'izredni' ? 'izredni' : 'redni'), issued_name: k.issued_name, popravil: k.popravil, popravljeno_at: new Date().toISOString() };
        var e1 = (await sb.from('delivery_notes').update(patch).eq('id', k.note_id)).error; if (e1) throw e1;
        try { await sb.from('delivery_notes').update({ popravki: k.popravki }).eq('id', k.note_id); } catch (_p) {}
        await sb.from('delivery_note_items').delete().eq('note_id', k.note_id);
        var items = (Array.isArray(k.postavke) ? k.postavke : []).filter(function (p) { return p && p.naziv; }).map(function (p, i) { return { note_id: k.note_id, article_name: String(p.naziv), pieces: Number(p.kosov) || 0, sort_order: i }; });
        if (items.length) { var e2 = (await sb.from('delivery_note_items').insert(items)).error; if (e2) throw e2; }
        delete _POST_CACHE[k.note_id];   // osveži predpomnjene postavke tega lista
        pozabiPostavke(k.note_id);
        logDodaj('Arhiv', 'Urejeno', 'Prekrivanje rešeno (tablica) · ' + (k.number || ''));
      } else {
        logDodaj('Arhiv', 'Urejeno', 'Prekrivanje rešeno (portal) · ' + (k.number || ''));
      }
      await sb.from('delivery_note_conflicts').delete().eq('id', k.id);
      toast('Prekrivanje rešeno.');
      await naloziListe(); await naloziKonflikte(); risiArhiv();
    } catch (e) { toast('Napaka: ' + (e.message || e)); }
  }
  function risiArhiv() {
    if (OSEBJE) {
      const sel = $('arhivOrg');
      sel.classList.remove('hidden');
      const _ab = $('arhivActBar'); if (_ab) _ab.classList.remove('hidden');
      if (!sel.options.length) {
        sel.innerHTML = '<option value="">Vse stranke</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
        sel.addEventListener('change', risiArhiv);
      }
    }
    const q = $('arhivIsci').value.trim().toLowerCase();
    const org = OSEBJE ? $('arhivOrg').value : '';
    // obdobje od–do (posamičen dan = od == do); prazno = vse
    let _od = ($('arhivOd') && $('arhivOd').value) || '';
    let _do = ($('arhivDo') && $('arhivDo').value) || '';
    if (_od && _do && _od > _do) { const _t = _od; _od = _do; _do = _t; }
    { const xb = $('arhivObdX'); if (xb) xb.classList.toggle('hidden', !(_od || _do)); }
    const vDan = d => { const s = String(d || '').slice(0, 10); return (!_od || s >= _od) && (!_do || s <= _do); };
    const vrstice = LISTI.filter(l => (!org || l.org_id === org) && vDan(l.doc_date) && (!q || (l.number || '').toLowerCase().includes(q) || (ORGIME[l.org_id] || '').toLowerCase().includes(q)));
    const sortv = ($('arhivSort') && $('arhivSort').value) || 'st_desc';
    const imeStr = l => (OSEBJE ? (ORGIME[l.org_id] || '') : (l.issued_name || ''));
    const stK = l => { const d = String(l.number || '').split('/'); return (parseInt(d[1], 10) || 0) * 1e7 + (parseInt(d[0], 10) || 0); };
    if (sortv === 'st_asc') vrstice.sort((a, b) => stK(a) - stK(b));
    else if (sortv === 'st_desc') vrstice.sort((a, b) => stK(b) - stK(a));
    else if (sortv === 'stranka_az') vrstice.sort((a, b) => imeStr(a).localeCompare(imeStr(b), 'sl', { sensitivity: 'base' }));
    else if (sortv === 'stranka_za') vrstice.sort((a, b) => imeStr(b).localeCompare(imeStr(a), 'sl', { sensitivity: 'base' }));
    $('arhivPod').textContent = LISTI.length ? vrstice.length + ' od ' + stevilo(VSEHLISTOV) + ' spremnih listov' : 'v bazi še ni spremnih listov';
    $('arhivList').innerHTML = tabelaListov(vrstice, true);
    prednaloziPostavke(vrstice);   // v ozadju pripravi postavke → prvo razpiranje je takoj gladko
    naloziKonflikte().then(risiKonflikti);
    document.querySelectorAll('#arhivList .a-row').forEach(b => {
      b.addEventListener('click', () => odpriList(b));
    });
    document.querySelectorAll('#arhivList .arh-chk.clk').forEach(c => {
      c.addEventListener('click', e => { e.stopPropagation(); potrdiList(c); });
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); potrdiList(c); } });
    });
    oknoPoIzrisu();
  }
  async function potrdiList(chk) {
    const id = chk.dataset.pot; if (!id) return;
    const naVkljuceno = !chk.classList.contains('on');
    chk.classList.toggle('on', naVkljuceno);
    chk.innerHTML = naVkljuceno ? '✓' : '';
    const lcell = chk.closest('.lcell');
    if (lcell) { lcell.classList.remove('arh-green', 'arh-yellow'); lcell.classList.add(naVkljuceno ? 'arh-green' : 'arh-yellow'); }
    chk.title = naVkljuceno ? 'potrjeno — klikni za preklic' : 'klikni za potrditev (urejeno)';
    const { error } = await sb.from('delivery_notes').update({ potrjeno: naVkljuceno }).eq('id', id);
    if (error) { toast('Napaka: ' + error.message); chk.classList.toggle('on', !naVkljuceno); chk.innerHTML = !naVkljuceno ? '✓' : ''; if (lcell) { lcell.classList.remove('arh-green', 'arh-yellow'); lcell.classList.add(!naVkljuceno ? 'arh-green' : 'arh-yellow'); } return; }
    const rec = (LISTI || []).find(x => x.id === id); if (rec) rec.potrjeno = naVkljuceno;
    toast(naVkljuceno ? 'Potrjeno kot urejeno.' : 'Potrditev preklicana.');
  }
  $('arhivIsci').addEventListener('input', risiArhiv);
  { const ss = $('arhivSort'); if (ss) ss.addEventListener('change', risiArhiv); }
  { const od = $('arhivOd'); if (od) od.addEventListener('change', risiArhiv); }
  { const dd = $('arhivDo'); if (dd) dd.addEventListener('change', risiArhiv); }
  { const xb = $('arhivObdX'); if (xb) xb.addEventListener('click', () => { const a = $('arhivOd'), b = $('arhivDo'); if (a) a.value = ''; if (b) b.value = ''; risiArhiv(); }); }
  { const _nb = $('arhivNovBtn'); if (_nb) _nb.addEventListener('click', () => novList()); }
  { const _kb = $('arhivKosBtn'); if (_kb) _kb.addEventListener('click', () => arhivKos()); }
  // ── Koš spremnih listov (Nedavno brisani — obnovljivi) ──
  async function arhivKos() {
    var box = $('arhivList'); if (!box) return;
    box.innerHTML = NALAGANJE;
    var mejnik = new Date(Date.now() - 30 * 864e5).toISOString();
    var r = await sb.from('delivery_notes').select('id,number,doc_date,org_id,weight_kg,total_pieces,deleted_at')
      .not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false });
    var arr = (r && !r.error) ? (r.data || []) : [];
    var html = '<div class="cgrp-bar"><button type="button" class="cgrp-btn" id="kosNazajArhiv">← Nazaj na arhiv</button></div>' +
      '<h3 class="sec-h" style="margin:6px 0 10px">Nedavno brisani spremni listi <span class="u-sub">(obnovljivi 30 dni)</span></h3>';
    if (r && r.error) html += '<div class="msg bad show">Napaka: ' + escape_(r.error.message) + '</div>';
    else if (!arr.length) html += '<div class="empty"><h3>Koš je prazen</h3><p>Zadnjih 30 dni ni brisanih spremnih listov.</p></div>';
    else html += '<div class="cenik">' + arr.map(function (l) {
      return '<div class="cenik-row"><div class="cenik-nm">' + escape_(l.number || '—') + ' · ' + escape_(ORGIME[l.org_id] || '—') + '</div>' +
        '<div class="cenik-meta">' + datum(l.doc_date) + ' · ' + stevilo(l.total_pieces || 0) + ' kos' + (l.weight_kg != null && l.weight_kg !== '' ? ' · ' + tezaFmt(l.weight_kg) : '') + ' · izbrisan ' + datumcas(l.deleted_at) + '</div>' +
        '<div class="cenik-cena"><button type="button" class="btn-mini cenik-restore" data-obnovi="' + l.id + '">Obnovi</button> ' +
        '<button type="button" class="btn-mini" data-dokoncno="' + l.id + '" title="Izbriši dokončno">Izbriši dokončno</button></div></div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    var nz = document.getElementById('kosNazajArhiv'); if (nz) nz.addEventListener('click', function () { risiArhiv(); });
    box.querySelectorAll('[data-obnovi]').forEach(function (bn) { bn.addEventListener('click', function () { spremniObnovi(bn.dataset.obnovi); }); });
    box.querySelectorAll('[data-dokoncno]').forEach(function (bn) { bn.addEventListener('click', function () { spremniIzbrisiDokoncno(bn.dataset.dokoncno); }); });
  }
  async function spremniObnovi(id) {
    var r = await sb.from('delivery_notes').update({ deleted_at: null }).eq('id', id);
    if (r.error) { toast('Napaka: ' + r.error.message); return; }
    logDodaj('Arhiv', 'Obnovljeno', 'Spremni list obnovljen iz koša');
    toast('Spremni list obnovljen'); await naloziListe(); arhivKos();
  }
  async function spremniIzbrisiDokoncno(id) {
    var ok = await potrdiModal({ naslov: 'Izbriši dokončno', sporocilo: 'Dokončno izbrišem ta spremni list? Tega NI mogoče razveljaviti.', potrdi: 'Izbriši dokončno', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    try {
      var r1 = await sb.from('delivery_note_items').delete().eq('note_id', id); if (r1.error) throw r1.error;
      var r2 = await sb.from('delivery_notes').delete().eq('id', id); if (r2.error) throw r2.error;
      delete _POST_CACHE[id];
      pozabiPostavke(id);
      logDodaj('Arhiv', 'Izbrisano dokončno', 'Spremni list dokončno izbrisan iz koša');
      toast('Dokončno izbrisano'); arhivKos();
    } catch (e) { toast('Napaka: ' + (e && e.message ? e.message : e)); }
  }
  // Predpomnilnik postavk (za takojšnje, gladko razpiranje kartic — brez skoka).
  var _POST_CACHE = {};
  // Postavke spremnega lista so predpomnjene. Po VSAKI spremembi je treba vnos
  // pozabiti, sicer se ob ponovnem odprtju lista prikažejo stare količine,
  // čeprav je shranjevanje uspelo. Brez argumenta počisti vse.
  function pozabiPostavke(id) { if (id) { delete _POST_CACHE[id]; } else { _POST_CACHE = {}; } }
  async function prednaloziPostavke(listi) {
    var ids = (listi || []).map(function (l) { return l.id; }).filter(function (id) { return id && !_POST_CACHE[id]; }).slice(0, 80);
    if (!ids.length) return;
    try {
      // Stranično (brez meje 1000): pri 80 listih bi vsota postavk lahko presegla privzeto mejo in bi kateri list dobil nepopolne postavke.
      var r = await vseVrstice(function (a, b) {
        return sb.from('delivery_note_items').select('note_id,article_name,article_id,pieces,sort_order').in('note_id', ids).order('note_id', { ascending: true }).order('sort_order', { ascending: true }).range(a, b);
      });
      if (r && !r.error) {
        var by = {}; (r.data || []).forEach(function (it) { (by[it.note_id] = by[it.note_id] || []).push({ naziv: it.article_name, kosov: it.pieces, artId: it.article_id }); });
        ids.forEach(function (id) { _POST_CACHE[id] = by[id] || []; });
      }
    } catch (e) {}
  }
  // Postavke lista v okvir: iz predpomnilnika (takoj) ali z enim poizvedovanjem.
  async function naloziDetajl(box, id) {
    box._id = id;
    box._note = LISTI.find(l => l.id === id) || {};
    if (!_POST_CACHE[id]) {
      const { data, error } = await sb.from('delivery_note_items').select('article_name,article_id,pieces,sort_order').eq('note_id', id).order('sort_order');
      if (error) { box.innerHTML = '<div class="a-det-in"><div class="a-det-pad"><p class="u-sub">Napaka: ' + escape_(error.message) + '</p></div></div>'; return; }
      _POST_CACHE[id] = (data || []).map(p => ({ naziv: p.article_name, kosov: p.pieces, artId: p.article_id }));
    }
    box._items = _POST_CACHE[id];
    risiListDetajl(box);
    box.dataset.loaded = '1';
  }
  // Spremni list se odpre v OKNU (prej se je razprl v mreži). Vsebina se naloži
  // PRED odprtjem, da okno zraste naravnost v pravo višino.
  async function odpriList(btn) {
    if (_okno || btn._nalagam) return;
    const box = btn.nextElementSibling && btn.nextElementSibling.classList.contains('a-det') ? btn.nextElementSibling : $('det' + btn.dataset.i);
    const id = btn.dataset.id;
    if (!box.dataset.loaded) {
      btn._nalagam = true; btn.classList.add('nalaga');
      try { await naloziDetajl(box, id); }
      catch (e) { box.innerHTML = '<div class="a-det-in"><div class="a-det-pad"><p class="u-sub">Napaka pri nalaganju.</p></div></div>'; }
      btn._nalagam = false; btn.classList.remove('nalaga');
      if (!btn.isConnected || _okno) return;   // vmes izrisano na novo ali že odprto
    }
    oknoOdpri(btn, box, () => document.querySelector('#arhivList .a-row[data-id="' + String(id).replace(/"/g, '\\"') + '"]'));
  }

  // Po shranjevanju se arhiv izriše na novo in razprta kartica se ob tem zapre.
  // Stran je doslej obstala na isti točkovni višini, kjer je bila po ponovnem
  // izrisu že povsem druga vsebina — videti je bilo, kot da nas je vrglo nekam
  // nižje. Zato shranjeni list poiščemo, ga razpremo in pripeljemo nazaj predse.
  async function pokaziList(id) {
    if (!id) return;
    const row = document.querySelector('#arhivList .a-row[data-id="' + String(id).replace(/"/g, '\\"') + '"]');
    if (!row) {
      // Po spremembi datuma ali stranke je list lahko padel iz trenutnega filtra.
      const l = $('arhivList'); if (l) try { l.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      return;
    }
    // Urejeni list: okno ostane odprto in pokaže shranjeno stanje.
    const vOknu = !!(_okno && _okno.id === String(id));
    if (vOknu) { try { await naloziDetajl(_okno.vsebina, String(id)); } catch (e) {} }
    // Merimo in poudarimo VRSTICO, ne ovojnice .lcell — ta je v seznamskem pogledu
    // display:contents in nima okvirja, zato bi bile njene mere same ničle.
    // Kartica naj bo na sredini zaslona: pri novem listu jo vidiš takoj, pri urejenem
    // pa se okno ob zaprtju vrne vanjo na pravem mestu.
    try {
      const tb = document.querySelector('.topbar');
      const odmik = (tb ? tb.offsetHeight : 0) + 14;          // lepljiva glava (na telefonu) ne sme prekriti vrstice
      const visina = row.offsetHeight;
      const prostor = window.innerHeight - odmik;
      let vrh = row.getBoundingClientRect().top + window.pageYOffset - odmik;
      if (visina > 0 && visina < prostor) vrh -= (prostor - visina) / 2;
      window.scrollTo({ top: Math.max(0, vrh), behavior: vOknu ? 'auto' : 'smooth' });
    } catch (e) { try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e2) {} }
    if (vOknu) return;
    row.classList.add('arh-flash');
    setTimeout(function () { row.classList.remove('arh-flash'); }, 1700);
  }

  /* prikaz postavk + (samo osebje) gumbi Uredi / Izbriši */
  function risiListDetajl(box) {
    const items = box._items || [];
    const n = box._note || {};
    const seznam = items.length ? '<ul>' + items.map(p => `<li><span title="${escape_(p.naziv)}">${escape_(p.naziv)}</span><b>${stevilo(p.kosov)}</b></li>`).join('') + '</ul>' : '<p class="u-sub">Ta spremni list nima postavk.</p>';
    const prevozV = `<span class="prevoz-znak ${n.transport === 'izredni' ? 'izr' : 'red'}">${n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'}</span>`;
    const izdalV = `<p class="u-sub" style="margin-top:8px">${prevozV}${n.issued_name ? ' · Izdal: ' + escape_(n.issued_name) : ''}</p>`;
    const popravek = n.popravljeno_at ? `<div class="ur-popravek">✎ Popravljeno · ${escape_(n.popravil || 'osebje')} · ${datumcas(n.popravljeno_at)}${n.popravki ? '<div class="ur-popravki">' + escape_(n.popravki).replace(/\n/g, '<br>') + '</div>' : ''}</div>` : '';
    const ustvarjenoV = n.source === 'portal' ? `<p class="ur-ustvarjeno">✚ Ustvarjeno v portalu${n.issued_name ? ' · ' + escape_(n.issued_name) : ''}</p>` : '';
    const gumbi = '<div class="u-acts" style="margin-top:12px"><button type="button" data-natisni>Natisni</button>' +
      (OSEBJE ? '<button type="button" data-uredi>Uredi</button><button type="button" class="danger" data-izbrisi>Izbriši</button>' : '') + '</div>';
    box.innerHTML = '<div class="a-det-in"><div class="a-det-pad">' + seznam + izdalV + ustvarjenoV + popravek + opombeAppHtml(n) + opombaHtml(n) + gumbi + '</div></div>';
    box.querySelector('[data-natisni]').addEventListener('click', () => natisniList(box));
    if (OSEBJE) {
      box.querySelector('[data-uredi]').addEventListener('click', () => urediList(box));
      box.querySelector('[data-izbrisi]').addEventListener('click', () => izbrisiList(box));
    }
    wireOpomba(box);
  }

  /* ── Opombi iz aplikacije (za stranko + za evidenco), samo prikaz ── */
  function opombeAppHtml(n) {
    n = n || {};
    var out = '';
    if (n.opomba_stranka) out += '<div class="opomba-blok"><div class="opomba-h">Opomba za stranko (na natisu)</div>' +
      '<div class="opomba-prikaz"><div class="opomba-besedilo" style="white-space:pre-wrap">' + escape_(n.opomba_stranka) + '</div></div></div>';
    if (n.opomba_evidenca) out += '<div class="opomba-blok"><div class="opomba-h">Opomba za evidenco (interno — se ne natisne)</div>' +
      '<div class="opomba-prikaz"><div class="opomba-besedilo" style="white-space:pre-wrap">' + escape_(n.opomba_evidenca) + '</div></div></div>';
    return out;
  }

  /* ── Pisna opomba na spremnem listu (z avtorjem) ── */
  function opombaHtml(n) {
    n = n || {};
    var obst = n.opomba ? '<div class="opomba-prikaz"><div class="opomba-besedilo">' + escape_(n.opomba) + '</div>' +
      '<div class="opomba-avtor">— ' + escape_(n.opomba_avtor || 'osebje') + (n.opomba_at ? ' · ' + datumcas(n.opomba_at) : '') + '</div></div>' : '';
    if (!OSEBJE) {
      return obst ? '<div class="opomba-blok"><div class="opomba-h">Opomba</div>' + obst + '</div>' : '';
    }
    return '<div class="opomba-blok"><div class="opomba-h">Opomba</div>' + obst +
      '<textarea class="opomba-vnos" data-opomba rows="2" maxlength="600" placeholder="Dodaj pisno opombo …">' + escape_(n.opomba || '') + '</textarea>' +
      '<div class="opomba-acts"><button type="button" class="opomba-save" data-opomba-shrani>' + (n.opomba ? 'Posodobi opombo' : 'Shrani opombo') + '</button>' +
      (n.opomba ? '<button type="button" class="opomba-remove" data-opomba-brisi>Odstrani opombo</button>' : '') +
      '</div><div class="msg" data-opomba-msg role="status" aria-live="polite"></div></div>';
  }
  function wireOpomba(box) {
    if (!OSEBJE) return;
    var sh = box.querySelector('[data-opomba-shrani]');
    if (sh) sh.addEventListener('click', function () { shraniOpombo(box, false); });
    var br = box.querySelector('[data-opomba-brisi]');
    if (br) br.addEventListener('click', function () { shraniOpombo(box, true); });
  }
  async function shraniOpombo(box, izbrisi) {
    var ta = box.querySelector('[data-opomba]');
    var m = box.querySelector('[data-opomba-msg]');
    var txt = izbrisi ? '' : (ta ? ta.value.trim() : '');
    if (m) { m.className = 'msg show'; m.textContent = 'Shranjujem …'; }
    var novo = {
      opomba: txt || null,
      opomba_avtor: txt ? (JAZIME || 'osebje') : null,
      opomba_at: txt ? new Date().toISOString() : null
    };
    var r = await sb.from('delivery_notes').update(novo).eq('id', box._id);
    if (r && r.error) { if (m) { m.className = 'msg bad show'; m.textContent = 'Napaka: ' + r.error.message; } return; }
    // Posodobi lokalno stanje in ponovno izriši detajl.
    Object.assign(box._note, novo);
    var li = LISTI.find(function (l) { return l.id === box._id; }); if (li) Object.assign(li, novo);
    logDodaj('Arhiv', izbrisi ? 'Opomba odstranjena' : 'Opomba', 'Spremni list ' + ((box._note && box._note.number) || '') + (txt ? ': „' + txt + '"' : ''));
    risiListDetajl(box);
  }

  function razcleniStevilko(s) {
    const d = String(s || '').split(/[\/\-]/).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
    const letos = new Date().getFullYear();
    let seq, leto;
    if (d.length >= 2) {
      if (d[0] >= 2000 && d[1] < 2000) { leto = d[0]; seq = d[1]; } else { seq = d[0]; leto = d[1]; }
    } else { seq = d[0] || ''; leto = letos; }
    return { seq: seq || '', leto: leto || letos };
  }

  async function izbrisiList(box) {
    var _ok = await potrdiModal({ naslov: 'Izbriši spremni list', sporocilo: 'Izbrišem spremni list ' + (box._note.number || '') + '? Shrani se v »Nedavno brisani« in ga je mogoče 30 dni obnoviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!_ok) return;
    box.innerHTML = '<p class="u-sub">Brišem …</p>';
    try {
      if (_softDelDN) {
        // Soft-delete (koš): podatek OSTANE, samo skrit. Postavke pustimo (za obnovitev).
        var r = await sb.from('delivery_notes').update({ deleted_at: new Date().toISOString() }).eq('id', box._id);
        if (r.error) throw r.error;
      } else {
        // Rezerva, če migracija 50 (deleted_at) še ni zagnana → staro dokončno brisanje.
        var r1 = await sb.from('delivery_note_items').delete().eq('note_id', box._id);
        if (r1.error) throw r1.error;
        var r2 = await sb.from('delivery_notes').delete().eq('id', box._id);
        if (r2.error) throw r2.error;
      }
      pozabiPostavke(box._id);
      logDodaj('Arhiv', 'Izbrisano', 'Spremni list ' + ((box._note && box._note.number) || '') + (_softDelDN ? ' (v koš)' : ''));
      toast(_softDelDN ? 'Premaknjeno v »Nedavno brisani«' : 'Spremni list izbrisan');
      await naloziListe();
      risiArhiv();
    } catch (e) {
      box.innerHTML = '<p class="u-sub">Napaka pri brisanju: ' + escape_(e.message || e) + '</p>';
    }
  }

  // Naloži artikle stranke (id, naziv, koda) za spustni seznam postavk v Arhivu.
  async function nalozArtSez(box) {
    const os = box.querySelector('[data-org]');
    const org_id = os ? os.value : '';
    box._arts = [];
    box._artsOrg = org_id;        // za katero stranko je ta seznam
    box._artsNapaka = null;
    if (!org_id) return;
    await nalozicenik();
    try {
      let data;
      const _r = await sb.from('articles').select('id,name,cena_sifra,teza').eq('org_id', org_id).order('sort_order');
      if (_r.error) { data = (await sb.from('articles').select('id,name,cena_sifra').eq('org_id', org_id).order('sort_order')).data; }
      else data = _r.data;
      var vid = {};
      box._arts = [];
      (data || []).forEach(function (a) {
        if (a.cena_sifra != null) { if (vid[a.cena_sifra]) return; vid[a.cena_sifra] = true; } // brez podvojenih (isti artikel)
        box._arts.push({ id: a.id, name: a.name || '', koda: (a.cena_sifra != null && CENIKMAP && CENIKMAP[a.cena_sifra]) ? normId(CENIKMAP[a.cena_sifra].koda) : '', sifra: a.cena_sifra, teza: (a.teza != null && a.teza !== '') ? parseFloat(a.teza) : null });
      });
      // dodaj LASTNE artikle stranke (pricelist z org_id te stranke), ki še nimajo članstva
      (CENIK || []).forEach(function (x) {
        if (x.org_id === org_id && !vid[x.sifra]) { vid[x.sifra] = true; box._arts.push({ id: null, name: x.naziv || '', koda: normId(x.koda), sifra: x.sifra, teza: (x.teza != null && x.teza !== '') ? parseFloat(x.teza) : null }); }
      });
      // UPORABA PO STRANKI iz obstoječe evidence: skupno opranih kosov na artikel
      // (RPC stranka_kosi — isti podatek kot v razdelku Stranke). Uporabo uporabimo le
      // za FILTER (skrij artikle, ki jih stranka (skoraj) ne uporablja), VRSTNI RED pa
      // ostane enak kot v ceniku (sort_order) — ne po pogostosti.
      try {
        var kosMap = {};
        var _kr = await sb.rpc('stranka_kosi', { p_org: org_id });
        if (_kr && !_kr.error) (_kr.data || []).forEach(function (x) { kosMap[x.article_id] = Number(x.kosov) || 0; });
        box._arts.forEach(function (a, i) { a._u = (a.id && kosMap[a.id]) ? kosMap[a.id] : 0; a._i0 = i; });
        box._imaUporabo = box._arts.some(function (a) { return a._u > 0; });
        box._arts.sort(function (x2, y2) { return x2._i0 - y2._i0; });   // vrstni red kot v ceniku
      } catch (e2) { box._imaUporabo = false; }
    } catch (e) {
      // Prej se je napaka požrla in seznam je ostal prazen — videti je bilo, kot da
      // stranka nima artiklov. Zdaj razlog zabeležimo in ga tudi pokažemo.
      box._arts = [];
      box._artsNapaka = (e && e.message) || String(e);
      try { console.warn('[artikli] seznama za stranko ni bilo mogoče naložiti:', e); } catch (_) {}
    }
  }
  // Polje »Leto« je skrito — letnica je že v datumu — shranjevanje pa ga bere,
  // zato sledi datumu. Velja za nov list in za urejanje obstoječega.
  function letoIzDatuma(box) {
    const dIn = box.querySelector('[data-datum]');
    const lIn = box.querySelector('[data-leto]');
    if (!dIn || !lIn) return;
    const uskladi = function () {
      const l = (dIn.value || '').slice(0, 4);
      if (/^\d{4}$/.test(l)) lIn.value = l;
    };
    dIn.addEventListener('input', uskladi);
    dIn.addEventListener('change', uskladi);
  }

  // ── Glava lista pred postavkami (samo NOV list) ─────────────────────────
  // Pri NOVEM listu se stranka, datum in številka privzamejo (prazna, danes,
  // naslednja prosta) in jih je lahko spregledati. List, vpisan za nazaj, pod
  // napačno številko ali na napačno stranko, tiho pristane v napačnem
  // obračunskem obdobju ali pri napačnem naročniku — pri fakturah se to pokaže
  // šele, ko je račun že zunaj. Zato so postavke zaklenjene, dokler niso
  // potrjena vsa tri polja: sprememba vrednosti je potrditev sama po sebi,
  // sicer je tu kljukica. Letnica ostane vidna v kljukici pri številki.
  //
  // Pri UREJANJU teh vrat ni: vsa tri polja so bila zahtevana že ob nastanku
  // lista, zato bi bila ponovna potrditev ob vsakem popravku le napoto.
  function vnosVrata(box) {
    const pBox = box.querySelector('[data-postavke]');
    if (!pBox) return;
    const oIn = box.querySelector('[data-org]');
    const dIn = box.querySelector('[data-datum]');
    const sIn = box.querySelector('[data-seq]');
    const lIn = box.querySelector('[data-leto]');
    const dodaj = box.querySelector('[data-dodaj]');
    const dnes = new Date().toISOString().slice(0, 10);

    const vrata = document.createElement('div');
    vrata.className = 'ur-dv';
    vrata.innerHTML = '<span class="ur-dv-txt">Najprej potrdi stranko, datum in številko lista — do takrat postavk ni mogoče vpisovati.</span>'
      + '<span class="ur-dv-polja"></span>';
    pBox.parentNode.insertBefore(vrata, pBox);
    const polja = vrata.querySelector('.ur-dv-polja');

    letoIzDatuma(box);

    const kosi = [];
    const vsiOsvezi = function () { kosi.forEach(function (k) { k.osvezi(); }); };
    const potrdi = function (k) {
      if (!k.el.value || k.ok) return;
      k.ok = true;
      k.gumb.classList.add('on');
      k.gumb.setAttribute('aria-pressed', 'true');
      k.el.classList.remove('dv-treba');
      vsiOsvezi();
      if (kosi.every(function (x) { return x.ok; })) odkleni();
    };
    const odkleni = function () {
      box._glavaOk = true;
      vrata.remove();
      pBox.classList.remove('ur-zaklep');
      try { pBox.inert = false; } catch (_) {}
      if (dodaj) dodaj.disabled = false;
      kosi.forEach(function (k) { k.el.classList.remove('dv-treba'); });
    };
    const kos = function (el, ime, besedilo) {
      if (!el) return;
      const gumb = document.createElement('button');
      gumb.type = 'button';
      gumb.className = 'ur-dv-ok';
      gumb.setAttribute('aria-pressed', 'false');
      polja.appendChild(gumb);
      const k = { el: el, gumb: gumb, ok: false };
      k.osvezi = function () {
        gumb.disabled = !el.value;
        gumb.innerHTML = '<span class="ur-dv-kljuk" aria-hidden="true">' + (k.ok ? '✓' : '') + '</span>'
          + escape_(ime + ' ' + (el.value ? besedilo() : '—'));
        gumb.title = k.ok ? 'potrjeno' : 'klikni za potrditev (ali popravi polje zgoraj)';
      };
      k.osvezi();
      el.classList.add('dv-treba');
      gumb.addEventListener('click', function () { potrdi(k); });
      el.addEventListener('input', vsiOsvezi);
      el.addEventListener('change', function () { potrdi(k); vsiOsvezi(); });
      kosi.push(k);
    };

    box._glavaOk = false;
    pBox.classList.add('ur-zaklep');
    try { pBox.inert = true; } catch (_) {}
    if (dodaj) dodaj.disabled = true;

    kos(oIn, 'Stranka', function () { const o = oIn.options[oIn.selectedIndex]; return o ? o.textContent : ''; });
    kos(dIn, 'Datum', function () { return dIn.value === dnes ? datum(dIn.value) + ' · danes' : datum(dIn.value); });
    kos(sIn, 'Št.', function () { return sIn.value + (lIn && lIn.value ? '/' + lIn.value : ''); });
    if (!kosi.length) { vrata.remove(); odkleni(); }
  }
  async function urediList(box) {
    const n = box._note;
    const st = razcleniStevilko(n.number);
    const dnes = n.doc_date || new Date().toISOString().slice(0, 10);
    const orgOpt = ORGSEZNAM.map(o => `<option value="${o.id}"${o.id === n.org_id ? ' selected' : ''}>${escape_(o.name)}</option>`).join('');
    box.innerHTML = `<div class="ur-form">
      <label class="ur-f"><span>Stranka</span><select data-org>${orgOpt}</select></label>
      <div class="ur-grid ur-grid-3">
        <label class="ur-f"><span>Št.</span><input type="number" data-seq value="${st.seq}"></label>
        <label class="ur-f" hidden><span>Leto</span><input type="number" data-leto value="${st.leto}"></label>
        <label class="ur-f"><span>Datum</span><input type="date" data-datum value="${escape_(dnes)}"></label>
        <label class="ur-f"><span>Teža (samodejno)</span><output class="ur-kg-auto" data-teza-auto>—</output></label>
      </div>
      <label class="ur-f"><span>Izdal (izvirni — se ne spreminja)</span><input type="text" data-izdal value="${escape_(n.issued_name || '')}" readonly style="opacity:.6;cursor:not-allowed"></label>
      <div class="ur-f"><span>Vrsta prevoza</span>${segPrevoz(n.transport)}</div>
      <p class="u-sub" style="margin:10px 0 4px">Postavke — izberi artikel (z ID) iz kataloga stranke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj postavko</button>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Shrani</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    await nalozArtSez(box);
    function napolniPn(sel, curName, curId) {
      var arts = box._arts || [];
      // Najprej poveži po ID artikla — preimenovan artikel se prepozna in dobi novo ime (brez »star zapis«).
      var poId = null;
      if (curId != null && curId !== '') { for (var _i = 0; _i < arts.length; _i++) { if (arts[_i].id != null && String(arts[_i].id) === String(curId)) { poId = arts[_i]; break; } } }
      var matched = !!poId || arts.some(function (a) { return a.name === curName; });
      var opts = '';
      if (curName && !matched) opts += '<option value="' + escape_(curName) + '" data-aid="" selected>' + escape_(curName) + ' — star zapis</option>';
      opts += '<option value="">— izberi artikel —</option>';
      arts.forEach(function (a) {
        var lab = a.name;
        var izb = poId ? (a === poId) : (a.name === curName);
        opts += '<option value="' + escape_(a.name) + '" data-aid="' + escape_(String(a.id || '')) + '" data-sifra="' + escape_(String(a.sifra != null ? a.sifra : '')) + '" data-teza="' + escape_(String(a.teza != null ? a.teza : '')) + '" data-koda="' + escape_(a.koda || '') + '"' + (izb ? ' selected' : '') + '>' + escape_(lab) + '</option>';
      });
      sel.innerHTML = opts;
    }
    const osveziKg = () => osveziKgPrikaz(box);
    const dodajVrstico = (naziv = '', kosov = '', artId = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<button type="button" class="ur-grip dnd-handle" title="povleci za razvrščanje" aria-label="razvrsti">${DND_ICON}</button><span class="ur-pid" data-pid aria-hidden="true"></span><select data-pn class="ur-pn" aria-label="Artikel"></select><input type="number" inputmode="numeric" min="0" step="1" aria-label="Količina (kosov)" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      napolniPn(row.querySelector('[data-pn]'), naziv, artId);
      _osveziPid(row);
      row.querySelector('[data-del]').addEventListener('click', () => { row.remove(); osveziKg(); });
      row.querySelector('[data-pn]').addEventListener('change', () => { if (_dvojnikArtikla(row)) { var s = row.querySelector('[data-pn]'); if (s) s.value = ''; toast('Ta artikel je že na seznamu.'); } osveziKg(); _ocenaPostavke(row); _osveziPid(row); });
      row.querySelector('[data-pk]').addEventListener('input', () => { osveziKg(); _ocenaPostavke(row); });
      row.querySelector('[data-pk]').addEventListener('keydown', _pkEnter);
      pBox.appendChild(row);
      _ocenaPostavke(row);
      dndSort(pBox, '.ur-post', '.ur-grip', osveziKg);   // povleci za vrstni red
    };
    (box._items || []).forEach(p => dodajVrstico(p.naziv, p.kosov, p.artId));
    if (!(box._items || []).length) dodajVrstico();
    osveziKg();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => risiListDetajl(box));
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniList(box));
    wireSeg(box);
    letoIzDatuma(box);   // vrat s kljukicami tu ni — polja so bila zahtevana že ob nastanku lista
    // Menjava stranke med urejanjem: VEDNO svež premade seznam izbrane stranke s praznimi
    // količinami (tudi ob preklopu nazaj na izvirno stranko) — stare postavke in številke ne ostanejo.
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', async () => {
        // Nalaganje artiklov so tri omrežne poizvedbe. Ob hitri dvojni menjavi stranke
        // sta se dve nalaganji prekrivali in kasnejši odgovor je povozil prejšnjega —
        // seznam je pripadal napačni stranki ali pa je ostal prazen. Zato si zapomnimo,
        // katero stranko smo hoteli, in zastarel odgovor zavržemo.
        const _zelena = _os.value;
        box._artsSeq = (box._artsSeq || 0) + 1;
        const _mojaSeq = box._artsSeq;
        pBox.innerHTML = '<p class="u-sub" style="padding:6px 2px">Nalagam artikle …</p>';
        await nalozArtSez(box);
        if (_mojaSeq !== box._artsSeq || _os.value !== _zelena) return;   // vmes spet zamenjana
        pBox.innerHTML = '';
        if (box._artsNapaka) {
          pBox.innerHTML = '<p class="msg bad show" style="margin:6px 0">Artiklov ni bilo mogoče naložiti: ' + escape_(box._artsNapaka) + '</p>';
          dodajVrstico(); osveziKg();
          return;
        }
        const arts = box._arts || [];
        let izbor = box._imaUporabo ? arts.filter(a => a._u > 0) : arts;
        if (!izbor.length) izbor = arts;
        const vid = {};
        izbor.forEach(a => {
          if (!a.name) return;
          const k = (a.sifra != null && !isNaN(a.sifra)) ? ('s' + a.sifra) : (a.id ? ('a' + a.id) : ('n' + a.name.trim().toLowerCase()));
          if (vid[k]) return; vid[k] = 1; dodajVrstico(a.name, '');
        });
        if (!pBox.children.length) dodajVrstico();
        osveziKg();
      }); }
  }

  async function shraniList(box) {
    const q = s => box.querySelector(s);
    const msg = q('[data-msg]');
    const org_id = q('[data-org]').value;
    const seq = parseInt(q('[data-seq]').value, 10);
    const leto = parseInt(q('[data-leto]').value, 10);
    const doc_date = q('[data-datum]').value;
    const _kgEl = q('[data-teza-auto]');
    const _kgAuto = _kgEl && _kgEl.dataset.kg !== '' && _kgEl.dataset.kg != null ? Number(_kgEl.dataset.kg) : null;
    if (!org_id) { msg.textContent = 'Izberi stranko.'; return; }
    if (!seq || !leto) { msg.textContent = 'Vpiši številko in leto.'; return; }
    if (!doc_date) { msg.textContent = 'Vpiši datum.'; return; }
    const postavke = zdruziPodvojene([...box.querySelectorAll('.ur-post')].map(r => {
      const sel = r.querySelector('[data-pn]');
      const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
      return {
        naziv: (sel ? sel.value : '').trim(),
        artId: opt && opt.dataset.aid ? opt.dataset.aid : null,
        sifra: opt && opt.dataset.sifra ? parseInt(opt.dataset.sifra, 10) : null,
        kosov: parseInt(r.querySelector('[data-pk]').value, 10) || 0
      };
    }).filter(p => p.naziv && p.kosov > 0));   // prazne premade vrstice (brez količine) preskočimo — enako kot pri novem listu
    if (!postavke.length) { msg.textContent = 'Vpiši količino vsaj pri enem artiklu.'; return; }
    msg.textContent = 'Shranjujem …';
    try {
      const { data: arts } = await sb.from('articles').select('id,name').eq('org_id', org_id);
      const poImenu = {};
      (arts || []).forEach(a => { poImenu[(a.name || '').trim().toLowerCase()] = a.id; });
      // za izbrane LASTNE artikle brez članstva ustvari povezavo (veljaven article_id)
      for (const p of postavke) {
        if (!p.artId && p.sifra != null && !isNaN(p.sifra)) {
          const ins = await sb.from('articles').insert({ org_id, name: p.naziv, cena_sifra: p.sifra }).select('id').maybeSingle();
          if (ins && ins.data) { p.artId = ins.data.id; if (CLANI) CLANI.push({ id: ins.data.id, org_id: org_id, name: p.naziv, cena_sifra: p.sifra, sort_order: null }); }
        }
      }
      let r = await sb.from('delivery_notes').update({
        org_id, doc_seq: seq, doc_year: leto, doc_date,
        weight_kg: _kgAuto,
        transport: beriPrevoz(box),
        popravil: JAZIME || 'osebje',
        popravljeno_at: new Date().toISOString()
      }).eq('id', box._id);
      if (r.error) throw r.error;
      r = await sb.from('delivery_note_items').delete().eq('note_id', box._id);
      if (r.error) throw r.error;
      if (postavke.length) {
        const rows = postavke.map((p, i) => ({
          note_id: box._id, article_name: p.naziv,
          article_id: p.artId || poImenu[p.naziv.toLowerCase()] || null,
          pieces: p.kosov, sort_order: i
        }));
        r = await sb.from('delivery_note_items').insert(rows);
        if (r.error) throw r.error;
      }
      delete _POST_CACHE[box._id];   // KLJUČNO: sicer ponovni prikaz/urejanje pokaže stare postavke in jih ob shranjevanju zapiše nazaj
      pozabiPostavke(box._id);
      logDodaj('Arhiv', 'Urejeno', 'Spremni list ' + ((box._note && box._note.number) || ''));
      toast('Spremni list shranjen');
      const _vrniSe = box._id;
      await naloziListe();
      risiArhiv();
      pokaziList(_vrniSe);
    } catch (e) {
      msg.textContent = 'Napaka: ' + (e.message || e);
    }
  }

  /* ══════════ DOKUMENTI (predogled, tisk, PDF) — en slog za vse ══════════
     Vzor je spremni list (enak izgled kot v aplikaciji na tablici). Logotip je povsod ISTI
     kot v portalu (.wordmark): Playfair Display 700, razmik -0,03 em, »Smart« #0d1f17,
     »Clean« #1a6644 — v HTML kot besedilo v pisavi iz fonts/, v PDF kot vektorsko besedilo
     v isti pisavi (pdfgen.js). Nikoli slika ali nadomestna pisava. Logotip je na dokumentu
     ENKRAT, na vrhu. */
  var DOK_BIZ = ['BSMART d.o.o.', 'Škalska cesta 6, 3210 Slovenske Konjice', '+386 41 209 676', '+386 68 693 988', 'blanka.kovacic1@gmail.com'];
  // Absolutni naslovi pisav: delujejo tudi v tiskalnem oknu brez osnovnega naslova.
  function _dokPis(ime) { return new URL('fonts/' + ime, location.href).href; }
  var _DOK_LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  var _DOK_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
  function dokCss() {
    // font-display:block — dokument nikoli ne pokaže (ali natisne) nadomestne pisave.
    return "@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-display:block;src:url('" + _dokPis('archivo-latin-wght-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_LAT + "}" +
      "@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-display:block;src:url('" + _dokPis('archivo-latin-ext-wght-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_EXT + "}" +
      "@font-face{font-family:'Playfair Display';font-style:normal;font-weight:700;font-display:block;src:url('" + _dokPis('playfair-display-latin-700-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_LAT + "}" +
      "@font-face{font-family:'Playfair Display';font-style:normal;font-weight:700;font-display:block;src:url('" + _dokPis('playfair-display-latin-ext-700-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_EXT + "}" +
      `@page{size:A4;margin:0}
      *{box-sizing:border-box}
      html{background:#e9edeb}
      body{margin:0;background:#e9edeb;color:#0a0a0a;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
      .a4{position:relative;padding:12mm 12mm 14mm;color:#0a0a0a;background:#fff;min-height:297mm;break-after:page}
      .a4:last-child{break-after:auto}
      .a4+.a4{margin-top:14px}
      @media print{html,body{background:#fff}.a4{min-height:0}.a4+.a4{margin-top:0}}
      .sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1.5px solid #0a0a0a}
      .sc-wm{font-family:'Playfair Display',serif;font-weight:700;letter-spacing:-.03em;line-height:.9;font-size:32px;color:#0d1f17;white-space:nowrap}
      .sc-wm span{color:#1a6644}
      .sc-biz{font-size:9px;line-height:1.6;text-align:right;color:#666;white-space:nowrap;font-weight:500}
      .sc-box{border:1px solid #dcdcdc;border-radius:9px;padding:10px 14px;margin-bottom:10px}
      .sc-num{font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
      .sc-num b{font-variant-numeric:tabular-nums;letter-spacing:.01em}
      .sc-num .sc-obd{font-size:11px;font-weight:500;color:#666;font-variant-numeric:tabular-nums}
      .sc-client{display:flex;justify-content:space-between;gap:14px}
      .sc-client .cl{font-size:12px}
      .sc-client .cname{font-weight:700;border-bottom:2px solid #0a0a0a;padding:0 2px}
      .sc-client .cname-sec{font-weight:400;color:#6b7280;font-size:.85em;margin-left:4px}
      .sc-client .sc-addr{margin-top:6px;font-size:11px;color:#666}
      .sc-client .sc-dates{margin-top:10px;font-size:11px;color:#666}
      .sc-sign{border-left:1px solid #dcdcdc;padding-left:16px;font-weight:600;font-size:12px;min-width:110px;color:#666}
      table.sc-table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}
      table.sc-table th{color:#0a0a0a;font-weight:700;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:0 8px 8px;text-align:center;border-bottom:1.5px solid #0a0a0a}
      table.sc-table th.l{text-align:left}
      table.sc-table th.r,table.sc-table td.r{text-align:right}
      table.sc-table td{border-bottom:1px solid #ececec;padding:5px 8px;height:15px;font-variant-numeric:tabular-nums}
      table.sc-table td.an{color:#0a0a0a;font-weight:600;text-align:left}
      table.sc-table td.qty{text-align:center;font-weight:700;width:34%;color:#0a0a0a}
      table.sc-table td.b{font-weight:700}
      table.sc-table tfoot td{border-top:1.5px solid #0a0a0a;border-bottom:none;font-weight:700;padding-top:8px}
      .sc-weight{margin-top:12px;font-size:12px;color:#0a0a0a;text-align:right;font-weight:600}
      .sc-note{margin-top:10px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;white-space:pre-wrap}
      .sc-popr{margin-top:10px;padding:6px 10px;border-radius:8px;background:#fdf3e8;color:#8a5a00;font-size:11px;font-weight:600}
      .sc-tot{margin:12px 0 0 auto;width:55%;font-size:11px}
      .sc-tot div{display:flex;justify-content:space-between;gap:12px;padding:5px 8px;border-bottom:1px solid #ececec}
      .sc-tot div span{color:#666}
      .sc-tot div b{font-variant-numeric:tabular-nums}
      .sc-tot .bruto{border-top:1.5px solid #0a0a0a;border-bottom:none;margin-top:4px;padding-top:8px;font-size:13px}
      .sc-tot .bruto span{color:#0a0a0a;font-weight:700}
      .sc-pozor{margin-top:10px;font-size:10px;color:#8a5a00}`;
  }
  function dokGlavaHtml() {
    return '<div class="sc-head"><div class="sc-wm">Smart<span>Clean</span></div><div class="sc-biz">' + DOK_BIZ.map(escape_).join('<br>') + '</div></div>';
  }
  // telo: en list ali seznam listov — vsak list A4 ima glavo z logotipom enkrat, na vrhu.
  function dokHtml(naslov, telo) {
    var listi = Array.isArray(telo) ? telo : [telo];
    return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><title>' + escape_(naslov) + '</title><style>' + dokCss() + '</style></head><body>' +
      listi.map(function (t) { return '<div class="a4">' + dokGlavaHtml() + t + '</div>'; }).join('') + '</body></html>';
  }
  function sklonListov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'spremni list' : m === 2 ? 'spremna lista' : (m === 3 || m === 4) ? 'spremni listi' : 'spremnih listov'); }
  // »1 redni prevoz«, »2 redna prevoza«, »3 redni prevozi«, »5 rednih prevozov« (vrsta: 'redni' / 'izredni').
  function sklonPrevoz(n, vrsta) {
    var m = n % 100;
    var pr = m === 1 ? vrsta : m === 2 ? vrsta.replace(/i$/, 'a') : (m === 3 || m === 4) ? vrsta : vrsta.replace(/i$/, 'ih');
    return stevilo(n) + ' ' + pr + ' ' + (m === 1 ? 'prevoz' : m === 2 ? 'prevoza' : (m === 3 || m === 4) ? 'prevozi' : 'prevozov');
  }
  function fakPrevozi(g) { return sklonPrevoz(g.redni || 0, 'redni') + (g.izredni ? ' · ' + sklonPrevoz(g.izredni, 'izredni') : ''); }

  // ── PDF v istem slogu: mere iz CSS zgoraj (1 px = 0,75 pt) ──
  var PT = 0.75;
  var DPDF = { M: 34.02, SP: 39.69, INK: [10 / 255, 10 / 255, 10 / 255], SIVA: [102 / 255, 102 / 255, 102 / 255], SIVA2: [107 / 255, 114 / 255, 128 / 255],
    CRTA: [236 / 255, 236 / 255, 236 / 255], OKVIR: [220 / 255, 220 / 255, 220 / 255], OKVIR2: [221 / 255, 221 / 255, 221 / 255],
    POPR_BG: [253 / 255, 243 / 255, 232 / 255], POPR: [138 / 255, 90 / 255, 0], POZOR: [138 / 255, 90 / 255, 0] };
  // Osnovna črta prve vrstice v okvirju: vrh + (višina vrstice − višina pisave)/2 + vzpon (Archivo ≈ 0,878 em, vsa ≈ 1,088 em).
  function dpdfOsnova(vrh, pisavaPt, vrsticaPt) { return vrh + (vrsticaPt - 1.088 * pisavaPt) / 2 + 0.878 * pisavaPt; }
  function dpdfGlava(doc) {
    var M = DPDF.M, R = doc.W - M, lh = 9 * 1.6 * PT, h = DOK_BIZ.length * lh;
    DOK_BIZ.forEach(function (t, i) { doc.text(R, dpdfOsnova(M + i * lh, 9 * PT, lh), t, { size: 9 * PT, align: 'right', color: DPDF.SIVA }); });
    var dno = M + h;
    // .sc-wm: 32 px, line-height .9, poravnan na dno glave (align-items:flex-end)
    doc.logo(M, dno - 1.3, 32 * PT);
    var yl = dno + 14 * PT;
    doc.line(M, yl + 0.56, R, yl + 0.56, { width: 1.5 * PT, color: DPDF.INK });
    return yl + 1.5 * PT + 18 * PT;
  }
  function dpdfOkvir(doc, y, h) { doc.rrect(DPDF.M, y, doc.W - 2 * DPDF.M, h, 9 * PT, { stroke: DPDF.OKVIR, width: 1 * PT }); }
  // Prelom besedila na širino (po besedah; predolge besede ostanejo cele).
  function dpdfVrstice(doc, str, size, maxW, o) {
    var out = [];
    String(str == null ? '' : str).split(/\n/).forEach(function (odst) {
      var vr = '';
      odst.split(/\s+/).forEach(function (b) {
        if (!b) return;
        var t = vr ? vr + ' ' + b : b;
        if (vr && doc.width(t, size, o) > maxW) { out.push(vr); vr = b; } else vr = t;
      });
      out.push(vr);
    });
    return out;
  }
  // Glava tabele (.sc-table th): stolpci [{t, x, align}] ; vrne y pod črto.
  function dpdfTabGlava(doc, y, stolpci) {
    var fs = 9 * PT, osn = y + 0.878 * fs + 0.5;
    stolpci.forEach(function (c) { doc.text(c.x, osn, String(c.t).toUpperCase(), { size: fs, bold: true, spacing: 0.09, align: c.align || 'left', color: DPDF.INK }); });
    var yl = y + 9 * 1.2 * PT + 8 * PT;
    doc.line(DPDF.M, yl + 0.56, doc.W - DPDF.M, yl + 0.56, { width: 1.5 * PT, color: DPDF.INK });
    return yl + 1.5 * PT;
  }
  var DPDF_VRSTA = 26 * PT;   // td: 15 px + 2 × 5 px + 1 px črta
  function dpdfTabVrsta(doc, y, celice) {
    var fs = 10 * PT, osn = dpdfOsnova(y + 5 * PT, fs, 15 * PT);
    celice.forEach(function (c) { doc.text(c.x, osn, c.t, { size: fs, weight: c.w || 400, bold: c.w === 700, align: c.align || 'left', color: DPDF.INK }); });
    var yl = y + 25 * PT;
    doc.line(DPDF.M, yl + 0.37, doc.W - DPDF.M, yl + 0.37, { width: 1 * PT, color: DPDF.CRTA });
    return yl + 1 * PT;
  }
  // Vrstice tabele s preloma strani: zadnji dve vrstici gresta vedno skupaj z blokom pod
  // tabelo (seštevki), da ta nikoli ne ostane sam na novi strani. Na nadaljevanju se
  // ponovi glava tabele, pred njo pa (neobvezno) oznaka »… — nadaljevanje«.
  function dpdfTabela(doc, y, st, vrstice, blokPod, nadaljevanje) {
    var n = vrstice.length;
    for (var i = 0; i < n; i++) {
      var ostane = n - i, rezerva = ostane <= 2 ? ostane * DPDF_VRSTA + (blokPod || 0) : DPDF_VRSTA;
      if (i > 0 && !dpdfProstor(doc, y, rezerva)) {
        y = dpdfNovaStran(doc);
        if (nadaljevanje) y = dpdfNadaljevanje(doc, y, nadaljevanje);
        y = dpdfTabGlava(doc, y, st);
      }
      y = dpdfTabVrsta(doc, y, vrstice[i]);
    }
    return y;
  }
  function dpdfNadaljevanje(doc, y, besedilo) {
    doc.text(DPDF.M, dpdfOsnova(y, 11 * PT, 11 * 1.2 * PT), besedilo + ' — nadaljevanje', { size: 11 * PT, weight: 600, color: DPDF.SIVA });
    return y + 11 * 1.2 * PT + 10 * PT;
  }
  // Nova stran brez glave (logotip je le na prvi strani); vrne začetni y.
  function dpdfNovaStran(doc) { doc.addPage(); return DPDF.M; }
  function dpdfProstor(doc, y, potrebno) { return y + potrebno <= doc.H - DPDF.SP; }

  function spremniDocHtml(box) {
    const n = box._note || {};
    const items = box._items || [];
    const org = ORGSEZNAM.find(o => o.id === n.org_id) || {};
    const naziv = org.legal_name || org.name || ORGIME[n.org_id] || '—';
    const nazivSek = (org.legal_name && org.name && org.name !== org.legal_name) ? org.name : '';
    const rows = items.length
      ? items.map(p => `<tr><td class="an">${escape_(p.naziv)}</td><td class="qty">${stevilo(p.kosov)}</td></tr>`).join('')
      : '<tr><td class="an" colspan="2" style="color:#888">Ni postavk</td></tr>';
    const izdal = n.issued_name ? ` &nbsp;·&nbsp; Izdal: ${escape_(n.issued_name)}` : '';
    const prevozP = ` &nbsp;·&nbsp; ${n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'}`;
    const kg = (n.weight_kg != null && n.weight_kg !== '') ? `<div class="sc-weight">Skupaj teža perila: <b>${tezaFmt(n.weight_kg)}</b></div>` : '';
    // Na spremni list se tiska SAMO opomba za stranko (interna opomba ostane le v portalu) — enako kot v spletni aplikaciji.
    const opombaP = n.opomba_stranka ? `<div class="sc-note"><b>Opomba:</b> ${escape_(n.opomba_stranka)}</div>` : '';
    const popr = n.popravljeno_at ? `<div class="sc-popr">Popravljeno v portalu · ${escape_(n.popravil || 'osebje')} · ${datum(String(n.popravljeno_at).slice(0, 10))}</div>` : '';
    return dokHtml('Spremni list ' + (n.number || ''),
      `<div class="sc-box sc-num"><span>Št. spremnega lista: <b>${escape_(n.number || '—')}</b></span></div>
      <div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">${escape_(naziv)}</span>${nazivSek ? ' <span class="cname-sec">(' + escape_(nazivSek) + ')</span>' : ''}</div><div class="sc-dates">Oddaja: ${datum(n.doc_date)}${izdal}${prevozP}</div></div><div class="sc-sign">Podpis:</div></div>
      <table class="sc-table"><thead><tr><th class="l">Naziv Artikla</th><th>Oddaja (št. kosov)</th></tr></thead><tbody>${rows}</tbody></table>
      ${kg}${opombaP}${popr}`);
  }
  function natisniList(box) {
    predogledDokument({ naslov: 'Spremni list ' + escape_((box._note || {}).number || ''), docHtml: spremniDocHtml(box), pdf: function () { return spremniPdfDownload(box); } });
  }

  function segPrevoz(val) {
    const v = val === 'izredni' ? 'izredni' : 'redni';
    return `<div class="seg" data-transport>
      <button type="button" class="seg-b${v === 'redni' ? ' on' : ''}" data-tv="redni">Redni</button>
      <button type="button" class="seg-b${v === 'izredni' ? ' on' : ''}" data-tv="izredni">Izredni prevoz</button>
    </div>`;
  }
  function wireSeg(box) {
    const seg = box.querySelector('[data-transport]');
    if (!seg) return;
    seg.querySelectorAll('.seg-b').forEach(b => b.addEventListener('click', () => {
      seg.querySelectorAll('.seg-b').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    }));
  }
  function beriPrevoz(box) {
    const on = box.querySelector('[data-transport] .seg-b.on');
    return on && on.dataset.tv === 'izredni' ? 'izredni' : 'redni';
  }

  // samodejni izračun teže iz artiklov: Σ(teža na kos × kosov); teža živi na ceniku (cena_sifra)
  function vsotaKgPostavk(box) {
    var kg = 0, ima = false;
    box.querySelectorAll('.ur-post').forEach(function (r) {
      var sel = r.querySelector('[data-pn]'); var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
      var kos = parseInt(r.querySelector('[data-pk]').value, 10) || 0;
      var t = (opt && opt.dataset.teza !== '' && opt.dataset.teza != null) ? parseFloat(opt.dataset.teza) : null;
      if (t != null && !isNaN(t)) { kg += t * kos; ima = true; }
    });
    return { kg: kg, ima: ima };
  }
  function osveziKgPrikaz(box) {
    var el = box.querySelector('[data-teza-auto]'); if (!el) return;
    var r = vsotaKgPostavk(box);
    el.textContent = r.ima ? tezaFmt(r.kg) : '—';
    el.dataset.kg = r.ima ? String(Math.round(r.kg * 1000) / 1000) : '';
  }
  // Nov spremni list se odpre v OKNU, ki zraste iz gumba »+ Nov spremni list«.
  // Po shranjevanju se okno skrči v kartico novega lista, ob preklicu nazaj v gumb.
  // ×, Esc ali klik na ozadje okno le zaprejo — vpisano ostane in se ob ponovnem
  // odprtju pokaže (nenameren klik ob okno ne izbriše vnosa).
  function novListOkno(box) {
    const gumb = $('arhivNovBtn');
    oknoOdpri(gumb, box, () => $('arhivNovBtn'), {
      glava: () => { const h = document.createElement('h3'); h.className = 'sec-h'; h.textContent = 'Nov spremni list'; return h; },
      obZaprtju: () => { if (box._zavrzi) { box._zavrzi = false; box.innerHTML = ''; delete box.dataset.osnutek; } }
    });
  }
  function novListZapri(box, zavrzi) {
    if (_okno && _okno.vsebina === box) { box._zavrzi = !!zavrzi; oknoZapri(); }
    else if (zavrzi) { box.innerHTML = ''; box.classList.remove('show'); delete box.dataset.osnutek; }
  }
  async function novList() {
    const box = $('novListBox');
    if (!box || _okno) return;
    if (box.dataset.osnutek) { novListOkno(box); return; }   // nedokončan vnos: odpri ga, kot je bil
    const gumb = $('arhivNovBtn'); if (gumb) gumb.classList.add('nalaga');
    const letos = new Date().getFullYear();
    let maxSeq = 0;
    LISTI.forEach(l => { const d = String(l.number || '').split('/'); if ((parseInt(d[1], 10) || 0) === letos) { const sq = parseInt(d[0], 10) || 0; if (sq > maxSeq) maxSeq = sq; } });
    const dnes = new Date().toISOString().slice(0, 10);
    const orgOpt = '<option value="">— izberi stranko —</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    box.innerHTML = `<div class="ur-form">
      <label class="ur-f"><span>Stranka</span><select data-org>${orgOpt}</select></label>
      <div class="ur-grid ur-grid-3">
        <label class="ur-f"><span>Št.</span><input type="number" data-seq value="${maxSeq + 1}"></label>
        <label class="ur-f" hidden><span>Leto</span><input type="number" data-leto value="${letos}"></label>
        <label class="ur-f"><span>Datum</span><input type="date" data-datum value="${dnes}"></label>
        <label class="ur-f"><span>Teža (samodejno)</span><output class="ur-kg-auto" data-teza-auto>—</output></label>
      </div>
      <label class="ur-f"><span>Izdal (samodejno — prijavljeni uporabnik)</span><input type="text" data-izdal value="${escape_(JAZIME || '')}" readonly style="opacity:.6;cursor:not-allowed"></label>
      <div class="ur-f"><span>Vrsta prevoza</span>${segPrevoz('redni')}</div>
      <p class="u-sub" style="margin:10px 0 4px">Postavke — seznam se samodejno napolni z artikli stranke; vpiši samo količine. Prazne se ne shranijo.</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj postavko (izven seznama)</button>
      <p class="u-sub" style="margin:12px 0 4px">Opombi (neobvezno)</p>
      <div class="ur-opomba">
        <label class="ur-f"><span>Za stranko — natisne se na spremni list</span><textarea class="ur-opomba-txt" data-opomba-stranka rows="2" maxlength="600" placeholder="Vidno stranki, natisne se …"></textarea></label>
        <label class="ur-f"><span>Interno — samo osebje, se NE natisne</span><textarea class="ur-opomba-txt" data-opomba-interno rows="2" maxlength="600" placeholder="Vidno samo osebju …"></textarea></label>
      </div>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Ustvari</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    await nalozArtSez(box);
    function napolniPn(sel, curName) {
      var arts = box._arts || [];
      var matched = arts.some(function (a) { return a.name === curName; });
      var opts = '';
      if (curName && !matched) opts += '<option value="' + escape_(curName) + '" data-aid="" selected>' + escape_(curName) + ' — ročno</option>';
      opts += '<option value="">— izberi artikel —</option>';
      arts.forEach(function (a) {
        var lab = a.name;
        opts += '<option value="' + escape_(a.name) + '" data-aid="' + escape_(String(a.id || '')) + '" data-sifra="' + escape_(String(a.sifra != null ? a.sifra : '')) + '" data-teza="' + escape_(String(a.teza != null ? a.teza : '')) + '" data-koda="' + escape_(a.koda || '') + '"' + (a.name === curName ? ' selected' : '') + '>' + escape_(lab) + '</option>';
      });
      sel.innerHTML = opts;
    }
    const osveziKg = () => osveziKgPrikaz(box);
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<button type="button" class="ur-grip dnd-handle" title="povleci za razvrščanje" aria-label="razvrsti">${DND_ICON}</button><span class="ur-pid" data-pid aria-hidden="true"></span><select data-pn class="ur-pn" aria-label="Artikel"></select><input type="number" inputmode="numeric" min="0" step="1" aria-label="Količina (kosov)" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      napolniPn(row.querySelector('[data-pn]'), naziv);
      _osveziPid(row);
      row.querySelector('[data-del]').addEventListener('click', () => { row.remove(); osveziKg(); });
      row.querySelector('[data-pn]').addEventListener('change', () => { if (_dvojnikArtikla(row)) { var s = row.querySelector('[data-pn]'); if (s) s.value = ''; toast('Ta artikel je že na seznamu.'); } osveziKg(); _ocenaPostavke(row); _osveziPid(row); });
      row.querySelector('[data-pk]').addEventListener('input', () => { osveziKg(); _ocenaPostavke(row); });
      row.querySelector('[data-pk]').addEventListener('keydown', _pkEnter);
      pBox.appendChild(row);
      _ocenaPostavke(row);
      dndSort(pBox, '.ur-post', '.ur-grip', osveziKg);   // povleci za vrstni red
      osveziKg();
    };
    // »Premade« seznam: ob izbiri stranke se postavke samodejno napolnijo z VSEMI
    // artikli iz kataloga te stranke (brez količin) — uporabnik samo vpiše številke.
    // Nov artikel, dodan stranki, se samodejno pojavi tu naslednjič. Prazne vrstice se ob shranjevanju preskočijo.
    const napolniPremade = () => {
      pBox.innerHTML = '';
      const arts = box._arts || [];
      if (!arts.length) { dodajVrstico(); return; }     // ni izbrane stranke / prazen katalog → ena prazna vrstica
      // Če stranka ima zgodovino, pokaži SAMO najbolj uporabljene (že razvrščene po pogostosti);
      // sicer (nova stranka brez zgodovine) pokaži cel katalog.
      var izbor = box._imaUporabo ? arts.filter(function (a) { return a._u > 0; }) : arts;
      if (!izbor.length) izbor = arts;
      var vid = {};
      izbor.forEach(function (a) {
        if (!a.name) return;
        var k = (a.sifra != null && !isNaN(a.sifra)) ? ('s' + a.sifra) : (a.id ? ('a' + a.id) : ('n' + a.name.trim().toLowerCase()));
        if (vid[k]) return; vid[k] = true;             // brez dvojnikov v premade seznamu
        dodajVrstico(a.name, '');
      });
      osveziKg();
    };
    napolniPremade();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => novListZapri(box, true));
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniNovList(box));
    wireSeg(box);
    vnosVrata(box);
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', async () => { await nalozArtSez(box); napolniPremade(); osveziKgPrikaz(box); }); }
    box.dataset.osnutek = '1';
    if (gumb) gumb.classList.remove('nalaga');
    if (_okno) return;
    novListOkno(box);
  }

  async function shraniNovList(box) {
    const q = s => box.querySelector(s);
    const msg = q('[data-msg]');
    const org_id = q('[data-org]').value;
    const seq = parseInt(q('[data-seq]').value, 10);
    const leto = parseInt(q('[data-leto]').value, 10);
    const doc_date = q('[data-datum]').value;
    const _kgEl = q('[data-teza-auto]');
    const _kgAuto = _kgEl && _kgEl.dataset.kg !== '' && _kgEl.dataset.kg != null ? Number(_kgEl.dataset.kg) : null;
    const izdal = q('[data-izdal]').value.trim() || (JAZIME || null);
    const opStranka = q('[data-opomba-stranka]') ? q('[data-opomba-stranka]').value.trim() : '';
    const opInterno = q('[data-opomba-interno]') ? q('[data-opomba-interno]').value.trim() : '';
    if (!org_id) { msg.textContent = 'Izberi stranko.'; return; }
    if (!seq || !leto) { msg.textContent = 'Vpiši številko in leto.'; return; }
    if (!doc_date) { msg.textContent = 'Vpiši datum.'; return; }
    if (box._glavaOk === false) { msg.textContent = 'Najprej potrdi stranko, datum in številko zgoraj.'; return; }
    const postavke = zdruziPodvojene([...box.querySelectorAll('.ur-post')].map(r => {
      const sel = r.querySelector('[data-pn]');
      const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
      return {
        naziv: (sel ? sel.value : '').trim(),
        artId: opt && opt.dataset.aid ? opt.dataset.aid : null,
        sifra: opt && opt.dataset.sifra ? parseInt(opt.dataset.sifra, 10) : null,
        kosov: parseInt(r.querySelector('[data-pk]').value, 10) || 0
      };
    }).filter(p => p.naziv && p.kosov > 0));   // premade prazne vrstice (brez količine) preskočimo
    if (!postavke.length) { msg.textContent = 'Vpiši količino vsaj pri enem artiklu.'; return; }
    msg.textContent = 'Ustvarjam …';
    try {
      const { data: arts } = await sb.from('articles').select('id,name').eq('org_id', org_id);
      const poImenu = {};
      (arts || []).forEach(a => { poImenu[(a.name || '').trim().toLowerCase()] = a.id; });
      // za izbrane LASTNE artikle brez članstva ustvari povezavo (veljaven article_id)
      for (const p of postavke) {
        if (!p.artId && p.sifra != null && !isNaN(p.sifra)) {
          const ins = await sb.from('articles').insert({ org_id, name: p.naziv, cena_sifra: p.sifra }).select('id').maybeSingle();
          if (ins && ins.data) { p.artId = ins.data.id; if (CLANI) CLANI.push({ id: ins.data.id, org_id: org_id, name: p.naziv, cena_sifra: p.sifra, sort_order: null }); }
        }
      }
      const { data: nova, error } = await sb.from('delivery_notes').insert({
        org_id, doc_seq: seq, doc_year: leto, doc_date,
        weight_kg: _kgAuto,
        transport: beriPrevoz(box),
        issued_name: izdal, source: 'portal',
        opomba_stranka: opStranka || null,
        opomba_evidenca: opInterno || null,
        legacy_id: 'portal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
      }).select('id').single();
      if (error) throw error;
      if (postavke.length) {
        const rows = postavke.map((p, i) => ({ note_id: nova.id, article_name: p.naziv, article_id: p.artId || poImenu[p.naziv.toLowerCase()] || null, pieces: p.kosov, sort_order: i }));
        const r2 = await sb.from('delivery_note_items').insert(rows);
        if (r2.error) throw r2.error;
      }
      logDodaj('Arhiv', 'Dodano', 'Spremni list ' + seq + '/' + leto + ' · ' + (ORGIME[org_id] || ''));
      toast('Spremni list ustvarjen');
      await naloziListe();
      risiArhiv();
      const nid = nova && nova.id;
      if (_okno && _okno.vsebina === box) {
        // Okno se skrči naravnost v kartico novega lista (če je v trenutnem filtru), sicer nazaj v gumb.
        const najdiNov = () => nid ? document.querySelector('#arhivList .a-row[data-id="' + String(nid).replace(/"/g, '\\"') + '"]') : null;
        if (najdiNov()) {
          _okno.najdi = najdiNov; _okno.id = String(nid);
          const prej = _okno.obZaprtju;
          _okno.obZaprtju = function (k) { prej(k); if (k) { k.classList.add('arh-flash'); setTimeout(function () { k.classList.remove('arh-flash'); }, 1700); } };
        }
        novListZapri(box, true);
      } else {
        box.innerHTML = ''; box.classList.remove('show'); delete box.dataset.osnutek;
        pokaziList(nid);
      }
    } catch (e) {
      msg.textContent = 'Napaka: ' + (/duplicate|unique/i.test(e.message || '') ? 'številka ' + seq + '/' + leto + ' je že zasedena' : (e.message || e));
    }
  }

  async function osveziArtikleDatalist(box) {
    const os = box.querySelector('[data-org]');
    const org_id = os ? os.value : '';
    let dl = document.getElementById('artikliDatalist');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'artikliDatalist'; document.body.appendChild(dl); }
    dl.innerHTML = '';
    if (!org_id) return;
    try {
      const { data } = await sb.from('articles').select('name').eq('org_id', org_id).order('sort_order');
      dl.innerHTML = (data || []).map(a => `<option value="${escape_(a.name)}"></option>`).join('');
    } catch (e) {}
  }

  /* ══════════ FAKTURE (osnova za račun) ══════════ */
  let FAK_ZADNJI = null;
  function fakDatumOK(od, doo) { return od && doo && od <= doo; }
  function risiFakture() {
    const sel = $('fakOrg');
    if (sel && sel.options.length <= 1) {
      sel.innerHTML = '<option value="">Vse stranke</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    }
    const od = $('fakOd'), doo = $('fakDo');
    if (od && !od.value) {
      const d = _fakDefault();
      od.value = d.od; doo.value = d.doo;
    }
    if (!risiFakture._wired) {
      $('fakBtn').addEventListener('click', () => { nalozifakture(); _fakObdToggle(); });
      var _fox = $('fakObdX'); if (_fox) _fox.addEventListener('click', function () { var d = _fakDefault(); if ($('fakOd')) $('fakOd').value = d.od; if ($('fakDo')) $('fakDo').value = d.doo; nalozifakture(); _fakObdToggle(); });
      // Sprememba obdobja (ali stranke) mora TAKOJ osvežiti rezultate.
      // Prej se je osvežilo šele na »Prikaži«: na zaslonu so ostale kartice
      // prejšnjega obdobja, FAK_ZADNJI pa je držal staro obdobje — gumb
      // »Natisni osnovo za račun« je zato tiskal številke prejšnjega obdobja,
      // čeprav sta polji kazali novo. Dve različni obdobji sta dali isto vsoto.
      var _fakT = null;
      function _fakOsveziKmalu() {
        _fakObdToggle();
        clearTimeout(_fakT);
        _fakT = setTimeout(function () {
          var o = $('fakOd'), d = $('fakDo');
          if (o && d && fakDatumOK(o.value, d.value)) nalozifakture();
        }, 250);
      }
      if ($('fakOd')) $('fakOd').addEventListener('change', _fakOsveziKmalu);
      if ($('fakDo')) $('fakDo').addEventListener('change', _fakOsveziKmalu);
      if ($('fakOrg')) $('fakOrg').addEventListener('change', _fakOsveziKmalu);
      var _fx = $('fakXlsxBtn'); if (_fx) _fx.addEventListener('click', () => fakIzvozModal('xlsx'));
      var _fp = $('fakPdfBtn'); if (_fp) _fp.addEventListener('click', () => fakIzvozModal('pdf'));
      risiFakture._wired = true;
    }
    risiHitreMesece();
    nalozifakture();
    _fakObdToggle();
  }
  // Privzeto obdobje Faktur = tekoči mesec (1. → danes). Gumb × ponastavi nanj.
  function _fakDefault() {
    var z = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
    var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    return { od: iso(new Date(z.getFullYear(), z.getMonth(), 1)), doo: iso(z) };
  }
  function _fakObdToggle() {
    var x = $('fakObdX'); if (!x) return;
    var d = _fakDefault();
    var neDef = (($('fakOd') && $('fakOd').value) !== d.od) || (($('fakDo') && $('fakDo').value) !== d.doo);
    x.classList.toggle('hidden', !neDef);
  }
  function risiHitreMesece() {
    const box = $('fakHitri');
    if (!box) return;
    const z = new Date();
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const izbire = [];
    for (let i = 0; i < 4; i++) {
      const prvi = new Date(z.getFullYear(), z.getMonth() - i, 1);
      const zadnji = new Date(z.getFullYear(), z.getMonth() - i + 1, 0);
      izbire.push({ oznaka: prvi.toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' }), od: iso(prvi), doo: iso(zadnji) });
    }
    box.innerHTML = izbire.map(m => `<button type="button" class="fak-chip" data-od="${m.od}" data-do="${m.doo}">${escape_(m.oznaka)}</button>`).join('');
    box.querySelectorAll('.fak-chip').forEach(b => b.addEventListener('click', () => {
      $('fakOd').value = b.dataset.od; $('fakDo').value = b.dataset.do; nalozifakture(); _fakObdToggle();
    }));
  }
  // Zberi in izračunaj skupine po strankah za obdobje (orgIds: null/[] = vse, sicer seznam ID-jev).
  async function fakZberi(od, doo, orgIds) {
    // Naloži VSE spremne liste v obdobju (stranično), brez trde meje — da noben list/stranka ne izpade iz obračuna.
    const r = await vseVrstice(function (a, b) {
      let q = sb.from('delivery_notes')
        .select('id,number,doc_date,weight_kg,total_pieces,org_id,transport,delivery_note_items(article_name,article_id,pieces)')
        .is('deleted_at', null)
        .gte('doc_date', od).lte('doc_date', doo)
        .order('doc_date', { ascending: true }).order('id', { ascending: true }).range(a, b);
      if (orgIds && orgIds.length === 1) q = q.eq('org_id', orgIds[0]);
      else if (orgIds && orgIds.length) q = q.in('org_id', orgIds);
      return q;
    });
    if (r.error) return { error: r.error };
    const notes = r.data || [];
    const poOrg = {};
    notes.forEach(n => {
      const oid = n.org_id || '—';
      if (!poOrg[oid]) poOrg[oid] = { org_id: oid, listov: 0, kg: 0, kosov: 0, redni: 0, izredni: 0, artikli: {}, artAid: {} };
      const g = poOrg[oid];
      g.listov++;
      if (n.transport === 'izredni') g.izredni++; else g.redni++;
      g.kg += parseFloat(n.weight_kg) || 0;
      g.kosov += n.total_pieces || 0;
      (n.delivery_note_items || []).forEach(it => {
        const ime = (it.article_name || '—').trim() || '—';
        g.kosovPostavke = (g.kosovPostavke || 0) + (it.pieces || 0);
        g.artikli[ime] = (g.artikli[ime] || 0) + (it.pieces || 0);
        if (it.article_id && !g.artAid[ime]) g.artAid[ime] = it.article_id;
      });
    });
    const skupine = Object.values(poOrg).sort((a, b) => (ORGIME[a.org_id] || '').localeCompare(ORGIME[b.org_id] || '', 'sl', { sensitivity: 'base' }));
    // ── cene: poveži postavke s cenikom (prek povezave artikel → cenik) ──
    await nalozicenik();
    const artmap = await naloziArtMap(orgIds && orgIds.length === 1 ? orgIds[0] : null);
    const cenikOn = !!(CENIK && CENIK.length);
    skupine.forEach(g => {
      g.postavke = Object.entries(g.artikli).map(([nm, q]) => {
        const key = g.org_id + '|' + nm.trim().toLowerCase();
        const aid = g.artAid ? g.artAid[nm] : null;
        const byId = (aid && artmap.__byId) ? artmap.__byId[aid] : null;
        // primarno prek article_id (zanesljivo), sicer po imenu
        const s = (byId && byId.sifra != null) ? byId.sifra : artmap[key];
        const cena = cenaZaArtikel(s);
        const tzKos = (byId && byId.teza != null) ? byId.teza : (artmap.__teza ? artmap.__teza[key] : null);
        const teza = (tzKos != null && !isNaN(tzKos)) ? Math.round(tzKos * q * 1000) / 1000 : null;
        return { nm, q, cena, teza, znesek: cena != null ? Math.round(cena * q * 100) / 100 : null };
      }).sort((a, b) => a.nm.localeCompare(b.nm, 'sl', { sensitivity: 'base' }));
      g.cenikOn = cenikOn;
      g.neto = Math.round(g.postavke.reduce((sm, p) => sm + (p.znesek || 0), 0) * 100) / 100;
      g.brezCene = g.postavke.filter(p => p.cena == null).length;
      g.ddv = Math.round(g.neto * DDV_STOPNJA * 100) / 100;
      g.bruto = Math.round((g.neto + g.ddv) * 100) / 100;
      // »Skupaj kosov« bere delivery_notes.total_pieces, postavke pa so seštevek
      // delivery_note_items.pieces. Če se razideta, je račun notranje neskladen
      // (star ali nepopoln zapis). Doslej se to nikjer ni videlo — zdaj povemo.
      g.kosovPostavke = g.kosovPostavke || 0;
      g.neskladje = (g.kosov || 0) - g.kosovPostavke;
    });
    return { skupine: skupine };
  }
  async function nalozifakture() {
    const list = $('fakList');
    const od = $('fakOd').value, doo = $('fakDo').value, orgFilter = $('fakOrg').value;
    if (!fakDatumOK(od, doo)) { list.innerHTML = '<div class="panel"><p class="u-sub">Izberi veljavno obdobje (od ≤ do).</p></div>'; FAK_ZADNJI = null; return; }
    // FAK_ZADNJI takoj razveljavimo: dokler se novo obdobje ne naloži, ne sme
    // nihče natisniti podatkov prejšnjega.
    FAK_ZADNJI = null;
    pokaziNalaganje(list);
    // Stare kartice zatemni le, če nalaganje traja opazno dlje. Prej so bile ob vsakem
    // odprtju zavihka za trenutek na 45 % — videti zamegljene, tudi ko je bilo nalaganje hipno.
    const _zatemni = setTimeout(function () { list.style.opacity = '.45'; }, 350);
    const res = await fakZberi(od, doo, orgFilter ? [orgFilter] : null);
    clearTimeout(_zatemni);
    list.style.opacity = '';
    if (res.error) { list.innerHTML = '<div class="panel"><p class="u-sub">Napaka: ' + escape_(res.error.message) + '</p></div>'; return; }
    const skupine = res.skupine;
    list.style.opacity = '';
    FAK_ZADNJI = { od, doo, skupine };
    $('fakPod').textContent = skupine.length ? '' : 'V izbranem obdobju ni spremnih listov';
    if (!skupine.length) { list.innerHTML = '<div class="panel"><p class="u-sub">V izbranem obdobju ni spremnih listov.</p></div>'; return; }
    list.innerHTML = '<div class="fak-grid">' + skupine.map((g, gi) => fakKartica(g, gi)).join('') + '</div>';
    list.dataset.loaded = '1';
    list.querySelectorAll('[data-fakprint]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); natisniFakturo(parseInt(b.dataset.fakprint, 10)); }));
    list.querySelectorAll('[data-faktoggle]').forEach(h => h.addEventListener('click', () => fakOdpri(h.closest('.fak-card'))));
    oknoPoIzrisu();
  }
  // Osnova za račun se odpre v OKNU (prej se je kartica razprla v mreži).
  // Kartico iščemo po stranki: po novem izrisu ima ista zaporedna številka lahko drugo stranko.
  function fakNajdi(org) { return document.querySelector('#fakList .fak-card[data-org="' + String(org).replace(/"/g, '\\"') + '"]'); }
  function fakGlavaOkna(k) {
    var d = document.createElement('div');
    var h = k && k.querySelector('.fak-card-info h3'), p = k && k.querySelector('.fak-card-info .u-sub');
    d.innerHTML = '<h3 class="sec-h">' + escape_(h ? h.textContent : '') + '</h3><div class="okno-glava-sub">' + (p ? p.innerHTML : '') + '</div>';   // p: naša oznaka (escape_ že uporabljen)
    return d;
  }
  function fakOdpri(card) {
    if (_okno || !card) return;
    var body = card.querySelector('.fak-body'); if (!body) return;
    var org = card.dataset.org;
    oknoOdpri(card, body, function () { return fakNajdi(org); }, {
      glava: fakGlavaOkna,
      osvezi: function (k) { return k.querySelector('.fak-body'); }
    });
  }
  function fakKg(kg) { return kg ? tezaFmt(kg) : '—'; }
  function fakKartica(g, gi) {
    const ime = ORGIME[g.org_id] || 'Brez stranke';
    const post = g.postavke || Object.entries(g.artikli).map(([nm, q]) => ({ nm, q, cena: null, znesek: null }));
    const money = !!g.cenikOn;
    const rows = post.length ? post.map(p =>
      `<div class="fak-line"><span class="fak-l-nm">${escape_(p.nm)}</span>` +
      (money ? `<span class="fak-l-c">${p.cena != null ? cenaFmt(p.cena) : '—'}</span>` : '') +
      `<b class="fak-l-q">${stevilo(p.q)}</b>` +
      `<span class="fak-l-t">${p.teza != null ? tezaFmt(p.teza) : '—'}</span>` +
      (money ? `<b class="fak-l-z">${p.znesek != null ? cenaFmt(p.znesek) : '—'}</b>` : '') +
      `</div>`).join('') : '<div class="fak-line fak-line-empty"><span class="u-sub">Brez postavk</span></div>';
    const prevoz = `<div class="fak-tot-r"><span>Prevozi</span><b>${stevilo(g.redni)} redni${g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni' : ''}</b></div>`;
    const head = money
      ? `<div class="fak-head fak-head-m"><span>Artikel</span><span>Cena</span><span>Kol.</span><span>Teža</span><span>Znesek</span></div>`
      : `<div class="fak-head fak-head-nm"><span>Artikel</span><span>Količina</span><span>Teža</span></div>`;
    const denar = money ? `
            <div class="fak-tot-r"><span>Neto skupaj</span><b>${cenaFmt(g.neto)}</b></div>
            <div class="fak-tot-r"><span>DDV (22 %)</span><b>${cenaFmt(g.ddv)}</b></div>
            <div class="fak-tot-r fak-tot-bruto"><span>Za plačilo (z DDV)</span><b>${cenaFmt(g.bruto)}</b></div>
            ${g.brezCene ? `<div class="fak-tot-r"><span class="fak-warn">${stevilo(g.brezCene)} artiklov brez cene — NISO všteti v znesek; poveži jih v Strankah</span><b></b></div>` : ''}` : '';
    const povzetek = money && g.neto ? ` · <b>${cenaFmt(g.bruto)}</b> z DDV` : '';
    return `<div class="fak-card" data-org="${escape_(String(g.org_id || ''))}">
      <div class="fak-card-h" data-faktoggle="${gi}">
        <div class="fak-card-info"><h3>${escape_(ime)}</h3><p class="u-sub">${stevilo(g.listov)} spremnih listov · ${stevilo(g.kosov)} kosov · ${fakKg(g.kg)}${g.izredni ? ' · ' + stevilo(g.izredni) + '× izredni prevoz' : ''}${povzetek}</p></div>
        <span class="fak-chev" aria-hidden="true">›</span>
      </div>
      <div class="fak-body" id="fakbody${gi}">
        <div class="fak-inner">
          ${head}
          <div class="fak-lines${money ? ' fak-lines-m' : ' fak-lines-nm'}">${rows}</div>
          <div class="fak-tot">
            ${g.neskladje ? `<div class="fak-tot-r"><span class="fak-warn">Pozor: seštevek postavk je ${stevilo(g.kosovPostavke)} kosov, spremni listi pa navajajo ${stevilo(g.kosov)}</span><b></b></div>` : ''}
            <div class="fak-tot-r"><span>Skupaj kosov</span><b>${stevilo(g.kosov)}</b></div>
            <div class="fak-tot-r"><span>Skupaj teža perila</span><b>${fakKg(g.kg)}</b></div>
            ${prevoz}
            ${denar}
          </div>
          <div class="fak-body-acts"><button type="button" class="btn-mini fak-print" data-fakprint="${gi}">Natisni osnovo za račun</button></div>
        </div>
      </div>
    </div>`;
  }
  // Osnova za račun: vsaka stranka na svojem listu A4 (glava z logotipom enkrat, na vrhu lista).
  function fakSekcijaHtml(g, od, doo) {
    const org = ORGSEZNAM.find(o => o.id === g.org_id) || {};
    const naziv = org.legal_name || org.name || ORGIME[g.org_id] || '—';
    const naslov = [org.address, org.vat_id ? 'ID za DDV: ' + org.vat_id : ''].filter(Boolean).join(' · ');
    const money = !!g.cenikOn;
    const post = g.postavke || Object.entries(g.artikli).map(([nm, q]) => ({ nm, q, cena: null, znesek: null }));
    const kolonc = money ? 4 : 2;
    const rows = post.length ? post.map(p => money
      ? `<tr><td class="an">${escape_(p.nm)}</td><td class="r">${p.cena != null ? cenaFmt(p.cena) : '—'}</td><td class="r b">${stevilo(p.q)}</td><td class="r b">${p.znesek != null ? cenaFmt(p.znesek) : '—'}</td></tr>`
      : `<tr><td class="an">${escape_(p.nm)}</td><td class="r b">${stevilo(p.q)}</td></tr>`).join('') : `<tr><td class="an" colspan="${kolonc}" style="color:#888">Ni postavk</td></tr>`;
    const tot = `<div><span>Skupaj kosov</span><b>${stevilo(g.kosov)}</b></div><div><span>Skupaj teža perila</span><b>${fakKg(g.kg)}</b></div>` +
      (money ? `<div><span>Neto skupaj</span><b>${cenaFmt(g.neto)}</b></div><div><span>DDV (22 %)</span><b>${cenaFmt(g.ddv)}</b></div><div class="bruto"><span>Za plačilo (z DDV)</span><b>${cenaFmt(g.bruto)}</b></div>` : '');
    return `<section>
      <div class="sc-box sc-num"><span>Osnova za račun</span><span class="sc-obd">${datum(od)} – ${datum(doo)}</span></div>
      <div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">${escape_(naziv)}</span></div>${naslov ? '<div class="sc-addr">' + escape_(naslov) + '</div>' : ''}<div class="sc-dates">${sklonListov(g.listov)} · ${fakPrevozi(g)}</div></div></div>
      <table class="sc-table"><thead>${money
        ? '<tr><th class="l">Naziv artikla</th><th class="r">Cena/kos</th><th class="r">Količina</th><th class="r">Znesek</th></tr>'
        : '<tr><th class="l">Naziv artikla</th><th class="r">Količina (kos)</th></tr>'}</thead><tbody>${rows}</tbody></table>
      <div class="sc-tot">${tot}</div>
      ${g.neskladje ? `<div class="sc-pozor">Pozor: seštevek postavk je ${stevilo(g.kosovPostavke)} kosov, spremni listi pa navajajo ${stevilo(g.kosov)}.</div>` : ''}
      ${money && g.brezCene ? `<div class="sc-pozor">Opomba: ${stevilo(g.brezCene)} artiklov še nima cene (poveži jih v razdelku Stranke). Ti niso vključeni v znesek.</div>` : ''}
    </section>`;
  }
  function fakDokumentHtml(skupine, od, doo, naslovDok) {
    return dokHtml(naslovDok || 'Osnova za račun', skupine.map(g => fakSekcijaHtml(g, od, doo)));
  }
  function natisniFakturo(gi) {
    if (!FAK_ZADNJI || !FAK_ZADNJI.skupine[gi]) return;
    const g = FAK_ZADNJI.skupine[gi];
    predogledDokument({
      naslov: 'Osnova za račun · ' + (ORGIME[g.org_id] || ''),
      docHtml: fakDokumentHtml([g], FAK_ZADNJI.od, FAK_ZADNJI.doo, 'Osnova za račun'),
      pdf: function () { return fakPdfDownload([g], FAK_ZADNJI.od, FAK_ZADNJI.doo); }
    });
  }

  /* ══════════ PDF (pravi prenos, brez knjižnice — pdfgen.js) ══════════ */
  /* pdfgen.js se naloži ŠELE ob prvi uporabi (~80 kB manj ob vsakem zagonu).
     index.html ga namenoma ne nalaga — brez tega nalagalnika PDF ne deluje. */
  var _pdfP = null;
  function zagotoviPdf() {
    if (typeof PDFDoc !== 'undefined') return Promise.resolve(true);
    if (_pdfP) return _pdfP;
    _pdfP = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = 'pdfgen.js';
      sc.onload = function () {
        if (typeof PDFDoc !== 'undefined') resolve(true);
        else { _pdfP = null; reject(new Error('pdfgen.js se je naložil, a PDFDoc ni na voljo')); }
      };
      sc.onerror = function () { _pdfP = null; reject(new Error('pdfgen.js se ni naložil')); };
      document.head.appendChild(sc);
    });
    return _pdfP;
  }
  async function pdfPripravljen() {
    try { await zagotoviPdf(); return true; }
    catch (e) { toast('PDF modula ni bilo mogoče naložiti. Preveri povezavo in poskusi znova.'); return false; }
  }
  // Okvir z naslovom dokumenta (.sc-box.sc-num): levo naslov, desno (neobvezno) obdobje.
  function dpdfNaslovOkvir(doc, y, levo, desno) {
    var h = 10 * PT * 2 + 13 * 1.2 * PT;
    dpdfOkvir(doc, y, h);
    var osn = dpdfOsnova(y + 10 * PT, 13 * PT, 13 * 1.2 * PT);
    doc.text(DPDF.M + 14 * PT, osn, levo, { size: 13 * PT, bold: true, color: DPDF.INK });
    if (desno) doc.text(doc.W - DPDF.M - 14 * PT, osn, desno, { size: 11 * PT, weight: 600, color: DPDF.SIVA, align: 'right' });
    return y + h + 10 * PT;
  }
  // Okvir naročnika (.sc-box.sc-client): ime podčrtano; pod njim naslov in podatki; desno (neobvezno) »Podpis:«.
  function dpdfNarocnik(doc, y, naziv, nazivSek, vrstice, podpis) {
    var M = DPDF.M, R = doc.W - M, x = M + 14 * PT, fs = 12 * PT, lh = 12 * 1.2 * PT;
    var h = 10 * PT + lh;
    vrstice.forEach(function (v) { h += v.razmik + 11 * 1.2 * PT; });
    h += 10 * PT;
    dpdfOkvir(doc, y, h);
    var osn = dpdfOsnova(y + 10 * PT, fs, lh);
    var w1 = doc.text(x, osn, 'Naročnik storitve: ', { size: fs, bold: true, color: DPDF.INK });
    var xi = x + w1 + 2 * PT, wi = doc.text(xi, osn, naziv, { size: fs, bold: true, color: DPDF.INK });
    doc.line(xi - 2 * PT, osn + 3.3, xi + wi + 2 * PT, osn + 3.3, { width: 2 * PT, color: DPDF.INK });
    if (nazivSek) doc.text(xi + wi + 6 * PT, osn, '(' + nazivSek + ')', { size: fs * 0.85, color: DPDF.SIVA2 });
    var yy = y + 10 * PT + lh;
    vrstice.forEach(function (v) {
      yy += v.razmik;
      doc.text(x, dpdfOsnova(yy, 11 * PT, 11 * 1.2 * PT), v.t, { size: 11 * PT, color: DPDF.SIVA });
      yy += 11 * 1.2 * PT;
    });
    if (podpis) {
      var xs = R - 14 * PT - 110 * PT;
      doc.line(xs, y + 10 * PT, xs, y + h - 10 * PT, { width: 1 * PT, color: DPDF.OKVIR });
      doc.text(xs + 16 * PT, osn, 'Podpis:', { size: fs, weight: 600, color: DPDF.SIVA });
    }
    return y + h + 10 * PT;
  }
  function dpdfSestevkiVisina(vrstice) {
    var h = 12 * PT;
    vrstice.forEach(function (v) { h += v.bruto ? 4 * PT + 1.5 * PT + 8 * PT + 13 * 1.2 * PT + 5 * PT : 10 * PT + 11 * PT * 1.2 + 1 * PT; });
    return h;
  }
  // Seštevki (.sc-tot): desna polovica, vrstice z oznako in vrednostjo; zadnja (bruto) poudarjena.
  function dpdfSestevki(doc, y, vrstice) {
    var R = doc.W - DPDF.M, L = R - (doc.W - 2 * DPDF.M) * 0.55, fs = 11 * PT;
    y += 12 * PT;
    vrstice.forEach(function (v) {
      if (v.bruto) {
        y += 4 * PT; doc.line(L, y + 0.56, R, y + 0.56, { width: 1.5 * PT, color: DPDF.INK }); y += 1.5 * PT;
        var o = dpdfOsnova(y + 8 * PT, 13 * PT, 13 * 1.2 * PT);
        doc.text(L + 8 * PT, o, v.l, { size: 13 * PT, bold: true, color: DPDF.INK });
        doc.text(R - 8 * PT, o, v.v, { size: 13 * PT, bold: true, align: 'right', color: DPDF.INK });
        y += 8 * PT + 13 * 1.2 * PT + 5 * PT;
      } else {
        var os = dpdfOsnova(y + 5 * PT, fs, fs * 1.2);
        doc.text(L + 8 * PT, os, v.l, { size: fs, color: DPDF.SIVA });
        doc.text(R - 8 * PT, os, v.v, { size: fs, bold: true, align: 'right', color: DPDF.INK });
        y += 10 * PT + fs * 1.2;
        doc.line(L, y + 0.37, R, y + 0.37, { width: 1 * PT, color: DPDF.CRTA }); y += 1 * PT;
      }
    });
    return y;
  }
  function dpdfOdstavek(doc, y, besedilo, o) {
    var M = DPDF.M, maxW = doc.W - 2 * M, fs = o.size || 10 * PT;
    dpdfVrstice(doc, besedilo, fs, maxW, o).forEach(function (vr) {
      if (!dpdfProstor(doc, y, fs * 1.4)) y = dpdfNovaStran(doc);
      doc.text(M, dpdfOsnova(y, fs, fs * 1.4), vr, { size: fs, color: o.color || DPDF.INK, weight: o.weight });
      y += fs * 1.4;
    });
    return y;
  }
  // Osnova za račun (fakture) → prava .pdf datoteka, isti slog kot predogled. Vsaka stranka
  // na svojem A4 z glavo (logotip enkrat, na vrhu); nadaljevanje iste stranke je brez glave.
  async function fakPdfDownload(skupine, od, doo) {
    if (!(await pdfPripravljen())) return;
    var doc = new PDFDoc();
    var M = DPDF.M, R = doc.W - M, y;
    skupine.forEach(function (g) {
      var money = !!g.cenikOn, post = g.postavke || [];
      doc.addPage(); y = dpdfGlava(doc);
      var org = ORGSEZNAM.find(function (o) { return o.id === g.org_id; }) || {};
      var naziv = org.legal_name || org.name || ORGIME[g.org_id] || '—';
      var naslov = [org.address, org.vat_id ? 'ID za DDV: ' + org.vat_id : ''].filter(Boolean).join(' · ');
      y = dpdfNaslovOkvir(doc, y, 'Osnova za račun', datum(od) + ' – ' + datum(doo));
      var vr = [];
      if (naslov) vr.push({ t: naslov, razmik: 6 * PT });
      vr.push({ t: sklonListov(g.listov) + ' · ' + fakPrevozi(g), razmik: naslov ? 4 * PT : 10 * PT });
      y = dpdfNarocnik(doc, y, naziv, '', vr, false);
      var cZ = R - 8 * PT, cK = cZ - 92, cC = cK - 92;
      var st = money ? [{ t: 'Naziv artikla', x: M + 8 * PT }, { t: 'Cena/kos', x: cC, align: 'right' }, { t: 'Količina', x: cK, align: 'right' }, { t: 'Znesek', x: cZ, align: 'right' }]
        : [{ t: 'Naziv artikla', x: M + 8 * PT }, { t: 'Količina (kos)', x: cZ, align: 'right' }];
      var sk = [{ l: 'Skupaj kosov', v: stevilo(g.kosov) }, { l: 'Skupaj teža perila', v: fakKg(g.kg) }];
      if (money) sk.push({ l: 'Neto skupaj', v: cenaFmt(g.neto) }, { l: 'DDV (22 %)', v: cenaFmt(g.ddv) }, { l: 'Za plačilo (z DDV)', v: cenaFmt(g.bruto), bruto: true });
      var vrs = post.length ? post.map(function (p) {
        var cel = [{ t: p.nm, x: M + 8 * PT, w: 600 }];
        if (money) cel.push({ t: p.cena != null ? cenaFmt(p.cena) : '—', x: cC, align: 'right' }, { t: stevilo(p.q), x: cK, align: 'right', w: 700 }, { t: p.znesek != null ? cenaFmt(p.znesek) : '—', x: cZ, align: 'right', w: 700 });
        else cel.push({ t: stevilo(p.q), x: cZ, align: 'right', w: 700 });
        return cel;
      }) : [[{ t: 'Ni postavk', x: M + 8 * PT }]];
      y += 4 * PT; y = dpdfTabGlava(doc, y, st);
      y = dpdfTabela(doc, y, st, vrs, dpdfSestevkiVisina(sk), 'Osnova za račun · ' + (ORGIME[g.org_id] || naziv));
      y = dpdfSestevki(doc, y, sk);
      if (g.neskladje) { y += 10 * PT; y = dpdfOdstavek(doc, y, 'Pozor: seštevek postavk je ' + stevilo(g.kosovPostavke) + ' kosov, spremni listi pa navajajo ' + stevilo(g.kosov) + '.', { size: 10 * PT, color: DPDF.POZOR }); }
      if (money && g.brezCene) { y += 6 * PT; y = dpdfOdstavek(doc, y, 'Opomba: ' + stevilo(g.brezCene) + ' artiklov še nima cene (poveži jih v razdelku Stranke). Ti niso vključeni v znesek.', { size: 10 * PT, color: DPDF.POZOR }); }
    });
    doc.save('fakture_' + od + '_' + doo + '.pdf');
  }
  // Spremni list → prava .pdf datoteka, isti slog kot predogled (in aplikacija na tablici).
  async function spremniPdfDownload(box) {
    if (!(await pdfPripravljen())) return;
    var n = box._note || {}, items = box._items || [];
    var org = ORGSEZNAM.find(function (o) { return o.id === n.org_id; }) || {};
    var naziv = org.legal_name || org.name || ORGIME[n.org_id] || '—';
    var nazivSek = (org.legal_name && org.name && org.name !== org.legal_name) ? org.name : '';
    var doc = new PDFDoc(); doc.addPage();
    var M = DPDF.M, R = doc.W - M;
    var y = dpdfGlava(doc);
    // Št. spremnega lista (vse krepko, kot .sc-num)
    var h = 10 * PT * 2 + 13 * 1.2 * PT; dpdfOkvir(doc, y, h);
    var osn = dpdfOsnova(y + 10 * PT, 13 * PT, 13 * 1.2 * PT);
    var w0 = doc.text(M + 14 * PT, osn, 'Št. spremnega lista: ', { size: 13 * PT, bold: true, color: DPDF.INK });
    doc.text(M + 14 * PT + w0, osn, n.number || '—', { size: 13 * PT, bold: true, spacing: 0.01, color: DPDF.INK });
    y += h + 10 * PT;
    y = dpdfNarocnik(doc, y, naziv, nazivSek, [{ t: 'Oddaja: ' + datum(n.doc_date) + (n.issued_name ? '  ·  Izdal: ' + n.issued_name : '') + '  ·  ' + (n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'), razmik: 10 * PT }], true);
    var cQ = M + (R - M) * 0.83;   // sredina stolpca »Oddaja« (34 % širine)
    var st = [{ t: 'Naziv Artikla', x: M + 8 * PT }, { t: 'Oddaja (št. kosov)', x: cQ, align: 'center' }];
    y += 4 * PT; y = dpdfTabGlava(doc, y, st);
    y = dpdfTabela(doc, y, st, items.length ? items.map(function (p) {
      return [{ t: p.naziv, x: M + 8 * PT, w: 600 }, { t: stevilo(p.kosov), x: cQ, align: 'center', w: 700 }];
    }) : [[{ t: 'Ni postavk', x: M + 8 * PT }]], (n.weight_kg != null && n.weight_kg !== '') ? 26 : 0, 'Spremni list ' + (n.number || ''));
    if (n.weight_kg != null && n.weight_kg !== '') {
      y += 12 * PT; if (!dpdfProstor(doc, y, 20)) y = dpdfNovaStran(doc);
      var o2 = dpdfOsnova(y, 12 * PT, 12 * 1.2 * PT), vv = tezaFmt(n.weight_kg);
      var wv = doc.text(R, o2, vv, { size: 12 * PT, bold: true, align: 'right', color: DPDF.INK });
      doc.text(R - wv, o2, 'Skupaj teža perila: ', { size: 12 * PT, weight: 600, align: 'right', color: DPDF.INK });
      y += 12 * 1.2 * PT;
    }
    // Tiska se SAMO opomba za stranko (interna ostane v portalu) — enako kot predogled in aplikacija.
    if (n.opomba_stranka) {
      y += 10 * PT;
      var fs = 12 * PT, sirina = R - M - 2 * 12 * PT;
      var vrs = dpdfVrstice(doc, 'Opomba: ' + n.opomba_stranka, fs, sirina);
      var hh = 8 * PT * 2 + vrs.length * fs * 1.25;
      if (!dpdfProstor(doc, y, hh)) y = dpdfNovaStran(doc);
      doc.rrect(M, y, R - M, hh, 8 * PT, { stroke: DPDF.OKVIR2, width: 1 * PT });
      vrs.forEach(function (vr, i) {
        var ob = dpdfOsnova(y + 8 * PT + i * fs * 1.25, fs, fs * 1.25), xx = M + 12 * PT;
        if (i === 0 && vr.indexOf('Opomba:') === 0) { var wo = doc.text(xx, ob, 'Opomba:', { size: fs, bold: true, color: DPDF.INK }); doc.text(xx + wo, ob, vr.slice(7), { size: fs, color: DPDF.INK }); }
        else doc.text(xx, ob, vr, { size: fs, color: DPDF.INK });
      });
      y += hh;
    }
    if (n.popravljeno_at) {
      y += 10 * PT;
      var tp = 'Popravljeno v portalu · ' + (n.popravil || 'osebje') + ' · ' + datum(String(n.popravljeno_at).slice(0, 10));
      var fsp = 11 * PT, hp = 6 * PT * 2 + fsp * 1.25;
      if (!dpdfProstor(doc, y, hp)) y = dpdfNovaStran(doc);
      doc.rrect(M, y, R - M, hp, 8 * PT, { fill: DPDF.POPR_BG });
      doc.text(M + 10 * PT, dpdfOsnova(y + 6 * PT, fsp, fsp * 1.25), tp, { size: fsp, weight: 600, color: DPDF.POPR });
    }
    doc.save('spremni_list_' + String(n.number || 'brez').replace(/[\/\\:]+/g, '-') + '.pdf');   // »1664/2026« → 1664-2026 (poševnica ni dovoljena v imenu datoteke)
  }

  /* ══════════ PREDOGLED DOKUMENTA (skupni pop-up: natisni / shrani) ══════════ */
  function predogledDokument(opt) {
    opt = opt || {};
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    var xlsxBtn = opt.xlsx ? '<button type="button" class="sc-modal-btn primary" data-xlsx>Shrani kot Excel</button>' : '';
    var pdfBtn = opt.pdf ? '<button type="button" class="sc-modal-btn primary" data-pdf>Shrani kot PDF</button>' : '';
    back.innerHTML = '<div class="sc-modal doc-modal" role="dialog" aria-modal="true">' +
      '<div class="doc-head"><h4></h4><button type="button" class="doc-x" aria-label="Zapri">×</button></div>' +
      '<div class="doc-stage"><div class="doc-scaler"><iframe class="doc-frame" title="Predogled"></iframe></div></div>' +
      '<div class="sc-modal-acts doc-acts"><button type="button" class="sc-modal-btn ghost" data-print>Natisni</button>' + xlsxBtn + pdfBtn + '</div></div>';
    back.querySelector('h4').textContent = opt.naslov || 'Predogled';
    document.body.appendChild(back);
    var fr = back.querySelector('.doc-frame');
    var scaler = back.querySelector('.doc-scaler');
    var stage = back.querySelector('.doc-stage');
    var A4W = 794;   // 210 mm @ 96 dpi
    function prilagodiA4() {
      try {
        var doc = fr.contentDocument; if (!doc || !doc.body) return;
        var ch = Math.max(doc.body.scrollHeight, 1123);   // vsaj ena A4 stran
        fr.style.width = A4W + 'px'; fr.style.height = ch + 'px'; fr.style.transformOrigin = 'top left';
        var cs = getComputedStyle(stage);
        var sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var k = sw / A4W; if (!isFinite(k) || k <= 0) k = 1; if (k > 1.8) k = 1.8;   // po širini (večji, z drsenjem)
        fr.style.transform = 'scale(' + k + ')';
        scaler.style.width = (A4W * k) + 'px'; scaler.style.height = (ch * k) + 'px';
      } catch (e) {}
    }
    fr.addEventListener('load', function () { prilagodiA4(); setTimeout(prilagodiA4, 60); });
    window.addEventListener('resize', prilagodiA4);
    fr.srcdoc = opt.docHtml || '';
    requestAnimationFrame(function () { back.classList.add('show'); setTimeout(prilagodiA4, 40); });
    var done = false;
    function zapri() { if (done) return; done = true; window.removeEventListener('resize', prilagodiA4); back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onKey(e) { if (e.key === 'Escape') zapri(); }
    back.querySelector('.doc-x').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey);
    back.querySelector('[data-print]').addEventListener('click', function () {
      // Natisni šele, ko so pisave dokumenta (tudi logotip) naložene — nikoli nadomestna pisava.
      var natisni = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Tiskanje ni uspelo.'); } };
      try { var fd = fr.contentDocument && fr.contentDocument.fonts; if (fd && fd.ready) { fd.ready.then(natisni, natisni); return; } } catch (e) {}
      natisni();
    });
    var pb = back.querySelector('[data-pdf]');
    if (pb) pb.addEventListener('click', async function () {
      if (!opt.pdf) return;
      var t = this.textContent; this.disabled = true; this.textContent = 'Pripravljam …';
      try { await opt.pdf(); } catch (e) { toast('PDF ni uspel: ' + (e && e.message ? e.message : e)); }
      this.disabled = false; this.textContent = t;
    });
    var xb = back.querySelector('[data-xlsx]');
    if (xb) xb.addEventListener('click', function () { try { opt.xlsx(); } catch (e) { toast('Excel ni uspel.'); } });
    document.addEventListener('keydown', onKey);
  }
  // ── Izvoz (Excel / PDF): pojavno okno z izbiro obdobja in strank ──
  // Predogled Excel vsebine kot HTML tabele (za pop-up predogled).
  function fakXlsxPreviewHtml(skupine, od, doo) {
    const obd = datum(od) + ' – ' + datum(doo);
    const anyMoney = skupine.some(g => g.cenikOn);
    const nd = n => escape_(String(n));
    let povR = '';
    let sL = 0, sK = 0, sKg = 0, sN = 0, sD = 0, sB = 0;
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      sL += g.listov; sK += g.kosov; sKg += g.kg;
      let r = '<tr><td>' + nd(ime) + '</td><td class="n">' + stevilo(g.listov) + '</td><td class="n">' + stevilo(g.kosov) + '</td><td class="n">' + nd(fakKg(g.kg)) + '</td>';
      if (anyMoney) {
        sN += g.neto || 0; sD += g.ddv || 0; sB += g.bruto || 0;
        r += '<td class="n">' + (g.cenikOn ? nd(cenaFmt(g.neto)) : '—') + '</td><td class="n">' + (g.cenikOn ? nd(cenaFmt(g.ddv)) : '—') + '</td><td class="n">' + (g.cenikOn ? nd(cenaFmt(g.bruto)) : '—') + '</td>';
      }
      povR += r + '</tr>';
    });
    let povHead = '<tr><th>Stranka</th><th class="n">Spr. listov</th><th class="n">Kosov</th><th class="n">Teža (kg)</th>' + (anyMoney ? '<th class="n">Neto</th><th class="n">DDV</th><th class="n">Za plačilo z DDV</th>' : '') + '</tr>';
    let povSk = '<tr class="sk"><td>SKUPAJ</td><td class="n">' + stevilo(sL) + '</td><td class="n">' + stevilo(sK) + '</td><td class="n">' + nd(fakKg(sKg)) + '</td>' + (anyMoney ? '<td class="n">' + nd(cenaFmt(sN)) + '</td><td class="n">' + nd(cenaFmt(sD)) + '</td><td class="n">' + nd(cenaFmt(sB)) + '</td>' : '') + '</tr>';
    let listi = '<div class="sheet"><div class="tab">Povzetek</div><table>' + povHead + povR + povSk + '</table></div>';
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      const money = !!g.cenikOn;
      const post = g.postavke || [];
      let head = money ? '<tr><th>Artikel</th><th class="n">Cena/kos</th><th class="n">Količina</th><th class="n">Znesek</th></tr>' : '<tr><th>Artikel</th><th class="n">Količina</th></tr>';
      let rows = post.length ? post.map(p => money
        ? '<tr><td>' + nd(p.nm) + '</td><td class="n">' + (p.cena != null ? nd(cenaFmt(p.cena)) : '—') + '</td><td class="n">' + stevilo(p.q) + '</td><td class="n">' + (p.znesek != null ? nd(cenaFmt(p.znesek)) : '—') + '</td></tr>'
        : '<tr><td>' + nd(p.nm) + '</td><td class="n">' + stevilo(p.q) + '</td></tr>').join('') : '<tr><td colspan="' + (money ? 4 : 2) + '" class="empty">Brez postavk</td></tr>';
      let tot = money
        ? '<tr class="sk"><td>Skupaj kosov</td><td class="n"></td><td class="n">' + stevilo(g.kosov) + '</td><td class="n"></td></tr>' +
          '<tr class="sk"><td>Teža perila (kg)</td><td class="n"></td><td class="n">' + nd(fakKg(g.kg)) + '</td><td class="n"></td></tr>' +
          '<tr class="sk"><td>Neto skupaj</td><td class="n"></td><td class="n"></td><td class="n">' + nd(cenaFmt(g.neto)) + '</td></tr>' +
          '<tr class="sk"><td>DDV (22 %)</td><td class="n"></td><td class="n"></td><td class="n">' + nd(cenaFmt(g.ddv)) + '</td></tr>' +
          '<tr class="sk bruto"><td>Za plačilo (z DDV)</td><td class="n"></td><td class="n"></td><td class="n">' + nd(cenaFmt(g.bruto)) + '</td></tr>'
        : '<tr class="sk"><td>Skupaj kosov</td><td class="n">' + stevilo(g.kosov) + '</td></tr><tr class="sk"><td>Teža perila (kg)</td><td class="n">' + nd(fakKg(g.kg)) + '</td></tr>';
      // Predogled mora pokazati ISTA opozorila kot shranjena datoteka — sicer
      // uporabnik pregleda predogled, ne vidi težave, in vseeno izvozi prenizko vsoto.
      var opoz = '';
      if (g.neskladje) opoz += '<div class="per">Pozor: seštevek postavk je ' + stevilo(g.kosovPostavke) + ' kosov, spremni listi pa navajajo ' + stevilo(g.kosov) + '.</div>';
      if (money && g.brezCene) opoz += '<div class="per">' + stevilo(g.brezCene) + ' artiklov brez cene (niso všteti) — poveži jih v Strankah.</div>';
      listi += '<div class="sheet"><div class="tab">' + nd(ime) + '</div><div class="per">Obdobje: ' + nd(obd) + '</div><table>' + head + rows + tot + '</table>' + opoz + '</div>';
    });
    return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><style>' +
      "*{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#16202b}" +
      'body{margin:0;font-size:12.5px;padding:16px;background:#fff}' +
      '.sheet{margin:0 0 26px}' +
      '.tab{display:inline-block;background:#1a6644;color:#fff;font-weight:700;font-size:11.5px;padding:5px 12px;border-radius:6px 6px 0 0}' +
      '.per{color:#5c6873;font-size:11px;margin:4px 0 6px}' +
      'table{border-collapse:collapse;width:100%}' +
      'th,td{border:1px solid #d7dedb;padding:5px 10px;text-align:left;white-space:nowrap}' +
      'th{background:#eef3f1;font-size:10px;text-transform:uppercase;letter-spacing:.03em}' +
      'td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}' +
      'td.empty{color:#8a97a0;text-align:left}' +
      'tr.sk td{font-weight:700;background:#f6f9f8}' +
      'tr.bruto td{border-top:2px solid #1a6644}' +
      '</style></head><body>' + listi + '</body></html>';
  }
  // Povzetek opozoril za eno stranko — v listu »Povzetek« se takoj vidi, pri
  // kateri stranki je z vsoto kaj narobe, brez odpiranja njenega lista.
  function _fakOpoz(g) {
    var o = [];
    if (g.brezCene) o.push(stevilo(g.brezCene) + ' brez cene (niso všteti)');
    if (g.neskladje) o.push('postavke ' + stevilo(g.kosovPostavke) + ' ≠ listi ' + stevilo(g.kosov));
    return o.join(' · ');
  }
  function fakIzvozXlsx(od, doo, skupine) {
    const B = t => ({ v: t, bold: true });          // glava
    const T = t => ({ v: t, s: 2 });                 // krepko besedilo
    const EUR = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 3 });
    const EURb = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 4 });
    const INT = n => ({ v: Number(n) || 0, s: 5 });
    const INTb = n => ({ v: Number(n) || 0, s: 6 });
    const KG = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 7 });
    const KGb = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 8 });
    const obd = datum(od) + ' – ' + datum(doo);
    const anyMoney = skupine.some(g => g.cenikOn);
    const sheets = [];
    // 1) Povzetek — vse stranke skupaj
    let pov = [[{ v: 'Fakture — povzetek', s: 2 }], ['Obdobje:', obd], []];
    pov.push(anyMoney
      ? [B('Stranka'), B('Spr. listov'), B('Kosov'), B('Teža (kg)'), B('Neto'), B('DDV'), B('Za plačilo z DDV'), B('Opozorila')]
      : [B('Stranka'), B('Spr. listov'), B('Kosov'), B('Teža (kg)'), B('Opozorila')]);
    let sL = 0, sK = 0, sKg = 0, sN = 0, sD = 0, sB = 0;
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      sL += g.listov; sK += g.kosov; sKg += g.kg;
      if (anyMoney) {
        sN += g.neto || 0; sD += g.ddv || 0; sB += g.bruto || 0;
        pov.push([ime, INT(g.listov), INT(g.kosov), KG(g.kg), g.cenikOn ? EUR(g.neto) : '—', g.cenikOn ? EUR(g.ddv) : '—', g.cenikOn ? EUR(g.bruto) : '—', _fakOpoz(g)]);
      } else pov.push([ime, INT(g.listov), INT(g.kosov), KG(g.kg), _fakOpoz(g)]);
    });
    pov.push([]);
    pov.push(anyMoney
      ? [T('SKUPAJ'), INTb(sL), INTb(sK), KGb(sKg), EURb(sN), EURb(sD), EURb(sB)]
      : [T('SKUPAJ'), INTb(sL), INTb(sK), KGb(sKg)]);
    sheets.push({ name: 'Povzetek', rows: pov, freeze: false });
    // 2) Sheet za vsako stranko — celoten izpis artiklov + skupna cena
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      const money = !!g.cenikOn;
      const post = g.postavke || [];
      let rows = [[{ v: ime + ' — osnova za račun', s: 2 }], ['Obdobje:', obd],
        ['Spremnih listov:', INT(g.listov), '', 'Prevozi:', stevilo(g.redni) + ' redni' + (g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni' : '')], []];
      rows.push(money ? [B('Artikel'), B('Cena/kos'), B('Količina'), B('Znesek')] : [B('Artikel'), B('Količina')]);
      if (post.length) post.forEach(p => {
        rows.push(money
          ? [p.nm, p.cena != null ? EUR(p.cena) : '—', INT(p.q), p.znesek != null ? EUR(p.znesek) : '—']
          : [p.nm, INT(p.q)]);
      });
      else rows.push(['Brez postavk']);
      rows.push([]);
      if (money) {
        rows.push([T('Skupaj kosov'), '', INTb(g.kosov), '']);
        rows.push([T('Teža perila (kg)'), '', KGb(g.kg), '']);
        rows.push([T('Neto skupaj'), '', '', EURb(g.neto)]);
        rows.push([T('DDV (22 %)'), '', '', EURb(g.ddv)]);
        rows.push([T('Za plačilo (z DDV)'), '', '', EURb(g.bruto)]);
        if (g.neskladje) rows.push([{ v: 'Pozor: seštevek postavk je ' + stevilo(g.kosovPostavke) + ' kosov, spremni listi pa navajajo ' + stevilo(g.kosov), s: 0 }]);
        if (g.brezCene) rows.push([{ v: stevilo(g.brezCene) + ' artiklov brez cene (niso všteti) — poveži jih v Strankah', s: 0 }]);
      } else {
        rows.push([T('Skupaj kosov'), INTb(g.kosov)]);
        rows.push([T('Teža perila (kg)'), KGb(g.kg)]);
        if (g.neskladje) rows.push([{ v: 'Pozor: seštevek postavk je ' + stevilo(g.kosovPostavke) + ' kosov, spremni listi pa navajajo ' + stevilo(g.kosov), s: 0 }]);
      }
      sheets.push({ name: ime, rows: rows });
    });
    prenesiXlsx('fakture_' + od + '_' + doo + '.xlsx', sheets);
  }
  function fakIzvozModal(nacin) {
    const orgs = ORGSEZNAM.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sl', { sensitivity: 'base' }));
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    let od0 = ($('fakOd') && $('fakOd').value) || '', do0 = ($('fakDo') && $('fakDo').value) || '';
    if (!od0 || !do0) { const z = new Date(); od0 = iso(new Date(z.getFullYear(), z.getMonth(), 1)); do0 = iso(z); }
    const jePdf = nacin === 'pdf';
    const back = document.createElement('div'); back.className = 'sc-modal-back';
    const checks = orgs.map(o => `<label class="fx-cli"><input type="checkbox" class="fx-org" value="${escape_(o.id)}" checked><span>${escape_(o.name)}</span></label>`).join('') || '<p class="u-sub">Ni strank.</p>';
    back.innerHTML = '<div class="sc-modal sc-modal-wide" role="dialog" aria-modal="true">'
      + '<h4>' + (jePdf ? 'Izvoz v PDF — osnova za račun' : 'Izvoz v Excel') + '</h4>'
      + '<div class="fx-dates"><label>Od<input type="date" class="sc-modal-input fx-od"></label><label>Do<input type="date" class="sc-modal-input fx-do"></label></div>'
      + '<div class="fx-cli-head"><span>Stranke</span><label class="fx-all"><input type="checkbox" class="fx-vse" checked><span>Vse</span></label></div>'
      + '<div class="fx-cli-list">' + checks + '</div>'
      + '<div class="fx-msg msg"></div>'
      + '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>' + (jePdf ? 'Predogled' : 'Izvozi Excel') + '</button></div>'
      + '</div>';
    document.body.appendChild(back);
    const odI = back.querySelector('.fx-od'), doI = back.querySelector('.fx-do');
    odI.value = od0; doI.value = do0;
    const vse = back.querySelector('.fx-vse');
    const orgi = () => Array.prototype.slice.call(back.querySelectorAll('.fx-org'));
    vse.addEventListener('change', () => orgi().forEach(c => { c.checked = vse.checked; }));
    back.querySelector('.fx-cli-list').addEventListener('change', () => { vse.checked = orgi().every(c => c.checked); });
    requestAnimationFrame(() => back.classList.add('show'));
    let done = false;
    function zapri() { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(() => { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onKey(e) { if (e.key === 'Escape') zapri(); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', e => { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey);
    const msg = back.querySelector('.fx-msg');
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      const od = odI.value, doo = doI.value;
      if (!fakDatumOK(od, doo)) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'Izberi veljavno obdobje (od ≤ do).'; return; }
      const izbrani = orgi().filter(c => c.checked).map(c => c.value);
      if (!izbrani.length) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'Izberi vsaj eno stranko.'; return; }
      const vseIzbrane = izbrani.length === orgi().length;
      const btn = this; btn.disabled = true; btn.textContent = 'Pripravljam …';
      msg.className = 'fx-msg msg'; msg.textContent = '';
      const res = await fakZberi(od, doo, vseIzbrane ? null : izbrani);
      btn.disabled = false; btn.textContent = jePdf ? 'Predogled' : 'Izvozi Excel';
      if (res.error) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'Napaka: ' + res.error.message; return; }
      const skupine = res.skupine || [];
      if (!skupine.length) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'V izbranem obdobju ni spremnih listov.'; return; }
      zapri();
      if (jePdf) {
        predogledDokument({
          naslov: 'Osnova za račun — ' + (vseIzbrane ? 'vse stranke' : (izbrani.length + ' strank')),
          docHtml: fakDokumentHtml(skupine, od, doo, 'Osnova za račun'),
          pdf: function () { return fakPdfDownload(skupine, od, doo); }
        });
      } else {
        predogledDokument({
          naslov: 'Izvoz v Excel — ' + (vseIzbrane ? 'vse stranke' : (izbrani.length + ' strank')),
          docHtml: fakXlsxPreviewHtml(skupine, od, doo),
          xlsx: function () { fakIzvozXlsx(od, doo, skupine); }
        });
      }
    });
  }

  /* ══════════ NASTAVITVE ══════════ */
  /* ══════════ CENIKI ══════════ */
  let CENIK = null;
  let CENIKMAP = null;
  let CLANI = null; // članstva: povezave stranka↔artikel (articles), za skupni katalog
  let _cenikPreCount = {};
  let _cenikOpen = {};
  const DDV_STOPNJA = 0.22;
  function cenaFmt(n) { return (Number(n) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  // Preimenuj artikel povsod: članstva + arhivske postavke zadnjih 3 mesecev (ID ostane isti).
  async function posodobiImeArtikla(sifra, nm) {
    var pr = await sb.rpc('posodobi_ime_artikla', { p_sifra: sifra, p_ime: nm });
    if (pr && pr.error) { await sb.from('articles').update({ name: nm }).eq('cena_sifra', sifra); }
    if (CLANI) CLANI.forEach(function (a) { if (a.cena_sifra === sifra) a.name = nm; });
  }
  // Isti artikel (ID) sme biti na spremnem listu le 1×: podvojene združi (sešteje kose).
  function zdruziPodvojene(arr) {
    var videni = {}, out = [];
    (arr || []).forEach(function (p) {
      var kljuc = (p.sifra != null && !isNaN(p.sifra)) ? ('s' + p.sifra) : (p.artId ? ('a' + p.artId) : ('n' + (p.naziv || '').trim().toLowerCase()));
      if (videni[kljuc]) { videni[kljuc].kosov = (videni[kljuc].kosov || 0) + (p.kosov || 0); }
      else { videni[kljuc] = p; out.push(p); }
    });
    return out;
  }
  var CENIK_RX = /^([A-ZČŠŽĐ][A-ZČŠŽĐ0-9.\s]*?)\s*-\s+\S/;
  function cenikSkupina(naziv) { var m = (naziv || '').match(CENIK_RX); return m ? m[1].trim() : null; }
  function zgradiCenikMap() {
    CENIKMAP = {}; _cenikPreCount = {};
    (CENIK || []).forEach(function (x) {
      CENIKMAP[x.sifra] = x;
      if (!(x.org_id && ORGIME[x.org_id])) { var p = cenikSkupina(x.naziv); if (p) _cenikPreCount[p] = (_cenikPreCount[p] || 0) + 1; }
    });
  }
  function cenikGroupKey(x) {
    if (x.org_id && ORGIME[x.org_id]) return 'org:' + x.org_id;
    return 'splosno';
  }
  // Vrstni red strank: skupna nastavitev (ureja se v Strankah), Cenik jo lahko lokalno prepiše.
  function custOrderMode() { try { return localStorage.getItem('sc-cust-order') || 'promet'; } catch (e) { return 'promet'; } }
  function cenikOrderMode() { try { return localStorage.getItem('sc-cenik-order') || 'sledi'; } catch (e) { return 'sledi'; } }
  function razvrstiStranke(list, mode, kgm) {
    var arr = list.slice();
    if (mode === 'abeceda') {
      arr.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'sl', { sensitivity: 'base' }); });
    } else {
      arr.sort(function (a, b) { return ((kgm && kgm[b.id]) || 0) - ((kgm && kgm[a.id]) || 0) || (a.name || '').localeCompare(b.name || '', 'sl', { sensitivity: 'base' }); });
    }
    return arr;
  }
  function cenikSort(a, b) {
    var sa = a.sort_order, sb2 = b.sort_order;
    if (sa != null && sb2 != null && sa !== sb2) return sa - sb2;
    if (sa != null && sb2 == null) return -1;
    if (sa == null && sb2 != null) return 1;
    return (a.naziv || '').localeCompare(b.naziv || '', 'sl');
  }
  async function nalozicenik(force) {
    if (CENIK && CENIKMAP && !force) return { ok: true };
    var r = await vseVrstice(function (a, b) { return sb.from('pricelist').select('sifra,koda,naziv,em,cena1,cena2,teza,org_id,sort_order,deleted_at,cena_potrjena').is('deleted_at', null).order('naziv').range(a, b); });
    if (r.error) {
      var r2 = await vseVrstice(function (a, b) { return sb.from('pricelist').select('sifra,koda,naziv,em,cena1,cena2').order('naziv').range(a, b); });
      if (r2.error) return { ok: false, missing: true };
      CENIK = (r2.data || []).map(function (x) { return Object.assign({ org_id: null, sort_order: null }, x); });
      zgradiCenikMap(); return { ok: true, noext: true };
    }
    CENIK = r.data || []; zgradiCenikMap(); return { ok: true };
  }
  // Naloži VSE vrstice (Supabase privzeto vrne le 1000) — po straneh.
  async function vseVrstice(qFn) {
    var all = [], od = 0, kos = 1000;
    while (true) {
      var r = await qFn(od, od + kos - 1);
      if (r.error) return { error: r.error, data: all };
      var d = r.data || [];
      all = all.concat(d);
      if (d.length < kos) break;
      od += kos;
    }
    return { data: all };
  }
  async function naloziClane(force) {
    if (CLANI && !force) return CLANI;
    var r = await vseVrstice(function (a, b) { return sb.from('articles').select('id,org_id,name,cena_sifra,sort_order').range(a, b); });
    CLANI = r.error ? [] : (r.data || []);
    return CLANI;
  }
  function produktPoId(id) { id = normId(id); if (!id || !CENIK) return null; return CENIK.find(function (x) { return normId(x.koda) === id; }) || null; }
  async function naloziArtMap(orgFilter) {
    // POZOR: brez paginacije PostgREST vrne največ 1000 vrstic; vseh artiklov je
    // lahko več (vse stranke) → nekateri odpadejo in fakture kažejo »—«. Zato beri po straneh.
    const r = await vseVrstice(function (a, b) {
      let q = sb.from('articles').select('id,org_id,name,cena_sifra,teza').order('id', { ascending: true }).range(a, b);
      if (orgFilter) q = q.eq('org_id', orgFilter);
      return q;
    });
    const data = r.error ? [] : (r.data || []);
    const map = {}; const tez = {}; const byId = {};
    data.forEach(a => {
      var key = a.org_id + '|' + String(a.name || '').trim().toLowerCase();
      if (a.cena_sifra != null) map[key] = a.cena_sifra;
      if (a.teza != null && a.teza !== '') tez[key] = parseFloat(a.teza);
      if (a.id) byId[a.id] = { sifra: a.cena_sifra, teza: (a.teza != null && a.teza !== '') ? parseFloat(a.teza) : null };
    });
    map.__teza = tez;
    map.__byId = byId;
    return map;
  }
  function cenaZaArtikel(sifra) { return (sifra != null && CENIKMAP && CENIKMAP[sifra]) ? CENIKMAP[sifra].cena1 : null; }
  // ── ID artiklov: 2 črki + 3 številke (npr. PV001). Uporabnik jih dodeljuje sam. ──
  function normId(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
  function jeSc(koda) { return normId(koda).indexOf('SC') === 0; }
  // Stranka »uporablja splošni cenik«: ima vsaj en artikel s ceno in vsi so SC-artikli.
  function strankaSplosni(orgId) {
    if (!CLANI) return false;
    var priced = CLANI.filter(function (a) { return a.org_id === orgId && a.cena_sifra != null; });
    if (!priced.length) return false;
    return priced.every(function (a) { var p = CENIKMAP[a.cena_sifra]; return p && jeSc(p.koda); });
  }
  var SC_TAG = '<span class="sc-tag" title="Ta stranka uporablja splošni cenik">Splošni cenik</span>';
  function veljavenId(s) { return /^[A-ZČŠŽ]{2}[0-9]{3}$/.test(normId(s)); }
  function idZaseden(id, exceptSifra) { id = normId(id); if (!id || !CENIK) return null; var hit = CENIK.find(function (x) { return x.sifra !== exceptSifra && normId(x.koda) === id; }); return hit || null; }
  function pad3(n) { n = String(n); while (n.length < 3) n = '0' + n; return n; }
  function nextPref(p) { var a = p.charCodeAt(0), b = p.charCodeAt(1) + 1; if (b > 90) { b = 65; a++; if (a > 90) a = 65; } return String.fromCharCode(a) + String.fromCharCode(b); }
  function predlagajId() {
    var best = null;
    (CENIK || []).forEach(function (x) { var m = normId(x.koda).match(/^([A-Z]{2})([0-9]{3})$/); if (m) { var pref = m[1], num = parseInt(m[2], 10); if (!best || pref > best.pref || (pref === best.pref && num > best.num)) best = { pref: pref, num: num }; } });
    if (!best) return '';
    var num = best.num + 1, pref = best.pref; if (num > 999) { num = 1; pref = nextPref(pref); }
    return pref + pad3(num);
  }
  // Naslednji prost SC-ID (SC001, SC002 …) za splošni cenik.
  function nextSc() {
    var max = 0;
    (CENIK || []).forEach(function (x) { var m = normId(x.koda).match(/^SC([0-9]{3})$/); if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; } });
    var n = max + 1; if (n > 999) n = 999;
    return 'SC' + pad3(n);
  }
  // Dodaj SKUPNI (deljeni) standardni artikel v splošni cenik (org_id = null → velja za vse).
  async function dodajSplosniArtikel(name, id) {
    await nalozicenik();
    if (!/^SC[0-9]{3}$/.test(id)) { toast('ID splošnega artikla mora biti SC + 3 številke (npr. SC001).'); return; }
    if (idZaseden(id, null)) { toast('ID ' + id + ' že obstaja.'); return; }
    var sifra = await naslednjaSifra();
    // vrstni red: ohrani trenutni prikaz obstoječih SC in dodaj NOVEGA na konec
    var scList = (CENIK || []).filter(function (x) { return jeSc(x.koda); }).slice().sort(cenikSort);
    var rec = { sifra: sifra, koda: id, naziv: name, em: 'kos', cena1: 0, cena2: 0, org_id: null, sort_order: scList.length };
    var e = (await sb.from('pricelist').insert(rec)).error;
    if (e) { toast('Napaka: ' + e.message); return; }
    CENIK.push(rec);
    // normaliziraj sort_order vseh SC (obstoječi po trenutnem vrstnem redu, nov na koncu) → stabilen vrstni red
    var koncni = scList.concat([rec]); var ups = [];
    koncni.forEach(function (p, i) { if (p.sort_order !== i) { p.sort_order = i; ups.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', p.sifra)); } });
    zgradiCenikMap();
    _cenikOpen['splosni'] = true;
    if (ups.length) await Promise.all(ups);
    // PROPAGACIJA: dodaj nov artikel VSEM strankam, ki imajo splošni cenik vklopljen
    var ciljOrgi = (ORGSEZNAM || []).filter(function (o) { return strankaSplosni(o.id); });
    var dodanih = 0;
    for (var ci = 0; ci < ciljOrgi.length; ci++) {
      var oid = ciljOrgi[ci].id;
      var maxo = -1; (CLANI || []).forEach(function (a) { if (a.org_id === oid && typeof a.sort_order === 'number' && a.sort_order > maxo) maxo = a.sort_order; });
      var ins = await sb.from('articles').insert({ org_id: oid, name: name, cena_sifra: sifra, sort_order: maxo + 1 }).select('id').maybeSingle();
      if (!(ins && ins.error)) { if (CLANI) CLANI.push({ id: ins && ins.data ? ins.data.id : null, org_id: oid, name: name, cena_sifra: sifra, sort_order: maxo + 1 }); dodanih++; }
    }
    toast('Dodano v splošni cenik: ' + id + (dodanih ? ' · dodano ' + dodanih + ' strankam' : ''));
    cenikRender();
  }
  // Naslednja prosta šifra (PK) v ceniku — upošteva TUDI mehko izbrisane vrstice, da ne pride do trka.
  async function naslednjaSifra() {
    var maxS = 900000;
    try { var r = await sb.from('pricelist').select('sifra').order('sifra', { ascending: false }).limit(1);
      if (!r.error && r.data && r.data[0] && typeof r.data[0].sifra === 'number') maxS = Math.max(maxS, r.data[0].sifra); } catch (e) {}
    (CENIK || []).forEach(function (x) { if (x.sifra > maxS) maxS = x.sifra; });
    return maxS + 1;
  }
  function orgPodatki(orgId) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }); if (!o) return '';
    return [o.legal_name, o.vat_id ? ('ID DDV: ' + o.vat_id) : '', o.address].filter(Boolean).map(escape_).join(' · ');
  }
  async function risiCeniki() {
    const box = $('cenikList'); if (!box) return;
    if (!risiCeniki._wired) {
      const si = $('cenikIsci'); if (si) si.addEventListener('input', () => cenikRender());
      const ib = $('cenikUvoz'); if (ib) ib.addEventListener('click', () => uvoziCenik());
      const kb = $('cenikKos'); if (kb) kb.addEventListener('click', () => risiKos());
      const cs = $('cenikSort2'); if (cs) { cs.value = cenikOrderMode(); cs.addEventListener('change', function () { try { localStorage.setItem('sc-cenik-order', cs.value); } catch (e) {} shraniNastavitve(); cenikRender(); }); }
      risiCeniki._wired = true;
    }
    box.innerHTML = NALAGANJE;
    const res = await nalozicenik(true);
    if (!res.ok) {
      CENIK = null;
      box.innerHTML = '<div class="msg bad show">Tabele cenika (pricelist) še ni v bazi. Zaženi priloženo migracijo v Supabase → SQL Editor, nato klikni »Uvozi cenik iz PDF-ja«.</div>';
      if ($('cenikPod')) $('cenikPod').textContent = 'Cenik še ni pripravljen';
      return;
    }
    await naloziClane(true);
    cenikRender();
  }
  function cenikVrsticaHtml(x, orgId, artId) {
    var nm = x.naziv || '';
    return '<div class="cenik-row" data-s="' + x.sifra + '" data-org="' + escape_(orgId || '') + '" data-art="' + (artId != null ? escape_(String(artId)) : '') + '"><div class="cenik-nm">' + escape_(nm) + '</div>' +
      '<div class="cenik-meta">' + (x.koda ? escape_(normId(x.koda)) : 'brez ID') + ' · ' + escape_(x.em || 'kos') + '</div>' +
      '<div class="cenik-cena"><span class="cenik-val">' + cenaFmt(x.cena1) + '</span>' +
      (OSEBJE ? '<span class="cenik-acts"><button type="button" class="cenik-grip dnd-handle" title="povleci za razvrščanje" aria-label="razvrsti">' + DND_ICON + '</button><button type="button" class="cenik-edit" data-cedit="' + x.sifra + '" title="uredi ceno" aria-label="uredi">✎</button></span>' : '') +
      '</div></div>';
  }
  function cenikRender() {
    const box = $('cenikList'); if (!box) return;
    var _sy = window.scrollY;
    const q = (($('cenikIsci') && $('cenikIsci').value) || '').trim().toLowerCase();
    if ($('cenikPod')) $('cenikPod').textContent = (CENIK && CENIK.length) ? (stevilo(CENIK.length) + ' artiklov · cene neto na kos') : 'Ustvarjaj cenik po strankah';
    if (!CENIK) { box.innerHTML = '<div class="empty"><h3>Cenik ni na voljo</h3></div>'; return; }
    function matchesQ(x) { return !q || (x.naziv || '').toLowerCase().includes(q) || normId(x.koda).toLowerCase().includes(q) || String(x.sifra) === q; }
    // Skupni katalog: vsak izdelek je en zapis (pricelist); stranke so nanj POVEZANE prek članstev (articles).
    var grupe = {};
    function grp(orgId) { var k = 'org:' + orgId; if (!grupe[k]) grupe[k] = { key: k, org_id: orgId, label: ORGIME[orgId] || 'stranka', items: [], _seen: {} }; return grupe[k]; }
    function pushItem(orgId, p, artId, ord) {
      if (!(orgId && ORGIME[orgId])) return;
      var g = grp(orgId);
      if (g._seen[p.sifra]) { if (artId != null && g._seen[p.sifra].artId == null) { g._seen[p.sifra].artId = artId; g._seen[p.sifra].ord = (ord != null ? ord : g._seen[p.sifra].ord); } return; }
      var it = { p: p, artId: (artId != null ? artId : null), ord: (ord != null ? ord : 1e9) };
      g._seen[p.sifra] = it; g.items.push(it);
    }
    (CLANI || []).forEach(function (a) { if (a.cena_sifra == null) return; var p = CENIKMAP[a.cena_sifra]; if (!p || !matchesQ(p)) return; pushItem(a.org_id, p, a.id, a.sort_order); });
    (CENIK || []).forEach(function (x) { if (x.org_id && ORGIME[x.org_id] && matchesQ(x)) pushItem(x.org_id, x, null, x.sort_order); });
    if (!q && OSEBJE) ORGSEZNAM.forEach(function (o) { grp(o.id); });
    if (q) { var any = Object.keys(grupe).some(function (k) { return grupe[k].items.length; }); if (!any) { box.innerHTML = '<div class="empty"><h3>Ni zadetkov</h3></div>'; return; } }
    var _effMode = cenikOrderMode(); if (_effMode === 'sledi') _effMode = custOrderMode();
    var _kgm = (typeof kgPoStrankiMesec === 'function') ? kgPoStrankiMesec() : {};
    var ordOrg = {}; razvrstiStranke(ORGSEZNAM, _effMode, _kgm).forEach(function (o, i) { ordOrg[o.id] = i; });
    var arr = Object.keys(grupe).map(function (k) { return grupe[k]; });
    if (!arr.length) { box.innerHTML = '<div class="empty"><h3>Cenik je prazen</h3></div>'; return; }
    arr.sort(function (a, b) { var d = (ordOrg[a.org_id] || 0) - (ordOrg[b.org_id] || 0); if (d) return d; return (a.label || '').localeCompare(b.label || '', 'sl'); });
    // Splošni cenik — izoliran katalog vseh artiklov z ID, ki se začne s "SC"
    var scItems = (CENIK || []).filter(function (x) { return normId(x.koda).indexOf('SC') === 0 && matchesQ(x); }).sort(cenikSort);
    var scOpen = !!q || _cenikOpen['splosni'];
    var scRows = scItems.map(function (p) { return cenikVrsticaHtml(p, '', null); }).join('');
    var scAdd = OSEBJE ? ('<div class="art-add sc-add"><input type="text" class="sc-new" placeholder="nov standardni artikel"><input type="text" class="sc-id-new" placeholder="ID" maxlength="5" value="' + escape_(nextSc()) + '"><button type="button" class="btn btn-narrow sc-add-btn">+ Dodaj</button></div>') : '';
    var scBody = (scRows || '<p class="u-sub" style="padding:12px 16px 4px">Dodaj standardne artikle (ID SC001, SC002 …). Veljajo za vse stranke.</p>') + scAdd;
    var scCard = OSEBJE ? ('<div class="cgrp splosni' + (scOpen ? ' open' : '') + '" data-key="splosni"><div class="cgrp-head-row"><button type="button" class="cgrp-h' + (scOpen ? ' open' : '') + '" data-cgrp="splosni"><span class="cgrp-name">Splošni cenik</span><span class="cgrp-count">' + stevilo(scItems.length) + ' art.</span><span class="cgrp-chev" aria-hidden="true">›</span></button></div><div class="cgrp-body' + (scOpen ? ' show' : '') + '">' + scBody + '</div></div>') : '';
    var scWrap = scCard ? ('<div class="sc-isolate">' + scCard + '</div>') : '';
    var stHead = (OSEBJE && arr.length) ? '<div class="cenik-sec-head">Ceniki po strankah</div>' : '';
    box.innerHTML = scWrap + stHead + arr.map(function (g) {
      var list = g.items.slice().sort(function (x, y) { return (x.ord || 0) - (y.ord || 0) || cenikSort(x.p, y.p); });
      var rows = list.map(function (it) { return cenikVrsticaHtml(it.p, g.org_id, it.artId); }).join('');
      var open = !!q || _cenikOpen[g.key];
      var jeSpl = list.length && list.every(function (it) { return jeSc(it.p.koda); });
      var sub = ''; var pod = orgPodatki(g.org_id); if (pod) sub = '<span class="cgrp-sub">' + pod + '</span>';
      var splBtn = '<button type="button" class="cgrp-btn ghost sc-toggle' + (jeSpl ? ' on' : '') + '" data-splorg="' + g.org_id + '" data-splon="' + (jeSpl ? '1' : '0') + '">' + (jeSpl ? 'Splošni cenik: vklopljen ✓' : 'Vklopi splošni cenik') + '</button>';
      var bar = OSEBJE ? '<div class="cgrp-bar"><button type="button" class="cgrp-btn ghost" data-izvozorg="' + g.org_id + '">Izvozi</button><button type="button" class="cgrp-btn ghost" data-uvozorg="' + g.org_id + '">Uvozi</button>' + splBtn + '</div>' : '';
      return '<div class="cgrp' + (open ? ' open' : '') + '" data-key="' + escape_(g.key) + '" data-org="' + escape_(g.org_id) + '"><div class="cgrp-head-row"><button type="button" class="cgrp-h' + (open ? ' open' : '') + '" data-cgrp="' + escape_(g.key) + '">' +
        '<span class="cgrp-name"><span class="cgrp-nm">' + escape_(g.label) + '</span>' + sub + (jeSpl ? SC_TAG : '') + '</span>' +
        '<span class="cgrp-count">' + stevilo(list.length) + ' art.</span><span class="cgrp-chev" aria-hidden="true">›</span></button></div>' +
        '<div class="cgrp-body' + (open ? ' show' : '') + '">' + bar + rows + '</div></div>';
    }).join('');
    box.querySelectorAll('[data-cgrp]').forEach(function (h) {
      h.addEventListener('click', function () {
        var k = h.dataset.cgrp; var willOpen = !h.classList.contains('open');
        if (willOpen) { // naenkrat naj bo odprta samo ena skupina
          box.querySelectorAll('.cgrp-h.open').forEach(function (o) {
            if (o !== h) { o.classList.remove('open'); _cenikOpen[o.dataset.cgrp] = false; var g2 = o.closest('.cgrp'); if (g2) { g2.classList.remove('open'); var b2 = g2.querySelector('.cgrp-body'); if (b2) b2.classList.remove('show'); } }
          });
        }
        _cenikOpen[k] = willOpen; h.classList.toggle('open', willOpen);
        var g = h.closest('.cgrp'); if (g) g.classList.toggle('open', willOpen);
        var b = g ? g.querySelector('.cgrp-body') : null;
        if (b) b.classList.toggle('show', willOpen);
      });
    });
    box.querySelectorAll('[data-cedit]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); cenikUredi(bn); }));
    box.querySelectorAll('[data-cdel]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); var row = bn.closest('.cenik-row'); cenikIzbrisi(parseInt(bn.dataset.cdel, 10), row ? row.dataset.org : null); }));
    // vlečenje artiklov znotraj skupine → vrstni red članstva te stranke
    box.querySelectorAll('.cgrp-body').forEach(function (body) {
      dndSort(body, '.cenik-row', '.cenik-grip', function () { cenikShraniVrstniRed(body); });
    });
    box.querySelectorAll('[data-neworg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); cenikNov(bn.dataset.neworg, bn); }));
    box.querySelectorAll('[data-addexist]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); dodajObstojec(bn.dataset.addexist, bn); }));
    box.querySelectorAll('[data-izvozorg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); izvoziCenik(bn.dataset.izvozorg); }));
    box.querySelectorAll('[data-uvozorg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); uvoziVStranko(bn.dataset.uvozorg); }));
    box.querySelectorAll('[data-splorg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); preklopiSplosni(bn.dataset.splorg, bn.dataset.splon !== '1'); }));
    { // dodajanje standardnih artiklov naravnost v splošni cenik
      var _scNew = box.querySelector('.sc-new'), _scId = box.querySelector('.sc-id-new'), _scBtn = box.querySelector('.sc-add-btn');
      var _scDodaj = function () { var nm = (_scNew.value || '').trim(); if (!nm) return; var id = normId(_scId.value) || nextSc(); dodajSplosniArtikel(nm, id); };
      if (_scBtn) _scBtn.addEventListener('click', function (e) { e.stopPropagation(); _scDodaj(); });
      [_scNew, _scId].forEach(function (el) { if (!el) return; el.addEventListener('click', function (e) { e.stopPropagation(); }); el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); _scDodaj(); } }); });
    }
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  function izvoziCenik(orgId) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }) || {};
    var ime = o.name || 'stranka';
    // enak nabor kot v prikazu Cenika: članstva (CLANI) + lastni artikli, brez podvajanj, po vrstnem redu
    var _seen = {}, _items = [];
    (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) { var p = CENIKMAP[a.cena_sifra]; if (p && !_seen[p.sifra]) { _seen[p.sifra] = true; _items.push({ p: p, ord: (a.sort_order != null ? a.sort_order : 1e9) }); } } });
    (CENIK || []).forEach(function (x) { if (x.org_id === orgId && !_seen[x.sifra]) { _seen[x.sifra] = true; _items.push({ p: x, ord: (x.sort_order != null ? x.sort_order : 1e9) }); } });
    _items.sort(function (a, b) { return (a.ord - b.ord) || cenikSort(a.p, b.p); });
    var rows = _items.map(function (it) { return it.p; });
    var payload = { _sc: 'SMARTCLEAN_CENIK', v: 1, izvozeno: new Date().toISOString(),
      stranka: { naziv: o.name || '', podjetje: o.legal_name || '', ddv: o.vat_id || '' },
      artikli: rows.map(function (x) { return { id: normId(x.koda), naziv: x.naziv || '', em: x.em || 'kos', cena: (x.cena1 != null ? x.cena1 : 0) }; }) };
    var json = JSON.stringify(payload).replace(/</g, '\\u003c');
    var vrst = rows.map(function (x) { return '<tr><td class="id">' + escape_(normId(x.koda) || '—') + '</td><td>' + escape_(x.naziv || '') + '</td><td>' + escape_(x.em || 'kos') + '</td><td class="c">' + cenaFmt(x.cena1) + '</td></tr>'; }).join('');
    var datum = new Date().toLocaleDateString('sl-SI');
    var css = 'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:0;padding:32px;background:#f4f5f6}' +
      '.wrap{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2e5e8;border-radius:12px;padding:28px 30px}' +
      '.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}' +
      'h1{margin:0;font-size:26px;letter-spacing:-.01em}.sub{color:#333;font-size:15px;margin-top:4px;font-weight:600}.sub2{color:#777;font-size:12px;margin-top:3px}' +
      '.print{border:1px solid #111;background:#111;color:#fff;border-radius:100px;padding:9px 18px;font-size:13px;cursor:pointer}' +
      'table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e6e9ec}' +
      'th{background:#f2f4f5;text-transform:uppercase;font-size:11px;letter-spacing:.05em;color:#555}' +
      'td.id{font-family:ui-monospace,Menlo,Consolas,monospace;color:#333;white-space:nowrap}td.c,th.c{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
      '.empty{color:#999;text-align:center;padding:20px}.foot{margin-top:14px;color:#777;font-size:12px;text-align:right}' +
      '@media print{body{background:#fff;padding:0}.wrap{border:none;border-radius:0;max-width:none;padding:0}.print{display:none}}';
    var doc = '<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cenik — ' + escape_(ime) + '</title><style>' + css + '</style></head><body><div class="wrap">' +
      '<div class="head"><div><h1>Cenik</h1><div class="sub">' + escape_(ime) + (o.legal_name ? ' · ' + escape_(o.legal_name) : '') + '</div><div class="sub2">Izvoženo ' + escape_(datum) + ' · SmartClean</div></div><button class="print" onclick="window.print()">Natisni</button></div>' +
      '<table><thead><tr><th>ID</th><th>Artikel</th><th>EM</th><th class="c">Cena (neto/kos)</th></tr></thead><tbody>' + (vrst || '<tr><td colspan="4" class="empty">Prazen cenik</td></tr>') + '</tbody></table>' +
      '<div class="foot">Skupaj artiklov: ' + rows.length + '</div></div>' +
      '<script type="application/json" id="sc-cenik-data">' + json + '<\/script></body></html>';
    var blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'cenik-' + String(o.name || 'stranka').replace(/[^a-zA-Z0-9._-]+/g, '_') + '.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Cenik izvožen (' + rows.length + ' art.)');
  }
  function izbrisiStranko(orgId, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-delconf')) { cenikRender(); return; }
    const ime = ORGIME[orgId] || 'stranko';
    bar.insertAdjacentHTML('afterend', '<div class="cenik-delconf"><p class="cenik-warn">⚠ Res izbrišem stranko <b>' + escape_(ime) + '</b>? Skrita bo iz Strank, Faktur in cenika. Artikli in spremni listi ostanejo. Obnoviš jo lahko 30 dni v »Nedavno brisani«.</p><div class="cgrp-bar"><button type="button" class="cgrp-btn danger cenik-delconf-yes">Da, izbriši</button><button type="button" class="cgrp-btn ghost cenik-delconf-no">Prekliči</button></div></div>');
    const wrap = bar.nextElementSibling;
    wrap.querySelector('.cenik-delconf-no').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    wrap.querySelector('.cenik-delconf-yes').addEventListener('click', async e => {
      e.stopPropagation();
      const { error } = await sb.from('orgs').update({ deleted_at: new Date().toISOString() }).eq('id', orgId);
      if (error) { toast('Napaka: ' + error.message); return; }
      ORGSEZNAM = ORGSEZNAM.filter(o => o.id !== orgId); delete ORGIME[orgId]; zgradiCenikMap();
      toast('Stranka izbrisana (obnovljiva 30 dni)');
      cenikRender();
    });
  }
  async function cenikShraniVrstniRed(body) {
    var g = body.closest ? body.closest('.cgrp') : null;
    var orgId = g ? g.dataset.org : null;
    var els = [].slice.call(body.querySelectorAll('.cenik-row'));
    if (!els.length) return;
    // Splošni cenik: vrstni red je skupen → shrani v pricelist.sort_order
    if (g && g.dataset.key === 'splosni') {
      var supd = [];
      els.forEach(function (el, i) { var sif = parseInt(el.dataset.s, 10); if (isNaN(sif)) return; supd.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', sif)); if (CENIKMAP[sif]) CENIKMAP[sif].sort_order = i; });
      var sres = await Promise.all(supd);
      if (sres.some(function (r) { return r.error; })) toast('Vrstni red morda ni v celoti shranjen.');
      return;
    }
    if (!orgId) return;
    var updates = [];
    els.forEach(function (el, i) {
      var sif = parseInt(el.dataset.s, 10); if (isNaN(sif)) return;
      // vrstni red je per-stranka → shrani v članstvo (articles.sort_order)
      updates.push(sb.from('articles').update({ sort_order: i }).eq('org_id', orgId).eq('cena_sifra', sif));
      if (CLANI) CLANI.forEach(function (a) { if (a.org_id === orgId && a.cena_sifra === sif) a.sort_order = i; });
      if (CENIKMAP[sif] && CENIKMAP[sif].org_id === orgId) CENIKMAP[sif].sort_order = i;
    });
    var res = await Promise.all(updates);
    if (res.some(function (r) { return r.error; })) toast('Vrstni red morda ni v celoti shranjen.');
  }
  function izbrisiSkupino(prefix, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-delconf')) { cenikRender(); return; }
    const sifre = CENIK.filter(x => !x.org_id && cenikSkupina(x.naziv) === prefix).map(x => x.sifra);
    bar.insertAdjacentHTML('afterend', '<div class="cenik-delconf"><p class="cenik-warn">⚠ Izbrišem celotno skupino <b>' + escape_(prefix) + '</b> (' + sifre.length + ' artiklov)? Gredo v koš — obnoviš jih lahko 30 dni v »Nedavno brisani«.</p><div class="cgrp-bar"><button type="button" class="cgrp-btn danger cenik-delconf-yes">Da, izbriši ' + sifre.length + ' art.</button><button type="button" class="cgrp-btn ghost cenik-delconf-no">Prekliči</button></div></div>');
    const wrap = bar.nextElementSibling;
    wrap.querySelector('.cenik-delconf-no').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    wrap.querySelector('.cenik-delconf-yes').addEventListener('click', async e => {
      e.stopPropagation();
      if (!sifre.length) { cenikRender(); return; }
      const { error } = await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).in('sifra', sifre);
      if (error) { toast('Napaka: ' + error.message); return; }
      CENIK = CENIK.filter(x => sifre.indexOf(x.sifra) < 0); zgradiCenikMap();
      toast('Skupina izbrisana (' + sifre.length + ' art., obnovljivo 30 dni)');
      cenikRender();
    });
  }
  function cenikUredi(btn) {
    const s = parseInt(btn.dataset.cedit, 10);
    const rec = CENIKMAP[s]; if (!rec) return;
    const row = btn.closest('.cenik-row');
    row.innerHTML = '<div class="cenik-edit-form"><input type="text" class="cenik-nm-in" placeholder="Naziv artikla">' +
      '<div class="cenik-edit-r"><label class="cenik-mini-lab">ID<input type="text" class="cenik-id-in" maxlength="5" placeholder="PV001"></label>' +
      '<label class="cenik-mini-lab">Cena €<input type="text" class="cenik-in" inputmode="decimal" placeholder="0,00"></label>' +
      '<button type="button" class="btn-mini cenik-save">Shrani</button><button type="button" class="cenik-x cenik-cancel" title="prekliči">×</button></div></div>';
    const nmIn = row.querySelector('.cenik-nm-in'), cIn = row.querySelector('.cenik-in'), idIn = row.querySelector('.cenik-id-in');
    nmIn.value = rec.naziv || ''; cIn.value = String(rec.cena1).replace('.', ','); idIn.value = normId(rec.koda);
    nmIn.focus();
    [nmIn, cIn, idIn].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
    const shrani = async () => {
      const nm = nmIn.value.trim();
      const v = parseFloat(String(cIn.value).replace(',', '.'));
      const novId = normId(idIn.value);
      const curId = normId(rec.koda);
      if (!nm) { toast('Vpiši naziv'); return; }
      if (isNaN(v) || v < 0) { toast('Neveljavna cena'); return; }
      if (novId && !veljavenId(novId)) { toast('ID mora biti 2 črki + 3 številke (npr. PV001).'); idIn.focus(); return; }
      if (novId && novId !== curId) { const z = idZaseden(novId, s); if (z) { toast('ID ' + novId + ' že uporablja: ' + (z.naziv || '#' + z.sifra)); idIn.focus(); return; } }
      const patch = { naziv: nm, cena1: v, updated_at: new Date().toISOString() };
      if (novId !== curId) patch.koda = novId;
      const { error } = await sb.from('pricelist').update(patch).eq('sifra', s);
      if (error) { toast('Napaka: ' + error.message); return; }
      if (nm !== rec.naziv) { await posodobiImeArtikla(s, nm); }
      rec.naziv = nm; rec.cena1 = v; if (novId !== curId) rec.koda = novId; zgradiCenikMap();
      toast('Shranjeno.');
      cenikRender();
    };
    row.querySelector('.cenik-save').addEventListener('click', e => { e.stopPropagation(); shrani(); });
    row.querySelector('.cenik-cancel').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    cIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } else if (e.key === 'Escape') { cenikRender(); } });
    idIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } });
    nmIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cIn.focus(); } });
  }
  async function cenikIzbrisi(s, orgId) {
    s = parseInt(s, 10);
    const rec = CENIKMAP[s]; if (!rec) return;
    var _ok = await potrdiModal({ naslov: 'Odstrani artikel', sporocilo: 'Odstranim artikel „' + (rec.naziv || ('#' + s)) + '"' + (orgId ? ' iz cenika te stranke' : '') + '?', potrdi: 'Odstrani', preklici: 'Prekliči', nevarno: true });
    if (!_ok) return;
    // odstrani povezavo (članstvo) te stranke z artiklom
    if (orgId) {
      const e1 = (await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s)).error;
      if (e1) { toast('Napaka: ' + e1.message); return; }
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s); });
    }
    // če je artikel LASTEN tej stranki (ni deljen), ga tudi mehko izbriši iz kataloga
    if (rec.org_id === orgId) {
      await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', s);
      CENIK = CENIK.filter(function (x) { return x.sifra !== s; }); zgradiCenikMap();
      toast('Artikel odstranjen (obnovljiv 30 dni)');
    } else {
      toast('Artikel odstranjen iz cenika stranke');
    }
    cenikRender();
  }
  function cenikNov(orgId, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-nov')) { cenikRender(); return; }
    bar.insertAdjacentHTML('afterend', '<div class="cenik-nov"><input type="text" class="cenik-nov-nm" placeholder="Naziv novega artikla"><div class="cenik-nov-r"><input type="text" class="cenik-nov-c" inputmode="decimal" placeholder="Cena €"><button type="button" class="btn-mini cenik-nov-save">Ustvari</button><button type="button" class="cenik-x cenik-nov-cancel">×</button></div></div>');
    const wrap = bar.nextElementSibling;
    const nmIn = wrap.querySelector('.cenik-nov-nm'), cIn = wrap.querySelector('.cenik-nov-c');
    nmIn.focus();
    [nmIn, cIn].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
    const ustvari = async () => {
      const nm = nmIn.value.trim(); const v = parseFloat(String(cIn.value).replace(',', '.')) || 0;
      if (!nm) { toast('Vpiši naziv'); return; }
      const nova = await naslednjaSifra();
      const key = orgId ? ('org:' + orgId) : 'splosno';
      const sibs = CENIK.filter(x => cenikGroupKey(x) === key);
      const so = sibs.reduce((m, x) => Math.max(m, x.sort_order != null ? x.sort_order : 0), 0) + 1;
      const novaRec = { sifra: nova, koda: '', naziv: nm, em: 'kos', cena1: v, cena2: 0, org_id: orgId || null, sort_order: so };
      const { error } = await sb.from('pricelist').insert(novaRec);
      if (error) { toast('Napaka: ' + error.message); return; }
      if (orgId) {
        const { data: maxd } = await sb.from('articles').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
        const aOrder = ((maxd && maxd[0] && maxd[0].sort_order) || 0) + 1;
        const ai = await sb.from('articles').insert({ org_id: orgId, name: nm, sort_order: aOrder, cena_sifra: nova }).select('id').maybeSingle();
        if (CLANI) CLANI.push({ id: ai.data ? ai.data.id : null, org_id: orgId, name: nm, cena_sifra: nova, sort_order: aOrder });
      }
      CENIK.push(novaRec); zgradiCenikMap();
      _cenikOpen[key] = true;
      toast(orgId ? 'Artikel ustvarjen in povezan s stranko' : 'Artikel ustvarjen');
      cenikRender();
    };
    wrap.querySelector('.cenik-nov-save').addEventListener('click', e => { e.stopPropagation(); ustvari(); });
    wrap.querySelector('.cenik-nov-cancel').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    cIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ustvari(); } });
    nmIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cIn.focus(); } });
  }
  // Dodaj OBSTOJEČ artikel (že v bazi) tej stranki — deljeni katalog: le povezava, brez kopije.
  function dodajObstojec(orgId, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-pick')) { cenikRender(); return; }
    bar.insertAdjacentHTML('afterend', '<div class="cenik-pick"><input type="text" class="cenik-pick-in" placeholder="Iskanje po ID ali nazivu …"><div class="cenik-pick-list"></div><div class="cgrp-bar"><button type="button" class="cgrp-btn ghost cenik-pick-cancel">Zapri</button></div></div>');
    const wrap = bar.nextElementSibling, inp = wrap.querySelector('.cenik-pick-in'), listEl = wrap.querySelector('.cenik-pick-list');
    inp.addEventListener('click', e => e.stopPropagation()); inp.focus();
    var ze = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) ze[a.cena_sifra] = true; }); (CENIK || []).forEach(function (x) { if (x.org_id === orgId) ze[x.sifra] = true; });
    function render() {
      var qq = inp.value.trim().toLowerCase();
      var seen = {}, prods = [];
      (CENIK || []).forEach(function (x) {
        if (ze[x.sifra] || seen[x.sifra]) return; seen[x.sifra] = true;
        if (qq && !((x.naziv || '').toLowerCase().includes(qq) || normId(x.koda).toLowerCase().includes(qq))) return;
        prods.push(x);
      });
      prods.sort(function (a, b) { return (a.naziv || '').localeCompare(b.naziv || '', 'sl'); });
      prods = prods.slice(0, 80);
      listEl.innerHTML = prods.length ? prods.map(function (x) { return '<button type="button" class="cenik-pick-item" data-s="' + x.sifra + '"><span class="pk-id">' + escape_(normId(x.koda) || '—') + '</span><span class="pk-nm">' + escape_(x.naziv || '') + '</span><b class="pk-c">' + cenaFmt(x.cena1) + '</b></button>'; }).join('') : '<p class="u-sub" style="padding:10px 4px">Ni artiklov za dodati.</p>';
      listEl.querySelectorAll('.cenik-pick-item').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); izberi(parseInt(b.dataset.s, 10)); }); });
    }
    async function izberi(sif) {
      var p = CENIKMAP[sif]; if (!p) return;
      var maxo = 0; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.sort_order != null && a.sort_order > maxo) maxo = a.sort_order; });
      var ins = await sb.from('articles').insert({ org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: maxo + 1 }).select('id').maybeSingle();
      if (ins.error) { toast('Napaka: ' + ins.error.message); return; }
      if (CLANI) CLANI.push({ id: ins.data ? ins.data.id : null, org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: maxo + 1 });
      _cenikOpen['org:' + orgId] = true;
      toast('Artikel dodan stranki');
      cenikRender();
    }
    inp.addEventListener('input', render);
    wrap.querySelector('.cenik-pick-cancel').addEventListener('click', function (e) { e.stopPropagation(); cenikRender(); });
    render();
  }
  // Uvoz cenika iz portalskega HTML izvoza v izbrano stranko (nadomesti njen cenik).
  function uvoziVStranko(orgId) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.html,text/html'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; document.body.removeChild(inp);
      if (!f) return;
      if (!/\.html?$/i.test(f.name)) { toast('Napačna datoteka: dovoljen je samo portalski izvoz cenika (.html).'); return; }
      var rd = new FileReader();
      rd.onload = function () {
        var txt = String(rd.result || '');
        var m = txt.match(/<script[^>]*id="sc-cenik-data"[^>]*>([\s\S]*?)<\/script>/i);
        var data = null; if (m) { try { data = JSON.parse(m[1].replace(/\\u003c/gi, '<')); } catch (e) { data = null; } }
        if (!data || data._sc !== 'SMARTCLEAN_CENIK' || !Array.isArray(data.artikli)) { toast('Datoteka ni veljaven izvoz cenika iz portala.'); return; }
        uporabiUvoz(orgId, data);
      };
      rd.readAsText(f);
    });
    inp.click();
  }
  async function uporabiUvoz(orgId, data) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }) || {};
    var ok0 = await potrdiModal({
      naslov: 'Uvozi cenik',
      sporocilo: 'Uvozim ' + data.artikli.length + ' artiklov v cenik stranke »' + (o.name || '') + '«? Obstoječi cenik te stranke bo nadomeščen (artikli se povežejo po ID). Cene in nazivi so skupni za vse stranke z istim ID.',
      potrdi: 'Uvozi', nevarno: true
    });
    if (!ok0) return;
    toast('Uvažam …');
    var ciljneSifre = [];
    for (var i = 0; i < data.artikli.length; i++) {
      var a = data.artikli[i]; var id = normId(a.id);
      var naziv = String(a.naziv || '').trim(); var cena = (typeof a.cena === 'number') ? a.cena : (parseFloat(String(a.cena).replace(',', '.')) || 0);
      var em = String(a.em || 'kos');
      var prod = id ? produktPoId(id) : null;
      if (prod) {
        // obstoječ skupni artikel → posodobi naziv+ceno (velja za vse)
        if (prod.naziv !== naziv || prod.cena1 !== cena) { await sb.from('pricelist').update({ naziv: naziv, cena1: cena, em: em }).eq('sifra', prod.sifra); prod.naziv = naziv; prod.cena1 = cena; prod.em = em; }
        ciljneSifre.push(prod.sifra);
      } else {
        var nova = await naslednjaSifra();
        var rec = { sifra: nova, koda: id, naziv: naziv, em: em, cena1: cena, cena2: 0, org_id: null, sort_order: null };
        var pe = await sb.from('pricelist').insert(rec).error;
        if (pe) { toast('Napaka pri artiklu ' + (id || naziv) + ': ' + pe.message); continue; }
        CENIK.push(rec); zgradiCenikMap();
        ciljneSifre.push(nova);
      }
    }
    // trenutna članstva te stranke
    var obst = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) obst[a.cena_sifra] = a; });
    // dodaj manjkajoča članstva (po vrsti iz datoteke)
    for (var j = 0; j < ciljneSifre.length; j++) {
      var sif = ciljneSifre[j];
      if (obst[sif]) { await sb.from('articles').update({ sort_order: j }).eq('org_id', orgId).eq('cena_sifra', sif); obst[sif].sort_order = j; delete obst[sif]; }
      else { var p = CENIKMAP[sif]; var ins = await sb.from('articles').insert({ org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j }).select('id').maybeSingle(); if (CLANI) CLANI.push({ id: ins.data ? ins.data.id : null, org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j }); }
    }
    // odstrani članstva, ki jih v datoteki ni
    var odstrani = Object.keys(obst);
    for (var k = 0; k < odstrani.length; k++) {
      var s2 = parseInt(odstrani[k], 10);
      await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s2);
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s2); });
      var rec2 = CENIKMAP[s2]; if (rec2 && rec2.org_id === orgId) { await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', s2); CENIK = CENIK.filter(function (x) { return x.sifra !== s2; }); zgradiCenikMap(); }
    }
    _cenikOpen['org:' + orgId] = true;
    toast('Uvoženo: ' + ciljneSifre.length + ' artiklov');
    cenikRender();
  }
  // JEDRO: vklopi/izklopi splošni cenik za stranko (spremeni bazo + CENIK/CLANI).
  //  on=true  → stranki dodeli VSE SC-artikle (nadomesti obstoječe cene).
  //  on=false → seznam artiklov stranke se ISPRAZNI (odstrani vsa članstva in lastne artikle).
  async function nastaviSplosni(orgId, on) {
    if (on) {
      var sc = (CENIK || []).filter(function (x) { return jeSc(x.koda); }).slice().sort(cenikSort);
      if (!sc.length) { toast('Splošni cenik je prazen (ni artiklov z ID SC…).'); return false; }
      var ciljneSifre = sc.map(function (x) { return x.sifra; });
      var obst = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) obst[a.cena_sifra] = a; });
      for (var j = 0; j < ciljneSifre.length; j++) {
        var sif = ciljneSifre[j];
        if (obst[sif]) { await sb.from('articles').update({ sort_order: j }).eq('org_id', orgId).eq('cena_sifra', sif); obst[sif].sort_order = j; delete obst[sif]; }
        else { var p = CENIKMAP[sif]; var ins = await sb.from('articles').insert({ org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j }).select('id').maybeSingle(); if (CLANI) CLANI.push({ id: ins.data ? ins.data.id : null, org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j }); }
      }
      var odstrani = Object.keys(obst);
      for (var k = 0; k < odstrani.length; k++) {
        var s2 = parseInt(odstrani[k], 10);
        await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s2);
        if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s2); });
        var rec2 = CENIKMAP[s2]; if (rec2 && rec2.org_id === orgId) { await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', s2); CENIK = CENIK.filter(function (x) { return x.sifra !== s2; }); zgradiCenikMap(); }
      }
      var brez = (CLANI || []).filter(function (a) { return a.org_id === orgId && a.cena_sifra == null && a.id != null; });
      for (var m = 0; m < brez.length; m++) { await sb.from('articles').delete().eq('id', brez[m].id); }
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra == null); });
      return true;
    } else {
      // IZKLOP → prazen seznam: odstrani vsa članstva stranke in njene lastne NE-SC artikle.
      // SC-artiklov (splošni cenik) NIKOLI ne brišemo — so skupni in veljajo za vse.
      var lastni = (CENIK || []).filter(function (x) { return x.org_id === orgId && !jeSc(x.koda); }).map(function (x) { return x.sifra; });
      await sb.from('articles').delete().eq('org_id', orgId);
      if (CLANI) CLANI = CLANI.filter(function (a) { return a.org_id !== orgId; });
      for (var i2 = 0; i2 < lastni.length; i2++) { await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', lastni[i2]); }
      if (lastni.length) { var _ls = {}; lastni.forEach(function (s) { _ls[s] = 1; }); CENIK = CENIK.filter(function (x) { return !_ls[x.sifra]; }); zgradiCenikMap(); }
      return true;
    }
  }
  // Preklop iz Ceniki (z opozorilom) — vklop nadomesti cene, izklop izprazni seznam.
  async function preklopiSplosni(orgId, on) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }) || {};
    var ime = o.name || 'stranko';
    var ok0 = await potrdiModal(on ? {
      naslov: 'Vklopi splošni cenik',
      sporocilo: 'Vklopim splošni cenik za »' + ime + '«? To nadomesti obstoječe cene in artikle te stranke s splošnim cenikom.',
      potrdi: 'Vklopi'
    } : {
      naslov: 'Izklopi splošni cenik',
      sporocilo: 'Izklopim splošni cenik za »' + ime + '«? Seznam artiklov te stranke bo prazen.',
      potrdi: 'Izklopi in izprazni', nevarno: true
    });
    if (!ok0) return;
    toast(on ? 'Vklapljam splošni cenik …' : 'Izklapljam …');
    _cenikOpen['org:' + orgId] = true;
    var ok = await nastaviSplosni(orgId, on);
    if (ok === false) return;
    toast(on ? 'Splošni cenik vklopljen' : 'Splošni cenik izklopljen (seznam prazen)');
    cenikRender();
  }
  function cenikPoveziPrefix(prefix, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-orgpick')) { cenikRender(); return; }
    bar.insertAdjacentHTML('afterend', '<div class="cenik-orgpick"><input type="text" class="cenik-org-in" placeholder="Iskanje stranke …"><div class="cenik-org-list"></div><div class="cgrp-bar"><button type="button" class="cgrp-btn ghost cenik-org-cancel">Prekliči</button></div></div>');
    const wrap = bar.nextElementSibling;
    const inp = wrap.querySelector('.cenik-org-in'), listEl = wrap.querySelector('.cenik-org-list');
    inp.focus(); inp.addEventListener('click', e => e.stopPropagation());
    function render() {
      const qq = inp.value.trim().toLowerCase();
      let orgs = ORGSEZNAM.filter(o => !qq || (o.name || '').toLowerCase().includes(qq) || (o.legal_name || '').toLowerCase().includes(qq));
      orgs = orgs.slice(0, 40);
      listEl.innerHTML = orgs.length ? orgs.map(o => '<button type="button" class="cenik-org-item" data-o="' + o.id + '"><span>' + escape_(o.name) + '</span><small>' + escape_(o.legal_name || '') + '</small></button>').join('') : '<p class="u-sub" style="padding:10px 4px">Ni strank.</p>';
      listEl.querySelectorAll('.cenik-org-item').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); izberi(b.dataset.o); }));
    }
    async function izberi(orgId) {
      const sifre = CENIK.filter(x => !x.org_id && cenikSkupina(x.naziv) === prefix).map(x => x.sifra);
      if (!sifre.length) { toast('Ni artiklov za povezavo'); return; }
      const { error } = await sb.from('pricelist').update({ org_id: orgId }).in('sifra', sifre);
      if (error) { toast('Napaka: ' + error.message); return; }
      CENIK.forEach(x => { if (sifre.indexOf(x.sifra) >= 0) x.org_id = orgId; }); zgradiCenikMap();
      _cenikOpen['org:' + orgId] = true;
      toast('Povezano z ' + (ORGIME[orgId] || 'stranko') + ' (' + sifre.length + ' art.)');
      cenikRender();
    }
    wrap.querySelector('.cenik-org-cancel').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    inp.addEventListener('input', render);
    render();
  }
  async function cenikOdvezi(orgId) {
    const sifre = CENIK.filter(x => x.org_id === orgId).map(x => x.sifra);
    if (!sifre.length) return;
    const { error } = await sb.from('pricelist').update({ org_id: null }).in('sifra', sifre);
    if (error) { toast('Napaka: ' + error.message); return; }
    CENIK.forEach(x => { if (x.org_id === orgId) x.org_id = null; }); zgradiCenikMap();
    toast('Povezava s stranko preklicana');
    cenikRender();
  }
  async function risiKos() {
    const box = $('cenikList'); if (!box) return;
    box.innerHTML = NALAGANJE;
    if ($('cenikPod')) $('cenikPod').textContent = 'Nedavno brisani — obnovljivi 30 dni';
    const mejnik = new Date(Date.now() - 30 * 864e5).toISOString();
    let orgsDel = [];
    { const ro = await sb.from('orgs').select('id,name,legal_name,deleted_at').not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false }); if (!ro.error) orgsDel = ro.data || []; }
    const ra = await sb.from('pricelist').select('sifra,koda,naziv,em,cena1,deleted_at').not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false });
    const arr = ra.error ? [] : (ra.data || []);
    let html = '<div class="cgrp-bar"><button type="button" class="cgrp-btn" id="kosNazaj">← Nazaj na cenik</button></div>';
    if (orgsDel.length) {
      html += '<h3 class="sec-h" style="margin:6px 0 8px">Izbrisane stranke</h3><div class="cenik" style="margin-bottom:18px">' + orgsDel.map(function (o) {
        return '<div class="cenik-row"><div class="cenik-nm">' + escape_(o.name) + '</div>' +
          '<div class="cenik-meta">' + escape_(o.legal_name || '') + ' · izbrisana ' + datumcas(o.deleted_at) + '</div>' +
          '<div class="cenik-cena"><button type="button" class="btn-mini cenik-restore" data-restoreorg="' + o.id + '">Obnovi</button></div></div>';
      }).join('') + '</div>';
    }
    html += '<h3 class="sec-h" style="margin:6px 0 8px">Izbrisani artikli</h3>';
    if (ra.error) html += '<div class="msg bad show">Napaka: ' + escape_(ra.error.message) + '</div>';
    else if (!arr.length) html += '<div class="empty"><h3>Ni brisanih artiklov</h3><p>Zadnjih 30 dni ni brisanih artiklov.</p></div>';
    else html += '<div class="cenik">' + arr.map(function (x) {
      return '<div class="cenik-row"><div class="cenik-nm">' + escape_(x.naziv) + '</div>' +
        '<div class="cenik-meta">' + (x.koda ? escape_(normId(x.koda)) + ' · ' : '') + 'izbrisan ' + datumcas(x.deleted_at) + '</div>' +
        '<div class="cenik-cena"><span class="cenik-val">' + cenaFmt(x.cena1) + '</span><button type="button" class="btn-mini cenik-restore" data-restore="' + x.sifra + '">Obnovi</button></div></div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    var nz = document.getElementById('kosNazaj'); if (nz) nz.addEventListener('click', () => risiCeniki());
    box.querySelectorAll('[data-restore]').forEach(bn => bn.addEventListener('click', () => cenikObnovi(parseInt(bn.dataset.restore, 10))));
    box.querySelectorAll('[data-restoreorg]').forEach(bn => bn.addEventListener('click', () => cenikObnoviOrg(bn.dataset.restoreorg)));
  }
  async function cenikObnovi(s) {
    const { error } = await sb.from('pricelist').update({ deleted_at: null }).eq('sifra', s);
    if (error) { toast('Napaka: ' + error.message); return; }
    toast('Artikel obnovljen'); CENIK = null; CENIKMAP = null;
    risiKos();
  }
  async function cenikObnoviOrg(id) {
    const { error } = await sb.from('orgs').update({ deleted_at: null }).eq('id', id);
    if (error) { toast('Napaka: ' + error.message); return; }
    await naloziOrge(); zgradiCenikMap();
    toast('Stranka obnovljena'); risiKos();
  }
  async function uvoziCenik() {
    const b = $('cenikUvoz'); if (!b) return;
    b.disabled = true; b.textContent = 'Uvažam …';
    try {
      const r = await fetch('ceniki.json', { cache: 'no-cache' });
      const j = await r.json();
      const rows = (j.postavke || []).map(x => ({ sifra: x.s, koda: x.k, naziv: x.n, em: x.e, cena1: x.c1, cena2: x.c2 }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from('pricelist').upsert(rows.slice(i, i + 200), { onConflict: 'sifra', ignoreDuplicates: true });
        if (error) throw error;
      }
      toast('Cenik uvožen (' + rows.length + ' artiklov)');
      await risiCeniki();
    } catch (e) {
      toast('Uvoz ni uspel: ' + (e.message || e));
    }
    b.disabled = false; b.textContent = 'Uvozi cenik iz PDF-ja';
  }

  function risiNastavitve() {
    oznaciTemo();
    if (!risiNastavitve._wired) {
      document.querySelectorAll('#sec-nastavitve [data-tema]').forEach(b => {
        b.addEventListener('click', () => nastaviTemo(b.dataset.tema));
      });
      risiNastavitve._wired = true;
    }
    risiMenijRed();
  }
  // Razvrščanje razdelkov levega menija (povleci; isti drag & drop kot pri artiklih).
  function risiMenijRed() {
    var sec = $('sec-nastavitve'); if (!sec) return;
    var panel = sec.querySelector('.menu-order-panel');
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'panel menu-order-panel';
      panel.innerHTML = '<h3 class="sec-h">Vrstni red menija</h3><p class="u-sub" style="margin-bottom:14px">Povleci razdelke za razvrščanje v levem meniju.</p><ul class="menu-order-list"></ul><button type="button" class="btn btn-narrow ghost menu-order-reset" style="margin-top:12px">Ponastavi privzeti vrstni red</button>';
      sec.appendChild(panel);
      panel.querySelector('.menu-order-reset').addEventListener('click', function () {
        try { localStorage.removeItem('sc-menu-order'); } catch (e) {} shraniNastavitve();
        meni(); if (meni._drsnik) meni._drsnik(); risiMenijRed(); toast('Vrstni red menija ponastavljen');
      });
    }
    var ul = panel.querySelector('.menu-order-list');
    var g = urediGlavni(glavniMeni());
    ul.innerHTML = g.map(function (x) {
      var zaklenjen = x[0] === 'domov';
      if (zaklenjen) {
        return '<li class="mo-locked" data-k="' + escape_(x[0]) + '"><span class="art-grip mo-spacer" aria-hidden="true"></span><span class="mo-ikona" aria-hidden="true">' + ikona(x[0]) + '</span><span class="mo-ime">' + escape_(x[1]) + '</span></li>';
      }
      return '<li data-k="' + escape_(x[0]) + '"><button type="button" class="art-grip dnd-handle" title="povleci za razvrščanje" aria-label="razvrsti">' + DND_ICON + '</button><span class="mo-ikona" aria-hidden="true">' + ikona(x[0]) + '</span><span class="mo-ime">' + escape_(x[1]) + '</span></li>';
    }).join('');
    dndSort(ul, 'li', '.dnd-handle', function (items) {
      // »domov« ostane vedno prvi, ne glede na položaj v seznamu.
      var red = items.map(function (li) { return li.dataset.k; }).filter(function (k) { return k !== 'domov'; });
      red.unshift('domov');
      try { localStorage.setItem('sc-menu-order', JSON.stringify(red)); } catch (e) {} shraniNastavitve();
      meni(); if (meni._drsnik) meni._drsnik();
      risiMenijRed(); // ponovno izriši, da »Pregled« vedno ostane na vrhu
    });
  }

  let _toastEl = null;
  function toast(t) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.className = 'sc-toast';
      _toastEl.setAttribute('role', 'status');
      _toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = t;
    _toastEl.classList.add('show');
    clearTimeout(_toastEl._h);
    _toastEl._h = setTimeout(() => _toastEl.classList.remove('show'), 2600);
  }
  // Dostopnost modalnih oken: ujemi fokus znotraj okna (Tab kroži) in ga ob
  // zaprtju vrni na element, ki je okno odprl (kot pri velikih ponudnikih).
  var _modalPrevFocus = null;
  function _modalA11y(back) {
    _modalPrevFocus = document.activeElement;
    var okno = back.querySelector('.sc-modal');
    var h = back.querySelector('h4');
    if (okno && h && h.textContent) {
      var mid = 'scm-' + Math.random().toString(36).slice(2, 8);
      h.id = mid; okno.setAttribute('aria-labelledby', mid);
    }
    function ostri() {
      return Array.prototype.filter.call(
        back.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),
        function (el) { return !el.disabled && el.offsetParent !== null; }
      );
    }
    back._trap = function (e) {
      if (e.key !== 'Tab') return;
      var f = ostri(); if (!f.length) return;
      var prvi = f[0], zadnji = f[f.length - 1];
      if (e.shiftKey && document.activeElement === prvi) { e.preventDefault(); zadnji.focus(); }
      else if (!e.shiftKey && document.activeElement === zadnji) { e.preventDefault(); prvi.focus(); }
    };
    back.addEventListener('keydown', back._trap);
  }
  function _modalVrniFokus() {
    try { if (_modalPrevFocus && _modalPrevFocus.focus) _modalPrevFocus.focus(); } catch (e) {}
    _modalPrevFocus = null;
  }
  // Potrditveno okno V PORTALU (namesto brskalnikovega confirm). Vrne Promise<boolean>.
  function potrdiModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var danger = !!opts.nevarno;
      var back = document.createElement('div');
      back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4></h4><p></p><div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no></button><button type="button" class="sc-modal-btn ' + (danger ? 'danger' : 'primary') + '" data-yes></button></div></div>';
      back.querySelector('h4').textContent = opts.naslov || 'Potrditev';
      back.querySelector('p').textContent = opts.sporocilo || '';
      back.querySelector('[data-no]').textContent = opts.preklici || 'Prekliči';
      back.querySelector('[data-yes]').textContent = opts.potrdi || 'Potrdi';
      document.body.appendChild(back);
      _modalA11y(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(val) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); _modalVrniFokus(); resolve(val); }
      function onKey(e) { if (e.key === 'Escape') zapri(false); else if (e.key === 'Enter') zapri(true); }
      back.querySelector('[data-no]').addEventListener('click', function (e) { e.stopPropagation(); zapri(false); });
      back.querySelector('[data-yes]').addEventListener('click', function (e) { e.stopPropagation(); zapri(true); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(false); });
      document.addEventListener('keydown', onKey);
      var yb = back.querySelector('[data-yes]'); if (yb) yb.focus();
    });
  }
  // Vnosno okno (nadomešča window.prompt) — vrne niz ali null (preklic).
  function vnesiModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var back = document.createElement('div');
      back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4></h4><p></p><input type="text" class="sc-modal-input"><div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no></button><button type="button" class="sc-modal-btn primary" data-yes></button></div></div>';
      back.querySelector('h4').textContent = opts.naslov || 'Vnos';
      var pEl = back.querySelector('p'); if (opts.sporocilo) pEl.textContent = opts.sporocilo; else pEl.style.display = 'none';
      var inp = back.querySelector('.sc-modal-input');
      inp.value = opts.privzeto || ''; if (opts.placeholder) inp.placeholder = opts.placeholder;
      back.querySelector('[data-no]').textContent = opts.preklici || 'Prekliči';
      back.querySelector('[data-yes]').textContent = opts.potrdi || 'Shrani';
      document.body.appendChild(back);
      _modalA11y(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(val) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); _modalVrniFokus(); resolve(val); }
      function onKey(e) { if (e.key === 'Escape') zapri(null); else if (e.key === 'Enter') { e.preventDefault(); zapri(inp.value); } }
      back.querySelector('[data-no]').addEventListener('click', function (e) { e.stopPropagation(); zapri(null); });
      back.querySelector('[data-yes]').addEventListener('click', function (e) { e.stopPropagation(); zapri(inp.value); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(null); });
      document.addEventListener('keydown', onKey);
      setTimeout(function () { inp.focus(); inp.select(); }, 60);
    });
  }
  // ── Enotni spustni meniji (custom select) po standardu portala ──────────
  // Nativni <select> ostane (skrit) — vsa obstoječa logika (value/change) dela naprej.
  // Končni ↓/↑ v besedilu možnosti nariše kot SVG: znak iz pisave sedi na osnovni črti
  // in je videti zamaknjen navzdol. Nativni <option> obdrži znak (rezerva brez JS).
  var CS_SMER = { '↓': '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/>',
                  '↑': '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/>' };
  function csNapis(el, besedilo) {
    var m = /^(.*\S)\s*([↓↑])$/.exec(besedilo || '');
    el.textContent = m ? m[1] : (besedilo || '');
    if (m) el.insertAdjacentHTML('beforeend', '<svg class="cs-smer" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-label="' + (m[2] === '↓' ? 'padajoče' : 'naraščajoče') + '">' + CS_SMER[m[2]] + '</svg>');
  }
  function olepsajSelect(sel) {
    try {
      if (!sel || sel._cs || sel.multiple || sel.dataset.noCs === '1') return;
      var wrap = document.createElement('div'); wrap.className = 'cs';
      sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
      var trig = document.createElement('button'); trig.type = 'button'; trig.className = 'cs-trigger';
      trig.innerHTML = '<span class="cs-val"></span><span class="cs-arr" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
      wrap.appendChild(trig);
      sel._cs = true; sel.classList.add('cs-native');
      var valEl = trig.querySelector('.cs-val');
      function syncVal() { var o = sel.options[sel.selectedIndex]; csNapis(valEl, o ? o.textContent : ''); }
      syncVal();
      var panel = null;
      function zapri() { if (panel) { panel.remove(); panel = null; } wrap.classList.remove('cs-open'); document.removeEventListener('mousedown', ven, true); document.removeEventListener('keydown', tipka, true); }
      function ven(e) { if (!wrap.contains(e.target)) zapri(); }
      function tipka(e) { if (e.key === 'Escape') zapri(); }
      function odpri() {
        if (panel) { zapri(); return; }
        panel = document.createElement('div'); panel.className = 'cs-panel';
        for (var i = 0; i < sel.options.length; i++) {
          var o = sel.options[i];
          var it = document.createElement('div'); it.className = 'cs-opt' + (i === sel.selectedIndex ? ' sel' : '') + (o.disabled ? ' dis' : '');
          csNapis(it, o.textContent); it.dataset.i = i; panel.appendChild(it);
        }
        panel.addEventListener('mousedown', function (e) { e.preventDefault(); var it = e.target.closest('.cs-opt'); if (!it || it.classList.contains('dis')) return; sel.selectedIndex = parseInt(it.dataset.i, 10); syncVal(); sel.dispatchEvent(new Event('change', { bubbles: true })); zapri(); });
        wrap.appendChild(panel); wrap.classList.add('cs-open');
        var s = panel.querySelector('.cs-opt.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
        document.addEventListener('mousedown', ven, true); document.addEventListener('keydown', tipka, true);
      }
      trig.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); odpri(); });
      sel.addEventListener('change', syncVal);
      try { var mo = new MutationObserver(syncVal); mo.observe(sel, { childList: true, attributes: true, attributeFilter: ['value'] }); } catch (e) {}
    } catch (e) {}
  }
  function olepsajVse(root) { (root || document).querySelectorAll('select:not(.cs-native)').forEach(olepsajSelect); }
  function zazeniCustomSelecte() {
    olepsajVse(document);
    try {
      var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          (m.addedNodes || []).forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.tagName === 'SELECT') olepsajSelect(n);
            else if (n.querySelectorAll) n.querySelectorAll('select:not(.cs-native)').forEach(olepsajSelect);
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  /* ══════════ STRANKE (osebje) ══════════ */
  let ARTSTEVILO = {};
  function fmtKg(kg) { return tezaFmt(kg); }
  function fmtTona(kg) { return tezaFmt(kg); }
  function kgPoStrankiMesec() {
    const z = new Date(), y = z.getFullYear(), m = z.getMonth(), map = {};
    LISTI.forEach(l => {
      const d = new Date(String(l.doc_date || '') + 'T00:00:00');
      if (d.getFullYear() === y && d.getMonth() === m) map[l.org_id] = (map[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0);
    });
    return map;
  }
  async function risiStranke() {
    if (OSEBJE) { const b = $('novaStrankaBtn'); if (b) b.classList.remove('hidden'); }
    render();
  }
  function render() {
    var _sy = window.scrollY;
    const q = $('search').value.trim().toLowerCase();
    const kgm = kgPoStrankiMesec();
    // razvrstitev strank (skupna nastavitev; velja tudi za Cenik) — po prometu ali abecedno
    const ss = $('strankeSort'); if (ss) ss.value = custOrderMode();
    let list = q ? ORGSEZNAM.filter(o => (o.name + ' ' + (o.legal_name || '')).toLowerCase().includes(q)) : ORGSEZNAM.slice();
    list = razvrstiStranke(list, custOrderMode(), kgm);
    const skupajKg = ORGSEZNAM.reduce((s, o) => s + (kgm[o.id] || 0), 0);
    $('count').textContent = ORGSEZNAM.length + ' strank · ' + fmtKg(skupajKg) + ' opranega ta mesec';
    if (!list.length) {
      $('content').innerHTML = '<div class="rows"><div class="empty"><h3>Nič se ne ujema</h3>' + '<p>Poskusite z drugim delom naziva.</p></div></div>';
      oknoPoIzrisu();
      return;
    }
    const naj = Math.max(...ORGSEZNAM.map(o => kgm[o.id] || 0), 1);
    $('content').innerHTML = '<div class="rows">' + list.map((o, i) => {
      const kg = kgm[o.id] || 0;
      const _spl = strankaSplosni(o.id);
      return `<div class="lcell"><button class="row${_spl ? ' has-sc' : ''}" type="button" data-id="${o.id}" data-i="${i}" aria-expanded="false">
      <span><span class="row-name"><span class="row-nm">${escape_(o.name)}</span></span><br><span class="row-legal">${o.legal_name ? escape_(o.legal_name) : ''}</span>${_spl ? SC_TAG : ''}</span>
      <span class="row-pct" title="delež vseh količin ta mesec">${skupajKg ? (Math.round(kg / skupajKg * 1000) / 10).toLocaleString('sl-SI') + ' %' : '—'}</span>
      <span class="num">${fmtKg(kg)}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button><div class="arts" id="a${i}"></div></div>`;
    }).join('') + '</div>';
    document.querySelectorAll('#content .row').forEach(b => { b.addEventListener('click', () => toggle(b)); strankaPredNalozi(b); });
    pripniMarquee('content');
    oknoPoIzrisu();
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  $('search').addEventListener('input', render);
  { const ss = $('strankeSort'); if (ss) { ss.value = custOrderMode(); ss.addEventListener('change', function () { try { localStorage.setItem('sc-cust-order', ss.value); } catch (e) {} shraniNastavitve(); render(); }); } }
  { const b = $('novaStrankaBtn'); if (b) b.addEventListener('click', () => novaStranka()); }

  // Ob hoverju na kartico se predolgo ime »odvije« (marquee, kot v glasbenih aplikacijah).
  function pripniMarquee(contId) {
    var cont = $(contId); if (!cont || cont._mqPripet) return; cont._mqPripet = true;
    function odvij(row, on) {
      var nm = row.querySelector('.row-nm'), mask = row.querySelector('.row-name'); if (!nm || !mask) return;
      if (on) {
        nm.style.maxWidth = 'none';
        var over = nm.scrollWidth - mask.clientWidth;
        if (over > 2) { nm.style.textOverflow = 'clip'; nm.style.transitionDuration = Math.max(0.5, over / 70) + 's'; nm.style.transform = 'translateX(-' + (over + 4) + 'px)'; }
        else { nm.style.maxWidth = ''; }
      } else { nm.style.transform = ''; nm.style.textOverflow = ''; nm.style.maxWidth = ''; }
    }
    cont.addEventListener('mouseover', function (e) { var row = e.target.closest('.row'); if (row && cont.contains(row)) odvij(row, true); });
    cont.addEventListener('mouseout', function (e) { var row = e.target.closest('.row'); if (row && !row.contains(e.relatedTarget)) odvij(row, false); });
  }
  // Stranka se odpre v OKNU (prej se je razprla v mreži). Artikli se naložijo PRED
  // odprtjem — okno zraste naravnost v končno velikost, namesto da bi se odprlo prazno
  // (»Nalagam …«) in se artikli pojavili šele za njim.
  function strankaNalozi(btn) {
    const box = $('a' + btn.dataset.i);
    if (!box) return Promise.resolve();
    box._kartica = btn;   // značko »Splošni cenik« sinhroniziramo na kartici, ne na sosednjem elementu (ta je v oknu drug)
    if (box.dataset.loaded) return Promise.resolve();
    if (!box._nalaganje) {
      // loaded nastavi risiArtikleBox sam, le ob uspehu — po napaki se ob naslednjem odprtju poskusi znova.
      box._nalaganje = risiArtikleBox(box, btn.dataset.id, true)
        .then(null, function () {})
        .then(function () { box._nalaganje = null; });
    }
    return box._nalaganje;
  }
  async function toggle(btn) {
    if (_okno || btn._nalagam) return;
    const box = $('a' + btn.dataset.i);
    const id = btn.dataset.id;
    if (!box.dataset.loaded) {
      btn._nalagam = true; btn.classList.add('nalaga');
      await strankaNalozi(btn);
      btn._nalagam = false; btn.classList.remove('nalaga');
      if (!btn.isConnected || _okno) return;   // vmes izrisano na novo ali že odprto
    }
    box._kartica = btn;
    oknoOdpri(btn, box, () => document.querySelector('#content .row[data-id="' + String(id).replace(/"/g, '\\"') + '"]'));
  }
  // Ko se miška za trenutek ustavi nad kartico, začni nalagati artikle — do klika so
  // navadno že pripravljeni. Zamik, da prelet čez mrežo ne sproži desetin poizvedb.
  function strankaPredNalozi(btn) {
    var t = null;
    btn.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; t = setTimeout(function () { strankaNalozi(btn); }, 140); });
    btn.addEventListener('pointerleave', function () { clearTimeout(t); });
    btn.addEventListener('pointerdown', function () { strankaNalozi(btn); });   // dotik: začni že ob pritisku
  }
  // brezPomika: nalaganje v ozadju (pred odprtjem okna) — ne vračaj strani na staro višino,
  // sicer bi te med drsenjem vrglo nazaj, ko se nalaganje konča.
  async function risiArtikleBox(box, orgId, brezPomika) {
    var _sy = window.scrollY;
    // ob osvežitvi (box že ima vsebino) ne pokaži »Nalagam« — brez utripa
    if (!box.dataset.loaded) box.innerHTML = NALAGANJE;
    const org = ORGSEZNAM.find(o => o.id === orgId) || {};
    await nalozicenik();
    let arts;
    const r = await sb.from('articles').select('id,name,cena_sifra,aktiven,teza,viden_app').eq('org_id', orgId).order('sort_order');
    if (r.error) {
      const r1b = await sb.from('articles').select('id,name,cena_sifra').eq('org_id', orgId).order('sort_order');
      if (r1b.error) {
        const r2 = await sb.from('articles').select('id,name').eq('org_id', orgId).order('sort_order');
        if (r2.error) { box.innerHTML = '<p class="meta">Napaka: ' + escape_(r2.error.message) + '</p>'; return; }
        arts = r2.data || [];
      } else arts = r1b.data || [];
    } else arts = r.data || [];
    // isti vrstni red kot v Ceniku: razvrsti po sort_order povezane cene (pricelist)
    arts.sort(function (a, b) {
      var pa = (a.cena_sifra != null && CENIKMAP && CENIKMAP[a.cena_sifra]) ? CENIKMAP[a.cena_sifra].sort_order : null;
      var pb = (b.cena_sifra != null && CENIKMAP && CENIKMAP[b.cena_sifra]) ? CENIKMAP[b.cena_sifra].sort_order : null;
      if (pa != null && pb != null && pa !== pb) return pa - pb;
      if (pa != null && pb == null) return -1;
      if (pa == null && pb != null) return 1;
      return (a.name || '').localeCompare(b.name || '', 'sl');
    });
    // Skupno število opranih kosov posameznega artikla (vseh časov) — prek RPC.
    var kosMap = {};
    try { var _kr = await sb.rpc('stranka_kosi', { p_org: orgId }); if (_kr && !_kr.error) (_kr.data || []).forEach(function (x) { kosMap[x.article_id] = Number(x.kosov) || 0; }); } catch (e) {}
    const meta = [org.vat_id ? 'Davčna <b>' + escape_(org.vat_id) + '</b>' : 'Brez davčne številke', org.address ? escape_(org.address) : 'Brez naslova'].join(' · ');
    let html = '<p class="meta">' + meta + '</p>';
    if (OSEBJE) html += `<div class="u-acts" style="margin:2px 0 10px"><button type="button" class="str-edit">Uredi podatke stranke</button><button type="button" class="str-del cgrp-btn danger" data-org="${orgId}">Izbriši stranko</button></div>`;
    function cenaOznaka(a) {
      const c = cenaZaArtikel(a.cena_sifra);
      if (c != null) return '<span class="art-cena on" title="' + escape_((CENIKMAP[a.cena_sifra] && CENIKMAP[a.cena_sifra].naziv) || '') + '">' + cenaFmt(c) + '</span>';
      return '<span class="art-cena">ni cene</span>';
    }
    function idOznaka(a) {
      const k = (a.cena_sifra != null && CENIKMAP[a.cena_sifra]) ? CENIKMAP[a.cena_sifra].koda : null;
      return k ? '<span class="art-id">' + escape_(normId(k)) + '</span>' : '<span class="art-id art-id-none">brez ID</span>';
    }
    var _na = arts.length;
    var _besed = _na === 1 ? 'artikel' : (_na === 2 ? 'artikla' : ((_na === 3 || _na === 4) ? 'artikli' : 'artiklov'));
    // seznam artiklov z urejanjem teže (teža je NA ARTIKLU — pri vsaki stranki svoja)
    function tezaOznaka(a, idx) {
      if (OSEBJE) {
        var tv = (a.teza != null && a.teza !== '') ? String(a.teza).replace('.', ',') : '';
        return '<span class="str-art-teza"><input type="text" inputmode="decimal" class="str-teza-in" data-idx="' + idx + '" value="' + escape_(tv) + '" placeholder="0,00" aria-label="Teža na kos"><span class="str-teza-u">kg</span></span>';
      }
      return '<span class="str-art-teza u-sub">' + (a.teza != null && a.teza !== '' ? fmtTeza(a.teza) : '—') + '</span>';
    }
    function kosovOznaka(a) {
      var n = kosMap[a.id] || 0;
      return '<span class="str-art-kos" title="Skupno opranih kosov (vseh časov)">' + (n ? stevilo(n) + ' kos' : '—') + '</span>';
    }
    function appOznaka(a, idx) {
      var on = a.viden_app !== false;
      if (OSEBJE) return '<label class="str-art-app" title="Viden v aplikaciji za to stranko"><input type="checkbox" class="str-app-chk" data-idx="' + idx + '"' + (on ? ' checked' : '') + '><span>app</span></label>';
      return on ? '' : '<span class="str-art-app off" title="Skrit v aplikaciji">skrit</span>';
    }
    var artRows = arts.map(function (a, i) {
      return '<div class="str-art">' + idOznaka(a) + '<span class="str-art-nm">' + escape_(a.name || '') + '</span>' + kosovOznaka(a) + tezaOznaka(a, i) + appOznaka(a, i) + '</div>';
    }).join('');
    html += '<div class="str-arts">' + (arts.length ? artRows : '<p class="meta">Brez artiklov v ceniku.</p>') + '</div>';
    html += `<p class="art-cenik-hint">${_na ? _na + ' ' + _besed + ' v ceniku' : ''}${OSEBJE ? `${_na ? ' · ' : ''}<button type="button" class="art-to-cenik" data-org="${orgId}">Uredi v Ceniku ›</button>` : ''}</p>`;
    box.innerHTML = html;
    if (OSEBJE) {
      { const eb = box.querySelector('.str-edit'); if (eb) eb.addEventListener('click', e => { e.stopPropagation(); urediStranko(box, orgId); }); }
      { const db = box.querySelector('.str-del'); if (db) db.addEventListener('click', e => { e.stopPropagation(); izbrisiStrankoStranke(orgId, box); }); }
      { const cl = box.querySelector('.art-to-cenik'); if (cl) cl.addEventListener('click', e => { e.stopPropagation(); var pre = strankaSkupina(orgId); _artOpen = {}; if (pre) _artOpen[pre] = true; pojdi('artikli'); }); }
      box.querySelectorAll('.str-teza-in').forEach(function (inp) {
        inp.addEventListener('click', function (e) { e.stopPropagation(); });
        inp.addEventListener('change', async function () {
          var a = arts[+inp.dataset.idx]; if (!a) return;
          var raw = inp.value.trim().replace(',', '.');
          var teza = raw === '' ? null : parseFloat(raw);
          if (teza != null && (isNaN(teza) || teza < 0)) { toast('Neveljavna teža.'); return; }
          var e1 = (await sb.from('articles').update({ teza: teza }).eq('id', a.id)).error;
          if (e1) { toast('Napaka: ' + e1.message); return; }
          a.teza = teza;
          logDodaj('Artikli', 'Urejeno', 'Teža „' + (a.name || '') + '" · ' + (teza != null ? tezaFmt(teza) : '—'));
          toast('Teža shranjena.');
        });
      });
      box.querySelectorAll('.str-app-chk').forEach(function (chk) {
        chk.addEventListener('click', function (e) { e.stopPropagation(); });
        chk.addEventListener('change', async function () {
          var a = arts[+chk.dataset.idx]; if (!a) return;
          var val = chk.checked;
          var e1 = (await sb.from('articles').update({ viden_app: val }).eq('id', a.id)).error;
          if (e1) { toast('Napaka: ' + e1.message); chk.checked = !val; return; }
          a.viden_app = val;
          logDodaj('Artikli', 'Urejeno', (val ? 'Viden v app' : 'Skrit v app') + ' · „' + (a.name || '') + '"');
          toast(val ? 'Artikel viden v aplikaciji.' : 'Artikel skrit v aplikaciji.');
        });
      });
    }
    // sinhroniziraj značko »Splošni cenik« na vrstici stranke (živo, ob vsaki spremembi artiklov)
    try {
      var _row = box._kartica || box.previousElementSibling;
      if (_row && _row.classList && _row.classList.contains('row')) {
        var _priced = arts.filter(function (a) { return a.cena_sifra != null; });
        var _spl = _priced.length > 0 && _priced.every(function (a) { var p = CENIKMAP[a.cena_sifra]; return p && jeSc(p.koda); });
        var _rn = _row.querySelector('.row-name'); var _wrap = _rn ? _rn.parentNode : null; var _has = _row.querySelector('.sc-tag');
        if (_wrap) { if (_spl && !_has) _wrap.insertAdjacentHTML('beforeend', SC_TAG); else if (!_spl && _has) _has.remove(); }
        _row.classList.toggle('has-sc', !!_spl);
        if (_okno && _okno.vsebina === box) oknoGlava();
      }
    } catch (e) {}
    box.dataset.loaded = '1';
    if (!brezPomika) requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  // Dodaj OBSTOJEČ artikel (deljeni katalog) tej stranki — v razdelku Stranke.
  async function dodajObstojecStranka(orgId, box) {
    await nalozicenik();
    const host = box.querySelector('.art-exist-box'); if (!host) return;
    if (host.dataset.open) { host.innerHTML = ''; host.removeAttribute('data-open'); return; }
    host.dataset.open = '1';
    var ex = {};
    var r = await sb.from('articles').select('cena_sifra').eq('org_id', orgId);
    if (!r.error) (r.data || []).forEach(function (a) { if (a.cena_sifra != null) ex[a.cena_sifra] = true; });
    (CENIK || []).forEach(function (x) { if (x.org_id === orgId) ex[x.sifra] = true; });
    host.innerHTML = '<div class="cenik-pick" style="border:1px solid var(--line);border-radius:12px;margin-top:10px"><input type="text" class="cenik-pick-in" placeholder="Iskanje obstoječega artikla po ID ali nazivu …"><div class="cenik-pick-list"></div></div>';
    var inp = host.querySelector('.cenik-pick-in'), listEl = host.querySelector('.cenik-pick-list');
    inp.addEventListener('click', function (e) { e.stopPropagation(); }); inp.focus();
    function render() {
      var qq = inp.value.trim().toLowerCase(), seen = {}, prods = [];
      (CENIK || []).forEach(function (x) { if (ex[x.sifra] || seen[x.sifra]) return; seen[x.sifra] = true; if (qq && !((x.naziv || '').toLowerCase().includes(qq) || normId(x.koda).toLowerCase().includes(qq))) return; prods.push(x); });
      prods.sort(function (a, b) { return (a.naziv || '').localeCompare(b.naziv || '', 'sl'); }); prods = prods.slice(0, 80);
      listEl.innerHTML = prods.length ? prods.map(function (x) { return '<button type="button" class="cenik-pick-item" data-s="' + x.sifra + '"><span class="pk-id">' + escape_(normId(x.koda) || '—') + '</span><span class="pk-nm">' + escape_(x.naziv || '') + '</span><b class="pk-c">' + cenaFmt(x.cena1) + '</b></button>'; }).join('') : '<p class="u-sub" style="padding:10px 4px">Ni artiklov za dodati.</p>';
      listEl.querySelectorAll('.cenik-pick-item').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); izberi(parseInt(b.dataset.s, 10)); }); });
    }
    async function izberi(sif) {
      var p = CENIKMAP[sif]; if (!p) return;
      var mx = await sb.from('articles').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
      var so = ((mx.data && mx.data[0] && mx.data[0].sort_order) || 0) + 1;
      var ins = await sb.from('articles').insert({ org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: so });
      if (ins.error) { toast('Napaka: ' + ins.error.message); return; }
      if (CLANI) CLANI.push({ org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: so });
      toast('Artikel dodan stranki');
      risiArtikleBox(box, orgId);
    }
    inp.addEventListener('input', render); render();
  }
  async function shraniArtVrstniRed(ul) {
    const lis = [].slice.call(ul.querySelectorAll('li'));
    if (!lis.length) return;
    // Zapiši vrstni red v pricelist.sort_order (skupni vir za Cenik in Stranke) + v articles.sort_order.
    const artUpd = [], priceUpd = [];
    lis.forEach((el, i) => {
      if (el.dataset.artid) artUpd.push(sb.from('articles').update({ sort_order: i }).eq('id', el.dataset.artid));
      const s = el.dataset.s ? parseInt(el.dataset.s, 10) : null;
      if (s != null && !isNaN(s)) { priceUpd.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', s)); if (CENIKMAP && CENIKMAP[s]) CENIKMAP[s].sort_order = i; }
    });
    const res = await Promise.all(artUpd.concat(priceUpd));
    if (res.some(r => r.error)) toast('Vrstni red ni v celoti shranjen.'); else toast('Vrstni red shranjen');
  }
  function poveziArtikel(btn, box, orgId) {
    const li = btn.closest('li');
    const artId = btn.dataset.art;
    const curS = btn.dataset.s !== '' ? parseInt(btn.dataset.s, 10) : null;
    const org = ORGSEZNAM.find(o => o.id === orgId) || {};
    if (!CENIK || !CENIK.length) { toast('Cenik je prazen — najprej ustvari artikle v razdelku Ceniki.'); return; }
    li.innerHTML = '<div class="art-pick"><input type="text" class="art-pick-in" placeholder="Iskanje po ceniku …">' +
      '<div class="art-pick-list"></div><div class="art-pick-acts">' +
      (curS != null ? '<button type="button" class="art-pick-clear">Odveži</button>' : '') +
      '<button type="button" class="art-pick-cancel">Prekliči</button></div></div>';
    const inp = li.querySelector('.art-pick-in'), listEl = li.querySelector('.art-pick-list');
    inp.addEventListener('click', e => e.stopPropagation());
    inp.focus();
    // artikli te stranke iz cenika (org_id) — »manj stvari«; iskanje pa gre čez cel cenik
    const lastni = CENIK.filter(x => x.org_id === orgId);
    const imaLastne = lastni.length > 0;
    function render() {
      const q = inp.value.trim().toLowerCase();
      let items;
      if (q) items = CENIK.filter(x => (x.naziv || '').toLowerCase().includes(q) || (x.koda || '').toLowerCase().includes(q) || String(x.sifra) === q);
      else items = imaLastne ? lastni : CENIK;
      items = items.slice(0, 60);
      const hint = (!q && !imaLastne) ? '<p class="u-sub" style="padding:6px 4px">Ta stranka v ceniku še nima svojih artiklov — poveži cenik s stranko v razdelku Ceniki, ali išči po celotnem ceniku.</p>' : '';
      listEl.innerHTML = hint + (items.length ? items.map(x => '<button type="button" class="art-pick-item' + (x.sifra === curS ? ' on' : '') + '" data-s="' + x.sifra + '"><span>' + escape_(x.naziv) + '</span><b>' + cenaFmt(x.cena1) + '</b></button>').join('') : '<p class="u-sub" style="padding:10px 4px">Ni zadetkov.</p>');
      listEl.querySelectorAll('.art-pick-item').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); izberi(parseInt(b.dataset.s, 10)); }));
    }
    async function izberi(sifra) {
      const { error } = await sb.from('articles').update({ cena_sifra: sifra }).eq('id', artId);
      if (error) { toast('Napaka: ' + error.message); return; }
      toast('Cena povezana'); risiArtikleBox(box, orgId);
    }
    li.querySelector('.art-pick-cancel').addEventListener('click', e => { e.stopPropagation(); risiArtikleBox(box, orgId); });
    const clr = li.querySelector('.art-pick-clear');
    if (clr) clr.addEventListener('click', async e => { e.stopPropagation(); const { error } = await sb.from('articles').update({ cena_sifra: null }).eq('id', artId); if (error) { toast('Napaka: ' + error.message); return; } toast('Odvezano'); risiArtikleBox(box, orgId); });
    inp.addEventListener('input', render);
    render();
  }
  async function dodajArtikel(orgId, name, box, id) {
    await nalozicenik();
    id = normId(id);
    if (id && idZaseden(id, null)) { toast('ID ' + id + ' je že v uporabi.'); return; }
    // Ustvari tudi zapis v ceniku (pricelist), da je artikel viden v razdelku Ceniki, kjer se doda cena.
    var novaSif = null;
    if (CENIK) {
      novaSif = await naslednjaSifra();
      var sibs = CENIK.filter(function (x) { return x.org_id === orgId; });
      var so = sibs.reduce(function (m, x) { return Math.max(m, x.sort_order != null ? x.sort_order : 0); }, 0) + 1;
      var novaRec = { sifra: novaSif, koda: (id || ''), naziv: name, em: 'kos', cena1: 0, cena2: 0, org_id: orgId, sort_order: so };
      var pe = await sb.from('pricelist').insert(novaRec);
      if (pe.error) { novaSif = null; } // cenik brez razširitve (org_id) — nadaljuj le z artiklom
      else { CENIK.push(novaRec); zgradiCenikMap(); }
    }
    const { data: maxd } = await sb.from('articles').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
    const nextOrder = ((maxd && maxd[0] && maxd[0].sort_order) || 0) + 1;
    var artRec = { org_id: orgId, name, sort_order: nextOrder };
    if (novaSif != null) artRec.cena_sifra = novaSif;
    const { error } = await sb.from('articles').insert(artRec);
    if (error) { toast('Napaka: ' + error.message); return; }
    toast(novaSif != null ? 'Artikel dodan (viden tudi v Ceniku)' : 'Artikel dodan');
    await risiArtikleBox(box, orgId);
  }
  // Vklop/izklop vidnosti artikla v aplikaciji (tablici). Ne briše — samo skrije.
  async function preklopiArtikelViden(artId, on, box, orgId) {
    const { error } = await sb.from('articles').update({ aktiven: on }).eq('id', artId);
    if (error) { toast(/aktiven/.test(error.message || '') ? 'Najprej zaženi migracijo (stolpec »aktiven«).' : 'Napaka: ' + error.message); return; }
    toast(on ? 'Artikel viden v aplikaciji' : 'Artikel skrit v aplikaciji');
    await risiArtikleBox(box, orgId);
  }
  async function izbrisiArtikel(artId, box, orgId) {
    var _li = box.querySelector('li[data-artid="' + artId + '"]');
    var _nm = (_li && _li.querySelector('.art-nm')) ? _li.querySelector('.art-nm').textContent.trim() : '';
    var _ok = await potrdiModal({ naslov: 'Odstrani artikel', sporocilo: _nm ? ('Odstranim artikel „' + _nm + '" iz cenika te stranke?') : 'Odstranim ta artikel iz cenika te stranke?', potrdi: 'Odstrani', preklici: 'Prekliči', nevarno: true });
    if (!_ok) return;
    // če je artikel povezan z lastno ceno te stranke, jo mehko izbriši tudi iz cenika
    var sif = null;
    const ad = await sb.from('articles').select('cena_sifra').eq('id', artId).maybeSingle();
    if (ad && ad.data) sif = ad.data.cena_sifra;
    const { error } = await sb.from('articles').delete().eq('id', artId);
    if (error) { toast('Napaka: ' + error.message); return; }
    if (sif != null && CENIKMAP && CENIKMAP[sif] && CENIKMAP[sif].org_id === orgId) {
      await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', sif);
      if (CENIK) { CENIK = CENIK.filter(function (x) { return x.sifra !== sif; }); zgradiCenikMap(); }
    }
    toast('Artikel odstranjen');
    await risiArtikleBox(box, orgId);
  }
  function preimenujArtikel(btn, box, orgId) {
    const li = btn.closest('li');
    const id = btn.dataset.art, cur = btn.dataset.nm || '';
    const sif = li.dataset.s ? parseInt(li.dataset.s, 10) : null;
    const curId = (sif != null && CENIKMAP && CENIKMAP[sif]) ? normId(CENIKMAP[sif].koda) : '';
    li.innerHTML = '<div class="art-edit"><input type="text" class="art-ren-in" placeholder="Naziv artikla">' +
      '<div class="art-edit-r"><input type="text" class="art-id-in" placeholder="ID (PV001)" maxlength="5">' +
      '<button type="button" class="btn-mini art-ren-save">Shrani</button>' +
      '<button type="button" class="art-del art-ren-cancel" title="prekliči" aria-label="prekliči">×</button></div></div>';
    const inp = li.querySelector('.art-ren-in'), idInp = li.querySelector('.art-id-in');
    inp.value = cur; idInp.value = curId;
    [inp, idInp].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
    inp.focus();
    const konec = () => risiArtikleBox(box, orgId);
    li.querySelector('.art-ren-cancel').addEventListener('click', e => { e.stopPropagation(); konec(); });
    const shrani = async () => {
      const nm = inp.value.trim(); const novId = normId(idInp.value);
      if (!nm) { toast('Vpiši naziv.'); return; }
      if (novId && !veljavenId(novId)) { toast('ID mora biti 2 črki + 3 številke (npr. PV001).'); idInp.focus(); return; }
      if (novId && novId !== curId) { const z = idZaseden(novId, sif); if (z) { toast('ID ' + novId + ' že uporablja: ' + (z.naziv || '#' + z.sifra)); idInp.focus(); return; } }
      if (nm !== cur) {
        const e1 = (await sb.from('articles').update({ name: nm }).eq('id', id)).error;
        if (e1) { toast('Napaka: ' + e1.message); return; }
      }
      if (sif != null && CENIKMAP && CENIKMAP[sif] && CENIKMAP[sif].org_id === orgId) {
        // artikel že ima svoj zapis v ceniku → posodobi naziv + ID
        const patch = {}; if (nm !== cur) patch.naziv = nm; if (novId !== curId) patch.koda = novId;
        if (Object.keys(patch).length) {
          const e2 = (await sb.from('pricelist').update(patch).eq('sifra', sif)).error;
          if (e2) { toast('Napaka: ' + e2.message); return; }
          if (patch.naziv != null) CENIKMAP[sif].naziv = patch.naziv;
          if (patch.koda != null) CENIKMAP[sif].koda = patch.koda;
        }
      } else if (novId) {
        // artikel še nima zapisa v ceniku → ustvari ga, da lahko nosi ID (in ceno)
        await nalozicenik();
        var sibs = (CENIK || []).filter(function (x) { return x.org_id === orgId; });
        var so = sibs.reduce(function (m, x) { return Math.max(m, x.sort_order != null ? x.sort_order : 0); }, 0) + 1;
        var rec = null, e3 = null;
        for (var t = 0; t < 4; t++) {
          var newSif = (await naslednjaSifra()) + t;
          rec = { sifra: newSif, koda: novId, naziv: nm, em: 'kos', cena1: 0, cena2: 0, org_id: orgId, sort_order: so };
          e3 = (await sb.from('pricelist').insert(rec)).error;
          if (!e3) break;
          if (!/duplicat|unique|primary|already exists/i.test(e3.message || '')) break; // druga napaka → ne ponavljaj
        }
        if (e3) { toast('ID ni bilo mogoče shraniti: ' + e3.message); return; }
        const e4 = (await sb.from('articles').update({ cena_sifra: rec.sifra }).eq('id', id)).error;
        if (e4) { toast('Napaka pri povezovanju: ' + e4.message); return; }
        if (CENIK) { CENIK.push(rec); zgradiCenikMap(); }
        toast('ID ' + novId + ' shranjen');
        await konec();
        return;
      }
      toast('Artikel shranjen');
      await konec();
    };
    li.querySelector('.art-ren-save').addEventListener('click', e => { e.stopPropagation(); shrani(); });
    [inp, idInp].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } else if (e.key === 'Escape') { konec(); } }));
  }
  function urediStranko(box, orgId) {
    const o = ORGSEZNAM.find(x => x.id === orgId) || {};
    box.innerHTML = `<div class="ur-form" style="border:none;padding:0;background:none">
      <label class="ur-f"><span>Naziv *</span><input type="text" data-e-naziv value="${escape_(o.name || '')}"></label>
      <div class="ur-grid">
        <label class="ur-f"><span>Podjetje</span><input type="text" data-e-podjetje value="${escape_(o.legal_name || '')}"></label>
        <label class="ur-f"><span>Davčna</span><input type="text" data-e-davcna value="${escape_(o.vat_id || '')}"></label>
      </div>
      <label class="ur-f"><span>Naslov</span><input type="text" data-e-naslov value="${escape_(o.address || '')}"></label>
      <div class="u-acts" style="margin-top:12px"><button type="button" class="ur-save" data-e-shrani>Shrani</button><button type="button" data-e-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-e-msg></p></div>`;
    box.querySelector('[data-e-naziv]').addEventListener('click', e => e.stopPropagation());
    box.querySelector('[data-e-preklici]').addEventListener('click', e => { e.stopPropagation(); risiArtikleBox(box, orgId); });
    box.querySelector('[data-e-shrani]').addEventListener('click', e => { e.stopPropagation(); shraniStranko(box, orgId); });
  }
  async function shraniStranko(box, orgId) {
    const g = s => box.querySelector(s);
    const naziv = g('[data-e-naziv]').value.trim();
    const msg = g('[data-e-msg]');
    if (!naziv) { msg.textContent = 'Vpiši naziv.'; return; }
    if (ORGSEZNAM.some(o => o.id !== orgId && (o.name || '').toLowerCase() === naziv.toLowerCase())) { msg.textContent = 'Druga stranka že ima ta naziv.'; return; }
    const patch = { name: naziv, legal_name: g('[data-e-podjetje]').value.trim() || null, vat_id: g('[data-e-davcna]').value.trim() || null, address: g('[data-e-naslov]').value.trim() || null };
    msg.textContent = 'Shranjujem …';
    const { error } = await sb.from('orgs').update(patch).eq('id', orgId);
    if (error) { msg.textContent = 'Napaka: ' + error.message; return; }
    const o = ORGSEZNAM.find(x => x.id === orgId);
    if (o) { o.name = patch.name; o.legal_name = patch.legal_name; o.vat_id = patch.vat_id; o.address = patch.address; }
    ORGIME[orgId] = patch.name;
    toast('Podatki shranjeni');
    await risiArtikleBox(box, orgId);
    render();
  }
  function izbrisiStrankoStranke(orgId, box) {
    const ime = ORGIME[orgId] || 'stranko';
    box.innerHTML = '<div class="str-delconf"><p class="cenik-warn">⚠ Res izbrišem stranko <b>' + escape_(ime) + '</b>? Skrita bo iz Strank, Faktur in cenika. Artikli in spremni listi ostanejo. Obnoviš jo lahko 30 dni v Ceniki → »Nedavno brisani«.</p><div class="u-acts"><button type="button" class="cgrp-btn danger" data-yes>Da, izbriši</button><button type="button" class="cgrp-btn ghost" data-no>Prekliči</button></div></div>';
    box.querySelector('[data-no]').addEventListener('click', e => { e.stopPropagation(); risiArtikleBox(box, orgId); });
    box.querySelector('[data-yes]').addEventListener('click', async e => {
      e.stopPropagation();
      const { error } = await sb.from('orgs').update({ deleted_at: new Date().toISOString() }).eq('id', orgId);
      if (error) { toast('Napaka: ' + error.message); return; }
      ORGSEZNAM = ORGSEZNAM.filter(o => o.id !== orgId); delete ORGIME[orgId];
      if (typeof CENIK !== 'undefined' && CENIK) zgradiCenikMap();
      toast('Stranka izbrisana (obnovljiva 30 dni)');
      render();
    });
  }
  function novaStranka() {
    const box = $('novaStrankaBox');
    if (!box) return;
    box.innerHTML = `<div class="ur-form">
      <h3 class="sec-h" style="margin-bottom:12px">Nova stranka</h3>
      <label class="ur-f"><span>Naziv *</span><input type="text" data-naziv></label>
      <div class="ur-grid">
        <label class="ur-f"><span>Podjetje</span><input type="text" data-podjetje></label>
        <label class="ur-f"><span>Davčna</span><input type="text" data-davcna></label>
      </div>
      <label class="ur-f"><span>Naslov</span><input type="text" data-naslov></label>
      <p class="u-sub" style="margin:10px 0 0">Cenik dodeliš pozneje v zavihku »Ceniki & artikli« → gumb »Uredi stranke«.</p>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Ustvari</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    box.querySelector('[data-preklici]').addEventListener('click', () => { box.innerHTML = ''; box.classList.remove('show'); });
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniNovaStranka(box));
    box.classList.add('show');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function shraniNovaStranka(box) {
    const g = s => box.querySelector(s);
    const naziv = g('[data-naziv]').value.trim();
    const msg = g('[data-msg]');
    if (!naziv) { msg.textContent = 'Vpiši naziv.'; return; }
    if (ORGSEZNAM.some(o => (o.name || '').toLowerCase() === naziv.toLowerCase())) { msg.textContent = 'Stranka s tem nazivom že obstaja.'; return; }
    const podjetje = g('[data-podjetje]').value.trim();
    const davcna = g('[data-davcna]').value.trim();
    const naslov = g('[data-naslov]').value.trim();
    msg.textContent = 'Shranjujem …';
    try {
      const legacyId = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      const { data: novOrg, error: e1 } = await sb.from('orgs').insert({ name: naziv, legal_name: podjetje || null, address: naslov || null, vat_id: davcna || null, legacy_id: legacyId }).select('id,name,legal_name,address,vat_id').single();
      if (e1) throw e1;
      ORGSEZNAM.push(novOrg); ORGIME[novOrg.id] = novOrg.name;
      box.innerHTML = ''; box.classList.remove('show');
      toast('Stranka ustvarjena');
      render();
    } catch (e) {
      msg.textContent = 'Napaka: ' + (e.message || e);
    }
  }

  /* ══════════ KATALOG (stranka) ══════════ */
  async function risiKatalog() {
    if (!MOJEPODJETJE) {
      $('katalogList').innerHTML = '<div class="rows"><div class="empty">' + '<h3>Tu še ni ničesar za prikaz</h3><p>Vaš račun ni povezan z nobenim podjetjem.<br>' + 'Javite se nam in vam ga uredimo.</p></div></div>';
      return;
    }
    var kbox = $('katalogList');
    pokaziNalaganje(kbox);
    const {
      data, error
    } = await sb.from('articles').select('name').eq('org_id', MOJEPODJETJE.id).order('sort_order');
    if (error) {
      if (!kbox.dataset.loaded) {
        $('katalogPod').textContent = '';
        kbox.innerHTML = '<div class="rows"><div class="empty"><h3>Nalaganje ni uspelo</h3><p>Kataloga trenutno ni bilo mogoče naložiti.<br>Preveri povezavo in poskusi znova.</p><button type="button" class="btn ghost" data-act="katalog-ponovi" style="margin-top:14px">Poskusi znova</button></div></div>';
        var _kp = kbox.querySelector('[data-act="katalog-ponovi"]');
        if (_kp) _kp.addEventListener('click', function () { risiKatalog(); });
      }
      return;
    }
    $('katalogPod').textContent = ((data === null || data === void 0 ? void 0 : data.length) || 0) + ' artiklov';
    kbox.innerHTML = '<div class="rows"><div class="arts show" style="border:none">' + (data !== null && data !== void 0 && data.length ? '<ul>' + data.map(a => '<li>' + escape_(a.name) + '</li>').join('') + '</ul>' : '<p class="none">Katalog še ni izpolnjen.</p>') + '</div></div>';
    kbox.dataset.loaded = '1';
  }

  /* ══════════ UVOZ S TABLICE ══════════
     Aplikacija Pralnica piše JSON v mapo Documents. Tu ga preberemo in
     prenesemo v bazo. Vsak zapis ima svoj id, ki ga shranimo kot legacy_id,
     zato ponoven uvoz iste datoteke ne podvaja — le dopolni. */
  let UVOZ_PODATKI = null;
  if ($('uvozFile')) $('uvozFile').addEventListener('change', async () => {
    const f = $('uvozFile').files[0];
    const m = $('uvozMsg');
    $('uvozPor').innerHTML = '';
    UVOZ_PODATKI = null;
    $('uvozBtn').disabled = true;
    if (!f) return;
    try {
      const txt = await f.text();
      let d = JSON.parse(txt);
      if (d && !Array.isArray(d) && Array.isArray(d.entries)) d = d.entries;
      if (!Array.isArray(d)) throw new Error('oblika');
      const veljavni = d.filter(e => e && e.stevilka && e.datum);
      if (!veljavni.length) throw new Error('prazno');
      UVOZ_PODATKI = veljavni;
      $('uvozBtn').disabled = false;
      m.className = 'msg show';
      m.textContent = 'Prebrano: ' + veljavni.length + ' spremnih listov iz datoteke ' + f.name + '. Kliknite Uvozi.';
    } catch (err) {
      m.className = 'msg bad show';
      m.textContent = err.message === 'prazno' ? 'V datoteki ni nobenega spremnega lista.' : 'To ni datoteka s spremnimi listi. Na tablici izberite pralnica_entries.json.';
    }
  });
  if ($('uvozBtn')) $('uvozBtn').addEventListener('click', async () => {
    if (!UVOZ_PODATKI) return;
    const m = $('uvozMsg'),
      btn = $('uvozBtn');
    btn.disabled = true;
    btn.textContent = 'Uvažam …';
    m.className = 'msg show';
    m.textContent = 'Uvažam, ne zapirajte strani …';
    const por = {
      listov: 0,
      posodobljenih: 0,
      postavk: 0,
      novihStrank: 0,
      novihArtiklov: 0,
      tezav: []
    };
    try {
      /* ── 1. stranke ─────────────────────────────────────────────── */
      const poLegacy = {},
        poImenu = {};
      const obstojece = (await vseVrstice((o, d) => sb.from('orgs').select('id,name,legacy_id').order('id', { ascending: true }).range(o, d))).data || [];
      (obstojece || []).forEach(o => {
        if (o.legacy_id) poLegacy[o.legacy_id] = o.id;
        poImenu[(o.name || '').toLowerCase()] = o.id;
      });
      for (const e of UVOZ_PODATKI) {
        const lid = e.strankaId,
          ime = (e.strankaNaziv || '').trim();
        if (!lid || poLegacy[lid]) continue;
        if (ime && poImenu[ime.toLowerCase()]) {
          poLegacy[lid] = poImenu[ime.toLowerCase()];
          continue;
        }
        const {
          data: nova,
          error
        } = await sb.from('orgs').insert({
          name: ime || lid,
          legal_name: e.strankaPodjetje || null,
          address: e.strankaNaslov || null,
          vat_id: e.strankaDavcna || null,
          legacy_id: lid
        }).select('id').single();
        if (error) {
          por.tezav.push('stranke ' + ime + ' ni bilo mogoče dodati');
          continue;
        }
        poLegacy[lid] = nova.id;
        poImenu[(ime || '').toLowerCase()] = nova.id;
        por.novihStrank++;
      }

      /* ── 2. artikli ─────────────────────────────────────────────── */
      const artPoOrg = {};
      const vsiArt = (await vseVrstice((o, d) => sb.from('articles').select('id,org_id,name,legacy_id').order('id', { ascending: true }).range(o, d))).data || [];
      (vsiArt || []).forEach(a => {
        artPoOrg[a.org_id] = artPoOrg[a.org_id] || {
          legacy: {},
          ime: {}
        };
        if (a.legacy_id) artPoOrg[a.org_id].legacy[a.legacy_id] = a.id;
        artPoOrg[a.org_id].ime[(a.name || '').toLowerCase()] = a.id;
      });
      const manjkajoci = [];
      for (const e of UVOZ_PODATKI) {
        const org = poLegacy[e.strankaId];
        if (!org) continue;
        artPoOrg[org] = artPoOrg[org] || {
          legacy: {},
          ime: {}
        };
        for (const p of e.postavke || []) {
          const ime = (p.naziv || '').trim();
          if (!ime) continue;
          const naslo = p.id && artPoOrg[org].legacy[p.id] || artPoOrg[org].ime[ime.toLowerCase()];
          if (!naslo && !manjkajoci.some(x => x.org_id === org && x.name === ime)) {
            manjkajoci.push({
              org_id: org,
              name: ime,
              legacy_id: p.id || null,
              sort_order: 999
            });
          }
        }
      }
      for (let i = 0; i < manjkajoci.length; i += 200) {
        const {
          data,
          error
        } = await sb.from('articles').insert(manjkajoci.slice(i, i + 200)).select('id,org_id,name,legacy_id');
        if (error) {
          por.tezav.push('nekaj artiklov ni bilo mogoče dodati: ' + error.message);
          break;
        }
        (data || []).forEach(a => {
          artPoOrg[a.org_id].ime[(a.name || '').toLowerCase()] = a.id;
          if (a.legacy_id) artPoOrg[a.org_id].legacy[a.legacy_id] = a.id;
        });
        por.novihArtiklov += (data || []).length;
      }

      /* ── 3. spremni listi ───────────────────────────────────────── */
      const ze = (await vseVrstice((o, d) => sb.from('delivery_notes').select('id,legacy_id').order('id', { ascending: true }).range(o, d))).data || [];
      const zeIma = {};
      (ze || []).forEach(n => {
        if (n.legacy_id) zeIma[n.legacy_id] = n.id;
      });
      for (const e of UVOZ_PODATKI) {
        const org = poLegacy[e.strankaId];
        if (!org) {
          por.tezav.push('list ' + e.stevilka + ': stranke ni bilo mogoče najti');
          continue;
        }
        const del = String(e.stevilka).split('/');
        const seq = parseInt(del[0], 10);
        const leto = parseInt(del[1], 10) || new Date(e.datum).getFullYear();
        if (!seq) {
          por.tezav.push('list ' + e.stevilka + ': številke ni bilo mogoče razbrati');
          continue;
        }
        const vrstica = {
          org_id: org,
          doc_year: leto,
          doc_seq: seq,
          doc_date: e.datum,
          issued_name: e.izdal || null,
          weight_kg: e.kg || null,
          transport: e.prevoz === 'izredni' ? 'izredni' : 'redni',
          source: 'tablet',
          legacy_id: e.id || e.stevilka + '@' + e.datum
        };
        let noteId = zeIma[vrstica.legacy_id];
        if (noteId) {
          const {
            error
          } = await sb.from('delivery_notes').update(vrstica).eq('id', noteId);
          if (error) {
            por.tezav.push('list ' + e.stevilka + ': ' + error.message);
            continue;
          }
          pozabiPostavke();
          por.posodobljenih++;
          await sb.from('delivery_note_items').delete().eq('note_id', noteId);
        } else {
          const {
            data,
            error
          } = await sb.from('delivery_notes').insert(vrstica).select('id').single();
          if (error) {
            por.tezav.push('list ' + e.stevilka + ': ' + (/duplicate|unique/i.test(error.message) ? 'številka ' + seq + '/' + leto + ' je v bazi že zasedena' : error.message));
            continue;
          }
          noteId = data.id;
          por.listov++;
        }
        const post = (e.postavke || []).filter(p => p && p.naziv).map((p, i) => ({
          note_id: noteId,
          article_id: p.id && artPoOrg[org].legacy[p.id] || artPoOrg[org].ime[(p.naziv || '').trim().toLowerCase()] || null,
          article_name: p.naziv,
          pieces: Number(p.kosov) || 0,
          sort_order: i
        }));
        if (post.length) {
          const {
            error
          } = await sb.from('delivery_note_items').insert(post);
          if (error) por.tezav.push('list ' + e.stevilka + ': postavk ni bilo mogoče dodati');else por.postavk += post.length;
        }
      }

      /* ── 4. poročilo ────────────────────────────────────────────── */
      m.className = 'msg show';
      m.textContent = 'Uvoz je končan.';
      $('uvozPor').innerHTML = '<div class="por">' + [['Novih spremnih listov', por.listov], ['Posodobljenih', por.posodobljenih], ['Postavk', por.postavk], ['Novih strank', por.novihStrank], ['Novih artiklov', por.novihArtiklov]].map(([k, v]) => `<div class="por-v"><span>${k}</span><b>${stevilo(v)}</b></div>`).join('') + (por.tezav.length ? '<div class="por-op"><b>Preskočeno (' + por.tezav.length + '):</b><br>' + por.tezav.slice(0, 12).map(escape_).join('<br>') + (por.tezav.length > 12 ? '<br>… in še ' + (por.tezav.length - 12) : '') + '</div>' : '<div class="por-op">Brez težav — vsi zapisi so prišli skozi.</div>') + '</div>';
      ARTSTEVILO = {};
      await naloziListe();
      const {
        data: sveze
      } = await vseVrstice(function (a, b) { return sb.from('orgs').select('id,name,legal_name,address,vat_id').order('name').range(a, b); });
      ORGSEZNAM = sveze || ORGSEZNAM;
      ORGIME = {};
      ORGSEZNAM.forEach(o => {
        ORGIME[o.id] = o.name;
      });
    } catch (err) {
      m.className = 'msg bad show';
      m.textContent = 'Uvoz se je ustavil: ' + (err.message || err);
    }
    btn.disabled = false;
    btn.textContent = 'Uvozi';
  });


  /* ══════════ APLIKACIJA ZA TABLICO ══════════
     Namestitveni paket leži poleg spletne različice, ne v kodi portala.
     Če ga še ni, to tu tudi piše — namesto strani 404. */
  // ?v= ob vsaki novi različici aplikacije (aplikacija/zgradi.py): brskalnik in predpomnilnik vzameta nov paket.
  var APK_POT = 'tablica/Pralnica-sync.apk?v=9.0';

  function wirePwa(scope) {
    var pb = (scope || document).querySelector('#pwaInstall');
    if (!pb) return;
    if (_pwaPrompt) pb.style.display = '';
    pb.addEventListener('click', async function () {
      if (!_pwaPrompt) return;
      _pwaPrompt.prompt();
      try { await _pwaPrompt.userChoice; } catch (e) {}
      _pwaPrompt = null;
      pb.style.display = 'none';
    });
  }
  function risiAplikacijo() {
    var p = document.getElementById('apkPanel');
    if (!p) return;
    var url = new URL(APK_POT, location.href).href;

    var IKO_WEB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 20.5h7M12 17v3.5"/></svg>';
    var IKO_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4.5 20.5h15"/></svg>';
    var IKO_TEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/></svg>';
    var IKO_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';
    function _progCard(ico, naslov, opis, akcija, id) {
      return '<div class="prog-card"' + (id ? ' id="' + id + '"' : '') + '>' +
        '<span class="prog-ico">' + ico + '</span>' +
        '<h3 class="prog-t">' + naslov + '</h3>' +
        '<p class="prog-d">' + opis + '</p>' + akcija + '</div>';
    }
    var _odpri = '<a class="btn prog-act" href="mobile/" target="_blank" rel="noopener">' + IKO_OUT + 'Odpri</a>';

    p.innerHTML = '<div class="prog-grid">' +
      _progCard(IKO_WEB, 'Spletni pogled', 'Deluje v vsakem brskalniku, brez namestitve — telefon, tablica ali računalnik.', _odpri) +
      _progCard(IKO_DL, 'Tablica (Android)', 'Namestitveni paket za vnos in tiskanje spremnih listov na tablici (različica 9.0). Pred prvo namestitvijo te različice odstrani staro aplikacijo — shranjeni listi ostanejo.', '<a class="btn prog-act apk-dl" href="' + escape_(url) + '" download>' + IKO_DL + 'Prenesi<span class="apk-mb"></span></a>', 'apkTablet') +
      _progCard(IKO_TEL, 'Telefon', 'Odpre se v brskalniku; dodaj na začetni zaslon za občutek prave aplikacije.', _odpri) +
      '</div>';

    // Gumb »Prenesi« je viden TAKOJ (skupaj z ostalimi); velikost (MB) se le pripiše, ko HEAD odgovori.
    fetch(url, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) throw new Error('ni ga');
      var mb = Number(r.headers.get('content-length') || 0) / 1048576;
      var t = document.getElementById('apkTablet'); if (!t) return;
      var mbEl = t.querySelector('.apk-mb');
      if (mbEl && mb) mbEl.textContent = ' · ' + mb.toFixed(1) + ' MB';
    }).catch(function () {
      var t = document.getElementById('apkTablet'); if (!t) return;
      var a = t.querySelector('.apk-dl');
      if (a) a.outerHTML = '<span class="prog-badge off">Trenutno ni na voljo</span>';
    });
  }

  /* ══════════ DOKUMENTI (skenirani računi) ══════════ */
  var DOKUMENTI = null;
  function dokDatum(r) {
    var d = r.datum || (r.created_at ? String(r.created_at).slice(0, 10) : '');
    if (!d) return '—';
    var p = d.split('-'); return p.length === 3 ? (p[2] + '. ' + p[1] + '. ' + p[0]) : d;
  }
  /* ══════════ DOKUMENTI — datotečni sistem (mape + datoteke) ══════════ */
  var DOK_URL = {}, _dokPot = '', _dokFsOk = true, _dokZaklepOk = true;
  var _dokHist = [''], _dokHi = 0, _dokClip = null;
  function dokPojdi(pot, noHist) {
    pot = pot || '';
    _dokPot = pot;
    if (!noHist) { _dokHist = _dokHist.slice(0, _dokHi + 1); if (_dokHist[_dokHi] !== pot) { _dokHist.push(pot); _dokHi = _dokHist.length - 1; } }
    if ($('dokIsci')) $('dokIsci').value = '';
    dokRisi();
  }
  function dokNazaj() { if (_dokHi > 0) { _dokHi--; _dokPot = _dokHist[_dokHi]; if ($('dokIsci')) $('dokIsci').value = ''; dokRisi(); } }
  function dokNaprej() { if (_dokHi < _dokHist.length - 1) { _dokHi++; _dokPot = _dokHist[_dokHi]; if ($('dokIsci')) $('dokIsci').value = ''; dokRisi(); } }
  function dokVelikost(b) { if (b == null || b === '') return ''; b = Number(b) || 0; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (Math.round(b / 104857.6) / 10) + ' MB'; }
  // Supabase shramba ne dovoli šumnikov/posebnih znakov v ključu → pretvori v ASCII.
  function dokTranslit(s) { return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); }
  function dokVarnoIme(s) { var v = dokTranslit(s).replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); return v || 'datoteka'; }
  function dokStoragePot(cilj, ime) {
    var seg = String(cilj || '').split('/').map(function (x) { return dokVarnoIme(x); }).filter(Boolean);
    return (seg.length ? seg.join('/') + '/' : '') + Date.now() + '_' + dokVarnoIme(ime);
  }
  // Poln zaslon pregled slike (namesto novega zavihka — brez glitchev na mobilnem).
  function dokLightbox(url, ime) {
    var back = document.createElement('div'); back.className = 'dok-lb';
    back.innerHTML = '<button type="button" class="dok-lb-x" aria-label="Zapri">×</button>' +
      '<img src="' + escape_(url) + '" alt="' + escape_(ime || '') + '">' +
      (ime ? '<div class="dok-lb-cap">' + escape_(ime) + '</div>' : '');
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); document.removeEventListener('keydown', onk); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onk(e) { if (e.key === 'Escape') zapri(); }
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('.dok-lb-x')) zapri(); });
    document.addEventListener('keydown', onk);
  }
  function dokImeRow(r) { return r.ime || r.opomba || (r.storage_path ? r.storage_path.split('/').pop().replace(/^\d+_/, '') : 'datoteka'); }
  function dokPripona(r) { var n = dokImeRow(r); var m = /\.([a-z0-9]+)$/i.exec(n); return (m ? m[1] : '').toLowerCase(); }
  function dokVrsta(r) {
    var e = dokPripona(r), mime = (r.mime || '').toLowerCase();
    if (/(^image\/)|jpg|jpeg|png|gif|webp|heic/.test(mime + ' ' + e)) return 'slika';
    if (e === 'pdf' || mime.indexOf('pdf') >= 0) return 'pdf';
    if (/docx?|msword|wordprocess/.test(e + ' ' + mime)) return 'word';
    if (/xlsx?|csv|excel|spreadsheet/.test(e + ' ' + mime)) return 'excel';
    return 'file';
  }
  var _DOK_IK = {
    mapa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><text x="12" y="17" font-size="6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">PDF</text></svg>',
    word: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><text x="12" y="17" font-size="6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">W</text></svg>',
    excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><text x="12" y="17" font-size="6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">X</text></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>'
  };
  function dokPotDeli(p) { return p ? p.split('/').filter(Boolean) : []; }
  async function risiDokumenti() {
    var box = $('dokList'); if (!box) return;
    // Pravice: pisanje (nalaganje/mape/brisanje) & prenos.
    var _w = sme('dokumenti', 'w');
    var _nm = $('dokNovaMapa'), _nb = $('dokNaloziBtn');
    if (_nm) _nm.style.display = _w ? '' : 'none';
    if (_nb) _nb.style.display = _w ? '' : 'none';
    box.innerHTML = NALAGANJE;
    var res;
    _dokFsOk = true; _dokZaklepOk = true;
    // Stranično (brez privzete meje 1000): čez leta se lahko nabere >1000 dokumentov, starejši ne smejo izginiti.
    try { res = await vseVrstice(function (a, b) { return sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at,mapa,ime,je_mapa,zaklenjeno').is('deleted_at', null).order('je_mapa', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(a, b); }); } catch (e) { res = { error: e }; }
    if (res && res.error && /zaklenjeno/i.test(res.error.message || '')) {
      // stolpec zaklenjeno še ne obstaja — poskusi brez njega
      _dokZaklepOk = false;
      try { res = await vseVrstice(function (a, b) { return sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at,mapa,ime,je_mapa').is('deleted_at', null).order('je_mapa', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(a, b); }); } catch (e) { res = { error: e }; }
    }
    if (res && res.error && /mapa|ime|je_mapa/i.test(res.error.message || '')) {
      _dokFsOk = false; _dokZaklepOk = false;
      try { res = await vseVrstice(function (a, b) { return sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at').is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).range(a, b); }); } catch (e) { res = { error: e }; }
    }
    // Rezerva: če stolpca deleted_at še ni (migracija 50 ni zagnana) → beri brez tega filtra.
    if (res && res.error && /deleted_at/i.test(res.error.message || '')) {
      _softDelDoc = false;
      try { res = await vseVrstice(function (a, b) { return sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at,mapa,ime,je_mapa,zaklenjeno').order('je_mapa', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(a, b); }); } catch (e) { res = { error: e }; }
      if (res && res.error) { _dokZaklepOk = false; try { res = await vseVrstice(function (a, b) { return sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at,mapa,ime,je_mapa').order('je_mapa', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(a, b); }); } catch (e) { res = { error: e }; } }
      if (res && res.error) { _dokFsOk = false; try { res = await vseVrstice(function (a, b) { return sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).range(a, b); }); } catch (e) { res = { error: e }; } }
    }
    if (res.error) {
      box.innerHTML = '<div class="msg bad show">Napaka pri nalaganju: ' + escape_(res.error.message || String(res.error)) +
        '<br><small>Če piše, da tabela ne obstaja, zaženi <b>19_dokumenti.sql</b>; za mape še <b>31_dokumenti_fs.sql</b>.</small></div>';
      return;
    }
    DOKUMENTI = (res.data || []).map(function (r) { if (r.mapa == null) r.mapa = ''; return r; });
    DOK_URL = {};
    var poti = DOKUMENTI.map(function (r) { return r.storage_path; }).filter(Boolean);
    if (poti.length) {
      try { var su = await sb.storage.from('dokumenti').createSignedUrls(poti, 3600); (su && su.data ? su.data : []).forEach(function (x) { if (x && x.path && x.signedUrl) DOK_URL[x.path] = x.signedUrl; }); } catch (e) {}
    }
    dokRisi();
  }
  var _DOK_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var _DOK_MORE = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  function dokRisi() {
    var box = $('dokList'); if (!box) return;
    var q = ($('dokIsci') && $('dokIsci').value || '').trim().toLowerCase();
    // nazaj / naprej / prilepi
    var _bk = $('dokBack'), _fw = $('dokFwd'), _ps = $('dokPaste');
    if (_bk) _bk.disabled = !(_dokHi > 0);
    if (_fw) _fw.disabled = !(_dokHi < _dokHist.length - 1);
    if (_ps) { var canP = !!_dokClip && sme('dokumenti', 'w'); _ps.hidden = !canP; if (canP) { var cr = (DOKUMENTI || []).filter(function (x) { return x.id === _dokClip.id; })[0]; _ps.textContent = (_dokClip.mode === 'cut' ? 'Prilepi (premakni) ' : 'Prilepi ') + (cr ? '„' + dokImeRow(cr) + '"' : ''); } }
    // pot (breadcrumb)
    var potEl = $('dokPot');
    if (potEl) {
      var deli = dokPotDeli(_dokPot), acc = '';
      var bc = '<button type="button" class="dok-crumb" data-pot="">Dokumenti</button>';
      deli.forEach(function (d) { acc = acc ? (acc + '/' + d) : d; bc += '<span class="dok-sep">›</span><button type="button" class="dok-crumb" data-pot="' + escape_(acc) + '">' + escape_(d) + '</button>'; });
      potEl.innerHTML = bc;
      potEl.querySelectorAll('.dok-crumb').forEach(function (b) { b.addEventListener('click', function () { dokPojdi(b.dataset.pot); }); });
    }
    var vsi = DOKUMENTI || [];
    var mape, datoteke;
    if (q) {
      var zad = vsi.filter(function (r) { return !r.je_mapa && dokImeRow(r).toLowerCase().indexOf(q) >= 0; });
      mape = []; datoteke = zad;
    } else {
      var vsebina = vsi.filter(function (r) { return (r.mapa || '') === _dokPot; });
      mape = vsebina.filter(function (r) { return r.je_mapa; }).sort(function (a, b) { return dokImeRow(a).localeCompare(dokImeRow(b), 'sl'); });
      datoteke = vsebina.filter(function (r) { return !r.je_mapa; });
    }
    var pod = $('dokPod'); if (pod) pod.textContent = (mape.length ? mape.length + ' map · ' : '') + datoteke.length + ' datotek';
    if (!mape.length && !datoteke.length) {
      box.innerHTML = '<div class="empty"><h3>' + (q ? 'Ni zadetkov' : 'Prazna mapa') + '</h3>' + (q ? '' : '<p>Naloži datoteke (PDF, Word, Excel, slike) ali ustvari novo mapo.</p>') + '</div>';
      return;
    }
    var _more = (sme('dokumenti', 'w') || sme('dokumenti', 'x') || sme('dokumenti', 'd')) ? '<button type="button" class="dok-more" title="Možnosti" aria-label="Možnosti">' + _DOK_MORE + '</button>' : '';
    function cutCls(r) { return (_dokClip && _dokClip.mode === 'cut' && _dokClip.id === r.id) ? ' dok-cut' : ''; }
    var html = '<div class="dok-grid">';
    mape.forEach(function (r) {
      var zakl = !!r.zaklenjeno;
      html += '<div class="dok-item dok-folder' + cutCls(r) + '" data-id="' + escape_(r.id) + '" data-mapa="' + escape_((r.mapa ? r.mapa + '/' : '') + dokImeRow(r)) + '">' +
        '<div class="dok-ic dok-ic-folder' + (zakl ? ' zakl' : '') + '">' + _DOK_IK.mapa + (zakl ? '<span class="dok-lock">' + _DOK_LOCK + '</span>' : '') + '</div>' +
        '<div class="dok-nm">' + escape_(dokImeRow(r)) + '</div>' + _more + '</div>';
    });
    datoteke.forEach(function (r) {
      var url = DOK_URL[r.storage_path] || '';
      var vr = dokVrsta(r);
      var thumb = (vr === 'slika' && url) ? '<div class="dok-ic dok-ic-img" style="background-image:url(' + escape_(url) + ')"></div>' : '<div class="dok-ic dok-ic-' + vr + '">' + (_DOK_IK[vr] || _DOK_IK.file) + '</div>';
      html += '<div class="dok-item dok-file' + cutCls(r) + '" data-id="' + escape_(r.id) + '"' + (url ? ' data-url="' + escape_(url) + '"' : '') + '>' +
        thumb +
        '<div class="dok-nm" title="' + escape_(dokImeRow(r)) + '">' + escape_(dokImeRow(r)) + '</div>' +
        '<div class="dok-sub">' + escape_(dokVelikost(r.velikost)) + '</div>' + _more + '</div>';
    });
    html += '</div>';
    box.innerHTML = html;
    box.querySelectorAll('.dok-folder').forEach(function (el) {
      el.addEventListener('click', function (e) { if (e.target.closest('.dok-more')) return; dokPojdi(el.dataset.mapa); });
    });
    box.querySelectorAll('.dok-file').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.dok-more')) return;
        var r = (DOKUMENTI || []).filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
        if (!r || !r.storage_path) return;
        if (dokVrsta(r) === 'slika') { var u = el.dataset.url; if (u) dokLightbox(u, dokImeRow(r)); return; }
        dokPrenesi(r);
      });
    });
    box.querySelectorAll('.dok-more').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); dokMenu(b, b.closest('.dok-item').getAttribute('data-id')); });
    });
  }
  function dokZapriMenu() { var m = document.querySelector('.dok-menu'); if (m && m.parentNode) m.parentNode.removeChild(m); document.removeEventListener('click', dokZapriMenu, true); window.removeEventListener('resize', dokZapriMenu); }
  function dokMenu(btn, id) {
    dokZapriMenu();
    var r = (DOKUMENTI || []).filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var jeMapa = !!r.je_mapa, w = sme('dokumenti', 'w'), x = sme('dokumenti', 'x'), d = sme('dokumenti', 'd');
    var items = [];
    if (!jeMapa && d) items.push(['prenesi', 'Prenesi']);
    if (w) items.push(['preime', 'Preimenuj']);
    if (w) items.push(['kopiraj', 'Kopiraj']);
    if (w) items.push(['izrezi', 'Izreži']);
    if (jeMapa && w) items.push(['zakleni', r.zaklenjeno ? 'Odkleni' : 'Zakleni']);
    if (x) items.push(['izbrisi', r.zaklenjeno ? 'Izbriši (zaklenjeno)' : 'Izbriši', 'danger']);
    if (!items.length) return;
    var m = document.createElement('div'); m.className = 'dok-menu';
    m.innerHTML = items.map(function (it) { return '<button type="button" class="dok-menu-i' + (it[2] ? ' danger' : '') + '" data-act="' + it[0] + '">' + escape_(it[1]) + '</button>'; }).join('');
    document.body.appendChild(m);
    var rc = btn.getBoundingClientRect();
    var mw = 190;
    m.style.top = (rc.bottom + window.scrollY + 4) + 'px';
    m.style.left = Math.max(8, Math.min(rc.right + window.scrollX - mw, window.scrollX + document.documentElement.clientWidth - mw - 8)) + 'px';
    m.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); var a = b.dataset.act; dokZapriMenu(); dokAkcija(a, r); }); });
    setTimeout(function () { document.addEventListener('click', dokZapriMenu, true); window.addEventListener('resize', dokZapriMenu); }, 0);
  }
  function dokAkcija(a, r) {
    if (a === 'prenesi') dokPrenesi(r);
    else if (a === 'preime') dokPreimenuj(r);
    else if (a === 'kopiraj') { _dokClip = { id: r.id, mode: 'copy' }; dokRisi(); toast('Kopirano: „' + dokImeRow(r) + '". Odpri ciljno mapo in klikni Prilepi.'); }
    else if (a === 'izrezi') { _dokClip = { id: r.id, mode: 'cut' }; dokRisi(); toast('Izrezano: „' + dokImeRow(r) + '". Odpri ciljno mapo in klikni Prilepi.'); }
    else if (a === 'zakleni') dokZakleni(r);
    else if (a === 'izbrisi') dokIzbrisi(r.id);
  }
  async function dokZakleni(r) {
    if (!sme('dokumenti', 'w')) { toast('Ni dovoljeno.'); return; }
    if (!_dokZaklepOk) { toast('Najprej zaženi 34_dokumenti_zaklep.sql v Supabase.'); return; }
    var nov = !r.zaklenjeno;
    var upd = await sb.from('documents').update({ zaklenjeno: nov }).eq('id', r.id);
    if (upd.error) { toast('Ni uspelo: ' + upd.error.message); return; }
    r.zaklenjeno = nov; dokRisi(); toast(nov ? 'Mapa zaklenjena — je ni mogoče izbrisati.' : 'Mapa odklenjena.');
  }
  function dokUnikatnoImeV(name, cilj, jeMapa) {
    function obst(nm) { return (DOKUMENTI || []).some(function (x) { return (x.mapa || '') === cilj && !!x.je_mapa === jeMapa && dokImeRow(x).toLowerCase() === nm.toLowerCase(); }); }
    if (!obst(name)) return name;
    var m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(name), baza = m[1], ext = m[2] || '', i = 2;
    while (obst(baza + ' (' + i + ')' + ext)) i++;
    return baza + ' (' + i + ')' + ext;
  }
  async function dokPreimenuj(r) {
    if (!sme('dokumenti', 'w')) { toast('Ni dovoljeno.'); return; }
    var staro = dokImeRow(r);
    var novo = await vnesiModal({ naslov: r.je_mapa ? 'Preimenuj mapo' : 'Preimenuj datoteko', sporocilo: 'Novo ime:', privzeto: staro, potrdi: 'Shrani', preklici: 'Prekliči' });
    if (novo == null) return; novo = String(novo).trim().replace(/[\/\\]/g, ' ').trim();
    if (!novo || novo === staro) return;
    var dvojnik = (DOKUMENTI || []).some(function (x) { return x.id !== r.id && (x.mapa || '') === (r.mapa || '') && !!x.je_mapa === !!r.je_mapa && dokImeRow(x).toLowerCase() === novo.toLowerCase(); });
    if (dvojnik) { toast((r.je_mapa ? 'Mapa' : 'Datoteka') + ' s tem imenom že obstaja.'); return; }
    if (r.je_mapa) {
      var stariPot = (r.mapa ? r.mapa + '/' : '') + staro, noviPot = (r.mapa ? r.mapa + '/' : '') + novo;
      var otroci = (DOKUMENTI || []).filter(function (x) { return x.id !== r.id && ((x.mapa || '') === stariPot || (x.mapa || '').indexOf(stariPot + '/') === 0); });
      var upd = await sb.from('documents').update({ ime: novo }).eq('id', r.id);
      if (upd.error) { toast('Ni uspelo: ' + upd.error.message); return; }
      r.ime = novo;
      for (var i = 0; i < otroci.length; i++) { var c = otroci[i]; var nova = noviPot + (c.mapa || '').slice(stariPot.length); var u = await sb.from('documents').update({ mapa: nova }).eq('id', c.id); if (!u.error) c.mapa = nova; }
      if (_dokPot === stariPot || _dokPot.indexOf(stariPot + '/') === 0) { _dokPot = noviPot + _dokPot.slice(stariPot.length); }
    } else {
      var upd2 = await sb.from('documents').update({ ime: novo }).eq('id', r.id);
      if (upd2.error) { toast('Ni uspelo: ' + upd2.error.message); return; }
      r.ime = novo;
    }
    dokRisi(); toast('Preimenovano.');
  }
  async function dokPrilepi() {
    if (!_dokClip) return;
    if (!sme('dokumenti', 'w')) { toast('Ni dovoljeno.'); return; }
    var r = (DOKUMENTI || []).filter(function (x) { return x.id === _dokClip.id; })[0];
    if (!r) { _dokClip = null; dokRisi(); return; }
    var cilj = _dokPot, mode = _dokClip.mode;
    if (r.je_mapa) { var potMape = (r.mapa ? r.mapa + '/' : '') + dokImeRow(r); if (cilj === potMape || cilj.indexOf(potMape + '/') === 0) { toast('Mape ni mogoče prilepiti vase.'); return; } }
    if (mode === 'cut') {
      if ((r.mapa || '') === cilj) { toast('Element je že v tej mapi.'); return; }
      await dokPremakni(r, cilj);
    } else { await dokKopirajV(r, cilj); }
    _dokClip = null; dokRisi();
  }
  async function dokPremakni(r, cilj) {
    var ime = dokImeRow(r), jeMapa = !!r.je_mapa;
    var novoIme = dokUnikatnoImeV(ime, cilj, jeMapa);
    if (jeMapa) {
      var stariPot = (r.mapa ? r.mapa + '/' : '') + ime, noviPot = (cilj ? cilj + '/' : '') + novoIme;
      var otroci = (DOKUMENTI || []).filter(function (x) { return x.id !== r.id && ((x.mapa || '') === stariPot || (x.mapa || '').indexOf(stariPot + '/') === 0); });
      var u = await sb.from('documents').update({ mapa: cilj, ime: novoIme }).eq('id', r.id);
      if (u.error) { toast('Ni uspelo: ' + u.error.message); return; }
      r.mapa = cilj; r.ime = novoIme;
      for (var i = 0; i < otroci.length; i++) { var c = otroci[i]; var nova = noviPot + (c.mapa || '').slice(stariPot.length); var uu = await sb.from('documents').update({ mapa: nova }).eq('id', c.id); if (!uu.error) c.mapa = nova; }
    } else {
      var u2 = await sb.from('documents').update({ mapa: cilj, ime: novoIme }).eq('id', r.id);
      if (u2.error) { toast('Ni uspelo: ' + u2.error.message); return; }
      r.mapa = cilj; r.ime = novoIme;
    }
    toast('Premaknjeno.');
  }
  async function dokKopirajV(r, cilj) {
    var jeMapa = !!r.je_mapa, ime = dokImeRow(r);
    var novoIme = dokUnikatnoImeV(ime, cilj, jeMapa);
    if (!jeMapa) { await dokKopirajDatoteko(r, cilj, novoIme); return; }
    var ins = await sb.from('documents').insert({ mapa: cilj, ime: novoIme, je_mapa: true, storage_path: '' }).select('id,mapa,ime,je_mapa,storage_path,created_at').single();
    if (ins.error) { toast('Ni uspelo: ' + ins.error.message); return; }
    DOKUMENTI.unshift(ins.data);
    var stariPot = (r.mapa ? r.mapa + '/' : '') + ime, noviPot = (cilj ? cilj + '/' : '') + novoIme;
    var neposredni = (DOKUMENTI || []).filter(function (x) { return x.id !== ins.data.id && (x.mapa || '') === stariPot; });
    for (var i = 0; i < neposredni.length; i++) { await dokKopirajV(neposredni[i], noviPot); }
    toast('Kopirano.');
  }
  async function dokKopirajDatoteko(r, cilj, novoIme) {
    try {
      var novaPot = dokStoragePot(cilj, novoIme || 'kopija');
      var cp = await sb.storage.from('dokumenti').copy(r.storage_path, novaPot);
      if (cp.error) throw cp.error;
      var ins = await sb.from('documents').insert({ mapa: cilj, ime: novoIme, storage_path: novaPot, mime: r.mime || '', velikost: r.velikost || null, je_mapa: false }).select('id,mapa,ime,storage_path,mime,velikost,je_mapa,created_at').single();
      if (ins.error) throw ins.error;
      try { var su = await sb.storage.from('dokumenti').createSignedUrl(novaPot, 3600); if (su && su.data) DOK_URL[novaPot] = su.data.signedUrl; } catch (e) {}
      DOKUMENTI.unshift(ins.data); toast('Kopirano.');
    } catch (e) { toast('Kopiranje ni uspelo: ' + (e && e.message ? e.message : e)); }
  }
  function dokZakljenjen(r) {
    // je r (ali katera koli njegova prednica-mapa) zaklenjen(a)?
    var zakl = {};
    (DOKUMENTI || []).forEach(function (f) { if (f.je_mapa && f.zaklenjeno) zakl[(f.mapa ? f.mapa + '/' : '') + dokImeRow(f)] = true; });
    if (r.je_mapa && r.zaklenjeno) return true;
    var mp = r.mapa || '';
    if (zakl[mp]) return true;
    var deli = mp.split('/').filter(Boolean), acc = '';
    for (var i = 0; i < deli.length; i++) { acc = acc ? acc + '/' + deli[i] : deli[i]; if (zakl[acc]) return true; }
    return false;
  }
  async function dokIzbrisi(id) {
    if (!sme('dokumenti', 'x')) { toast('Za to vlogo brisanje ni dovoljeno.'); return; }
    var r = (DOKUMENTI || []).filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    if (dokZakljenjen(r)) { toast(r.je_mapa && r.zaklenjeno ? 'Mapa je zaklenjena. Najprej jo odkleni.' : 'Element je v zaklenjeni mapi in ga ni mogoče izbrisati.'); return; }
    var jeMapa = !!r.je_mapa;
    var potMape = (r.mapa ? r.mapa + '/' : '') + dokImeRow(r);
    var otroci = jeMapa ? (DOKUMENTI || []).filter(function (x) { return x.id !== id && ((x.mapa || '') === potMape || (x.mapa || '').indexOf(potMape + '/') === 0); }) : [];
    var obnovljivo = _softDelDoc;
    var ok = await potrdiModal({ naslov: jeMapa ? 'Izbriši mapo' : 'Izbriši datoteko', sporocilo: jeMapa ? ('Izbrišem mapo „' + dokImeRow(r) + '"' + (otroci.length ? ' in vso vsebino (' + otroci.length + ' elementov)' : '') + '?' + (obnovljivo ? ' Shrani se v »Nedavno brisani« (30 dni).' : ' Tega ni mogoče razveljaviti.')) : ('Izbrišem „' + dokImeRow(r) + '"?' + (obnovljivo ? ' Shrani se v »Nedavno brisani« (30 dni).' : ' Tega ni mogoče razveljaviti.')), potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var vsi = [r].concat(otroci);
    var ids = vsi.map(function (x) { return x.id; });
    try {
      if (obnovljivo) {
        // Soft-delete (koš): datoteka v shrambi OSTANE (za obnovitev); samo skrijemo zapis.
        var upd = await sb.from('documents').update({ deleted_at: new Date().toISOString() }).in('id', ids);
        if (upd.error) throw upd.error;
      } else {
        // Rezerva, če migracija 50 (deleted_at) še ni zagnana → staro dokončno brisanje (tudi iz shrambe).
        var poti = vsi.map(function (x) { return x.storage_path; }).filter(Boolean);
        if (poti.length) { try { await sb.storage.from('dokumenti').remove(poti); } catch (e) {} }
        var del = await sb.from('documents').delete().in('id', ids);
        if (del.error) throw del.error;
      }
      DOKUMENTI = (DOKUMENTI || []).filter(function (x) { return ids.indexOf(x.id) < 0; });
      dokRisi();
      toast(obnovljivo ? 'Premaknjeno v »Nedavno brisani«' : 'Izbrisano');
    } catch (e) { toast('Napaka pri brisanju: ' + (e && e.message ? e.message : e)); }
  }
  // ── Koš dokumentov (Nedavno brisani — obnovljivi) ──
  async function dokKos() {
    var box = $('dokList'); if (!box) return;
    if (!sme('dokumenti', 'x')) { toast('Za to vlogo ni dovoljeno.'); return; }
    box.innerHTML = NALAGANJE;
    var mejnik = new Date(Date.now() - 30 * 864e5).toISOString();
    var r = await sb.from('documents').select('id,ime,mapa,storage_path,je_mapa,deleted_at')
      .not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false });
    var arr = (r && !r.error) ? (r.data || []) : [];
    var html = '<div class="cgrp-bar"><button type="button" class="cgrp-btn" id="kosNazajDok">← Nazaj na dokumente</button></div>' +
      '<h3 class="sec-h" style="margin:6px 0 10px">Nedavno brisano <span class="u-sub">(obnovljivo 30 dni)</span></h3>';
    if (r && r.error) html += '<div class="msg bad show">Napaka: ' + escape_(r.error.message) + '</div>';
    else if (!arr.length) html += '<div class="empty"><h3>Koš je prazen</h3><p>Zadnjih 30 dni ni brisanih dokumentov.</p></div>';
    else html += '<div class="cenik">' + arr.map(function (d) {
      var nm = d.ime || (d.storage_path ? String(d.storage_path).split('/').pop() : '—');
      return '<div class="cenik-row"><div class="cenik-nm">' + (d.je_mapa ? '📁 ' : '') + escape_(nm) + '</div>' +
        '<div class="cenik-meta">' + (d.mapa ? escape_(d.mapa) + ' · ' : '') + 'izbrisano ' + datumcas(d.deleted_at) + '</div>' +
        '<div class="cenik-cena"><button type="button" class="btn-mini cenik-restore" data-dobnovi="' + d.id + '">Obnovi</button> ' +
        '<button type="button" class="btn-mini" data-ddokoncno="' + d.id + '">Izbriši dokončno</button></div></div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    var nz = document.getElementById('kosNazajDok'); if (nz) nz.addEventListener('click', function () { risiDokumenti(); });
    box.querySelectorAll('[data-dobnovi]').forEach(function (bn) { bn.addEventListener('click', function () { dokObnovi(bn.dataset.dobnovi); }); });
    box.querySelectorAll('[data-ddokoncno]').forEach(function (bn) { bn.addEventListener('click', function () { dokIzbrisiDokoncno(bn.dataset.ddokoncno); }); });
  }
  async function dokObnovi(id) {
    var r = await sb.from('documents').update({ deleted_at: null }).eq('id', id);
    if (r.error) { toast('Napaka: ' + r.error.message); return; }
    toast('Obnovljeno'); dokKos();
  }
  async function dokIzbrisiDokoncno(id) {
    var ok = await potrdiModal({ naslov: 'Izbriši dokončno', sporocilo: 'Dokončno izbrišem to datoteko? Tega NI mogoče razveljaviti.', potrdi: 'Izbriši dokončno', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var rec = null;
    try { var g = await sb.from('documents').select('storage_path').eq('id', id).maybeSingle(); rec = g && g.data ? g.data : null; } catch (e) {}
    try {
      if (rec && rec.storage_path) { try { await sb.storage.from('dokumenti').remove([rec.storage_path]); } catch (e) {} }
      var del = await sb.from('documents').delete().eq('id', id); if (del.error) throw del.error;
      toast('Dokončno izbrisano'); dokKos();
    } catch (e) { toast('Napaka: ' + (e && e.message ? e.message : e)); }
  }
  // Prenos datoteke z ORIGINALNIM imenom (ne s poti s časovnim žigom).
  async function dokPrenesi(r) {
    if (!sme('dokumenti', 'd')) { toast('Za to vlogo prenos ni dovoljen.'); return; }
    var ime = dokImeRow(r);
    try {
      var s = await sb.storage.from('dokumenti').createSignedUrl(r.storage_path, 120, { download: ime });
      var url = (s && s.data && s.data.signedUrl) ? s.data.signedUrl : (DOK_URL[r.storage_path] || '');
      if (!url) { toast('Povezave ni bilo mogoče ustvariti.'); return; }
      var a = document.createElement('a'); a.href = url; a.download = ime; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 150);
    } catch (e) { var u = DOK_URL[r.storage_path]; if (u) window.open(u, '_blank', 'noopener'); }
  }
  async function dokNovaMapa() {
    if (!sme('dokumenti', 'w')) { toast('Za to vlogo urejanje ni dovoljeno.'); return; }
    if (!_dokFsOk) { toast('Najprej zaženi 31_dokumenti_fs.sql v Supabase.'); return; }
    var ime = await vnesiModal({ naslov: 'Nova mapa', sporocilo: 'Ime mape:', placeholder: 'npr. Računi 2026', potrdi: 'Ustvari', preklici: 'Prekliči' });
    if (ime == null) return; ime = String(ime).trim().replace(/[\/\\]/g, ' ').trim();
    if (!ime) return;
    var obst = (DOKUMENTI || []).some(function (x) { return x.je_mapa && (x.mapa || '') === _dokPot && dokImeRow(x).toLowerCase() === ime.toLowerCase(); });
    if (obst) { toast('Mapa s tem imenom že obstaja.'); return; }
    var ins = await sb.from('documents').insert({ mapa: _dokPot, ime: ime, je_mapa: true, storage_path: '' }).select('id,mapa,ime,je_mapa,storage_path,created_at').single();
    if (ins.error) { toast('Ni uspelo: ' + ins.error.message); return; }
    DOKUMENTI.unshift(ins.data); dokRisi();
  }
  var DOK_DOVOLJENE = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
  function dokTipOk(f) {
    var e = (/\.([a-z0-9]+)$/i.exec(f.name) || [])[1]; e = (e || '').toLowerCase();
    return DOK_DOVOLJENE.indexOf(e) >= 0 || /^image\//.test(f.type || '');
  }
  function dokDvojnik(ime) { return (DOKUMENTI || []).filter(function (x) { return !x.je_mapa && (x.mapa || '') === _dokPot && dokImeRow(x).toLowerCase() === (ime || '').toLowerCase(); })[0]; }
  function dokUnikatnoIme(name) {
    if (!dokDvojnik(name)) return name;
    var m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(name), baza = m[1], ext = m[2] || '';
    var i = 2; while (dokDvojnik(baza + ' (' + i + ')' + ext)) i++;
    return baza + ' (' + i + ')' + ext;
  }
  function dokKonfliktModal(ime) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Datoteka že obstaja</h4><p>V tej mapi že obstaja »' + escape_(ime) + '«. Kaj želiš narediti?</p><div class="sc-modal-acts" style="flex-wrap:wrap;justify-content:flex-end"><button type="button" class="sc-modal-btn ghost" data-x>Prekliči</button><button type="button" class="sc-modal-btn ghost" data-novo>Ustvari novo</button><button type="button" class="sc-modal-btn primary" data-pos>Posodobi</button></div></div>';
      document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(v) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') zapri(null); }
      back.querySelector('[data-x]').addEventListener('click', function () { zapri(null); });
      back.querySelector('[data-novo]').addEventListener('click', function () { zapri('novo'); });
      back.querySelector('[data-pos]').addEventListener('click', function () { zapri('posodobi'); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(null); });
      document.addEventListener('keydown', onKey);
    });
  }
  // Stisni sliko (JPEG, max 1600px, kakovost 0.7) — varčuje prostor. Vrne {blob,ime} ali null (brez stiskanja).
  function dokStisniSliko(file) {
    return new Promise(function (resolve) {
      var jeSlika = /^image\//.test(file.type || '') || /\.(jpe?g|png|heic|heif|webp|gif|bmp)$/i.test(file.name || '');
      if (!jeSlika) { resolve(null); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var maxW = 1600, scale = img.width > maxW ? maxW / img.width : 1;
          var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
          cv.toBlob(function (blob) {
            URL.revokeObjectURL(url);
            if (!blob || (file.size && blob.size >= file.size && /\.jpe?g$/i.test(file.name || ''))) { resolve(null); return; }
            resolve({ blob: blob, ime: (file.name || 'slika').replace(/\.[a-z0-9]+$/i, '') + '.jpg' });
          }, 'image/jpeg', 0.7);
        } catch (e) { URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  // Seznam vseh map (za izbiro cilja skeniranja).
  function dokMapeSeznam() {
    var out = [{ pot: '', label: 'Dokumenti (koren)' }];
    (DOKUMENTI || []).filter(function (x) { return x.je_mapa; }).forEach(function (f) { var pot = (f.mapa ? f.mapa + '/' : '') + dokImeRow(f); out.push({ pot: pot, label: pot.replace(/\//g, ' › ') }); });
    out.sort(function (a, b) { return a.label.localeCompare(b.label, 'sl'); });
    return out;
  }
  // Sestavi PDF iz zajetih slik (vsaka svoja stran, A4, centrirano).
  async function dokSlikeVPdf(urls) {
    await zagotoviPdf();
    var doc = new PDFDoc(), M = 28, W = doc.W, H = doc.H;
    for (var i = 0; i < urls.length; i++) {
      var j = await PDFDoc.imageToJpeg(urls[i], 1600);
      var availW = W - 2 * M, availH = H - 2 * M;
      var sc = Math.min(availW / j.w, availH / j.h); if (sc > 1) sc = 1;
      var dw = j.w * sc, dh = j.h * sc, x = (W - dw) / 2, y = (H - dh) / 2;
      doc.addPage(); doc.image(j.bytes, x, y, dw, dh, j.w, j.h);
    }
    return doc.build();
  }
  // Shrani poljuben Blob kot datoteko v izbrano mapo.
  async function dokShraniBlob(blob, ime, cilj, mime) {
    var koncno = ime;
    if ((DOKUMENTI || []).some(function (x) { return !x.je_mapa && (x.mapa || '') === cilj && dokImeRow(x).toLowerCase() === koncno.toLowerCase(); })) koncno = dokUnikatnoImeV(koncno, cilj, false);
    var pot = dokStoragePot(cilj, koncno);
    var up = await sb.storage.from('dokumenti').upload(pot, blob, { contentType: mime || 'application/octet-stream', cacheControl: '3600', upsert: false });
    if (up.error) throw up.error;
    try { var su = await sb.storage.from('dokumenti').createSignedUrl(pot, 3600); if (su && su.data) DOK_URL[pot] = su.data.signedUrl; } catch (e) {}
    var ins = await sb.from('documents').insert({ mapa: cilj, ime: koncno, storage_path: pot, mime: mime || '', velikost: blob.size, je_mapa: false }).select('id,mapa,ime,storage_path,mime,velikost,je_mapa,created_at').single();
    if (ins.error) throw ins.error;
    DOKUMENTI.unshift(ins.data);
    return ins.data;
  }
  var _skenSlike = [];
  function dokSkenirajOdpri() {
    if (!sme('dokumenti', 'w')) { toast('Za to vlogo nalaganje ni dovoljeno.'); return; }
    if (!_dokFsOk) { toast('Najprej zaženi 31_dokumenti_fs.sql v Supabase.'); return; }
    zagotoviPdf().catch(function () {});   // naloži PDF modul vnaprej, medtem ko uporabnik slika
    _skenSlike = [];
    var mape = dokMapeSeznam(), privzeta = _dokPot || '', danes = new Date().toISOString().slice(0, 10);
    var kam = $('dokKamera'), lib = $('dokKameraLib');
    var back = document.createElement('div'); back.className = 'sc-modal-back sken-back';
    back.innerHTML = '<div class="sc-modal sken-modal" role="dialog" aria-modal="true">' +
      '<h4>Skeniraj račun</h4>' +
      '<p class="u-sub" style="margin:0 0 12px">Slikaj račun s kamero ali naloži sliko iz datotek. Dodaš lahko več strani — shrani se kot en PDF.</p>' +
      '<div class="sken-strani" id="skenStrani"></div>' +
      '<div class="sken-add-row">' +
      '<button type="button" class="btn btn-narrow btn-alt sken-add" id="skenDodaj"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-3px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Slikaj stran</button>' +
      '<button type="button" class="btn btn-narrow btn-alt sken-add" id="skenIzDat"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-3px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Iz datotek</button>' +
      '</div>' +
      '<div class="sken-polja">' +
      '<label class="sken-f"><span>Ime datoteke</span><input type="text" id="skenIme" value="Račun ' + escape_(danes) + '"></label>' +
      '<label class="sken-f"><span>Shrani v mapo</span><select id="skenMapa">' + mape.map(function (m) { return '<option value="' + escape_(m.pot) + '"' + (m.pot === privzeta ? ' selected' : '') + '>' + escape_(m.label) + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" id="skenPreklici">Prekliči</button><button type="button" class="sc-modal-btn primary" id="skenShrani" disabled>Shrani PDF</button></div>' +
      '</div>';
    document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); if (kam) kam.onchange = null; if (lib) lib.onchange = null; setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); _skenSlike = []; }
    function dodajDatoteke(files) { Array.prototype.slice.call(files || []).forEach(function (f) { if (!/^image\//.test(f.type || '') && !/\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name || '')) return; var rd = new FileReader(); rd.onload = function () { _skenSlike.push(rd.result); osvezi(); }; rd.readAsDataURL(f); }); }
    function osvezi() {
      var wrap = back.querySelector('#skenStrani');
      wrap.innerHTML = _skenSlike.map(function (s, i) { return '<div class="sken-th"><img src="' + s + '" alt="stran ' + (i + 1) + '"><button type="button" class="sken-th-x" data-i="' + i + '" aria-label="Odstrani">×</button><span class="sken-th-n">' + (i + 1) + '</span></div>'; }).join('') || '<div class="sken-prazno">Ni zajetih strani.</div>';
      wrap.querySelectorAll('.sken-th-x').forEach(function (b) { b.addEventListener('click', function () { _skenSlike.splice(+b.dataset.i, 1); osvezi(); }); });
      back.querySelector('#skenShrani').disabled = !_skenSlike.length;
    }
    osvezi();
    back.querySelector('#skenDodaj').addEventListener('click', function () { if (kam) { kam.value = ''; kam.click(); } });
    back.querySelector('#skenIzDat').addEventListener('click', function () { if (lib) { lib.value = ''; lib.click(); } });
    if (kam) kam.onchange = function () { dodajDatoteke(this.files); this.value = ''; };
    if (lib) lib.onchange = function () { dodajDatoteke(this.files); this.value = ''; };
    back.querySelector('#skenPreklici').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('#skenShrani').addEventListener('click', async function () {
      var btn = this; if (!_skenSlike.length) return;
      var ime = (back.querySelector('#skenIme').value || 'Račun').trim().replace(/[\/\\]/g, ' ').trim() || 'Račun';
      if (!/\.pdf$/i.test(ime)) ime += '.pdf';
      var cilj = back.querySelector('#skenMapa').value || '';
      btn.disabled = true; btn.textContent = 'Shranjujem …';
      try {
        var bytes = await dokSlikeVPdf(_skenSlike);
        await dokShraniBlob(new Blob([bytes], { type: 'application/pdf' }), ime, cilj, 'application/pdf');
        zapri(); dokPojdi(cilj); toast('Račun shranjen kot PDF.');
      } catch (e) { btn.disabled = false; btn.textContent = 'Shrani PDF'; toast('Napaka pri shranjevanju: ' + (e && e.message ? e.message : e)); }
    });
  }
  async function dokNalozi(files) {
    if (!files || !files.length) return;
    if (!sme('dokumenti', 'w')) { toast('Za to vlogo nalaganje ni dovoljeno.'); return; }
    if (!_dokFsOk) { toast('Za nalaganje najprej zaženi 31_dokumenti_fs.sql v Supabase.'); return; }
    files = Array.prototype.slice.call(files);
    var zavrnjene = files.filter(function (f) { return !dokTipOk(f); });
    files = files.filter(dokTipOk);
    if (zavrnjene.length) toast('Nezdružljiv tip datoteke: ' + zavrnjene.map(function (f) { return f.name; }).join(', ') + '. Dovoljeno: PDF, Word, Excel, CSV, slike.');
    if (!files.length) return;
    var pod = $('dokPod'); var n = 0, napak = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (pod) pod.textContent = 'Pripravljam ' + (i + 1) + '/' + files.length + ' …';
      // stiskanje slik (varčuje prostor); PDF/Word/Excel ostanejo nespremenjeni
      var stis = await dokStisniSliko(f);
      var upBlob = stis ? stis.blob : f;
      var upIme = stis ? stis.ime : f.name;
      var upMime = stis ? 'image/jpeg' : (f.type || 'application/octet-stream');
      var upSize = stis ? stis.blob.size : f.size;
      var ime = upIme, posodobi = null;
      var obst = dokDvojnik(upIme);
      if (obst) {
        var izbira = await dokKonfliktModal(upIme);
        if (izbira == null) continue;
        if (izbira === 'posodobi') posodobi = obst;
        else ime = dokUnikatnoIme(upIme);
      }
      if (pod) pod.textContent = 'Nalagam ' + (i + 1) + '/' + files.length + ' …';
      try {
        var pot = dokStoragePot(_dokPot, ime);
        var up = await sb.storage.from('dokumenti').upload(pot, upBlob, { contentType: upMime, cacheControl: '3600', upsert: false });
        if (up.error) throw up.error;
        try { var su = await sb.storage.from('dokumenti').createSignedUrl(pot, 3600); if (su && su.data) DOK_URL[pot] = su.data.signedUrl; } catch (e) {}
        if (posodobi) {
          var stara = posodobi.storage_path;
          var upd = await sb.from('documents').update({ storage_path: pot, mime: upMime, velikost: upSize, created_at: new Date().toISOString() }).eq('id', posodobi.id).select('id,mapa,ime,storage_path,mime,velikost,je_mapa,created_at').single();
          if (upd.error) throw upd.error;
          if (stara) { try { await sb.storage.from('dokumenti').remove([stara]); } catch (e) {} delete DOK_URL[stara]; }
          var ix = DOKUMENTI.findIndex(function (x) { return x.id === posodobi.id; }); if (ix >= 0) DOKUMENTI[ix] = upd.data; else DOKUMENTI.unshift(upd.data);
        } else {
          var ins = await sb.from('documents').insert({ mapa: _dokPot, ime: ime, storage_path: pot, mime: upMime, velikost: upSize, je_mapa: false }).select('id,mapa,ime,storage_path,mime,velikost,je_mapa,created_at').single();
          if (ins.error) throw ins.error;
          DOKUMENTI.unshift(ins.data);
        }
        n++;
      } catch (e) { napak++; }
    }
    dokRisi();
    if (n || napak) toast((n ? 'Naloženih ' + n + ' datotek' : 'Nič naloženo') + (napak ? ' · ' + napak + ' neuspešnih' : '') + '.');
  }
  { var _di = $('dokIsci'); if (_di) _di.addEventListener('input', function () { dokRisi(); }); }
  { var _nm = $('dokNovaMapa'); if (_nm) _nm.addEventListener('click', dokNovaMapa); }
  { var _nb = $('dokNaloziBtn'), _fi = $('dokFile'); if (_nb && _fi) { _nb.addEventListener('click', function () { _fi.click(); }); _fi.addEventListener('change', function () { dokNalozi(this.files); this.value = ''; }); } }
  { var _bk = $('dokBack'); if (_bk) _bk.addEventListener('click', dokNazaj); }
  { var _fw = $('dokFwd'); if (_fw) _fw.addEventListener('click', dokNaprej); }
  { var _pp = $('dokPaste'); if (_pp) _pp.addEventListener('click', dokPrilepi); }
  { var _sk = $('dokSkenirajBtn'); if (_sk) _sk.addEventListener('click', dokSkenirajOdpri); }
  { var _dk = $('dokKosBtn'); if (_dk) _dk.addEventListener('click', dokKos); }
  { var _sd = $('sec-dokumenti'); if (_sd) {
    _sd.addEventListener('dragover', function (e) { e.preventDefault(); var h = $('dokDropHint'); if (h) h.hidden = false; });
    _sd.addEventListener('dragleave', function (e) { if (e.target === _sd) { var h = $('dokDropHint'); if (h) h.hidden = true; } });
    _sd.addEventListener('drop', function (e) { e.preventDefault(); var h = $('dokDropHint'); if (h) h.hidden = true; if (e.dataTransfer && e.dataTransfer.files) dokNalozi(e.dataTransfer.files); });
  } }

  /* ══════════ MOJ RAČUN ══════════ */
  /* ── Moj profil: prikaz avatarja + polj ── */
  // Slika je ozadje kroga; brskalnik je začel nalagati šele, ko se je Moj račun prikazal
  // (skritih ozadij ne nalaga) — krog je bil za trenutek prazen. Zato jo naložimo in
  // dekodiramo že ob prijavi; referenca ostane, da je brskalnik ne zavrže.
  var _avatarSlika = null;
  function prednaloziAvatar(url) {
    if (!url) return;
    try { var im = new Image(); im.decoding = 'async'; im.src = url; if (im.decode) im.decode().catch(function () {}); _avatarSlika = im; } catch (e) {}
  }
  function narisiProfAvatar() {
    var box = $('profAvatar'), del = $('profAvDel');
    if (!box) return;
    var url = MOJPROFIL && MOJPROFIL.avatar_url;
    if (url) {
      box.style.backgroundImage = 'url(' + encodeURI(url).replace(/"/g, '%22') + ')';
      box.classList.add('has-img'); box.classList.remove('av-sc');
      var ini = $('profAvInit'); if (ini) ini.style.display = 'none';
      if (del) del.style.display = '';
    } else {
      box.style.backgroundImage = '';
      box.classList.remove('has-img'); box.classList.add('av-sc');
      var ini2 = $('profAvInit'); if (ini2) { ini2.style.display = ''; ini2.innerHTML = scMarkHtml(); }
      if (del) del.style.display = 'none';
    }
  }
  function napolniProfil() {
    var mi = $('mojeIme'); if (mi) mi.value = (JAZIME && JAZIME.indexOf('@') < 0) ? JAZIME : '';
    var t = $('mojTel'); if (t) t.value = (MOJPROFIL && MOJPROFIL.phone) || '';
    var k = $('mojKontaktMail'); if (k) k.value = (MOJPROFIL && MOJPROFIL.contact_email) || '';
    narisiProfAvatar();
  }

  { const _if = $('imeForm'); if (_if) _if.addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('imeMsg'), btn = $('imeBtn');
    const ime = $('mojeIme').value.trim();
    const tel = ($('mojTel') ? $('mojTel').value.trim() : '');
    const kmail = ($('mojKontaktMail') ? $('mojKontaktMail').value.trim() : '');
    if (!ime) { m.className = 'msg bad show'; m.textContent = 'Vpiši prikazano ime.'; return; }
    if (kmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(kmail)) { m.className = 'msg bad show'; m.textContent = 'Kontaktni e-naslov ni veljaven.'; return; }
    btn.disabled = true; btn.textContent = 'Shranjujem …';
    const { error } = await sb.from('profiles').update({ full_name: ime, phone: tel || null, contact_email: kmail || null }).eq('id', JAZ);
    btn.disabled = false; btn.textContent = 'Shrani profil';
    if (error) { m.className = 'msg bad show'; m.textContent = 'Napaka: ' + error.message; return; }
    JAZIME = ime;
    MOJPROFIL.full_name = ime; MOJPROFIL.phone = tel || null; MOJPROFIL.contact_email = kmail || null;
    nastaviWho(ime);
    zapomniProfil({ email: JAZMAIL, name: ime, avatar: MOJPROFIL.avatar_url || '', uid: JAZ });
    if ($('domovNaslov') && !$('sec-domov').classList.contains('hidden')) $('domovNaslov').textContent = OSEBJE ? ('Pozdravljen/a, ' + prvoIme()) : $('domovNaslov').textContent;
    m.className = 'msg show'; m.textContent = 'Profil shranjen.';
  }); }

  /* ── Avatar: naloži / odstrani ── */
  { const _ab = $('profAvBtn'); if (_ab) _ab.addEventListener('click', function () { if ($('profAvFile')) $('profAvFile').click(); }); }
  { const _af = $('profAvFile'); if (_af) _af.addEventListener('change', async function () {
    var m = $('imeMsg');
    var f = this.files && this.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { m.className = 'msg bad show'; m.textContent = 'Izberi slikovno datoteko.'; this.value = ''; return; }
    if (f.size > 5 * 1024 * 1024) { m.className = 'msg bad show'; m.textContent = 'Slika je prevelika (največ 5 MB).'; this.value = ''; return; }
    m.className = 'msg show'; m.textContent = 'Nalagam sliko …';
    try {
      var blob = await pomanjsajSliko(f, 512).catch(function () { return f; });
      var ct = blob.type || 'image/jpeg';
      var ext = (ct === 'image/png') ? 'png' : 'jpg';
      var pot = JAZ + '/avatar.' + ext;
      var up = await sb.storage.from('avatars').upload(pot, blob, { upsert: true, contentType: ct, cacheControl: '3600' });
      if (up.error) throw up.error;
      var pub = sb.storage.from('avatars').getPublicUrl(pot);
      var url = (pub && pub.data && pub.data.publicUrl) + '?v=' + Date.now();
      var upd = await sb.from('profiles').update({ avatar_url: url }).eq('id', JAZ);
      if (upd.error) throw upd.error;
      MOJPROFIL.avatar_url = url;
      prednaloziAvatar(url);
      narisiProfAvatar();
      zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: url, uid: JAZ });
      m.className = 'msg show'; m.textContent = 'Slika shranjena.';
    } catch (err) {
      m.className = 'msg bad show'; m.textContent = 'Nalaganje ni uspelo: ' + (err && err.message ? err.message : err);
    }
    this.value = '';
  }); }
  { const _ad = $('profAvDel'); if (_ad) _ad.addEventListener('click', async function () {
    var m = $('imeMsg');
    m.className = 'msg show'; m.textContent = 'Odstranjujem …';
    try {
      try { await sb.storage.from('avatars').remove([JAZ + '/avatar.jpg', JAZ + '/avatar.png']); } catch (e) {}
      var upd = await sb.from('profiles').update({ avatar_url: null }).eq('id', JAZ);
      if (upd.error) throw upd.error;
      MOJPROFIL.avatar_url = null;
      narisiProfAvatar();
      zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: '', uid: JAZ });
      m.className = 'msg show'; m.textContent = 'Slika odstranjena.';
    } catch (err) {
      m.className = 'msg bad show'; m.textContent = 'Ni uspelo: ' + (err && err.message ? err.message : err);
    }
  }); }

  /* Pomanjša in stisne sliko v kvadrat (za manjše datoteke in hitrejši prikaz). */
  function pomanjsajSliko(file, rob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var s = Math.min(img.width, img.height);
          var sx = (img.width - s) / 2, sy = (img.height - s) / 2;
          var c = document.createElement('canvas');
          c.width = c.height = rob;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, sx, sy, s, s, 0, 0, rob, rob);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error('canvas')); }, 'image/jpeg', 0.85);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('slika')); };
      img.src = url;
    });
  }

  $('changePwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('pwMsg'),
      btn = $('chPwBtn');
    const cur = $('curPw').value,
      p1 = $('chPw1').value,
      p2 = $('chPw2').value;
    if (p1 !== p2) {
      m.className = 'msg bad show';
      m.textContent = 'Novi gesli se ne ujemata.';
      return;
    }
    if (p1 === cur) {
      m.className = 'msg bad show';
      m.textContent = 'Novo geslo mora biti drugačno od starega.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Shranjujem …';
    const {
      data: {
        user
      }
    } = await sb.auth.getUser();
    const check = await sb.auth.signInWithPassword({
      email: user.email,
      password: cur
    });
    if (check.error) {
      btn.disabled = false;
      btn.textContent = 'Shrani novo geslo';
      m.className = 'msg bad show';
      m.textContent = 'Trenutno geslo ni pravilno.';
      return;
    }
    const {
      error
    } = await sb.auth.updateUser({
      password: p1
    });
    btn.disabled = false;
    btn.textContent = 'Shrani novo geslo';
    if (error) {
      m.className = 'msg bad show';
      var em = (error.message || '') + '';
      m.textContent = /same.*password|different/i.test(em) ? 'Novo geslo mora biti drugačno od starega.'
        : /weak|short|at least|length|characters/i.test(em) ? ('Geslo ni sprejeto: ' + em + ' (poskusi daljše/močnejše geslo).')
        : /reauth/i.test(em) ? 'Za spremembo gesla je potrebna ponovna potrditev. Odjavi se in znova prijavi, nato poskusi.'
        : ('Ni uspelo: ' + em);
      return;
    }
    ['curPw', 'chPw1', 'chPw2'].forEach(id => { $(id).value = ''; });
    m.className = 'msg show';
    m.textContent = 'Geslo je spremenjeno.';
  });

  /* ══════════ UPORABNIKI (osebje) ══════════ */
  function uMsg(txt, slabo) {
    const m = $('usersMsg');
    m.className = 'msg ' + (slabo ? 'bad show' : 'show');
    m.innerHTML = txt;
  }
  async function klic(telo) {
    const {
      data,
      error
    } = await sb.functions.invoke('uporabniki', {
      body: telo
    });
    if (!error) return data;
    try {
      const r = error.context;
      if (r && typeof r.json === 'function') {
        const j = await r.json();
        if (j && j.napaka) return {
          napaka: j.napaka
        };
        return {
          napaka: 'Strežnik je vrnil ' + (r.status || '?') + ': ' + JSON.stringify(j).slice(0, 140)
        };
      }
      if (r && r.status) return {
        napaka: 'Strežnik je vrnil kodo ' + r.status + '.'
      };
    } catch (e) {}
    return {
      napaka: 'Klic ni uspel (' + (error.name || 'napaka') + '): ' + (error.message || 'brez podrobnosti')
    };
  }
  async function loadUsers() {
    pokaziNalaganje($('usersList'));
    if (!$('nuOrg').options.length) {
      $('nuOrg').innerHTML = '<option value="">— osebje SmartClean —</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    }
    const [rLjudje, {
      data: clanstva
    }] = await Promise.all([sb.from('profiles').select('id,email,full_name,is_staff,super_admin,zaposleni,active,last_login,last_seen,web_dostop,app_pin').order('email'), sb.from('memberships').select('user_id,org_id')]);
    let ljudje = rLjudje.data;
    if (rLjudje.error) { /* super_admin/zaposleni/app_pin ali last_seen še ni — beri brez njih */
      const fb = await sb.from('profiles').select('id,email,full_name,is_staff,active,last_login').order('email');
      if (fb.error) { const fb2 = await sb.from('profiles').select('id,email,full_name,is_staff,active').order('email'); ljudje = fb2.data; }
      else ljudje = fb.data;
    }
    if (!ljudje) {   // vsi poskusi branja niso uspeli → napaka, ne prazno
      if (!$('usersList').dataset.loaded) {
        $('usersList').innerHTML = '<div class="empty"><h3>Nalaganje ni uspelo</h3><p>Seznama uporabnikov trenutno ni bilo mogoče naložiti.<br>Preveri povezavo in poskusi znova.</p><button type="button" class="btn ghost" data-act="users-ponovi" style="margin-top:14px">Poskusi znova</button></div>';
        var _up = $('usersList').querySelector('[data-act="users-ponovi"]');
        if (_up) _up.addEventListener('click', function () { loadUsers(); });
      }
      return;
    }
    const clanPo = {};
    (clanstva || []).forEach(c => {
      clanPo[c.user_id] = ORGIME[c.org_id];
    });
    const jeLastnik = JE_LASTNIK();
    const mr = mojRang();
    const jeSuperLastnik = function (u) { return (u.email || '').trim().toLowerCase() === 'filip@eflitte.si'; };
    // »super« (Super admin) je samo lastnik — ni ga mogoče dodeliti; dodeljive so admin in nižje.
    const VLOGE = [['admin', roleIme('admin'), 3], ['osebje', roleIme('osebje'), 2], ['zaposleni', roleIme('zaposleni'), 1], ['stranka', roleIme('stranka'), 0]];
    $('usersList').innerHTML = '<div class="rows u-mreza">' + (ljudje || []).map(u => {
      const jaz = u.id === JAZ;
      const jeLastnikU = jeSuperLastnik(u);
      const vlogaVal = jeLastnikU ? 'super' : u.super_admin ? 'admin' : u.is_staff ? 'osebje' : u.zaposleni ? 'zaposleni' : 'stranka';
      const ur = vlogaRang(vlogaVal);
      const lahkoUredi = !jaz && !jeLastnikU && mr > ur;   // nadrejeni ureja podrejene; lastnika nihče
      const naSpletu = jaz || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 120000);
      const webOn = u.web_dostop !== false;   // privzeto vključen
      const pinSet = (u.app_pin !== null && u.app_pin !== void 0 && String(u.app_pin) !== '');   // ali je PIN nastavljen
      const roleOpts = VLOGE.filter(r => r[2] < mr).sort((a, b) => b[2] - a[2]).map(r => `<option value="${r[0]}"${vlogaVal === r[0] ? ' selected' : ''}>${r[1]}</option>`).join('');
      // Okvirček (Seznam/Mreža po nastavitvi Pogled); klik odpre okno z vlogo, podatki in dejanji.
      const znacke = (naSpletu ? '<span class="pill pill-on"><span class="dot-on"></span>na spletu</span>' : '') +
        (jeLastnikU ? '<span class="pill pill-super">' + escape_(roleIme('super')) + '</span>' : '') +
        ((!jeLastnikU && u.super_admin) ? '<span class="pill pill-super">' + escape_(roleIme('admin')) + '</span>' : '') +
        ((!u.super_admin && !u.is_staff && u.zaposleni) ? '<span class="pill">' + escape_(roleIme('zaposleni')) + '</span>' : '') +
        (jaz ? '<span class="pill u-vi">vi</span>' : '') +
        (u.active ? '' : '<span class="pill">izklopljen</span>');
      const ime = u.full_name || u.email || '—';
      const prijava = u.last_login ? datumcas(u.last_login) : '';
      return `<div class="lcell${u.active ? '' : ' u-off'}"><button class="row has-tag" type="button" data-uid="${u.id}" aria-haspopup="dialog">
      <span><span class="row-name"><span class="row-nm">${escape_(ime)}</span></span><br><span class="row-legal">${escape_(u.email || '—')}</span>${znacke ? '<span class="u-znacke">' + znacke + '</span>' : ''}</span>
      <span class="row-pct"></span><span class="num u-prijava" title="Zadnja prijava">${prijava ? escape_(prijava.split(',')[0]) : '—'}</span><span class="chev" aria-hidden="true">›</span></button>
      <div class="arts u-det">
        ${lahkoUredi ? `<div class="u-role-wrap">
          <select class="u-role" data-role="${u.id}" data-cur="${vlogaVal}" data-ime="${escape_(u.full_name || '')}" aria-label="Vloga">${roleOpts}</select>
          ${vlogaVal === 'stranka' ? `<select class="u-org" data-org="${u.id}" aria-label="Podjetje">
             <option value="">— izberi podjetje —</option>
             ${ORGSEZNAM.map(o => `<option value="${o.id}"${clanPo[u.id] === o.name ? ' selected' : ''}>${escape_(o.name)}</option>`).join('')}
           </select>` : ''}
        </div>` : ''}
        <dl class="okno-dl">
          <dt>Vloga</dt><dd>${escape_(roleIme(vlogaVal))}${vlogaVal === 'stranka' && clanPo[u.id] ? ' · ' + escape_(clanPo[u.id]) : ''}</dd>
          <dt>E-pošta</dt><dd>${escape_(u.email || '—')}</dd>
          <dt>Zadnja prijava</dt><dd>${prijava ? escape_(prijava) : '<span class="u-sub">še nikoli</span>'}</dd>
        </dl>
        <div class="u-acts">
        ${(jaz || lahkoUredi) ? `<button data-act="ime" data-id="${u.id}" data-ime="${escape_(u.full_name || '')}">preimenuj</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button class="u-web${webOn ? ' on' : ''}" data-act="web" data-id="${u.id}" data-v="${webOn ? 0 : 1}" title="Dovoljenje za prijavo v aplikacijo / spletni pogled (izbira oseb)">Dostop app: ${webOn ? 'da' : 'ne'}</button>` : ''}
        ${lahkoUredi ? `<button data-act="active" data-id="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? 'izklopi' : 'vklopi'}</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button data-act="pw" data-id="${u.id}">novo geslo</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button class="u-pin${pinSet ? ' on' : ''}" data-act="pin" data-id="${u.id}" data-ime="${escape_(u.full_name || '')}" title="${pinSet ? 'PIN je nastavljen — klikni za spremembo ali izbris' : '4-mestni PIN za prijavo v aplikaciji'}">${pinSet ? 'PIN ✓' : 'PIN za app'}</button>` : ''}
        ${(jeLastnik && !jaz) ? `<button class="danger" data-act="del" data-id="${u.id}" data-m="${escape_(u.email || '')}">izbriši</button>` : ''}
        </div>
      </div></div>`;
    }).join('') + '</div>';
    if (!(ljudje || []).length) $('usersList').innerHTML = '<p class="u-sub">Ni uporabnikov.</p>';
    $('usersList').dataset.loaded = '1';
    document.querySelectorAll('#usersList select[data-role]').forEach(sel => {
      sel.addEventListener('change', () => spremeniVlogo(sel));
    });
    document.querySelectorAll('#usersList select[data-org]').forEach(sel => {
      sel.addEventListener('change', () => nastaviStranko(sel.dataset.org, sel.value));
    });
    document.querySelectorAll('#usersList button[data-act]').forEach(b => {
      b.addEventListener('click', () => dejanje(b));
    });
    document.querySelectorAll('#usersList .u-mreza .row[data-uid]').forEach(b => b.addEventListener('click', () => uporabnikOdpri(b)));
    oknoPoIzrisu();   // po dejanju (vloga, PIN, izklop …) okno pokaže sveže stanje ali se zapre
    // osveži prisotnost vsakih 30 s, dokler je seznam viden — a ne med odprtim oknom
    // (osvežitev bi zaprla izbirnik vloge sredi urejanja).
    if (loadUsers._t) { clearTimeout(loadUsers._t); loadUsers._t = null; }
    loadUsers._t = setTimeout(function ponovi() {
      const el = $('usersList');
      if (!el || el.offsetParent === null) return;
      if (_okno) { loadUsers._t = setTimeout(ponovi, 30000); return; }
      loadUsers();
    }, 30000);
  }
  function uporabnikNajdi(uid) { return document.querySelector('#usersList .u-mreza .row[data-uid="' + String(uid).replace(/"/g, '\\"') + '"]'); }
  function uporabnikOdpri(btn) {
    if (_okno) return;
    var uid = btn.dataset.uid;
    oknoOdpri(btn, btn.nextElementSibling, function () { return uporabnikNajdi(uid); }, {
      osvezi: function (k) { return k.nextElementSibling; }
    });
  }
  function opisVloge(v) {
    if (v === 'super') return 'Super admin — najvišja raven (samo lastnik). Vedno vse pravice.';
    if (v === 'admin') return 'Admin — pod super adminom; privzeto vidi in ureja vse razen upravljanja pravic.';
    if (v === 'osebje') return 'Osebje — vidi vse stranke, arhiv, statistiko, prisotnost in katalog. Brez Faktur in Uporabnikov.';
    if (v === 'zaposleni') return 'Zaposleni — vidi samo svojo prisotnost (svoje ure). Brez ostalih razdelkov.';
    return 'Stranka — vidi samo svoj arhiv in katalog svojega podjetja. Brez dostopa do osebja.';
  }
  async function spremeniVlogo(sel) {
    var uid = sel.dataset.role, stara = sel.dataset.cur, nova = sel.value;
    if (!uid || nova === stara) return;
    var ok = await potrdiModal({
      naslov: 'Sprememba vloge',
      sporocilo: 'Zdaj: ' + opisVloge(stara) + '\n\nNova vloga: ' + opisVloge(nova) + '\n\nŽeliš spremeniti vlogo tega uporabnika?',
      potrdi: 'Spremeni vlogo', preklici: 'Prekliči'
    });
    if (!ok) { loadUsers(); return; }
    var ime = sel.dataset.ime || '';   // ime iz izbirnika (seznam je zdaj v okvirčkih, izbirnik v oknu)
    await nastaviVlogo(uid, nova, ime);
  }
  async function nastaviVlogo(uid, vloga, ime) {
    var staff = (vloga === 'admin' || vloga === 'osebje' || vloga === 'super');
    var patch = { is_staff: staff, super_admin: (vloga === 'admin' || vloga === 'super'), zaposleni: vloga === 'zaposleni' };
    var r = await sb.from('profiles').update(patch).eq('id', uid);
    if (r && r.error && /(super_admin|zaposleni)/i.test(r.error.message || '')) {
      // stolpec super_admin ali zaposleni še ne obstaja → shrani vsaj is_staff in opozori
      r = await sb.from('profiles').update({ is_staff: staff }).eq('id', uid);
      var manjka = (vloga === 'super' || vloga === 'admin') ? '27_super_admin.sql' : vloga === 'zaposleni' ? '28_zaposleni.sql' : null;
      if (manjka) { if (vloga !== 'stranka') { try { await sb.from('memberships').delete().eq('user_id', uid); } catch (e) {} } uMsg('Vloga delno spremenjena — najprej zaženi ' + manjka + ' v Supabase.', true); loadUsers(); return; }
    }
    if (r && r.error) { uMsg('Ni uspelo: ' + escape_(r.error.message), true); loadUsers(); return; }
    if (vloga !== 'stranka') { try { await sb.from('memberships').delete().eq('user_id', uid); } catch (e) {} }
    logDodaj('Uporabniki', 'Vloga', (ime ? ime + ': ' : '') + 'nova vloga ' + roleIme(vloga));
    uMsg('Vloga je spremenjena.');
    loadUsers();
  }
  async function nastaviStranko(userId, orgId) {
    await sb.from('memberships').delete().eq('user_id', userId);
    if (orgId) {
      const {
        error
      } = await sb.from('memberships').insert({
        user_id: userId,
        org_id: orgId,
        role: 'owner'
      });
      if (error) {
        uMsg('Ni uspelo: ' + escape_(error.message), true);
        return;
      }
    }
    logDodaj('Uporabniki', 'Stranka', orgId ? ('Dodeljeno podjetje ' + (ORGIME[orgId] || '')) : 'Odvzet dostop do podjetja');
    uMsg(orgId ? 'Dostop je dodeljen.' : 'Dostop je odvzet.');
    loadUsers();
  }
  async function dejanje(btn) {
    const id = btn.dataset.id,
      act = btn.dataset.act;
    btn.disabled = true;
    if (act === 'ime') {
      const novo = await vnesiModal({ naslov: 'Ime uporabnika', placeholder: 'Ime in priimek', privzeto: btn.dataset.ime || '', potrdi: 'Shrani' });
      btn.disabled = false;
      if (novo === null) return;
      const ime = novo.trim();
      const { error } = await sb.from('profiles').update({ full_name: ime || null }).eq('id', id);
      if (!error && id === JAZ) { JAZIME = ime || JAZMAIL; nastaviWho(JAZIME); }
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : 'Ime shranjeno.', !!error);
      loadUsers();
      return;
    }
    if (act === 'staff') {
      const {
        error
      } = await sb.from('profiles').update({
        is_staff: btn.dataset.v === '1'
      }).eq('id', id);
      if (btn.dataset.v === '1') await sb.from('memberships').delete().eq('user_id', id);
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : 'Vloga je spremenjena.', !!error);
      loadUsers();
      return;
    }
    if (act === 'web') {
      const { error } = await sb.from('profiles').update({ web_dostop: btn.dataset.v === '1' }).eq('id', id);
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : (btn.dataset.v === '1' ? 'Dostop do aplikacije vključen.' : 'Dostop do aplikacije izključen.'), !!error);
      loadUsers();
      return;
    }
    if (act === 'active') {
      const {
        error
      } = await sb.from('profiles').update({
        active: btn.dataset.v === '1'
      }).eq('id', id);
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : btn.dataset.v === '1' ? 'Račun je vklopljen.' : 'Račun je izklopljen — dostopa nima več.', !!error);
      loadUsers();
      return;
    }
    if (act === 'super') {
      const { error } = await sb.from('profiles').update({ super_admin: btn.dataset.v === '1' }).eq('id', id);
      uMsg(error ? (/super_admin/i.test(error.message) ? 'Najprej zaženi 27_super_admin.sql v Supabase.' : 'Ni uspelo: ' + escape_(error.message)) : btn.dataset.v === '1' ? 'Uporabnik je zdaj Admin (ima Fakture).' : 'Admin odvzet.', !!error);
      loadUsers();
      return;
    }
    if (act === 'pin') {
      const jeNastavljen = btn.classList.contains('on');
      const novo = await vnesiModal({ naslov: jeNastavljen ? 'Spremeni PIN za aplikacijo' : 'Nastavi PIN za aplikacijo', sporocilo: (jeNastavljen ? 'Ta uporabnik ima PIN že nastavljen. ' : '') + 'Vpiši 4-mestno kodo, ki jo oseba vpiše ob prijavi v aplikacijo. Pusti prazno za odstranitev PIN-a.', placeholder: '4-mestni PIN', potrdi: 'Shrani' });
      btn.disabled = false;
      if (novo === null) return;
      const pin = String(novo || '').replace(/\D/g, '').slice(0, 4);
      if (pin && pin.length !== 4) { uMsg('PIN mora imeti 4 števke.', true); return; }
      const { error } = await sb.from('profiles').update({ app_pin: pin || null }).eq('id', id);
      if (error && /app_pin|column/i.test(error.message || '')) { uMsg('Najprej zaženi 46_app_pin.sql v Supabase.', true); return; }
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : (pin ? 'PIN nastavljen.' : 'PIN odstranjen.'), !!error);
      if (!error) loadUsers();   // osveži seznam, da se oznaka »PIN ✓« takoj posodobi
      return;
    }
    if (act === 'pw') {
      const r = await klic({
        dejanje: 'geslo',
        id
      });
      btn.disabled = false;
      if (r.napaka) {
        uMsg(escape_(r.napaka), true);
        return;
      }
      uMsg('Novo geslo: <span class="secret">' + escape_(r.geslo) + '</span><br>Zapišite si ga zdaj — drugič ga ne bo mogoče prikazati.');
      return;
    }
    if (act === 'del') {
      const _ok = await potrdiModal({ naslov: 'Izbriši račun', sporocilo: 'Res izbrisati račun ' + (btn.dataset.m || '') + '? Tega ni mogoče razveljaviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
      if (!_ok) {
        btn.disabled = false;
        return;
      }
      const r = await klic({
        dejanje: 'izbrisi',
        id
      });
      if (r.napaka) {
        btn.disabled = false;
        uMsg(escape_(r.napaka), true);
        return;
      }
      uMsg('Račun je izbrisan.');
      loadUsers();
      return;
    }
  }
  $('addUserForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('nuBtn');
    btn.disabled = true;
    btn.textContent = 'Ustvarjam …';
    const orgId = $('nuOrg').value;
    const ime = ($('nuIme') ? $('nuIme').value.trim() : '');
    const r = await klic({
      dejanje: 'ustvari',
      email: $('nuEmail').value.trim(),
      ime: ime || null,
      full_name: ime || null,
      osebje: !orgId,
      orgId: orgId || null
    });
    btn.disabled = false;
    btn.textContent = 'Ustvari račun';
    if (r.napaka) {
      uMsg(escape_(r.napaka), true);
      return;
    }
    if (ime && r.email) { try { await sb.from('profiles').update({ full_name: ime }).eq('email', r.email); } catch (e) {} }
    $('nuEmail').value = '';
    if ($('nuIme')) $('nuIme').value = '';
    uMsg('Račun <b>' + escape_(r.email) + '</b> je ustvarjen.<br>Geslo: <span class="secret">' + escape_(r.geslo) + '</span><br>Sporočite ga osebno ali po telefonu, ne po e-pošti skupaj ' + 'z naslovom portala. Drugič ga ne bo mogoče prikazati.');
    loadUsers();
  });

  /* ══════════ ZAPOMNJENI PROFILI (izbirnik prijave) ══════════ */
  function beriProfile() {
    try { var a = JSON.parse(localStorage.getItem('sc-profiles') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function shraniProfile(a) { try { localStorage.setItem('sc-profiles', JSON.stringify(a || [])); } catch (e) {} }
  function zapomniProfil(p) {
    if (!p || !p.email) return;
    var a = beriProfile();
    a = a.filter(function (x) { return (x.email || '').toLowerCase() !== (p.email || '').toLowerCase(); });
    var bio = false; try { bio = !!(p.uid && bioVklopljen(p.uid)); } catch (e) {}
    a.unshift({ email: p.email, name: p.name || p.email, avatar: p.avatar || '', uid: p.uid || '', bio: bio });
    if (a.length > 8) a = a.slice(0, 8);
    shraniProfile(a);
  }
  function pozabiProfil(email) {
    var a = beriProfile().filter(function (x) { return (x.email || '').toLowerCase() !== (email || '').toLowerCase(); });
    shraniProfile(a);
  }
  function ppIniciale(ime) {
    var d = (ime || '').trim().split(/\s+/).filter(Boolean);
    if (!d.length) return '?';
    return (d[0][0] + (d.length > 1 ? d[d.length - 1][0] : '')).toUpperCase();
  }
  // Znak »SC« v pisavi in barvah logotipa (S = temna, C = zelena) — enotna placeholder ikona povsod.
  function scMarkHtml() { return '<span class="sc-s">S</span><span class="sc-c">C</span>'; }
  function ppAvatarHtml(p, cls) {
    if (p && p.avatar) return '<span class="' + cls + '" style="background-image:url(' + encodeURI(p.avatar).replace(/"/g, '%22') + ')"></span>';
    return '<span class="' + cls + ' av-sc">' + scMarkHtml() + '</span>';
  }
  function narisiIzbirnik() {
    var grid = $('ppGrid'); if (!grid) return;
    var prof = beriProfile();
    var BIO_IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11a2 2 0 0 0-2 2v2"/><path d="M12 7a6 6 0 0 1 6 6v1"/><path d="M6 13a6 6 0 0 1 3-5.2"/><path d="M8 17.5a8 8 0 0 0 .5 2"/><path d="M15.5 20a10 10 0 0 0 .5-6 4 4 0 0 0-6.5-3"/></svg>';
    var html = prof.map(function (p) {
      var imaBio = bioPodprt() && p.uid && bioVklopljen(p.uid);
      var badge = imaBio ? '<span class="pp-bio" title="Face ID / prstni odtis">' + BIO_IKONA + '</span>' : '';
      return '<div class="pp-tile-wrap">' +
        '<button type="button" class="pp-tile" data-email="' + escape_(p.email) + '">' +
        ppAvatarHtml(p, 'pp-av') + badge +
        '<span class="pp-nm">' + escape_(p.name || p.email) + '</span></button>' +
        '<button type="button" class="pp-tile-x" data-forget="' + escape_(p.email) + '" aria-label="Odstrani profil" title="Odstrani profil">×</button>' +
        '</div>';
    }).join('');
    html += '<button type="button" class="pp-tile pp-add" id="ppAdd"><span class="pp-av pp-plus">+</span><span class="pp-nm">Drug uporabnik</span></button>';
    grid.innerHTML = html;
    grid.querySelectorAll('.pp-tile[data-email]').forEach(function (b) {
      b.addEventListener('click', function () { izberiProfil(b.dataset.email); });
    });
    grid.querySelectorAll('.pp-tile-x').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        pozabiProfil(b.dataset.forget);
        if (beriProfile().length) narisiIzbirnik(); else pokaziPrijavo('');
      });
    });
    var add = $('ppAdd');
    if (add) add.addEventListener('click', function () { pokaziPrijavo(''); });
    // Stalni gumb pod karticami: »Prijava z geslom« — vedno na voljo (če biometrija ne dela ali je nočeš).
    var pk = $('profilePicker');
    if (pk) {
      var lp = $('ppLoginPass');
      if (!lp) {
        lp = document.createElement('button');
        lp.id = 'ppLoginPass'; lp.type = 'button'; lp.className = 'pp-loginpass';
        lp.textContent = 'Prijava z geslom';
        lp.style.cssText = 'display:block;margin:22px auto 0;background:none;border:none;color:var(--accent,#777);font-size:.92rem;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:8px 12px;border-radius:8px;';
        if (grid.parentNode) grid.parentNode.insertBefore(lp, grid.nextSibling);
        lp.addEventListener('click', function () { pokaziPrijavo(''); });
      }
      lp.classList.remove('hidden');
    }
  }
  function pokaziIzbirnik() {
    narisiIzbirnik();
    // Sveže stanje: počisti sporočilo (stari, neuporabljeni gumb skrij, če obstaja v HTML).
    var _pp = $('ppPass'); if (_pp) _pp.classList.add('hidden');
    var _pm = $('ppMsg'); if (_pm) { _pm.className = 'msg'; _pm.textContent = ''; }
    $('profilePicker').classList.remove('hidden');
    $('authBox').classList.add('hidden');
  }
  function pokaziPrijavo(email, sporocilo) {
    $('profilePicker').classList.add('hidden');
    $('authBox').classList.remove('hidden');
    showAuthPane('loginForm');
    var q = document.querySelector('.auth-box .sub'); if (q) q.textContent = 'Vpišite se s podatki, ki ste jih prejeli od nas.';
    if ($('email')) $('email').value = email || '';
    var back = $('backToPickerBtn');
    if (back) back.style.display = beriProfile().length ? '' : 'none';
    var lm = $('loginMsg');
    if (lm) { if (sporocilo) { lm.className = 'msg show'; lm.textContent = sporocilo; } else { lm.className = 'msg'; lm.textContent = ''; } }
    setTimeout(function () { try { (email ? $('password') : $('email')).focus(); } catch (e) {} }, 40);
  }
  async function izberiProfil(email) {
    var p = beriProfile().filter(function (x) { return (x.email || '').toLowerCase() === (email || '').toLowerCase(); })[0];
    var seja = null;
    try { var s = await sb.auth.getSession(); seja = s && s.data && s.data.session; } catch (e) {}
    var sejaTaUporabnik = seja && seja.user && (seja.user.email || '').toLowerCase() === (email || '').toLowerCase();
    // 1) Face ID OMOGOČEN za ta profil → VEDNO zahtevaj Face ID; ob neuspehu geslo.
    //    NIKOLI tihega vstopa (varnost). Face ID se sam NE izklopi (ne poteče) —
    //    izklopi se le ročno v Nastavitvah (»Odstrani s te naprave«).
    if (p && p.uid && bioPodprt() && bioVklopljen(p.uid)) {
      var m = $('ppMsg'); if (m) { m.className = 'msg show'; m.innerHTML = '<span class="bio-pulse"></span>Odkleni s Face ID / Touch ID …'; }
      try {
        var ok = await bioOdkleni(p.uid, email);
        if (!ok) { pokaziPrijavo(email); return; }
        if (m) { m.className = 'msg'; m.textContent = ''; }
        // Seja JE vzpostavljena (verifyOtp). Če izris aplikacije spodleti (prehodno),
        // NE vračaj na prijavo — seja je veljavna → osveži, obnovitev seje jo pobere.
        try { await start(); }
        catch (se) { try { console.warn('[bio] start() po uspešni prijavi ni uspel:', se); } catch (_) {} location.reload(); }
        return;
      } catch (e) {
        try { console.warn('[bio] prijava z biometrijo ni uspela:', (e && (e.name + ': ' + e.message)) || e); } catch (_) {}
        var preklic = /NotAllowed|AbortError|abort|timed|timeout|cancel/i.test(((e && e.name) || '') + ' ' + ((e && e.message) || ''));
        // Preklic → tiho nazaj na izbirnik (spodaj je stalni gumb »Prijava z geslom«).
        // Prava napaka → naravnost na vpis gesla, prijazno.
        if (m) { m.className = 'msg'; m.textContent = ''; }
        if (!preklic) pokaziPrijavo(email, 'Poskusi znova ali vpiši geslo.');
        return;
      }
    }
    // 2) Brez Face ID: VEDNO zahtevaj geslo (nič tihega vstopa, tudi če je seja še živa) —
    //    prijavni zaslon je varnostna vrata. (Ko oseba vklopi biometrijo, je to Touch ID.)
    pokaziPrijavo(email);
  }

  /* ══════════ FACE ID / PRSTNI ODTIS (WebAuthn) ══════════ */
  function bioPodprt() {
    try { return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create); }
    catch (e) { return false; }
  }
  function b64u(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function odB64u(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b.buffer;
  }
  function nakljucje(n) { var a = new Uint8Array(n || 32); (window.crypto || {}).getRandomValues && window.crypto.getRandomValues(a); return a; }
  /* Vpis (credId) je LOČEN od žetona. Za vsakega uporabnika hranimo NJEGOV žeton,
     da na skupni napravi z več uporabniki biometrija obnovi PRAVEGA uporabnika. */
  /* ── STREŽNIŠKI WebAuthn (kot velika podjetja) ──────────────────────────
     Javni ključi so v bazi; podpis preveri Edge Function »webauthn«. Odjemalec
     ne hrani žetonov ne referenc — le majhno UI zastavico »bio vklopljen«.   */
  function bioVklopljen(uid) { try { return !!(uid && localStorage.getItem('sc-bioon-' + uid)); } catch (e) { return false; } }
  function bioOznaci(uid, on) { try { if (on) localStorage.setItem('sc-bioon-' + uid, '1'); else localStorage.removeItem('sc-bioon-' + uid); } catch (e) {} }
  function bioOsveziZetone() { /* ni več lokalnih žetonov — strežnik obvlada sejo */ }
  /* Vse napake pretvori v PRIJAZNO slovensko besedilo — nikoli surovih/tehničnih. */
  function _bioNapaka(e) {
    var n = ((e && e.name) || '') + ' ' + ((e && e.message) || '');
    if (/NotAllowed|AbortError|abort|timed|timeout|cancel/i.test(n)) return 'Preklicano.';
    if (/InvalidState|already registered/i.test(n)) return 'Že omogočeno.';
    if (/NotSupported|not support|SecurityError/i.test(n)) return 'Ta naprava ne podpira biometrije.';
    if (/network|Failed to fetch|fetch|Load failed|omrežj/i.test(n)) return 'Ni povezave — poskusi znova.';
    return 'Ni uspelo — poskusi znova.';
  }
  async function _fnWebauthn(body) {
    var r = await sb.functions.invoke('webauthn', { body: body });
    if (r.error) { var msg = r.error.message || 'Napaka strežnika.'; try { if (r.error.context && r.error.context.json) { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } } catch (e) {} throw new Error(msg); }
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data;
  }
  /* WebAuthn kodiranje BREZ zunanje knjižnice (base64url ⇄ ArrayBuffer) — brez CSP težav. */
  function _waReg2native(o) {
    return { publicKey: {
      challenge: odB64u(o.challenge),
      rp: o.rp,
      user: { id: odB64u(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams,
      timeout: o.timeout, attestation: o.attestation,
      authenticatorSelection: o.authenticatorSelection,
      excludeCredentials: (o.excludeCredentials || []).map(function (c) { return { id: odB64u(c.id), type: c.type, transports: c.transports }; })
    } };
  }
  function _waAuth2native(o) {
    return { publicKey: {
      challenge: odB64u(o.challenge),
      timeout: o.timeout, rpId: o.rpId, userVerification: o.userVerification,
      allowCredentials: (o.allowCredentials || []).map(function (c) { return { id: odB64u(c.id), type: c.type, transports: c.transports }; })
    } };
  }
  function _waRegJSON(cred) {
    var r = cred.response;
    return { id: cred.id, rawId: b64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: b64u(r.clientDataJSON), attestationObject: b64u(r.attestationObject), transports: (r.getTransports && r.getTransports()) || [] },
      clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
      authenticatorAttachment: cred.authenticatorAttachment || undefined };
  }
  function _waAuthJSON(cred) {
    var r = cred.response;
    return { id: cred.id, rawId: b64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), userHandle: r.userHandle ? b64u(r.userHandle) : null },
      clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
      authenticatorAttachment: cred.authenticatorAttachment || undefined };
  }
  // Omogoči biometrijo: registriraj passkey na STREŽNIKU (oseba je prijavljena z geslom).
  async function bioOmogoci() {
    if (!bioPodprt()) throw new Error('Ta naprava ne podpira Face ID / prstnega odtisa.');
    var sres = await sb.auth.getSession();
    var session = sres && sres.data && sres.data.session;
    if (!session) throw new Error('Najprej se prijavi z geslom.');
    var beg = await _fnWebauthn({ mode: 'reg-begin' });
    var cred;
    try { cred = await navigator.credentials.create(_waReg2native(beg.options)); }
    catch (e) {
      // Passkey za tega uporabnika že obstaja (na tej/sinhronizirani napravi) → biometrija je že vklopljena.
      if (e && (e.name === 'InvalidStateError' || /already registered/i.test(e.message || ''))) {
        bioOznaci(session.user.id, true);
        zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: session.user.id });
        return 'ze';
      }
      throw e;
    }
    await _fnWebauthn({ mode: 'reg-finish', handle: beg.handle, response: _waRegJSON(cred), label: (navigator.userAgent || '').slice(0, 80) });
    bioOznaci(session.user.id, true);
    zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: session.user.id });
    return 'nov';
  }
  // Prijava z biometrijo: strežnik preveri podpis in izda sejo (magiclink token_hash).
  // Vrne true ob uspehu; sejo vzpostavi verifyOtp. Ob prekinitvi/napaki vrže napako.
  async function bioOdkleni(uid, email) {
    var beg = await _fnWebauthn({ mode: 'auth-begin', email: email || '' });
    var cred = await navigator.credentials.get(_waAuth2native(beg.options));
    var fin = await _fnWebauthn({ mode: 'auth-finish', handle: beg.handle, response: _waAuthJSON(cred) });
    if (!fin || !fin.token_hash) throw new Error('Prijava ni uspela.');
    var vo = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: fin.token_hash });
    if (vo.error || !vo.data || !vo.data.session) throw new Error((vo.error && vo.error.message) || 'Seje ni bilo mogoče vzpostaviti.');
    return true;
  }
  // Odstrani biometrijo tega uporabnika: izbriši VSE njegove passkeye na strežniku + lokalno zastavico.
  async function bioOdstrani() {
    try { if (JAZ) await sb.from('webauthn_credentials').delete().eq('user_id', JAZ); } catch (e) {}
    bioOznaci(JAZ, false);
  }
  // Panel v »Moj račun«.
  async function napolniBio() {
    var panel = $('bioPanel'); if (!panel) return;
    if (!bioPodprt()) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    function prikazi(ima) {
      var on = $('bioOn'), off = $('bioOff'), lead = $('bioLead');
      if (on) on.classList.toggle('hidden', ima);
      if (off) off.classList.toggle('hidden', !ima);
      if (lead) lead.textContent = ima
        ? 'Prijava z biometrijo je vklopljena. Ob prijavi tapni svoj profil in potrdi s Face ID / prstnim odtisom.'
        : 'Namesto gesla se lahko prijaviš s Face ID ali prstnim odtisom te naprave.';
    }
    prikazi(bioVklopljen(JAZ));                 // takoj (lokalni namig)
    var m = $('bioMsg'); if (m) { m.className = 'msg'; m.textContent = ''; }
    // Natančno stanje s STREŽNIKA (velja povsod, tudi če je bilo vklopljeno na drugi napravi).
    try {
      var r = await sb.from('webauthn_credentials').select('credential_id').eq('user_id', JAZ).limit(1);
      if (r && !r.error) { var ima = !!(r.data && r.data.length); bioOznaci(JAZ, ima); prikazi(ima); }
    } catch (e) {}
  }
  { var _bon = $('bioOn'); if (_bon) _bon.addEventListener('click', async function () {
    var m = $('bioMsg'); this.disabled = true; var t = this.textContent; this.innerHTML = '<span class="bio-pulse"></span>Potrjevanje …';
    try { var _st = await bioOmogoci(); if (m) { m.className = 'msg ok show'; m.textContent = (_st === 'ze') ? 'Biometrija je že vklopljena.' : 'Biometrija je vklopljena.'; } await napolniBio(); }
    catch (e) { if (m) { m.className = 'msg bad show'; m.textContent = _bioNapaka(e); } }
    this.disabled = false; this.textContent = t;
  }); }
  { var _bof = $('bioOff'); if (_bof) _bof.addEventListener('click', async function () {
    var m = $('bioMsg'); this.disabled = true; var t = this.textContent; this.textContent = 'Odstranjujem …';
    try { await bioOdstrani(); if (m) { m.className = 'msg ok show'; m.textContent = 'Biometrija odstranjena.'; } }
    catch (e) { if (m) { m.className = 'msg bad show'; m.textContent = _bioNapaka(e); } }
    this.disabled = false; this.textContent = t;
    zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: JAZ });
    await napolniBio();
  }); }

  /* ══════════ ADMIN — vloge in pravice (samo lastnik) ══════════ */
  var _ADMIN_OSNUTEK = null;   // delovna kopija konfiguracije
  function adminOsnutek() {
    if (_ADMIN_OSNUTEK) return _ADMIN_OSNUTEK;
    var o = { imena: {}, perm: {} };
    ADMIN_VLOGE.forEach(function (v) {
      o.imena[v] = roleIme(v);
      o.perm[v] = {};
      ADMIN_RAZDELKI.forEach(function (s) {
        var b = (ROLE_CFG && ROLE_CFG.perm && ROLE_CFG.perm[v] && ROLE_CFG.perm[v][s[0]]) || (ADMIN_PRIVZ[v] && ADMIN_PRIVZ[v][s[0]]) || _perm(0, 0, 0, 0);
        o.perm[v][s[0]] = _perm(b.r, b.w, b.x, b.d);
      });
    });
    _ADMIN_OSNUTEK = o; return o;
  }
  var _adminVloga = 'osebje';
  var ADMIN_OPISI = {
    domov: 'Začetna nadzorna plošča.', statistika: 'Analitika — kilaža, učinkovitost, grafi.', arhiv: 'Arhiv spremnih listov.',
    fakture: 'Osnove za račun (izvoz PDF/Excel).', artikli: 'Katalog artiklov in ceniki (za osebje).', stranke: 'Upravljanje strank in njihovih cenikov.',
    prisotnost: 'Evidenca delovnega časa.', dokumenti: 'Datoteke in mape.', aplikacija: 'Namestitev aplikacij (Skener …).',
    uporabniki: 'Upravljanje uporabnikov in vlog.', katalog: 'Cenik/katalog, ki ga vidi stranka za svoje podjetje.'
  };
  var _PRAV_ADMIN = [['r', 'Branje'], ['w', 'Pisanje'], ['x', 'Izvajanje'], ['d', 'Prenos']];
  var _PRAV_DOK = [['r', 'Branje'], ['w', 'Nalaganje'], ['x', 'Brisanje'], ['d', 'Prenos']];
  function adminPanelHtml(o) {
    var v = _adminVloga;
    var jeSuper = (v === 'super');
    var h = '<div class="panel adm-role">' +
      '<div class="adm-role-h"><input type="text" class="adm-ime" value="' + escape_(o.imena[v]) + '" maxlength="40" aria-label="Ime vloge"><span class="adm-role-key">' + escape_(v) + '</span></div>' +
      (jeSuper ? '<p class="u-sub" style="margin:0 0 10px">Super admin ima vedno vse pravice (jih ni mogoče omejiti).</p>' : '<p class="u-sub" style="margin:0 0 8px">Obkljukaj, kateri razdelki so vidni tej vlogi (stranski meni). Pri Dokumentih lahko ločeno določiš branje / nalaganje / brisanje / prenos.</p>') +
      '<div class="adm-list">';
    ADMIN_RAZDELKI.forEach(function (s) {
      if (s[0] === 'dokumenti') {
        h += '<div class="adm-item adm-item-dok"><span class="adm-sec" title="' + escape_(ADMIN_OPISI.dokumenti) + '">Dokumenti</span><div class="adm-perms">' +
          _PRAV_DOK.map(function (p) { var on = o.perm[v].dokumenti[p[0]]; return '<label class="adm-pill' + (on ? ' on' : '') + (jeSuper ? ' dis' : '') + '"><input type="checkbox" data-s="dokumenti" data-p="' + p[0] + '"' + (on ? ' checked' : '') + (jeSuper ? ' disabled' : '') + '>' + p[1] + '</label>'; }).join('') +
          '</div></div>';
      } else if (s[0] === 'konzola') {
        // Konzola je na voljo SAMO lastniku — v seznamu je zaradi skladnosti s stranskim menijem,
        // a je ni mogoče dodeliti drugim vlogam.
        h += '<div class="adm-item"><span class="adm-sec" title="Konzola je na voljo samo lastniku.">Konzola <span class="adm-only">samo lastnik</span></span>' +
          '<label class="adm-chk"><input type="checkbox" disabled' + (jeSuper ? ' checked' : '') + '><span></span></label></div>';
      } else {
        var on = o.perm[v][s[0]].r;
        h += '<div class="adm-item"><span class="adm-sec" title="' + escape_(ADMIN_OPISI[s[0]] || '') + '">' + escape_(s[1]) + '</span>' +
          '<label class="adm-chk"><input type="checkbox" data-s="' + s[0] + '" data-p="r"' + (on ? ' checked' : '') + (jeSuper ? ' disabled' : '') + '><span></span></label></div>';
      }
    });
    return h + '</div></div>';
  }
  function adminRisiPanel() {
    var host = $('adminRolePanel'); if (!host) return;
    var o = adminOsnutek();
    host.innerHTML = adminPanelHtml(o);
    var inp = host.querySelector('.adm-ime'); if (inp) inp.addEventListener('input', function () { o.imena[_adminVloga] = inp.value; var t = document.querySelector('#adminTabs [data-av="' + _adminVloga + '"]'); if (t) t.textContent = inp.value || _adminVloga; });
    host.querySelectorAll('input[type="checkbox"][data-s]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        o.perm[_adminVloga][cb.dataset.s][cb.dataset.p] = cb.checked;
        var pill = cb.closest('.adm-pill'); if (pill) pill.classList.toggle('on', cb.checked);
      });
    });
  }
  var _adminView = 'pravice';
  function risiAdmin() {
    var box = $('adminList'); if (!box) return;
    if (!JE_LASTNIK()) { box.innerHTML = '<div class="msg bad show">Dostop nima na voljo.</div>'; return; }
    box.innerHTML = '<div class="adm-top"><div class="pris-tabs" id="adminViewTabs">' +
      '<button type="button" class="pris-tab' + (_adminView === 'pravice' ? ' on' : '') + '" data-view="pravice">Vloge in pravice</button>' +
      '<button type="button" class="pris-tab' + (_adminView === 'dnevnik' ? ' on' : '') + '" data-view="dnevnik">Dnevnik sprememb</button>' +
      '</div></div><div id="adminBody"></div>';
    box.querySelectorAll('#adminViewTabs [data-view]').forEach(function (b) { b.addEventListener('click', function () { _adminView = b.dataset.view; box.querySelectorAll('#adminViewTabs [data-view]').forEach(function (x) { x.classList.toggle('on', x === b); }); adminRisiBody(); }); });
    adminRisiBody();
  }
  function adminRisiBody() {
    if (_adminView === 'dnevnik') return adminRisiDnevnik();
    return adminRisiPravice();
  }
  function adminRisiPravice() {
    var body = $('adminBody'); if (!body) return;
    _ADMIN_OSNUTEK = null;
    var o = adminOsnutek();
    if (ADMIN_VLOGE.indexOf(_adminVloga) < 0) _adminVloga = 'osebje';
    var tabs = '<div class="pris-tabs adm-tabs" id="adminTabs">' + ADMIN_VLOGE.map(function (v) { return '<button type="button" class="pris-tab' + (v === _adminVloga ? ' on' : '') + '" data-av="' + v + '">' + escape_(o.imena[v]) + '</button>'; }).join('') + '</div>';
    body.innerHTML = '<p class="u-sub" style="margin:8px 0 14px">Izberi vlogo, nato uredi njene pravice. Kljukica = razdelek je viden v stranskem meniju. (Tvoje pravice ostanejo vedno polne.)</p>' +
      '<div class="adm-top">' + tabs + '</div><div id="adminRolePanel"></div>' +
      '<div class="adm-save"><div class="msg" id="adminMsg" role="status"></div><button type="button" class="btn btn-narrow" id="adminShrani">Shrani pravice</button></div>';
    body.querySelectorAll('#adminTabs [data-av]').forEach(function (b) { b.addEventListener('click', function () { _adminVloga = b.dataset.av; body.querySelectorAll('#adminTabs [data-av]').forEach(function (x) { x.classList.toggle('on', x === b); }); adminRisiPanel(); }); });
    adminRisiPanel();
    var sb2 = $('adminShrani'); if (sb2) sb2.addEventListener('click', adminShrani);
  }
  var _adminLogFilter = '';
  async function adminRisiDnevnik() {
    var body = $('adminBody'); if (!body) return;
    body.innerHTML = '<p class="u-sub" style="margin:8px 0 12px">Spremembe zadnjih 6 mesecev (artikli, stranke, arhiv, opombe, vloge). Zapisuje se samo, kaj je bilo spremenjeno — ne vsak klik.</p>' +
      '<div class="filtri" style="margin:0 0 12px"><input type="search" id="adminLogIsci" placeholder="Iskanje po dnevniku …" aria-label="Iskanje"></div><div id="adminLogList">' + NALAGANJE + '</div>';
    var il = $('adminLogIsci'); if (il) { il.value = _adminLogFilter; il.addEventListener('input', function () { _adminLogFilter = this.value; adminRisiLogSez(); }); }
    var meja = new Date(Date.now() - 183 * 24 * 3600 * 1000).toISOString();
    var r;
    try { r = await sb.from('audit_log').select('kdo_ime,razdelek,akcija,opis,created_at').gte('created_at', meja).order('created_at', { ascending: false }).limit(1000); } catch (e) { r = { error: e }; }
    if (r && r.error) { $('adminLogList').innerHTML = '<div class="msg bad show">Napaka pri nalaganju. Če piše, da tabela ne obstaja, zaženi <b>33_audit_log.sql</b> v Supabase.</div>'; return; }
    _ADMIN_LOG = r.data || [];
    adminRisiLogSez();
  }
  var _ADMIN_LOG = [];
  function adminRisiLogSez() {
    var host = $('adminLogList'); if (!host) return;
    var q = (_adminLogFilter || '').trim().toLowerCase();
    var vrstice = (_ADMIN_LOG || []).filter(function (l) { return !q || ((l.kdo_ime || '') + ' ' + (l.razdelek || '') + ' ' + (l.akcija || '') + ' ' + (l.opis || '')).toLowerCase().indexOf(q) >= 0; });
    if (!vrstice.length) { host.innerHTML = '<div class="empty"><h3>' + (q ? 'Ni zadetkov' : 'Ni zapisov') + '</h3>' + (q ? '' : '<p>Spremembe se bodo tu izpisovale, ko jih uporabniki naredijo.</p>') + '</div>'; return; }
    host.innerHTML = '<div class="log-list">' + vrstice.map(function (l) {
      var dt = new Date(l.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<div class="log-row"><span class="log-raz">' + escape_(l.razdelek || '—') + '</span>' +
        '<div class="log-mid"><div class="log-op">' + escape_(l.akcija ? l.akcija + ' · ' : '') + escape_(l.opis || '') + '</div>' +
        '<div class="log-meta">' + escape_(l.kdo_ime || 'osebje') + ' · ' + escape_(dt) + '</div></div></div>';
    }).join('') + '</div>';
  }
  async function adminShrani() {
    var btn = $('adminShrani'), m = $('adminMsg');
    var o = adminOsnutek();
    // varovalo: super admin ima vedno polne pravice
    ADMIN_RAZDELKI.forEach(function (s) { if (s[0] !== 'katalog') { o.perm.super[s[0]] = _perm(1, 1, 1, 1); } });
    // Pri razdelkih razen Dokumentov velja samo »vpogled« (r) — ostalo poravnamo z r.
    ADMIN_VLOGE.forEach(function (v) {
      ADMIN_RAZDELKI.forEach(function (s) { if (s[0] !== 'dokumenti') { var r = !!o.perm[v][s[0]].r; o.perm[v][s[0]] = _perm(r, r, r, r); } });
      if (!o.imena[v] || !o.imena[v].trim()) o.imena[v] = ADMIN_IMENA_PRIVZ[v]; else o.imena[v] = o.imena[v].trim();
    });
    btn.disabled = true; var t = btn.textContent; btn.textContent = 'Shranjujem …';
    var up = await sb.from('app_config').upsert({ kljuc: 'role_config', vrednost: JSON.stringify(o) }, { onConflict: 'kljuc' });
    btn.disabled = false; btn.textContent = t;
    if (up && up.error) { m.className = 'msg bad show'; m.textContent = /app_config|relation|column/i.test(up.error.message || '') ? 'Najprej zaženi 29_app_config.sql v Supabase.' : ('Ni uspelo: ' + up.error.message); return; }
    ROLE_CFG = JSON.parse(JSON.stringify(o));
    m.className = 'msg show'; m.textContent = 'Pravice shranjene. Uporabniki jih vidijo ob naslednji osvežitvi.';
    try { meni(); } catch (e) {}
  }

  /* ══════════ OBVESTILA (konzola) ══════════ */
  var OBV_IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  function obvVerjeni() { try { var a = JSON.parse(localStorage.getItem('sc-obv-seen') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function obvOznaciVerjeno(id) { try { var a = obvVerjeni(); if (a.indexOf(id) < 0) { a.push(id); if (a.length > 200) a = a.slice(-200); localStorage.setItem('sc-obv-seen', JSON.stringify(a)); } } catch (e) {} }
  function obvZaMene(o) { return !o.prejemnik || o.prejemnik === JAZ; }
  // Naloži aktualna obvestila zame (za toaste, zvonec in seznam »za nazaj«).
  async function naloziMojaObvestila() {
    if (!sb) return [];
    var r = await sb.from('obvestila').select('id,naslov,sporocilo,created_at,prejemnik,tip').eq('aktivno', true).order('created_at', { ascending: false }).limit(50);
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,created_at,prejemnik').eq('aktivno', true).order('created_at', { ascending: false }).limit(50); }
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,created_at').eq('aktivno', true).order('created_at', { ascending: false }).limit(50); }
    if (!r || r.error || !r.data) return [];
    return r.data.filter(obvZaMene);
  }
  // Prikaži eno obvestilo v pravi obliki: pojavno okno (modal) ali toast v kotu.
  function obvPrikazi(o) { if (o && o.tip === 'modal') narisiModalObvestilo(o); else narisiToast(o); }
  // Prikaži neprebrana aktivna obvestila (vsem ali meni osebno).
  async function pokaziObvestila() {
    if (!sb) return;
    var list = await naloziMojaObvestila();
    var vid = obvVerjeni();
    list.filter(function (o) { return vid.indexOf(o.id) < 0; }).reverse().forEach(obvPrikazi);
    osveziNotifZnak(list);
  }
  // Pika na zvoncu, če je kaj neprebranega.
  function osveziNotifZnak(list) {
    var dot = $('notifDot'); if (!dot) return;
    var vid = obvVerjeni();
    var neprebrano = (list || []).some(function (o) { return vid.indexOf(o.id) < 0; });
    dot.hidden = !neprebrano;
  }
  // Zvonec: seznam obvestil »za nazaj«.
  async function odpriNotif() {
    var panel = $('notifPanel'), lst = $('notifList'); if (!panel || !lst) return;
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    lst.innerHTML = '<div class="notif-empty">Nalagam …</div>';
    var list = await naloziMojaObvestila();
    if (!list.length) { lst.innerHTML = '<div class="notif-empty">Ni obvestil.</div>'; }
    else {
      lst.innerHTML = list.map(function (o) {
        var dat = new Date(o.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return '<div class="notif-item">' + (o.naslov ? '<div class="notif-nas">' + escape_(o.naslov) + '</div>' : '') +
          '<div class="notif-txt">' + escape_(o.sporocilo || '') + '</div><div class="notif-dat">' + escape_(dat) + '</div></div>';
      }).join('');
    }
    // ob odprtju označimo vse kot prebrano → pika izgine
    list.forEach(function (o) { obvOznaciVerjeno(o.id); });
    osveziNotifZnak(list);
  }
  { var _notb = $('notifBtn'); if (_notb) _notb.addEventListener('click', function (e) { e.stopPropagation(); odpriNotif(); }); }
  document.addEventListener('click', function (e) {
    var p = $('notifPanel'); if (!p || p.classList.contains('hidden')) return;
    if (!p.contains(e.target) && !(e.target.closest && e.target.closest('#notifBtn'))) p.classList.add('hidden');
  });
  function narisiToast(o) {
    var wrap = $('obvWrap'); if (!wrap) return;
    if (wrap.querySelector('[data-obv="' + o.id + '"]')) return;
    var el = document.createElement('div');
    el.className = 'obv-card'; el.setAttribute('data-obv', o.id);
    el.innerHTML = '<span class="obv-ic">' + OBV_IKONA + '</span>' +
      '<div class="obv-body">' + (o.naslov ? '<div class="obv-nas">' + escape_(o.naslov) + '</div>' : '') +
      '<div class="obv-txt">' + escape_(o.sporocilo || '') + '</div></div>' +
      '<button type="button" class="obv-x" aria-label="Zapri">×</button>';
    el.querySelector('.obv-x').addEventListener('click', function () { obvOznaciVerjeno(o.id); el.remove(); });
    wrap.appendChild(el);
  }
  // Pojavno obvestilo na sredini z gumbom »V redu« (v vrsti, eno naenkrat).
  var _obvMq = [], _obvMon = false;
  function narisiModalObvestilo(o) {
    if (!o || obvVerjeni().indexOf(o.id) >= 0) return;
    if (_obvMq.some(function (x) { return x.id === o.id; })) return;
    if (document.querySelector('.sc-modal-back[data-obvm="' + o.id + '"]')) return;
    _obvMq.push(o); obvModalNaprej();
  }
  function obvModalNaprej() {
    if (_obvMon) return;
    var o = _obvMq.shift(); if (!o) return;
    _obvMon = true;
    var back = document.createElement('div');
    back.className = 'sc-modal-back'; back.setAttribute('data-obvm', o.id);
    back.innerHTML = '<div class="sc-modal sc-modal-obv" role="dialog" aria-modal="true"><span class="obvm-ic">' + OBV_IKONA + '</span><h4></h4><p></p><div class="sc-modal-acts one"><button type="button" class="sc-modal-btn primary" data-ok></button></div></div>';
    back.querySelector('h4').textContent = o.naslov || 'Obvestilo';
    back.querySelector('p').textContent = o.sporocilo || '';
    back.querySelector('[data-ok]').textContent = 'V redu';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    var done = false;
    function zapri() {
      if (done) return; done = true;
      obvOznaciVerjeno(o.id);
      back.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); _obvMon = false; obvModalNaprej(); }, 180);
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); zapri(); } }
    back.querySelector('[data-ok]').addEventListener('click', function (e) { e.stopPropagation(); zapri(); });
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey);
    var ob = back.querySelector('[data-ok]'); if (ob) ob.focus();
  }
  // Živa dostava: realtime (če deluje) + zanesljiva osvežitev vsakih 60 s.
  var _obvKanal = null, _obvTimer = null;
  function narociObvestila() {
    if (!sb) return;
    // Realtime (bonus, za trenutno dostavo). Potrebuje avtorizacijo z žetonom.
    if (!_obvKanal) {
      try {
        sb.auth.getSession().then(function (s) {
          try { var tok = s && s.data && s.data.session && s.data.session.access_token; if (tok && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(tok); } catch (e) {}
          _obvKanal = sb.channel('obvestila-live')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'obvestila' }, function (p) {
              var o = p && p.new; if (o && o.aktivno && obvVerjeni().indexOf(o.id) < 0 && obvZaMene(o)) obvPrikazi(o);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_config' }, function (p) {
              var o = p && p.new; if (o && o.kljuc === 'reload' && _reloadVal != null && String(o.vrednost) !== String(_reloadVal)) osveziAplikacijo();
            })
            .subscribe();
        });
      } catch (e) {}
    }
    // Zanesljiva rezerva: preveri nova obvestila + potisnjeno osvežitev vsakih 60 s.
    if (!_obvTimer) {
      _obvTimer = setInterval(function () {
        if (document.hidden) return;
        try { pokaziObvestila(); } catch (e) {}
        try { preveriReload(); } catch (e) {}
      }, 60000);
    }
  }
  /* ── Potisnjena osvežitev vseh (po posodobitvi portala) ── */
  async function preberiReload() {
    try { var r = await sb.from('app_config').select('vrednost').eq('kljuc', 'reload').maybeSingle(); if (r && r.data) _reloadVal = r.data.vrednost; } catch (e) {}
  }
  async function osveziAplikacijo() {
    try { if ('serviceWorker' in navigator) { var regs = await navigator.serviceWorker.getRegistrations(); for (var i = 0; i < regs.length; i++) { try { await regs[i].unregister(); } catch (e) {} } } } catch (e) {}
    try { if (window.caches) { var ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); })); } } catch (e) {}
    location.reload();
  }
  async function preveriReload() {
    try {
      var r = await sb.from('app_config').select('vrednost').eq('kljuc', 'reload').maybeSingle();
      var v = r && r.data ? r.data.vrednost : null;
      if (v != null && _reloadVal != null && String(v) !== String(_reloadVal)) osveziAplikacijo();
    } catch (e) {}
  }
  { var _prb = $('pushRefreshBtn'); if (_prb) _prb.addEventListener('click', async function () {
    var m = $('pushRefreshMsg');
    var ok = await potrdiModal({ naslov: 'Osveži aplikacijo vsem', sporocilo: 'Vsi trenutno prijavljeni uporabniki bodo v nekaj sekundah samodejno osveženi in naložijo novo različico. Nadaljujem?', potrdi: 'Osveži vsem', preklici: 'Prekliči' });
    if (!ok) return;
    this.disabled = true; var t = this.textContent; this.textContent = 'Pošiljam …';
    var val = String(Date.now());
    var r = await sb.from('app_config').upsert({ kljuc: 'reload', vrednost: val }, { onConflict: 'kljuc' });
    this.disabled = false; this.textContent = t;
    if (r && r.error) { m.className = 'msg bad show'; m.textContent = /app_config|relation|column/i.test(r.error.message || '') ? 'Najprej zaženi 29_app_config.sql v Supabase.' : 'Ni uspelo: ' + r.error.message; return; }
    _reloadVal = val; // da se pošiljatelj ne osveži sam
    m.className = 'msg show'; m.textContent = 'Osvežitev je poslana. Uporabniki se osvežijo v nekaj sekundah.';
  }); }
  // Naloži seznam uporabnikov v izbirnik prejemnika + zgradi zemljevid imen.
  var _konzImena = {};
  async function naloziKonzUporabnike() {
    var r = await sb.from('profiles').select('id,full_name,email,active').order('full_name');
    var d = (r && r.data) ? r.data : [];
    _konzImena = {};
    d.forEach(function (u) { _konzImena[u.id] = u.full_name || u.email; });
    var sel = $('konzKomu');
    if (sel) {
      var cur = sel.value;
      sel.innerHTML = '<option value="">Vsi uporabniki</option>' + d.map(function (u) {
        return '<option value="' + escape_(u.id) + '">' + escape_(u.full_name || u.email) + (u.active === false ? ' (izklopljen)' : '') + '</option>';
      }).join('');
      sel.value = cur;
    }
  }
  // ── Konzola (samo lastnik): pisanje in pregled obvestil ──
  async function risiKonzola() {
    var list = $('konzList'); if (!list) return;
    try { await naloziKonzUporabnike(); } catch (e) {}
    list.innerHTML = '<div class="konz-txt">Nalagam …</div>';
    var r = await sb.from('obvestila').select('id,naslov,sporocilo,aktivno,created_at,prejemnik,tip').order('created_at', { ascending: false }).limit(50);
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,aktivno,created_at,prejemnik').order('created_at', { ascending: false }).limit(50); }
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,aktivno,created_at').order('created_at', { ascending: false }).limit(50); }
    if (!r || r.error) { list.innerHTML = '<div class="konz-txt">Napaka pri nalaganju.</div>'; return; }
    if (!r.data || !r.data.length) { list.innerHTML = '<div class="konz-txt">Ni še poslanih obvestil.</div>'; return; }
    list.innerHTML = r.data.map(function (o) {
      var dat = new Date(o.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      var komu = o.prejemnik ? ('za: ' + escape_(_konzImena[o.prejemnik] || 'uporabnika')) : 'vsem';
      var oblika = (o.tip === 'modal') ? ' · pojavno okno' : '';
      return '<div class="konz-row' + (o.aktivno ? '' : ' off') + '" data-id="' + o.id + '">' +
        '<div class="k-body">' + (o.naslov ? '<div class="konz-nas">' + escape_(o.naslov) + '</div>' : '') +
        '<div class="konz-txt">' + escape_(o.sporocilo || '') + '</div>' +
        '<div class="konz-meta">' + escape_(dat) + ' · ' + komu + oblika + (o.aktivno ? '' : ' · skrito') + '</div></div>' +
        '<div class="konz-acts">' +
        '<button type="button" class="btn-mini k-tog" data-id="' + o.id + '" data-ak="' + (o.aktivno ? '1' : '0') + '">' + (o.aktivno ? 'Skrij' : 'Prikaži') + '</button>' +
        '<button type="button" class="btn-mini danger k-del" data-id="' + o.id + '">Izbriši</button>' +
        '</div></div>';
    }).join('');
    list.querySelectorAll('.k-tog').forEach(function (b) { b.addEventListener('click', async function () {
      await sb.from('obvestila').update({ aktivno: b.dataset.ak !== '1' }).eq('id', b.dataset.id); risiKonzola();
    }); });
    list.querySelectorAll('.k-del').forEach(function (b) { b.addEventListener('click', async function () {
      await sb.from('obvestila').delete().eq('id', b.dataset.id); risiKonzola();
    }); });
  }
  { var _kf = $('konzForm'); if (_kf) _kf.addEventListener('submit', async function (e) {
    e.preventDefault();
    var m = $('konzMsg'), btn = $('konzBtn');
    var nas = $('konzNas').value.trim(), txt = $('konzTxt').value.trim();
    var komu = $('konzKomu') ? $('konzKomu').value : '';
    var tip = ($('konzTip') && $('konzTip').value === 'modal') ? 'modal' : 'toast';
    if (!txt) { m.className = 'msg bad show'; m.textContent = 'Vpiši sporočilo.'; return; }
    btn.disabled = true; btn.textContent = 'Pošiljam …';
    var base = { naslov: nas || null, sporocilo: txt, aktivno: true, prejemnik: komu || null };
    var tipManjka = false;
    var r = await sb.from('obvestila').insert(Object.assign({}, base, { tip: tip })).select('id,naslov,sporocilo,created_at,prejemnik,tip').single();
    if (r && r.error && /\btip\b/i.test(r.error.message || '')) {
      tipManjka = true;
      r = await sb.from('obvestila').insert(base).select('id,naslov,sporocilo,created_at,prejemnik').single();
    }
    if (r && r.error && /prejemnik/i.test(r.error.message || '')) {
      if (komu) { btn.disabled = false; btn.textContent = 'Pošlji'; m.className = 'msg bad show'; m.textContent = 'Za pošiljanje eni osebi najprej zaženi 26_obvestila_prejemnik.sql v Supabase.'; return; }
      r = await sb.from('obvestila').insert({ naslov: nas || null, sporocilo: txt, aktivno: true }).select('id,naslov,sporocilo,created_at').single();
    }
    btn.disabled = false; btn.textContent = 'Pošlji';
    if (r && r.error) { m.className = 'msg bad show'; m.textContent = 'Ni uspelo: ' + r.error.message; return; }
    $('konzNas').value = ''; $('konzTxt').value = ''; if ($('konzKomu')) $('konzKomu').value = ''; if ($('konzTip')) $('konzTip').value = 'toast';
    if (tipManjka && tip === 'modal') {
      m.className = 'msg bad show'; m.textContent = 'Poslano kot navadno obvestilo. Za pojavna okna najprej zaženi 30_obvestila_tip.sql v Supabase.';
    } else {
      m.className = 'msg show'; m.textContent = komu ? ('Obvestilo je poslano uporabniku ' + (_konzImena[komu] || '') + '.') : 'Obvestilo je poslano vsem uporabnikom.';
    }
    if (r && r.data) { if (tipManjka) r.data.tip = 'toast'; if (!r.data.prejemnik || r.data.prejemnik === JAZ) obvPrikazi(r.data); } // pokaži pošiljatelju le, če je zanj
    risiKonzola();
  }); }

  /* ══════════ POZIV ZA BIOMETRIJO OB PRVI PRIJAVI ══════════ */
  function morebitiPromoBio() {
    if (!bioPodprt() || !JAZ) return;
    if (bioVklopljen(JAZ)) return;
    var kljuc = 'sc-bioask-' + JAZ;
    try { if (localStorage.getItem(kljuc)) return; } catch (e) {}
    try { localStorage.setItem(kljuc, '1'); } catch (e) {}
    var el = $('bioPromo'); if (!el) return;
    setTimeout(function () { el.classList.remove('hidden'); }, 700);
  }
  function zapriPromoBio() { var el = $('bioPromo'); if (el) el.classList.add('hidden'); }
  { var _bpo = $('bioPromoOn'); if (_bpo) _bpo.addEventListener('click', async function () {
    var m = $('bioPromoMsg'); this.disabled = true; var t = this.textContent; this.innerHTML = '<span class="bio-pulse"></span>Potrjevanje …';
    try { await bioOmogoci(); if (m) { m.className = 'msg'; m.textContent = ''; } zapriPromoBio(); }
    catch (e) { if (m) { m.className = 'msg bad show'; m.textContent = _bioNapaka(e); } }
    this.disabled = false; this.textContent = t;
  }); }
  { var _bpl = $('bioPromoLater'); if (_bpl) _bpl.addEventListener('click', zapriPromoBio); }

  /* ══════════ RAZKRIJ GESLO (očesce na vseh poljih za geslo) ══════════ */
  var _OKO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var _OKO_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.1 6.1A13.3 13.3 0 0 0 2 12s3 8 10 8a9.3 9.3 0 0 0 5.9-2.1"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><path d="m3 3 18 18"/></svg>';
  function opremiGesla(koren) {
    (koren || document).querySelectorAll('input[type="password"]').forEach(function (inp) {
      if (inp._pwEye) return; inp._pwEye = true;
      var wrap = document.createElement('span'); wrap.className = 'pw-wrap';
      if (inp.parentNode) { inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp); }
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pw-eye';
      b.setAttribute('aria-label', 'Pokaži geslo'); b.title = 'Pokaži geslo'; b.tabIndex = -1;
      b.innerHTML = _OKO; wrap.appendChild(b);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var pokazi = inp.type === 'password';
        inp.type = pokazi ? 'text' : 'password';
        b.innerHTML = pokazi ? _OKO_OFF : _OKO;
        b.setAttribute('aria-label', pokazi ? 'Skrij geslo' : 'Pokaži geslo');
        b.title = pokazi ? 'Skrij geslo' : 'Pokaži geslo';
        try { inp.focus(); var n = inp.value.length; inp.setSelectionRange(n, n); } catch (_) {}
      });
    });
  }
  try { opremiGesla(document); } catch (e) {}

  /* ══════════ OBNOVITEV SEJE ══════════ */
  (async function () {
    if (!sb) return;
    let recovery = false;
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovery = true;
        $('profilePicker').classList.add('hidden');
        $('authBox').classList.remove('hidden');
        showAuthPane('newPwForm');
        document.querySelector('.auth-box .sub').textContent = 'Vpišite novo geslo za svoj račun.';
      }
      // Face ID: ob prijavi/osvežitvi posodobi žeton tega uporabnika, da ostane veljaven.
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) { try { bioOsveziZetone(session); } catch (e) {} }
    });
    // Takoj pokaži pravi zaslon (brez utripa napačnega). Če je to obnovitev gesla,
    // spodnji onAuthStateChange to prepiše na obrazec za novo geslo.
    if (!recovery) {
      // Živa seja (osvežitev strani / vrnitev v zavihek) → OSTANI prijavljen,
      // tako kot pri velikih ponudnikih. Odjava (gumb) sejo ukine → spodaj izbirnik.
      var _seja = null;
      try { var _rs = await sb.auth.getSession(); _seja = _rs && _rs.data && _rs.data.session; } catch (e) {}
      if (!recovery && _seja && _seja.user) {
        try { await start(); return; } catch (e) {}
      }
      if (!recovery) {
        if (beriProfile().length) pokaziIzbirnik();
        else pokaziPrijavo('');
      }
    }
    // Prijavni zaslon je pripravljen → umakni zagonski zaslon.
    try { if (window.scBootDone) window.scBootDone(); } catch (e) {}
  })();

  /* Šele tu vemo, da se je celotna skripta prevedla in izvedla. */
  if (window.__SC) window.__SC.ok = true;
})();

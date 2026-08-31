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
    box.innerHTML = '<div class="field"><label for="kUrl">Naslov projekta</label>' + '<input type="text" id="kUrl" value="' + (URL_ || '') + '" placeholder="https://….supabase.co"/></div>' + '<div class="field"><label for="kKey">Publishable key</label>' + '<input type="text" id="kKey" placeholder="sb_publishable_…"/></div>' + '<button type="button" class="btn" id="kSave">Shrani in nadaljuj</button>';
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
    // Če je Face ID omogočen, seje NE ukinemo — ob vrnitvi te biometrija spusti naravnost
    // noter (brez obnavljanja žetona). Sicer se popolnoma odjavimo (potrebno bo geslo).
    if (!bioVklopljen(JAZ)) { try { await sb.auth.signOut(); } catch (e) {} }
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
  var APP_VERZIJA = '4.16 · BETA';
  var NALAGANJE = '<div class="sc-load"><div class="sc-load-bar"></div></div>';
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
    ['domov', 'Pregled'], ['dokumenti', 'Dokumenti'], ['prisotnost', 'Prisotnost'], ['stranke', 'Stranke'],
    ['arhiv', 'Arhiv'], ['artikli', 'Cenik & Artikli'], ['fakture', 'Fakture'], ['uporabniki', 'Uporabniki'],
    ['statistika', 'Statistika'], ['aplikacija', 'Programska oprema'], ['katalog', 'Katalog']
  ];
  var ADMIN_VLOGE = ['super', 'admin', 'osebje', 'zaposleni', 'stranka'];
  var ADMIN_IMENA_PRIVZ = { super: 'Super admin', admin: 'Admin', osebje: 'Osebje', zaposleni: 'Zaposleni', stranka: 'Stranka' };
  // Privzete vidne pravice (r,w,x,d) — ujemajo se z obstajajočim obnašanjem.
  function _perm(r, w, x, d) { return { r: !!r, w: !!w, x: !!x, d: !!d }; }
  var ADMIN_PRIVZ = {
    super: { domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(1, 1, 1, 1), uporabniki: _perm(1, 1, 1, 1) },
    admin: { domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(1, 1, 1, 1), uporabniki: _perm(1, 1, 1, 1) },
    osebje: { domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) },
    zaposleni: { domov: _perm(1, 0, 0, 0), prisotnost: _perm(1, 0, 0, 1), arhiv: _perm(0, 0, 0, 0), katalog: _perm(0, 0, 0, 0), statistika: _perm(0, 0, 0, 0), artikli: _perm(0, 0, 0, 0), stranke: _perm(0, 0, 0, 0), dokumenti: _perm(0, 0, 0, 0), aplikacija: _perm(0, 0, 0, 0), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) },
    stranka: { domov: _perm(1, 0, 0, 0), prisotnost: _perm(0, 0, 0, 0), arhiv: _perm(1, 0, 0, 1), katalog: _perm(1, 0, 0, 0), statistika: _perm(0, 0, 0, 0), artikli: _perm(0, 0, 0, 0), stranke: _perm(0, 0, 0, 0), dokumenti: _perm(0, 0, 0, 0), aplikacija: _perm(0, 0, 0, 0), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) }
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
    try {
      var r = await sb.from('app_config').select('vrednost').eq('kljuc', 'role_config').maybeSingle();
      if (r && r.data && r.data.vrednost) { var o = JSON.parse(r.data.vrednost); if (o && typeof o === 'object') ROLE_CFG = o; }
    } catch (e) {}
  }
  // Dnevnik sprememb — zapiši dejanje (tiho; če tabele ni, se ne zgodi nič).
  function logDodaj(razdelek, akcija, opis) {
    try { sb.from('audit_log').insert({ razdelek: razdelek, akcija: akcija, opis: (opis || '').slice(0, 500), kdo_ime: JAZIME || JAZMAIL || 'osebje' }).then(function () {}, function () {}); } catch (e) {}
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
    VSEHLISTOV = 0,
    STAR_SET = new Set();   // note_id-ji, ki vsebujejo star zapis (postavka brez article_id)

  async function naloziOrge() {
    // skrij izbrisane stranke; če stolpca še ni, beri vse
    let r = await sb.from('orgs').select('id,name,legal_name,address,vat_id,sort_order').is('deleted_at', null).order('name');
    if (r.error) r = await sb.from('orgs').select('id,name,legal_name,address,vat_id').order('name');
    ORGSEZNAM = r.data || [];
    ORGSEZNAM.sort(function (a, b) {
      var sa = a.sort_order, sb2 = b.sort_order;
      if (sa != null && sb2 != null && sa !== sb2) return sa - sb2;
      if (sa != null && sb2 == null) return -1;
      if (sa == null && sb2 != null) return 1;
      return (a.name || '').localeCompare(b.name || '', 'sl');
    });
    ORGIME = {};
    ORGSEZNAM.forEach(o => { ORGIME[o.id] = o.name; });
    return ORGSEZNAM;
  }
  /* ── vlečenje za razvrščanje (miška + dotik), prek namenskega ročaja ── */
  function dndSort(container, itemSel, handleSel, onDrop) {
    if (!container) return;
    container.querySelectorAll(handleSel).forEach(function (handle) {
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
    zazeniCustomSelecte();
    try { pokaziObvestila(); } catch (e) {}
    try { narociObvestila(); } catch (e) {}
    try { preberiReload(); } catch (e) {}
    try { morebitiPromoBio(); } catch (e) {}
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
    admin: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9.5 12.2l1.8 1.8 3.4-3.6"/>'
  };
  const ikona = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IKONE[k] + '</svg>';
  // Osnovni (privzeti) glavni razdelki menija za trenutnega uporabnika.
  function glavniMeni() {
    // Lastnik: vedno vse (Admin ureja pravice ostalih, sebi jih ne more odvzeti).
    if (JE_LASTNIK()) {
      return [['domov', 'Pregled'], ['dokumenti', 'Dokumenti'], ['prisotnost', 'Prisotnost'], ['stranke', 'Stranke'],
        ['arhiv', 'Arhiv'], ['artikli', 'Cenik & Artikli'], ['fakture', 'Fakture'], ['uporabniki', 'Uporabniki'],
        ['statistika', 'Statistika'], ['konzola', 'Konzola'], ['aplikacija', 'Programska oprema']];
    }
    // Ostali: vidnost razdelkov po pravicah vloge (nastavljivo v Admin).
    var vl = mojaVloga(), out = [];
    ADMIN_RAZDELKI.forEach(function (s) { if (rolePerm(vl, s[0], 'r')) out.push(s); });
    if (!out.some(function (x) { return x[0] === 'domov'; })) out.unshift(['domov', 'Pregled']);
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
      '<div class="side-foot"><span class="side-ver">Različica ' + escape_(APP_VERZIJA) + '</span><a class="side-eflitte" href="https://eflitte.si" target="_blank" rel="noopener">Izdelava <b>Eflitte</b></a></div>';
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

  /* ══════════ USMERJANJE ══════════ */
  function pojdi(kam) {
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
    if (kam === 'admin') risiAdmin();
  }

  /* ══════════ PRISOTNOST (registracija delovnega časa) ══════════ */
  var ZAPOSLENI = null, PRISDOG = null, _prisDan = null, _prisMesec = false;
  var _prisView = 'dan', _prisOseba = null;   // pogled: 'dan' | 'mesec' | 'oseba'
  function dniVMesecu(kljuc7) { var l = kljuc7.split('-'); return new Date(+l[0], +l[1], 0).getDate(); }
  // Premik obdobja: v dnevnem pogledu ±1 dan, v mesečnem/osebnem ±1 mesec.
  function prisPremakni(delta) {
    if (!_prisDan) _prisDan = danes10();
    var d;
    if (_prisView === 'dan') { d = new Date(_prisDan + 'T00:00:00'); d.setDate(d.getDate() + delta); }
    else { var p = _prisDan.slice(0, 7).split('-'); d = new Date(+p[0], (+p[1] - 1) + delta, 1); }
    _prisDan = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    prisRender();
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

  async function naloziPrisotnost() {
    var e = await sb.from('employees').select('id,org_id,ime,card_token,active,created_at').order('ime');
    ZAPOSLENI = e.error ? [] : (e.data || []);
    var meja = new Date(Date.now() - 62 * 24 * 3600 * 1000).toISOString();
    var r = await vseVrstice(function (a, b) {
      return sb.from('att_events').select('id,employee_id,terminal_id,ts,type,source,potrjeno').gte('ts', meja).order('ts', { ascending: true }).range(a, b);
    });
    PRISDOG = (r && r.data) ? r.data : [];
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
  function prisIzvoz() {
    var mesecKljuc = _prisDan.slice(0, 7);
    var aktivni = (ZAPOSLENI || []).filter(function (z) { return z.active; });
    var B = function (t) { return { v: t, bold: true }; };      // glava
    var T = function (t) { return { v: t, s: 2 }; };            // krepko (skupaj)
    var dec = function (sek) { return Math.round(sek / 3600 * 100) / 100; };
    var mesecIme = _mesecLabel(mesecKljuc);
    var sheets = [];
    // 1) Povzetek — vse zaposlene skupaj
    var pov = [[{ v: 'Povzetek ur — ' + mesecIme, s: 2 }], [], [B('Zaposleni'), B('Dni'), B('Ure'), B('Ure (decimalno)')]];
    var skupSek = 0, skupDni = 0;
    aktivni.forEach(function (z) {
      var p = prisPovzetek(z.id, mesecKljuc);
      skupSek += p.sek; skupDni += p.dni;
      pov.push([z.ime, p.dni, trajanjeH(p.sek), { v: dec(p.sek) }]);
    });
    pov.push([]);
    pov.push([T('SKUPAJ'), T(skupDni), T(trajanjeH(skupSek)), { v: dec(skupSek), s: 2 }]);
    sheets.push({ name: 'Povzetek', rows: pov, freeze: false });
    // 2) Sheet za vsako zaposleno — dnevne ure
    aktivni.forEach(function (z) {
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
    box.innerHTML = NALAGANJE;
    try {
      await naloziPrisotnost();
      if (!Array.isArray(ZAPOSLENI)) ZAPOSLENI = [];
      if (!Array.isArray(PRISDOG)) PRISDOG = [];
      if (!_prisDan) _prisDan = danes10();
      prisRender();
      if (!_prisTimer) _prisTimer = setInterval(prisAuto, 12000);
    } catch (e) {
      box.innerHTML = '<div class="pris-card"><p class="u-sub">Napake pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>';
    }
  }
  function prisRender() {
    var box = $('prisList'); if (!box) return;
    var _sy = window.scrollY;
    // Zaposleni vidi SAMO svoje ure (oseben pregled, brez ostalih).
    if (JE_ZAPOSLENI()) { prisRenderMoje(box, _sy); return; }
    var aktivni = (ZAPOSLENI || []).filter(function (z) { return z.active; });
    // ── Blok 1: trenutno stanje ──
    var prisotnihN = 0;
    var stanjeVrst = aktivni.map(function (z) {
      var l = prisZadnji(z.id); var notri = !!(l && l.type === 'in');
      if (notri) prisotnihN++;
      return '<div class="pris-row"><span class="pris-nm">' + escape_(z.ime) + '</span>' +
        (notri ? '<span class="pris-badge in">prisoten · od ' + uraMin(l.ts) + '</span><button type="button" class="cgrp-btn ghost pris-odjavi" data-odjavi="' + z.id + '">Odjavi</button>' : '<span class="pris-badge out">odsoten</span>') + '</div>';
    }).join('') || '<p class="u-sub" style="padding:10px 2px">Ni aktivnih zaposlenih. Dodaj jih spodaj.</p>';
    var blok1 = '<div class="pris-card"><div class="pris-h"><h3 class="sec-h">Trenutno prisotni</h3>' +
      '<span class="pris-count">' + prisotnihN + ' / ' + aktivni.length + '</span></div>' + stanjeVrst + '</div>';

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
      var mVrst = aktivni.map(function (z) {
        var pov = prisPovzetek(z.id, kljuc);
        mSek += pov.sek; mDni += pov.dni;
        return '<tr><td>' + escape_(z.ime) + '</td><td class="pris-ure">' + pov.dni + '</td><td class="pris-ure">' + (pov.sek ? trajanjeH(pov.sek) : '—') + '</td></tr>';
      }).join('');
      telo = '<div class="pris-scroll"><table class="pris-tbl"><thead><tr><th>Zaposleni</th><th>Dni</th><th>Ur skupaj</th></tr></thead><tbody>' +
        (mVrst || '<tr><td colspan="3" class="u-sub">Ni podatkov.</td></tr>') + '</tbody>' +
        (mVrst ? '<tfoot><tr><td>Skupaj</td><td class="pris-ure">' + mDni + '</td><td class="pris-ure">' + (mSek ? trajanjeH(mSek) : '—') + '</td></tr></tfoot>' : '') +
        '</table></div>';
    } else {
      var dSek = 0;
      var dVrst = aktivni.map(function (z) {
        var c = prisChipiDan(z.id, kljuc);
        dSek += c.sek;
        return '<tr><td>' + escape_(z.ime) + '</td><td class="pris-pairs">' + c.html + '</td><td class="pris-ure">' + (c.sek ? trajanjeH(c.sek) : '—') + '</td>' +
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
        '</div>' +
        '<span class="pris-tabs"><button type="button" class="pris-tab' + (_prisView === 'dan' ? ' on' : '') + '" data-obd="dan">Dan</button>' +
        '<button type="button" class="pris-tab' + (_prisView === 'mesec' ? ' on' : '') + '" data-obd="mesec">Mesec</button>' +
        '<button type="button" class="pris-tab' + (_prisView === 'oseba' ? ' on' : '') + '" data-obd="oseba">Oseba</button></span>' +
      '</div>' +
      telo + '</div>';

    // ── Blok 3: zaposleni ──
    var zapVrst = (ZAPOSLENI || []).map(function (z) {
      return '<div class="pris-emp"><span class="pris-nm">' + escape_(z.ime) + (z.active ? '' : ' <span class="u-sub">(neaktiven)</span>') + '</span>' +
        '<span class="pris-emp-act">' +
        '<button type="button" class="cgrp-btn ghost" data-uredi="' + z.id + '">Uredi</button>' +
        '<button type="button" class="cgrp-btn ghost" data-karta="' + z.id + '">' + (z.card_token ? 'Nova kartica' : 'Dodeli kartico') + '</button>' +
        '<button type="button" class="cgrp-btn ghost" data-aktiv="' + z.id + '" data-v="' + (z.active ? '0' : '1') + '">' + (z.active ? 'Deaktiviraj' : 'Aktiviraj') + '</button>' +
        '<button type="button" class="cgrp-btn danger" data-izbrisi="' + z.id + '">Izbriši</button>' +
        '</span></div>';
    }).join('') || '<p class="u-sub" style="padding:10px 2px">Še ni zaposlenih.</p>';
    var blok3 = '<div class="pris-card"><h3 class="sec-h">Zaposleni</h3>' + zapVrst +
      '<div class="pris-add"><input type="text" class="pris-new" placeholder="Ime in priimek novega zaposlenega"><button type="button" class="cgrp-btn pris-add-btn">+ Dodaj</button></div></div>';

    box.innerHTML = blok1 + blok2 + blok3;

    var dat = $('prisDatum'); if (dat) dat.addEventListener('change', function () { var v = this.value || danes10(); if (v.length === 7) v += '-01'; _prisDan = v; prisRender(); });
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
    box.querySelectorAll('[data-izbrisi]').forEach(function (b) { b.addEventListener('click', function () { prisIzbrisi(b.dataset.izbrisi); }); });
    var nb = box.querySelector('.pris-add-btn'), ni = box.querySelector('.pris-new');
    if (nb && ni) { nb.addEventListener('click', function () { prisDodajZap(ni.value); }); ni.addEventListener('keydown', function (e) { if (e.key === 'Enter') prisDodajZap(ni.value); }); }
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
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
  async function prisIzbrisi(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var ok = await potrdiModal({ naslov: 'Izbriši zaposlenega', sporocilo: 'Res izbrišem „' + z.ime + '"? Izbrišejo se tudi vsi njegovi vpisi ur — tega ni mogoče razveljaviti. (Če želiš ohraniti zgodovino, raje uporabi Deaktiviraj.)', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var del = await sb.from('employees').delete().eq('id', empId);
    if (del.error) { toast('Napaka: ' + del.error.message); return; }
    toast('Zaposleni izbrisan.'); await risiPrisotnost();
  }
  async function prisDodeliKarto(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var ok = await potrdiModal({ naslov: 'Dodeli kartico', sporocilo: (z.card_token ? 'Ustvarim NOVO kartico za „' + z.ime + '"? Stara bo prenehala delovati.' : 'Ustvarim kartico za „' + z.ime + '"?'), potrdi: 'Ustvari', preklici: 'Prekliči' });
    if (!ok) return;
    var tok = novCardToken();
    var up = await sb.from('employees').update({ card_token: tok }).eq('id', empId);
    if (up.error) { toast('Napaka: ' + up.error.message); return; }
    await potrdiModal({ naslov: 'Žeton kartice — ' + z.ime, sporocilo: 'Ta žeton zapiši na kartico:\n\n' + tok, potrdi: 'V redu', preklici: 'Zapri' });
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
  // Ročni vnos cele izmene (prihod + odhod) naenkrat — glavni način, dokler kartični sistem ni v uporabi.
  function prisRocni(empId, danArg) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    var dan = (danArg && danArg.length === 10) ? danArg : ((_prisMesec || !_prisDan || _prisDan.length !== 10) ? danes10() : _prisDan);
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Ročni vnos ur — ' + escape_(z.ime) + '</h4>' +
      '<label class="pris-lab">Datum</label><input type="date" class="pris-r-dan sc-modal-input" value="' + dan + '">' +
      '<div class="pris-r-cas"><div><label class="pris-lab">Prihod</label><input type="time" class="pris-r-in sc-modal-input"></div>' +
      '<div><label class="pris-lab">Odhod <span class="u-sub">(neobvezno)</span></label><input type="time" class="pris-r-out sc-modal-input"></div></div>' +
      '<p class="u-sub" style="margin:8px 0 0">Če pustiš odhod prazen, se zabeleži samo prihod (npr. če zaposleni še dela).</p>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var d = back.querySelector('.pris-r-dan').value;
      var vin = back.querySelector('.pris-r-in').value;
      var vout = back.querySelector('.pris-r-out').value;
      if (!d || !vin) { toast('Vpiši datum in prihod.'); return; }
      if (vout && vout <= vin) { toast('Odhod mora biti za prihodom.'); return; }
      var rows = [{ org_id: z.org_id, employee_id: z.id, type: 'in', source: 'manual', ts: new Date(d + 'T' + vin).toISOString() }];
      if (vout) rows.push({ org_id: z.org_id, employee_id: z.id, type: 'out', source: 'manual', ts: new Date(d + 'T' + vout).toISOString() });
      var ins = await sb.from('att_events').insert(rows);
      if (ins.error) { toast('Napaka: ' + ins.error.message); return; }
      toast('Ročni vnos shranjen (' + (vout ? 'prihod + odhod' : 'samo prihod') + ').'); zapri(); await risiPrisotnost();
    });
  }

  /* ══════════ ARTIKLI (katalog po skupinah ID + teža + dodeljevanje) ══════════ */
  var _artOpen = {}, SKUPINE_IME = {};
  function artPrefix(koda) { var s = normId(koda); return /^[A-ZČŠŽ]{2}[0-9]{3}$/.test(s) ? s.slice(0, 2) : '—'; }
  function imeSkupine(pre) { return SKUPINE_IME[pre] || ('Skupina ' + pre); }
  async function naloziSkupineImena() {
    try { var r = await sb.from('article_groups').select('prefix,name'); if (!r.error) { SKUPINE_IME = {}; (r.data || []).forEach(function (x) { if (x.name) SKUPINE_IME[x.prefix] = x.name; }); } } catch (e) {}
  }
  function fmtTeza(t) { return (Math.round((t || 0) * 1000) / 1000).toLocaleString('sl-SI') + ' kg'; }
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
  async function nastaviSkupinoStranki(orgId, ciljneSifre) {
    ciljneSifre = ciljneSifre || [];
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
    }
    var brez = (CLANI || []).filter(function (a) { return a.org_id === orgId && a.cena_sifra == null && a.id != null; });
    for (var m = 0; m < brez.length; m++) { await sb.from('articles').delete().eq('id', brez[m].id); }
    if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra == null); });
  }
  async function risiArtikli() {
    var box = $('artList'); if (!box) return;
    box.innerHTML = NALAGANJE;
    try {
      await nalozicenik(true);
      await naloziClane(true);
      await naloziSkupineImena();
      artRender();
    } catch (e) { box.innerHTML = '<div class="pris-card"><p class="u-sub">Napaka pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>'; }
  }
  function artRender() {
    var box = $('artList'); if (!box) return;
    var _sy = window.scrollY;
    var grupe = artikliGrupe();
    var preSet = {}; Object.keys(grupe).forEach(function (k) { if (k !== '—') preSet[k] = 1; }); Object.keys(SKUPINE_IME).forEach(function (k) { preSet[k] = 1; });
    var prefs = Object.keys(preSet).sort();
    if (grupe['—']) prefs.push('—');
    var strPoGrupi = {}; (ORGSEZNAM || []).forEach(function (o) { var g = strankaSkupina(o.id); if (g) (strPoGrupi[g] = strPoGrupi[g] || []).push(o); });
    var topbar = '<div class="art-topbar"><button type="button" class="btn btn-narrow art-nova">+ Nov cenik</button><button type="button" class="btn btn-narrow ghost art-uskladi" title="Poskrbi, da ima vsaka stranka vse artikle svojega cenika">Uskladi artikle</button></div>';
    box.innerHTML = topbar + (prefs.length ? prefs.map(function (pre) {
      var arts = grupe[pre] || []; var open = !!_artOpen[pre]; var str = strPoGrupi[pre] || [];
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
    }).join('') : '<div class="pris-card"><p class="u-sub">Ni artiklov. Ustvari nov cenik z gumbom zgoraj.</p></div>');

    { var nb = box.querySelector('.art-nova'); if (nb) nb.addEventListener('click', function () { artNovCenik(); }); }
    { var ub = box.querySelector('.art-uskladi'); if (ub) ub.addEventListener('click', function () { artUskladiVse(); }); }
    box.querySelectorAll('[data-artgrp]').forEach(function (h) { h.addEventListener('click', function () { var k = h.dataset.artgrp; var willOpen = !_artOpen[k]; _artOpen = {}; if (willOpen) _artOpen[k] = true; artRender(); }); });
    box.querySelectorAll('[data-aedit]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artUredi(parseInt(b.dataset.aedit, 10)); }); });
    box.querySelectorAll('[data-adel]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artIzbrisi(parseInt(b.dataset.adel, 10)); }); });
    box.querySelectorAll('.art-dodeli').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artDodeli(b.dataset.pre); }); });
    box.querySelectorAll('.art-preime').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artPreimenujSkupino(b.dataset.pre); }); });
    box.querySelectorAll('.art-delskup').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artIzbrisiSkupino(b.dataset.pre); }); });
    box.querySelectorAll('.art-nn-btn').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artDodajNov(b.dataset.pre, b.closest('.art-add-new')); }); });
    box.querySelectorAll('[data-cpot]').forEach(function (cb) { cb.addEventListener('click', function (e) { e.stopPropagation(); }); cb.addEventListener('change', function (e) { e.stopPropagation(); artPotrdiCeno(parseInt(cb.dataset.cpot, 10), cb.checked); }); });
    box.querySelectorAll('.art-rows').forEach(function (rw) { dndSort(rw, '.art-row', '.art-grip', function () { artShraniVrstniRed(rw); }); });
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
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
    row.innerHTML = '<div class="art-edit-form"><input type="text" class="ae-nm" placeholder="Naziv artikla"><div class="art-edit-r">' +
      '<input type="text" class="ae-id" maxlength="5" placeholder="ID"><input type="text" inputmode="decimal" class="ae-cena" placeholder="cena €">' +
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
  function artNovCenik() {
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Nov cenik (skupina)</h4>' +
      '<label class="pris-lab">Ime cenika</label><input type="text" class="nc-ime sc-modal-input" placeholder="npr. Posteljnina">' +
      '<label class="pris-lab">Predpona ID <span class="u-sub">(2 črki, npr. PO)</span></label><input type="text" class="nc-pre sc-modal-input" maxlength="2" placeholder="PO" style="text-transform:uppercase;font-family:var(--mono)">' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Ustvari</button></div></div>';
    document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    setTimeout(function () { var el = back.querySelector('.nc-ime'); if (el) el.focus(); }, 60);
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var ime = back.querySelector('.nc-ime').value.trim();
      var pre = normId(back.querySelector('.nc-pre').value);
      if (!/^[A-ZČŠŽ]{2}$/.test(pre)) { toast('Predpona morata biti 2 črki (npr. PO).'); return; }
      var obst = {}; (CENIK || []).forEach(function (x) { obst[artPrefix(x.koda)] = 1; }); Object.keys(SKUPINE_IME).forEach(function (k) { obst[k] = 1; });
      if (obst[pre]) { toast('Predpona ' + pre + ' že obstaja.'); return; }
      var r = await sb.from('article_groups').upsert({ prefix: pre, name: ime || null, updated_at: new Date().toISOString() }, { onConflict: 'prefix' });
      if (r.error) { toast('Napaka: ' + r.error.message + (/relation|does not exist/i.test(r.error.message) ? ' (poženi migracijo 13_skupine.sql)' : '')); return; }
      if (ime) SKUPINE_IME[pre] = ime;
      _artOpen = {}; _artOpen[pre] = true; zapri(); toast('Cenik ustvarjen. Dodaj artikle.'); artRender();
    });
  }
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
    var rows = seznam.map(function (o) { var checked = strankaSkupina(o.id) === pre; return '<label class="art-chk"><input type="checkbox" data-org="' + o.id + '"' + (checked ? ' checked' : '') + '><span>' + escape_(o.name || '') + '</span></label>'; }).join('') || '<p class="u-sub">Ni strank.</p>';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Dodeli skupino ' + escape_(pre) + ' strankam</h4>' +
      '<p class="u-sub" style="margin:-6px 0 12px">Odkljukane stranke dobijo TE artikle — zamenja njihov cenik. Odkljukane, ki so bile v tej skupini, se izpraznijo.</p>' +
      '<div class="art-chk-list">' + rows + '</div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var checks = [].slice.call(back.querySelectorAll('.art-chk input'));
      zapri(); toast('Posodabljam cenike …');
      for (var i = 0; i < checks.length; i++) {
        var org = checks[i].dataset.org, wasP = strankaSkupina(org) === pre, isC = checks[i].checked;
        if (isC) await nastaviSkupinoStranki(org, sifre);        // uskladi (doda manjkajoče, popravi vrstni red)
        else if (wasP) await nastaviSkupinoStranki(org, []);     // odstrani skupino
      }
      toast('Stranke posodobljene.'); artRender();
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
  var _ucEur = {}, _ucEurTot = null, _ucEurKljuc = null, _ucEurLoading = false, _ucSort = 'kg_desc';
  var UC_PAL = ['#4e79a7', '#59a14f', '#f28e2b', '#e15759', '#b07aa1', '#76b7b2', '#edc948'];
  var _ucDonutRange = '3m', _uc3dAnim = false, _kgVseMap = null, _uc3dRAF = null, _ucDonutMonth = null;

  async function naloziUcinek() {
    var meja = danLocal(new Date(Date.now() - 400 * 24 * 3600 * 1000).getTime());
    var rl = await vseVrstice(function (a, b) { return sb.from('delivery_notes').select('id,org_id,doc_date,weight_kg').gte('doc_date', meja).order('doc_date', { ascending: true }).range(a, b); });
    UCEN_LISTI = (rl && rl.data) ? rl.data : [];
    var rd = await vseVrstice(function (a, b) { return sb.from('att_events').select('id,employee_id,ts,type').gte('ts', meja + 'T00:00:00Z').order('ts', { ascending: true }).range(a, b); });
    UCEN_DOG = (rd && rd.data) ? rd.data : [];
    // Vsota kg po strankah za VES čas (za 3D krog »Vse«).
    try {
      var rv = await vseVrstice(function (a, b) { return sb.from('delivery_notes').select('org_id,weight_kg').range(a, b); });
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
  function ucZadnjih7() {
    var out = []; var now = new Date();
    for (var i = 6; i >= 0; i--) { var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); out.push({ key: key, lab: ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.', kg: 0 }); }
    var idx = {}; out.forEach(function (o) { idx[o.key] = o; });
    (UCEN_LISTI || []).forEach(function (l) { var k = l.doc_date && l.doc_date.slice(0, 10); if (idx[k]) idx[k].kg += (parseFloat(l.weight_kg) || 0); });
    return out;
  }
  function ucMesecIme(mk) { var p = mk.split('-'); var mes = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december']; return (mes[parseInt(p[1], 10) - 1] || '') + ' ' + p[0]; }
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
    var segs = arr.slice(0, 7).map(function (x, i) { return { ime: x.ime, kg: x.kg, col: UC_PAL[i % UC_PAL.length] }; });
    var ostalo = arr.slice(7).reduce(function (s, x) { return s + x.kg; }, 0);
    if (ostalo > 0) segs.push({ ime: 'Ostalo', kg: ostalo, col: '#bab0ac' });
    return { segs: segs, total: total };
  }
  var _UC3D = { W: 580, H: 440, cx: 290, cy: 210, R: 116, r: 64, kyEnd: 0.62, depth: 32 };
  function _uc3dPt(rad, ang, ky, cx, cy) { return [cx + rad * Math.cos(ang), cy + rad * ky * Math.sin(ang)]; }
  function _f2(a) { return a[0].toFixed(1) + ' ' + a[1].toFixed(1); }
  function uc3dSvgBuild(segs, total, e) {
    var G = _UC3D, cx = G.cx, cy = G.cy, R = G.R, r = G.r;
    var ky = 1 - (1 - G.kyEnd) * e;                 // se »uleže« iz ploskega v 3D
    var depth = G.depth * e;                          // debelina zraste
    var spin = (1 - e) * 0.6;                          // rahel zavrtljaj ob koncu
    var scale = 0.92 + 0.08 * e;
    var labelA = Math.max(0, Math.min(1, (e - 0.62) / 0.38));
    // kumulativni koti (začnemo na vrhu, -PI/2)
    var start = -Math.PI / 2 + spin;
    var arr = [], a = start;
    segs.forEach(function (s) { var ang = s.kg / total * Math.PI * 2; arr.push({ s: s, a0: a, a1: a + ang, mid: a + ang / 2 }); a += ang; });
    function sector(a0, a1, dy, col) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var o0 = _uc3dPt(R, a0, ky, cx, cy + dy), o1 = _uc3dPt(R, a1, ky, cx, cy + dy);
      var i1 = _uc3dPt(r, a1, ky, cx, cy + dy), i0 = _uc3dPt(r, a0, ky, cx, cy + dy);
      return '<path d="M' + _f2(o0) + ' A' + R + ' ' + (R * ky).toFixed(1) + ' 0 ' + large + ' 1 ' + _f2(o1) +
        ' L' + _f2(i1) + ' A' + r + ' ' + (r * ky).toFixed(1) + ' 0 ' + large + ' 0 ' + _f2(i0) + ' Z" fill="' + col + '"/>';
    }
    function wall(a0, a1, col) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var o0 = _uc3dPt(R, a0, ky, cx, cy), o1 = _uc3dPt(R, a1, ky, cx, cy);
      var b1 = [o1[0], o1[1] + depth], b0 = [o0[0], o0[1] + depth];
      return '<path d="M' + _f2(o0) + ' A' + R + ' ' + (R * ky).toFixed(1) + ' 0 ' + large + ' 1 ' + _f2(o1) +
        ' L' + _f2(b1) + ' A' + R + ' ' + (R * ky).toFixed(1) + ' 0 ' + large + ' 0 ' + _f2(b0) + ' Z" fill="' + col + '"/>';
    }
    var back = '', front = '', tops = '';
    arr.forEach(function (o) {
      var w = wall(o.a0, o.a1, _mixHex(o.s.col, 0.6));
      if (Math.sin(o.mid) > 0) front += w; else back += w;
      tops += sector(o.a0, o.a1, 0, o.s.col);
    });
    // napisi na črtah (leader lines) — levo/desno, brez prekrivanja
    var labels = '';
    if (labelA > 0.01) {
      var right = [], left = [];
      arr.forEach(function (o) {
        var p = _uc3dPt(R, o.mid, ky, cx, cy);
        var e1 = _uc3dPt(R + 16, o.mid, ky, cx, cy);
        var desno = Math.cos(o.mid) >= 0;
        (desno ? right : left).push({ o: o, p: p, e1: e1, y: e1[1] });
      });
      function razporedi(list, xEdge, desno) {
        list.sort(function (a, b) { return a.y - b.y; });
        var minGap = 40, out = '';
        for (var i = 1; i < list.length; i++) if (list[i].y - list[i - 1].y < minGap) list[i].y = list[i - 1].y + minGap;
        // znotraj okvira
        var over = list.length ? (list[list.length - 1].y - (G.H - 20)) : 0;
        if (over > 0) list.forEach(function (it) { it.y -= over; });
        list.forEach(function (it) {
          var yy = Math.max(22, it.y);
          var pct = Math.round(it.o.s.kg / total * 100);
          var tx = desno ? xEdge : xEdge;
          out += '<polyline points="' + it.p[0].toFixed(1) + ',' + it.p[1].toFixed(1) + ' ' + it.e1[0].toFixed(1) + ',' + it.e1[1].toFixed(1) + ' ' + (desno ? (xEdge - 10) : (xEdge + 10)).toFixed(1) + ',' + yy.toFixed(1) + ' ' + tx.toFixed(1) + ',' + yy.toFixed(1) + '" fill="none" class="uc3d-lead"/>';
          out += '<circle cx="' + it.p[0].toFixed(1) + '" cy="' + it.p[1].toFixed(1) + '" r="2.4" fill="' + it.o.s.col + '"/>';
          out += '<text x="' + (desno ? (xEdge + 6) : (xEdge - 6)).toFixed(1) + '" y="' + (yy - 4).toFixed(1) + '" text-anchor="' + (desno ? 'start' : 'end') + '" class="uc3d-nm">' + escape_(it.o.s.ime) + '</text>';
          out += '<text x="' + (desno ? (xEdge + 6) : (xEdge - 6)).toFixed(1) + '" y="' + (yy + 11).toFixed(1) + '" text-anchor="' + (desno ? 'start' : 'end') + '" class="uc3d-pct">' + pct + ' %</text>';
        });
        return out;
      }
      labels = '<g style="opacity:' + labelA.toFixed(2) + '">' + razporedi(right, G.W - 96, true) + razporedi(left, 96, false) + '</g>';
    }
    var inner = '<g transform="translate(' + cx + ' ' + cy + ') scale(' + scale.toFixed(3) + ') translate(' + (-cx) + ' ' + (-cy) + ')" style="opacity:' + Math.min(1, e * 1.6).toFixed(2) + '">' + back + front + tops + '</g>' + labels;
    return inner;
  }
  function uc3dAnimate(svgEl, range, animate) {
    if (!svgEl) return;
    if (_uc3dRAF) { cancelAnimationFrame(_uc3dRAF); _uc3dRAF = null; }
    var d = ucDonutSegs(range);
    if (!d.total) { svgEl.innerHTML = '<text x="' + (_UC3D.W / 2) + '" y="' + (_UC3D.H / 2) + '" text-anchor="middle" class="uc3d-nm">Ni podatkov za izbrano obdobje.</text>'; return; }
    var reduce = false; try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
    if (!animate || reduce) { svgEl.innerHTML = uc3dSvgBuild(d.segs, d.total, 1); return; }
    var t0 = 0, dur = 1000;
    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      svgEl.innerHTML = uc3dSvgBuild(d.segs, d.total, easeOutCubic(p));
      if (p < 1) _uc3dRAF = requestAnimationFrame(frame); else _uc3dRAF = null;
    }
    _uc3dRAF = requestAnimationFrame(frame);
  }
  async function risiUcinek() {
    var box = $('ucList'); if (!box) return;
    box.innerHTML = NALAGANJE;
    try {
      await naloziUcinek();
      if (!_ucDan) _ucDan = danes10();
      _uc3dAnim = true;
      ucRender();
    } catch (e) { box.innerHTML = '<div class="uc-card"><p class="u-sub">Napaka pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>'; }
  }
  function ucRender() {
    var box = $('ucList'); if (!box) return;
    var _sy = window.scrollY;
    var mesecKljuc = _ucDan.slice(0, 7);
    var mapMon = ucKgPoStranki(mesecKljuc);
    var kgMon = Object.keys(mapMon).reduce(function (s, k) { return s + mapMon[k]; }, 0);
    var ureMon = ucUreSek(mesecKljuc) / 3600;
    var kgh = ureMon > 0 ? kgMon / ureMon : 0;
    var d7 = ucZadnjih7(); var naj = Math.max.apply(null, d7.map(function (o) { return o.kg; }).concat([1]));

    if (!_ucDonutMonth) _ucDonutMonth = danes10().slice(0, 7);
    var rangeLbl = _ucDonutRange === 'vse' ? 'ves čas' : (_ucDonutRange === 'mesec' ? ucMesecIme(_ucDonutMonth) : 'zadnji 3 meseci');
    var mesecInput = _ucDonutRange === 'mesec' ? '<input type="month" id="ucDonutMesec" class="uc-d3-month" value="' + escape_(_ucDonutMonth) + '">' : '';
    var cardDonut = '<div class="uc-card uc-donut3d-card">' +
      '<div class="uc-d3-head"><div><h3 class="sec-h">Delež kg po strankah</h3><p class="u-sub" style="margin:-2px 0 0">' + rangeLbl + '</p></div>' +
      '<div class="uc-d3-ctrl">' + mesecInput +
      '<span class="pris-tabs"><button type="button" class="pris-tab' + (_ucDonutRange === 'mesec' ? ' on' : '') + '" data-ucrange="mesec">Mesec</button>' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === '3m' ? ' on' : '') + '" data-ucrange="3m">3 meseci</button>' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === 'vse' ? ' on' : '') + '" data-ucrange="vse">Vse</button></span></div></div>' +
      '<div class="uc-d3-stage"><svg class="uc3d-svg" viewBox="-92 0 ' + (_UC3D.W + 184) + ' ' + _UC3D.H + '" preserveAspectRatio="xMidYMid meet"></svg></div></div>';
    var cardBars = '<div class="uc-card"><h3 class="sec-h">kg zadnjih 7 dni</h3><div class="bars-row" style="margin-top:14px">' +
      d7.map(function (o) { return '<div class="bars-col"><span class="bars-val">' + (o.kg ? Math.round(o.kg) : '') + '</span><div class="bars-bar" style="height:' + Math.round(o.kg / naj * 84) + 'px"></div><span class="bars-lab">' + o.lab + '</span></div>'; }).join('') + '</div></div>';
    var cardProd = '<div class="uc-card uc-stat"><h3 class="sec-h">Skupna učinkovitost</h3><div class="uc-big">' + (kgh ? fmtStevilo1(kgh) : '—') + ' <span>kg/uro</span></div>' +
      '<p class="u-sub">' + fmtKg(kgMon) + ' · ' + stevilo(Math.round(ureMon)) + ' delovnih ur · ' + ucMesecIme(mesecKljuc) + '</p></div>';
    var top = cardDonut + '<div class="uc-top uc-top2">' + cardBars + cardProd + '</div>';

    var kljuc = _ucMesec ? _ucDan.slice(0, 7) : _ucDan;
    var ekljuc = (_ucMesec ? 'M' : 'D') + kljuc;
    var evOd, evDo;
    if (_ucMesec) { evOd = kljuc + '-01'; evDo = kljuc + '-' + ('0' + dniVMesecu(kljuc)).slice(-2); }
    else { evOd = evDo = kljuc; }
    var eurReady = _ucEurKljuc === ekljuc;
    var eurMap = eurReady ? _ucEur : {};
    var mapK = ucKgPoStranki(kljuc);
    var arr = Object.keys(mapK).map(function (id) { return { ime: ORGIME[id] || '—', kg: mapK[id], eur: (eurMap[id] != null ? eurMap[id] : null) }; }).filter(function (x) { return x.kg > 0; });
    arr.sort(function (a, b) {
      if (_ucSort === 'kg_asc') return a.kg - b.kg;
      if (_ucSort === 'eur_asc' || _ucSort === 'eur_desc') { var ea = a.eur == null ? -1 : a.eur, eb = b.eur == null ? -1 : b.eur; return _ucSort === 'eur_asc' ? ea - eb : eb - ea; }
      return b.kg - a.kg;
    });
    var kgSkup = arr.reduce(function (s, x) { return s + x.kg; }, 0);
    function eurCela(v) { return !eurReady ? '<span class="u-sub">…</span>' : (v != null ? cenaFmt(v) : '<span class="u-sub">—</span>'); }
    var rows = arr.map(function (x) { return '<tr><td>' + escape_(x.ime) + '</td><td class="pris-ure">' + fmtKg(x.kg) + '</td><td class="pris-ure uc-eur">' + eurCela(x.eur) + '</td></tr>'; }).join('');
    var tbl = '<table class="pris-tbl"><thead><tr><th>Stranka</th><th>Kilaža</th><th>€/kg</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="3" class="u-sub">Ni podatkov.</td></tr>') + '</tbody>' +
      (rows ? '<tfoot><tr><td>Skupaj</td><td class="pris-ure">' + fmtKg(kgSkup) + '</td><td class="pris-ure uc-eur">' + eurCela(eurReady ? _ucEurTot : null) + '</td></tr></tfoot>' : '') + '</table>';
    var sortSel = '<select class="uc-sort" aria-label="Razvrsti">' +
      '<option value="kg_desc"' + (_ucSort === 'kg_desc' ? ' selected' : '') + '>Kilaža ↓</option>' +
      '<option value="kg_asc"' + (_ucSort === 'kg_asc' ? ' selected' : '') + '>Kilaža ↑</option>' +
      '<option value="eur_desc"' + (_ucSort === 'eur_desc' ? ' selected' : '') + '>€/kg ↓</option>' +
      '<option value="eur_asc"' + (_ucSort === 'eur_asc' ? ' selected' : '') + '>€/kg ↑</option></select>';
    var ev = '<div class="pris-card"><div class="pris-h"><h3 class="sec-h">Evidenca kg</h3>' +
      '<span class="pris-hbtns">' + sortSel + '<button type="button" class="cgrp-btn ghost uc-izvoz">Izvozi (Excel)</button>' +
      '<span class="pris-tabs"><button type="button" class="pris-tab' + (!_ucMesec ? ' on' : '') + '" data-ucobd="dan">Dan</button>' +
      '<button type="button" class="pris-tab' + (_ucMesec ? ' on' : '') + '" data-ucobd="mesec">Mesec</button></span></span></div>' +
      '<div class="pris-datum"><input type="' + (_ucMesec ? 'month' : 'date') + '" id="ucDatum" value="' + (_ucMesec ? _ucDan.slice(0, 7) : _ucDan) + '"></div>' + tbl + '</div>';

    box.innerHTML = top + ev;
    var _svg3d = box.querySelector('.uc3d-svg'); if (_svg3d) uc3dAnimate(_svg3d, _ucDonutRange, _uc3dAnim);
    _uc3dAnim = false;
    box.querySelectorAll('[data-ucrange]').forEach(function (b) { b.addEventListener('click', function () { if (_ucDonutRange === b.dataset.ucrange) return; _ucDonutRange = b.dataset.ucrange; _uc3dAnim = true; ucRender(); }); });
    var _dm = $('ucDonutMesec'); if (_dm) _dm.addEventListener('change', function () { if (!this.value) return; _ucDonutMonth = this.value; _uc3dAnim = true; ucRender(); });
    var dat = $('ucDatum'); if (dat) dat.addEventListener('change', function () { var v = this.value || danes10(); if (v.length === 7) v += '-01'; _ucDan = v; ucRender(); });
    box.querySelectorAll('[data-ucobd]').forEach(function (b) { b.addEventListener('click', function () { _ucMesec = (b.dataset.ucobd === 'mesec'); ucRender(); }); });
    var ib = box.querySelector('.uc-izvoz'); if (ib) ib.addEventListener('click', ucIzvoz);
    var _us = box.querySelector('.uc-sort'); if (_us) _us.addEventListener('change', function () { _ucSort = this.value; ucRender(); });
    if (!eurReady && !_ucEurLoading) ucNaloziPrihodek(evOd, evDo, ekljuc);
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  async function ucNaloziPrihodek(od, doo, ekljuc) {
    _ucEurLoading = true;
    var m = {}, tn = 0, tk = 0;
    try {
      var res = await fakZberi(od, doo, null);
      if (res && res.skupine) res.skupine.forEach(function (g) {
        if (g.kg > 0 && g.neto != null) m[g.org_id] = g.neto / g.kg;
        tn += g.neto || 0; tk += g.kg || 0;
      });
    } catch (e) {}
    _ucEur = m; _ucEurTot = tk > 0 ? tn / tk : null; _ucEurKljuc = ekljuc;
    _ucEurLoading = false;
    var box = $('ucList'), sec = $('sec-statistika');
    if (box && sec && !sec.classList.contains('hidden')) { _uc3dAnim = false; ucRender(); }
  }
  function ucIzvoz() {
    var kljuc = _ucMesec ? _ucDan.slice(0, 7) : _ucDan;
    var map = ucKgPoStranki(kljuc);
    var arr = Object.keys(map).map(function (id) { return { ime: ORGIME[id] || '—', kg: map[id] }; }).filter(function (x) { return x.kg > 0; }).sort(function (a, b) { return b.kg - a.kg; });
    var sep = ';', vrst = [['Stranka', 'Kilaža (kg)'].map(csvC).join(sep)], skup = 0;
    arr.forEach(function (x) { skup += x.kg; vrst.push([x.ime, (Math.round(x.kg * 10) / 10).toString().replace('.', ',')].map(csvC).join(sep)); });
    vrst.push(''); vrst.push(['SKUPAJ', (Math.round(skup * 10) / 10).toString().replace('.', ',')].map(csvC).join(sep));
    var blob = new Blob(['\ufeff' + vrst.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kilaza_' + kljuc + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('Izvoz pripravljen: kilaza_' + kljuc + '.csv');
  }

  /* ══════════ SPREMNI LISTI ══════════ */
  async function naloziListe() {
    const {
      data,
      error
    } = await sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport,potrjeno,legacy_id,opomba,opomba_avtor,opomba_at').order('doc_date', {
      ascending: false
    }).limit(1000);
    // Rezerva: če stolpci za opombo še niso dodani (SQL 25 še ni zagnan), naloži brez njih.
    if (error) {
      const _r = await sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport,potrjeno,legacy_id').order('doc_date', { ascending: false }).limit(1000);
      LISTI = (_r && !_r.error && _r.data) ? _r.data : [];
    } else {
      LISTI = data || [];
    }
    const {
      count
    } = await sb.from('delivery_notes').select('id', {
      count: 'exact',
      head: true
    });
    VSEHLISTOV = count || 0;
    // Zberi liste s starim zapisom (postavka brez povezave na artikel → article_id IS NULL)
    STAR_SET = new Set();
    if (OSEBJE) {
      try {
        const rs = await vseVrstice((od, do_) =>
          sb.from('delivery_note_items').select('note_id').is('article_id', null).range(od, do_));
        (rs && rs.data ? rs.data : []).forEach(r => { if (r && r.note_id) STAR_SET.add(r.note_id); });
      } catch (e) { STAR_SET = new Set(); }
    }
  }
  const prazniListi = kdo => '<div class="rows"><div class="empty"><h3>Spremnih listov še ni</h3><p>' + (kdo === 'osebje' ? 'Spremni listi nastajajo na tablici v pralnici. Ko jih bomo prenesli v bazo,<br>se bodo izpisali tukaj.' : 'Ko bomo prevzeli in vrnili perilo, se bo vsak prevzem izpisal tukaj.') + '</p></div></div>';

  /* ══════════ PREGLED ══════════ */
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
    const kartice = OSEBJE ? [['Ta mesec', fmtTona(kgMesec), ''], ['Skupaj', fmtTona(kgSkupaj), ''], ['Dostav ta mesec', stevilo(vMesecu.length), ''], ['Kosov opranih', stevilo(kosovSkupaj), '']] : [['Prevzemov', stevilo(VSEHLISTOV), 'skupaj'], ['Ta mesec', stevilo(vMesecu.length), stevilo(kosovMesec) + ' kosov'], ['Kosov skupaj', stevilo(kosovSkupaj), 'v vseh prevzemih'], ['Zadnji prevzem', zadnji ? datum(zadnji.doc_date) : '—', zadnji ? stevilo(zadnji.total_pieces) + ' kosov' : 'še ni podatkov']];
    $('statGrid').innerHTML = kartice.map(([l, n, s]) => `<div class="stat"><div class="stat-num">${escape_(n)}</div>
     <div class="stat-lab">${escape_(l)}</div><div class="stat-sub">${escape_(s)}</div></div>`).join('');

    /* zadnjih šest mesecev */
    if ($('domovStatus')) $('domovStatus').innerHTML = '';
    if (!LISTI.length) {
      $('mesecni').innerHTML = '';
      $('zadnji').innerHTML = prazniListi(OSEBJE ? 'osebje' : 'stranka');
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
  }

  /* ══════════ ARHIV ══════════ */
  function tabelaListov(vrstice, klikljivo) {
    if (!vrstice.length) return prazniListi(OSEBJE ? 'osebje' : 'stranka');
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
      ${chk}<span class="a-num">${escape_(l.number || '—')}</span>
      <span class="a-cli">${escape_(OSEBJE ? ORGIME[l.org_id] || '—' : l.issued_name || '')}</span>
      <span class="a-foot"><span class="num a-date">${datum(l.doc_date)}</span><span class="num a-qty">${stevilo(l.total_pieces)} kos</span></span>
      <span class="chev" aria-hidden="true">${klikljivo ? '›' : ''}</span>
    </button>
    <div class="a-det" id="det${i}"></div></div>`;
    }).join('') + '</div>';
  }
  function risiArhiv() {
    if (OSEBJE) {
      const sel = $('arhivOrg');
      sel.classList.remove('hidden');
      const _nb = $('arhivNovBtn'); if (_nb) _nb.classList.remove('hidden');
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
    document.querySelectorAll('#arhivList .a-row').forEach(b => {
      b.addEventListener('click', () => odpriList(b));
    });
    document.querySelectorAll('#arhivList .arh-chk.clk').forEach(c => {
      c.addEventListener('click', e => { e.stopPropagation(); potrdiList(c); });
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); potrdiList(c); } });
    });
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
  async function odpriList(btn) {
    const box = btn.nextElementSibling && btn.nextElementSibling.classList.contains('a-det') ? btn.nextElementSibling : $('det' + btn.dataset.i);
    const lcell = btn.closest('.lcell');
    const odprt = btn.getAttribute('aria-expanded') === 'true';
    if (odprt) {
      btn.setAttribute('aria-expanded', 'false');
      box.classList.remove('show'); if (lcell) lcell.classList.remove('open');
      return;
    }
    document.querySelectorAll('#arhivList .a-row[aria-expanded="true"]').forEach(o => {
      if (o !== btn) { o.setAttribute('aria-expanded', 'false'); const d = (o.nextElementSibling && o.nextElementSibling.classList.contains('a-det')) ? o.nextElementSibling : document.getElementById('det' + o.dataset.i); if (d) d.classList.remove('show'); const lc = o.closest('.lcell'); if (lc) lc.classList.remove('open'); }
    });
    btn.setAttribute('aria-expanded', 'true');
    box.classList.add('show'); if (lcell) lcell.classList.add('open');
    if (box.dataset.loaded) return;
    box.innerHTML = NALAGANJE;
    const {
      data,
      error
    } = await sb.from('delivery_note_items').select('article_name,pieces,sort_order').eq('note_id', btn.dataset.id).order('sort_order');
    if (error) {
      box.innerHTML = '<p class="u-sub">Napaka: ' + escape_(error.message) + '</p>';
      return;
    }
    box._id = btn.dataset.id;
    box._note = LISTI.find(l => l.id === btn.dataset.id) || {};
    box._items = (data || []).map(p => ({ naziv: p.article_name, kosov: p.pieces }));
    risiListDetajl(box);
    box.dataset.loaded = '1';
  }

  /* prikaz postavk + (samo osebje) gumbi Uredi / Izbriši */
  function risiListDetajl(box) {
    const items = box._items || [];
    const n = box._note || {};
    const seznam = items.length ? '<ul>' + items.map(p => `<li><span>${escape_(p.naziv)}</span><b>${stevilo(p.kosov)}</b></li>`).join('') + '</ul>' : '<p class="u-sub">Ta spremni list nima postavk.</p>';
    const prevozV = `<span class="prevoz-znak ${n.transport === 'izredni' ? 'izr' : 'red'}">${n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'}</span>`;
    const izdalV = `<p class="u-sub" style="margin-top:8px">${prevozV}${n.issued_name ? ' · Izdal: ' + escape_(n.issued_name) : ''}</p>`;
    const popravek = n.popravljeno_at ? `<p class="ur-popravek">✎ Popravljeno v portalu · ${escape_(n.popravil || 'osebje')} · ${datumcas(n.popravljeno_at)}</p>` : '';
    const ustvarjenoV = n.source === 'portal' ? `<p class="ur-ustvarjeno">✚ Ustvarjeno v portalu${n.issued_name ? ' · ' + escape_(n.issued_name) : ''}</p>` : '';
    const gumbi = '<div class="u-acts" style="margin-top:12px"><button type="button" data-natisni>Natisni</button>' +
      (OSEBJE ? '<button type="button" data-uredi>Uredi</button><button type="button" class="danger" data-izbrisi>Izbriši</button>' : '') + '</div>';
    box.innerHTML = seznam + izdalV + ustvarjenoV + popravek + opombaHtml(n) + gumbi;
    box.querySelector('[data-natisni]').addEventListener('click', () => natisniList(box));
    if (OSEBJE) {
      box.querySelector('[data-uredi]').addEventListener('click', () => urediList(box));
      box.querySelector('[data-izbrisi]').addEventListener('click', () => izbrisiList(box));
    }
    wireOpomba(box);
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
    var _ok = await potrdiModal({ naslov: 'Izbriši spremni list', sporocilo: 'Izbrisati spremni list ' + (box._note.number || '') + '? Tega ni mogoče razveljaviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!_ok) return;
    box.innerHTML = '<p class="u-sub">Brišem …</p>';
    try {
      let r = await sb.from('delivery_note_items').delete().eq('note_id', box._id);
      if (r.error) throw r.error;
      r = await sb.from('delivery_notes').delete().eq('id', box._id);
      if (r.error) throw r.error;
      logDodaj('Arhiv', 'Izbrisano', 'Spremni list ' + ((box._note && box._note.number) || ''));
      toast('Spremni list izbrisan');
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
    } catch (e) { box._arts = []; }
  }
  async function urediList(box) {
    const n = box._note;
    const st = razcleniStevilko(n.number);
    const dnes = n.doc_date || new Date().toISOString().slice(0, 10);
    const orgOpt = ORGSEZNAM.map(o => `<option value="${o.id}"${o.id === n.org_id ? ' selected' : ''}>${escape_(o.name)}</option>`).join('');
    box.innerHTML = `<div class="ur-form">
      <label class="ur-f"><span>Stranka</span><select data-org>${orgOpt}</select></label>
      <div class="ur-grid">
        <label class="ur-f"><span>Št.</span><input type="number" data-seq value="${st.seq}"></label>
        <label class="ur-f"><span>Leto</span><input type="number" data-leto value="${st.leto}"></label>
        <label class="ur-f"><span>Datum</span><input type="date" data-datum value="${escape_(dnes)}"></label>
        <label class="ur-f"><span>Teža (kg)</span><input type="number" step="0.1" data-teza value="${n.weight_kg != null ? n.weight_kg : ''}"></label>
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
    function napolniPn(sel, curName) {
      var arts = box._arts || [];
      var matched = arts.some(function (a) { return a.name === curName; });
      var opts = '';
      if (curName && !matched) opts += '<option value="' + escape_(curName) + '" data-aid="" selected>' + escape_(curName) + ' — star zapis</option>';
      opts += '<option value="">— izberi artikel —</option>';
      arts.forEach(function (a) {
        var lab = a.name + (a.koda ? ' · ' + a.koda : '');
        opts += '<option value="' + escape_(a.name) + '" data-aid="' + escape_(String(a.id || '')) + '" data-sifra="' + escape_(String(a.sifra != null ? a.sifra : '')) + '" data-teza="' + escape_(String(a.teza != null ? a.teza : '')) + '"' + (a.name === curName ? ' selected' : '') + '>' + escape_(lab) + '</option>';
      });
      sel.innerHTML = opts;
    }
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<select data-pn class="ur-pn"></select><input type="number" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      napolniPn(row.querySelector('[data-pn]'), naziv);
      row.querySelector('[data-del]').addEventListener('click', () => row.remove());
      pBox.appendChild(row);
    };
    (box._items || []).forEach(p => dodajVrstico(p.naziv, p.kosov));
    if (!(box._items || []).length) dodajVrstico();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => risiListDetajl(box));
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniList(box));
    wireSeg(box);
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', async () => { await nalozArtSez(box); box.querySelectorAll('.ur-post [data-pn]').forEach(function (sel) { napolniPn(sel, sel.value); }); osveziKgPrikaz(box); }); }
  }

  async function shraniList(box) {
    const q = s => box.querySelector(s);
    const msg = q('[data-msg]');
    const org_id = q('[data-org]').value;
    const seq = parseInt(q('[data-seq]').value, 10);
    const leto = parseInt(q('[data-leto]').value, 10);
    const doc_date = q('[data-datum]').value;
    const tezaRaw = q('[data-teza]').value;
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
    }).filter(p => p.naziv));
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
        weight_kg: tezaRaw === '' ? null : Number(tezaRaw),
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
      logDodaj('Arhiv', 'Urejeno', 'Spremni list ' + ((box._note && box._note.number) || ''));
      toast('Spremni list shranjen');
      await naloziListe();
      risiArhiv();
    } catch (e) {
      msg.textContent = 'Napaka: ' + (e.message || e);
    }
  }

  function spremniDocHtml(box) {
    const n = box._note || {};
    const items = box._items || [];
    const org = ORGSEZNAM.find(o => o.id === n.org_id) || {};
    const naziv = org.legal_name || org.name || ORGIME[n.org_id] || '—';
    const rows = items.length
      ? items.map(p => `<tr><td>${escape_(p.naziv)}</td><td class="q">${stevilo(p.kosov)}</td></tr>`).join('')
      : '<tr><td colspan="2" style="color:#888">Ni postavk</td></tr>';
    const izdal = n.issued_name ? ` &nbsp;·&nbsp; Izdal: ${escape_(n.issued_name)}` : '';
    const prevozP = ` &nbsp;·&nbsp; ${n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'}`;
    const kg = (n.weight_kg != null && n.weight_kg !== '') ? `<div class="t">Skupaj teža perila: <b>${String(n.weight_kg).replace('.', ',')} kg</b></div>` : '';
    const popr = n.popravljeno_at ? `<div class="popr">✎ Popravljeno v portalu · ${escape_(n.popravil || 'osebje')} · ${datumcas(n.popravljeno_at)}</div>` : '';
    const ustv = n.source === 'portal' ? `<div class="popr" style="background:#eaf4ee;color:#1f6b3b">✚ Ustvarjeno v portalu${n.issued_name ? ' · ' + escape_(n.issued_name) : ''}</div>` : '';
    const opombaP = n.opomba ? `<div class="opomba"><div class="oh">Opomba</div><div class="ob">${escape_(n.opomba)}</div><div class="oa">— ${escape_(n.opomba_avtor || 'osebje')}${n.opomba_at ? ' · ' + datumcas(n.opomba_at) : ''}</div></div>` : '';
    const html = `<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><title>Spremni list ${escape_(n.number || '')}</title><style>
      @page{size:A4;margin:14mm}
      @media screen{html{background:#e9edeb;margin:0}body{width:210mm;min-height:297mm;padding:14mm;margin:0 auto;background:#fff}}
      @media print{html{background:#fff}body{width:auto;min-height:0;padding:0;margin:0}}
      *{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#16202b}
      body{margin:0;font-size:13px}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a6644;padding-bottom:11px;margin-bottom:18px}
      .wm{height:30px;width:auto;display:block}.head{align-items:center}
      .biz{font-size:11px;text-align:right;color:#5c6873;line-height:1.5}
      .num{font-size:15px;margin:4px 0 14px}
      .client{display:flex;justify-content:space-between;border:1px solid #dce2e0;border-radius:8px;padding:12px 14px;margin-bottom:14px}
      .dates{color:#5c6873;margin-top:5px}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e6ebe9}
      th{background:#f2f5f4;text-transform:uppercase;font-size:11px;letter-spacing:.04em}
      td.q,th.q{text-align:right;font-variant-numeric:tabular-nums;width:120px}
      .t{margin-top:12px;font-size:14px}
      .popr{margin-top:18px;padding:9px 13px;border-radius:8px;background:#fdf3e8;color:#8a5a00;font-size:12px;font-weight:600}
      .opomba{margin-top:18px;padding:11px 14px;border:1px solid #dce2e0;border-radius:8px;background:#f7faf9;font-size:12.5px}
      .opomba .oh{text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:#5c6873;margin-bottom:4px}
      .opomba .ob{white-space:pre-wrap;line-height:1.5}
      .opomba .oa{margin-top:6px;color:#5c6873;font-size:11px}
      .sign{margin-top:30px;color:#5c6873}
    </style></head><body>
      <div class="head"><img class="wm" alt="SmartClean" src="${SC_LOGO}"><div class="biz">BSMART d.o.o.<br>Luče 87, 3334 Luče<br>+386 41 209 676</div></div>
      <div class="num">Št. spremnega lista: <b>${escape_(n.number || '—')}</b></div>
      <div class="client"><div><b>Naročnik storitve:</b> ${escape_(naziv)}<div class="dates">Oddaja: ${datum(n.doc_date)}${izdal}${prevozP}</div></div><div>Podpis: ______________</div></div>
      <table><thead><tr><th>Naziv artikla</th><th class="q">Kosov</th></tr></thead><tbody>${rows}</tbody></table>
      ${kg}${ustv}${popr}${opombaP}<div class="sign"></div>
    </body></html>`;
    return html;
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
    el.textContent = r.ima ? (Math.round(r.kg * 100) / 100).toString().replace('.', ',') + ' kg' : '—';
    el.dataset.kg = r.ima ? String(Math.round(r.kg * 1000) / 1000) : '';
  }
  async function novList() {
    const box = $('novListBox');
    if (!box) return;
    const letos = new Date().getFullYear();
    let maxSeq = 0;
    LISTI.forEach(l => { const d = String(l.number || '').split('/'); if ((parseInt(d[1], 10) || 0) === letos) { const sq = parseInt(d[0], 10) || 0; if (sq > maxSeq) maxSeq = sq; } });
    const dnes = new Date().toISOString().slice(0, 10);
    const orgOpt = '<option value="">— izberi stranko —</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    box.innerHTML = `<div class="ur-form">
      <h3 class="sec-h" style="margin-bottom:12px">Nov spremni list</h3>
      <label class="ur-f"><span>Stranka</span><select data-org>${orgOpt}</select></label>
      <div class="ur-grid">
        <label class="ur-f"><span>Št.</span><input type="number" data-seq value="${maxSeq + 1}"></label>
        <label class="ur-f"><span>Leto</span><input type="number" data-leto value="${letos}"></label>
        <label class="ur-f"><span>Datum</span><input type="date" data-datum value="${dnes}"></label>
        <label class="ur-f"><span>Teža (samodejno)</span><output class="ur-kg-auto" data-teza-auto>—</output></label>
      </div>
      <label class="ur-f"><span>Izdal</span><input type="text" data-izdal value="${escape_(JAZIME || '')}"></label>
      <div class="ur-f"><span>Vrsta prevoza</span>${segPrevoz('redni')}</div>
      <p class="u-sub" style="margin:10px 0 4px">Postavke — izberi artikel (z ID) iz kataloga stranke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj postavko</button>
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
        var lab = a.name + (a.koda ? ' · ' + a.koda : '');
        opts += '<option value="' + escape_(a.name) + '" data-aid="' + escape_(String(a.id || '')) + '" data-sifra="' + escape_(String(a.sifra != null ? a.sifra : '')) + '" data-teza="' + escape_(String(a.teza != null ? a.teza : '')) + '"' + (a.name === curName ? ' selected' : '') + '>' + escape_(lab) + '</option>';
      });
      sel.innerHTML = opts;
    }
    const osveziKg = () => osveziKgPrikaz(box);
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<select data-pn class="ur-pn"></select><input type="number" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      napolniPn(row.querySelector('[data-pn]'), naziv);
      row.querySelector('[data-del]').addEventListener('click', () => { row.remove(); osveziKg(); });
      row.querySelector('[data-pn]').addEventListener('change', osveziKg);
      row.querySelector('[data-pk]').addEventListener('input', osveziKg);
      pBox.appendChild(row);
      osveziKg();
    };
    dodajVrstico();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => { box.innerHTML = ''; box.classList.remove('show'); });
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniNovList(box));
    wireSeg(box);
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', async () => { await nalozArtSez(box); box.querySelectorAll('.ur-post [data-pn]').forEach(function (sel) { napolniPn(sel, sel.value); }); osveziKgPrikaz(box); }); }
    box.classList.add('show');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    }).filter(p => p.naziv));
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
        legacy_id: 'portal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
      }).select('id').single();
      if (error) throw error;
      if (postavke.length) {
        const rows = postavke.map((p, i) => ({ note_id: nova.id, article_name: p.naziv, article_id: p.artId || poImenu[p.naziv.toLowerCase()] || null, pieces: p.kosov, sort_order: i }));
        const r2 = await sb.from('delivery_note_items').insert(rows);
        if (r2.error) throw r2.error;
      }
      toast('Spremni list ustvarjen');
      box.innerHTML = ''; box.classList.remove('show');
      await naloziListe();
      risiArhiv();
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
      const z = new Date();
      const prvi = new Date(z.getFullYear(), z.getMonth(), 1);
      const pad = n => String(n).padStart(2, '0');
      const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      od.value = iso(prvi); doo.value = iso(z);
    }
    if (!risiFakture._wired) {
      $('fakBtn').addEventListener('click', () => nalozifakture());
      var _fx = $('fakXlsxBtn'); if (_fx) _fx.addEventListener('click', () => fakIzvozModal('xlsx'));
      var _fp = $('fakPdfBtn'); if (_fp) _fp.addEventListener('click', () => fakIzvozModal('pdf'));
      risiFakture._wired = true;
    }
    risiHitreMesece();
    nalozifakture();
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
      $('fakOd').value = b.dataset.od; $('fakDo').value = b.dataset.do; nalozifakture();
    }));
  }
  // Zberi in izračunaj skupine po strankah za obdobje (orgIds: null/[] = vse, sicer seznam ID-jev).
  async function fakZberi(od, doo, orgIds) {
    let q = sb.from('delivery_notes')
      .select('id,number,doc_date,weight_kg,total_pieces,org_id,transport,delivery_note_items(article_name,pieces)')
      .gte('doc_date', od).lte('doc_date', doo).order('doc_date', { ascending: true }).limit(5000);
    if (orgIds && orgIds.length === 1) q = q.eq('org_id', orgIds[0]);
    else if (orgIds && orgIds.length) q = q.in('org_id', orgIds);
    const { data, error } = await q;
    if (error) return { error: error };
    const notes = data || [];
    const poOrg = {};
    notes.forEach(n => {
      const oid = n.org_id || '—';
      if (!poOrg[oid]) poOrg[oid] = { org_id: oid, listov: 0, kg: 0, kosov: 0, redni: 0, izredni: 0, artikli: {} };
      const g = poOrg[oid];
      g.listov++;
      if (n.transport === 'izredni') g.izredni++; else g.redni++;
      g.kg += parseFloat(n.weight_kg) || 0;
      g.kosov += n.total_pieces || 0;
      (n.delivery_note_items || []).forEach(it => {
        const ime = (it.article_name || '—').trim() || '—';
        g.artikli[ime] = (g.artikli[ime] || 0) + (it.pieces || 0);
      });
    });
    const skupine = Object.values(poOrg).sort((a, b) => (ORGIME[a.org_id] || '').localeCompare(ORGIME[b.org_id] || '', 'sl', { sensitivity: 'base' }));
    // ── cene: poveži postavke s cenikom (prek povezave artikel → cenik) ──
    await nalozicenik();
    const artmap = await naloziArtMap(orgIds && orgIds.length === 1 ? orgIds[0] : null);
    const cenikOn = !!(CENIK && CENIK.length);
    skupine.forEach(g => {
      g.postavke = Object.entries(g.artikli).map(([nm, q]) => {
        const s = artmap[g.org_id + '|' + nm.trim().toLowerCase()];
        const cena = cenaZaArtikel(s);
        return { nm, q, cena, znesek: cena != null ? Math.round(cena * q * 100) / 100 : null };
      }).sort((a, b) => a.nm.localeCompare(b.nm, 'sl', { sensitivity: 'base' }));
      g.cenikOn = cenikOn;
      g.neto = Math.round(g.postavke.reduce((sm, p) => sm + (p.znesek || 0), 0) * 100) / 100;
      g.brezCene = g.postavke.filter(p => p.cena == null).length;
      g.ddv = Math.round(g.neto * DDV_STOPNJA * 100) / 100;
      g.bruto = Math.round((g.neto + g.ddv) * 100) / 100;
    });
    return { skupine: skupine };
  }
  async function nalozifakture() {
    const list = $('fakList');
    const od = $('fakOd').value, doo = $('fakDo').value, orgFilter = $('fakOrg').value;
    if (!fakDatumOK(od, doo)) { list.innerHTML = '<div class="panel"><p class="u-sub">Izberi veljavno obdobje (od ≤ do).</p></div>'; return; }
    list.innerHTML = NALAGANJE;
    const res = await fakZberi(od, doo, orgFilter ? [orgFilter] : null);
    if (res.error) { list.innerHTML = '<div class="panel"><p class="u-sub">Napaka: ' + escape_(res.error.message) + '</p></div>'; return; }
    const skupine = res.skupine;
    FAK_ZADNJI = { od, doo, skupine };
    $('fakPod').textContent = skupine.length ? '' : 'V izbranem obdobju ni spremnih listov';
    if (!skupine.length) { list.innerHTML = '<div class="panel"><p class="u-sub">V izbranem obdobju ni spremnih listov.</p></div>'; return; }
    list.innerHTML = '<div class="fak-grid">' + skupine.map((g, gi) => fakKartica(g, gi)).join('') + '</div>';
    list.querySelectorAll('[data-fakprint]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); natisniFakturo(parseInt(b.dataset.fakprint, 10)); }));
    list.querySelectorAll('[data-faktoggle]').forEach(h => h.addEventListener('click', () => {
      const gi = h.dataset.faktoggle, body = document.getElementById('fakbody' + gi);
      const willOpen = !h.classList.contains('open');
      list.querySelectorAll('[data-faktoggle].open').forEach(o => {
        o.classList.remove('open');
        const oc = o.closest('.fak-card'); if (oc) oc.classList.remove('open');
        const b = document.getElementById('fakbody' + o.dataset.faktoggle);
        if (b) b.classList.remove('show');
      });
      h.classList.toggle('open', willOpen);
      const card = h.closest('.fak-card'); if (card) card.classList.toggle('open', willOpen);
      if (body) body.classList.toggle('show', willOpen);
    }));
  }
  function fakKg(kg) { return kg ? (Math.round(kg * 100) / 100).toLocaleString('sl-SI') + ' kg' : '—'; }
  function fakKartica(g, gi) {
    const ime = ORGIME[g.org_id] || 'Brez stranke';
    const post = g.postavke || Object.entries(g.artikli).map(([nm, q]) => ({ nm, q, cena: null, znesek: null }));
    const money = !!g.cenikOn;
    const rows = post.length ? post.map(p =>
      `<div class="fak-line"><span class="fak-l-nm">${escape_(p.nm)}</span>` +
      (money ? `<span class="fak-l-c">${p.cena != null ? cenaFmt(p.cena) : '—'}</span>` : '') +
      `<b class="fak-l-q">${stevilo(p.q)}</b>` +
      (money ? `<b class="fak-l-z">${p.znesek != null ? cenaFmt(p.znesek) : '—'}</b>` : '') +
      `</div>`).join('') : '<div class="fak-line fak-line-empty"><span class="u-sub">Brez postavk</span></div>';
    const prevoz = `<div class="fak-tot-r"><span>Prevozi</span><b>${stevilo(g.redni)} redni${g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni' : ''}</b></div>`;
    const head = money
      ? `<div class="fak-head fak-head-m"><span>Artikel</span><span>Cena</span><span>Kol.</span><span>Znesek</span></div>`
      : `<div class="fak-head"><span>Artikel</span><span>Količina</span></div>`;
    const denar = money ? `
            <div class="fak-tot-r"><span>Neto skupaj</span><b>${cenaFmt(g.neto)}</b></div>
            <div class="fak-tot-r"><span>DDV (22 %)</span><b>${cenaFmt(g.ddv)}</b></div>
            <div class="fak-tot-r fak-tot-bruto"><span>Za plačilo (z DDV)</span><b>${cenaFmt(g.bruto)}</b></div>
            ${g.brezCene ? `<div class="fak-tot-r"><span class="fak-warn">${stevilo(g.brezCene)} artiklov brez cene — poveži jih v Strankah</span><b></b></div>` : ''}` : '';
    const povzetek = money && g.neto ? ` · <b>${cenaFmt(g.bruto)}</b> z DDV` : '';
    return `<div class="fak-card">
      <div class="fak-card-h" data-faktoggle="${gi}">
        <div class="fak-card-info"><h3>${escape_(ime)}</h3><p class="u-sub">${stevilo(g.listov)} spremnih listov · ${stevilo(g.kosov)} kosov · ${fakKg(g.kg)}${g.izredni ? ' · ' + stevilo(g.izredni) + '× izredni prevoz' : ''}${povzetek}</p></div>
        <span class="fak-chev" aria-hidden="true">›</span>
      </div>
      <div class="fak-body" id="fakbody${gi}">
        <div class="fak-inner">
          ${head}
          <div class="fak-lines${money ? ' fak-lines-m' : ''}">${rows}</div>
          <div class="fak-tot">
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
  // HTML za eno stran »osnove za račun« (ena stranka).
  function fakStranHtml(g, od, doo) {
    const org = ORGSEZNAM.find(o => o.id === g.org_id) || {};
    const naziv = org.legal_name || org.name || ORGIME[g.org_id] || '—';
    const naslov = [org.address, org.vat_id ? 'ID za DDV: ' + org.vat_id : ''].filter(Boolean).join(' · ');
    const money = !!g.cenikOn;
    const post = g.postavke || Object.entries(g.artikli).map(([nm, q]) => ({ nm, q, cena: null, znesek: null }));
    const kolonc = money ? 4 : 2;
    const rows = post.length ? post.map(p => money
      ? `<tr><td>${escape_(p.nm)}</td><td class="q">${p.cena != null ? cenaFmt(p.cena) : '—'}</td><td class="q">${stevilo(p.q)}</td><td class="q">${p.znesek != null ? cenaFmt(p.znesek) : '—'}</td></tr>`
      : `<tr><td>${escape_(p.nm)}</td><td class="q">${stevilo(p.q)}</td></tr>`).join('') : `<tr><td colspan="${kolonc}" style="color:#888">Ni postavk</td></tr>`;
    return `<div class="stran">
      <div class="head"><img class="wm" alt="SmartClean" src="${SC_LOGO}"><div class="biz">BSMART d.o.o.<br>Luče 87, 3334 Luče<br>+386 41 209 676</div></div>
      <div class="num"><b>Osnova za račun</b></div>
      <div class="client"><b>Naročnik storitve:</b> ${escape_(naziv)}${naslov ? '<br>' + escape_(naslov) : ''}<div class="dates">Obdobje: ${datum(od)} – ${datum(doo)} · ${stevilo(g.listov)} spremnih listov · ${stevilo(g.redni)} redni${g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni prevoz' : ''}</div></div>
      <table><thead>${money
        ? '<tr><th>Naziv artikla</th><th class="q">Cena/kos</th><th class="q">Količina</th><th class="q">Znesek</th></tr>'
        : '<tr><th>Naziv artikla</th><th class="q">Količina (kos)</th></tr>'}</thead><tbody>${rows}</tbody>
        <tfoot>${money ? `
          <tr><td colspan="3">Skupaj kosov</td><td class="q">${stevilo(g.kosov)}</td></tr>
          <tr><td colspan="3">Neto skupaj</td><td class="q">${cenaFmt(g.neto)}</td></tr>
          <tr><td colspan="3">DDV (22 %)</td><td class="q">${cenaFmt(g.ddv)}</td></tr>
          <tr class="bruto"><td colspan="3">Za plačilo (z DDV)</td><td class="q">${cenaFmt(g.bruto)}</td></tr>`
        : `<tr><td>Skupaj kosov</td><td class="q">${stevilo(g.kosov)}</td></tr><tr><td>Skupaj teža perila</td><td class="q">${fakKg(g.kg)}</td></tr>`}</tfoot></table>
      ${money && g.brezCene ? `<div class="sign">Opomba: ${stevilo(g.brezCene)} artiklov še nima cene (poveži jih v razdelku Stranke). Ti niso vključeni v znesek.</div>` : ''}
    </div>`;
  }
  // Cel dokument (ena ali več strank, vsaka na svojo stran).
  function fakDokumentHtml(skupine, od, doo, naslovDok) {
    const strani = skupine.map(g => fakStranHtml(g, od, doo)).join('');
    return `<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><title>${escape_(naslovDok || 'Osnova za račun')}</title><style>
      @page{size:A4;margin:14mm}
      @media screen{html{background:#e9edeb;margin:0}body{width:210mm;min-height:297mm;padding:14mm;margin:0 auto;background:#fff}}
      @media print{html{background:#fff}body{width:auto;min-height:0;padding:0;margin:0}}
      *{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#16202b}
      body{margin:0;font-size:13px}
      .stran{page-break-after:always}
      .stran:last-child{page-break-after:auto}
      .head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a6644;padding-bottom:11px;margin-bottom:18px}
      .wm{height:30px;width:auto;display:block}
      .biz{font-size:11px;text-align:right;color:#5c6873;line-height:1.5}
      .num{font-size:15px;margin:4px 0 6px}
      .client{border:1px solid #dce2e0;border-radius:8px;padding:12px 14px;margin:12px 0 14px}
      .dates{color:#5c6873;margin-top:5px}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e6ebe9}
      th{background:#f2f5f4;text-transform:uppercase;font-size:11px;letter-spacing:.04em}
      td.q,th.q{text-align:right;font-variant-numeric:tabular-nums;width:120px}
      tfoot td{font-weight:700;border-top:1px solid #e6ebe9}
      tfoot tr.bruto td{border-top:2px solid #1a6644;font-size:14px}
      .sign{margin-top:22px;color:#5c6873;font-size:11px}
    </style></head><body>${strani}</body></html>`;
  }
  function natisniDokument(html) {
    const w = window.open('', '_blank');
    if (!w) { toast('Za tiskanje dovoli pojavna okna.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 350);
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
  var _PDF = { INK: [0.086, 0.125, 0.169], GREY: [0.36, 0.41, 0.45], LINE: [0.902, 0.922, 0.914], HEAD: [0.949, 0.961, 0.953], GREEN: [0.102, 0.4, 0.267] };
  var _scLogoP = null;
  function scLogo() {
    if (_scLogoP) return _scLogoP;
    _scLogoP = (typeof PDFDoc !== 'undefined' && PDFDoc.imageToJpeg) ? PDFDoc.imageToJpeg(SC_LOGO, 260).catch(function () { return null; }) : Promise.resolve(null);
    return _scLogoP;
  }
  function _pdfGlava(doc, logo, M) {
    var right = doc.W - M, y = 50;
    if (logo && logo.w) { var lh = 26, lw = lh * logo.w / logo.h; doc.image(logo.bytes, M, y - 14, lw, lh, logo.w, logo.h); }
    doc.text(right, y - 6, 'BSMART d.o.o.', { size: 9, align: 'right', color: _PDF.GREY });
    doc.text(right, y + 5, 'Luče 87, 3334 Luče', { size: 9, align: 'right', color: _PDF.GREY });
    doc.text(right, y + 16, '+386 41 209 676', { size: 9, align: 'right', color: _PDF.GREY });
    y += 26; doc.line(M, y, right, y, { width: 1.4, color: _PDF.GREEN });
    return y + 24;
  }
  // Osnova za račun (fakture) → prava .pdf datoteka.
  async function fakPdfDownload(skupine, od, doo) {
    var logo = await scLogo();
    var doc = new PDFDoc();
    var M = 44, right = doc.W - M, obd = datum(od) + ' – ' + datum(doo);
    skupine.forEach(function (g) {
      doc.addPage();
      var y = _pdfGlava(doc, logo, M);
      doc.text(M, y, 'Osnova za račun', { size: 13, bold: true, color: _PDF.INK }); y += 20;
      var org = ORGSEZNAM.find(function (o) { return o.id === g.org_id; }) || {};
      var naziv = org.legal_name || org.name || ORGIME[g.org_id] || '—';
      var naslov = [org.address, org.vat_id ? 'ID za DDV: ' + org.vat_id : ''].filter(Boolean).join(' · ');
      var boxH = naslov ? 58 : 44;
      doc.rect(M, y, right - M, boxH, { stroke: _PDF.LINE, width: 0.8 });
      var yy = y + 17;
      doc.text(M + 12, yy, 'Naročnik storitve: ' + naziv, { size: 10.5, bold: true, color: _PDF.INK }); yy += 14;
      if (naslov) { doc.text(M + 12, yy, naslov, { size: 9, color: _PDF.GREY }); yy += 13; }
      doc.text(M + 12, yy, 'Obdobje: ' + obd + ' · ' + stevilo(g.listov) + ' spremnih listov · ' + stevilo(g.redni) + ' redni' + (g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni prevoz' : ''), { size: 9, color: _PDF.GREY });
      y += boxH + 20;
      var money = !!g.cenikOn;
      var cZ = right, cK = right - 92, cC = right - 188, artL = M + 6;
      function glava() {
        doc.rect(M, y, right - M, 20, { fill: _PDF.HEAD });
        doc.text(artL, y + 13.5, 'Naziv artikla', { size: 8.5, bold: true, color: _PDF.INK });
        if (money) {
          doc.text(cC, y + 13.5, 'Cena/kos', { size: 8.5, bold: true, align: 'right', color: _PDF.INK });
          doc.text(cK, y + 13.5, 'Količina', { size: 8.5, bold: true, align: 'right', color: _PDF.INK });
          doc.text(cZ, y + 13.5, 'Znesek', { size: 8.5, bold: true, align: 'right', color: _PDF.INK });
        } else doc.text(cZ, y + 13.5, 'Količina (kos)', { size: 8.5, bold: true, align: 'right', color: _PDF.INK });
        y += 20;
      }
      function novaStran() { doc.addPage(); y = _pdfGlava(doc, logo, M); doc.text(M, y, 'Osnova za račun — nadaljevanje', { size: 11, bold: true, color: _PDF.INK }); y += 18; glava(); }
      glava();
      var post = g.postavke || [];
      if (!post.length) { doc.text(artL, y + 13, 'Ni postavk', { size: 10, color: _PDF.GREY }); y += 20; }
      post.forEach(function (p) {
        if (y + 18 > doc.H - 120) novaStran();
        doc.text(artL, y + 13, p.nm, { size: 9.5, color: _PDF.INK });
        if (money) {
          doc.text(cC, y + 13, p.cena != null ? cenaFmt(p.cena) : '—', { size: 9.5, align: 'right', color: _PDF.INK });
          doc.text(cK, y + 13, stevilo(p.q), { size: 9.5, align: 'right', color: _PDF.INK });
          doc.text(cZ, y + 13, p.znesek != null ? cenaFmt(p.znesek) : '—', { size: 9.5, align: 'right', color: _PDF.INK });
        } else doc.text(cZ, y + 13, stevilo(p.q), { size: 9.5, align: 'right', color: _PDF.INK });
        y += 18; doc.line(M, y, right, y, { width: 0.6, color: _PDF.LINE });
      });
      // seštevki
      y += 12;
      function vrsticaSk(labela, vred, krepko, velik) {
        doc.text(M + 6, y, labela, { size: velik ? 11 : 9.5, bold: true, color: _PDF.INK });
        doc.text(cZ, y, vred, { size: velik ? 11 : 9.5, bold: !!krepko, color: _PDF.INK, align: 'right' });
        y += velik ? 18 : 15;
      }
      if (money) {
        vrsticaSk('Skupaj kosov', stevilo(g.kosov), true);
        vrsticaSk('Teža perila', fakKg(g.kg), false);
        vrsticaSk('Neto skupaj', cenaFmt(g.neto), true);
        vrsticaSk('DDV (22 %)', cenaFmt(g.ddv), true);
        y += 4; doc.line(M, y, right, y, { width: 1.4, color: _PDF.GREEN }); y += 15;
        vrsticaSk('Za plačilo (z DDV)', cenaFmt(g.bruto), true, true);
        if (g.brezCene) doc.text(M, y + 6, stevilo(g.brezCene) + ' artiklov brez cene (niso všteti) — poveži jih v Strankah.', { size: 8.5, color: _PDF.GREY });
      } else {
        vrsticaSk('Skupaj kosov', stevilo(g.kosov), true);
        vrsticaSk('Teža perila', fakKg(g.kg), true);
      }
    });
    doc.save('fakture_' + od + '_' + doo + '.pdf');
  }
  // Spremni list → prava .pdf datoteka (enak izpis kot v aplikaciji).
  async function spremniPdfDownload(box) {
    var logo = await scLogo();
    var n = box._note || {}, items = box._items || [];
    var org = ORGSEZNAM.find(function (o) { return o.id === n.org_id; }) || {};
    var naziv = org.legal_name || org.name || ORGIME[n.org_id] || '—';
    var doc = new PDFDoc();
    var M = 44, right = doc.W - M;
    doc.addPage();
    var y = _pdfGlava(doc, logo, M);
    doc.text(M, y, 'Št. spremnega lista: ' + (n.number || '—'), { size: 12, bold: true, color: _PDF.INK }); y += 20;
    var boxH = 46;
    doc.rect(M, y, right - M, boxH, { stroke: _PDF.LINE, width: 0.8 });
    doc.text(M + 12, y + 17, 'Naročnik storitve: ' + naziv, { size: 10.5, bold: true, color: _PDF.INK });
    doc.text(M + 12, y + 31, 'Oddaja: ' + datum(n.doc_date) + (n.issued_name ? ' · Izdal: ' + n.issued_name : '') + ' · ' + (n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'), { size: 9, color: _PDF.GREY });
    doc.text(right - 12, y + 17, 'Podpis: ______________', { size: 9, align: 'right', color: _PDF.GREY });
    y += boxH + 20;
    var cK = right, artL = M + 6;
    function glava() {
      doc.rect(M, y, right - M, 20, { fill: _PDF.HEAD });
      doc.text(artL, y + 13.5, 'Naziv artikla', { size: 8.5, bold: true, color: _PDF.INK });
      doc.text(cK, y + 13.5, 'Kosov', { size: 8.5, bold: true, align: 'right', color: _PDF.INK });
      y += 20;
    }
    glava();
    if (!items.length) { doc.text(artL, y + 13, 'Ni postavk', { size: 10, color: _PDF.GREY }); y += 20; }
    items.forEach(function (p) {
      if (y + 18 > doc.H - 70) { doc.addPage(); y = _pdfGlava(doc, logo, M); glava(); }
      doc.text(artL, y + 13, p.naziv, { size: 9.5, color: _PDF.INK });
      doc.text(cK, y + 13, stevilo(p.kosov), { size: 9.5, align: 'right', color: _PDF.INK });
      y += 18; doc.line(M, y, right, y, { width: 0.6, color: _PDF.LINE });
    });
    if (n.weight_kg != null && n.weight_kg !== '') { y += 14; doc.text(M, y, 'Skupaj teža perila: ' + String(n.weight_kg).replace('.', ',') + ' kg', { size: 11, bold: true, color: _PDF.INK }); }
    if (n.opomba) { y += 22; doc.text(M, y, 'Opomba:', { size: 9, bold: true, color: _PDF.GREY }); y += 13; doc.text(M, y, n.opomba, { size: 9.5, color: _PDF.INK }); }
    doc.save('spremni_list_' + (n.number || 'brez') + '.pdf');
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
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Tiskanje ni uspelo.'); }
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
      listi += '<div class="sheet"><div class="tab">' + nd(ime) + '</div><div class="per">Obdobje: ' + nd(obd) + '</div><table>' + head + rows + tot + '</table></div>';
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
      ? [B('Stranka'), B('Spr. listov'), B('Kosov'), B('Teža (kg)'), B('Neto'), B('DDV'), B('Za plačilo z DDV')]
      : [B('Stranka'), B('Spr. listov'), B('Kosov'), B('Teža (kg)')]);
    let sL = 0, sK = 0, sKg = 0, sN = 0, sD = 0, sB = 0;
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      sL += g.listov; sK += g.kosov; sKg += g.kg;
      if (anyMoney) {
        sN += g.neto || 0; sD += g.ddv || 0; sB += g.bruto || 0;
        pov.push([ime, INT(g.listov), INT(g.kosov), KG(g.kg), g.cenikOn ? EUR(g.neto) : '—', g.cenikOn ? EUR(g.ddv) : '—', g.cenikOn ? EUR(g.bruto) : '—']);
      } else pov.push([ime, INT(g.listov), INT(g.kosov), KG(g.kg)]);
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
        if (g.brezCene) rows.push([{ v: stevilo(g.brezCene) + ' artiklov brez cene (niso všteti) — poveži jih v Strankah', s: 0 }]);
      } else {
        rows.push([T('Skupaj kosov'), INTb(g.kosov)]);
        rows.push([T('Teža perila (kg)'), KGb(g.kg)]);
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
    let q = sb.from('articles').select('org_id,name,cena_sifra');
    if (orgFilter) q = q.eq('org_id', orgFilter);
    const { data, error } = await q;
    const map = {};
    if (!error) (data || []).forEach(a => { if (a.cena_sifra != null) map[a.org_id + '|' + String(a.name || '').trim().toLowerCase()] = a.cena_sifra; });
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
  async function cenikShraniStrankiRed(container) {
    const orgIds = [].slice.call(container.querySelectorAll('.cgrp')).map(el => el.dataset.key).filter(k => k && k.indexOf('org:') === 0).map(k => k.slice(4));
    const updates = orgIds.map((id, i) => ({ id: id, sort_order: i }));
    if (!updates.length) return;
    updates.forEach(u => { var o = ORGSEZNAM.find(x => x.id === u.id); if (o) o.sort_order = u.sort_order; });
    const res = await Promise.all(updates.map(u => sb.from('orgs').update({ sort_order: u.sort_order }).eq('id', u.id)));
    if (res.some(r => r.error)) toast('Vrstni red strank morda ni v celoti shranjen.');
    else toast('Vrstni red strank shranjen');
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
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = t;
    _toastEl.classList.add('show');
    clearTimeout(_toastEl._h);
    _toastEl._h = setTimeout(() => _toastEl.classList.remove('show'), 2600);
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
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(val) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); resolve(val); }
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
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(val) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); resolve(val); }
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
      function syncVal() { var o = sel.options[sel.selectedIndex]; valEl.textContent = o ? o.textContent : ''; }
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
          it.textContent = o.textContent; it.dataset.i = i; panel.appendChild(it);
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
  function fmtKg(kg) { return (Math.round((kg || 0) * 10) / 10).toLocaleString('sl-SI') + ' kg'; }
  function fmtTona(kg) { return (Math.round((kg || 0) / 100) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' t'; }
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
    document.querySelectorAll('#content .row').forEach(b => b.addEventListener('click', () => toggle(b)));
    pripniMarquee('content');
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
  async function toggle(btn) {
    const box = $('a' + btn.dataset.i);
    const lcell = btn.closest('.lcell');
    const odprt = btn.getAttribute('aria-expanded') === 'true';
    if (odprt) {
      btn.setAttribute('aria-expanded', 'false');
      box.classList.remove('show'); if (lcell) lcell.classList.remove('open');
      return;
    }
    // naenkrat naj bo odprt samo en okvirček
    document.querySelectorAll('#content .row[aria-expanded="true"]').forEach(function (o) {
      if (o !== btn) { o.setAttribute('aria-expanded', 'false'); var bx = $('a' + o.dataset.i); if (bx) bx.classList.remove('show'); var lc = o.closest('.lcell'); if (lc) lc.classList.remove('open'); }
    });
    btn.setAttribute('aria-expanded', 'true');
    box.classList.add('show'); if (lcell) lcell.classList.add('open');
    if (box.dataset.loaded) return;
    await risiArtikleBox(box, btn.dataset.id);
    box.dataset.loaded = '1';
  }
  async function risiArtikleBox(box, orgId) {
    var _sy = window.scrollY;
    // ob osvežitvi (box že ima vsebino) ne pokaži »Nalagam« — brez utripa
    if (!box.dataset.loaded) box.innerHTML = NALAGANJE;
    const org = ORGSEZNAM.find(o => o.id === orgId) || {};
    await nalozicenik();
    let arts;
    const r = await sb.from('articles').select('id,name,cena_sifra,aktiven,teza').eq('org_id', orgId).order('sort_order');
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
        return '<span class="str-art-teza"><input type="text" inputmode="decimal" class="str-teza-in" data-idx="' + idx + '" value="' + escape_(tv) + '" placeholder="kg" aria-label="Teža na kos"><span class="str-teza-u">kg</span></span>';
      }
      return '<span class="str-art-teza u-sub">' + (a.teza != null && a.teza !== '' ? fmtTeza(a.teza) : '— kg') + '</span>';
    }
    var artRows = arts.map(function (a, i) {
      return '<div class="str-art">' + idOznaka(a) + '<span class="str-art-nm">' + escape_(a.name || '') + '</span>' + tezaOznaka(a, i) + cenaOznaka(a) + '</div>';
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
          logDodaj('Artikli', 'Urejeno', 'Teža „' + (a.name || '') + '" · ' + (teza != null ? String(teza).replace('.', ',') + ' kg' : '—'));
          toast('Teža shranjena.');
        });
      });
    }
    // sinhroniziraj značko »Splošni cenik« na vrstici stranke (živo, ob vsaki spremembi artiklov)
    try {
      var _row = box.previousElementSibling;
      if (_row && _row.classList && _row.classList.contains('row')) {
        var _priced = arts.filter(function (a) { return a.cena_sifra != null; });
        var _spl = _priced.length > 0 && _priced.every(function (a) { var p = CENIKMAP[a.cena_sifra]; return p && jeSc(p.koda); });
        var _rn = _row.querySelector('.row-name'); var _wrap = _rn ? _rn.parentNode : null; var _has = _row.querySelector('.sc-tag');
        if (_wrap) { if (_spl && !_has) _wrap.insertAdjacentHTML('beforeend', SC_TAG); else if (!_spl && _has) _has.remove(); }
        _row.classList.toggle('has-sc', !!_spl);
      }
    } catch (e) {}
    box.dataset.loaded = '1';
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
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
      <p class="u-sub" style="margin:10px 0 4px">Artikli</p>
      <div data-artikli></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj artikel</button>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Ustvari</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const aBox = box.querySelector('[data-artikli]');
    const dodajVrstico = (val = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<input type="text" data-an placeholder="artikel" value="${escape_(val)}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      row.querySelector('[data-del]').addEventListener('click', () => row.remove());
      aBox.appendChild(row);
    };
    dodajVrstico();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
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
    const artikli = [...box.querySelectorAll('[data-an]')].map(i => i.value.trim()).filter(Boolean);
    msg.textContent = 'Shranjujem …';
    try {
      const legacyId = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      const { data: novOrg, error: e1 } = await sb.from('orgs').insert({ name: naziv, legal_name: podjetje || null, address: naslov || null, vat_id: davcna || null, legacy_id: legacyId }).select('id,name,legal_name,address,vat_id').single();
      if (e1) throw e1;
      if (artikli.length) {
        const rows = artikli.map((nm, idx) => ({ org_id: novOrg.id, name: nm, sort_order: idx }));
        const { error: e2 } = await sb.from('articles').insert(rows);
        if (e2) throw e2;
      }
      ORGSEZNAM.push(novOrg); ORGIME[novOrg.id] = novOrg.name;
      box.innerHTML = ''; box.classList.remove('show');
      toast('Stranka ustvarjena · ' + (artikli.length ? artikli.length + ' artiklov' : 'brez artiklov'));
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
    $('katalogList').innerHTML = NALAGANJE;
    const {
      data
    } = await sb.from('articles').select('name').eq('org_id', MOJEPODJETJE.id).order('sort_order');
    $('katalogPod').textContent = ((data === null || data === void 0 ? void 0 : data.length) || 0) + ' artiklov';
    $('katalogList').innerHTML = '<div class="rows"><div class="arts show" style="border:none">' + (data !== null && data !== void 0 && data.length ? '<ul>' + data.map(a => '<li>' + escape_(a.name) + '</li>').join('') + '</ul>' : '<p class="none">Katalog še ni izpolnjen.</p>') + '</div></div>';
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
      const {
        data: obstojece
      } = await sb.from('orgs').select('id,name,legacy_id');
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
      const {
        data: vsiArt
      } = await sb.from('articles').select('id,org_id,name,legacy_id');
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
      const {
        data: ze
      } = await sb.from('delivery_notes').select('id,legacy_id');
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
      } = await sb.from('orgs').select('id,name,legal_name,address,vat_id').order('name');
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
  var APK_POT = 'tablica/Pralnica-sync.apk';
  var SC_LOGO = 'data:image/png;base64,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';

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

    var tabletPanel = '<div class="panel" id="apkTablet"><h3 class="sec-h">2. Aplikacija za tiskanje — tablica (Android)</h3><p class="u-sub">Preverjam …</p></div>';

    var telefonPanel =
      '<div class="panel">' +
        '<h3 class="sec-h">3. Aplikacija za tiskanje — telefon (iPhone in Android)</h3>' +
        '<p class="uvoz-nav">Za vnos in tiskanje spremnih listov na telefonu. Odpre se v brskalniku; dodaj jo na začetni zaslon, da deluje kot prava aplikacija.</p>' +
        '<p><a class="btn btn-narrow" href="mobile/" target="_blank" rel="noopener">Odpri aplikacijo za telefon</a></p>' +
        '<div class="por"><div class="por-op">' +
          '<b>iPhone (Safari):</b> tapni <b>Deli</b> (kvadratek s puščico) → podrsaj do <b>»Dodaj na začetni zaslon«</b> → <b>Dodaj</b>.<br><br>' +
          '<b>Android (Chrome):</b> meni (⋮) → <b>»Dodaj na začetni zaslon«</b> oz. <b>»Namesti aplikacijo«</b>.' +
        '</div></div>' +
      '</div>';

    var webPanel =
      '<div class="panel">' +
        '<h3 class="sec-h">1. Aplikacija za tiskanje — spletni pogled (Smartclean mobile)</h3>' +
        '<p class="uvoz-nav">Deluje v katerem koli brskalniku, brez nameščanja — priročno za telefon, tablico ali računalnik.</p>' +
        '<p><a class="btn btn-narrow" href="mobile/" target="_blank" rel="noopener">Odpri spletni pogled</a></p>' +
      '</div>';

    p.innerHTML = webPanel + tabletPanel + telefonPanel;

    fetch(url, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) throw new Error('ni ga');
      var mb = Number(r.headers.get('content-length') || 0) / 1048576;
      var t = document.getElementById('apkTablet');
      if (t) t.innerHTML =
        '<h3 class="sec-h">2. Aplikacija za tiskanje — tablica (Android)</h3>' +
        '<p class="uvoz-nav">Za vnos in tiskanje spremnih listov na tablici. <b>To stran odpri na tablici</b> in tapni gumb — Android bo vprašal za dovoljenje za namestitev, dovoli ga.</p>' +
        '<p><a class="btn btn-narrow" href="' + escape_(url) + '" download>Prenesi aplikacijo' +
        (mb ? ' (' + mb.toFixed(1) + ' MB)' : '') + '</a></p>' +
        '<p class="u-sub" style="margin-top:14px">Po namestitvi: koda 9999 → Admin → Portal — povezava.</p>';
    }).catch(function () {
      var t = document.getElementById('apkTablet');
      if (t) t.innerHTML =
        '<h3 class="sec-h">2. Aplikacija za tiskanje — tablica (Android)</h3>' +
        '<div class="msg bad show">Namestitvenega paketa (<b>' + escape_(APK_POT) + '</b>) še ni na strežniku.</div>' +
        '<p class="u-sub" style="margin-top:12px">Medtem deluje spletni pogled (točka 1), ki ga ni treba nameščati.</p>';
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
    try { res = await sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at,mapa,ime,je_mapa,zaklenjeno').order('je_mapa', { ascending: false }).order('created_at', { ascending: false }); } catch (e) { res = { error: e }; }
    if (res && res.error && /zaklenjeno/i.test(res.error.message || '')) {
      // stolpec zaklenjeno še ne obstaja — poskusi brez njega
      _dokZaklepOk = false;
      try { res = await sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at,mapa,ime,je_mapa').order('je_mapa', { ascending: false }).order('created_at', { ascending: false }); } catch (e) { res = { error: e }; }
    }
    if (res && res.error && /mapa|ime|je_mapa/i.test(res.error.message || '')) {
      _dokFsOk = false; _dokZaklepOk = false;
      try { res = await sb.from('documents').select('id,opomba,datum,storage_path,mime,velikost,created_at').order('created_at', { ascending: false }); } catch (e) { res = { error: e }; }
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
    var ok = await potrdiModal({ naslov: jeMapa ? 'Izbriši mapo' : 'Izbriši datoteko', sporocilo: jeMapa ? ('Izbrišem mapo „' + dokImeRow(r) + '"' + (otroci.length ? ' in vso vsebino (' + otroci.length + ' elementov)' : '') + '? Tega ni mogoče razveljaviti.') : ('Izbrišem „' + dokImeRow(r) + '"? Tega ni mogoče razveljaviti.'), potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var vsi = [r].concat(otroci);
    var poti = vsi.map(function (x) { return x.storage_path; }).filter(Boolean);
    try {
      if (poti.length) { try { await sb.storage.from('dokumenti').remove(poti); } catch (e) {} }
      var ids = vsi.map(function (x) { return x.id; });
      var del = await sb.from('documents').delete().in('id', ids);
      if (del.error) throw del.error;
      DOKUMENTI = (DOKUMENTI || []).filter(function (x) { return ids.indexOf(x.id) < 0; });
      dokRisi();
    } catch (e) { toast('Napaka pri brisanju: ' + (e && e.message ? e.message : e)); }
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
    if (typeof PDFDoc === 'undefined') { toast('PDF modul ni naložen (pdfgen.js).'); return; }
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
  { var _sd = $('sec-dokumenti'); if (_sd) {
    _sd.addEventListener('dragover', function (e) { e.preventDefault(); var h = $('dokDropHint'); if (h) h.hidden = false; });
    _sd.addEventListener('dragleave', function (e) { if (e.target === _sd) { var h = $('dokDropHint'); if (h) h.hidden = true; } });
    _sd.addEventListener('drop', function (e) { e.preventDefault(); var h = $('dokDropHint'); if (h) h.hidden = true; if (e.dataTransfer && e.dataTransfer.files) dokNalozi(e.dataTransfer.files); });
  } }

  /* ══════════ MOJ RAČUN ══════════ */
  /* ── Moj profil: prikaz avatarja + polj ── */
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
    $('usersList').innerHTML = NALAGANJE;
    if (!$('nuOrg').options.length) {
      $('nuOrg').innerHTML = '<option value="">— osebje SmartClean —</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    }
    const [rLjudje, {
      data: clanstva
    }] = await Promise.all([sb.from('profiles').select('id,email,full_name,is_staff,super_admin,zaposleni,active,last_login,last_seen,web_dostop').order('email'), sb.from('memberships').select('user_id,org_id')]);
    let ljudje = rLjudje.data;
    if (rLjudje.error) { /* super_admin/zaposleni ali last_seen še ni — beri brez njih */
      const fb = await sb.from('profiles').select('id,email,full_name,is_staff,active,last_login').order('email');
      if (fb.error) { const fb2 = await sb.from('profiles').select('id,email,full_name,is_staff,active').order('email'); ljudje = fb2.data; }
      else ljudje = fb.data;
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
    $('usersList').innerHTML = (ljudje || []).map(u => {
      const jaz = u.id === JAZ;
      const jeLastnikU = jeSuperLastnik(u);
      const vlogaVal = jeLastnikU ? 'super' : u.super_admin ? 'admin' : u.is_staff ? 'osebje' : u.zaposleni ? 'zaposleni' : 'stranka';
      const ur = vlogaRang(vlogaVal);
      const lahkoUredi = !jaz && !jeLastnikU && mr > ur;   // nadrejeni ureja podrejene; lastnika nihče
      const naSpletu = jaz || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 120000);
      const webOn = u.web_dostop !== false;   // privzeto vključen
      const roleOpts = VLOGE.filter(r => r[2] < mr).sort((a, b) => b[2] - a[2]).map(r => `<option value="${r[0]}"${vlogaVal === r[0] ? ' selected' : ''}>${r[1]}</option>`).join('');
      return `<div class="u-row ${u.active ? '' : 'u-off'}">
      <div class="u-info">
        <div class="u-mail">${escape_(u.full_name || u.email || '—')}
          ${naSpletu ? '<span class="pill pill-on"><span class="dot-on"></span>na spletu</span>' : ''}
          ${jeLastnikU ? '<span class="pill pill-super">' + escape_(roleIme('super')) + '</span>' : ''}
          ${(!jeLastnikU && u.super_admin) ? '<span class="pill pill-super">' + escape_(roleIme('admin')) + '</span>' : ''}
          ${(!u.super_admin && !u.is_staff && u.zaposleni) ? '<span class="pill">' + escape_(roleIme('zaposleni')) + '</span>' : ''}
          ${jaz ? '<span class="pill">vi</span>' : ''}
          ${u.active ? '' : '<span class="pill">izklopljen</span>'}</div>
        ${lahkoUredi ? `<div class="u-role-wrap">
          <select class="u-role" data-role="${u.id}" data-cur="${vlogaVal}" aria-label="Vloga">${roleOpts}</select>
          ${vlogaVal === 'stranka' ? `<select class="u-org" data-org="${u.id}" aria-label="Podjetje">
             <option value="">— izberi podjetje —</option>
             ${ORGSEZNAM.map(o => `<option value="${o.id}"${clanPo[u.id] === o.name ? ' selected' : ''}>${escape_(o.name)}</option>`).join('')}
           </select>` : ''}
        </div>` : ''}
        <div class="u-sub">${escape_(u.email || '—')}</div>
        <div class="u-sub">Zadnja prijava: ${u.last_login ? datumcas(u.last_login) : 'še nikoli'}</div>
      </div>
      <div class="u-acts">
        ${(jaz || lahkoUredi) ? `<button data-act="ime" data-id="${u.id}" data-ime="${escape_(u.full_name || '')}">preimenuj</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button class="u-web${webOn ? ' on' : ''}" data-act="web" data-id="${u.id}" data-v="${webOn ? 0 : 1}" title="Prikaz v Web view izbiri oseb">Web view: ${webOn ? 'da' : 'ne'}</button>` : ''}
        ${lahkoUredi ? `<button data-act="active" data-id="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? 'izklopi' : 'vklopi'}</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button data-act="pw" data-id="${u.id}">novo geslo</button>` : ''}
        ${(jeLastnik && !jaz) ? `<button class="danger" data-act="del" data-id="${u.id}" data-m="${escape_(u.email || '')}">izbriši</button>` : ''}
      </div>
    </div>`;
    }).join('') || '<p class="u-sub">Ni uporabnikov.</p>';
    document.querySelectorAll('#usersList select[data-role]').forEach(sel => {
      sel.addEventListener('change', () => spremeniVlogo(sel));
    });
    document.querySelectorAll('#usersList select[data-org]').forEach(sel => {
      sel.addEventListener('change', () => nastaviStranko(sel.dataset.org, sel.value));
    });
    document.querySelectorAll('#usersList button[data-act]').forEach(b => {
      b.addEventListener('click', () => dejanje(b));
    });
    // osveži prisotnost vsakih 30 s, dokler je seznam viden
    if (loadUsers._t) { clearTimeout(loadUsers._t); loadUsers._t = null; }
    loadUsers._t = setTimeout(function () {
      const el = $('usersList');
      if (el && el.offsetParent !== null) loadUsers();
    }, 30000);
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
    var ime = ''; try { var row = sel.closest('.u-row'); var nm = row && row.querySelector('.u-mail'); if (nm && nm.childNodes[0]) ime = (nm.childNodes[0].textContent || '').trim(); } catch (e) {}
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
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : (btn.dataset.v === '1' ? 'Dostop do Web view vključen.' : 'Dostop do Web view izključen.'), !!error);
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
    var bio = false; try { bio = !!(p.uid && localStorage.getItem('sc-biocred-' + p.uid)); } catch (e) {}
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
  }
  function pokaziIzbirnik() {
    narisiIzbirnik();
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
    // 1) Face ID omogočen za ta profil → vedno zahtevaj biometrijo (tudi če je seja živa).
    if (p && p.uid && bioPodprt() && bioVklopljen(p.uid)) {
      var m = $('ppMsg'); if (m) { m.className = 'msg show'; m.textContent = 'Potrjujem …'; }
      try {
        var ok = await bioOdkleni(p.uid);
        if (ok) { if (m) { m.className = 'msg'; m.textContent = ''; } start(); return; }
        pokaziPrijavo(email, 'Zaradi varnosti enkrat vpiši geslo; Face ID nato spet deluje.'); return;
      } catch (e) {
        var cancel = e && /NotAllowed|abort|timed|timeout/i.test((e.name || '') + ' ' + (e.message || ''));
        if (cancel) { if (m) { m.className = 'msg bad show'; m.textContent = 'Preklicano. Poskusi znova.'; } return; }
        pokaziPrijavo(email, (e && e.message ? e.message + ' ' : '') + 'Vpiši geslo enkrat, Face ID nato spet deluje.'); return;
      }
    }
    // 2) Brez Face ID: če je seja še živa za tega uporabnika, ga spustimo naravnost noter.
    if (sejaTaUporabnik) { start(); return; }
    // 3) Sicer geslo.
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
  function bioCred(uid) { try { return localStorage.getItem('sc-biocred-' + uid) || null; } catch (e) { return null; } }
  function bioSetCred(uid, c) { try { localStorage.setItem('sc-biocred-' + uid, c); } catch (e) {} }
  function bioDelCred(uid) { try { localStorage.removeItem('sc-biocred-' + uid); } catch (e) {} }
  function bioTok(uid) { try { var r = localStorage.getItem('sc-biotok-' + uid); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function bioSetTok(uid, o) { try { localStorage.setItem('sc-biotok-' + uid, JSON.stringify(o)); } catch (e) {} }
  function bioDelTok(uid) { try { localStorage.removeItem('sc-biotok-' + uid); } catch (e) {} }
  function bioVklopljen(uid) { return !!(uid && bioCred(uid)); }
  // Ob prijavi/osvežitvi žetona posodobimo shrambo TEGA uporabnika (če ima vpis).
  function bioOsveziZetone(session) {
    if (!session || !session.user) return;
    var uid = session.user.id;
    if (bioCred(uid) && session.refresh_token) bioSetTok(uid, { at: session.access_token, rt: session.refresh_token });
  }
  // Omogoči na tej napravi: ustvari PLATFORMNI ključ (Windows Hello / Face ID / Touch ID).
  // Seje NE hranimo ročno — Supabase svojo sejo že obdrži; biometrija je le lokalni zaklep.
  async function bioOmogoci() {
    if (!bioPodprt()) throw new Error('Ta naprava ne podpira Face ID / prstnega odtisa.');
    var sres = await sb.auth.getSession();
    var session = sres && sres.data && sres.data.session;
    if (!session) throw new Error('Najprej se prijavi z geslom.');
    var opts = { publicKey: {
      challenge: nakljucje(32),
      rp: { name: 'SmartClean', id: location.hostname },
      user: { id: new TextEncoder().encode(session.user.id), name: JAZMAIL || session.user.email, displayName: JAZIME || session.user.email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      // Prisili vgrajeno biometrijo naprave; brez rezidenčnega (sinhroniziranega) ključa,
      // da Chrome ne ponudi Google Password Manager / QR na telefon.
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged', requireResidentKey: false },
      hints: ['client-device'],
      timeout: 60000, attestation: 'none'
    } };
    var cred = await navigator.credentials.create(opts);
    if (!cred) throw new Error('Ni uspelo.');
    bioSetCred(session.user.id, b64u(cred.rawId));
    bioSetTok(session.user.id, { at: session.access_token, rt: session.refresh_token });
    zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: session.user.id });
  }
  // Odkleni: biometrična potrditev, nato obnovi sejo TOČNO TEGA uporabnika iz njegovega žetona.
  // Vrne true ob uspehu. Ob prekinitvi vrže napako. Ob poteklem žetonu vrže 'expired'
  // (VPIS ostane — Face ID se ne izklopi, potreben je le enkraten vpis gesla).
  async function bioOdkleni(uid) {
    var credId = bioCred(uid);
    if (!credId) return false;
    await navigator.credentials.get({ publicKey: {
      challenge: nakljucje(32),
      allowCredentials: [{ type: 'public-key', id: odB64u(credId), transports: ['internal'] }],
      userVerification: 'required',
      rpId: location.hostname,
      timeout: 60000
    } });
    // 1) Če je seja TEGA uporabnika že živa (najpogosteje), gremo naravnost noter — brez žetona.
    try {
      var sg = await sb.auth.getSession();
      var ziva = sg && sg.data && sg.data.session;
      if (ziva && ziva.user && ziva.user.id === uid) { bioSetTok(uid, { at: ziva.access_token, rt: ziva.refresh_token }); return true; }
    } catch (e) {}
    // 2) Sicer (preklop na drugega uporabnika) obnovimo NJEGOVO sejo iz shranjenega žetona.
    var st = bioTok(uid);
    if (!st || !st.rt) { var e0 = new Error('Za ta profil na tej napravi še ni shranjene seje — vpiši geslo enkrat.'); e0.code = 'expired'; throw e0; }
    var sess = null, zadnja = '';
    var r = await sb.auth.refreshSession({ refresh_token: st.rt });
    if (r && !r.error && r.data && r.data.session) { sess = r.data.session; }
    else {
      zadnja = (r && r.error && r.error.message) ? r.error.message : '';
      if (st.at) {
        var r2 = await sb.auth.setSession({ access_token: st.at, refresh_token: st.rt });
        if (r2 && !r2.error && r2.data && r2.data.session) sess = r2.data.session;
        else if (r2 && r2.error && r2.error.message) zadnja = r2.error.message;
      }
    }
    if (!sess || !sess.user) { bioDelTok(uid); var e1 = new Error(zadnja || 'Seja je potekla — vpiši geslo enkrat.'); e1.code = 'expired'; throw e1; }
    if (sess.user.id !== uid) { var e3 = new Error('Napačen uporabnik.'); e3.code = 'expired'; throw e3; }
    bioSetTok(uid, { at: sess.access_token, rt: sess.refresh_token });
    return true;
  }
  // Panel v »Moj račun«.
  function napolniBio() {
    var panel = $('bioPanel'); if (!panel) return;
    if (!bioPodprt()) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    var ima = bioVklopljen(JAZ);
    $('bioOn').classList.toggle('hidden', ima);
    $('bioOff').classList.toggle('hidden', !ima);
    var lead = $('bioLead');
    if (lead) lead.textContent = ima
      ? 'Face ID / prstni odtis je omogočen na tej napravi. Ob prijavi tapni svoj profil in potrdi z biometrijo.'
      : 'Namesto gesla se lahko prijaviš s Face ID ali prstnim odtisom te naprave.';
    var m = $('bioMsg'); if (m) { m.className = 'msg'; m.textContent = ''; }
  }
  { var _bon = $('bioOn'); if (_bon) _bon.addEventListener('click', async function () {
    var m = $('bioMsg'); this.disabled = true; var t = this.textContent; this.textContent = 'Potrjujem …';
    try { await bioOmogoci(); m.className = 'msg show'; m.textContent = 'Face ID / prstni odtis je omogočen na tej napravi.'; napolniBio(); }
    catch (e) { m.className = 'msg bad show'; m.textContent = (e && /NotAllowed|abort/i.test(e.name || e.message || '')) ? 'Preklicano.' : (e && e.message ? e.message : 'Ni uspelo.'); }
    this.disabled = false; this.textContent = t;
  }); }
  { var _bof = $('bioOff'); if (_bof) _bof.addEventListener('click', function () {
    if (JAZ) { bioDelCred(JAZ); }
    zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: JAZ });
    var m = $('bioMsg'); m.className = 'msg show'; m.textContent = 'Odstranjeno s te naprave.';
    napolniBio();
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
    var m = $('bioPromoMsg'); this.disabled = true; var t = this.textContent; this.textContent = 'Potrjujem …';
    try { await bioOmogoci(); zapriPromoBio(); }
    catch (e) { m.className = 'msg bad show'; m.textContent = (e && /NotAllowed|abort/i.test(e.name || e.message || '')) ? 'Preklicano.' : (e && e.message ? e.message : 'Ni uspelo.'); }
    this.disabled = false; this.textContent = t;
  }); }
  { var _bpl = $('bioPromoLater'); if (_bpl) _bpl.addEventListener('click', zapriPromoBio); }

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
      if (beriProfile().length) pokaziIzbirnik();
      else pokaziPrijavo('');
    }
  })();

  /* Šele tu vemo, da se je celotna skripta prevedla in izvedla. */
  if (window.__SC) window.__SC.ok = true;
})();

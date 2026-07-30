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
    document.documentElement.dataset.theme = eff;
  }
  function oznaciTemo() {
    const p = temaPref();
    document.querySelectorAll('[data-tema]').forEach(b => b.classList.toggle('on', b.dataset.tema === p));
  }
  function nastaviTemo(pref) { try { localStorage.setItem('sc-portal-theme', pref); } catch (e) {} uporabiTemo(); oznaciTemo(); }
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

  /* ── samodejna prijava (segment kot redni/izredni na tablici) ─────── */
  function autoLoginOn() { try { return localStorage.getItem('sc-autologin') !== '0'; } catch (e) { return true; } }
  function nastaviAuto(on) { try { localStorage.setItem('sc-autologin', on ? '1' : '0'); } catch (e) {} }
  (function initAutoSeg() {
    const seg = document.getElementById('autoSeg');
    if (!seg) return;
    const on = autoLoginOn();
    seg.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', (b.dataset.auto === '1') === on));
    seg.querySelectorAll('.seg-b').forEach(b => b.addEventListener('click', () => {
      nastaviAuto(b.dataset.auto === '1');
      seg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b));
    }));
  })();

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
    const m = $('loginMsg');
    if (m) m.className = 'msg';
  }
  $('forgotBtn').addEventListener('click', () => {
    $('resetEmail').value = $('email').value.trim();
    showAuthPane('resetForm');
    document.querySelector('.sub').textContent = 'Vpišite svoj e-naslov in poslali vam bomo povezavo za nastavitev novega gesla.';
  });
  $('backBtn').addEventListener('click', () => {
    showAuthPane('loginForm');
    document.querySelector('.sub').textContent = 'Vpišite se s podatki, ki ste jih prejeli od nas.';
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
    await sb.auth.signOut();
    location.reload();
  });

  /* ══════════ STANJE ══════════ */
  let JAZ = null,
    JAZIME = '',
    JAZMAIL = '',
    OSEBJE = false,
    MOJEPODJETJE = null;
  const JE_LASTNIK = () => (JAZMAIL || '').trim().toLowerCase() === 'filip@eflitte.si';
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
    VSEHLISTOV = 0;

  /* ══════════ ZAGON ══════════ */
  async function start() {
    const {
      data: {
        user
      }
    } = await sb.auth.getUser();
    if (!user) return;
    JAZ = user.id;
    const {
      data: profil
    } = await sb.from('profiles').select('full_name,is_staff').eq('id', user.id).maybeSingle();
    OSEBJE = !!(profil !== null && profil !== void 0 && profil.is_staff);
    nastaviWho((profil && profil.full_name) || user.email);
    JAZIME = (profil && profil.full_name) || user.email;
    JAZMAIL = user.email || '';
    $('racunPod').textContent = user.email;
    /* Zabeleži čas te prijave (za seznam uporabnikov). Tiho, če funkcije še ni. */
    try { sb.rpc('touch_last_login').then(function () {}, function () {}); } catch (e) {}
    /* Naslov nastavimo že pred prikazom, da za trenutek ne utripne »Pregled«. */
    if ($('domovNaslov')) $('domovNaslov').textContent = OSEBJE ? ('Pozdravljen/a, ' + prvoIme()) : 'Vaš pregled';
    $('auth').style.display = 'none';
    $('app').classList.add('show');
    const {
      data: orgs
    } = await sb.from('orgs').select('id,name,legal_name,address,vat_id').order('name');
    ORGSEZNAM = orgs || [];
    ORGIME = {};
    ORGSEZNAM.forEach(o => {
      ORGIME[o.id] = o.name;
    });
    if (!OSEBJE && ORGSEZNAM.length === 1) MOJEPODJETJE = ORGSEZNAM[0];
    meni();
    await naloziListe();
    pojdi('domov');
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
    aplikacija: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5.5h3"/><path d="M12 18.2h.01"/>',
    nastavitve: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  };
  const ikona = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IKONE[k] + '</svg>';
  function meni() {
    let glavni, nast;
    if (OSEBJE) {
      glavni = [['domov', 'Pregled'], ['statistika', 'Statistika'], ['arhiv', 'Arhiv'], ['fakture', 'Fakture'], ['ceniki', 'Ceniki'], ['stranke', 'Stranke'], ['aplikacija', 'Aplikacija']];
      if (JE_LASTNIK()) glavni.push(['uporabniki', 'Uporabniki']);
      nast = [['nastavitve', 'Nastavitve'], ['racun', 'Moj račun']];
    } else {
      glavni = [['domov', 'Pregled'], ['arhiv', 'Arhiv'], ['katalog', 'Katalog']];
      nast = [['racun', 'Moj račun']];
    }
    const veja = ([k, l]) => `<a data-go="${k}">${ikona(k)}${l}</a>`;
    $('side').innerHTML = '<span class="side-slider" aria-hidden="true"></span>' + glavni.map(veja).join('') + '<div class="side-sep"></div>' + nast.map(veja).join('');
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
  }
  $('burger').addEventListener('click', () => {
    const on = $('side').classList.toggle('on');
    $('scrim').classList.toggle('on', on);
    $('burger').classList.toggle('open', on);
    $('burger').setAttribute('aria-expanded', on ? 'true' : 'false');
  });
  $('scrim').addEventListener('click', zapriMeni);

  /* ══════════ USMERJANJE ══════════ */
  function pojdi(kam) {
    document.querySelectorAll('.sec').forEach(s => {
      s.classList.toggle('hidden', s.id !== 'sec-' + kam);
    });
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
    if (kam === 'nastavitve') risiNastavitve();
    if (kam === 'racun') { const mi = $('mojeIme'); if (mi) mi.value = (JAZIME && JAZIME.indexOf('@') < 0) ? JAZIME : ''; }
    if (kam === 'aplikacija') risiAplikacijo();
    if (kam === 'ceniki') risiCeniki();
  }

  /* ══════════ SPREMNI LISTI ══════════ */
  async function naloziListe() {
    const {
      data,
      error
    } = await sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport').order('doc_date', {
      ascending: false
    }).limit(1000);
    LISTI = error ? [] : data || [];
    const {
      count
    } = await sb.from('delivery_notes').select('id', {
      count: 'exact',
      head: true
    });
    VSEHLISTOV = count || 0;
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
    const zadnjiListi = LISTI.slice().sort((a, b) => stKljuc(b) - stKljuc(a)).slice(0, 5);
    $('zadnji').innerHTML = '<h3 class="sec-h">Zadnji prevzemi</h3>' + tabelaListov(zadnjiListi, false);
  }

  /* ══════════ ARHIV ══════════ */
  function tabelaListov(vrstice, klikljivo) {
    if (!vrstice.length) return prazniListi(OSEBJE ? 'osebje' : 'stranka');
    return '<div class="rows">' + vrstice.map((l, i) => `
    <button class="a-row" type="button" data-i="${i}" data-id="${l.id}" aria-expanded="false"
      ${klikljivo ? '' : 'style="cursor:default"'}>
      <span class="a-num">${escape_(l.number || '—')}</span>
      <span class="a-cli">${escape_(OSEBJE ? ORGIME[l.org_id] || '—' : l.issued_name || '')}</span>
      <span class="num a-date">${datum(l.doc_date)}</span>
      <span class="num">${stevilo(l.total_pieces)} kos</span>
      <span class="chev" aria-hidden="true">${klikljivo ? '›' : ''}</span>
    </button>
    <div class="a-det" id="det${i}"></div>`).join('') + '</div>';
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
    const vrstice = LISTI.filter(l => (!org || l.org_id === org) && (!q || (l.number || '').toLowerCase().includes(q) || (ORGIME[l.org_id] || '').toLowerCase().includes(q)));
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
  }
  $('arhivIsci').addEventListener('input', risiArhiv);
  { const ss = $('arhivSort'); if (ss) ss.addEventListener('change', risiArhiv); }
  { const _nb = $('arhivNovBtn'); if (_nb) _nb.addEventListener('click', () => novList()); }
  async function odpriList(btn) {
    const box = btn.nextElementSibling && btn.nextElementSibling.classList.contains('a-det') ? btn.nextElementSibling : $('det' + btn.dataset.i);
    const odprt = btn.getAttribute('aria-expanded') === 'true';
    if (odprt) {
      btn.setAttribute('aria-expanded', 'false');
      box.classList.remove('show');
      return;
    }
    document.querySelectorAll('#arhivList .a-row[aria-expanded="true"]').forEach(o => {
      if (o !== btn) { o.setAttribute('aria-expanded', 'false'); const d = document.getElementById('det' + o.dataset.i); if (d) d.classList.remove('show'); }
    });
    btn.setAttribute('aria-expanded', 'true');
    box.classList.add('show');
    if (box.dataset.loaded) return;
    box.innerHTML = '<p class="u-sub">Nalagam …</p>';
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
    box.innerHTML = seznam + izdalV + ustvarjenoV + popravek + gumbi;
    box.querySelector('[data-natisni]').addEventListener('click', () => natisniList(box));
    if (OSEBJE) {
      box.querySelector('[data-uredi]').addEventListener('click', () => urediList(box));
      box.querySelector('[data-izbrisi]').addEventListener('click', () => izbrisiList(box));
    }
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
    if (!confirm('Izbrisati spremni list ' + (box._note.number || '') + '?\nTega ni mogoče razveljaviti.')) return;
    box.innerHTML = '<p class="u-sub">Brišem …</p>';
    try {
      let r = await sb.from('delivery_note_items').delete().eq('note_id', box._id);
      if (r.error) throw r.error;
      r = await sb.from('delivery_notes').delete().eq('id', box._id);
      if (r.error) throw r.error;
      toast('Spremni list izbrisan');
      await naloziListe();
      risiArhiv();
    } catch (e) {
      box.innerHTML = '<p class="u-sub">Napaka pri brisanju: ' + escape_(e.message || e) + '</p>';
    }
  }

  function urediList(box) {
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
      <p class="u-sub" style="margin:10px 0 4px">Postavke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj postavko</button>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Shrani</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<input type="text" data-pn list="artikliDatalist" placeholder="artikel" value="${escape_(naziv)}"><input type="number" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      row.querySelector('[data-del]').addEventListener('click', () => row.remove());
      pBox.appendChild(row);
    };
    (box._items || []).forEach(p => dodajVrstico(p.naziv, p.kosov));
    if (!(box._items || []).length) dodajVrstico();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => risiListDetajl(box));
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniList(box));
    wireSeg(box);
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', () => osveziArtikleDatalist(box)); osveziArtikleDatalist(box); }
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
    const postavke = [...box.querySelectorAll('.ur-post')].map(r => ({
      naziv: r.querySelector('[data-pn]').value.trim(),
      kosov: parseInt(r.querySelector('[data-pk]').value, 10) || 0
    })).filter(p => p.naziv);
    msg.textContent = 'Shranjujem …';
    try {
      const { data: arts } = await sb.from('articles').select('id,name').eq('org_id', org_id);
      const poImenu = {};
      (arts || []).forEach(a => { poImenu[(a.name || '').trim().toLowerCase()] = a.id; });
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
          article_id: poImenu[p.naziv.toLowerCase()] || null,
          pieces: p.kosov, sort_order: i
        }));
        r = await sb.from('delivery_note_items').insert(rows);
        if (r.error) throw r.error;
      }
      toast('Spremni list shranjen');
      await naloziListe();
      risiArhiv();
    } catch (e) {
      msg.textContent = 'Napaka: ' + (e.message || e);
    }
  }

  function natisniList(box) {
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
    const html = `<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><title>Spremni list ${escape_(n.number || '')}</title><style>
      @page{size:A4;margin:14mm}
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
      .sign{margin-top:30px;color:#5c6873}
    </style></head><body>
      <div class="head"><img class="wm" alt="SmartClean" src="${SC_LOGO}"><div class="biz">BSMART d.o.o.<br>Luče 87, 3334 Luče<br>+386 41 209 676</div></div>
      <div class="num">Št. spremnega lista: <b>${escape_(n.number || '—')}</b></div>
      <div class="client"><div><b>Naročnik storitve:</b> ${escape_(naziv)}<div class="dates">Oddaja: ${datum(n.doc_date)}${izdal}${prevozP}</div></div><div>Podpis: ______________</div></div>
      <table><thead><tr><th>Naziv artikla</th><th class="q">Kosov</th></tr></thead><tbody>${rows}</tbody></table>
      ${kg}${ustv}${popr}<div class="sign"></div>
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Za tiskanje dovoli pojavna okna.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 300);
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

  function novList() {
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
        <label class="ur-f"><span>Teža (kg)</span><input type="number" step="0.1" data-teza></label>
      </div>
      <label class="ur-f"><span>Izdal</span><input type="text" data-izdal value="${escape_(JAZIME || '')}"></label>
      <div class="ur-f"><span>Vrsta prevoza</span>${segPrevoz('redni')}</div>
      <p class="u-sub" style="margin:10px 0 4px">Postavke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj postavko</button>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Ustvari</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<input type="text" data-pn list="artikliDatalist" placeholder="artikel" value="${escape_(naziv)}"><input type="number" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      row.querySelector('[data-del]').addEventListener('click', () => row.remove());
      pBox.appendChild(row);
    };
    dodajVrstico();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => { box.innerHTML = ''; box.classList.remove('show'); });
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniNovList(box));
    wireSeg(box);
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', () => osveziArtikleDatalist(box)); osveziArtikleDatalist(box); }
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
    const tezaRaw = q('[data-teza]').value;
    const izdal = q('[data-izdal]').value.trim() || (JAZIME || null);
    if (!org_id) { msg.textContent = 'Izberi stranko.'; return; }
    if (!seq || !leto) { msg.textContent = 'Vpiši številko in leto.'; return; }
    if (!doc_date) { msg.textContent = 'Vpiši datum.'; return; }
    const postavke = [...box.querySelectorAll('.ur-post')].map(r => ({
      naziv: r.querySelector('[data-pn]').value.trim(),
      kosov: parseInt(r.querySelector('[data-pk]').value, 10) || 0
    })).filter(p => p.naziv);
    msg.textContent = 'Ustvarjam …';
    try {
      const { data: arts } = await sb.from('articles').select('id,name').eq('org_id', org_id);
      const poImenu = {};
      (arts || []).forEach(a => { poImenu[(a.name || '').trim().toLowerCase()] = a.id; });
      const { data: nova, error } = await sb.from('delivery_notes').insert({
        org_id, doc_seq: seq, doc_year: leto, doc_date,
        weight_kg: tezaRaw === '' ? null : Number(tezaRaw),
        transport: beriPrevoz(box),
        issued_name: izdal, source: 'portal',
        legacy_id: 'portal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
      }).select('id').single();
      if (error) throw error;
      if (postavke.length) {
        const rows = postavke.map((p, i) => ({ note_id: nova.id, article_name: p.naziv, article_id: poImenu[p.naziv.toLowerCase()] || null, pieces: p.kosov, sort_order: i }));
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
  async function nalozifakture() {
    const list = $('fakList');
    const od = $('fakOd').value, doo = $('fakDo').value, orgFilter = $('fakOrg').value;
    if (!fakDatumOK(od, doo)) { list.innerHTML = '<div class="panel"><p class="u-sub">Izberi veljavno obdobje (od ≤ do).</p></div>'; return; }
    list.innerHTML = '<div class="panel"><p class="u-sub">Nalagam …</p></div>';
    let q = sb.from('delivery_notes')
      .select('id,number,doc_date,weight_kg,total_pieces,org_id,transport,delivery_note_items(article_name,pieces)')
      .gte('doc_date', od).lte('doc_date', doo).order('doc_date', { ascending: true }).limit(5000);
    if (orgFilter) q = q.eq('org_id', orgFilter);
    const { data, error } = await q;
    if (error) { list.innerHTML = '<div class="panel"><p class="u-sub">Napaka: ' + escape_(error.message) + '</p></div>'; return; }
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
    const ime = ORGIME[g.org_id] || '—';
    const arts = Object.entries(g.artikli).sort((a, b) => a[0].localeCompare(b[0], 'sl', { sensitivity: 'base' }));
    const rows = arts.length ? arts.map(([nm, q]) => `<div class="fak-line"><span>${escape_(nm)}</span><b>${stevilo(q)}</b></div>`).join('') : '<div class="fak-line fak-line-empty"><span class="u-sub">Brez postavk</span></div>';
    const prevoz = `<div class="fak-tot-r"><span>Prevozi</span><b>${stevilo(g.redni)} redni${g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni' : ''}</b></div>`;
    return `<div class="fak-card">
      <div class="fak-card-h" data-faktoggle="${gi}">
        <span class="fak-chev" aria-hidden="true">›</span>
        <div class="fak-card-info"><h3>${escape_(ime)}</h3><p class="u-sub">${stevilo(g.listov)} spremnih listov · ${stevilo(g.kosov)} kosov · ${fakKg(g.kg)}${g.izredni ? ' · ' + stevilo(g.izredni) + '× izredni prevoz' : ''}</p></div>
        <button type="button" class="btn-mini fak-print" data-fakprint="${gi}">Natisni</button>
      </div>
      <div class="fak-body" id="fakbody${gi}">
        <div class="fak-inner">
          <div class="fak-head"><span>Artikel</span><span>Količina</span></div>
          <div class="fak-lines">${rows}</div>
          <div class="fak-tot">
            <div class="fak-tot-r"><span>Skupaj kosov</span><b>${stevilo(g.kosov)}</b></div>
            <div class="fak-tot-r"><span>Skupaj teža perila</span><b>${fakKg(g.kg)}</b></div>
            ${prevoz}
          </div>
        </div>
      </div>
    </div>`;
  }
  function natisniFakturo(gi) {
    if (!FAK_ZADNJI || !FAK_ZADNJI.skupine[gi]) return;
    const g = FAK_ZADNJI.skupine[gi];
    const org = ORGSEZNAM.find(o => o.id === g.org_id) || {};
    const naziv = org.legal_name || org.name || ORGIME[g.org_id] || '—';
    const naslov = [org.address, org.vat_id ? 'ID za DDV: ' + org.vat_id : ''].filter(Boolean).join(' · ');
    const arts = Object.entries(g.artikli).sort((a, b) => a[0].localeCompare(b[0], 'sl', { sensitivity: 'base' }));
    const rows = arts.length ? arts.map(([nm, q]) => `<tr><td>${escape_(nm)}</td><td class="q">${stevilo(q)}</td></tr>`).join('') : '<tr><td colspan="2" style="color:#888">Ni postavk</td></tr>';
    const html = `<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><title>Osnova za račun · ${escape_(naziv)}</title><style>
      @page{size:A4;margin:14mm}
      *{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#16202b}
      body{margin:0;font-size:13px}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a6644;padding-bottom:11px;margin-bottom:18px}
      .wm{height:30px;width:auto;display:block}.head{align-items:center}
      .biz{font-size:11px;text-align:right;color:#5c6873;line-height:1.5}
      .num{font-size:15px;margin:4px 0 6px}
      .client{border:1px solid #dce2e0;border-radius:8px;padding:12px 14px;margin:12px 0 14px}
      .dates{color:#5c6873;margin-top:5px}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e6ebe9}
      th{background:#f2f5f4;text-transform:uppercase;font-size:11px;letter-spacing:.04em}
      td.q,th.q{text-align:right;font-variant-numeric:tabular-nums;width:120px}
      tfoot td{font-weight:700;border-top:2px solid #16202b}
      .sign{margin-top:30px;color:#5c6873}
    </style></head><body>
      <div class="head"><img class="wm" alt="SmartClean" src="${SC_LOGO}"><div class="biz">BSMART d.o.o.<br>Luče 87, 3334 Luče<br>+386 41 209 676</div></div>
      <div class="num"><b>Osnova za račun</b></div>
      <div class="client"><b>Naročnik storitve:</b> ${escape_(naziv)}${naslov ? '<br>' + escape_(naslov) : ''}<div class="dates">Obdobje: ${datum(FAK_ZADNJI.od)} – ${datum(FAK_ZADNJI.doo)} · ${stevilo(g.listov)} spremnih listov · ${stevilo(g.redni)} redni${g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni prevoz' : ''}</div></div>
      <table><thead><tr><th>Naziv artikla</th><th class="q">Količina (kos)</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td>Skupaj kosov</td><td class="q">${stevilo(g.kosov)}</td></tr><tr><td>Skupaj teža perila</td><td class="q">${fakKg(g.kg)}</td></tr></tfoot></table>
      <div class="sign">Cene artiklov se dodajo iz cenika (v pripravi).</div>
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Za tiskanje dovoli pojavna okna.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 300);
  }

  /* ══════════ NASTAVITVE ══════════ */
  /* ══════════ CENIKI ══════════ */
  let CENIK = null;
  function cenaFmt(n) { return (Number(n) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  async function risiCeniki() {
    const box = $('cenikList'); if (!box) return;
    if (!risiCeniki._wired) {
      const si = $('cenikIsci'); if (si) si.addEventListener('input', () => cenikRender());
      const ib = $('cenikUvoz'); if (ib) ib.addEventListener('click', () => uvoziCenik());
      risiCeniki._wired = true;
    }
    box.innerHTML = '<p class="u-sub">Nalagam cenik …</p>';
    const { data, error } = await sb.from('pricelist').select('sifra,koda,naziv,em,cena1,cena2').order('naziv');
    if (error) {
      CENIK = null;
      box.innerHTML = '<div class="msg bad show">Tabele cenika (pricelist) še ni v bazi. Zaženi priloženo migracijo v Supabase → SQL Editor, nato klikni »Uvozi cenik iz PDF-ja«.</div>';
      if ($('cenikPod')) $('cenikPod').textContent = 'Cenik še ni pripravljen';
      return;
    }
    CENIK = data || [];
    cenikRender();
  }
  var CENIK_RX = /^([A-ZČŠŽĐ][A-ZČŠŽĐ0-9.\s]*?)\s*-\s+\S/;
  function cenikSkupina(naziv) { var m = (naziv || '').match(CENIK_RX); return m ? m[1].trim() : null; }
  function cenikVrsticaHtml(x, striped) {
    var nm = x.naziv || '';
    if (striped) { var m = nm.match(CENIK_RX); if (m) { var t = nm.slice(m[1].length).replace(/^\s*-\s*/, '').trim(); if (t) nm = t; } }
    return '<div class="cenik-row"><div class="cenik-nm">' + escape_(nm) + '</div>' +
      '<div class="cenik-meta">' + escape_(x.koda || '') + ' · ' + escape_(x.em || 'kos') + '</div>' +
      '<div class="cenik-cena"><span class="cenik-val">' + cenaFmt(x.cena1) + '</span>' +
      (OSEBJE ? '<button type="button" class="cenik-edit" data-cedit="' + x.sifra + '" title="uredi ceno" aria-label="uredi ceno">✎</button>' : '') +
      '</div></div>';
  }
  function cenikRender() {
    const box = $('cenikList'); if (!box) return;
    const q = (($('cenikIsci') && $('cenikIsci').value) || '').trim().toLowerCase();
    if ($('cenikPod')) $('cenikPod').textContent = (CENIK && CENIK.length) ? (stevilo(CENIK.length) + ' artiklov · cene neto na kos') : 'Cenik je prazen';
    if (!CENIK || !CENIK.length) {
      box.innerHTML = '<div class="empty"><h3>Cenik je prazen</h3><p>Klikni »Uvozi cenik iz PDF-ja« zgoraj za prvi uvoz vseh artiklov.</p></div>';
      return;
    }
    let items = CENIK;
    if (q) items = CENIK.filter(x => (x.naziv || '').toLowerCase().includes(q) || (x.koda || '').toLowerCase().includes(q));
    if (!items.length) { box.innerHTML = '<div class="empty"><h3>Ni zadetkov</h3></div>'; return; }
    var cnt = {};
    items.forEach(function (x) { var p = cenikSkupina(x.naziv); if (p) cnt[p] = (cnt[p] || 0) + 1; });
    var grupe = {};
    items.forEach(function (x) { var p = cenikSkupina(x.naziv); if (!p || cnt[p] < 2) p = 'Splošno'; (grupe[p] = grupe[p] || []).push(x); });
    var keys = Object.keys(grupe).sort(function (a, b) { if (a === 'Splošno') return 1; if (b === 'Splošno') return -1; return a.localeCompare(b, 'sl'); });
    var odpri = !!q;
    box.innerHTML = keys.map(function (k) {
      var arr = grupe[k].slice().sort(function (a, b) { return (a.naziv || '').localeCompare(b.naziv || '', 'sl'); });
      var striped = k !== 'Splošno';
      var rows = arr.map(function (x) { return cenikVrsticaHtml(x, striped); }).join('');
      return '<div class="cgrp"><button type="button" class="cgrp-h' + (odpri ? ' open' : '') + '" data-cgrp>' +
        '<span class="cgrp-chev" aria-hidden="true">›</span><span class="cgrp-name">' + escape_(k) + '</span>' +
        '<span class="cgrp-count">' + stevilo(arr.length) + ' art.</span></button>' +
        '<div class="cgrp-body' + (odpri ? ' show' : '') + '">' + rows + '</div></div>';
    }).join('');
    box.querySelectorAll('[data-cgrp]').forEach(function (h) {
      h.addEventListener('click', function () { h.classList.toggle('open'); var b = h.nextElementSibling; if (b) b.classList.toggle('show'); });
    });
    box.querySelectorAll('[data-cedit]').forEach(bn => bn.addEventListener('click', () => cenikUredi(bn)));
  }
  function cenikCelica(cell, rec) {
    cell.innerHTML = '<span class="cenik-val">' + cenaFmt(rec.cena1) + '</span>' +
      (OSEBJE ? '<button type="button" class="cenik-edit" data-cedit="' + rec.sifra + '" title="uredi ceno" aria-label="uredi ceno">✎</button>' : '');
    var b = cell.querySelector('[data-cedit]'); if (b) b.addEventListener('click', function () { cenikUredi(b); });
  }
  function cenikUredi(btn) {
    const s = parseInt(btn.dataset.cedit, 10);
    const rec = (CENIK || []).find(r => r.sifra === s); if (!rec) return;
    const cell = btn.closest('.cenik-cena');
    cell.innerHTML = '<input type="text" class="cenik-in" inputmode="decimal"><button type="button" class="btn-mini cenik-save">Shrani</button>';
    const inp = cell.querySelector('.cenik-in');
    inp.value = String(rec.cena1).replace('.', ','); inp.focus(); inp.select();
    const shrani = async () => {
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if (isNaN(v) || v < 0) { toast('Neveljavna cena'); return; }
      const { error } = await sb.from('pricelist').update({ cena1: v, updated_at: new Date().toISOString() }).eq('sifra', s);
      if (error) { toast('Napaka: ' + error.message); return; }
      rec.cena1 = v; toast('Cena shranjena'); cenikCelica(cell, rec);
    };
    cell.querySelector('.cenik-save').addEventListener('click', shrani);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } else if (e.key === 'Escape') { cenikCelica(cell, rec); } });
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
    const q = $('search').value.trim().toLowerCase();
    const kgm = kgPoStrankiMesec();
    let list = q ? ORGSEZNAM.filter(o => (o.name + ' ' + (o.legal_name || '')).toLowerCase().includes(q)) : ORGSEZNAM.slice();
    list = list.sort((a, b) => (kgm[b.id] || 0) - (kgm[a.id] || 0) || (a.name || '').localeCompare(b.name || '', 'sl', { sensitivity: 'base' }));
    const skupajKg = ORGSEZNAM.reduce((s, o) => s + (kgm[o.id] || 0), 0);
    $('count').textContent = ORGSEZNAM.length + ' strank · ' + fmtKg(skupajKg) + ' opranega ta mesec';
    if (!list.length) {
      $('content').innerHTML = '<div class="rows"><div class="empty"><h3>Nič se ne ujema</h3>' + '<p>Poskusite z drugim delom naziva.</p></div></div>';
      return;
    }
    const naj = Math.max(...ORGSEZNAM.map(o => kgm[o.id] || 0), 1);
    $('content').innerHTML = '<div class="rows">' + list.map((o, i) => {
      const kg = kgm[o.id] || 0;
      return `<button class="row" type="button" data-id="${o.id}" data-i="${i}" aria-expanded="false">
      <span><span class="row-name">${escape_(o.name)}</span>
      ${o.legal_name ? `<br><span class="row-legal">${escape_(o.legal_name)}</span>` : ''}</span>
      <span class="row-pct" title="delež vseh količin ta mesec">${skupajKg ? (Math.round(kg / skupajKg * 1000) / 10).toLocaleString('sl-SI') + ' %' : '—'}</span>
      <span class="num">${fmtKg(kg)}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button><div class="arts" id="a${i}"></div>`;
    }).join('') + '</div>';
    document.querySelectorAll('#content .row').forEach(b => b.addEventListener('click', () => toggle(b)));
  }
  $('search').addEventListener('input', render);
  { const b = $('novaStrankaBtn'); if (b) b.addEventListener('click', () => novaStranka()); }

  async function toggle(btn) {
    const box = $('a' + btn.dataset.i);
    const odprt = btn.getAttribute('aria-expanded') === 'true';
    if (odprt) {
      btn.setAttribute('aria-expanded', 'false');
      box.classList.remove('show');
      return;
    }
    btn.setAttribute('aria-expanded', 'true');
    box.classList.add('show');
    if (box.dataset.loaded) return;
    await risiArtikleBox(box, btn.dataset.id);
    box.dataset.loaded = '1';
  }
  async function risiArtikleBox(box, orgId) {
    box.innerHTML = '<p class="meta">Nalagam …</p>';
    const org = ORGSEZNAM.find(o => o.id === orgId) || {};
    const { data, error } = await sb.from('articles').select('id,name').eq('org_id', orgId).order('sort_order');
    if (error) { box.innerHTML = '<p class="meta">Napaka: ' + escape_(error.message) + '</p>'; return; }
    const meta = [org.vat_id ? 'Davčna <b>' + escape_(org.vat_id) + '</b>' : 'Brez davčne številke', org.address ? escape_(org.address) : 'Brez naslova'].join(' · ');
    const arts = data || [];
    let html = '<p class="meta">' + meta + '</p>';
    if (OSEBJE) html += `<div class="u-acts" style="margin:2px 0 10px"><button type="button" class="str-edit">Uredi podatke stranke</button></div>`;
    html += arts.length
      ? '<ul class="art-ur">' + arts.map(a => `<li><span class="art-nm">${escape_(a.name)}</span>${OSEBJE ? `<span class="art-acts"><button type="button" class="art-ren" data-art="${a.id}" data-nm="${escape_(a.name)}" title="preimenuj" aria-label="preimenuj">✎</button><button type="button" class="art-del" data-art="${a.id}" title="odstrani" aria-label="odstrani">×</button></span>` : ''}</li>`).join('') + '</ul>'
      : '<p class="none">Ta stranka še nima artiklov v katalogu.</p>';
    if (OSEBJE) html += `<div class="art-add"><input type="text" class="art-new" placeholder="nov artikel"><button type="button" class="btn btn-narrow art-add-btn">+ Dodaj</button></div>`;
    box.innerHTML = html;
    if (OSEBJE) {
      { const eb = box.querySelector('.str-edit'); if (eb) eb.addEventListener('click', e => { e.stopPropagation(); urediStranko(box, orgId); }); }
      box.querySelectorAll('.art-del').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); izbrisiArtikel(b.dataset.art, box, orgId); }));
      box.querySelectorAll('.art-ren').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); preimenujArtikel(b, box, orgId); }));
      const inp = box.querySelector('.art-new'), addb = box.querySelector('.art-add-btn');
      const dodaj = () => { const nm = inp.value.trim(); if (nm) dodajArtikel(orgId, nm, box); };
      addb.addEventListener('click', e => { e.stopPropagation(); dodaj(); });
      inp.addEventListener('click', e => e.stopPropagation());
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dodaj(); } });
    }
  }
  async function dodajArtikel(orgId, name, box) {
    const { data: maxd } = await sb.from('articles').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
    const nextOrder = ((maxd && maxd[0] && maxd[0].sort_order) || 0) + 1;
    const { error } = await sb.from('articles').insert({ org_id: orgId, name, sort_order: nextOrder });
    if (error) { toast('Napaka: ' + error.message); return; }
    toast('Artikel dodan');
    await risiArtikleBox(box, orgId);
  }
  async function izbrisiArtikel(artId, box, orgId) {
    const { error } = await sb.from('articles').delete().eq('id', artId);
    if (error) { toast('Napaka: ' + error.message); return; }
    toast('Artikel odstranjen');
    await risiArtikleBox(box, orgId);
  }
  function preimenujArtikel(btn, box, orgId) {
    const li = btn.closest('li');
    const id = btn.dataset.art, cur = btn.dataset.nm || '';
    li.innerHTML = '<input type="text" class="art-ren-in"><span class="art-acts">' +
      '<button type="button" class="btn-mini art-ren-save">Shrani</button>' +
      '<button type="button" class="art-del art-ren-cancel" title="prekliči" aria-label="prekliči">×</button></span>';
    const inp = li.querySelector('.art-ren-in');
    inp.value = cur;
    inp.addEventListener('click', e => e.stopPropagation());
    inp.focus();
    const konec = () => risiArtikleBox(box, orgId);
    li.querySelector('.art-ren-cancel').addEventListener('click', e => { e.stopPropagation(); konec(); });
    const shrani = async () => {
      const nm = inp.value.trim();
      if (!nm || nm === cur) { konec(); return; }
      const { error } = await sb.from('articles').update({ name: nm }).eq('id', id);
      if (error) { toast('Napaka: ' + error.message); return; }
      toast('Artikel preimenovan');
      await konec();
    };
    li.querySelector('.art-ren-save').addEventListener('click', e => { e.stopPropagation(); shrani(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } else if (e.key === 'Escape') { konec(); } });
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
    $('katalogList').innerHTML = '<div class="rows"><div class="empty">Nalagam …</div></div>';
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

    var portalPanel =
      '<div class="panel">' +
        '<h3 class="sec-h">Namesti portal na telefon</h3>' +
        '<p class="uvoz-nav">Portal lahko dodaš na začetni zaslon telefona — odpre se čez cel zaslon, z ikono, kot prava aplikacija.</p>' +
        '<button type="button" class="btn btn-narrow" id="pwaInstall" style="display:none;margin-bottom:12px">Namesti aplikacijo</button>' +
        '<div class="por"><div class="por-op" id="pwaHint">' +
          '<b>Android:</b> tapni gumb »Namesti aplikacijo« zgoraj — ali meni brskalnika (⋮) → »Namesti aplikacijo«.<br><br>' +
          '<b>iPhone / iPad (Safari):</b> tapni gumb <b>Deli</b> (kvadratek s puščico) → podrsaj do <b>»Dodaj na začetni zaslon«</b> → <b>Dodaj</b>.' +
        '</div></div>' +
      '</div>';

    var tabletPanel = '<div class="panel" id="apkTablet"><h3 class="sec-h">Pralnica za tablico (Android)</h3><p class="u-sub">Preverjam …</p></div>';

    p.innerHTML = portalPanel + tabletPanel;
    wirePwa(p);

    fetch(url, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) throw new Error('ni ga');
      var mb = Number(r.headers.get('content-length') || 0) / 1048576;
      var t = document.getElementById('apkTablet');
      if (t) t.innerHTML =
        '<h3 class="sec-h">Pralnica za tablico (Android)</h3>' +
        '<p class="uvoz-nav">Za vnos in tiskanje spremnih listov. <b>To stran odpri na tablici</b> in tapni gumb — Android bo vprašal za dovoljenje za namestitev, dovoli ga.</p>' +
        '<p><a class="btn btn-narrow" href="' + escape_(url) + '" download>Prenesi aplikacijo' +
        (mb ? ' (' + mb.toFixed(1) + ' MB)' : '') + '</a></p>' +
        '<p class="u-sub" style="margin-top:14px">Po namestitvi: koda 9999 → Admin → Portal — povezava. ' +
        'Brez nameščanja deluje tudi <a href="tablica/" style="text-decoration:underline">spletna različica</a> (ne tiska in ne shranjuje PDF-jev).</p>';
    }).catch(function () {
      var t = document.getElementById('apkTablet');
      if (t) t.innerHTML =
        '<h3 class="sec-h">Pralnica za tablico (Android)</h3>' +
        '<div class="msg bad show">Namestitvenega paketa (<b>' + escape_(APK_POT) + '</b>) še ni na strežniku.</div>' +
        '<p class="u-sub" style="margin-top:12px">Medtem deluje <a href="tablica/" style="text-decoration:underline">spletna različica</a>, ki je ni treba nameščati.</p>';
    });
  }

  /* ══════════ MOJ RAČUN ══════════ */
  { const _if = $('imeForm'); if (_if) _if.addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('imeMsg'), btn = $('imeBtn');
    const ime = $('mojeIme').value.trim();
    if (!ime) { m.className = 'msg bad show'; m.textContent = 'Vpiši ime.'; return; }
    btn.disabled = true; btn.textContent = 'Shranjujem …';
    const { error } = await sb.from('profiles').update({ full_name: ime }).eq('id', JAZ);
    btn.disabled = false; btn.textContent = 'Shrani ime';
    if (error) { m.className = 'msg bad show'; m.textContent = 'Napaka: ' + error.message; return; }
    JAZIME = ime;
    nastaviWho(ime);
    if ($('domovNaslov') && !$('sec-domov').classList.contains('hidden')) $('domovNaslov').textContent = OSEBJE ? ('Pozdravljen/a, ' + prvoIme()) : $('domovNaslov').textContent;
    m.className = 'msg show'; m.textContent = 'Ime shranjeno.';
  }); }

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
      m.textContent = /weak|short|password/i.test(error.message) ? 'Geslo je prešibko. Uporabite vsaj 12 znakov, z velikimi in malimi črkami, številko in simbolom.' : 'Ni uspelo: ' + error.message;
      return;
    }
    ['curPw', 'chPw1', 'chPw2'].forEach(id => {
      $(id).value = '';
    });
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
    $('usersList').innerHTML = '<p class="u-sub">Nalagam …</p>';
    if (!$('nuOrg').options.length) {
      $('nuOrg').innerHTML = '<option value="">— osebje SmartClean —</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    }
    const [rLjudje, {
      data: clanstva
    }] = await Promise.all([sb.from('profiles').select('id,email,full_name,is_staff,active,last_login').order('email'), sb.from('memberships').select('user_id,org_id')]);
    let ljudje = rLjudje.data;
    if (rLjudje.error) { /* stolpec last_login še ni dodan — beri brez njega */
      const fb = await sb.from('profiles').select('id,email,full_name,is_staff,active').order('email');
      ljudje = fb.data;
    }
    const clanPo = {};
    (clanstva || []).forEach(c => {
      clanPo[c.user_id] = ORGIME[c.org_id];
    });
    $('usersList').innerHTML = (ljudje || []).map(u => {
      const jaz = u.id === JAZ;
      const vloga = u.is_staff ? 'osebje — vidi vse stranke' : clanPo[u.id] ? 'stranka — ' + escape_(clanPo[u.id]) : 'brez dostopa';
      return `<div class="u-row ${u.active ? '' : 'u-off'}">
      <div>
        <div class="u-mail">${escape_(u.full_name || u.email || '—')}
          ${jaz ? '<span class="pill">vi</span>' : ''}
          ${u.active ? '' : '<span class="pill">izklopljen</span>'}</div>
        <div class="u-sub">${u.full_name ? escape_(u.email) + ' · ' : ''}${vloga}</div>
        <div class="u-sub">Zadnja prijava: ${u.last_login ? datumcas(u.last_login) : 'še nikoli'}</div>
      </div>
      <div>${u.is_staff ? '<span class="u-sub">dostop do vseh strank</span>' : `<select data-org="${u.id}" ${jaz ? 'disabled' : ''}>
             <option value="">— brez dostopa —</option>
             ${ORGSEZNAM.map(o => `<option value="${o.id}"${clanPo[u.id] === o.name ? ' selected' : ''}>${escape_(o.name)}</option>`).join('')}
           </select>`}</div>
      <div class="u-acts">
        <button data-act="ime" data-id="${u.id}" data-ime="${escape_(u.full_name || '')}">preimenuj</button>
        ${jaz ? '' : `<button data-act="staff" data-id="${u.id}" data-v="${u.is_staff ? 0 : 1}">${u.is_staff ? 'v stranko' : 'v osebje'}</button>`}
        ${jaz ? '' : `<button data-act="active" data-id="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? 'izklopi' : 'vklopi'}</button>`}
        <button data-act="pw" data-id="${u.id}">novo geslo</button>
        ${jaz ? '' : `<button class="danger" data-act="del" data-id="${u.id}" data-m="${escape_(u.email || '')}">izbriši</button>`}
      </div>
    </div>`;
    }).join('') || '<p class="u-sub">Ni uporabnikov.</p>';
    document.querySelectorAll('#usersList select[data-org]').forEach(sel => {
      sel.addEventListener('change', () => nastaviStranko(sel.dataset.org, sel.value));
    });
    document.querySelectorAll('#usersList button[data-act]').forEach(b => {
      b.addEventListener('click', () => dejanje(b));
    });
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
    uMsg(orgId ? 'Dostop je dodeljen.' : 'Dostop je odvzet.');
    loadUsers();
  }
  async function dejanje(btn) {
    const id = btn.dataset.id,
      act = btn.dataset.act;
    btn.disabled = true;
    if (act === 'ime') {
      const novo = window.prompt('Ime in priimek uporabnika:', btn.dataset.ime || '');
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
      if (!confirm('Res izbrisati račun ' + btn.dataset.m + '? Tega ni mogoče razveljaviti.')) {
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

  /* ══════════ OBNOVITEV SEJE ══════════ */
  (async function () {
    if (!sb) return;
    let recovery = false;
    sb.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        recovery = true;
        showAuthPane('newPwForm');
        document.querySelector('.sub').textContent = 'Vpišite novo geslo za svoj račun.';
      }
    });
    const {
      data: {
        session
      }
    } = await sb.auth.getSession();
    setTimeout(() => {
      if (session && !recovery && autoLoginOn()) start();
    }, 60);
  })();

  /* Šele tu vemo, da se je celotna skripta prevedla in izvedla. */
  if (window.__SC) window.__SC.ok = true;
})();

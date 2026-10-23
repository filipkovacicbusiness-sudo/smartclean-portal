/* SmartClean RFID — aplikacija za ročni čitalec Chainway C72 (zaposleni)
   ─────────────────────────────────────────────────────────────────────
   Edino, kar je na C72 (aplikacija-rfid/ jo odpre kot kiosk). Zaposleni do portala nimajo dostopa;
   pravico »Aplikacija RFID« jim dodeli skrbnik v portalu (Uporabniki). Baza preverja vse sama
   (74_rfid_aplikacija.sql): čipi, označevanje, potrditev, imena strank in artiklov, tisk le
   spremnih listov, ki jih je ustvarila ta aplikacija.

   Kdo dela: osebe, ki so se na napravi enkrat prijavile z geslom; menjava s PIN-om (nastavi se v
   portalu, preveri se na napravi — enako kot tablica, 67_app_pini.sql). Zadnja oseba ostane prijavljena.

   Čitalec: aplikacija na C72 da window.ScRfid (vgrajen čitalec, R1 prek USB, UR4 prek omrežja) in
   dogodke »scrfid« (stanje, prebrani čipi). Brez nje (brskalnik, R1 kot tipkovnica) je polje za čip. */
(function () {
  'use strict';
  var cfg = window.SC_CONFIG || {};
  var sb = null;
  try {
    if (window.supabase && window.supabase.createClient && cfg.url) {
      sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { storageKey: 'sc-rfid-seja', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    }
  } catch (e) { sb = null; }
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    beri: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    pisi: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var NI_DOSTOPA = 'Ta račun nima dostopa do aplikacije RFID.';

  // ── pomožne (enako kot v portalu) ──
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stevilo(n) { return Number(n || 0).toLocaleString('sl-SI'); }
  function sklonKosov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'kos' : m === 2 ? 'kosa' : (m === 3 || m === 4) ? 'kosi' : 'kosov'); }
  function sklonListov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'spremni list' : m === 2 ? 'spremna lista' : (m === 3 || m === 4) ? 'spremni listi' : 'spremnih listov'); }
  function datumCas(ts) { return ts ? new Date(ts).toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
  function datumDan(d) { return d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }
  function tezaFmt(kg) {
    kg = Math.round((Number(kg) || 0) * 100) / 100;
    var v = kg >= 1000 ? kg / 1000 : kg, u = kg >= 1000 ? 't' : 'kg';
    return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',') + ' ' + u;
  }
  function zacetnice(ime) {
    var d = String(ime || '').trim().split(/\s+/).filter(Boolean);
    return ((d[0] || '?').charAt(0) + (d.length > 1 ? d[d.length - 1].charAt(0) : '')).toUpperCase();
  }
  function jeOmrezna(e) { return /fetch|network|load failed|timeout|ni povezave/i.test(String((e && (e.message || e.name)) || e || '')); }
  function napakaBesedilo(e) {
    var m = String((e && (e.message || e.error_description || e.details)) || e || '').trim(), k = String((e && e.code) || '');
    if (jeOmrezna(m)) return 'Ni povezave z internetom.';
    if (/jwt expired|invalid jwt|refresh token|not authenticated/i.test(m)) return 'Prijava je potekla.';
    if (k === '42501') return /[čšž]/i.test(m) ? m : 'Za to nimate dovoljenja.';
    if (/[čšžČŠŽ]/.test(m) && m.length < 160 && !/[a-z]+_[a-z]+|[{}]/.test(m)) return m;
    return 'Nekaj je šlo narobe. Poskusi znova.';
  }
  var _toast = null, _toastUra = null;
  function toast(t, akcija) {
    if (!_toast) { _toast = document.createElement('div'); _toast.className = 'sc-toast'; _toast.setAttribute('role', 'status'); _toast.setAttribute('aria-live', 'polite'); document.body.appendChild(_toast); }
    _toast.textContent = t;
    _toast.classList.toggle('z-akcijo', !!akcija);
    if (akcija) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sc-toast-akc'; b.textContent = akcija.besedilo;
      b.addEventListener('click', function () { _toast.classList.remove('show'); try { akcija.ob(); } catch (e) {} });
      _toast.appendChild(b);
    }
    requestAnimationFrame(function () { _toast.classList.add('show'); });
    clearTimeout(_toastUra); _toastUra = setTimeout(function () { _toast.classList.remove('show'); }, akcija ? 6000 : 3200);
  }
  function modal(opts, vnos) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4></h4><p></p>' + (vnos ? '<input type="text" class="sc-modal-input" autocomplete="off" autocapitalize="off" spellcheck="false">' : '') +
        '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no></button><button type="button" class="sc-modal-btn ' + (opts.nevarno ? 'danger' : 'primary') + '" data-yes></button></div></div>';
      back.querySelector('h4').textContent = opts.naslov || '';
      var p = back.querySelector('p'); if (opts.sporocilo) p.textContent = opts.sporocilo; else p.remove();
      var inp = back.querySelector('.sc-modal-input'); if (inp) { inp.value = opts.privzeto || ''; if (opts.placeholder) inp.placeholder = opts.placeholder; if (opts.tipkovnica) inp.inputMode = opts.tipkovnica; }
      back.querySelector('[data-no]').textContent = opts.preklici || 'Prekliči';
      back.querySelector('[data-yes]').textContent = opts.potrdi || 'Potrdi';
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(v) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', tipka); setTimeout(function () { back.remove(); }, 180); resolve(v); }
      function tipka(e) { if (e.key === 'Escape') zapri(vnos ? null : false); else if (e.key === 'Enter') { e.preventDefault(); zapri(vnos ? inp.value : true); } }
      back.querySelector('[data-no]').addEventListener('click', function () { zapri(vnos ? null : false); });
      back.querySelector('[data-yes]').addEventListener('click', function () { zapri(vnos ? inp.value : true); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(vnos ? null : false); });
      document.addEventListener('keydown', tipka);
      setTimeout(function () { if (inp) { inp.focus(); inp.select(); } else back.querySelector('[data-yes]').focus(); }, 60);
    });
  }
  function potrdiModal(o) { return modal(o, false); }
  function vnesiModal(o) { return modal(o, true); }
  function modalOdprt() { return !!document.querySelector('.sc-modal-back, .rfa-pin'); }

  // ── tema (sistemski pasovi v aplikaciji sledijo) ──
  function temaJe() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function temaNastavi(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('sc-rfid-tema', t); } catch (e) {}
    var barva = t === 'dark' ? '#0a0a0a' : '#ffffff';
    var mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute('content', barva);
    try { if (window.ScRfid) window.ScRfid.barva(barva); } catch (e) {}
  }

  /* ══════════ KDO DELA ══════════ */
  var OSEBE = LS.beri('sc-rfid-osebe', []); if (!Array.isArray(OSEBE)) OSEBE = [];
  function shraniOsebe() { LS.pisi('sc-rfid-osebe', OSEBE); }
  function oseba(uid) { return OSEBE.filter(function (o) { return o.uid === uid; })[0] || null; }
  var JAZ = null, STRANKE = [], IME = {};

  // vsaka osvežitev žetona gre v zapis osebe (žeton se ob osvežitvi zamenja; stari ne velja več)
  if (sb) sb.auth.onAuthStateChange(function (ev, s) {
    if (!s || !s.user || !s.refresh_token) return;
    var o = oseba(s.user.id); if (o && o.refresh !== s.refresh_token) { o.refresh = s.refresh_token; shraniOsebe(); }
  });

  function pokazi(kaj) {
    $('auth').hidden = kaj === 'app';
    $('app').hidden = kaj !== 'app';
    $('osebe').classList.toggle('hidden', kaj !== 'osebe');
    $('prijava').classList.toggle('hidden', kaj !== 'prijava');
    if (kaj !== 'app') { zapriMeni(); rfMostKlic('ustavi'); }
  }
  function risiOsebe(msg) {
    pokazi('osebe');
    var m = $('osebeMreza');
    m.innerHTML = OSEBE.map(function (o) {
      return '<div class="pp-tile-wrap"><button type="button" class="pp-tile" data-uid="' + esc(o.uid) + '"><span class="pp-av rfa-ini">' + esc(zacetnice(o.ime)) + '</span><span class="pp-nm">' + esc(o.ime) + '</span></button>' +
        '<button type="button" class="pp-tile-x" data-odstrani="' + esc(o.uid) + '" aria-label="Odstrani ' + esc(o.ime) + '"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    }).join('') + '<div class="pp-tile-wrap"><button type="button" class="pp-tile pp-add" id="osebaNova"><span class="pp-av">+</span><span class="pp-nm">Nova oseba</span></button></div>';
    $('osebeMsg').textContent = msg || '';
    m.querySelectorAll('[data-uid]').forEach(function (b) { b.addEventListener('click', function () { var o = oseba(b.dataset.uid); if (o) izberi(o); }); });
    m.querySelectorAll('[data-odstrani]').forEach(function (b) { b.addEventListener('click', function () { odstraniOsebo(b.dataset.odstrani); }); });
    $('osebaNova').addEventListener('click', function () { prijavaPokazi(); });
  }
  async function odstraniOsebo(uid) {
    var o = oseba(uid); if (!o) return;
    if (!(await potrdiModal({ naslov: 'Odstrani ' + o.ime + '?', potrdi: 'Odstrani', nevarno: true }))) return;
    OSEBE = OSEBE.filter(function (x) { return x.uid !== uid; }); shraniOsebe();
    if (LS.beri('sc-rfid-zadnji', null) === uid) LS.pisi('sc-rfid-zadnji', null);
    try { var s = (await sb.auth.getSession()).data.session; if (s && s.user.id === uid) await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    if (OSEBE.length) risiOsebe(); else prijavaPokazi();
  }
  function prijavaPokazi(msg, email) {
    pokazi('prijava');
    $('email').value = email || ''; $('geslo').value = '';
    $('prijavaMsg').textContent = msg || '';
    $('nazajOsebe').hidden = !OSEBE.length;
    setTimeout(function () { (email ? $('geslo') : $('email')).focus(); }, 60);
  }
  async function podatki() { var r = await sb.rpc('rfid_podatki'); if (r.error) throw r.error; return r.data || {}; }
  async function pinHash(uid) {
    try { var r = await sb.from('app_pini').select('hash').eq('user_id', uid).maybeSingle(); return (r.data && r.data.hash) ? String(r.data.hash) : ''; } catch (e) { return ''; }
  }
  async function prijava(e) {
    e.preventDefault();
    var em = $('email').value.trim(), pw = $('geslo').value, btn = $('prijavaBtn'), m = $('prijavaMsg');
    if (!em || !pw) { m.textContent = 'Vpiši e-poštni naslov in geslo.'; return; }
    if (!sb) { m.textContent = 'Ni povezave z internetom.'; return; }
    btn.disabled = true; btn.textContent = 'Prijavljam …'; m.textContent = '';
    try {
      var r = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (r.error) throw r.error;
      var s = r.data.session, p;
      try { p = await podatki(); }
      catch (er) { if (er && er.code === '42501') { try { await sb.auth.signOut({ scope: 'local' }); } catch (_) {} m.textContent = NI_DOSTOPA; return; } throw er; }
      var o = { uid: s.user.id, email: s.user.email || em, ime: p.ime || em, refresh: s.refresh_token, pin: await pinHash(s.user.id), napake: 0 };
      OSEBE = OSEBE.filter(function (x) { return x.uid !== o.uid; }); OSEBE.push(o); shraniOsebe();
      $('geslo').value = '';
      vstopi(o, p);
    } catch (er) {
      m.textContent = /invalid login|invalid_grant|credentials/i.test((er && er.message) || '') ? 'Napačen e-poštni naslov ali geslo.' : napakaBesedilo(er);
    } finally { btn.disabled = false; btn.textContent = 'Prijavi se'; }
  }
  function izberi(o) {
    if (o.pin) pinVnos(o, function () { preklopi(o); });
    else preklopi(o);
  }
  async function preklopi(o) {
    $('osebeMsg').textContent = '';
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s || s.user.id !== o.uid) {
        var r = await sb.auth.refreshSession({ refresh_token: o.refresh });
        if (r.error || !r.data || !r.data.session) throw (r.error || new Error('seja'));
      }
      var p = await podatki();
      vstopi(o, p);
      pinHash(o.uid).then(function (h) { if (h && h !== o.pin) { o.pin = h; shraniOsebe(); } });
    } catch (e) {
      if (e && e.code === '42501') { risiOsebe(NI_DOSTOPA); return; }
      if (jeOmrezna(e)) { risiOsebe('Ni povezave z internetom.'); return; }
      prijavaPokazi('Prijava je potekla.', o.email);
    }
  }
  function vstopi(o, p) {
    JAZ = { uid: o.uid, ime: p.ime || o.ime, skrbnik: !!p.skrbnik };
    if (p.ime && p.ime !== o.ime) { o.ime = p.ime; shraniOsebe(); }
    STRANKE = Array.isArray(p.stranke) ? p.stranke : []; IME = {};
    STRANKE.forEach(function (s) { IME[s.id] = s.ime; });
    if (RF.org && !IME[RF.org]) { RF.org = null; RF.art = ''; }
    LS.pisi('sc-rfid-zadnji', o.uid);
    $('jazIme').textContent = JAZ.ime; $('jazAv').textContent = zacetnice(JAZ.ime);
    pokazi('app');
    risiNacine(); rfRisi(); zivo();
    if (RF.sken.length) { rfPozabi(RF.sken); rfIsci(); }
  }
  function zamenjaj() { LS.pisi('sc-rfid-zadnji', null); JAZ = null; risiOsebe(); }

  // ── PIN: 4 števke, preveri se na napravi; po 5 napačnih čakanje (vsakič dlje), po 10 geslo ──
  var PIN_DOLZ = 4, PIN_ZAKLEP = 5, PIN_GESLO = 10;
  function b64Bajti(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function bajtiB64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  async function pbkdf2(pin, sol, it) {
    var k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sol, iterations: it }, k, 256);
  }
  async function pinPravilen(hash, pin) {
    var d = String(hash || '').split('$');
    if (d.length !== 5 || d[0] !== 'pbkdf2' || d[1] !== 'sha256') return false;
    var izr = bajtiB64(await pbkdf2(pin, b64Bajti(d[3]), parseInt(d[2], 10)));
    var r = izr.length ^ d[4].length; for (var i = 0; i < izr.length && i < d[4].length; i++) r |= izr.charCodeAt(i) ^ d[4].charCodeAt(i);
    return r === 0;
  }
  function pinVnos(o, ob) {
    if ((o.napake || 0) >= PIN_GESLO) { prijavaPokazi('Preveč napačnih kod.', o.email); return; }
    var el = document.createElement('div'); el.className = 'rfa-pin'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'PIN · ' + o.ime);
    var tipke = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'nazaj', '0', 'brisi'];
    el.innerHTML = '<div class="rfa-pin-in"><span class="pp-av rfa-ini">' + esc(zacetnice(o.ime)) + '</span><div class="rfa-pin-ime">' + esc(o.ime) + '</div>' +
      '<div class="rfa-pin-pike">' + new Array(PIN_DOLZ + 1).join('<i></i>') + '</div><p class="rfa-pin-msg" aria-live="polite"></p>' +
      '<div class="rfa-pin-tipke">' + tipke.map(function (t) {
        if (t === 'nazaj') return '<button type="button" class="tiho" data-t="nazaj">Nazaj</button>';
        if (t === 'brisi') return '<button type="button" class="tiho" data-t="brisi" aria-label="Izbriši"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-6 6M11 9l6 6"/></svg></button>';
        return '<button type="button" data-t="' + t + '">' + t + '</button>';
      }).join('') + '</div></div>';
    document.body.appendChild(el);
    var buf = '', preverjam = false, ura = null;
    var pike = el.querySelector('.rfa-pin-pike'), msg = el.querySelector('.rfa-pin-msg');
    function risi() { pike.querySelectorAll('i').forEach(function (p, i) { p.classList.toggle('on', i < buf.length); }); }
    function zaklenjen() { return (o.zaklepDo || 0) > Date.now(); }
    function odstevaj() {
      clearInterval(ura);
      var tik = function () {
        var s = Math.ceil(((o.zaklepDo || 0) - Date.now()) / 1000);
        el.querySelectorAll('[data-t]:not([data-t="nazaj"])').forEach(function (b) { b.disabled = s > 0; });
        msg.textContent = s > 0 ? 'Poskusi znova čez ' + (s >= 60 ? Math.ceil(s / 60) + ' min' : s + ' s') : '';
        if (s <= 0) clearInterval(ura);
      };
      tik(); ura = setInterval(tik, 1000);
    }
    function zapri() { clearInterval(ura); document.removeEventListener('keydown', tipkovnica, true); el.remove(); }
    async function preveri() {
      preverjam = true;
      var ok = false; try { ok = await pinPravilen(o.pin, buf); } catch (e) {}
      preverjam = false;
      if (ok) { o.napake = 0; o.zaklepDo = 0; shraniOsebe(); zapri(); ob(); return; }
      o.napake = (o.napake || 0) + 1;
      buf = ''; risi();
      pike.classList.remove('narobe'); void pike.offsetWidth; pike.classList.add('narobe');
      if (o.napake >= PIN_GESLO) { shraniOsebe(); zapri(); prijavaPokazi('Preveč napačnih kod.', o.email); return; }
      if (o.napake % PIN_ZAKLEP === 0) { o.zaklepDo = Date.now() + Math.min(15 * 60000, 30000 * Math.pow(2, o.napake / PIN_ZAKLEP - 1)); shraniOsebe(); odstevaj(); return; }
      shraniOsebe(); msg.textContent = 'Napačna koda.';
    }
    function pritisni(t) {
      if (preverjam) return;
      if (t === 'nazaj') { zapri(); return; }
      if (zaklenjen()) return;
      if (t === 'brisi') { buf = buf.slice(0, -1); risi(); return; }
      if (buf.length >= PIN_DOLZ) return;
      msg.textContent = ''; buf += t; risi();
      if (buf.length === PIN_DOLZ) setTimeout(preveri, 90);
    }
    function tipkovnica(e) {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pritisni(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); pritisni('brisi'); }
      else if (e.key === 'Escape') { e.preventDefault(); pritisni('nazaj'); }
    }
    el.querySelectorAll('[data-t]').forEach(function (b) { b.addEventListener('click', function () { pritisni(b.dataset.t); }); });
    document.addEventListener('keydown', tipkovnica, true);
    if (zaklenjen()) odstevaj();
  }

  // ── meni osebe: zamenjaj, tema, nastavitve naprave (le skrbnik, le v kiosku) ──
  function kiosk() { try { return !!(window.ScRfid && typeof window.ScRfid.kiosk === 'function' && window.ScRfid.kiosk()); } catch (e) { return false; } }
  function zapriMeni() { var m = document.querySelector('.dk-meni'); if (m) m.remove(); $('jaz').setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', meniZunaj, true); }
  function meniZunaj(e) { var m = document.querySelector('.dk-meni'); if (m && !m.contains(e.target) && !$('jaz').contains(e.target)) zapriMeni(); }
  function meni() {
    if (document.querySelector('.dk-meni')) { zapriMeni(); return; }
    var it = [['zamenjaj', 'Zamenjaj osebo'], ['tema', temaJe() === 'dark' ? 'Svetla tema' : 'Temna tema']];
    if (JAZ && JAZ.skrbnik && kiosk()) it.push(['naprava', 'Nastavitve naprave'], ['kiosk', 'Izklopi kiosk']);
    var m = document.createElement('div'); m.className = 'dk-meni'; m.setAttribute('role', 'menu');
    m.innerHTML = it.map(function (a) { return '<button type="button" role="menuitem" data-a="' + a[0] + '">' + esc(a[1]) + '</button>'; }).join('');
    document.body.appendChild(m);
    var r = $('jaz').getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, document.documentElement.clientWidth - m.offsetWidth - 8)) + 'px';
    $('jaz').setAttribute('aria-expanded', 'true');
    m.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        zapriMeni();
        if (b.dataset.a === 'zamenjaj') zamenjaj();
        else if (b.dataset.a === 'tema') temaNastavi(temaJe() === 'dark' ? 'light' : 'dark');
        else if (b.dataset.a === 'naprava') { try { window.ScRfid.nastavitve(); } catch (e) {} }
        else if (b.dataset.a === 'kiosk') {
          potrdiModal({ naslov: 'Izklopi kiosk?', potrdi: 'Izklopi', nevarno: true }).then(function (da) { if (da) { try { window.ScRfid.kioskIzklopi(); } catch (e) {} } });
        }
      });
    });
    setTimeout(function () { document.addEventListener('pointerdown', meniZunaj, true); }, 0);
  }

  /* ══════════ ČIPI ══════════
     Kos perila = čip (EPC) pri stranki + artikel (72_rfid.sql). Oddaja / Prevzem: skeniraš vse naenkrat
     (lahko več strank), aplikacija razvrsti po strankah, Potrdi pri oddaji vsaki ustvari spremni list.
     Označi: stranka + artikel + novi čipi. Poišči: skeniran kos (stranka, artikel, pranja, zgodovina). */
  var RF = { nacin: 'oddaja', idx: {}, vprasan: {}, sken: [], skenSet: {}, kljuc: null, org: null, art: '', arts: {}, rezultat: null, most: null, najdeni: null, gen: 0 };
  (function () {
    var n = LS.beri('sc-rfid-nacin', 'oddaja'); if (['oddaja', 'prevzem', 'oznaci', 'poisci'].indexOf(n) >= 0) RF.nacin = n;
    RF.org = LS.beri('sc-rfid-org', null); RF.art = LS.beri('sc-rfid-art', '') || '';
    var s = LS.beri('sc-rfid-sken', null);
    if (s && Array.isArray(s.sken)) { RF.sken = s.sken.filter(function (e) { return /^[0-9A-F]{8,64}$/.test(e); }); RF.kljuc = s.kljuc || null; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; }); }
  })();
  var RF_NACINI = [['oddaja', 'Oddaja'], ['prevzem', 'Prevzem'], ['oznaci', 'Označi'], ['poisci', 'Poišči']];
  var RF_PRALNICA_DNI = 3, RF_NEVIDEN_DNI = 45;
  var RF_TIPI = { oznacevanje: 'Označen', prevzem: 'Prevzem', oddaja: 'Oddaja', oznacen: 'Prestavljen', stanje: 'Stanje' };

  function rfEpc(s) { var e = String(s || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase(); return /^[0-9A-F]{8,64}$/.test(e) ? e : null; }
  function rfKratko(epc) { return '…' + String(epc || '').slice(-8); }
  function rfKljuc() { try { return crypto.randomUUID(); } catch (e) { return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); } }
  function rfShrani() { LS.pisi('sc-rfid-sken', { sken: RF.sken, kljuc: RF.kljuc }); }
  function rfPogresan(k) {
    if (k.stanje !== 'aktiven' || !k.zadnjic) return '';
    var dni = (Date.now() - new Date(k.zadnjic).getTime()) / 864e5;
    if (k.zadnji_tip === 'prevzem' && dni > RF_PRALNICA_DNI) return 'v pralnici od ' + datumCas(k.zadnjic);
    if (dni > RF_NEVIDEN_DNI) return 'nazadnje ' + datumCas(k.zadnjic);
    return '';
  }
  function rfKje(k) {
    if (k.stanje === 'izgubljen') return 'izgubljen';
    if (k.stanje === 'odpisan') return 'odpisan';
    return (k.zadnji_tip === 'prevzem' ? 'v pralnici' : 'pri stranki') + (k.zadnjic ? ' · ' + datumCas(k.zadnjic) : '');
  }
  function rfArtIme(k) { var a = (RF.arts[k.org_id] || []).filter(function (x) { return x.id === k.article_id; })[0]; return a ? a.ime : k.naziv; }
  function rfBliza() { return RF.nacin === 'oznaci' || RF.nacin === 'poisci'; }

  // čipi → kosi (vse stranke; isti EPC je lahko pri več strankah), po 150 na zahtevo
  var _rfIsciT = null, _rfIscem = null;
  function rfIsci(takoj) {
    clearTimeout(_rfIsciT);
    var izvedi = function () {
      if (_rfIscem) return _rfIscem;
      var manjka = RF.sken.filter(function (e) { return !RF.vprasan[e]; }).slice(0, 150);
      if (!manjka.length) return Promise.resolve();
      _rfIscem = (async function () {
        var r = await sb.from('rfid_kosi').select('id,epc,org_id,article_id,naziv,stanje').in('epc', manjka);
        if (r.error) throw r.error;
        manjka.forEach(function (e) { RF.vprasan[e] = 1; RF.idx[e] = []; });
        (r.data || []).forEach(function (k) { (RF.idx[k.epc] = RF.idx[k.epc] || []).push(k); });
      })().then(function () { _rfIscem = null; rfOsvezi(); if (RF.sken.some(function (e) { return !RF.vprasan[e]; })) return izvedi(); },
        function (e) { _rfIscem = null; throw e; });
      return _rfIscem;
    };
    if (takoj) return izvedi();
    _rfIsciT = setTimeout(function () { izvedi().catch(function (e) { if (jeOmrezna(e)) toast('Ni povezave z internetom.'); }); }, 300);
    return null;
  }
  function rfPozabi(epcs) { epcs.forEach(function (e) { delete RF.vprasan[e]; delete RF.idx[e]; }); }
  async function rfArtikli(org) {
    if (RF.arts[org]) return RF.arts[org];
    var r = await sb.rpc('rfid_artikli', { p_org: org });
    if (r.error) throw r.error;
    RF.arts[org] = Array.isArray(r.data) ? r.data : [];
    return RF.arts[org];
  }

  function risiNacine() {
    var t = $('nacini');
    t.innerHTML = RF_NACINI.map(function (n) {
      return '<button type="button" role="tab" class="pris-tab' + (n[0] === RF.nacin ? ' on' : '') + '" data-nacin="' + n[0] + '" aria-selected="' + (n[0] === RF.nacin) + '">' + n[1] + '</button>';
    }).join('');
    t.querySelectorAll('[data-nacin]').forEach(function (b) { b.addEventListener('click', function () { rfNacin(b.dataset.nacin); }); });
  }
  function rfNacin(n) {
    if (n === RF.nacin) return;
    // v Označi gredo le neoznačeni čipi: že označen kos bi se sicer potiho prestavil na drug artikel
    if (n === 'oznaci' && RF.sken.length) { RF.sken = RF.sken.filter(function (e) { return RF.vprasan[e] && !(RF.idx[e] || []).length; }); RF.skenSet = {}; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; }); rfShrani(); }
    RF.nacin = n; RF.rezultat = null; RF.najdeni = null;
    LS.pisi('sc-rfid-nacin', n);
    document.querySelectorAll('#nacini [data-nacin]').forEach(function (b) { var on = b.dataset.nacin === n; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    rfMocNastavi(rfMocNacin());
    rfRisi();
  }
  function rfRisi() {
    var t = $('rfTelo'); if (!t) return;
    if (RF.rezultat) { rfRisiRezultat(t); return; }
    if (RF.nacin === 'poisci') { rfRisiPoisci(t); return; }
    rfRisiSken(t);
  }

  // ── skeniranje ──
  function rfRisiSken(t) {
    var oz = RF.nacin === 'oznaci';
    var izb = oz ? '<div class="rfa-izb"><label><span>Stranka</span><select id="rfOrg"><option value="">Izberi stranko</option>' +
      STRANKE.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === RF.org ? ' selected' : '') + '>' + esc(s.ime) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Artikel</span><select id="rfArt"' + (RF.org ? '' : ' disabled') + '><option value="">Izberi artikel</option></select></label></div>' : '';
    t.innerHTML = '<div class="uc-card rf-sken">' + izb +
      '<div class="rf-stevec" aria-live="polite"><b id="rfN">0</b><span id="rfNlab"></span></div>' + rfVnosHtml() + '</div>' +
      '<div class="rf-rez" id="rfRez"></div><div class="u-acts rf-akc" id="rfAkc"></div>';
    if (oz) {
      $('rfOrg').addEventListener('change', function () { rfIzberiStranko($('rfOrg').value); });
      $('rfArt').addEventListener('change', function () { RF.art = $('rfArt').value; LS.pisi('sc-rfid-art', RF.art); rfOsvezi(); });
      if (RF.org) rfNapolniArtikle();
    }
    rfVezi();
    rfOsvezi();
  }
  async function rfIzberiStranko(org) {
    RF.org = org || null; RF.art = '';
    LS.pisi('sc-rfid-org', RF.org); LS.pisi('sc-rfid-art', '');
    var a = $('rfArt'); if (a) { a.innerHTML = '<option value="">Izberi artikel</option>'; a.disabled = !RF.org; }
    rfOsvezi();
    if (RF.org) rfNapolniArtikle();
  }
  async function rfNapolniArtikle() {
    var org = RF.org, a = $('rfArt'); if (!a || !org) return;
    try {
      var arts = await rfArtikli(org);
      if (org !== RF.org || !$('rfArt')) return;
      if (RF.art && !arts.some(function (x) { return x.id === RF.art; })) RF.art = '';
      a.innerHTML = '<option value="">Izberi artikel</option>' + arts.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === RF.art ? ' selected' : '') + '>' + esc(x.ime) + '</option>'; }).join('');
      a.disabled = false;
      rfOsvezi();
    } catch (e) { toast(napakaBesedilo(e)); }
  }
  function rfVnosHtml() {
    return RF_MOST ? rfCitHtml() : '<input type="text" id="rfVnos" class="sc-modal-input rf-vnos" placeholder="Skeniraj čip" aria-label="Skeniraj čip" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="enter">';
  }
  function rfVezi() {
    if (RF_MOST) rfCitVezi();
    else { rfVhod($('rfVnos'), rfDodaj); var i = $('rfVnos'); if (i && matchMedia('(pointer:fine)').matches) i.focus({ preventScroll: true }); }
  }
  // Čitalec kot tipkovnica: EPC in Enter (ali Tab, presledek); brez končnega znaka polna številka po kratkem premoru.
  function rfVhod(inp, ob) {
    if (!inp) return;
    var t = null;
    function obdelaj(vse) {
      clearTimeout(t);
      var v = inp.value; if (!v) return;
      var deli = v.split(/[\s,;]+/), zadnji = /[\s,;]$/.test(v) || vse ? '' : deli.pop();
      deli.forEach(function (d) { var e = rfEpc(d); if (e) ob(e); });
      inp.value = zadnji || '';
      if (zadnji) t = setTimeout(function () { var e = rfEpc(inp.value); if (e && e.length >= 24) { inp.value = ''; ob(e); } }, 500);
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Tab') { if (inp.value) { e.preventDefault(); obdelaj(true); } } });
    inp.addEventListener('input', function () { obdelaj(false); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9A-Fa-f]$/.test(e.key)) return;
    var inp = $('rfVnos'); if (!inp || $('app').hidden || modalOdprt()) return;
    var a = document.activeElement, tip = a && a.tagName;
    if (a === inp || tip === 'INPUT' || tip === 'TEXTAREA' || tip === 'SELECT') return;
    inp.focus({ preventScroll: true });
  }, true);

  var _rfRaf = 0;
  function rfDodaj(epc) {
    if (RF.nacin === 'poisci') { rfPoisci([epc]); return; }
    if (RF.nacin === 'oznaci' && !RF.org) return;
    if (RF.skenSet[epc]) return;
    if (!RF.sken.length) RF.kljuc = rfKljuc();   // novo skeniranje = nov ključ potrditve
    RF.skenSet[epc] = 1; RF.sken.push(epc); rfShrani();
    if (!_rfRaf) _rfRaf = requestAnimationFrame(function () { _rfRaf = 0; rfOsvezi(); });
    rfIsci();
  }
  function rfRazvrsti() {
    var str = {}, nezn = [], dvo = [], cakam = 0, znanih = 0;
    RF.sken.forEach(function (e) {
      if (!RF.vprasan[e]) { cakam++; return; }
      var vsi = (RF.idx[e] || []).filter(function (k) { return k.stanje !== 'odpisan'; });
      if (!vsi.length) { nezn.push(e); return; }
      var orgi = {}; vsi.forEach(function (k) { orgi[k.org_id] = 1; });
      if (Object.keys(orgi).length > 1) { dvo.push(e); return; }
      var k = vsi[0], g = str[k.org_id] || (str[k.org_id] = { org: k.org_id, ime: IME[k.org_id] || 'Stranka', n: 0, art: {} });
      g.n++; g.art[k.naziv] = (g.art[k.naziv] || 0) + 1; znanih++;
    });
    var seznam = Object.keys(str).map(function (o) { return str[o]; }).sort(function (a, b) { return a.ime.localeCompare(b.ime, 'sl'); });
    return { stranke: seznam, nezn: nezn, dvo: dvo, cakam: cakam, znanih: znanih };
  }
  function rfOsvezi() {
    var rez = $('rfRez'), nEl = $('rfN'), lab = $('rfNlab'); if (!rez || !nEl) return;
    var akc = $('rfAkc'), vrst = [];
    var vr = function (ime, n, razred, opis, gumb) {
      return '<div class="rf-vr' + (razred ? ' ' + razred : '') + '"><span class="rf-vr-t"><span class="rf-vr-ime">' + esc(ime) + '</span>' + (opis ? '<span class="rf-vr-op">' + esc(opis) + '</span>' : '') + '</span>' +
        (gumb || '') + '<b>' + stevilo(n) + '</b></div>';
    };
    var pocisti = '<button type="button" data-rf="pocisti"' + (RF.sken.length ? '' : ' disabled') + '>Počisti</button>';
    if (RF.nacin === 'oznaci') {
      var novi = 0, enaki = 0, prest = {}, drugje = 0;
      var cilj = ((RF.arts[RF.org] || []).filter(function (x) { return x.id === RF.art; })[0] || {}).ime || 'izbrani artikel';
      if (RF.org) RF.sken.forEach(function (e) {
        if (!RF.vprasan[e]) return;
        var vsi = RF.idx[e] || [], moj = vsi.filter(function (k) { return k.org_id === RF.org; })[0];
        if (!moj) { novi++; if (vsi.length) drugje++; }
        else if (RF.art && moj.article_id === RF.art) enaki++;
        else { var i = rfArtIme(moj); prest[i] = (prest[i] || 0) + 1; }
      });
      var nPrest = Object.keys(prest).reduce(function (s, i) { return s + prest[i]; }, 0), n = novi + nPrest;
      nEl.textContent = stevilo(n); lab.textContent = 'za označiti';
      if (novi) vrst.push(vr('Novi čipi', novi));
      Object.keys(prest).forEach(function (i) { vrst.push(vr('Prestavljeni', prest[i], 'opoz', i + ' → ' + cilj)); });
      if (enaki) vrst.push(vr('Že označeni', enaki, 'tiho'));
      if (drugje) vrst.push(vr('Tudi pri drugi stranki', drugje, 'opoz'));
      if (akc) akc.innerHTML = pocisti + '<button type="button" class="ur-save" data-rf="oznaci"' + (n && RF.org && RF.art ? '' : ' disabled') + '>' + (n ? 'Označi ' + sklonKosov(n) : 'Označi') + '</button>';
    } else {
      var r = rfRazvrsti(), odd = RF.nacin === 'oddaja';
      nEl.textContent = stevilo(r.znanih);
      lab.textContent = (r.znanih % 100 === 1 ? 'kos' : r.znanih % 100 === 2 ? 'kosa' : (r.znanih % 100 === 3 || r.znanih % 100 === 4) ? 'kosi' : 'kosov') + (r.stranke.length > 1 ? ' · ' + r.stranke.length + ' stranke' : '');
      r.stranke.forEach(function (g) {
        var arti = Object.keys(g.art).sort(function (a, b) { return g.art[b] - g.art[a] || a.localeCompare(b, 'sl'); });
        vrst.push('<div class="rf-str"><div class="rf-str-h"><span>' + esc(g.ime) + '</span><button type="button" class="cgrp-btn ghost" data-rf="odstrani" data-org="' + esc(g.org) + '">Odstrani</button><b>' + stevilo(g.n) + '</b></div>' +
          arti.map(function (i) { return '<div class="rf-str-a"><span>' + esc(i) + '</span><span>' + stevilo(g.art[i]) + '</span></div>'; }).join('') + '</div>');
      });
      if (r.nezn.length) vrst.push(vr('Neoznačeni', r.nezn.length, 'opoz', '', '<button type="button" class="cgrp-btn ghost" data-rf="v-oznaci">Označi</button>'));
      if (r.dvo.length) vrst.push(vr('Čip pri več strankah', r.dvo.length, 'opoz'));
      var ns = r.stranke.length;
      if (akc) akc.innerHTML = pocisti + '<button type="button" class="ur-save" data-rf="potrdi"' + (r.znanih && !r.cakam ? '' : ' disabled') + '>' +
        (odd ? (ns > 1 ? 'Potrdi · ' + ns + ' spremni listi' : 'Potrdi oddajo') : 'Potrdi prevzem') + '</button>';
    }
    rez.innerHTML = vrst.join('');
    [akc, rez].forEach(function (h) { if (h) h.querySelectorAll('[data-rf]').forEach(function (b) { b.addEventListener('click', function () { rfAkcija(b.dataset.rf, b); }); }); });
  }
  function rfPocisti() { RF.sken = []; RF.skenSet = {}; RF.kljuc = null; rfShrani(); rfOsvezi(); }
  async function rfAkcija(a, gumb) {
    if (a === 'pocisti') {
      var prej = RF.sken.slice(), kl = RF.kljuc; rfPocisti();
      toast('Počiščeno', { besedilo: 'Razveljavi', ob: function () { prej.forEach(function (e) { if (!RF.skenSet[e]) { RF.skenSet[e] = 1; RF.sken.push(e); } }); RF.kljuc = kl; rfShrani(); rfOsvezi(); } });
      return;
    }
    if (a === 'v-oznaci') { rfNacin('oznaci'); return; }
    if (a === 'odstrani') {   // čipi sosednjega vozička: stranko izločiš iz te potrditve
      var org = gumb.dataset.org, ven = RF.sken.filter(function (e) { return (RF.idx[e] || []).some(function (k) { return k.org_id === org && k.stanje !== 'odpisan'; }); });
      RF.sken = RF.sken.filter(function (e) { return ven.indexOf(e) < 0; }); RF.skenSet = {}; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; }); rfShrani(); rfOsvezi();
      toast((IME[org] || 'Stranka') + ' odstranjena', { besedilo: 'Razveljavi', ob: function () { ven.forEach(function (e) { if (!RF.skenSet[e]) { RF.skenSet[e] = 1; RF.sken.push(e); } }); rfShrani(); rfOsvezi(); } });
      return;
    }
    if (a === 'potrdi') { rfPotrdi(gumb); return; }
    if (a === 'oznaci') {
      gumb.disabled = true; gumb.classList.add('nalaga');
      try {
        var o = RF.org, epcs = RF.sken.filter(function (e) { var moj = (RF.idx[e] || []).filter(function (k) { return k.org_id === o; })[0]; return !moj || moj.article_id !== RF.art; });
        var r = await sb.rpc('rfid_oznaci', { p_org: o, p_article: RF.art, p_epcs: epcs });
        if (r.error) throw r.error;
        var n = (r.data.novih || 0) + (r.data.prestavljenih || 0), art = ((RF.arts[o] || []).filter(function (x) { return x.id === RF.art; })[0] || {}).ime || '';
        toast('Označeno: ' + sklonKosov(n) + (art ? ' · ' + art : ''));
        rfPozabi(RF.sken); RF.sken = []; RF.skenSet = {}; RF.kljuc = null; rfShrani(); rfOsvezi();
      } catch (e) { toast(napakaBesedilo(e)); gumb.disabled = false; }
      finally { gumb.classList.remove('nalaga'); }
    }
  }
  // Potrdi: pregled po strankah → baza zabeleži in pri oddaji ustvari spremne liste
  async function rfPotrdi(gumb) {
    try { await rfIsci(true); } catch (e) { toast(napakaBesedilo(e)); return; }
    var r = rfRazvrsti(), odd = RF.nacin === 'oddaja'; if (!r.znanih) return;
    var ok = await potrdiModal({
      naslov: odd ? (r.stranke.length > 1 ? 'Ustvari ' + r.stranke.length + ' spremne liste' : 'Ustvari spremni list') : 'Zabeleži prevzem',
      sporocilo: r.stranke.map(function (g) { return g.ime + ' · ' + sklonKosov(g.n); }).join('\n') + (r.nezn.length || r.dvo.length ? '\n\nNe šteje se: ' + sklonKosov(r.nezn.length + r.dvo.length) : ''),
      potrdi: odd ? 'Ustvari' : 'Zabeleži', preklici: 'Nazaj'
    });
    if (!ok) return;
    if (!RF.kljuc) RF.kljuc = rfKljuc();
    gumb.disabled = true; gumb.classList.add('nalaga');
    try {
      var x = await sb.rpc('rfid_potrdi', { p_tip: odd ? 'oddaja' : 'prevzem', p_epcs: RF.sken, p_kljuc: RF.kljuc, p_izdal: JAZ ? JAZ.ime : null });
      if (x.error) throw x.error;
      var listi = (x.data && x.data.listi) || [];
      rfPozabi(RF.sken); RF.sken = []; RF.skenSet = {}; RF.kljuc = null; rfShrani();
      if (odd) { RF.rezultat = { listi: listi }; rfRisi(); }
      else { toast('Prevzem zabeležen: ' + sklonKosov((x.data && x.data.kosov) || 0)); rfOsvezi(); }
    } catch (e) { toast(napakaBesedilo(e)); }   // ključ ostane: ponovna potrditev ne ustvari dvojnih listov
    finally { if (gumb.isConnected) { gumb.classList.remove('nalaga'); gumb.disabled = false; rfOsvezi(); } }
  }
  function rfRisiRezultat(t) {
    var listi = RF.rezultat.listi;
    t.innerHTML = '<div class="uc-card rf-rezultat"><h3 class="sec-h">' + (listi.length === 1 ? 'Spremni list ustvarjen' : 'Ustvarjeni spremni listi') + '</h3>' +
      '<div class="rf-listi">' + listi.map(function (l) { return '<div class="rf-list"><b>' + esc(l.stevilka || '') + '</b><span>' + esc(IME[l.org] || '') + '</span><span class="u-sub">' + sklonKosov(l.kosov) + '</span></div>'; }).join('') + '</div>' +
      '<div class="u-acts"><button type="button" data-rf-nova>Novo skeniranje</button><button type="button" class="ur-save" data-rf-tisk>' + IKO_TISK + 'Natisni</button></div></div>';
    t.querySelector('[data-rf-nova]').addEventListener('click', function () { RF.rezultat = null; rfRisi(); });
    t.querySelector('[data-rf-tisk]').addEventListener('click', function () { rfNatisni(listi.map(function (l) { return l.note; }).filter(Boolean), this); });
  }
  var IKO_TISK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';

  // ── Poišči: skeniran kos ──
  function rfRisiPoisci(t) {
    t.innerHTML = '<div class="uc-card rf-sken rf-isci">' + rfVnosHtml() + '</div><div id="rfaKos"></div>';
    rfVezi();
    rfRisiNajdene();
  }
  async function rfPoisci(epcs) {
    rfMostKlic('ustavi');
    var gen = ++RF.gen;
    try {
      var r = await sb.from('rfid_kosi').select('id,epc,org_id,article_id,naziv,stanje,pranj,zadnji_tip,zadnjic,created_at').in('epc', epcs.slice(0, 50));
      if (r.error) throw r.error;
      if (gen !== RF.gen) return;
      var vsi = r.data || [], prvi = epcs.filter(function (e) { return vsi.some(function (k) { return k.epc === e; }); })[0] || epcs[0];
      RF.najdeni = { epc: prvi, kosi: vsi.filter(function (k) { return k.epc === prvi; }), zgod: {} };
      rfRisiNajdene();
      RF.najdeni.kosi.forEach(function (k) { rfZgodovina(k, gen); });
    } catch (e) { toast(napakaBesedilo(e)); }
  }
  async function rfZgodovina(k, gen) {
    try {
      var r = await Promise.all([
        sb.from('rfid_seje').select('tip,created_at').contains('kosi', [k.id]).order('created_at', { ascending: false }).limit(12),
        sb.from('rfid_dogodki').select('tip,opis,created_at').eq('kos_id', k.id).order('created_at', { ascending: false }).limit(12)
      ]);
      if (gen !== RF.gen || !RF.najdeni) return;
      var v = (r[0].data || []).map(function (s) { return { t: RF_TIPI[s.tip] || s.tip, d: s.created_at }; })
        .concat((r[1].data || []).map(function (d) { return { t: (RF_TIPI[d.tip] || d.tip) + (d.opis ? ' · ' + d.opis : ''), d: d.created_at }; }))
        .sort(function (a, b) { return String(b.d).localeCompare(String(a.d)); }).slice(0, 12);
      RF.najdeni.zgod[k.id] = v;
      rfRisiNajdene();
    } catch (e) {}
  }
  function rfRisiNajdene() {
    var el = $('rfaKos'); if (!el) return;
    var n = RF.najdeni; if (!n) { el.innerHTML = ''; return; }
    if (!n.kosi.length) { el.innerHTML = '<div class="uc-card rfa-prazno"><h3>Čip ' + esc(rfKratko(n.epc)) + ' ni označen</h3></div>'; return; }
    el.innerHTML = n.kosi.map(function (k) {
      var p = rfPogresan(k), cls = k.stanje !== 'aktiven' ? ' tiho' : p ? ' opoz' : '';
      var zg = n.zgod[k.id];
      return '<div class="uc-card rfa-kos"><h3>' + esc(k.naziv || 'Kos') + '</h3><span class="rfa-kos-stanje' + cls + '">' + esc(p || rfKje(k)) + '</span>' +
        '<dl class="okno-dl"><dt>Stranka</dt><dd>' + esc(IME[k.org_id] || '') + '</dd><dt>Pranj</dt><dd>' + stevilo(k.pranj || 0) + '</dd><dt>Označen</dt><dd>' + esc(datumCas(k.created_at)) + '</dd><dt>Čip</dt><dd class="rf-epc">' + esc(k.epc) + '</dd></dl>' +
        (zg && zg.length ? '<div class="rf-zgod">' + zg.map(function (z) { return '<div class="rf-zg"><span>' + esc(z.t) + '</span><span class="u-sub">' + esc(datumCas(z.d)) + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
    }).join('');
  }

  /* ══════════ TISK (dokument enak kot v portalu in na tablici) ══════════ */
  var DOK_BIZ = ['BSMART d.o.o.', 'Škalska cesta 6, 3210 Slovenske Konjice', '+386 41 209 676', '+386 68 693 988', 'blanka.kovacic1@gmail.com'];
  function dokPisave() {
    var f = location.origin + '/fonts/';
    return "@font-face{font-family:'Archivo';font-weight:100 900;font-display:swap;src:url('" + f + "archivo-latin-wght-normal.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}" +
      "@font-face{font-family:'Archivo';font-weight:100 900;font-display:swap;src:url('" + f + "archivo-latin-ext-wght-normal.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}" +
      "@font-face{font-family:'Playfair Display';font-weight:700;font-display:swap;src:url('" + f + "playfair-display-latin-700-normal.woff2') format('woff2')}";
  }
  var DOK_CSS = '@page{size:A4;margin:0}' +
    '*{box-sizing:border-box}html{background:#e9edeb}' +
    "body{margin:0;background:#e9edeb;color:#0a0a0a;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    '.a4{position:relative;padding:12mm 12mm 14mm;color:#0a0a0a;background:#fff;min-height:297mm;break-after:page}' +
    '.a4:last-child{break-after:auto}.a4+.a4{margin-top:14px}' +
    '@media print{html,body{background:#fff}.a4{min-height:0}.a4+.a4{margin-top:0}}' +
    '.sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1.5px solid #0a0a0a}' +
    ".sc-wm{font-family:'Playfair Display',serif;font-weight:700;letter-spacing:-.03em;line-height:.9;font-size:32px;color:#0d1f17;white-space:nowrap}" +
    '.sc-wm span{color:#1a6644}' +
    '.sc-biz{font-size:9px;line-height:1.6;text-align:right;color:#666;white-space:nowrap;font-weight:500}' +
    '.sc-box{border:1px solid #dcdcdc;border-radius:9px;padding:10px 14px;margin-bottom:10px}' +
    '.sc-num{font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:12px}' +
    '.sc-num b{font-variant-numeric:tabular-nums;letter-spacing:.01em}' +
    '.sc-client{display:flex;justify-content:space-between;gap:14px}.sc-client .cl{font-size:12px}' +
    '.sc-client .cname{font-weight:700;border-bottom:2px solid #0a0a0a;padding:0 2px}' +
    '.sc-client .cname-sec{font-weight:400;color:#6b7280;font-size:.85em;margin-left:4px}' +
    '.sc-client .sc-dates{margin-top:10px;font-size:11px;color:#666}' +
    '.sc-sign{border-left:1px solid #dcdcdc;padding-left:16px;font-weight:600;font-size:12px;min-width:110px;color:#666}' +
    'table.sc-table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}' +
    'table.sc-table th{color:#0a0a0a;font-weight:700;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:0 8px 8px;text-align:center;border-bottom:1.5px solid #0a0a0a}' +
    'table.sc-table th.l{text-align:left}' +
    'table.sc-table td{border-bottom:1px solid #ececec;padding:5px 8px;height:15px;font-variant-numeric:tabular-nums}' +
    'table.sc-table td.an{color:#0a0a0a;font-weight:600;text-align:left}' +
    'table.sc-table td.qty{text-align:center;font-weight:700;width:34%;color:#0a0a0a}' +
    '.sc-weight{margin-top:12px;font-size:12px;color:#0a0a0a;text-align:right;font-weight:600}' +
    '.sc-note{margin-top:10px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;white-space:pre-wrap}';
  function dokHtml(naslov, telesa) {
    var glava = '<div class="sc-head"><div class="sc-wm">Smart<span>Clean</span></div><div class="sc-biz">' + DOK_BIZ.map(esc).join('<br>') + '</div></div>';
    return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(naslov) + '</title><style>' + dokPisave() + DOK_CSS + '</style></head><body>' +
      telesa.map(function (t) { return '<div class="a4">' + glava + t + '</div>'; }).join('') + '</body></html>';
  }
  function listTelo(n) {
    var naziv = n.podjetje || n.stranka || '—', nazivSek = (n.podjetje && n.stranka && n.stranka !== n.podjetje) ? n.stranka : '';
    var post = Array.isArray(n.postavke) ? n.postavke : [];
    var rows = post.length ? post.map(function (p) { return '<tr><td class="an">' + esc(p.naziv) + '</td><td class="qty">' + stevilo(p.kosov) + '</td></tr>'; }).join('')
      : '<tr><td class="an" colspan="2" style="color:#888">Ni postavk</td></tr>';
    var izdal = n.issued_name ? ' &nbsp;·&nbsp; Izdal: ' + esc(n.issued_name) : '';
    var prevoz = ' &nbsp;·&nbsp; ' + (n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz');
    var kg = Number(n.weight_kg) > 0 ? '<div class="sc-weight">Skupaj teža perila: <b>' + tezaFmt(n.weight_kg) + '</b></div>' : '';
    var opomba = n.opomba_stranka ? '<div class="sc-note"><b>Opomba:</b> ' + esc(n.opomba_stranka) + '</div>' : '';
    return '<div class="sc-box sc-num"><span>Št. spremnega lista: <b>' + esc(n.number) + '</b></span></div>' +
      '<div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">' + esc(naziv) + '</span>' + (nazivSek ? ' <span class="cname-sec">(' + esc(nazivSek) + ')</span>' : '') + '</div>' +
      '<div class="sc-dates">Oddaja: ' + datumDan(n.doc_date) + izdal + prevoz + '</div></div><div class="sc-sign">Podpis:</div></div>' +
      '<table class="sc-table"><thead><tr><th class="l">Naziv artikla</th><th>Oddaja (št. kosov)</th></tr></thead><tbody>' + rows + '</tbody></table>' + kg + opomba;
  }
  var _tiskamDo = 0;
  async function rfNatisni(ids, gumb) {
    if (!ids.length || Date.now() < _tiskamDo) return;   // dvojni dotik ne pošlje dvakrat
    gumb.disabled = true; gumb.classList.add('nalaga');
    try {
      var r = await sb.rpc('rfid_tisk', { p_notes: ids });
      if (r.error) throw r.error;
      var listi = Array.isArray(r.data) ? r.data : [];
      if (!listi.length) { toast('Spremnih listov ni bilo mogoče naložiti.'); return; }
      var telesa = []; listi.forEach(function (n) { telesa.push(listTelo(n), listTelo(n)); });   // dva izvoda, kot na tablici
      var naslov = listi.length === 1 ? 'Spremni list ' + listi[0].number : sklonListov(listi.length);
      var html = dokHtml(naslov, telesa);
      _tiskamDo = Date.now() + 3500;
      if (window.ScRfid && typeof window.ScRfid.natisni === 'function') window.ScRfid.natisni(html, naslov);
      else natisniPrekIframe(html);
    } catch (e) { toast(napakaBesedilo(e)); }
    finally { gumb.disabled = false; gumb.classList.remove('nalaga'); }
  }
  function natisniPrekIframe(doc) {
    var star = $('rfaTisk'); if (star) star.remove();
    var ifr = document.createElement('iframe'); ifr.id = 'rfaTisk'; ifr.setAttribute('aria-hidden', 'true');
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(ifr);
    var klican = false;
    function natisni() {
      if (klican) return; klican = true;
      var w = ifr.contentWindow, pis = Promise.resolve(); try { pis = w.document.fonts.ready; } catch (e) {}
      Promise.race([pis, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () { try { w.focus(); w.print(); } catch (e) { toast('Tiskanje ni uspelo.'); } });
    }
    ifr.onload = natisni; ifr.srcdoc = doc; setTimeout(natisni, 2500);
  }

  /* ══════════ ČITALEC (aplikacija na C72) ══════════ */
  var RF_MOST = (function () { try { return window.ScRfid && typeof window.ScRfid.stanje === 'function' ? window.ScRfid : null; } catch (e) { return null; } })();
  var RF_BRALNIKI = { vgrajen: 'Vgrajen čitalec', r1: 'R1 · USB', ur4: 'UR4 · omrežje', preizkus: 'Preizkus' };
  var RF_MOC = { blizu: 10, srednje: 20, dalec: 30 }, RF_MOC_IME = [['blizu', 'Blizu'], ['srednje', 'Srednje'], ['dalec', 'Daleč']];
  function rfMostStanje() { if (!RF.most && RF_MOST) { try { RF.most = JSON.parse(RF_MOST.stanje()) || {}; } catch (e) { RF.most = {}; } } return RF.most || {}; }
  function rfMostKlic(fn, arg) { try { if (RF_MOST) RF_MOST[fn](arg); } catch (e) {} }
  // doseg po načinu: označevanje in iskanje blizu (le kos v roki), oddaja in prevzem daleč (cel voziček)
  function rfMocNacin() { var m = LS.beri('sc-rfid-moc', {}) || {}; return RF_MOC[m[RF.nacin]] ? m[RF.nacin] : (rfBliza() ? 'blizu' : 'dalec'); }
  function rfMocNastavi(st, shrani) {
    if (shrani) { var m = LS.beri('sc-rfid-moc', {}) || {}; m[RF.nacin] = st; LS.pisi('sc-rfid-moc', m); }
    rfMostKlic('moc', RF_MOC[st]);
  }
  function rfMocStopnja(dbm) { return dbm <= 14 ? 'blizu' : dbm <= 24 ? 'srednje' : 'dalec'; }
  function rfCitHtml() {
    return '<div class="rf-cit" id="rfCit"><div class="rf-cit-vr"><span class="rf-cit-izb"><select id="rfBralnik" aria-label="Čitalec"></select>' +
      '<button type="button" class="cgrp-btn ghost" data-ur4 hidden>Naslov</button></span>' +
      '<span class="pris-tabs rf-moc" role="tablist" aria-label="Doseg">' + RF_MOC_IME.map(function (m) { return '<button type="button" role="tab" class="pris-tab" data-moc="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</span></div>' +
      '<p class="rf-cit-nap" aria-live="polite" hidden></p>' +
      '<button type="button" class="rf-beri" id="rfBeri"><i class="rf-pika" aria-hidden="true"></i><span></span></button></div>';
  }
  function rfCitVezi() {
    var c = $('rfCit'); if (!c) return;
    var sel = $('rfBralnik');
    sel.addEventListener('change', function () {
      var v = sel.value; if (v === rfMostStanje().izbran) return;
      if (v === 'ur4' && !rfMostStanje().ur4) { rfUr4Naslov(); return; }
      rfMostKlic('izberi', v);
    });
    c.querySelectorAll('[data-moc]').forEach(function (b) { b.addEventListener('click', function () { rfMocNastavi(b.dataset.moc, true); }); });
    c.querySelector('[data-ur4]').addEventListener('click', rfUr4Naslov);
    $('rfBeri').addEventListener('click', function () {
      var s = rfMostStanje();
      if (s.bere) rfMostKlic('ustavi');
      else if (s.povezan) rfMostKlic('zacni');
      else if (s.izbran === 'ur4' && !s.ur4) rfUr4Naslov();
      else rfMostKlic('izberi', s.izbran);   // ponovna povezava
    });
    rfCitOsvezi();
  }
  async function rfUr4Naslov() {
    var v = await vnesiModal({ naslov: 'Naslov UR4', privzeto: rfMostStanje().ur4 || '', placeholder: '192.168.1.200', potrdi: 'Poveži', tipkovnica: 'decimal' });
    if (v != null && v.trim()) rfMostKlic('ur4', v.trim()); else rfCitOsvezi();
  }
  function rfCitOsvezi() {
    var c = $('rfCit'); if (!c) return;
    var s = rfMostStanje(), sel = $('rfBralnik'), bral = s.bralniki || [];
    var ime = function (b) { return RF_BRALNIKI[b.id] || b.ime; };
    var kl = bral.map(ime).join(',');
    if (sel.dataset.k !== kl) { sel.dataset.k = kl; sel.innerHTML = bral.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(ime(b)) + '</option>'; }).join(''); }
    if (s.izbran && sel.value !== s.izbran) sel.value = s.izbran;
    var st = s.odpiram ? 'odpiram' : s.bere ? 'bere' : s.povezan ? 'pripravljen' : 'napaka';
    c.dataset.st = st;
    var nap = c.querySelector('.rf-cit-nap'); nap.hidden = st !== 'napaka'; nap.textContent = st === 'napaka' ? (s.napaka || 'Čitalec ni povezan.') : '';
    var stop = rfMocStopnja(s.moc || 20);
    c.querySelectorAll('[data-moc]').forEach(function (b) { var on = b.dataset.moc === stop; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    var u4 = c.querySelector('[data-ur4]'); u4.hidden = s.izbran !== 'ur4'; u4.textContent = s.ur4 || 'Naslov';   // naslov UR4 na gumbu (dotik = sprememba)
    var g = $('rfBeri');
    g.querySelector('span').textContent = st === 'bere' ? 'Ustavi' : st === 'odpiram' ? 'Povezujem' : st === 'napaka' ? 'Poveži' : 'Beri';
    g.disabled = st === 'odpiram'; g.classList.toggle('on', st === 'bere');
  }
  // prebrani čipi iz aplikacije
  function rfMostEpci(seznam) {
    if ($('app').hidden || modalOdprt()) return;   // med potrjevanjem se skeniranje ne spreminja
    var epci = seznam.map(rfEpc).filter(Boolean); if (!epci.length) return;
    if (RF.rezultat) { RF.rezultat = null; rfRisi(); }
    if (RF.nacin === 'poisci') { rfPoisci(epci); return; }   // prvi označen čip se odpre, branje se ustavi
    if (RF.nacin === 'oznaci' && !RF.org) return;
    epci.forEach(rfDodaj);
  }
  if (RF_MOST) {
    window.addEventListener('scrfid', function (ev) {
      var d = ev.detail || {};
      if (d.tip === 'stanje') {
        var prej = RF.most || {}; RF.most = d; rfCitOsvezi();
        if (d.bere && !prej.bere && RF.rezultat && !$('app').hidden && !modalOdprt()) { RF.rezultat = null; rfRisi(); }   // nov pritisk po ustvarjenih listih = novo skeniranje
      } else if (d.tip === 'epc' && Array.isArray(d.epc)) rfMostEpci(d.epc);
    });
    rfMocNastavi(rfMocNacin());
  }

  /* ══════════ ŽIVO: druga naprava (portal, drug C72) je označila ali potrdila ══════════ */
  var _kanal = null, _zivT = null;
  function zivo() {
    if (_kanal || !sb || !sb.channel) return;
    try {
      _kanal = sb.channel('rfid-aplikacija')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rfid_kosi' }, zivCipi)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rfid_seje' }, zivCipi)
        .subscribe();
    } catch (e) { _kanal = null; }
  }
  function zivCipi() {
    clearTimeout(_zivT);
    _zivT = setTimeout(function () {
      if ($('app').hidden) return;
      if (RF.sken.length) { rfPozabi(RF.sken); rfIsci(); }
      if (RF.nacin === 'poisci' && RF.najdeni) rfPoisci([RF.najdeni.epc]);
    }, 900);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && JAZ) zivCipi(); });

  /* ══════════ ZAGON ══════════ */
  async function zagon() {
    temaNastavi(temaJe());
    $('prijavaForm').addEventListener('submit', prijava);
    $('nazajOsebe').addEventListener('click', function () { risiOsebe(); });
    $('temaAuth').addEventListener('click', function () { temaNastavi(temaJe() === 'dark' ? 'light' : 'dark'); });
    $('jaz').addEventListener('click', meni);
    if (!sb) { prijavaPokazi('Ni povezave z internetom.'); return; }
    var zadnji = LS.beri('sc-rfid-zadnji', null), o = zadnji && oseba(zadnji), s = null;
    try { s = (await sb.auth.getSession()).data.session; } catch (e) {}
    if (o && s && s.user && s.user.id === o.uid) {   // zadnja oseba ostane prijavljena
      try { vstopi(o, await podatki()); return; }
      catch (e) {
        if (e && e.code === '42501') { risiOsebe(NI_DOSTOPA); return; }
        if (jeOmrezna(e)) { risiOsebe('Ni povezave z internetom.'); return; }
      }
    }
    if (OSEBE.length) risiOsebe(); else prijavaPokazi();
  }
  window.addEventListener('online', function () { if (!JAZ && !$('osebe').classList.contains('hidden')) zagon2(); });
  function zagon2() { var zadnji = LS.beri('sc-rfid-zadnji', null), o = zadnji && oseba(zadnji); if (o) preklopi(o); else $('osebeMsg').textContent = ''; }
  if ('serviceWorker' in navigator && location.protocol === 'https:') { try { navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) {} }
  zagon();
})();

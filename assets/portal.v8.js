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

  /* ── tema ─────────────────────────────────────────────────────────── */
  try {
    const t = localStorage.getItem('sc-portal-theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  } catch (e) {}
  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('sc-portal-theme', next);
    } catch (e) {}
  });

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
    OSEBJE = false,
    MOJEPODJETJE = null;
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
    $('auth').style.display = 'none';
    $('app').classList.add('show');
    JAZ = user.id;
    const {
      data: profil
    } = await sb.from('profiles').select('full_name,is_staff').eq('id', user.id).maybeSingle();
    OSEBJE = !!(profil !== null && profil !== void 0 && profil.is_staff);
    $('who').textContent = ((profil === null || profil === void 0 ? void 0 : profil.full_name) || user.email) + (OSEBJE ? ' · osebje' : '');
    JAZIME = (profil && profil.full_name) || user.email;
    $('racunPod').textContent = user.email;
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
    arhiv: '<path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V20l-4-2-4 2-4-2-4 2Z"/><path d="M8 9.5h8M8 13.5h5"/>',
    stranke: '<path d="M3 20h18"/><path d="M5 20V6l7-3 7 3v14"/><path d="M9.5 20v-4h5v4"/>',
    katalog: '<path d="M4 5.5h7v13H4Z"/><path d="M13 5.5h7v13h-7Z"/>',
    uporabniki: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="10" r="2.4"/><path d="M15.5 19a4.5 4.5 0 0 1 5-4.4"/>',
    racun: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    uvoz: '<path d="M12 3v11"/><path d="M8 10.5 12 14.5l4-4"/><path d="M4 16v3.5h16V16"/>',
    aplikacija: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5.5h3"/><path d="M12 18.2h.01"/>'
  };
  const ikona = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IKONE[k] + '</svg>';
  function meni() {
    const deli = OSEBJE ? [['domov', 'Pregled'], ['arhiv', 'Arhiv'], ['stranke', 'Stranke'], ['uvoz', 'Uvoz'], ['aplikacija', 'Aplikacija'], ['uporabniki', 'Uporabniki'], ['racun', 'Moj račun']] : [['domov', 'Pregled'], ['arhiv', 'Arhiv'], ['katalog', 'Katalog'], ['racun', 'Moj račun']];
    $('side').innerHTML = '<p class="side-h">' + (OSEBJE ? 'Pralnica' : 'Vaš pregled') + '</p>' + deli.slice(0, deli.length - 1).map(([k, l]) => `<a data-go="${k}">${ikona(k)}${l}</a>`).join('') + '<p class="side-h">Nastavitve</p>' + `<a data-go="racun">${ikona('racun')}Moj račun</a>`;
    document.querySelectorAll('#side a[data-go]').forEach(a => {
      a.addEventListener('click', () => {
        pojdi(a.dataset.go);
        zapriMeni();
      });
    });
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
    window.scrollTo(0, 0);
    if (kam === 'domov') risiPregled();
    if (kam === 'arhiv') risiArhiv();
    if (kam === 'stranke') risiStranke();
    if (kam === 'katalog') risiKatalog();
    if (kam === 'uporabniki') loadUsers();
    if (kam === 'aplikacija') risiAplikacijo();
  }

  /* ══════════ SPREMNI LISTI ══════════ */
  async function naloziListe() {
    const {
      data,
      error
    } = await sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source').order('doc_date', {
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
    $('domovNaslov').textContent = OSEBJE ? 'Pregled' : MOJEPODJETJE ? MOJEPODJETJE.name : 'Vaš pregled';
    $('domovPod').textContent = OSEBJE ? ORGSEZNAM.length + ' strank v bazi' : MOJEPODJETJE ? [MOJEPODJETJE.legal_name, MOJEPODJETJE.address].filter(Boolean).join(' · ') : '';
    const zdaj = new Date();
    const zacetekMeseca = new Date(zdaj.getFullYear(), zdaj.getMonth(), 1);
    const vMesecu = LISTI.filter(l => new Date(l.doc_date) >= zacetekMeseca);
    const kosovMesec = vMesecu.reduce((s, l) => s + (l.total_pieces || 0), 0);
    const kosovSkupaj = LISTI.reduce((s, l) => s + (l.total_pieces || 0), 0);
    const zadnji = LISTI[0];
    const pred90 = new Date(zdaj.getTime() - 90 * 864e5);
    const aktivnih = new Set(LISTI.filter(l => new Date(l.doc_date) >= pred90).map(l => l.org_id)).size;
    const kartice = OSEBJE ? [['Spremnih listov', stevilo(VSEHLISTOV), 'skupaj v bazi'], ['Ta mesec', stevilo(vMesecu.length), stevilo(kosovMesec) + ' kosov'], ['Aktivnih strank', stevilo(aktivnih), 'v zadnjih 90 dneh'], ['Zadnji prevzem', zadnji ? datum(zadnji.doc_date) : '—', zadnji ? ORGIME[zadnji.org_id] || '' : 'še ni podatkov']] : [['Prevzemov', stevilo(VSEHLISTOV), 'skupaj'], ['Ta mesec', stevilo(vMesecu.length), stevilo(kosovMesec) + ' kosov'], ['Kosov skupaj', stevilo(kosovSkupaj), 'v vseh prevzemih'], ['Zadnji prevzem', zadnji ? datum(zadnji.doc_date) : '—', zadnji ? stevilo(zadnji.total_pieces) + ' kosov' : 'še ni podatkov']];
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
    $('zadnji').innerHTML = '<h3 class="sec-h">Zadnji prevzemi</h3>' + tabelaListov(LISTI.slice(0, 5), false);
  }

  /* ══════════ ARHIV ══════════ */
  function tabelaListov(vrstice, klikljivo) {
    if (!vrstice.length) return prazniListi(OSEBJE ? 'osebje' : 'stranka');
    return '<div class="rows">' + vrstice.map((l, i) => `
    <button class="a-row" type="button" data-i="${i}" data-id="${l.id}" aria-expanded="false"
      ${klikljivo ? '' : 'style="cursor:default"'}>
      <span class="a-num">${escape_(l.number || '—')}</span>
      <span class="a-cli">${escape_(OSEBJE ? ORGIME[l.org_id] || '—' : l.issued_name || '')}</span>
      <span class="num">${datum(l.doc_date)}</span>
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
    const sortv = ($('arhivSort') && $('arhivSort').value) || 'datum';
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
    const izdalV = n.issued_name ? `<p class="u-sub" style="margin-top:8px">Izdal: ${escape_(n.issued_name)}</p>` : '';
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
      <p class="u-sub" style="margin:10px 0 4px">Postavke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj postavko</button>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Shrani</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<input type="text" data-pn placeholder="artikel" value="${escape_(naziv)}"><input type="number" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      row.querySelector('[data-del]').addEventListener('click', () => row.remove());
      pBox.appendChild(row);
    };
    (box._items || []).forEach(p => dodajVrstico(p.naziv, p.kosov));
    if (!(box._items || []).length) dodajVrstico();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => risiListDetajl(box));
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniList(box));
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
    const kg = (n.weight_kg != null && n.weight_kg !== '') ? `<div class="t">Skupaj teža perila: <b>${String(n.weight_kg).replace('.', ',')} kg</b></div>` : '';
    const popr = n.popravljeno_at ? `<div class="popr">✎ Popravljeno v portalu · ${escape_(n.popravil || 'osebje')} · ${datumcas(n.popravljeno_at)}</div>` : '';
    const ustv = n.source === 'portal' ? `<div class="popr" style="background:#eaf4ee;color:#1f6b3b">✚ Ustvarjeno v portalu${n.issued_name ? ' · ' + escape_(n.issued_name) : ''}</div>` : '';
    const html = `<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><title>Spremni list ${escape_(n.number || '')}</title><style>
      @page{size:A4;margin:14mm}
      *{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#16202b}
      body{margin:0;font-size:13px}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #16202b;padding-bottom:10px;margin-bottom:18px}
      .wm{font-size:23px;font-weight:800}.wm span{color:#2AA5B8}
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
      <div class="head"><div class="wm">Smart<span>Clean</span></div><div class="biz">BSMART d.o.o.<br>Luče 87, 3334 Luče<br>+386 41 209 676</div></div>
      <div class="num">Št. spremnega lista: <b>${escape_(n.number || '—')}</b></div>
      <div class="client"><div><b>Naročnik storitve:</b> ${escape_(naziv)}<div class="dates">Oddaja: ${datum(n.doc_date)}${izdal}</div></div><div>Podpis: ______________</div></div>
      <table><thead><tr><th>Naziv artikla</th><th class="q">Kosov</th></tr></thead><tbody>${rows}</tbody></table>
      ${kg}${ustv}${popr}<div class="sign"></div>
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Za tiskanje dovoli pojavna okna.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 300);
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
      <p class="u-sub" style="margin:10px 0 4px">Postavke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>+ Dodaj postavko</button>
      <div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>Ustvari</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<input type="text" data-pn placeholder="artikel" value="${escape_(naziv)}"><input type="number" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del title="odstrani">×</button>`;
      row.querySelector('[data-del]').addEventListener('click', () => row.remove());
      pBox.appendChild(row);
    };
    dodajVrstico();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => { box.innerHTML = ''; box.classList.remove('show'); });
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniNovList(box));
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
  async function risiStranke() {
    if (!Object.keys(ARTSTEVILO).length) {
      const {
        data
      } = await sb.from('orgs').select('id,articles(count)');
      (data || []).forEach(o => {
        var _o$articles$0$count, _o$articles;
        ARTSTEVILO[o.id] = (_o$articles$0$count = (_o$articles = o.articles) === null || _o$articles === void 0 || (_o$articles = _o$articles[0]) === null || _o$articles === void 0 ? void 0 : _o$articles.count) !== null && _o$articles$0$count !== void 0 ? _o$articles$0$count : 0;
      });
    }
    render();
  }
  function render() {
    const q = $('search').value.trim().toLowerCase();
    const list = q ? ORGSEZNAM.filter(o => (o.name + ' ' + (o.legal_name || '')).toLowerCase().includes(q)) : ORGSEZNAM;
    const skupaj = ORGSEZNAM.reduce((s, o) => s + (ARTSTEVILO[o.id] || 0), 0);
    $('count').textContent = ORGSEZNAM.length + ' strank · ' + stevilo(skupaj) + ' artiklov v katalogih';
    if (!list.length) {
      $('content').innerHTML = '<div class="rows"><div class="empty"><h3>Nič se ne ujema</h3>' + '<p>Poskusite z drugim delom naziva.</p></div></div>';
      return;
    }
    const naj = Math.max(...ORGSEZNAM.map(o => ARTSTEVILO[o.id] || 0), 1);
    $('content').innerHTML = '<div class="rows">' + list.map((o, i) => {
      const n = ARTSTEVILO[o.id] || 0;
      return `<button class="row" type="button" data-id="${o.id}" data-i="${i}" aria-expanded="false">
      <span><span class="row-name">${escape_(o.name)}</span>
      ${o.legal_name ? `<br><span class="row-legal">${escape_(o.legal_name)}</span>` : ''}</span>
      <span class="bar" title="${n} artiklov"><i style="width:${Math.round(n / naj * 100)}%"></i></span>
      <span class="num">${n} artiklov</span>
      <span class="chev" aria-hidden="true">›</span>
    </button><div class="arts" id="a${i}"></div>`;
    }).join('') + '</div>';
    document.querySelectorAll('#content .row').forEach(b => b.addEventListener('click', () => toggle(b)));
  }
  $('search').addEventListener('input', render);
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
    box.innerHTML = '<p class="meta">Nalagam …</p>';
    const org = ORGSEZNAM.find(o => o.id === btn.dataset.id);
    const {
      data,
      error
    } = await sb.from('articles').select('name').eq('org_id', btn.dataset.id).order('sort_order');
    if (error) {
      box.innerHTML = '<p class="meta">Napaka: ' + escape_(error.message) + '</p>';
      return;
    }
    const meta = [org.vat_id ? 'Davčna <b>' + escape_(org.vat_id) + '</b>' : 'Brez davčne številke', org.address ? escape_(org.address) : 'Brez naslova'].join(' · ');
    box.innerHTML = '<p class="meta">' + meta + '</p>' + (data !== null && data !== void 0 && data.length ? '<ul>' + data.map(a => '<li>' + escape_(a.name) + '</li>').join('') + '</ul>' : '<p class="none">Ta stranka še nima artiklov v katalogu.</p>');
    box.dataset.loaded = '1';
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
  $('uvozFile').addEventListener('change', async () => {
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
  $('uvozBtn').addEventListener('click', async () => {
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

  function risiAplikacijo() {
    var p = document.getElementById('apkPanel');
    if (!p) return;
    p.innerHTML = '<p class="u-sub">Preverjam \u2026</p>';
    var url = new URL(APK_POT, location.href).href;

    fetch(url, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) throw new Error('ni ga');
      var mb = Number(r.headers.get('content-length') || 0) / 1048576;
      p.innerHTML =
        '<h3 class="sec-h">Namestitev na tablico</h3>' +
        '<p class="uvoz-nav">Odprite to stran <b>na tablici</b> in tapnite gumb. ' +
        'Android bo vprašal za dovoljenje za namestitev — dovolite ga.</p>' +
        '<p><a class="btn btn-narrow" href="' + escape_(url) + '" download>Prenesi aplikacijo' +
        (mb ? ' (' + mb.toFixed(1) + ' MB)' : '') + '</a></p>' +
        '<div class="por" style="margin-top:18px"><div class="por-op">' +
        '<b>Po namestitvi:</b> prijava s kodo 9999 \u2192 Admin \u2192 Portal — povezava. ' +
        'Vpišite naslov projekta, javni ključ ter e-naslov in geslo naprave, nato Poveži.<br><br>' +
        'Spremni listi se od takrat sami stekajo v Arhiv. Za prenos vseh naenkrat je ' +
        'v aplikaciji Admin \u203a Portal \u203a Sinhroniziraj.</div></div>' +
        '<p class="u-sub" style="margin-top:16px">Brez nameščanja deluje tudi ' +
        '<a href="tablica/" style="text-decoration:underline">spletna različica</a>, ' +
        'ki pa ne zna tiskati in ne shranjuje PDF-jev.</p>';
    }).catch(function () {
      p.innerHTML =
        '<h3 class="sec-h">Namestitvenega paketa še ni</h3>' +
        '<div class="msg bad show">Datoteke <b>' + escape_(APK_POT) + '</b> ni na strežniku.</div>' +
        '<div class="por" style="margin-top:16px"><div class="por-op">' +
        'Naložite jo v repozitorij <b>smartclean-portal</b>: odprite mapo <b>tablica</b>, ' +
        'znotraj nje <b>Add file \u2192 Upload files</b>, povlecite <b>Pralnica-sync.apk</b> ' +
        'in potrdite.<br><br>Vstop v mapo je pomemben — sicer datoteka pristane v korenu.' +
        '</div></div>' +
        '<p class="u-sub" style="margin-top:16px">Medtem deluje ' +
        '<a href="tablica/" style="text-decoration:underline">spletna različica</a>, ' +
        'ki je ni treba nameščati.</p>';
    });
  }

  /* ══════════ MOJ RAČUN ══════════ */
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
    const [{
      data: ljudje
    }, {
      data: clanstva
    }] = await Promise.all([sb.from('profiles').select('id,email,full_name,is_staff,active').order('email'), sb.from('memberships').select('user_id,org_id')]);
    const clanPo = {};
    (clanstva || []).forEach(c => {
      clanPo[c.user_id] = ORGIME[c.org_id];
    });
    $('usersList').innerHTML = (ljudje || []).map(u => {
      const jaz = u.id === JAZ;
      const vloga = u.is_staff ? 'osebje — vidi vse stranke' : clanPo[u.id] ? 'stranka — ' + escape_(clanPo[u.id]) : 'brez dostopa';
      return `<div class="u-row ${u.active ? '' : 'u-off'}">
      <div>
        <div class="u-mail">${escape_(u.email || u.full_name || '—')}
          ${jaz ? '<span class="pill">vi</span>' : ''}
          ${u.active ? '' : '<span class="pill">izklopljen</span>'}</div>
        <div class="u-sub">${vloga}</div>
      </div>
      <div>${u.is_staff ? '<span class="u-sub">dostop do vseh strank</span>' : `<select data-org="${u.id}" ${jaz ? 'disabled' : ''}>
             <option value="">— brez dostopa —</option>
             ${ORGSEZNAM.map(o => `<option value="${o.id}"${clanPo[u.id] === o.name ? ' selected' : ''}>${escape_(o.name)}</option>`).join('')}
           </select>`}</div>
      <div class="u-acts">
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
    const r = await klic({
      dejanje: 'ustvari',
      email: $('nuEmail').value.trim(),
      osebje: !orgId,
      orgId: orgId || null
    });
    btn.disabled = false;
    btn.textContent = 'Ustvari račun';
    if (r.napaka) {
      uMsg(escape_(r.napaka), true);
      return;
    }
    $('nuEmail').value = '';
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
      if (session && !recovery) start();
    }, 60);
  })();

  /* Šele tu vemo, da se je celotna skripta prevedla in izvedla. */
  if (window.__SC) window.__SC.ok = true;
})();

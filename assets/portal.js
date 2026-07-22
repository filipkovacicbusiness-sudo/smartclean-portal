(async function(){
const createClient = window.supabase.createClient;

const $ = (id) => document.getElementById(id);
const cfg = window.SC_CONFIG || {};

/* ── tema ─────────────────────────────────────────────────────────── */
try {
  const t = localStorage.getItem('sc-portal-theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
$('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('sc-portal-theme', next); } catch (e) {}
});

/* ── povej naravnost, če nastavitve niso izpolnjene ───────────────── */
// Ključ vzamemo iz config.js; če ga tam ni, iz brskalnikove shrambe.
let KEY = (cfg.key && !cfg.key.startsWith('TUKAJ')) ? cfg.key : null;
let URL_ = cfg.url || null;
if (!KEY) { try { KEY = localStorage.getItem('sc-portal-key'); } catch (e) {} }
if (!URL_) { try { URL_ = localStorage.getItem('sc-portal-url'); } catch (e) {} }

/* Če ključa ni nikjer, ga vprašamo tu – brez urejanja datotek. */
if (!KEY || !URL_) {
  $('loginForm').style.display = 'none';
  const box = document.createElement('div');
  box.innerHTML =
    '<div class="field"><label for="kUrl">Naslov projekta</label>' +
    '<input type="text" id="kUrl" value="' + (URL_ || '') + '" placeholder="https://….supabase.co"/></div>' +
    '<div class="field"><label for="kKey">Publishable key</label>' +
    '<input type="text" id="kKey" placeholder="sb_publishable_…"/></div>' +
    '<button type="button" class="btn" id="kSave">Shrani in nadaljuj</button>';
  $('loginForm').parentNode.insertBefore(box, $('loginMsg'));
  document.querySelector('.sub').textContent =
    'Portal še ne ve, kje je vaša baza. Vpišite podatke iz Supabase → Project Settings → API Keys. Vprašamo samo enkrat.';
  $('kSave').addEventListener('click', () => {
    const u = document.getElementById('kUrl').value.trim();
    const k = document.getElementById('kKey').value.trim();
    if (!/^https:\/\/.+\.supabase\.co\/?$/.test(u) || !k.startsWith('sb_publishable_')) {
      const m = $('loginMsg');
      m.className = 'msg bad show';
      m.textContent = !k.startsWith('sb_publishable_')
        ? 'Ključ se mora začeti s sb_publishable_. Če se začne s sb_secret_, je napačen in ne sme v brskalnik.'
        : 'Naslov mora izgledati kot https://nekaj.supabase.co';
      return;
    }
    try {
      localStorage.setItem('sc-portal-url', u.replace(/\/$/, ''));
      localStorage.setItem('sc-portal-key', k);
    } catch (e) {}
    location.reload();
  });
}

const sb = (URL_ && KEY) ? createClient(URL_, KEY) : null;

/* ── prijava ──────────────────────────────────────────────────────── */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) return;
  const m = $('loginMsg');
  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Prijavljam …';
  m.className = 'msg';

  const { error } = await sb.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value,
  });

  btn.disabled = false;
  btn.textContent = 'Prijavi se';

  if (error) {
    m.className = 'msg bad show';
    m.textContent = /invalid/i.test(error.message)
      ? 'E-naslov ali geslo se ne ujemata.'
      : /confirm/i.test(error.message)
        ? 'Ta račun še ni potrjen. Javite se administratorju.'
        : 'Prijava ni uspela: ' + error.message;
    return;
  }
  start();
});

/* ── pozabljeno geslo ─────────────────────────────────────────────── */
function showAuthPane(which) {
  ['loginForm','resetForm','newPwForm'].forEach(id => {
    const el = $(id); if (el) el.classList.toggle('hidden', id !== which);
  });
  const f = $('forgotBtn'); if (f) f.classList.toggle('hidden', which !== 'loginForm');
  const m = $('loginMsg'); if (m) m.className = 'msg';
}

if ($('forgotBtn')) $('forgotBtn').addEventListener('click', () => {
  $('resetEmail').value = $('email').value.trim();
  showAuthPane('resetForm');
  document.querySelector('.sub').textContent =
    'Vpišite svoj e-naslov in poslali vam bomo povezavo za nastavitev novega gesla.';
});

if ($('backBtn')) $('backBtn').addEventListener('click', () => {
  showAuthPane('loginForm');
  document.querySelector('.sub').textContent = 'Vpišite se s podatki, ki ste jih prejeli od nas.';
});

if ($('resetForm')) $('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) return;
  const m = $('loginMsg'), btn = $('resetBtn');
  btn.disabled = true; btn.textContent = 'Pošiljam …';
  const { error } = await sb.auth.resetPasswordForEmail($('resetEmail').value.trim(), {
    redirectTo: location.origin + location.pathname,
  });
  btn.disabled = false; btn.textContent = 'Pošlji povezavo za ponastavitev';
  m.className = error ? 'msg bad show' : 'msg show';
  m.textContent = error
    ? (/rate|limit/i.test(error.message)
        ? 'Preveč poskusov zapored. Počakajte nekaj minut in poskusite znova.'
        : 'Pošiljanje ni uspelo: ' + error.message)
    : 'Če ta e-naslov pri nas obstaja, je povezava na poti. Preverite tudi mapo z neželeno pošto.';
});

/* ── nastavitev novega gesla po kliku na povezavo iz e-pošte ──────── */
if ($('newPwForm')) $('newPwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('loginMsg'), btn = $('newPwBtn');
  const p1 = $('newPw1').value, p2 = $('newPw2').value;
  if (p1 !== p2) {
    m.className = 'msg bad show'; m.textContent = 'Gesli se ne ujemata.'; return;
  }
  btn.disabled = true; btn.textContent = 'Shranjujem …';
  const { error } = await sb.auth.updateUser({ password: p1 });
  btn.disabled = false; btn.textContent = 'Nastavi geslo';
  if (error) {
    m.className = 'msg bad show';
    m.textContent = /weak|short|password/i.test(error.message)
      ? 'Geslo je prešibko. Uporabite vsaj 12 znakov, z velikimi in malimi črkami, številko in simbolom.'
      : 'Ni uspelo: ' + error.message;
    return;
  }
  m.className = 'msg show'; m.textContent = 'Geslo je nastavljeno. Odpiram portal …';
  setTimeout(start, 900);
});

$('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

/* ── po prijavi ───────────────────────────────────────────────────── */
async function start() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  $('auth').style.display = 'none';
  $('app').classList.add('show');

  const { data: profile } = await sb
    .from('profiles').select('full_name,is_staff').eq('id', user.id).maybeSingle();

  $('who').textContent = (profile?.full_name || user.email)
    + (profile?.is_staff ? ' · osebje' : '');

  JAZ = user.id;
  if ($('usersBtn')) $('usersBtn').classList.toggle('hidden', !profile?.is_staff);
  if (profile?.is_staff) { loadOrgs(); } else { loadCustomer(); }
}

/* ── sprememba gesla znotraj portala ──────────────────────────────── */
if ($('pwBtn')) $('pwBtn').addEventListener('click', () => {
  const p = $('pwPanel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) $('curPw').focus();
});

if ($('changePwForm')) $('changePwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('pwMsg'), btn = $('chPwBtn');
  const cur = $('curPw').value, p1 = $('chPw1').value, p2 = $('chPw2').value;

  if (p1 !== p2) { m.className = 'msg bad show'; m.textContent = 'Novi gesli se ne ujemata.'; return; }
  if (p1 === cur) { m.className = 'msg bad show'; m.textContent = 'Novo geslo mora biti drugačno od starega.'; return; }

  btn.disabled = true; btn.textContent = 'Shranjujem …';

  // Najprej potrdimo istovetnost s trenutnim geslom. Brez tega bi lahko
  // kdor koli s tujo odprto sejo zamenjal geslo in lastnika izključil.
  const { data: { user } } = await sb.auth.getUser();
  const check = await sb.auth.signInWithPassword({ email: user.email, password: cur });
  if (check.error) {
    btn.disabled = false; btn.textContent = 'Shrani novo geslo';
    m.className = 'msg bad show'; m.textContent = 'Trenutno geslo ni pravilno.';
    return;
  }

  const { error } = await sb.auth.updateUser({ password: p1 });
  btn.disabled = false; btn.textContent = 'Shrani novo geslo';

  if (error) {
    m.className = 'msg bad show';
    m.textContent = /weak|short|password/i.test(error.message)
      ? 'Geslo je prešibko. Uporabite vsaj 12 znakov, z velikimi in malimi črkami, številko in simbolom.'
      : 'Ni uspelo: ' + error.message;
    return;
  }
  ['curPw','chPw1','chPw2'].forEach(id => { $(id).value = ''; });
  m.className = 'msg show'; m.textContent = 'Geslo je spremenjeno.';
});


/* ══ PANEL UPORABNIKOV (samo osebje) ══════════════════════════════ */
let JAZ = null;      // id prijavljenega
let ORGSEZNAM = [];

function uMsg(txt, slabo) {
  const m = $('usersMsg');
  m.className = 'msg ' + (slabo ? 'bad show' : 'show');
  m.innerHTML = txt;
}

/* Klic strežniške funkcije. Tajni ključ ostane tam, sem pride le izid. */
async function klic(telo) {
  const { data, error } = await sb.functions.invoke('uporabniki', { body: telo });
  if (!error) return data;
  try {
    const j = await error.context.json();
    return { napaka: j.napaka || error.message };
  } catch (e) {
    return { napaka: 'Strežnik ni odgovoril. Poskusite čez trenutek.' };
  }
}

if ($('usersBtn')) $('usersBtn').addEventListener('click', () => {
  const p = $('usersPanel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) loadUsers();
});

async function loadUsers() {
  $('usersList').innerHTML = '<p class="u-sub">Nalagam …</p>';

  if (!ORGSEZNAM.length) {
    const { data } = await sb.from('orgs').select('id,name').order('name');
    ORGSEZNAM = data || [];
    $('nuOrg').innerHTML = '<option value="">— osebje SmartClean —</option>'
      + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
  }

  const [{ data: ljudje }, { data: clanstva }] = await Promise.all([
    sb.from('profiles').select('id,email,full_name,is_staff,active').order('email'),
    sb.from('memberships').select('user_id,org_id'),
  ]);

  const orgPo = {}; ORGSEZNAM.forEach(o => { orgPo[o.id] = o.name; });
  const clanPo = {}; (clanstva || []).forEach(c => { clanPo[c.user_id] = orgPo[c.org_id]; });

  $('usersList').innerHTML = (ljudje || []).map(u => {
    const jaz = u.id === JAZ;
    const vloga = u.is_staff ? 'osebje — vidi vse stranke'
      : (clanPo[u.id] ? 'stranka — ' + escape_(clanPo[u.id]) : 'brez dostopa');
    return `<div class="u-row ${u.active ? '' : 'u-off'}">
      <div>
        <div class="u-mail">${escape_(u.email || u.full_name || '—')}
          ${jaz ? '<span class="pill">vi</span>' : ''}
          ${u.active ? '' : '<span class="pill">izklopljen</span>'}</div>
        <div class="u-sub">${vloga}</div>
      </div>
      <div>
        <select data-org="${u.id}" ${u.is_staff || jaz ? 'disabled' : ''}>
          <option value="">— brez dostopa —</option>
          ${ORGSEZNAM.map(o => `<option value="${o.id}"${clanPo[u.id] === o.name ? ' selected' : ''}>${escape_(o.name)}</option>`).join('')}
        </select>
      </div>
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
    const { error } = await sb.from('memberships')
      .insert({ user_id: userId, org_id: orgId, role: 'owner' });
    if (error) { uMsg('Ni uspelo: ' + escape_(error.message), true); return; }
  }
  uMsg(orgId ? 'Dostop je dodeljen.' : 'Dostop je odvzet.');
  loadUsers();
}

async function dejanje(btn) {
  const id = btn.dataset.id, act = btn.dataset.act;
  btn.disabled = true;

  if (act === 'staff') {
    const { error } = await sb.from('profiles')
      .update({ is_staff: btn.dataset.v === '1' }).eq('id', id);
    if (btn.dataset.v === '1') await sb.from('memberships').delete().eq('user_id', id);
    uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : 'Vloga je spremenjena.', !!error);
    loadUsers(); return;
  }

  if (act === 'active') {
    const { error } = await sb.from('profiles')
      .update({ active: btn.dataset.v === '1' }).eq('id', id);
    uMsg(error ? 'Ni uspelo: ' + escape_(error.message)
       : (btn.dataset.v === '1' ? 'Račun je vklopljen.' : 'Račun je izklopljen — dostopa nima več.'), !!error);
    loadUsers(); return;
  }

  if (act === 'pw') {
    const r = await klic({ dejanje: 'geslo', id });
    btn.disabled = false;
    if (r.napaka) { uMsg(escape_(r.napaka), true); return; }
    uMsg('Novo geslo: <span class="secret">' + escape_(r.geslo)
       + '</span><br>Zapišite si ga zdaj — drugič ga ne bo mogoče prikazati.');
    return;
  }

  if (act === 'del') {
    if (!confirm('Res izbrisati račun ' + btn.dataset.m + '? Tega ni mogoče razveljaviti.')) {
      btn.disabled = false; return;
    }
    const r = await klic({ dejanje: 'izbrisi', id });
    if (r.napaka) { btn.disabled = false; uMsg(escape_(r.napaka), true); return; }
    uMsg('Račun je izbrisan.');
    loadUsers(); return;
  }
}

if ($('addUserForm')) $('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('nuBtn');
  btn.disabled = true; btn.textContent = 'Ustvarjam …';
  const orgId = $('nuOrg').value;
  const r = await klic({
    dejanje: 'ustvari',
    email: $('nuEmail').value.trim(),
    osebje: !orgId,
    orgId: orgId || null,
  });
  btn.disabled = false; btn.textContent = 'Ustvari račun';

  if (r.napaka) { uMsg(escape_(r.napaka), true); return; }
  $('nuEmail').value = '';
  uMsg('Račun <b>' + escape_(r.email) + '</b> je ustvarjen.<br>Geslo: <span class="secret">'
     + escape_(r.geslo) + '</span><br>Sporočite ga osebno ali po telefonu, ne po e-pošti skupaj z naslovom portala. '
     + 'Drugič ga ne bo mogoče prikazati.');
  loadUsers();
});

/* ── pogled stranke ───────────────────────────────────────────────── */
async function loadCustomer() {
  $('search').style.display = 'none';
  $('title').textContent = 'Vaš pregled';
  $('content').innerHTML = '<div class="rows"><div class="empty">Nalagam …</div></div>';

  // Ista tabela kot pri osebju. Kar stranka sme videti, določa baza, ne ta koda.
  const { data: orgs, error } = await sb
    .from('orgs').select('id,name,legal_name,address,vat_id').order('name');

  if (error) {
    $('content').innerHTML = '<div class="rows"><div class="empty"><h3>Podatkov ni bilo mogoče naložiti</h3><p>'
      + escape_(error.message) + '</p></div></div>';
    return;
  }

  if (!orgs || !orgs.length) {
    $('count').textContent = '';
    $('content').innerHTML =
      '<div class="rows"><div class="empty"><h3>Tu še ni ničesar za prikaz</h3>' +
      '<p>Vaš račun deluje, ni pa še povezan z nobenim podjetjem.<br>' +
      'Javite se nam in vam ga uredimo.</p></div></div>';
    return;
  }

  // več podjetij na en račun je mogoče, a redko – takrat pokažemo seznam
  if (orgs.length > 1) {
    ORGS = orgs.map((o) => ({ ...o, arts: 0 }));
    $('title').textContent = 'Vaša podjetja';
    $('search').style.display = '';
    render();
    return;
  }

  const org = orgs[0];
  const [{ data: arts }, { data: notes }] = await Promise.all([
    sb.from('articles').select('name').eq('org_id', org.id).order('sort_order'),
    sb.from('delivery_notes').select('number,doc_date,total_pieces')
      .eq('org_id', org.id).order('doc_date', { ascending: false }).limit(20),
  ]);

  $('title').textContent = org.name;
  $('count').textContent = [org.legal_name, org.address].filter(Boolean).join(' · ');

  const listi = (notes && notes.length)
    ? '<div class="rows">' + notes.map((n) => `
        <div class="row" style="cursor:default;grid-template-columns:1fr 120px 92px 26px">
          <span class="row-name">Spremni list ${escape_(n.number)}</span>
          <span class="num">${escape_(n.doc_date)}</span>
          <span class="num">${n.total_pieces} kosov</span><span></span>
        </div>`).join('') + '</div>'
    : '<div class="rows"><div class="empty"><h3>Spremnih listov še ni</h3>'
      + '<p>Ko bomo prevzeli in vrnili perilo, se bo vsak prevzem izpisal tukaj.</p></div></div>';

  $('content').innerHTML =
    '<h3 class="sec">Zadnji prevzemi</h3>' + listi +
    '<h3 class="sec">Vaš katalog perila</h3>' +
    '<div class="rows"><div class="arts show" style="border:none">' +
      (arts && arts.length
        ? '<ul>' + arts.map((a) => '<li>' + escape_(a.name) + '</li>').join('') + '</ul>'
        : '<p class="none">Katalog še ni izpolnjen.</p>') +
    '</div></div>';
}

/* ── seznam strank ────────────────────────────────────────────────── */
let ORGS = [];

async function loadOrgs() {
  $('content').innerHTML = '<div class="rows"><div class="empty">Nalagam …</div></div>';

  const { data, error } = await sb
    .from('orgs')
    .select('id,name,legal_name,address,vat_id,articles(count)')
    .order('name');

  if (error) {
    $('content').innerHTML =
      '<div class="rows"><div class="empty"><h3>Podatkov ni bilo mogoče naložiti</h3><p>'
      + escape_(error.message) + '</p></div></div>';
    return;
  }

  ORGS = (data || []).map((o) => ({ ...o, arts: o.articles?.[0]?.count ?? 0 }));
  render();
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const list = q
    ? ORGS.filter((o) => (o.name + ' ' + (o.legal_name || '')).toLowerCase().includes(q))
    : ORGS;

  const total = ORGS.reduce((s, o) => s + o.arts, 0);
  $('count').textContent = ORGS.length + ' strank · ' + total + ' artiklov v katalogih';

  if (!list.length) {
    $('content').innerHTML =
      '<div class="rows"><div class="empty"><h3>Nič se ne ujema</h3>'
      + '<p>Poskusite z drugim delom naziva.</p></div></div>';
    return;
  }

  const max = Math.max(...ORGS.map((o) => o.arts), 1);

  $('content').innerHTML = '<div class="rows">' + list.map((o, i) => `
    <button class="row" type="button" data-id="${o.id}" data-i="${i}" aria-expanded="false">
      <span>
        <span class="row-name">${escape_(o.name)}</span>
        ${o.legal_name ? `<br><span class="row-legal">${escape_(o.legal_name)}</span>` : ''}
      </span>
      <span class="bar" title="${o.arts} artiklov"><i style="width:${Math.round(o.arts / max * 100)}%"></i></span>
      <span class="num">${o.arts} artiklov</span>
      <span class="chev" aria-hidden="true">›</span>
    </button>
    <div class="arts" id="a${i}"></div>`).join('') + '</div>';

  document.querySelectorAll('.row').forEach((btn) => {
    btn.addEventListener('click', () => toggle(btn));
  });
}

async function toggle(btn) {
  const box = $('a' + btn.dataset.i);
  const open = btn.getAttribute('aria-expanded') === 'true';

  if (open) {
    btn.setAttribute('aria-expanded', 'false');
    box.classList.remove('show');
    return;
  }
  btn.setAttribute('aria-expanded', 'true');
  box.classList.add('show');

  if (box.dataset.loaded) return;
  box.innerHTML = '<p class="meta">Nalagam …</p>';

  const org = ORGS.find((o) => o.id === btn.dataset.id);
  const { data, error } = await sb
    .from('articles').select('name').eq('org_id', btn.dataset.id)
    .order('sort_order');

  if (error) { box.innerHTML = '<p class="meta">Napaka: ' + escape_(error.message) + '</p>'; return; }

  const meta = [
    org.vat_id ? 'Davčna <b>' + escape_(org.vat_id) + '</b>' : 'Brez davčne številke',
    org.address ? escape_(org.address) : 'Brez naslova',
  ].join(' · ');

  box.innerHTML = '<p class="meta">' + meta + '</p>' + (data?.length
    ? '<ul>' + data.map((a) => '<li>' + escape_(a.name) + '</li>').join('') + '</ul>'
    : '<p class="none">Ta stranka še nima artiklov v katalogu.</p>');
  box.dataset.loaded = '1';
}

$('search').addEventListener('input', render);

function escape_(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── obnovi sejo ob osvežitvi ─────────────────────────────────────── */
if (sb) {
  let recovery = false;
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovery = true;
      showAuthPane('newPwForm');
      document.querySelector('.sub').textContent = 'Vpišite novo geslo za svoj račun.';
    }
  });
  const { data: { session } } = await sb.auth.getSession();
  setTimeout(() => { if (session && !recovery) start(); }, 60);
}
})();
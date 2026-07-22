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

  if (profile?.is_staff) { loadOrgs(); } else { loadCustomer(); }
}

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
  const { data: { session } } = await sb.auth.getSession();
  if (session) start();
}
})();
// Testi Evidence kg na Statistiki: obdobje se ravna po glavi strani, razvrščanje
// po vseh treh stolpcih v obe smeri.  Zagon:  node test/ucEvidenca.test.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
function grab(name) {
  const i = src.indexOf('  function ' + name + '(');
  if (i < 0) throw new Error('ni: ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
}

let _ucDonutRange = '3m', _ucDonutMonth = null, _ucSort = 'kg_desc';
let _ucDonutFak = {}, _ucDonutEurKljuc = null, _ucDonutEurKg = null, _kgVseMap = null, UCEN_LISTI = [];
const ORGIME = { a: 'Zlata Ladjica', b: 'Češka Koča', c: 'Perk', d: 'Ana' };
const danes10 = () => '2026-09-23';
const ucMesecIme = mk => ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december'][+mk.slice(5,7)-1] + ' ' + mk.slice(0,4);
eval(grab('ucDonutObdobje') + grab('ucKgObseg') + grab('ucKgMesecev') + grab('ucObdobjeLbl') + grab('ucEvidencaData'));

let pass = 0, fail = 0;
const t = (n, c, got) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (got !== undefined ? '  -> ' + JSON.stringify(got) : '')); } };
const imena = d => d.arr.map(x => x.ime);

// ── obdobje se ravna po glavi strani ────────────────────────────────────────
UCEN_LISTI = [
  { org_id: 'a', doc_date: '2026-08-10', weight_kg: 1860 },
  { org_id: 'b', doc_date: '2026-08-12', weight_kg: 300 },
  { org_id: 'c', doc_date: '2026-09-02', weight_kg: 35 },
];
_kgVseMap = { a: 5000, b: 300, c: 35, d: 12 };

_ucDonutRange = 'mesec'; _ucDonutMonth = '2026-08';
let d = ucEvidencaData();
t('mesec: samo stranke tistega meseca', imena(d).join(',') === 'Zlata Ladjica,Češka Koča', imena(d));
t('mesec: napis obdobja', d.obLabel === 'avgust 2026', d.obLabel);
t('mesec: ključ za izvoz', d.obKratko === '2026-08', d.obKratko);

_ucDonutRange = 'vse';
d = ucEvidencaData();
t('vse: iz _kgVseMap, vse stranke', d.arr.length === 4, imena(d));
t('vse: skupna kilaža', d.kgSkup === 5347, d.kgSkup);
t('vse: napis obdobja', d.obLabel === 'ves čas', d.obLabel);

_ucDonutRange = '3m';
d = ucEvidencaData();
t('3m: zadnji trije meseci (jul–sep 2026)', d.arr.length === 3, imena(d));
t('3m: napis obdobja', d.obLabel === 'zadnji 3 meseci', d.obLabel);

// ── €/kg pride iz istega izračuna kot lestvica »Promet po strankah« ─────────
_ucDonutRange = 'mesec'; _ucDonutMonth = '2026-08';
_ucDonutFak = { a: { kg: 1860, neto: 5803.2 }, b: { kg: 300, neto: 900 } };
_ucDonutEurKljuc = 'M2026-08'; _ucDonutEurKg = 2.53;
d = ucEvidencaData();
t('€/kg = neto/kg', Math.abs(d.arr[0].eur - 3.12) < 0.001, d.arr[0].eur);
t('€/kg pripravljen', d.eurReady === true);
t('skupni €/kg iz glave strani', d.eurTot === 2.53, d.eurTot);

_ucDonutEurKljuc = 'M2026-07';   // prihodek za DRUGO obdobje
d = ucEvidencaData();
t('tuj ključ → €/kg se ne pokaže', d.eurReady === false && d.arr[0].eur === null, [d.eurReady, d.arr[0].eur]);
t('tuj ključ → skupni €/kg prazen', d.eurTot === null, d.eurTot);

// ── razvrščanje: trije stolpci, obe smeri ───────────────────────────────────
_ucDonutRange = 'vse';
_ucDonutFak = { a: { kg: 100, neto: 100 }, b: { kg: 100, neto: 300 }, c: { kg: 100, neto: 200 } };  // d nima prihodka
_ucDonutEurKljuc = 'V'; _ucDonutEurKg = 1.5;

_ucSort = 'kg_desc'; t('kg padajoče', imena(ucEvidencaData()).join(',') === 'Zlata Ladjica,Češka Koča,Perk,Ana', imena(ucEvidencaData()));
_ucSort = 'kg_asc';  t('kg naraščajoče', imena(ucEvidencaData()).join(',') === 'Ana,Perk,Češka Koča,Zlata Ladjica', imena(ucEvidencaData()));
_ucSort = 'eur_desc'; t('€/kg padajoče', imena(ucEvidencaData()).slice(0, 3).join(',') === 'Češka Koča,Perk,Zlata Ladjica', imena(ucEvidencaData()));
_ucSort = 'eur_desc'; t('brez €/kg gre na konec (padajoče)', imena(ucEvidencaData())[3] === 'Ana', imena(ucEvidencaData()));
_ucSort = 'eur_asc'; t('brez €/kg gre na konec tudi naraščajoče', imena(ucEvidencaData())[3] === 'Ana', imena(ucEvidencaData()));
_ucSort = 'eur_asc'; t('€/kg naraščajoče', imena(ucEvidencaData()).slice(0, 3).join(',') === 'Zlata Ladjica,Perk,Češka Koča', imena(ucEvidencaData()));
_ucSort = 'ime_az'; t('stranka A–Ž (šumniki po slovensko)', imena(ucEvidencaData()).join(',') === 'Ana,Češka Koča,Perk,Zlata Ladjica', imena(ucEvidencaData()));
_ucSort = 'ime_za'; t('stranka Ž–A', imena(ucEvidencaData()).join(',') === 'Zlata Ladjica,Perk,Češka Koča,Ana', imena(ucEvidencaData()));

// stranke brez kilaže se ne prikažejo
_kgVseMap = { a: 0, b: 300 };
_ucSort = 'kg_desc';
t('stranka z 0 kg se izpusti', imena(ucEvidencaData()).join(',') === 'Češka Koča', imena(ucEvidencaData()));

console.log('\n  ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

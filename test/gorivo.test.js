// Testi izračunov v razdelku Gorivo: poraba med tankanjema in povzetek.
// Zagon:  node test/gorivo.test.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
function grab(name) {
  const i = src.indexOf('  function ' + name + '(');
  if (i < 0) throw new Error('ni: ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
}
let GORIVO = [], _gorLeto = 'vse';
const GOR_DDV = 22;
eval(grab('gorNeto') + grab('gorPoraba') + grab('gorPovzetek') + grab('gorLeta') + grab('gorIzbrane'));

let pass = 0, fail = 0;
const t = (n, c, got) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (got !== undefined ? '  -> ' + JSON.stringify(got) : '')); } };
const blizu = (a, b) => Math.abs(a - b) < 1e-6;

// Štiri tankanja, vsakič poln rezervoar.
const V = [
  { id: '1', datum: '2026-06-02', litri: 50, znesek: 75,   km: 100000 },
  { id: '2', datum: '2026-06-20', litri: 40, znesek: 62,   km: 100500 },
  { id: '3', datum: '2026-07-08', litri: 45, znesek: 70.2, km: 101100 },
  { id: '4', datum: '2026-07-25', litri: 30, znesek: 45,   km: 101500 }
];

let p = gorPoraba(V);
t('prvo tankanje nima odseka', p['1'] === undefined, p['1']);
t('2. odsek: 500 km', p['2'].km === 500, p['2']);
t('2. odsek: 40 l / 500 km = 8 l/100 km', blizu(p['2'].l100, 8), p['2'].l100);
t('3. odsek: 45 l / 600 km = 7,5', blizu(p['3'].l100, 7.5), p['3'].l100);
t('4. odsek: 30 l / 400 km = 7,5', blizu(p['4'].l100, 7.5), p['4'].l100);

// Odseki se računajo po ŠTEVCU, ne po datumu vnosa (zapis, vnesen za nazaj).
const zamesan = [V[2], V[0], V[3], V[1]];
const pz = gorPoraba(zamesan);
t('vrstni red vnosa ne vpliva', blizu(pz['3'].l100, 7.5) && pz['1'] === undefined, Object.keys(pz));

// Manjkajoče stanje števca: odsek se preskoči, ostali ostanejo.
const brezKm = [V[0], { id: 'x', datum: '2026-06-10', litri: 20, znesek: 30, km: null }, V[1]];
const pb = gorPoraba(brezKm);
t('tankanje brez števca nima porabe', pb['x'] === undefined, pb['x']);
t('sosednja odseka se vseeno izračunata', blizu(pb['2'].l100, 8), pb['2']);

// Števec nazaj (tipkarska napaka) ne sme dati negativne porabe.
const nazaj = [V[0], { id: 'y', datum: '2026-06-15', litri: 35, znesek: 52, km: 99000 }];
const pn = gorPoraba(nazaj);
t('števec nazaj ne da negativne porabe', Object.keys(pn).every(k => pn[k].l100 > 0), pn);

// ── povzetek ───────────────────────────────────────────────────────────────
let s = gorPovzetek(V, p);
t('skupaj litrov', blizu(s.litri, 165), s.litri);
t('skupaj znesek', blizu(s.znesek, 252.2), s.znesek);
t('povprečna cena na liter', blizu(s.cenaL, 252.2 / 165), s.cenaL);
t('izmerjenih km = 1500', s.km === 1500, s.km);
// Prvo tankanje (50 l, 75 €) NI v izmerjenem odseku in je izpuščeno iz porabe.
t('povprečna poraba = 115 l / 1500 km', blizu(s.l100, 115 / 1500 * 100), s.l100);
t('€/km iz izmerjenih tankanj', blizu(s.eurKm, (62 + 70.2 + 45) / 1500), s.eurKm);

// ── DDV: znesek je bruto, neto je izpeljan ────────────────────────────────
t('neto pri 22 %', blizu(gorNeto(122, 22), 100), gorNeto(122, 22));
t('neto uporabi stopnjo zapisa, ne privzete', blizu(gorNeto(109.5, 9.5), 100), gorNeto(109.5, 9.5));
t('skupni neto', blizu(s.neto, 252.2 / 1.22), s.neto);
t('povprečna cena na liter brez DDV', blizu(s.cenaLneto, s.cenaL / 1.22), [s.cenaLneto, s.cenaL]);
t('€/km brez DDV', blizu(s.eurKmNeto, s.eurKm / 1.22), [s.eurKmNeto, s.eurKm]);

// Tankanje s svojo stopnjo DDV se ne popravi po privzeti.
const mesano = [{ id: 'm1', datum: '2026-05-01', litri: 10, znesek: 122, km: 1000, ddv: 22 },
                { id: 'm2', datum: '2026-05-10', litri: 10, znesek: 110, km: 1100, ddv: 10 }];
const sm = gorPovzetek(mesano, gorPoraba(mesano));
t('mešane stopnje DDV se seštejejo vsaka po svoje', blizu(sm.neto, 100 + 100), sm.neto);

// Brez enega samega izmerjenega odseka poraba ni na voljo (ne 0).
const samoEno = [V[0]];
s = gorPovzetek(samoEno, gorPoraba(samoEno));
t('eno tankanje → poraba je neznana, ne nič', s.l100 === null && s.eurKm === null, [s.l100, s.eurKm]);
t('eno tankanje → cena na liter vseeno je', blizu(s.cenaL, 1.5), s.cenaL);

// ── filter po letu ─────────────────────────────────────────────────────────
GORIVO = V.concat([{ id: '5', datum: '2025-12-30', litri: 10, znesek: 15, km: 99000 }]);
t('leta padajoče', gorLeta().join(',') === '2026,2025', gorLeta());
_gorLeto = 'vse'; t('vsa leta', gorIzbrane().length === 5, gorIzbrane().length);
_gorLeto = '2026'; t('samo 2026', gorIzbrane().length === 4, gorIzbrane().length);
_gorLeto = '2025'; t('samo 2025', gorIzbrane().map(x => x.id).join(',') === '5', gorIzbrane());

console.log('\n  ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

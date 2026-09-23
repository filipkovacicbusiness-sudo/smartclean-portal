// Testi razčlenjevalnika uradnih cen goriva (Edge funkcija cene-goriva).
// Funkcija se izlušči iz index.ts in preizkusi nad shranjenim posnetkom
// tabele z gov.si, da za test ni potrebna mreža.
// Zagon:  node test/ceneGoriva.test.js
const fs = require('fs'), path = require('path');
const ts = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'cene-goriva', 'index.ts'), 'utf8');
const vzorec = fs.readFileSync(path.join(__dirname, 'vzorci', 'gov-cene-goriva.html'), 'utf8');

// izlušči export function razclenimoCene(...) { ... } in odstrani zapise tipov
const i = ts.indexOf('export function razclenimoCene(');
if (i < 0) throw new Error('razclenimoCene ni več v index.ts — je funkcija preimenovana?');
let d = 0, j = ts.indexOf('{', ts.indexOf(')', i)), konec = -1;
for (let k = j; k < ts.length; k++) { if (ts[k] === '{') d++; else if (ts[k] === '}') { d--; if (!d) { konec = k + 1; break; } } }
const brezTipov = ts.slice(i, konec)
  .replace(/^export\s+/, '')
  .replace(/\(html: string\): Cena\[\]/, '(html)')
  .replace(/: Cena\[\] = \[\]/, ' = []')
  .replace(/\((\w+): string(?: \| number)?(, )?/g, '($1$2')
  .replace(/, (\w+): string/g, ', $1');
const razclenimoCene = eval('(' + brezTipov.replace(/^function /, 'function ') + ')');

let pass = 0, fail = 0;
const t = (n, c, got) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (got !== undefined ? '  -> ' + JSON.stringify(got) : '')); } };

const v = razclenimoCene(vzorec);
t('tabela je razčlenjena', v.length === 125, v.length);

// Vsi datumi veljavni in obdobje se ne konča pred začetkom.
const slabi = v.filter(x => isNaN(Date.parse(x.velja_od)) || isNaN(Date.parse(x.velja_do)) || x.velja_od > x.velja_do);
t('ni neveljavnih obdobij', slabi.length === 0, slabi.slice(0, 3));

// Obdobja se ne prekrivajo in se stikajo — če se to podre, je vzrok parser.
const s = v.slice().sort((a, b) => (a.velja_od < b.velja_od ? -1 : 1));
let prekrivanj = 0, vrzeli = [];
for (let i2 = 1; i2 < s.length; i2++) {
  if (s[i2].velja_od <= s[i2 - 1].velja_do) prekrivanj++;
  const nasl = new Date(Date.parse(s[i2 - 1].velja_do) + 86400000).toISOString().slice(0, 10);
  if (s[i2].velja_od !== nasl) vrzeli.push(s[i2 - 1].velja_do + ' → ' + s[i2].velja_od);
}
t('obdobja se ne prekrivajo', prekrivanj === 0, prekrivanj);
t('obdobja se stikajo brez vrzeli', vrzeli.length === 0, vrzeli);

// Obdobje, ki prestopi novo leto: leto je zapisano samo pri koncu.
const prestop = v.find(x => x.velja_do === '2023-01-03');
t('»od 20. 12. do 3. 1. 2023« se začne 2022', prestop && prestop.velja_od === '2022-12-20', prestop);
const prestop2 = v.find(x => x.velja_do === '2026-01-12');
t('»od 30. 12. 2025 do 12. 1. 2026« (obe leti zapisani)', prestop2 && prestop2.velja_od === '2025-12-30', prestop2);

// Cene: znane vrednosti iz posnetka.
const zadnja = s[s.length - 1];
t('najnovejše obdobje', zadnja.velja_od === '2026-09-22' && zadnja.velja_do === '2026-09-28', zadnja);
t('dizel 22.–28. 9. 2026 = 2,012', zadnja.dizel === 2.012, zadnja.dizel);
t('NMB-95 istega tedna = 1,748', zadnja.nmb95 === 1.748, zadnja.nmb95);
t('vse cene dizla so smiselne (1–3 €/l)', v.every(x => x.dizel > 1 && x.dizel < 3), v.map(x => x.dizel).filter(x => x <= 1 || x >= 3));
t('razpon posnetka', s[0].velja_od === '2022-06-21', s[0]);

// Varovalka: ob spremenjeni obliki strani mora vrniti napako ali nič, nikoli
// tihe napačne vrstice — funkcija ob praznem rezultatu ne piše v bazo.
let vrglo = false;
try { razclenimoCene('<html><body><p>nič</p></body></html>'); } catch (e) { vrglo = true; }
t('stran brez tabele vrže napako', vrglo === true);
t('tabela brez ustreznih vrstic da prazen seznam',
  razclenimoCene('<table><tr><th>Datum veljavnosti</th><th>a</th><th>b</th></tr></table>').length === 0);

console.log('\n  ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

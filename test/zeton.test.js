// Testi preverjanja žetona kartice pri dodelitvi v Prisotnosti.
// Zagon:  node test/zeton.test.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const m = src.match(/var ZETON_VZOREC = (\/.*\/);/);
if (!m) throw new Error('ZETON_VZOREC ni več v portal.js');
const VZOREC = eval(m[1]);
// Ista normalizacija kot v prisDodeliKarto
const normaliziraj = s => String(s || '').replace(/\s+/g, '').toUpperCase();

let pass = 0, fail = 0;
const t = (n, c, got) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (got !== undefined ? '  -> ' + JSON.stringify(got) : '')); } };
const velja = s => VZOREC.test(normaliziraj(s));

const pravi = 'C780787FA692BE56F19CCA9FE89B44BB';
t('pravi žeton (32 hex)', velja(pravi));
t('male črke se popravijo', velja(pravi.toLowerCase()));
t('presledki ob lepljenju se odstranijo', velja(' C780787F A692BE56 F19CCA9F E89B44BB '));
t('prelom vrstice se odstrani', velja('C780787FA692BE56\nF19CCA9FE89B44BB'));
t('normalizacija da velike črke', normaliziraj(' c780 787f ') === 'C780787F');

t('prekratek (31) zavrnjen', !velja(pravi.slice(0, 31)));
t('predolg (33) zavrnjen', !velja(pravi + 'A'));
t('prazen zavrnjen', !velja(''));
t('sami presledki zavrnjeni', !velja('     '));
t('ne-hex znak zavrnjen', !velja('G' + pravi.slice(1)));
t('star UID (8 znakov) zavrnjen', !velja('04A1B2C3'), 'stara kartica ni DESFire žeton');
t('decimalna številka zavrnjena', !velja('1234567890'));
t('žeton z narekovaji iz SQL zavrnjen', !velja("'" + pravi + "'"));

// Ne sme se ujemati z ničemer, kar ima presledke v sredini po normalizaciji
t('dva žetona skupaj zavrnjena', !velja(pravi + pravi));

console.log('\n  ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

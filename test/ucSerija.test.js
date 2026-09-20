// Testi datumske logike stolpčnega grafa na Statistiki.
// Funkcije so v veliki IIFE v portal.js, zato jih tu izluščimo po imenu
// in poženemo z nadomestki za okolje (UCEN_LISTI, datum, ucMesecIme …).
// Zagon:  node test/ucSerija.test.js
const fs=require('fs'); const src=fs.readFileSync(require('path').join(__dirname,'..','portal.js'),'utf8');
function grab(name){ const i=src.indexOf('  function '+name+'('); if(i<0) throw new Error('ni: '+name);
  let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} } }
let UCEN_LISTI=[], _ucDonutMonth='2026-08';
const danes10=()=>'2026-09-20';
const datum=d=>d?d.split('-').reverse().join('.'):'—';
const ucMesecIme=mk=>{const m=['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december'];return m[+mk.slice(5,7)-1]+' '+mk.slice(0,4);};
eval(grab('_ucK')+grab('_ucMesLab')+grab('ucBarsGostota')+grab('ucSerija'));

let pass=0,fail=0;
const t=(n,c,got)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(got!==undefined?'  -> '+JSON.stringify(got):''));} };

// avgust 2026 ima 31 dni
UCEN_LISTI=[{doc_date:'2026-08-01',weight_kg:10},{doc_date:'2026-08-31',weight_kg:5},{doc_date:'2026-09-01',weight_kg:99}];
let r=ucSerija('mesec');
t('mesec: 31 stolpcev za avgust', r.rows.length===31, r.rows.length);
t('mesec: prvi dan = 10 kg', r.rows[0].kg===10, r.rows[0].kg);
t('mesec: zadnji dan = 5 kg', r.rows[30].kg===5, r.rows[30].kg);
t('mesec: september NI vštet', r.rows.reduce((s,o)=>s+o.kg,0)===15, r.rows.reduce((s,o)=>s+o.kg,0));
t('mesec: naslov', r.naslov==='kg po dnevih · avgust 2026', r.naslov);

// februar prestopnega leta
_ucDonutMonth='2024-02'; t('prestopni februar = 29 dni', ucSerija('mesec').rows.length===29, ucSerija('mesec').rows.length);
_ucDonutMonth='2026-02'; t('navadni februar = 28 dni', ucSerija('mesec').rows.length===28, ucSerija('mesec').rows.length);
_ucDonutMonth='2026-08';

// vse: od najzgodnejšega do najpoznejšega meseca, tudi čez prelom leta
UCEN_LISTI=[{doc_date:'2025-11-10',weight_kg:1},{doc_date:'2026-02-02',weight_kg:2}];
r=ucSerija('vse');
t('vse: nov2025..feb2026 = 4 meseci', r.rows.length===4, r.rows.map(o=>o.key));
t('vse: prelom leta pravilen', r.rows.map(o=>o.key).join(',')==='2025-11,2025-12,2026-01,2026-02', r.rows.map(o=>o.key));
t('vse: vsota ohranjena', r.rows.reduce((s,o)=>s+o.kg,0)===3);
t('vse: prazni podatki ne sesujejo', (UCEN_LISTI=[], ucSerija('vse').rows.length===0));

// 3 meseci: tedni od ponedeljka, brez podvajanja
UCEN_LISTI=[{doc_date:'2026-09-20',weight_kg:7},{doc_date:'2026-07-01',weight_kg:3},{doc_date:'2026-08-15',weight_kg:4}];
r=ucSerija('3m');
t('3m: naslov', r.naslov==='kg po tednih · zadnji 3 meseci', r.naslov);
t('3m: vsak stolpec je ponedeljek', r.rows.every(o=>new Date(o.key+'T00:00:00').getDay()===1));
t('3m: tedni si sledijo po 7 dni', r.rows.every((o,i)=>i===0||(new Date(o.key)-new Date(r.rows[i-1].key))===7*864e5));
t('3m: vsak list šteje natanko enkrat', r.rows.reduce((s,o)=>s+o.kg,0)===14, r.rows.reduce((s,o)=>s+o.kg,0));
t('3m: pokrije julij (začetek obsega)', r.rows[0].key<='2026-07-01', r.rows[0].key);

// gostota: odloča SAMO o razmiku (redčenje napisov je po meritvi v ucBarsFit)
t('gostota: 7 stolpcev -> širok razmik', ucBarsGostota(7).gap===12, ucBarsGostota(7));
t('gostota: 20 stolpcev -> srednji razmik', ucBarsGostota(20).gap===6, ucBarsGostota(20));
t('gostota: 31 stolpcev -> ozek razmik', ucBarsGostota(31).gap===3, ucBarsGostota(31));
t('gostota: razmik pada z gostoto', ucBarsGostota(7).gap>=ucBarsGostota(20).gap && ucBarsGostota(20).gap>=ucBarsGostota(31).gap);

console.log('\n  '+pass+' ok, '+fail+' fail');
process.exit(fail?1:0);

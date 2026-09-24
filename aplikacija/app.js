(function(){
"use strict";
/* ══════════════════════════════════════════════════════════════════════
   SmartClean — spremni listi (tablica + splet), ena koda za obe različici.
   Različico vstavi zgradi.py; kar je odvisno od naprave (tiskanje, PDF v
   Datoteke, izklop), se ugotovi med tekom (Capacitor na tablici).

   Vmesnik = portal: portal.css, isti vzorci kot v Arhivu portala (kartice
   .a-row, okno, ki zraste iz kartice, obrazec »Nov spremni list«, potrditve
   .sc-modal, predogled dokumenta). Okno je prenos oknoOdpri iz portal.js.

   Podatki ostanejo v istih ključih kot v prejšnjih različicah (pralnica:*).
   ══════════════════════════════════════════════════════════════════════ */
var VARIANTA = "{{VARIANTA}}", APP_VERZIJA = "{{VERZIJA}}";
var LASTNIK = "filip@eflitte.si";
var DOK_BIZ = ["BSMART d.o.o.", "Škalska cesta 6, 3210 Slovenske Konjice", "+386 41 209 676", "+386 68 693 988", "blanka.kovacic1@gmail.com"];
var PRIVZETI_PORTAL = "https://anrhtgbckxrccnafcmsz.supabase.co";
var PRIVZETI_KLJUC = "sb_publishable_LYMbUOYW2IFz4NxgvjXLOg_PJ2-qpS4";   // javni ključ (RLS varuje podatke)

function $(id){ return document.getElementById(id); }

/* ══════════ SHRAMBA ══════════
   Tablica: Capacitor Filesystem (Documents — ostane tudi ob ponovni namestitvi).
   Splet: localStorage. */
var STORE_KEY = "pralnica:entries", CLIENTS_KEY = "pralnica:clients_v3", SETTINGS_KEY = "pralnica:settings",
    PROFILES_KEY = "pralnica:profiles", PORTAL_AUTH_KEY = "pralnica:portal_auth";
var LS = (function(){ try{ var k = "__t"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }catch(e){ return false; } })();
var shrambaZaklenjena = false;   // tablica brez dovoljenja za datoteke → NE pišemo (ne prepišemo starih podatkov s praznimi)

function jeNativno(){ try{ return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }catch(e){ return false; } }
function capFS(){
  try{ if(jeNativno() && Capacitor.Plugins && Capacitor.Plugins.Filesystem) return Capacitor.Plugins.Filesystem; }catch(e){}
  return null;
}
function fileFor(key){ return key.replace(/[^a-z0-9]+/gi, "_") + ".json"; }
function dbRead(key){
  var FS = capFS();
  if(FS){
    return FS.readFile({ path: fileFor(key), directory: "DOCUMENTS", encoding: "utf8" })
      .then(function(r){ return r && r.data != null ? r.data : null; })
      .catch(function(e){
        /* »datoteke ni« je običajno (prvi zagon); »ni dovoljenja« pa pomeni, da podatki SO, a jih ne vidimo */
        if(/EACCES|denied|permission/i.test(String((e && e.message) || e || ""))) shrambaZaklenjena = true;
        return null;
      });
  }
  if(LS){ try{ return Promise.resolve(localStorage.getItem(key)); }catch(e){} }
  return Promise.resolve(null);
}
function dbWrite(key, val){
  if(shrambaZaklenjena) return Promise.resolve(false);
  var FS = capFS();
  if(FS){
    return FS.writeFile({ path: fileFor(key), directory: "DOCUMENTS", encoding: "utf8", data: val, recursive: true })
      .then(function(){ return true; }).catch(function(){ return false; });
  }
  if(LS){ try{ localStorage.setItem(key, val); return Promise.resolve(true); }catch(e){} }
  return Promise.resolve(false);
}
async function dbJson(key, privzeto){ try{ var v = await dbRead(key); return v ? JSON.parse(v) : privzeto; }catch(e){ return privzeto; } }

/* Dnevna varnostna kopija (ena datoteka na dan, zadnjih 30 dni). Prej je nastala nova
   kopija CELEGA arhiva ob vsakem shranjenem listu — tisoče datotek na leto. */
var _varnostnaDan = "";
async function writeBackup(){
  var FS = capFS(); if(!FS || shrambaZaklenjena) return;
  var dan = todayISO();
  try{ await FS.writeFile({ path: "backup/spremni_listi_dan_" + dan + ".json", directory: "DOCUMENTS", encoding: "utf8", data: JSON.stringify(entries), recursive: true }); }catch(e){}
  if(_varnostnaDan === dan) return; _varnostnaDan = dan;
  try{
    var meja = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    var r = await FS.readdir({ path: "backup", directory: "DOCUMENTS" });
    var imena = ((r && r.files) || []).map(function(f){ return typeof f === "string" ? f : (f && f.name) || ""; });
    for(var i = 0; i < imena.length; i++){
      var m = /^spremni_listi_dan_(\d{4}-\d{2}-\d{2})\.json$/.exec(imena[i]);   // samo lastne dnevne kopije
      if(m && m[1] < meja){ try{ await FS.deleteFile({ path: "backup/" + imena[i], directory: "DOCUMENTS" }); }catch(e){} }
    }
  }catch(e){}
}

/* ══════════ STANJE ══════════ */
var CLIENTS = [], entries = [], settings = {}, savedProfs = [], session = null, idleTimer = null;
var osnutek = null;               // nov spremni list v pripravi (ostane, če okno zapreš s ×)
var urejanje = null;              // {id, …} urejanje obstoječega lista v oknu
var iskanje = "", filterStranka = "", filterDatum = "", prikazano = 60;
var pdfPermOK = false, askedPerm = false;
var DOTIK = (function(){ try{ return matchMedia("(pointer: coarse)").matches; }catch(e){ return false; } })();   // tablica/telefon → številčnica

async function loadEntries(){ entries = await dbJson(STORE_KEY, []); if(!Array.isArray(entries)) entries = []; }
async function saveEntries(){ try{ await dbWrite(STORE_KEY, JSON.stringify(entries)); }catch(e){} }
async function loadClients(){ CLIENTS = await dbJson(CLIENTS_KEY, []); if(!Array.isArray(CLIENTS)) CLIENTS = []; }
async function saveClients(){ try{ await dbWrite(CLIENTS_KEY, JSON.stringify(CLIENTS)); }catch(e){} }
async function loadSettings(){
  settings = await dbJson(SETTINGS_KEY, {}); if(!settings || typeof settings !== "object") settings = {};
  settings.idleMin = 15;
  if(!settings.theme) settings.theme = "dark";
  if(!settings.portalUrl) settings.portalUrl = PRIVZETI_PORTAL;
  if(!settings.portalKey) settings.portalKey = PRIVZETI_KLJUC;
}
async function saveSettings(){ await dbWrite(SETTINGS_KEY, JSON.stringify(settings)); }
async function loadProfs(){ savedProfs = await dbJson(PROFILES_KEY, []); if(!Array.isArray(savedProfs)) savedProfs = []; }
async function saveProfs(){ try{ await dbWrite(PROFILES_KEY, JSON.stringify(savedProfs)); }catch(e){} }

/* ══════════ POMOŽNE ══════════ */
function todayISO(){ var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtDateHuman(iso){ if(!iso) return "—"; var p = String(iso).slice(0, 10).split("-"); return p[2] + ". " + p[1] + ". " + p[0]; }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function stevilo(n){ return Number(n || 0).toLocaleString("sl-SI"); }
function tezaFmt(kg){   // enako kot v portalu: max 2 decimalki, vejica, nad 1000 kg v tonah
  kg = Math.round((Number(kg) || 0) * 100) / 100;
  var v, u; if(kg >= 1000){ v = kg / 1000; u = "t"; }else{ v = kg; u = "kg"; }
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",") + u;
}
function sklon(n, e1, e2, e34, e5){ var m = Math.abs(n) % 100; return m === 1 ? e1 : m === 2 ? e2 : (m === 3 || m === 4) ? e34 : e5; }
function sklonListov(n){ return stevilo(n) + " " + sklon(n, "spremni list", "spremna lista", "spremni listi", "spremnih listov"); }
function clientById(id){ return CLIENTS.find(function(c){ return c.id === id; }); }
function entryById(id){ return entries.find(function(x){ return x.id === id; }); }
function strankeUrejene(){ return CLIENTS.slice().sort(function(a, b){ return String(a.naziv || "").localeCompare(String(b.naziv || ""), "sl"); }); }
function stKljuc(e){ var p = String(e.stevilka || "").split("/"); return (parseInt(p[1], 10) || 0) * 100000 + (parseInt(p[0], 10) || 0); }
/* Naslednja številka: največja letošnja (lokalni + iz portala prenesen arhiv) + 1. */
function nextNumber(){
  var y = new Date().getFullYear(), max = 0;
  entries.forEach(function(e){ var p = String(e.stevilka || "").split("/"); if(p[1] == String(y)){ var s = parseInt(p[0], 10); if(!isNaN(s) && s > max) max = s; } });
  return String(max + 1).padStart(4, "0") + "/" + y;
}
function jeZaklenjen(e){ return !!(e && (e.potrjeno || e.zaklenjen)); }
function lahkoBrise(e){ return !(e.syncedAt || e.prenesenIzPortala || e.potrjeno); }

/* ══════════ OBVESTILO (portal: .sc-toast) ══════════ */
function toast(msg){ var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function(){ t.classList.remove("show"); }, 2600); }

/* ══════════ POTRDITEV (portal: potrdiModal, .sc-modal) ══════════ */
var _modalFokus = null;
function potrdiModal(opts){
  opts = opts || {};
  return new Promise(function(resolve){
    _modalFokus = document.activeElement;
    var back = document.createElement("div"); back.className = "sc-modal-back";
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4></h4><p></p><div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no></button><button type="button" class="sc-modal-btn ' + (opts.nevarno ? "danger" : "primary") + '" data-yes></button></div></div>';
    back.querySelector("h4").textContent = opts.naslov || "Potrditev";
    back.querySelector("p").textContent = opts.sporocilo || "";
    back.querySelector("[data-no]").textContent = opts.preklici || "Prekliči";
    back.querySelector("[data-yes]").textContent = opts.potrdi || "Potrdi";
    document.body.appendChild(back);
    requestAnimationFrame(function(){ back.classList.add("show"); });
    var done = false;
    function zapri(val){ if(done) return; done = true; back.classList.remove("show"); document.removeEventListener("keydown", onKey, true);
      setTimeout(function(){ if(back.parentNode) back.parentNode.removeChild(back); }, 180);
      try{ if(_modalFokus && _modalFokus.focus) _modalFokus.focus({ preventScroll: true }); }catch(_){}
      resolve(val); }
    function onKey(e){ if(e.key === "Escape"){ e.stopPropagation(); zapri(false); } else if(e.key === "Enter"){ e.preventDefault(); zapri(true); } }
    back._zapri = function(){ zapri(false); };
    back.querySelector("[data-no]").addEventListener("click", function(e){ e.stopPropagation(); zapri(false); });
    back.querySelector("[data-yes]").addEventListener("click", function(e){ e.stopPropagation(); zapri(true); });
    back.addEventListener("click", function(e){ if(e.target === back) zapri(false); });
    document.addEventListener("keydown", onKey, true);
    var yb = back.querySelector("[data-yes]"); if(yb) yb.focus();
  });
}
function vrhnjiModal(){ var m = document.querySelectorAll(".sc-modal-back"); return m.length ? m[m.length - 1] : null; }

/* ══════════ ŠTEVILČNICA (tablica/telefon: velike tipke namesto tipkovnice) ══════════ */
function stevilcnica(opts){
  opts = opts || {};
  return new Promise(function(resolve){
    _modalFokus = document.activeElement;
    var buf = opts.vrednost ? String(opts.vrednost) : "", prvi = true;
    var back = document.createElement("div"); back.className = "sc-modal-back";
    back.innerHTML = '<div class="sc-modal ap-kp" role="dialog" aria-modal="true"><h4></h4><p></p><div class="ap-kp-disp"></div><div class="ap-keys">' +
      ["1","2","3","4","5","6","7","8","9","C","0","del"].map(function(k){
        if(k === "C") return '<button type="button" class="ap-key util" data-k="C" aria-label="Počisti">C</button>';
        if(k === "del") return '<button type="button" class="ap-key util" data-k="del" aria-label="Briši">⌫</button>';
        return '<button type="button" class="ap-key" data-k="' + k + '">' + k + '</button>';
      }).join("") + '</div><div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Potrdi</button></div></div>';
    back.querySelector("h4").textContent = opts.naslov || "Količina";
    back.querySelector("p").textContent = opts.sporocilo || "";
    var disp = back.querySelector(".ap-kp-disp");
    function risi(){ disp.classList.toggle("prazen", buf === ""); disp.innerHTML = esc(buf === "" ? "0" : buf) + '<small>kos</small>'; }
    function tipka(k){
      if(k === "C") buf = "";
      else if(k === "del") buf = buf.slice(0, -1);
      else { if(prvi) buf = ""; if(buf === "0") buf = ""; if(buf.length < 4) buf += k; }
      prvi = false; risi();
    }
    risi();
    document.body.appendChild(back);
    requestAnimationFrame(function(){ back.classList.add("show"); });
    var done = false;
    function zapri(val){ if(done) return; done = true; back.classList.remove("show"); document.removeEventListener("keydown", onKey, true);
      setTimeout(function(){ if(back.parentNode) back.parentNode.removeChild(back); }, 180);
      try{ if(_modalFokus && _modalFokus.focus) _modalFokus.focus({ preventScroll: true }); }catch(_){}
      resolve(val); }
    function onKey(e){
      if(/^[0-9]$/.test(e.key)){ tipka(e.key); e.preventDefault(); }
      else if(e.key === "Backspace"){ tipka("del"); e.preventDefault(); }
      else if(e.key === "Escape"){ e.stopPropagation(); zapri(null); }
      else if(e.key === "Enter"){ e.preventDefault(); zapri(buf === "" ? 0 : parseInt(buf, 10) || 0); }
    }
    back._zapri = function(){ zapri(null); };
    back.querySelectorAll("[data-k]").forEach(function(b){ b.addEventListener("click", function(e){ e.stopPropagation(); tipka(b.getAttribute("data-k")); }); });
    back.querySelector("[data-no]").addEventListener("click", function(e){ e.stopPropagation(); zapri(null); });
    back.querySelector("[data-yes]").addEventListener("click", function(e){ e.stopPropagation(); zapri(buf === "" ? 0 : parseInt(buf, 10) || 0); });
    back.addEventListener("click", function(e){ if(e.target === back) zapri(null); });
    document.addEventListener("keydown", onKey, true);
  });
}

/* ══════════ OKNO: kartica se razpre v okno (prenos oknoOdpri iz portal.js) ══════════
   Raste OKNO SAMO (z vsebino in senco), a le s transform; vsebina ima nasprotni razteg
   (točno 1/s v vsakem koraku, zato 24 izračunanih ključev), kopija kartice (duh) je
   prvi okvir odpiranja in zadnji zapiranja. Samo transform + opacity. */
var _okno = null;
var OKNO_KRIVULJA = "cubic-bezier(.22,.61,.36,1)";
function oknoMirno(){ try{ return matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){ return false; } }
function oknoGlava(){
  var o = _okno; if(!o) return;
  if(o.glavaFn){   // okno brez kartice (nov spremni list iz gumba): naslov + ×
    o.glava.className = "okno-glava okno-glava-naslov";
    var n = o.glavaFn(o.kartica);
    o.glava.innerHTML = ""; o.glava.appendChild(n); o.glava.appendChild(o.x);
    o.panel.setAttribute("aria-label", n.textContent.trim());
    return;
  }
  var k = o.kartica, cel = k.closest(".lcell");
  o.glava.className = "okno-glava" + (cel ? " " + [].filter.call(cel.classList, function(c){ return c !== "lcell" && c !== "open"; }).join(" ") : "");
  var kop = document.createElement("div");
  kop.className = [].filter.call(k.classList, function(c){ return c !== "okno-vir" && c !== "arh-flash"; }).join(" ") + " okno-kartica";
  kop.innerHTML = k.innerHTML;
  kop.querySelectorAll("[style]").forEach(function(el){ el.removeAttribute("style"); });
  o.glava.innerHTML = ""; o.glava.appendChild(kop); o.glava.appendChild(o.x);
  var nasl = k.querySelector(".a-num");
  o.panel.setAttribute("aria-label", nasl ? nasl.textContent.trim() : "Podrobnosti");
}
function oknoKrivulja(x1, y1, x2, y2){
  function b(t, a1, a2){ var u = 1 - t; return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t; }
  return function(x){
    if(x <= 0) return 0; if(x >= 1) return 1;
    var lo = 0, hi = 1, t = x;
    for(var i = 0; i < 28; i++){ var bx = b(t, x1, x2); if(Math.abs(bx - x) < 1e-5) break; if(bx < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return b(t, y1, y2);
  };
}
var OKNO_ODPRI = oknoKrivulja(.22, .61, .36, 1), OKNO_ZAPRI = oknoKrivulja(.4, 0, .2, 1);
function oknoKljuci(o, krivulja, zapri){
  var c = o.kartica.getBoundingClientRect(), p = o.panel.getBoundingClientRect();
  var sx0 = Math.max(0.02, c.width / p.width), sy0 = Math.max(0.02, c.height / p.height);
  var dx = c.left - p.left, dy = c.top - p.top, N = 24, okno = [], notr = [];
  for(var i = 0; i <= N; i++){
    var t = i / N, e = krivulja(t);
    var f = zapri ? e : 1 - e;   // delež »kartice«: 1 = kartica, 0 = okno
    var sx = 1 + (sx0 - 1) * f, sy = 1 + (sy0 - 1) * f;
    okno.push({ offset: t, transform: "translate(" + (dx * f) + "px," + (dy * f) + "px) scale(" + sx + "," + sy + ")" });
    notr.push({ offset: t, transform: "scale(" + (1 / sx) + "," + (1 / sy) + ")" });
  }
  return { okno: okno, notr: notr };
}
function oknoDuh(o){
  var k = o.kartica, r = k.getBoundingClientRect(), star = k.parentElement;
  var ovoj = document.createElement("div");
  ovoj.className = (star ? [].filter.call(star.classList, function(c){ return c !== "open" && c !== "hidden"; }).join(" ") + " " : "") + "okno-duh";
  ovoj.style.left = r.left + "px"; ovoj.style.top = r.top + "px"; ovoj.style.width = r.width + "px"; ovoj.style.height = r.height + "px";
  ovoj.setAttribute("aria-hidden", "true");
  var cs = getComputedStyle(k);
  var kop = k.cloneNode(true);
  kop.classList.remove("okno-vir", "arh-flash");
  ["id", "data-id", "aria-expanded", "style"].forEach(function(a){ kop.removeAttribute(a); });
  kop.querySelectorAll("[style],[tabindex]").forEach(function(el){ el.removeAttribute("style"); el.removeAttribute("tabindex"); });
  kop.setAttribute("tabindex", "-1");
  kop.style.backgroundColor = cs.backgroundColor; kop.style.backgroundImage = cs.backgroundImage;
  kop.style.borderColor = cs.borderTopColor + " " + cs.borderRightColor + " " + cs.borderBottomColor + " " + cs.borderLeftColor;
  kop.style.boxShadow = cs.boxShadow; kop.style.transition = "none";
  ovoj.appendChild(kop);
  o.back.appendChild(ovoj);
  return ovoj;
}
/* moznosti.glava: funkcija, ki vrne element glave (sicer kopija kartice);
   moznosti.obZaprtju: klic, ko je okno zaprto. */
function oknoOdpri(kartica, vsebina, najdi, moznosti){
  moznosti = moznosti || {};
  if(_okno) oknoZapri(true);
  var back = document.createElement("div"); back.className = "okno-back";
  var zatemni = document.createElement("div"); zatemni.className = "okno-zatemni"; back.appendChild(zatemni);
  var panel = document.createElement("div"); panel.className = "okno";
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
  var notr = document.createElement("div"); notr.className = "okno-notr";
  var glava = document.createElement("div");
  var telo = document.createElement("div"); telo.className = "okno-telo";
  var x = document.createElement("button"); x.type = "button"; x.className = "doc-x okno-x"; x.setAttribute("aria-label", "Zapri"); x.textContent = "×";
  notr.appendChild(glava); notr.appendChild(telo); panel.appendChild(notr); back.appendChild(panel);
  var o = _okno = { back: back, panel: panel, notr: notr, glava: glava, telo: telo, x: x, kartica: kartica, vsebina: vsebina, najdi: najdi,
    id: kartica.dataset.id, glavaFn: moznosti.glava || null, obZaprtju: moznosti.obZaprtju || null };
  oknoGlava();
  telo.appendChild(vsebina);
  var drsnik = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.classList.add("okno-zaklep");
  if(drsnik > 0) document.documentElement.style.paddingRight = drsnik + "px";
  document.body.appendChild(back);
  x.addEventListener("click", function(){ oknoZapri(); });
  back.addEventListener("mousedown", function(e){ o.zunaj = e.target === back; });
  back.addEventListener("touchstart", function(e){ o.zunaj = e.target === back; }, { passive: true });
  back.addEventListener("click", function(e){ if(e.target === back && o.zunaj) oknoZapri(); o.zunaj = false; });
  document.addEventListener("keydown", oknoTipka, true);
  o.visina = panel.offsetHeight;
  /* menjava vsebine (podrobnosti ↔ urejanje) naj višino okna spremeni gladko */
  if(window.ResizeObserver && !oknoMirno()){
    o.ro = new ResizeObserver(function(){
      var h = panel.offsetHeight;
      if(!o.morf && !o.zapiram && Math.abs(h - o.visina) > 2 && panel.animate){
        panel.animate([{ height: o.visina + "px" }, { height: h + "px" }], { duration: 240, easing: OKNO_KRIVULJA });
      }
      o.visina = h;
    });
    o.ro.observe(vsebina);
  }
  void back.offsetWidth; back.classList.add("show");
  if(oknoMirno() || !panel.animate){ kartica.classList.add("okno-vir"); oknoFokus(o); return; }
  o.morf = true;
  var kl = oknoKljuci(o, OKNO_ODPRI, false);
  var duh = oknoDuh(o);
  kartica.classList.add("okno-vir");
  panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: "linear" });
  duh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, delay: 60, easing: "ease", fill: "forwards" });
  notr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 90, easing: "ease", fill: "backwards" });
  notr.animate(kl.notr, { duration: 380, easing: "linear" });
  var konecRasti = function(){ if(!o.morf) return; duh.remove(); o.morf = false; o.visina = panel.offsetHeight; };
  setTimeout(konecRasti, 800);
  panel.animate(kl.okno, { duration: 380, easing: "linear" }).finished.then(konecRasti, konecRasti);
  oknoFokus(o);
}
function oknoFokus(o){ try{ o.x.focus({ preventScroll: true }); }catch(e){} }
function oknoTipka(e){
  if(e.key !== "Escape" || !_okno) return;
  if(vrhnjiModal()) return;   // najprej se zapre, kar je odprto NAD oknom
  e.preventDefault(); oknoZapri();
}
function oknoZapri(takoj){
  var o = _okno; if(!o || o.zapiram) return;
  o.zapiram = true;
  document.removeEventListener("keydown", oknoTipka, true);
  if(o.ro) o.ro.disconnect();
  var k = (o.najdi && o.najdi()) || null;   // po ponovnem izrisu je kartica nov element
  var koncano = false;
  var konec = function(){
    if(koncano) return; koncano = true;   // varovalo: animacija se lahko ne konča (zaslon v ozadju) — glej setTimeout spodaj
    o.back.remove();
    document.querySelectorAll(".okno-vir").forEach(function(el){ el.classList.remove("okno-vir"); });
    document.documentElement.classList.remove("okno-zaklep");
    document.documentElement.style.paddingRight = "";
    if(_okno === o) _okno = null;
    if(k && !takoj){ try{ k.focus({ preventScroll: true }); }catch(e){} }
    if(o.obZaprtju){ try{ o.obZaprtju(k); }catch(e){} }
  };
  if(takoj || oknoMirno() || !o.panel.animate){ konec(); return; }
  setTimeout(konec, 800);
  o.back.classList.remove("show");
  if(!k){   // kartice ni več (izbrisana, izpadla iz filtra) → okno samo izgine
    o.panel.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px) scale(.98)" }], { duration: 200, easing: "ease", fill: "forwards" }).finished.then(konec, konec);
    return;
  }
  if(o.kartica !== k) o.kartica.classList.remove("okno-vir");
  o.kartica = k;
  k.classList.add("okno-vir");
  var r = k.getBoundingClientRect(), tb = document.querySelector(".topbar"), vrh = tb ? tb.offsetHeight : 0;
  if(r.bottom < vrh || r.top > window.innerHeight){ try{ k.scrollIntoView({ block: "center" }); }catch(e){} }
  o.panel.getAnimations().forEach(function(a){ a.cancel(); });
  o.notr.getAnimations().forEach(function(a){ a.cancel(); });
  var kl = oknoKljuci(o, OKNO_ZAPRI, true);
  var duh = oknoDuh(o);
  o.notr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease", fill: "forwards" });
  o.notr.animate(kl.notr, { duration: 320, easing: "linear", fill: "forwards" });
  duh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 150, easing: "ease", fill: "both" });
  o.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, delay: 230, easing: "linear", fill: "forwards" });
  o.panel.animate(kl.okno, { duration: 320, easing: "linear", fill: "forwards" }).finished.then(konec, konec);
}
/* seznam je izrisan na novo: poveži okno z novo kartico ali ga zapri, če kartice ni več */
function oknoPoIzrisu(){
  var o = _okno; if(!o || o.zapiram || o.glavaFn) return;
  var k = o.najdi && o.najdi();
  if(!k){ oknoZapri(); return; }
  if(k !== o.kartica){ o.kartica = k; if(!o.morf) k.classList.add("okno-vir"); }
  oknoGlava();
}
function oknoZamenjajVsebino(nova){
  var o = _okno; if(!o) return;
  if(o.ro) o.ro.unobserve(o.vsebina);
  o.vsebina.remove();
  o.telo.appendChild(nova); o.vsebina = nova;
  if(o.ro) o.ro.observe(nova);
}
/* okno novega lista → kartica shranjenega lista (glava postane kartica, ob zaprtju se okno vrne vanjo) */
function oknoPreusmeri(k, najdi){
  var o = _okno; if(!o) return;
  if(o.kartica && o.kartica !== k) o.kartica.classList.remove("okno-vir");
  o.kartica = k; o.najdi = najdi; o.glavaFn = null; o.id = k.dataset.id;
  k.classList.add("okno-vir");
  oknoGlava();
}

/* ══════════ TEMA IN POGLED ══════════ */
function autoDark(){ var h = new Date().getHours(); return !(h >= 7 && h < 19); }
function applyTheme(){
  var pref = settings.theme || "dark";
  var dark = pref === "auto" ? autoDark() : (pref !== "light");
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  var m = document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
  try{ localStorage.setItem("pralnica:tema", pref); }catch(e){}   // za izris pred nalaganjem (zagonski zaslon)
}
async function toggleTheme(){ settings.theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; applyTheme(); await saveSettings(); }
document.querySelectorAll("[data-tema]").forEach(function(b){ b.onclick = toggleTheme; });
/* Seznam / Mreža (isti ključ »sc-view« kot portal) */
function pogled(){ return document.documentElement.dataset.view === "grid" ? "grid" : "list"; }
function nastaviPogled(v){
  v = v === "grid" ? "grid" : "list";
  try{ localStorage.setItem("sc-view", v); }catch(e){}
  document.documentElement.dataset.view = v;
  document.querySelectorAll(".pogled-seg .seg-b").forEach(function(b){ b.classList.toggle("on", b.dataset.view === v); });
}
document.querySelectorAll(".pogled-seg .seg-b").forEach(function(b){ b.addEventListener("click", function(){ nastaviPogled(b.dataset.view); }); });

/* ══════════ SEZNAM SPREMNIH LISTOV (kartice kot v Arhivu portala) ══════════ */
function filtrirani(){
  var q = iskanje.replace(/[^0-9]/g, "");
  return entries.filter(function(e){
    /* samo po zaporedni številki (pred »/«) — sicer bi se 1452 ujel s 1145/2026 */
    if(q && String(e.stevilka || "").split("/")[0].replace(/[^0-9]/g, "").indexOf(q) < 0) return false;
    if(filterStranka && e.strankaId !== filterStranka) return false;
    if(filterDatum && e.datum !== filterDatum) return false;
    return true;
  }).sort(function(a, b){ return stKljuc(b) - stKljuc(a); });
}
function karticaHtml(e){
  var prazno = !(Number(e.skupajKosov) > 0), pot = jeZaklenjen(e);
  var stat = prazno ? "red" : (pot ? "green" : "yellow");
  var chk = '<span class="arh-chk' + (pot ? " on" : "") + '" title="' + (pot ? "Potrjeno v portalu" : "Še ni potrjeno v portalu") + '">' + (pot ? "✓" : "") + '</span>';
  var oznake = (e.prevoz === "izredni" ? '<span class="a-izr" title="Izredni prevoz">Izredni</span>' : "") +
    (!e.syncedAt ? (e.stevilkaZasedena ? '<span class="a-zas" title="Številka je v portalu že zasedena">Št. zasedena</span>' : '<span class="a-caka" title="Še ni poslan v portal">Ni v portalu</span>') : "") +
    (e.vSporu ? '<span class="a-zas" title="Prekrivanje z urejanjem v portalu">V sporu</span>' : "");
  var pop = (e.portalPopravljenoAt || e.popravljeno_at) ? '<span class="a-pop" title="Popravljeno' + (e.popravil ? " · " + esc(e.popravil) : "") + '">✎</span>' : "";
  return '<div class="lcell arh-' + stat + '"><button class="a-row" type="button" data-id="' + esc(e.id) + '" aria-expanded="false">' + chk +
    '<span class="a-num">' + esc(e.stevilka || "—") + pop + '</span>' +
    '<span class="a-cli">' + esc(e.strankaNaziv || "—") + oznake + '</span>' +
    '<span class="a-foot"><span class="num a-date">' + fmtDateHuman(e.datum) + '</span>' + (e.izdal ? '<span class="a-izdal" title="Izdal spremni list">' + esc(e.izdal) + '</span>' : "") +
    '<span class="num a-qty">' + stevilo(e.skupajKosov) + ' kos</span></span>' +
    '<span class="chev" aria-hidden="true">›</span></button></div>';
}
function najdiKartico(id){ return function(){ try{ return document.querySelector('#listi .a-row[data-id="' + CSS.escape(id) + '"]'); }catch(e){ return null; } }; }
function renderList(){
  var box = $("listi"); if(!box) return;
  var vsi = filtrirani(), filtri = !!(iskanje || filterStranka || filterDatum);
  var t = vsi.slice(0, prikazano);
  if(!vsi.length){
    box.innerHTML = '<div class="empty"><h3>' + (filtri ? "Ni zadetkov" : "Še ni spremnih listov") + '</h3><p>' +
      (filtri ? "Za izbrani filter ni spremnega lista." : "Prvega ustvariš z gumbom »+ Nov spremni list«.") + '</p></div>';
  }else{
    box.innerHTML = '<div class="rows">' + t.map(karticaHtml).join("") + '</div>';
  }
  $("listiVec").innerHTML = vsi.length > t.length ? '<button type="button" class="btn ghost btn-narrow" id="vecBtn">Prikaži več (' + stevilo(vsi.length - t.length) + ')</button>' : "";
  var vb = $("vecBtn"); if(vb) vb.onclick = function(){ prikazano += 60; renderList(); };
  var danes = entries.filter(function(e){ return e.datum === todayISO(); }).length;
  $("listiPod").textContent = filtri ? ("Zadetkov: " + stevilo(vsi.length) + " od " + stevilo(entries.length))
    : (entries.length ? (sklonListov(entries.length) + " na napravi · danes " + stevilo(danes)) : "Vnos in tiskanje spremnih listov");
  $("noga").textContent = "Različica " + APP_VERZIJA + " · " + (VARIANTA === "tablica" ? "tablica" : "splet");
  risiStanje();
  oknoPoIzrisu();
}
$("listi").addEventListener("click", function(ev){
  var b = ev.target.closest(".a-row"); if(!b) return;
  var e = entryById(b.dataset.id); if(!e) return;
  if(_okno) return;
  oknoOdpri(b, detajl(e), najdiKartico(e.id));
});
/* filtri v glavi (kot v Arhivu portala) */
var _isciT = null;
$("isci").addEventListener("input", function(){ clearTimeout(_isciT); var v = this.value; _isciT = setTimeout(function(){ iskanje = v.trim(); prikazano = 60; renderList(); }, 120); });
$("filterStranka").addEventListener("change", function(){ filterStranka = this.value; prikazano = 60; renderList(); });
$("filterDatum").addEventListener("change", function(){ filterDatum = this.value || ""; $("filterDatumX").classList.toggle("hidden", !filterDatum); prikazano = 60; renderList(); });
$("filterDatumX").onclick = function(){ $("filterDatum").value = ""; filterDatum = ""; this.classList.add("hidden"); renderList(); };
function napolniFilterStrank(){
  var sel = $("filterStranka"), v = filterStranka;
  sel.innerHTML = '<option value="">Vse stranke</option>' + strankeUrejene().map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.naziv) + '</option>'; }).join("");
  sel.value = clientById(v) ? v : ""; if(sel.value !== v){ filterStranka = ""; }
}
/* stanje prenosa nad seznamom (portal: .preg-status) */
function risiStanje(){
  var box = $("listiStanje"); if(!box) return;
  var caka = entries.filter(function(e){ return !e.syncedAt; }), zas = caka.filter(function(e){ return e.stevilkaZasedena; }).length;
  if(!caka.length || !portalAuth){ box.innerHTML = ""; return; }
  var brez = navigator.onLine === false || syncZadnje === "ni povezave" || syncZadnje === "ni omrežja";
  var t = "Na prenos v portal " + sklon(caka.length, "čaka", "čakata", "čakajo", "čaka") + " <b>" + sklonListov(caka.length) + "</b>" +
    (zas ? " · " + zas + " z zasedeno številko (odpri list → Nova številka)" : (brez ? " · ni povezave, poslani bodo samodejno" : (syncZadnje ? " · " + esc(syncZadnje) : "")));
  box.innerHTML = '<div class="preg-status ps-warn"><span class="ps-ik">' + (zas ? "!" : "●") + '</span><span>' + t + '.</span></div>';
}

/* ══════════ PODROBNOSTI LISTA V OKNU (kot risiListDetajl v portalu) ══════════ */
function detajl(e, sporocilo){
  var el = document.createElement("div"); el.className = "a-det show";
  var post = e.postavke || [];
  var seznam = post.length ? '<ul>' + post.map(function(p){ return '<li><span title="' + esc(p.naziv) + '">' + esc(p.naziv) + '</span><b>' + stevilo(p.kosov) + '</b></li>'; }).join("") + '</ul>'
    : '<p class="u-sub">Ta spremni list nima postavk.</p>';
  var prevozV = '<span class="prevoz-znak ' + (e.prevoz === "izredni" ? "izr" : "red") + '">' + (e.prevoz === "izredni" ? "Izredni prevoz" : "Redni prevoz") + '</span>';
  var kg = (e.kg !== "" && e.kg != null && Number(e.kg) > 0) ? " · Teža: " + tezaFmt(e.kg) : "";
  var info = '<p class="u-sub" style="margin-top:8px">' + prevozV + (e.izdal ? " · Izdal: " + esc(e.izdal) : "") + kg + '</p>';
  var stanje = "";
  if(sporocilo) stanje += '<p class="ur-ustvarjeno">' + esc(sporocilo) + '</p>';
  if(!e.syncedAt){
    stanje += e.stevilkaZasedena
      ? '<div class="ur-popravek">Številka ' + esc(e.stevilka) + ' je v portalu že zasedena z drugim listom. Dodeli novo številko in list natisni znova.</div>'
      : '<p class="u-sub" style="margin-top:12px">● Še ni v portalu — pošlje se samodejno, ko je povezava' + (e.syncNapaka && e.syncNapaka !== "ni povezave" ? " (" + esc(e.syncNapaka) + ")" : "") + '.</p>';
  }else if(e.vSporu){
    stanje += '<div class="ur-popravek">Hkrati urejeno v portalu in na napravi — razliko reši osebje v portalu (Arhiv).</div>';
  }else if(jeZaklenjen(e)){
    stanje += '<p class="ur-ustvarjeno">✓ Potrjeno v portalu — spremeniš ga lahko samo v portalu.</p>';
  }
  var popAt = e.portalPopravljenoAt || e.popravljeno_at;
  var popravek = popAt ? '<div class="ur-popravek">✎ Popravljeno · ' + esc(e.popravil || "osebje") + ' · ' + fmtDateHuman(String(popAt).slice(0, 10)) + '</div>' : "";
  var opombe = (e.opombaStranka ? '<div class="opomba-blok"><div class="opomba-h">Opomba za stranko (na natisu)</div><div class="opomba-prikaz"><div class="opomba-besedilo">' + esc(e.opombaStranka) + '</div></div></div>' : "") +
    (e.opombaEvidenca ? '<div class="opomba-blok"><div class="opomba-h">Opomba za evidenco (interno — se ne natisne)</div><div class="opomba-prikaz"><div class="opomba-besedilo">' + esc(e.opombaEvidenca) + '</div></div></div>' : "");
  var gumbi = '<div class="u-acts" style="margin-top:12px"><button type="button" class="ur-save" data-natisni>Natisni</button>' +
    (e.stevilkaZasedena && !e.syncedAt ? '<button type="button" data-nova-st>Nova številka</button>' : "") +
    (jeZaklenjen(e) ? "" : '<button type="button" data-uredi>Uredi</button>') +
    (lahkoBrise(e) ? '<button type="button" class="danger" data-izbrisi>Izbriši</button>' : "") + '</div>';
  el.innerHTML = '<div class="a-det-in"><div class="a-det-pad">' + seznam + info + stanje + popravek + opombe + gumbi + '</div></div>';
  el.querySelector("[data-natisni]").onclick = function(){ predogled(e); };
  var u = el.querySelector("[data-uredi]"); if(u) u.onclick = function(){ zacniUrejanje(e); };
  var d = el.querySelector("[data-izbrisi]"); if(d) d.onclick = function(){ izbrisiList(e); };
  var n = el.querySelector("[data-nova-st]"); if(n) n.onclick = function(){ novaStevilka(e.id); };
  return el;
}
function osveziDetajl(e, sporocilo){ if(_okno && _okno.id === e.id && !urejanje) oknoZamenjajVsebino(detajl(e, sporocilo || _okno.sporocilo)); }

/* ══════════ OBRAZEC: NOV / UREJANJE (kot »Nov spremni list« v portalu) ══════════ */
function novOsnutek(){ return { stranka: "", kos: {}, prevoz: "redni", opS: "", opE: "", vsi: false }; }
function kgOsnutka(d){
  var c = clientById(d.stranka), kg = 0, ima = false; if(!c) return { kg: 0, ima: false };
  c.artikli.forEach(function(a){ var q = d.kos[a.id] || 0; if(q > 0 && a.teza != null && !isNaN(a.teza)){ kg += a.teza * q; ima = true; } });
  return { kg: Math.round(kg * 1000) / 1000, ima: ima };
}
function postavkeOsnutka(d){
  var c = clientById(d.stranka); if(!c) return [];
  return c.artikli.filter(function(a){ return (d.kos[a.id] || 0) > 0; }).map(function(a){ return { id: a.id, naziv: a.naziv, kosov: d.kos[a.id] }; });
}
function obrazec(d, nacin){
  var e = nacin === "uredi" ? entryById(d.id) : null;
  var box = document.createElement("div"); box.className = "nov-list show";
  var opts = '<option value="">— izberi stranko —</option>' + strankeUrejene().map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.naziv) + '</option>'; }).join("");
  box.innerHTML = '<div class="ur-form">' +
    '<label class="ur-f"><span>Stranka</span><select data-org' + (e ? " disabled" : "") + '>' + opts + '</select></label>' +
    '<div class="ur-grid ur-grid-3">' +
      '<div class="ur-f"><span>Št.</span><output class="ur-kg-auto" data-st>' + esc(e ? e.stevilka : nextNumber()) + '</output></div>' +
      '<div class="ur-f"><span>Datum</span><output class="ur-kg-auto">' + fmtDateHuman(e ? e.datum : todayISO()) + '</output></div>' +
      '<div class="ur-f"><span>Teža (samodejno)</span><output class="ur-kg-auto" data-teza>—</output></div>' +
    '</div>' +
    '<label class="ur-f"><span>Izdal (samodejno — prijavljeni uporabnik)</span><input type="text" value="' + esc(e ? (e.izdal || "") : (session ? session.user : "")) + '" readonly tabindex="-1" style="opacity:.6;cursor:not-allowed"></label>' +
    '<div class="ur-f"><span>Vrsta prevoza</span><div class="seg" data-transport>' +
      '<button type="button" class="seg-b" data-tv="redni">Redni</button><button type="button" class="seg-b" data-tv="izredni">Izredni prevoz</button></div></div>' +
    '<p class="u-sub" style="margin:10px 0 4px">Postavke — vpiši samo količine; prazne se ne shranijo. <span data-skupaj></span></p>' +
    '<div data-postavke></div>' +
    '<button type="button" class="ur-add" data-dodaj></button>' +
    '<p class="u-sub" style="margin:12px 0 4px">Opombi (neobvezno)</p>' +
    '<div class="ur-opomba">' +
      '<label class="ur-f"><span>Za stranko — natisne se na spremni list</span><textarea class="ur-opomba-txt" data-op-s rows="2" maxlength="600" placeholder="Vidno stranki, natisne se …"></textarea></label>' +
      '<label class="ur-f"><span>Interno — samo osebje, se NE natisne</span><textarea class="ur-opomba-txt" data-op-e rows="2" maxlength="600" placeholder="Vidno samo osebju …"></textarea></label>' +
    '</div>' +
    '<div class="u-acts" style="margin-top:14px"><button type="button" class="ur-save" data-shrani>' + (e ? "Shrani" : "Ustvari") + '</button><button type="button" data-preklici>Prekliči</button></div>' +
    '<p class="u-sub ur-msg" data-msg></p></div>';
  var q = function(s){ return box.querySelector(s); };
  q("[data-org]").value = d.stranka || "";
  q("[data-op-s]").value = d.opS || ""; q("[data-op-e]").value = d.opE || "";
  box.querySelectorAll("[data-transport] .seg-b").forEach(function(b){
    b.classList.toggle("on", b.dataset.tv === (d.prevoz === "izredni" ? "izredni" : "redni"));
    b.onclick = function(){ d.prevoz = b.dataset.tv; box.querySelectorAll("[data-transport] .seg-b").forEach(function(x){ x.classList.toggle("on", x === b); }); };
  });
  q("[data-op-s]").oninput = function(){ d.opS = this.value; };
  q("[data-op-e]").oninput = function(){ d.opE = this.value; };
  q("[data-org]").onchange = function(){
    d.stranka = this.value; d.kos = {}; d.vsi = false; risiPostavke(box, d);
    if(d.stranka && portalAuth) osveziStrankinArtikle(d.stranka);   // artikli TE stranke naravnost iz portala
  };
  q("[data-dodaj]").onclick = function(){ d.vsi = !d.vsi; risiPostavke(box, d); };
  q("[data-preklici]").onclick = function(){ preklici(d, nacin); };
  q("[data-shrani]").onclick = function(){ if(nacin === "uredi") shraniUrejanje(box, d); else ustvari(box, d); };
  box._d = d; box._nacin = nacin;
  risiPostavke(box, d);
  return box;
}
function risiPostavke(box, d){
  var pBox = box.querySelector("[data-postavke]"), add = box.querySelector("[data-dodaj]"), c = clientById(d.stranka);
  if(!c){ pBox.innerHTML = '<div class="ap-prazno-art u-sub">Izberi stranko — njeni artikli se prikažejo samodejno.</div>'; add.classList.add("hidden"); osveziSkupaj(box, d); return; }
  if(!c.artikli.length){ pBox.innerHTML = '<div class="ap-prazno-art u-sub">Stranka še nima artiklov. Doda jih osebje v portalu (Cenik &amp; Artikli).</div>'; add.classList.add("hidden"); osveziSkupaj(box, d); return; }
  /* premade: artikli, ki jih stranka ima (viden_app) ali so že vpisani; ostali na »+ Dodaj postavko« */
  function vSeznamu(a){ return a.vid !== false || (d.kos[a.id] || 0) > 0; }
  var izven = c.artikli.filter(function(a){ return !vSeznamu(a); });
  var vidni = d.vsi ? c.artikli : c.artikli.filter(vSeznamu);
  pBox.innerHTML = vidni.map(function(a){
    var k = d.kos[a.id] || 0;
    return '<div class="ur-post ap-post' + (k > 0 ? " polno" : "") + '" data-aid="' + esc(a.id) + '"><div class="ap-pn"><span title="' + esc(a.naziv) + '">' + esc(a.naziv) + '</span></div>' +
      '<input type="text" inputmode="numeric" pattern="[0-9]*" data-pk placeholder="kos" value="' + (k > 0 ? k : "") + '" aria-label="Količina (kosov) — ' + esc(a.naziv) + '"' + (DOTIK ? " readonly" : "") + '></div>';
  }).join("");
  add.classList.toggle("hidden", !izven.length);
  add.textContent = d.vsi ? "Skrij artikle izven seznama" : "+ Dodaj postavko (izven seznama) · " + izven.length;
  pBox.querySelectorAll(".ap-post").forEach(function(row){
    var id = row.dataset.aid, inp = row.querySelector("[data-pk]"), a = c.artikli.find(function(x){ return x.id === id; });
    function nastavi(n){ n = Math.max(0, Math.min(9999, parseInt(n, 10) || 0)); if(n > 0) d.kos[id] = n; else delete d.kos[id];
      inp.value = n > 0 ? n : ""; row.classList.toggle("polno", n > 0); osveziSkupaj(box, d); }
    if(DOTIK){
      inp.addEventListener("click", function(){
        stevilcnica({ naslov: a ? a.naziv : "Količina", sporocilo: (d.kos[id] ? "Zdaj: " + d.kos[id] + " kos" : "Še ni vpisano"), vrednost: d.kos[id] || "" })
          .then(function(n){ if(n != null) nastavi(n); });
      });
    }else{
      inp.addEventListener("input", function(){ var v = inp.value.replace(/[^0-9]/g, "").slice(0, 4); if(v !== inp.value) inp.value = v; nastavi(v); });
      inp.addEventListener("keydown", function(ev){   // Enter → naslednja postavka (kot v portalu)
        if(ev.key !== "Enter") return; ev.preventDefault();
        var vse = [].slice.call(pBox.querySelectorAll("[data-pk]")), i = vse.indexOf(inp);
        if(vse[i + 1]) vse[i + 1].focus(); else box.querySelector("[data-shrani]").focus();
      });
    }
  });
  osveziSkupaj(box, d);
}
function osveziSkupaj(box, d){
  var ka = kgOsnutka(d), n = postavkeOsnutka(d).reduce(function(s, l){ return s + l.kosov; }, 0);
  box.querySelector("[data-teza]").textContent = ka.ima ? tezaFmt(ka.kg) : "—";
  box.querySelector("[data-skupaj]").textContent = n ? ("Skupaj " + stevilo(n) + " kos.") : "";
}
/* okno za nov spremni list (iz gumba v glavi; osnutek ostane, če okno zapreš s ×) */
function odpriNov(){
  if(_okno) return;
  if(!osnutek) osnutek = novOsnutek();
  var d = osnutek;
  oknoOdpri($("novBtn"), obrazec(d, "nov"), function(){ return $("novBtn"); }, {
    glava: function(){ var h = document.createElement("h3"); h.className = "sec-h"; h.textContent = "Nov spremni list"; return h; }
  });
  if(d.stranka && portalAuth) osveziStrankinArtikle(d.stranka);
}
$("novBtn").onclick = odpriNov;
async function preklici(d, nacin){
  if(nacin === "uredi"){ var e = entryById(d.id); urejanje = null; if(e && _okno) oknoZamenjajVsebino(detajl(e)); else oknoZapri(); return; }
  if(postavkeOsnutka(d).length){
    var ok = await potrdiModal({ naslov: "Zavržem vnos?", sporocilo: "Vpisane količine za ta spremni list bodo izbrisane.", potrdi: "Zavrzi", nevarno: true });
    if(!ok) return;
  }
  osnutek = null; oknoZapri();
}
function novZapis(c, d, lines){
  return { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    stevilka: nextNumber(), datum: todayISO(), ustvarjeno: new Date().toISOString(),
    strankaId: c.id, strankaNaziv: c.naziv, strankaPodjetje: c.podjetje, strankaNaslov: c.naslov, strankaDavcna: c.davcna,
    izdal: (session ? session.user : ""), postavke: lines, skupajKosov: lines.reduce(function(a, l){ return a + l.kosov; }, 0),
    kg: kgOsnutka(d).kg, prevoz: d.prevoz === "izredni" ? "izredni" : "redni", opombaStranka: (d.opS || "").trim(), opombaEvidenca: (d.opE || "").trim(),
    saved: true, syncedAt: null, syncNapaka: null };
}
var _shranjujem = false;
async function ustvari(box, d){
  var msg = box.querySelector("[data-msg]"), c = clientById(d.stranka), lines = postavkeOsnutka(d);
  if(!c){ msg.textContent = "Izberi stranko."; return; }
  if(!lines.length){ msg.textContent = "Vpiši količino vsaj pri enem artiklu."; return; }
  if(_shranjujem) return; _shranjujem = true;
  try{
    msg.textContent = "Shranjujem …";
    var ent = novZapis(c, d, lines);
    entries.push(ent);
    await saveEntries(); writeBackup();
    /* artikel, ki je bil izven seznama, a je zdaj na listu, postane viden (enako naredi baza) */
    var razkril = false;
    lines.forEach(function(l){ var a = c.artikli.find(function(x){ return x.id === l.id; }); if(a && a.vid === false){ a.vid = true; razkril = true; } });
    if(razkril) saveClients();
    osnutek = null;
    /* seznam brez filtrov, da je nova kartica vidna; okno se preusmeri vanjo (kot v portalu) */
    iskanje = ""; filterStranka = ""; filterDatum = ""; $("isci").value = ""; $("filterStranka").value = ""; $("filterDatum").value = ""; $("filterDatumX").classList.add("hidden");
    renderList();
    var k = najdiKartico(ent.id)();
    if(k && _okno){ oknoPreusmeri(k, najdiKartico(ent.id)); _okno.sporocilo = "✓ Spremni list je shranjen. Natisni ga za stranko."; oknoZamenjajVsebino(detajl(ent, _okno.sporocilo)); }
    else oknoZapri();
    savePdfs(ent);
    try{ syncPush(true); }catch(_){}
  }finally{ _shranjujem = false; }
}
function zacniUrejanje(e){
  if(jeZaklenjen(e)){ toast("List " + e.stevilka + " je v portalu potrjen — spremeniš ga lahko samo v portalu."); return; }
  var c = clientById(e.strankaId); if(!c){ toast("Stranke ni več v seznamu — urejanje ni mogoče."); return; }
  var d = { id: e.id, stranka: e.strankaId, kos: {}, prevoz: e.prevoz === "izredni" ? "izredni" : "redni", opS: e.opombaStranka || "", opE: e.opombaEvidenca || "", vsi: false };
  (e.postavke || []).forEach(function(p){
    var a = (p.id && c.artikli.find(function(x){ return x.id === p.id; })) || c.artikli.find(function(x){ return x.naziv === p.naziv; });
    if(a) d.kos[a.id] = (d.kos[a.id] || 0) + p.kosov;
  });
  urejanje = d;
  oknoZamenjajVsebino(obrazec(d, "uredi"));
}
function opisiSpremembe(stare, nova, sKg, nKg, sPre, nPre){
  var mapS = {}, mapN = {}, imena = {};
  (stare || []).forEach(function(p){ mapS[p.naziv] = (mapS[p.naziv] || 0) + (p.kosov || 0); imena[p.naziv] = 1; });
  (nova || []).forEach(function(p){ mapN[p.naziv] = (mapN[p.naziv] || 0) + (p.kosov || 0); imena[p.naziv] = 1; });
  var deli = [];
  Object.keys(imena).forEach(function(nm){ var a = mapS[nm] || 0, b = mapN[nm] || 0;
    if(a !== b){ if(a === 0) deli.push("+" + nm + " " + b); else if(b === 0) deli.push("−" + nm + " (" + a + ")"); else deli.push(nm + " " + a + "→" + b); } });
  if(Number(sKg || 0) !== Number(nKg || 0)) deli.push("teža " + tezaFmt(sKg || 0) + "→" + tezaFmt(nKg || 0));
  if((sPre || "redni") !== (nPre || "redni")) deli.push("prevoz " + (sPre === "izredni" ? "izredni" : "redni") + "→" + (nPre === "izredni" ? "izredni" : "redni"));
  return deli.length ? deli.join(", ") : "brez vsebinskih sprememb";
}
async function shraniUrejanje(box, d){
  var msg = box.querySelector("[data-msg]"), e = entryById(d.id); if(!e){ oknoZapri(); return; }
  if(jeZaklenjen(e)){ urejanje = null; toast("List " + e.stevilka + " je medtem v portalu potrjen — spremembe niso shranjene."); oknoZamenjajVsebino(detajl(e)); return; }
  var lines = postavkeOsnutka(d); if(!lines.length){ msg.textContent = "Vpiši količino vsaj pri enem artiklu."; return; }
  var novaKg = kgOsnutka(d).kg, kdo = (session ? session.user : "") || "osebje", zdaj = new Date().toISOString();
  var opS = (d.opS || "").trim(), opE = (d.opE || "").trim();
  var opis = opisiSpremembe(e.postavke, lines, e.kg, novaKg, e.prevoz, d.prevoz);
  if(((e.opombaStranka || "") !== opS) || ((e.opombaEvidenca || "") !== opE)) opis += " · opomba posodobljena";
  e.popravil = kdo; e.popravljeno_at = zdaj;
  e.popravki = (e.popravki ? e.popravki + "\n" : "") + fmtDateHuman(zdaj.slice(0, 10)) + " · " + kdo + ": " + opis;
  e.postavke = lines; e.skupajKosov = lines.reduce(function(a, l){ return a + l.kosov; }, 0);
  e.kg = novaKg; e.prevoz = d.prevoz === "izredni" ? "izredni" : "redni"; e.opombaStranka = opS; e.opombaEvidenca = opE;
  e.syncedAt = null; e.syncNapaka = null;
  await saveEntries(); writeBackup();
  if(e.saved) savePdfs(e);
  urejanje = null;
  renderList();
  if(_okno) _okno.sporocilo = "✓ Spremembe so shranjene. Natisni list znova za stranko.";
  oknoZamenjajVsebino(detajl(e, _okno && _okno.sporocilo));
  try{ syncPush(true); }catch(_){}
}
/* brisanje: samo lokalni osnutki, ki še niso v portalu (portal je vir resnice) */
async function izbrisiList(e){
  if(!lahkoBrise(e)){ toast("Spremni list, ki je že v portalu, izbrišeš v portalu."); return; }
  var ok = await potrdiModal({ naslov: "Izbrišem spremni list?", sporocilo: e.stevilka + " (" + e.strankaNaziv + ") še ni v portalu in bo izbrisan samo s te naprave.", potrdi: "Izbriši", nevarno: true });
  if(!ok) return;
  await deleteSyncPdf(e);
  entries = entries.filter(function(x){ return x.id !== e.id; });
  await saveEntries(); renderList(); risiSyncGumb();
}
/* številka je v portalu zasedena z drugim listom → predlagaj prosto (portal + naprava) */
async function novaStevilka(id){
  var e = entryById(id); if(!e) return;
  var leto = String(e.stevilka).split("/")[1] || String(new Date().getFullYear());
  var izPortala = 0;
  try{ var r = await api("rpc/app_prosta_stevilka", { method: "POST", body: { p_leto: parseInt(leto, 10) } }); if(typeof r === "number") izPortala = r; }catch(_){}
  var maxLok = 0; entries.forEach(function(x){ var p = String(x.stevilka || "").split("/"); if(p[1] === leto){ var s = parseInt(p[0], 10); if(!isNaN(s) && s > maxLok) maxLok = s; } });
  var nova = String(Math.max(izPortala, maxLok + 1)).padStart(4, "0") + "/" + leto;
  var ok = await potrdiModal({ naslov: "Nova številka lista?", sporocilo: "Številka " + e.stevilka + " je v portalu že zasedena z drugim spremnim listom. Ta list dobi številko " + nova + ". Na natisnjenem listu popravi številko ali ga natisni znova.", potrdi: "Spremeni v " + nova });
  if(!ok) return;
  await renameEntryNumber(id, nova);
  e.stevilkaZasedena = false; e.syncNapaka = null; await saveEntries();
  renderList(); osveziDetajl(e);
  try{ syncPush(false); }catch(_){}
}
async function renameEntryNumber(id, nn){
  var e = entryById(id); if(!e || nn === e.stevilka) return;
  if(entries.some(function(x){ return x.id !== id && x.stevilka === nn; })){ toast("Ta številka že obstaja."); return; }
  var P = pdfPlugin(); if(P && e.pdfSaved){ try{ await P.deleteFile({ relPath: SINHRO + pdfName(e) }); }catch(err){} }
  e.stevilka = nn; e.pdfSaved = false;
  await saveEntries();
  if(e.saved) await savePdfs(e);
  toast("Številka spremenjena v " + nn);
}
/* po osvežitvi kataloga / artiklov iz portala: odprt obrazec in filter naj pokažeta sveže */
function poKatalogu(){
  napolniFilterStrank();
  var v = _okno && _okno.vsebina;
  if(v && v._d){
    var sel = v.querySelector("[data-org]"), izbrana = v._d.stranka;
    if(sel && !sel.disabled){
      sel.innerHTML = '<option value="">— izberi stranko —</option>' + strankeUrejene().map(function(c){ return '<option value="' + esc(c.id) + '">' + esc(c.naziv) + '</option>'; }).join("");
      sel.value = clientById(izbrana) ? izbrana : "";
    }
    risiPostavke(v, v._d);
  }
}
function poArtiklih(cid){ var v = _okno && _okno.vsebina; if(v && v._d && v._d.stranka === cid) risiPostavke(v, v._d); }

/* ══════════ DOKUMENT (enak kot v portalu) ══════════
   Natisnjen / shranjen spremni list je oblikovno enak tistemu iz portala:
   logotip (Playfair) enkrat na vrhu, Archivo, ista razporeditev. Pisave so
   vgrajene, zato dokument deluje tudi brez povezave (tablica na WiFi tiskalnika). */
var DOK_CSS = "@page{size:A4;margin:0}" +
  "*{box-sizing:border-box}html{background:#e9edeb}" +
  "body{margin:0;background:#e9edeb;color:#0a0a0a;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
  ".a4{position:relative;padding:12mm 12mm 14mm;color:#0a0a0a;background:#fff;min-height:297mm;break-after:page}" +
  ".a4:last-child{break-after:auto}.a4+.a4{margin-top:14px}" +
  "@media print{html,body{background:#fff}.a4{min-height:0}.a4+.a4{margin-top:0}}" +
  ".sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1.5px solid #0a0a0a}" +
  ".sc-wm{font-family:'Playfair Display',serif;font-weight:700;letter-spacing:-.03em;line-height:.9;font-size:32px;color:#0d1f17;white-space:nowrap}" +
  ".sc-wm span{color:#1a6644}" +
  ".sc-biz{font-size:9px;line-height:1.6;text-align:right;color:#666;white-space:nowrap;font-weight:500}" +
  ".sc-box{border:1px solid #dcdcdc;border-radius:9px;padding:10px 14px;margin-bottom:10px}" +
  ".sc-num{font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:12px}" +
  ".sc-num b{font-variant-numeric:tabular-nums;letter-spacing:.01em}" +
  ".sc-client{display:flex;justify-content:space-between;gap:14px}.sc-client .cl{font-size:12px}" +
  ".sc-client .cname{font-weight:700;border-bottom:2px solid #0a0a0a;padding:0 2px}" +
  ".sc-client .cname-sec{font-weight:400;color:#6b7280;font-size:.85em;margin-left:4px}" +
  ".sc-client .sc-dates{margin-top:10px;font-size:11px;color:#666}" +
  ".sc-sign{border-left:1px solid #dcdcdc;padding-left:16px;font-weight:600;font-size:12px;min-width:110px;color:#666}" +
  "table.sc-table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}" +
  "table.sc-table th{color:#0a0a0a;font-weight:700;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:0 8px 8px;text-align:center;border-bottom:1.5px solid #0a0a0a}" +
  "table.sc-table th.l{text-align:left}" +
  "table.sc-table td{border-bottom:1px solid #ececec;padding:5px 8px;height:15px;font-variant-numeric:tabular-nums}" +
  "table.sc-table td.an{color:#0a0a0a;font-weight:600;text-align:left}" +
  "table.sc-table td.qty{text-align:center;font-weight:700;width:34%;color:#0a0a0a}" +
  ".sc-weight{margin-top:12px;font-size:12px;color:#0a0a0a;text-align:right;font-weight:600}" +
  ".sc-note{margin-top:10px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;white-space:pre-wrap}" +
  ".sc-popr{margin-top:10px;padding:6px 10px;border-radius:8px;background:#fdf3e8;color:#8a5a00;font-size:11px;font-weight:600}";
function dokGlavaHtml(){ return '<div class="sc-head"><div class="sc-wm">Smart<span>Clean</span></div><div class="sc-biz">' + DOK_BIZ.map(esc).join("<br>") + '</div></div>'; }
function dokHtml(naslov, telesa){
  /* swap (ne block): tablica natisne/shrani ob »onPageFinished« — če bi pisava zamujala,
     bi bil z »block« tekst neviden; tako je v najslabšem primeru v nadomestni pisavi. */
  var pisave = (($("pisave") || {}).textContent || "").replace(/font-display:block/g, "font-display:swap");
  return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(naslov) + '</title><style>' + pisave + DOK_CSS + '</style></head><body>' +
    telesa.map(function(t){ return '<div class="a4">' + dokGlavaHtml() + t + '</div>'; }).join("") + '</body></html>';
}
function listTelo(e){
  var naziv = e.strankaPodjetje || e.strankaNaziv || "—";
  var nazivSek = (e.strankaPodjetje && e.strankaNaziv && e.strankaNaziv !== e.strankaPodjetje) ? e.strankaNaziv : "";
  var post = e.postavke || [];
  var rows = post.length ? post.map(function(p){ return '<tr><td class="an">' + esc(p.naziv) + '</td><td class="qty">' + stevilo(p.kosov) + '</td></tr>'; }).join("")
                         : '<tr><td class="an" colspan="2" style="color:#888">Ni postavk</td></tr>';
  var izdal = e.izdal ? " &nbsp;·&nbsp; Izdal: " + esc(e.izdal) : "";
  var prevoz = " &nbsp;·&nbsp; " + (e.prevoz === "izredni" ? "Izredni prevoz" : "Redni prevoz");
  var kg = (e.kg !== "" && e.kg != null && Number(e.kg) > 0) ? '<div class="sc-weight">Skupaj teža perila: <b>' + tezaFmt(e.kg) + '</b></div>' : "";
  var opomba = e.opombaStranka ? '<div class="sc-note"><b>Opomba:</b> ' + esc(e.opombaStranka) + '</div>' : "";   // interna opomba se NE tiska
  var popAt = e.portalPopravljenoAt || e.popravljeno_at;
  var popr = popAt ? '<div class="sc-popr">Popravljeno v portalu · ' + esc(e.popravil || "osebje") + ' · ' + fmtDateHuman(String(popAt).slice(0, 10)) + '</div>' : "";
  return '<div class="sc-box sc-num"><span>Št. spremnega lista: <b>' + esc(e.stevilka) + '</b></span></div>' +
    '<div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">' + esc(naziv) + '</span>' + (nazivSek ? ' <span class="cname-sec">(' + esc(nazivSek) + ')</span>' : '') + '</div>' +
    '<div class="sc-dates">Oddaja: ' + fmtDateHuman(e.datum) + izdal + prevoz + '</div></div><div class="sc-sign">Podpis:</div></div>' +
    '<table class="sc-table"><thead><tr><th class="l">Naziv artikla</th><th>Oddaja (št. kosov)</th></tr></thead><tbody>' + rows + '</tbody></table>' + kg + opomba + popr;
}
function dokZaListe(arr, izvodov){
  var t = []; arr.forEach(function(e){ for(var i = 0; i < izvodov; i++) t.push(listTelo(e)); });
  return dokHtml(arr.length === 1 ? "Spremni list " + arr[0].stevilka : "Spremni listi", t);
}

/* predogled pred tiskanjem = portalov predogled dokumenta (.doc-modal); prikazan je točno dokument, ki se natisne */
function predogled(e){
  var back = document.createElement("div"); back.className = "sc-modal-back";
  back.innerHTML = '<div class="sc-modal doc-modal" role="dialog" aria-modal="true">' +
    '<div class="doc-head"><h4></h4><button type="button" class="doc-x" aria-label="Zapri">×</button></div>' +
    '<div class="doc-stage"><div class="doc-scaler"><iframe class="doc-frame" title="Predogled"></iframe></div></div>' +
    '<div class="sc-modal-acts doc-acts"><button type="button" class="sc-modal-btn ghost" data-ena>Natisni 1 izvod</button><button type="button" class="sc-modal-btn primary" data-dva>Natisni 2 izvoda</button></div></div>';
  back.querySelector("h4").textContent = "Spremni list " + e.stevilka;
  document.body.appendChild(back);
  var fr = back.querySelector(".doc-frame"), scaler = back.querySelector(".doc-scaler"), stage = back.querySelector(".doc-stage"), A4W = 794;
  function prilagodiA4(){
    try{
      var doc = fr.contentDocument; if(!doc || !doc.body) return;
      var ch = Math.max(doc.body.scrollHeight, 1123);
      fr.style.width = A4W + "px"; fr.style.height = ch + "px"; fr.style.transformOrigin = "top left";
      var cs = getComputedStyle(stage);
      var sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var k = sw / A4W; if(!isFinite(k) || k <= 0) k = 1; if(k > 1.8) k = 1.8;
      fr.style.transform = "scale(" + k + ")";
      scaler.style.width = (A4W * k) + "px"; scaler.style.height = (ch * k) + "px";
    }catch(err){}
  }
  fr.addEventListener("load", function(){ prilagodiA4(); setTimeout(prilagodiA4, 60); try{ fr.contentDocument.fonts.ready.then(prilagodiA4); }catch(_){} });
  window.addEventListener("resize", prilagodiA4);
  fr.srcdoc = dokZaListe([e], 1);
  requestAnimationFrame(function(){ back.classList.add("show"); setTimeout(prilagodiA4, 40); });
  var done = false;
  function zapri(){ if(done) return; done = true; window.removeEventListener("resize", prilagodiA4); back.classList.remove("show"); document.removeEventListener("keydown", onKey, true); setTimeout(function(){ if(back.parentNode) back.parentNode.removeChild(back); }, 180); }
  function onKey(ev){ if(ev.key === "Escape"){ ev.stopPropagation(); zapri(); } }
  back._zapri = zapri;
  back.querySelector(".doc-x").addEventListener("click", zapri);
  back.addEventListener("click", function(ev){ if(ev.target === back) zapri(); });
  document.addEventListener("keydown", onKey, true);
  back.querySelector("[data-ena]").addEventListener("click", function(){ printLists([e], true); zapri(); });
  back.querySelector("[data-dva]").addEventListener("click", function(){ printLists([e], false); zapri(); });
}

/* ══════════ PRIJAVA (oznake in vzorec kot v portalu) ══════════
   Profili: 1× prijava z geslom, nato en dotik (+ PIN, če ga ima račun nastavljenega
   v portalu). Dostop imajo računi, ki jih baza spusti do spremnih listov (sme_app:
   osebje, super admin, lastnik) in naprave. */
var aktivniEmail = "";
function msg(el, besedilo, slabo){ el.textContent = besedilo || ""; el.classList.toggle("show", !!besedilo); el.classList.toggle("bad", !!(besedilo && slabo)); }
function pokaziPrijavo(){
  zapriVse();
  $("app").classList.remove("show"); $("auth").classList.remove("hidden");
  var pin = $("apPin"); if(pin) pin.remove();
  $("auth").classList.remove("ap-pin-on");
}
function zapriVse(){
  if(_okno) oknoZapri(true);
  document.querySelectorAll(".sc-modal-back").forEach(function(b){ if(b._zapri) b._zapri(); else b.remove(); });
}
function showAccountLogin(besedilo, email){
  session = null; clearTimeout(idleTimer); pokaziPrijavo();
  $("profilePicker").classList.add("hidden"); $("authBox").classList.remove("hidden");
  msg($("acctErr"), besedilo, true); $("acctPass").value = "";
  if(email) $("acctEmail").value = email;
  $("acctBack").classList.toggle("hidden", !savedProfs.length);
}
function avatarHtml(p){
  if(p && p.avatar && /^https:\/\//.test(p.avatar)) return '<span class="pp-av" style="background-image:url(\'' + encodeURI(p.avatar).replace(/'/g, "%27") + '\')"></span>';
  return '<span class="pp-av av-sc"><span class="sc-s">S</span><span class="sc-c">C</span></span>';
}
function prikaziProfile(besedilo){
  if(!savedProfs.length){ showAccountLogin(besedilo || ""); return; }
  session = null; clearTimeout(idleTimer); pokaziPrijavo();
  $("authBox").classList.add("hidden"); $("profilePicker").classList.remove("hidden");
  msg($("ppMsg"), besedilo, true);
  var urejeni = savedProfs.slice().sort(function(a, b){ return String(a.name || a.email).localeCompare(String(b.name || b.email), "sl"); });
  $("ppGrid").innerHTML = urejeni.map(function(p){
    return '<div class="pp-tile-wrap"><button type="button" class="pp-tile" data-em="' + esc(p.email) + '">' + avatarHtml(p) + '<span class="pp-nm">' + esc(p.name || p.email) + '</span></button>' +
      '<button type="button" class="pp-tile-x" data-pozabi="' + esc(p.email) + '" aria-label="Odstrani profil" title="Odstrani profil">×</button></div>';
  }).join("") + '<button type="button" class="pp-tile pp-add" id="ppDodaj"><span class="pp-av">+</span><span class="pp-nm">Dodaj</span></button>';
  $("ppGrid").querySelectorAll("[data-em]").forEach(function(b){ b.onclick = function(){ izberiProfil(b.getAttribute("data-em"), b); }; });
  $("ppGrid").querySelectorAll("[data-pozabi]").forEach(function(b){ b.onclick = function(ev){ ev.stopPropagation(); pozabiProfil(b.getAttribute("data-pozabi")); }; });
  $("ppDodaj").onclick = function(){ showAccountLogin(""); setTimeout(function(){ $("acctEmail").focus(); }, 50); };
}
async function pozabiProfil(em){
  var p = savedProfs.find(function(x){ return x.email === em; }); if(!p) return;
  var ok = await potrdiModal({ naslov: "Odstranim profil?", sporocilo: "Profil " + (p.name || p.email) + " bo odstranjen s te naprave. Za ponoven vstop bo potrebna prijava z geslom.", potrdi: "Odstrani", nevarno: true });
  if(!ok) return;
  savedProfs = savedProfs.filter(function(x){ return x.email !== em; }); await saveProfs(); prikaziProfile();
}
/* Po vsaki osvežitvi žetona ga zapiši tudi v profil — sicer bi profil hranil že porabljen
   žeton in bi ga Supabase ob naslednjem vstopu zavrnil (prijava z geslom znova). */
function posodobiProfilZeton(){
  if(!aktivniEmail || !portalAuth || !portalAuth.refresh_token) return;
  var p = savedProfs.find(function(x){ return x.email === aktivniEmail; });
  if(p && p.refresh_token !== portalAuth.refresh_token){ p.refresh_token = portalAuth.refresh_token; saveProfs(); }
}
async function portalProfil(){
  var ur;
  try{ ur = await fetch(settings.portalUrl + "/auth/v1/user", { headers: { apikey: settings.portalKey, Authorization: "Bearer " + portalAuth.access_token } }); }
  catch(e){ throw new Error("ni povezave"); }
  var u = await ur.json().catch(function(){ return {}; });
  if(!ur.ok) throw new Error("seja ni veljavna");
  var out = { id: u.id, email: u.email || "", full_name: "", avatar_url: "", app_pin: "", dostop: false };
  try{
    var rows = await api("profiles?select=full_name,avatar_url,app_pin,is_staff,super_admin,is_device,web_dostop&id=eq." + u.id);
    var r = Array.isArray(rows) ? rows[0] : null;
    if(r){
      out.full_name = r.full_name || ""; out.avatar_url = r.avatar_url || "";
      out.app_pin = (r.app_pin != null && r.app_pin !== "") ? String(r.app_pin) : "";
      out.dostop = r.web_dostop !== false && !!(r.is_staff || r.super_admin || r.is_device);
    }
  }catch(e){ if(/ni povezave/i.test((e && e.message) || "")) throw e; }
  if((out.email || "").trim().toLowerCase() === LASTNIK) out.dostop = true;
  return out;
}
var NI_DOSTOPA = "Ta račun nima dostopa do spremnih listov. Dostop dodeli skrbnik v portalu (Uporabniki → vloga Osebje).";
async function acctSubmit(){
  var em = ($("acctEmail").value || "").trim(), pw = $("acctPass").value || "", btn = $("acctBtn"), er = $("acctErr");
  if(!em || !pw){ msg(er, "Vpiši e-poštni naslov in geslo.", true); return; }
  btn.disabled = true; btn.textContent = "Prijavljam …"; msg(er, "");
  try{
    aktivniEmail = "";
    await portalLogin(em, pw);
    var prof = await portalProfil();
    if(!prof.dostop){ portalAuth = null; await savePortalAuth(); msg(er, NI_DOSTOPA, true); return; }
    var email = prof.email || em;
    savedProfs = savedProfs.filter(function(p){ return p.email !== email; });
    var np = { email: email, name: prof.full_name || email, uid: prof.id || null, refresh_token: portalAuth.refresh_token, avatar: prof.avatar_url || "", pin: prof.app_pin || "", dostop: true };
    savedProfs.push(np); await saveProfs();
    $("acctPass").value = "";
    vstopi(np);   // pravkar se je prijavil z geslom → brez PIN-a
  }catch(e){
    var m = (e && e.message) || "";
    msg(er, /invalid login|invalid_grant|credentials/i.test(m) ? "Napačen e-poštni naslov ali geslo." : (/ni povezave|fetch/i.test(m) ? "Ni povezave z internetom." : (m || "Prijava ni uspela.")), true);
  }finally{ btn.disabled = false; btn.textContent = "Prijavi se"; }
}
$("acctForm").addEventListener("submit", function(e){ e.preventDefault(); acctSubmit(); });
$("acctBack").onclick = function(){ prikaziProfile(); };

async function izberiProfil(em, tile){
  var p = savedProfs.find(function(x){ return x.email === em; }); if(!p) return;
  msg($("ppMsg"), "");
  var nm = tile && tile.querySelector(".pp-nm"); if(nm) nm.textContent = "Prijavljam …";
  $("ppGrid").style.pointerEvents = "none";
  try{
    aktivniEmail = p.email;
    portalAuth = { refresh_token: p.refresh_token, access_token: null, expires_at: 0 };
    await portalRefresh();
    var prof = await portalProfil();
    p.name = prof.full_name || p.name; p.avatar = prof.avatar_url || ""; p.pin = prof.app_pin || ""; p.dostop = prof.dostop; p.uid = prof.id || p.uid;
    await saveProfs();
    if(!prof.dostop){ portalAuth = null; await savePortalAuth(); prikaziProfile(NI_DOSTOPA); return; }
    vstopiSPinom(p);
  }catch(e){
    var m = (e && e.message) || "";
    /* brez omrežja: naprava je že prijavljena → vstop z zadnjimi znanimi podatki, sinhronizacija dohiti */
    if(/ni povezave/i.test(m) && p.refresh_token){
      if(p.dostop === false){ prikaziProfile(NI_DOSTOPA); return; }
      vstopiSPinom(p); return;
    }
    showAccountLogin("Prijava je potekla — vpiši geslo za " + (p.name || p.email) + ".", p.email);
  }finally{ $("ppGrid").style.pointerEvents = ""; if(nm && nm.isConnected) nm.textContent = p.name || p.email; }
}
function vstopiSPinom(p){ if(p.pin) zahtevajPin(p, function(){ vstopi(p); }); else vstopi(p); }
function vstopi(p){
  aktivniEmail = p.email;
  doLogin({ name: p.name || p.email });
  try{ zaziviRealtime(); }catch(e){}
  polnaSinh();
}
/* PIN (nastavi se v portalu, Moj račun) — prikazan v prostoru prijave, kot izbira profila */
function zahtevajPin(p, onOk){
  var star = $("apPin"); if(star) star.remove();
  $("profilePicker").classList.add("hidden"); $("authBox").classList.add("hidden");
  var buf = "";
  var el = document.createElement("div"); el.className = "ap-pin"; el.id = "apPin";
  el.innerHTML = avatarHtml(p) + '<h1>' + esc(p.name || p.email) + '</h1><p class="sub">Vpiši svojo 4-mestno kodo</p>' +
    '<div class="ap-pin-dots">' + [0, 1, 2, 3].map(function(){ return '<span class="ap-pin-dot"></span>'; }).join("") + '</div>' +
    '<div class="ap-keys">' + ["1","2","3","4","5","6","7","8","9"].map(function(n){ return '<button type="button" class="ap-key" data-k="' + n + '">' + n + '</button>'; }).join("") +
    '<button type="button" class="ap-key prazna" tabindex="-1" aria-hidden="true"></button><button type="button" class="ap-key" data-k="0">0</button><button type="button" class="ap-key util" data-k="del" aria-label="Briši">⌫</button></div>' +
    '<div class="msg bad" id="pinErr" role="status" aria-live="polite"></div><p class="under"><button type="button" class="link-btn" id="pinPreklic">‹ Nazaj na profile</button></p>';
  document.querySelector("#auth .auth-slot").appendChild(el);
  $("auth").classList.add("ap-pin-on");
  function upd(){ el.querySelectorAll(".ap-pin-dot").forEach(function(d, i){ d.classList.toggle("on", i < buf.length); }); }
  function tipka(k){
    if(k === "del") buf = buf.slice(0, -1);
    else if(buf.length < 4){ buf += k; msg($("pinErr"), ""); }
    upd();
    if(buf.length === 4) setTimeout(function(){
      if(buf === String(p.pin)){ konec(); onOk(); }
      else{ buf = ""; upd(); msg($("pinErr"), "Napačna koda", true); el.classList.remove("tresi"); void el.offsetWidth; el.classList.add("tresi"); }
    }, 120);
  }
  function tipke(ev){ if(!el.isConnected){ document.removeEventListener("keydown", tipke); return; } if(/^[0-9]$/.test(ev.key)) tipka(ev.key); else if(ev.key === "Backspace") tipka("del"); else if(ev.key === "Escape") preklic(); }
  function konec(){ document.removeEventListener("keydown", tipke); el.remove(); $("auth").classList.remove("ap-pin-on"); }
  function preklic(){ konec(); prikaziProfile(); }
  el._preklic = preklic;
  document.addEventListener("keydown", tipke);
  el.querySelectorAll("[data-k]").forEach(function(b){ b.onclick = function(){ tipka(b.getAttribute("data-k")); }; });
  $("pinPreklic").onclick = preklic;
}
function doLogin(u){
  session = { user: u.name, start: new Date().toISOString() };
  $("auth").classList.add("hidden"); $("app").classList.add("show");
  $("tbIme").textContent = u.name || "";
  iskanje = ""; filterStranka = ""; filterDatum = ""; prikazano = 60; urejanje = null;
  $("isci").value = ""; $("filterDatum").value = ""; $("filterDatumX").classList.add("hidden");
  napolniFilterStrank(); nastaviPogled(pogled()); renderList(); risiSyncGumb();
  resetIdle();
  if(pdfPlugin() && !pdfPermOK && !askedPerm){
    askedPerm = true;
    potrdiModal({ naslov: "Dovoljenje za datoteke", sporocilo: "Za samodejno shranjevanje spremnih listov kot PDF v mapo Dokumenti omogoči »Dostop do vseh datotek«.", potrdi: "Odpri nastavitve", preklici: "Pozneje" })
      .then(function(ok){ if(ok){ try{ pdfPlugin().requestPermission(); }catch(e){} } });
  }
}
function logout(){ session = null; clearTimeout(idleTimer); prikaziProfile(); }
function resetIdle(){ if(!session) return; clearTimeout(idleTimer); idleTimer = setTimeout(logout, (settings.idleMin || 15) * 60000); }
["click", "touchstart", "keydown"].forEach(function(ev){ document.addEventListener(ev, resetIdle, true); });
$("zamenjajBtn").onclick = logout;
$("izklopBtn").onclick = async function(){
  var ok = await potrdiModal({ naslov: "Izklopim aplikacijo?", sporocilo: "Neposlani spremni listi ostanejo shranjeni na napravi in se pošljejo ob naslednjem zagonu.", potrdi: "Izklopi" });
  if(ok){ try{ Capacitor.Plugins.App.exitApp(); }catch(e){} }
};

/* razkrij geslo (očesce, kot v portalu) */
var _OKO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
var _OKO_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.1 6.1A13.3 13.3 0 0 0 2 12s3 8 10 8a9.3 9.3 0 0 0 5.9-2.1"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><path d="m3 3 18 18"/></svg>';
document.querySelectorAll('input[type="password"]').forEach(function(inp){
  var wrap = document.createElement("span"); wrap.className = "pw-wrap";
  inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
  var b = document.createElement("button"); b.type = "button"; b.className = "pw-eye"; b.tabIndex = -1; b.setAttribute("aria-label", "Pokaži geslo"); b.title = "Pokaži geslo"; b.innerHTML = _OKO;
  wrap.appendChild(b);
  b.onclick = function(e){ e.preventDefault(); var pokazi = inp.type === "password"; inp.type = pokazi ? "text" : "password"; b.innerHTML = pokazi ? _OKO_OFF : _OKO; b.setAttribute("aria-label", pokazi ? "Skrij geslo" : "Pokaži geslo"); b.title = pokazi ? "Skrij geslo" : "Pokaži geslo"; };
});

function pdfPlugin(){ try{ if(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PralnicaPrint) return Capacitor.Plugins.PralnicaPrint; }catch(e){} return null; }
function printLists(arr, enIzvod){
  if(!arr || !arr.length){ toast("Ni spremnih listov za tiskanje."); return; }
  var html = dokZaListe(arr, enIzvod ? 1 : 2);
  var P = pdfPlugin();
  if(P){ P.print({ html: html, jobName: "Spremni list " + arr[0].stevilka }).catch(function(){ toast("Tiskanje ni uspelo."); }); return; }
  natisniPrekIframe(html);
}
/* Brskalnik: natisni čist dokument prek skritega iframe-a (na iOS je »visibility« trik tiskal prazno). */
function natisniPrekIframe(doc){
  var old = $("printFrame"); if(old && old.parentNode) old.parentNode.removeChild(old);
  var ifr = document.createElement("iframe");
  ifr.id = "printFrame"; ifr.setAttribute("aria-hidden", "true");
  ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(ifr);
  var klican = false;   // natisni samo enkrat
  function natisni(){
    if(klican) return; klican = true;
    var w = ifr.contentWindow;
    var pisave = Promise.resolve();
    try{ pisave = w.document.fonts.ready; }catch(_){}
    Promise.race([pisave, new Promise(function(r){ setTimeout(r, 1500); })]).then(function(){
      try{ w.focus(); w.print(); }catch(e){ try{ window.print(); }catch(_){} }
      setTimeout(function(){ if(ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 60000);
    });
  }
  ifr.onload = natisni;
  ifr.srcdoc = doc;
  setTimeout(natisni, 2500);
}

/* PDF v Datoteke (samo tablica): Documents/Pralnica/Arhiv (vsaka shranitev) in Sinhro (zadnja različica) */
var ARHIV = "Documents/Pralnica/Arhiv/", SINHRO = "Documents/Pralnica/Sinhro/";
function pdfName(e){ return String(e.stevilka).replace(/[\/\\:]+/g, "-") + ".pdf"; }
async function ensurePdfPerm(){ var P = pdfPlugin(); if(!P) return false;
  try{ var r = await P.checkPermission(); pdfPermOK = !!(r && r.granted); }catch(e){ pdfPermOK = false; } return pdfPermOK; }
async function savePdfs(e){
  var P = pdfPlugin(); if(!P) return;
  if(!pdfPermOK){ await ensurePdfPerm(); if(!pdfPermOK) return; }
  var html = dokZaListe([e], 1), ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  try{ await P.savePdf({ html: html, relPath: ARHIV + pdfName(e).replace(/\.pdf$/, "") + " (" + ts + ").pdf" }); }catch(err){}
  try{ await P.savePdf({ html: html, relPath: SINHRO + pdfName(e) }); e.pdfSaved = true; await saveEntries(); }catch(err){}
}
async function deleteSyncPdf(e){ var P = pdfPlugin(); if(!P || !e.pdfSaved) return; try{ await P.deleteFile({ relPath: SINHRO + pdfName(e) }); }catch(err){} }


/* ══════════ SINHRONIZACIJA S PORTALOM ══════════
   Načelo: shrani najprej lokalno, pošlji, ko je omrežje. Tablica je na WiFi
   tiskalnika pogosto brez interneta, zato pošiljanje nikoli ne zadržuje
   shranjevanja ali tiskanja. Vsak zapis nosi svoj id (legacy_id v bazi):
   ponovno pošiljanje posodobi, ne podvoji. */
var portalAuth = null, syncTecev = false, syncZadnje = "";
function portalNastavljen(){ return !!(settings.portalUrl && settings.portalKey); }
async function loadPortalAuth(){ portalAuth = await dbJson(PORTAL_AUTH_KEY, null); }
async function savePortalAuth(){ try{ await dbWrite(PORTAL_AUTH_KEY, JSON.stringify(portalAuth || null)); }catch(e){} }

async function portalLogin(email, geslo){
  var r;
  try{
    r = await fetch(settings.portalUrl + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: settings.portalKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: geslo }) });
  }catch(e){ throw new Error("ni povezave"); }
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok) throw new Error(j.error_description || j.msg || j.message || ("prijava ni uspela (" + r.status + ")"));
  portalAuth = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + ((j.expires_in || 3600) * 1000) - 60000 };
  await savePortalAuth();
  return true;
}
async function portalRefresh(){
  if(!portalAuth || !portalAuth.refresh_token) throw new Error("naprava ni prijavljena");
  var r;
  try{
    r = await fetch(settings.portalUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: settings.portalKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: portalAuth.refresh_token }) });
  }catch(netErr){ throw new Error("ni povezave"); }   // brez omrežja žetona NE brišemo
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok){
    /* odjava SAMO ob resnično neveljavnem žetonu (400/401), ne ob prehodnih napakah */
    var telo = ((j.error || "") + " " + (j.error_description || "") + " " + (j.msg || "") + " " + (j.message || "") + " " + (j.code || "")).toLowerCase();
    var resnicno = (r.status === 400 || r.status === 401) && /invalid|grant|refresh|expired|revoked|not\s*found|jwt|already used/.test(telo);
    if(resnicno){ portalAuth = null; await savePortalAuth(); try{ risiSyncGumb(); }catch(_){} throw new Error("seja je potekla, prijavi se znova"); }
    throw new Error("ni povezave");
  }
  portalAuth = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + ((j.expires_in || 3600) * 1000) - 60000 };
  await savePortalAuth();
  posodobiProfilZeton();
  try{ realtimeAuth(); }catch(e){}
  return true;
}
/* Klic na bazo. Ob poteku žetona enkrat osveži in poskusi znova. */
async function api(pot, opt, drugic){
  if(!portalAuth) throw new Error("naprava ni prijavljena v portal");
  if((!portalAuth.access_token || (portalAuth.expires_at && Date.now() > portalAuth.expires_at)) && !drugic) await portalRefresh();
  opt = opt || {};
  var h = { apikey: settings.portalKey, Authorization: "Bearer " + portalAuth.access_token, "Content-Type": "application/json" };
  if(opt.prefer) h.Prefer = opt.prefer;
  var r;
  try{ r = await fetch(settings.portalUrl + "/rest/v1/" + pot, { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }); }
  catch(e){ throw new Error("ni povezave"); }
  if(r.status === 401 && !drugic){ await portalRefresh(); return api(pot, opt, true); }
  var t = await r.text(), j = null;
  try{ j = t ? JSON.parse(t) : null; }catch(_){ j = null; }
  if(!r.ok){ var e = new Error((j && (j.message || j.hint)) || ("napaka " + r.status)); e.status = r.status; e.code = j && j.code; throw e; }
  return j;
}
/* vse vrstice po straneh (privzeta meja Supabase je 1000) */
async function apiVse(potBase, korak){
  korak = korak || 1000;
  var vse = [], off = 0;
  while(true){
    var page = await api(potBase + (potBase.indexOf("?") >= 0 ? "&" : "?") + "limit=" + korak + "&offset=" + off);
    if(!Array.isArray(page) || !page.length) break;
    vse = vse.concat(page);
    if(page.length < korak) break;
    off += korak; if(off > 100000) break;
  }
  return vse;
}

/* ── živa sinhronizacija (realtime) ── */
var sbc = null, rtChan = null, _rtTimer = null, rtZivo = false;
function realtimeKlient(){
  if(sbc) return sbc;
  try{ if(window.supabase && window.supabase.createClient) sbc = window.supabase.createClient(settings.portalUrl, settings.portalKey, { auth: { persistSession: false, autoRefreshToken: false } }); }catch(e){ sbc = null; }
  return sbc;
}
function realtimeAuth(){ var c = realtimeKlient(); if(!c || !portalAuth || !portalAuth.access_token) return; try{ c.realtime.setAuth(portalAuth.access_token); }catch(e){} }
function zaziviRealtime(){
  var c = realtimeKlient(); if(!c || !portalAuth) return;
  realtimeAuth();
  if(rtChan){ try{ c.removeChannel(rtChan); }catch(e){} rtChan = null; }
  rtZivo = false;
  var poteg = function(){ clearTimeout(_rtTimer); _rtTimer = setTimeout(function(){ osveziIzPortala(); }, 700); };
  rtChan = c.channel("pralnica-sync");
  ["orgs", "articles", "delivery_notes", "delivery_note_items"].forEach(function(tbl){
    try{ rtChan.on("postgres_changes", { event: "*", schema: "public", table: tbl }, poteg); }catch(e){}
  });
  try{ rtChan.subscribe(function(stanje){ rtZivo = stanje === "SUBSCRIBED"; }); }catch(e){}
}

/* Postavke zamenja v ENI transakciji na strežniku (migracija 59); rezerva: stari način. */
async function zamenjajPostavke(noteId, post){
  try{ await api("rpc/app_zamenjaj_postavke", { method: "POST", body: { p_note: noteId, p_postavke: post } }); return; }
  catch(err){ var ni = err && (err.status === 404 || err.code === "PGRST202" || /app_zamenjaj_postavke/i.test(err.message || "")); if(!ni) throw err; }
  await api("delivery_note_items?note_id=eq." + noteId, { method: "DELETE" });
  if(post.length) await api("delivery_note_items", { method: "POST", body: post });
}

/* ── pošiljanje enega spremnega lista ── */
async function posljiEnega(e){
  /* 1. stranka — naprava je ne ustvarja, mora biti v portalu */
  var org = await api("orgs?legacy_id=eq." + encodeURIComponent(e.strankaId) + "&select=id&limit=1");
  if(!org.length && e.strankaNaziv) org = await api("orgs?name=eq." + encodeURIComponent(e.strankaNaziv) + "&select=id&limit=1");
  if(!org.length){ var err = new Error("stranke »" + (e.strankaNaziv || e.strankaId) + "« ni v portalu"); err.cakaNaStranko = true; throw err; }
  var orgId = org[0].id;
  /* 2. artikli — če katerega ni, gre postavka brez povezave, z imenom */
  var arts = await api("articles?org_id=eq." + orgId + "&select=id,name,legacy_id");
  var poLegacy = {}, poImenu = {};
  arts.forEach(function(a){ if(a.legacy_id) poLegacy[a.legacy_id] = a.id; poImenu[(a.name || "").trim().toLowerCase()] = a.id; });
  /* 3. spremni list */
  var del = String(e.stevilka).split("/"), seq = parseInt(del[0], 10), leto = parseInt(del[1], 10) || new Date(e.datum).getFullYear();
  if(!seq) throw new Error("številke »" + e.stevilka + "« ni mogoče razbrati");
  var vrstica = { org_id: orgId, doc_year: leto, doc_seq: seq, doc_date: e.datum, issued_name: e.izdal || null,
    weight_kg: (e.kg === "" || e.kg == null) ? null : Number(e.kg), transport: (e.prevoz === "izredni" ? "izredni" : "redni"),
    source: "tablet", legacy_id: e.id, popravil: e.popravil || null, popravljeno_at: e.popravljeno_at || null };
  var obst = await api("delivery_notes?legacy_id=eq." + encodeURIComponent(e.id) + "&select=id,potrjeno,popravljeno_at&limit=1");
  if(!obst.length){
    /* po številki: ista številka je lahko DRUG list (portal ali druga naprava) — takega nikoli ne prepiši */
    obst = await api("delivery_notes?doc_year=eq." + leto + "&doc_seq=eq." + seq + "&select=id,potrjeno,popravljeno_at,legacy_id,org_id,doc_date&limit=1");
    if(obst.length){
      var _o = obst[0];
      var _isti = (_o.legacy_id && _o.legacy_id === e.id) || (!_o.legacy_id && _o.org_id === orgId && String(_o.doc_date) === String(e.datum));
      if(!_isti){ var _ez = new Error("številka " + e.stevilka + " je v portalu že zasedena"); _ez.stevilkaZasedena = true; throw _ez; }
    }
  }
  var noteId;
  if(obst.length){
    noteId = obst[0].id; e.portalId = noteId;
    /* potrjenega lista aplikacija NIKOLI ne spreminja — velja različica iz portala */
    if(obst[0].potrjeno === true){
      e.potrjeno = true; e.zaklenjen = true; e.syncedAt = e.syncedAt || new Date().toISOString();
      e.osveziIzPortala = true;   // naslednji prenos povrne portalno vsebino
      e.syncNapaka = null; _zavrnjenoPotrjeno.push(e.stevilka);
      return true;
    }
    /* prekrivanje: portalna različica se je spremenila od znane osnove → ne povozi, zapiši spor */
    var portalP = obst[0].popravljeno_at || null, baza = e.portalPopravljenoAt || null;
    if(e.popravil && baza && portalP && portalP !== baza){
      await api("delivery_note_conflicts", { method: "POST", body: {
        note_id: noteId, legacy_id: e.id, org_id: orgId, org_name: e.strankaNaziv || null,
        doc_year: leto, doc_seq: seq, doc_date: e.datum, number: e.stevilka,
        weight_kg: (e.kg === "" || e.kg == null) ? null : Number(e.kg), transport: (e.prevoz === "izredni" ? "izredni" : "redni"),
        issued_name: e.izdal || null, popravil: e.popravil || null, popravki: e.popravki || null,
        postavke: (e.postavke || []).filter(function(p){ return p && p.naziv; }).map(function(p){ return { naziv: String(p.naziv), kosov: Number(p.kosov) || 0 }; }),
        base_popravljeno_at: baza, portal_popravljeno_at: portalP } });
      e.vSporu = true; e.syncedAt = new Date().toISOString(); e.syncNapaka = "prekrivanje — reši v portalu";
      return true;
    }
    var popravek = Object.assign({}, vrstica); delete popravek.source;   // izvor lista (portal/tablica) ostane, kot je
    await api("delivery_notes?id=eq." + noteId, { method: "PATCH", body: popravek });
    e.portalPopravljenoAt = vrstica.popravljeno_at || portalP || e.portalPopravljenoAt || null;
  }else{
    var nova = await api("delivery_notes", { method: "POST", body: vrstica, prefer: "return=representation" });
    noteId = nova[0].id; e.portalId = noteId;
    e.portalPopravljenoAt = vrstica.popravljeno_at || e.portalPopravljenoAt || null;
  }
  /* dnevnik urejanj in opombe — best-effort (starejša baza stolpcev morda nima) */
  if(e.popravki){ try{ await api("delivery_notes?id=eq." + noteId, { method: "PATCH", body: { popravki: e.popravki } }); }catch(_e){} }
  try{ await api("delivery_notes?id=eq." + noteId, { method: "PATCH", body: { opomba_stranka: (e.opombaStranka || "") || null, opomba_evidenca: (e.opombaEvidenca || "") || null } }); }catch(_e){}
  /* 4. postavke (enaki artikli združeni) */
  var post = (e.postavke || []).filter(function(p){ return p && p.naziv; }).map(function(p, i){
    var ime = String(p.naziv).trim();
    return { note_id: noteId, article_id: (p.id && poLegacy[p.id]) || poImenu[ime.toLowerCase()] || null, article_name: ime, pieces: Number(p.kosov) || 0, sort_order: i };
  });
  var videni = {}, zdruzene = [];
  post.forEach(function(r){ var k = r.article_id ? ("a" + r.article_id) : ("n" + String(r.article_name || "").toLowerCase());
    if(videni[k]) videni[k].pieces += (r.pieces || 0); else { videni[k] = r; zdruzene.push(r); } });
  zdruzene.forEach(function(r, ix){ r.sort_order = ix; });
  await zamenjajPostavke(noteId, zdruzene);
  return true;
}

/* ── prenos čakalne vrste ── */
var _zavrnjenoPotrjeno = [], _zadnjiNeuspeh = 0;
async function syncPush(tiho){
  if(syncTecev) return;
  if(!portalNastavljen() || !portalAuth){ risiSyncGumb(); return; }
  if(navigator.onLine === false){ syncZadnje = "ni omrežja"; risiSyncGumb(); return; }
  var cakajo = entries.filter(function(e){ return !e.syncedAt; });
  if(!cakajo.length){ syncZadnje = ""; risiSyncGumb(); return; }
  syncTecev = true; risiSyncGumb();
  var poslano = 0, spodletelo = 0, zadnjaNapaka = "";
  for(var i = 0; i < cakajo.length; i++){
    var e = cakajo[i];
    try{
      await posljiEnega(e);
      if(!e.syncedAt) e.syncedAt = new Date().toISOString();
      e.syncNapaka = null; e.stevilkaZasedena = false; poslano++;
    }catch(err){
      var sporocilo = err.message || String(err);
      /* številka zasedena z DRUGIM listom → ostane v vrsti z opozorilom »Nova št.« */
      if(err.stevilkaZasedena || /duplicate key|already exists|doc_year_doc_seq|23505/i.test(sporocilo)){
        e.stevilkaZasedena = true; e.syncNapaka = "številka " + e.stevilka + " je v portalu že zasedena";
        spodletelo++; zadnjaNapaka = e.syncNapaka; continue;
      }
      spodletelo++;
      var breznet = err.name === "TypeError" || /Failed to fetch|NetworkError|ni povezave/i.test(sporocilo);
      zadnjaNapaka = breznet ? "ni povezave" : sporocilo;
      e.syncNapaka = zadnjaNapaka;
      if(breznet || /seja je potekla|ni prijavljena/i.test(zadnjaNapaka)) break;
    }
  }
  await saveEntries();
  syncTecev = false;
  syncZadnje = spodletelo ? zadnjaNapaka : "";
  _zadnjiNeuspeh = spodletelo ? Date.now() : 0;
  risiSyncGumb(); renderList();
  if(_okno && !urejanje){ var oe = entryById(_okno.id); if(oe) osveziDetajl(oe); }
  if(_zavrnjenoPotrjeno.length){
    toast("List " + _zavrnjenoPotrjeno.join(", ") + " je v portalu že potrjen — sprememba ni bila prenesena.");
    _zavrnjenoPotrjeno = [];
    osveziIzPortala();
  }else if(!tiho){
    if(spodletelo) toast("Poslano " + poslano + ", ostalo " + spodletelo + " — " + zadnjaNapaka);
    else if(poslano) toast("Poslano v portal: " + poslano);
  }
}

/* ── stanje sinhronizacije: ikona v orodni vrstici (pika kot pri obvestilih v portalu) ── */
var rocnoTece = false;
function risiSyncGumb(){
  var b = $("syncBtn"), dot = $("syncDot"); if(!b) return;
  if(!portalNastavljen() || (!portalAuth && !session)){ b.hidden = true; return; }
  b.hidden = false;
  var caka = entries.filter(function(e){ return !e.syncedAt; }).length;
  var brez = navigator.onLine === false || syncZadnje === "ni povezave" || syncZadnje === "ni omrežja";
  b.classList.toggle("vrti", !!(syncTecev || rocnoTece));
  var st, t;
  if(!portalAuth){ st = "bad"; t = "Seja v portalu je potekla — tapni za ponovno prijavo."; }
  else if(syncTecev || rocnoTece){ st = "warn"; t = "Prenos v teku …"; }
  else if(caka){ st = brez ? "bad" : "warn"; t = "Na prenos " + sklon(caka, "čaka", "čakata", "čakajo", "čaka") + " " + sklonListov(caka) + (brez ? " — ni povezave" : (syncZadnje ? " — " + syncZadnje : "")) + ". Tapni za prenos zdaj."; }
  else { st = "ok"; t = "Vse je v portalu. Tapni za osvežitev."; }
  dot.className = "notif-dot " + st; b.title = t; b.setAttribute("aria-label", t);
  risiStanje();
}
$("syncBtn").onclick = async function(){
  if(rocnoTece) return;
  if(!portalAuth){ var p = savedProfs.find(function(x){ return x.email === aktivniEmail; }); showAccountLogin("Seja je potekla — vpiši geslo.", p ? p.email : ""); return; }
  rocnoTece = true; risiSyncGumb();
  try{
    await syncPush(false);
    await osveziKatalog(false);
    await potegniIzPortala(true);
    if(!entries.some(function(e){ return !e.syncedAt; })) toast("Vse je v portalu in osveženo.");
  }catch(e){ toast("Osvežitev ni uspela: " + ((e && e.message) || e)); }
  finally{ rocnoTece = false; risiSyncGumb(); }
};

/* ── katalog iz portala (portal je edini vir resnice za stranke in artikle) ── */
var katalogTecev = false;
function vArtikel(a){ return { id: a.legacy_id || ("s" + a.id.slice(0, 8)), naziv: a.name, sy: true, teza: (a.teza == null || a.teza === "") ? null : parseFloat(a.teza), vid: (a.viden_app !== false) }; }
async function osveziKatalog(tiho){
  if(!portalNastavljen() || !portalAuth){ if(!tiho) toast("Ni prijave v portal."); return; }
  if(katalogTecev) return;
  katalogTecev = true;
  try{
    var orgs = await apiVse("orgs?select=id,name,legal_name,address,vat_id,legacy_id&order=name");
    var arts;
    try{ arts = await apiVse("articles?select=id,org_id,name,legacy_id,sort_order,teza,viden_app&order=sort_order,id"); }
    catch(_e){ arts = await apiVse("articles?select=id,org_id,name,legacy_id,sort_order,teza&order=sort_order,id"); }
    var artPoOrg = {};
    (arts || []).forEach(function(a){ (artPoOrg[a.org_id] = artPoOrg[a.org_id] || []).push(a); });
    (orgs || []).forEach(function(o){
      var lok = CLIENTS.find(function(c){ return (o.legacy_id && c.id === o.legacy_id) || (c.orgUuid && c.orgUuid === o.id) || (c.naziv || "").toLowerCase() === (o.name || "").toLowerCase(); });
      var portalArts = (artPoOrg[o.id] || []).map(vArtikel);
      if(lok){
        lok.naziv = o.name; lok.podjetje = o.legal_name || ""; lok.naslov = o.address || ""; lok.davcna = o.vat_id || ""; lok.sy = true; lok.orgUuid = o.id;
        if(portalArts.length) lok.artikli = portalArts;   // portal nima artiklov → obdrži lokalne (varnost pred delnim prenosom)
      }else{
        CLIENTS.push({ id: o.legacy_id || ("s" + o.id.slice(0, 8)), orgUuid: o.id, naziv: o.name, podjetje: o.legal_name || "", naslov: o.address || "", davcna: o.vat_id || "", artikli: portalArts, sy: true });
      }
    });
    /* samo če je portal vrnil seznam (prazen odgovor ne izprazni naprave) */
    if(orgs && orgs.length){
      var pk = {};
      orgs.forEach(function(o){ if(o.legacy_id) pk["l:" + o.legacy_id] = true; pk["u:" + o.id] = true; pk["n:" + (o.name || "").toLowerCase()] = true; });
      /* portal je edini vir strank: odpadejo izbrisane in stari vgrajeni seznam (stranke, ki jih v
         portalu ni); ostane le stranka, na katero še čaka neposlan list (da ga lahko urediš) */
      var cakajo = {}; entries.forEach(function(e){ if(!e.syncedAt) cakajo[e.strankaId] = true; });
      CLIENTS = CLIENTS.filter(function(c){ return !!(pk["l:" + c.id] || (c.orgUuid && pk["u:" + c.orgUuid]) || pk["n:" + (c.naziv || "").toLowerCase()]) || cakajo[c.id]; });
    }
    await saveClients();
    if(session) poKatalogu();
    if(!tiho) toast("Stranke in artikli osveženi.");
  }catch(err){ if(!tiho) toast("Katalog ni šel: " + (err.message || err)); }
  finally{ katalogTecev = false; }
}
/* ob izbiri stranke: artikli TE stranke naravnost iz portala */
async function osveziStrankinArtikle(cid){
  var c = clientById(cid); if(!c || !portalAuth) return false;
  try{
    var orgId = c.orgUuid;
    if(!orgId){
      var orgs = await apiVse("orgs?select=id,name,legacy_id&order=name");
      var org = orgs.find(function(o){ return (o.legacy_id && o.legacy_id === c.id) || (o.name || "").trim().toLowerCase() === (c.naziv || "").trim().toLowerCase(); });
      if(!org) return false;
      orgId = c.orgUuid = org.id;
    }
    var arts;
    try{ arts = await apiVse("articles?select=id,name,legacy_id,sort_order,teza,viden_app&org_id=eq." + orgId + "&order=sort_order,id"); }
    catch(_e){ arts = await apiVse("articles?select=id,name,legacy_id,sort_order,teza&org_id=eq." + orgId + "&order=sort_order,id"); }
    c.artikli = (arts || []).map(vArtikel);
    await saveClients();
    poArtiklih(cid);
    return true;
  }catch(e){ return false; }
}

/* ── povratna sinhronizacija: arhiv iz portala (novi, popravljeni, izbrisani, potrjeni) ──
   Dotika se samo listov, ki so že v portalu — nikoli tistih, ki še čakajo na pošiljanje. */
var pullTecev = false, zadnjiPoteg = 0;
async function potegniIzPortala(){
  if(pullTecev) return;
  if(!portalNastavljen() || !portalAuth || navigator.onLine === false) return;
  pullTecev = true;
  try{
    var pl = [], off = 0;
    var selPoln = "id,legacy_id,doc_year,doc_seq,doc_date,weight_kg,transport,issued_name,opomba_stranka,opomba_evidenca,popravil,popravljeno_at,potrjeno,orgs(id,name,legal_name,address,vat_id,legacy_id)";
    var selOsn = "id,legacy_id,doc_year,doc_seq,doc_date,weight_kg,transport,issued_name,popravil,popravljeno_at,potrjeno,orgs(id,name,legal_name,address,vat_id,legacy_id)";
    var delFrag = "&deleted_at=is.null";   // koš (migracija 50) se ne prenese
    while(true){
      var page;
      try{ page = await api("delivery_notes?select=" + selPoln + delFrag + "&order=doc_date.desc,id&limit=1000&offset=" + off); }
      catch(_e){
        if(/ni povezave|seja je potekla|ni prijavljena/i.test((_e && _e.message) || "")) throw _e;
        try{ page = await api("delivery_notes?select=" + selOsn + delFrag + "&order=doc_date.desc,id&limit=1000&offset=" + off); }
        catch(_e2){ delFrag = ""; page = await api("delivery_notes?select=" + selOsn + "&order=doc_date.desc,id&limit=1000&offset=" + off); }
      }
      if(!Array.isArray(page) || !page.length) break;
      pl = pl.concat(page);
      if(page.length < 1000) break;
      off += 1000; if(off > 30000) break;
    }
    function kljuc(r){ return r.legacy_id || ("p" + r.id); }
    function apliciraj(e, r){
      if(r.doc_seq) e.stevilka = r.doc_seq + "/" + (r.doc_year || new Date(r.doc_date).getFullYear());
      if(r.doc_date) e.datum = r.doc_date;
      e.kg = (r.weight_kg == null ? "" : r.weight_kg);
      e.prevoz = (r.transport === "izredni" ? "izredni" : "redni");
      if(r.issued_name) e.izdal = r.issued_name;
      if(r.orgs){
        if(r.orgs.name) e.strankaNaziv = r.orgs.name;
        if(r.orgs.legal_name) e.strankaPodjetje = r.orgs.legal_name;
        if(r.orgs.address) e.strankaNaslov = r.orgs.address;
        if(r.orgs.vat_id) e.strankaDavcna = r.orgs.vat_id;
      }
      /* opombe: prazna baza ne zbriše lokalne — ta se znova pošlje (razširi povsod) */
      var imaStolpce = ("opomba_stranka" in r) || ("opomba_evidenca" in r);
      var dbStr = r.opomba_stranka || "", dbEv = r.opomba_evidenca || "";
      if(dbStr) e.opombaStranka = dbStr; else if(e.opombaStranka){ if(imaStolpce && !e.potrjeno) e.syncedAt = null; } else e.opombaStranka = "";
      if(dbEv) e.opombaEvidenca = dbEv; else if(e.opombaEvidenca){ if(imaStolpce && !e.potrjeno) e.syncedAt = null; } else e.opombaEvidenca = "";
      e.popravil = r.popravil || null;
    }
    var portalPoKljucu = {};
    pl.forEach(function(r){ portalPoKljucu[kljuc(r)] = r; });
    var spremenjeno = false, potrebnePostavke = {};
    /* 1. že poslani listi: izbrisani odpadejo, popravljeni se posodobijo, potrditev vedno */
    var obdrzi = [];
    entries.forEach(function(e){
      if(!(e.syncedAt && e.id)){ obdrzi.push(e); return; }
      var pr = portalPoKljucu[e.id];
      if(!pr){ spremenjeno = true; return; }   // izbrisan v portalu
      obdrzi.push(e);
      if(e.portalId !== pr.id){ e.portalId = pr.id; spremenjeno = true; }
      var potrjen = pr.potrjeno === true;
      if(!!e.potrjeno !== potrjen || !!e.zaklenjen !== potrjen){ e.potrjeno = potrjen; e.zaklenjen = potrjen; spremenjeno = true; }
      var prPop = pr.popravljeno_at || null;
      if(e.osveziIzPortala || (prPop && prPop !== e.portalPopravljenoAt)){
        apliciraj(e, pr); e.portalPopravljenoAt = prPop; delete e.osveziIzPortala;
        potrebnePostavke[pr.id] = e; spremenjeno = true;
      }
    });
    entries = obdrzi;
    var lokalno = {};
    entries.forEach(function(e){ lokalno[e.id] = e; });
    /* 2. listi, ki jih naprava še nima */
    pl.forEach(function(r){
      var k = kljuc(r); if(lokalno[k]) return;
      var e = { id: k, portalId: r.id, stevilka: (r.doc_seq || "") + "/" + (r.doc_year || new Date(r.doc_date).getFullYear()), datum: r.doc_date,
        ustvarjeno: new Date().toISOString(),
        strankaId: (r.orgs && r.orgs.legacy_id) || (r.orgs && r.orgs.id ? "s" + String(r.orgs.id).slice(0, 8) : ""),
        strankaNaziv: (r.orgs && r.orgs.name) || "", strankaPodjetje: (r.orgs && r.orgs.legal_name) || "",
        strankaNaslov: (r.orgs && r.orgs.address) || "", strankaDavcna: (r.orgs && r.orgs.vat_id) || "",
        izdal: r.issued_name || "", postavke: [], skupajKosov: 0, prevoz: (r.transport === "izredni" ? "izredni" : "redni"),
        kg: (r.weight_kg == null ? "" : r.weight_kg), opombaStranka: r.opomba_stranka || "", opombaEvidenca: r.opomba_evidenca || "",
        saved: true, syncedAt: new Date().toISOString(), syncNapaka: null,
        popravil: r.popravil || null, portalPopravljenoAt: r.popravljeno_at || null, prenesenIzPortala: true,
        potrjeno: (r.potrjeno === true), zaklenjen: (r.potrjeno === true) };
      entries.push(e); lokalno[k] = e; potrebnePostavke[r.id] = e; spremenjeno = true;
    });
    /* 3. postavke za nove in popravljene (paketno) */
    var idi = Object.keys(potrebnePostavke);
    for(var i = 0; i < idi.length; i += 50){
      var chunk = idi.slice(i, i + 50);
      try{
        var its = await apiVse("delivery_note_items?note_id=in.(" + encodeURIComponent(chunk.map(function(x){ return '"' + x + '"'; }).join(",")) + ")&select=note_id,article_name,pieces,sort_order&order=sort_order");
        var poNote = {};
        (its || []).forEach(function(p){ (poNote[p.note_id] = poNote[p.note_id] || []).push(p); });
        chunk.forEach(function(nid){
          var ee = potrebnePostavke[nid];
          ee.postavke = (poNote[nid] || []).map(function(p){ return { id: null, naziv: p.article_name, kosov: p.pieces }; });
          ee.skupajKosov = ee.postavke.reduce(function(a, p){ return a + (Number(p.kosov) || 0); }, 0);
        });
      }catch(x){}
    }
    zadnjiPoteg = Date.now();
    if(spremenjeno){
      await saveEntries();
      if(urejanje && !entryById(urejanje.id)){ urejanje = null; toast("List, ki si ga urejal, je bil v portalu izbrisan."); }
      if(session){ renderList(); if(_okno && !urejanje){ var oe = entryById(_okno.id); if(oe) osveziDetajl(oe); } }
    }
    risiSyncGumb();
  }catch(err){ /* omrežje/napaka: pusti pri miru, poskusi ob naslednjem ciklu */ }
  finally{ pullTecev = false; }
}
function osveziIzPortala(){ return osveziKatalog(true).then(function(){ return potegniIzPortala(); }).catch(function(){}); }
function polnaSinh(){
  return osveziKatalog(true)
    .then(function(){ return syncPush(true); })
    .then(function(){ return potegniIzPortala(); })
    .catch(function(){});
}

/* ── urnik ──
   Živa povezava (realtime) prinese spremembe takoj. Poteg celotnega arhiva je
   zavarovanje: vsakih 5 min, ko živa povezava deluje, sicer vsako minuto (prej
   vsakih 20 s ne glede na stanje — na telefonu veliko prenesenih podatkov). */
setInterval(function(){
  if(!portalAuth || !session) return;
  /* čakajoče pošlji takoj; po neuspehu (npr. stranke še ni v portalu) šele čez 2 min */
  if(entries.some(function(e){ return !e.syncedAt && !e.stevilkaZasedena; }) && Date.now() - _zadnjiNeuspeh > 120000) syncPush(true);
  if(document.visibilityState !== "visible") return;
  if(Date.now() - zadnjiPoteg > (rtZivo ? 300000 : 60000)) osveziIzPortala();
}, 30000);
window.addEventListener("online", function(){ risiSyncGumb(); if(!portalAuth) return; try{ zaziviRealtime(); }catch(e){} polnaSinh(); });
window.addEventListener("offline", risiSyncGumb);
document.addEventListener("visibilitychange", function(){
  if(document.visibilityState !== "visible" || !portalAuth || !session) return;
  if(!rtZivo){ try{ zaziviRealtime(); }catch(e){} }
  if(Date.now() - zadnjiPoteg > 15000) osveziIzPortala();
});

/* ══════════ TABLICA (Capacitor) ══════════ */
function nativnaPriprava(){
  if(!jeNativno()) return;
  $("izklopBtn").classList.remove("hidden");
  try{
    var App = Capacitor.Plugins.App;
    /* sistemski gumb »nazaj«: zapre, kar je odprto na vrhu, namesto izhoda iz aplikacije */
    App.addListener("backButton", function(){
      var m = vrhnjiModal(); if(m){ if(m._zapri) m._zapri(); return; }
      if(_okno){ if(urejanje){ var e = entryById(urejanje.id); urejanje = null; if(e){ oknoZamenjajVsebino(detajl(e)); return; } } oknoZapri(); return; }
      var pin = $("apPin"); if(pin && pin._preklic){ pin._preklic(); return; }
      if(!$("authBox").classList.contains("hidden") && savedProfs.length){ prikaziProfile(); }
    });
    App.addListener("resume", function(){ if(shrambaZaklenjena) location.reload(); });
  }catch(e){}
}

/* Tablica brez dovoljenja za datoteke (npr. po ponovni namestitvi): stari podatki so
   v mapi Dokumenti, a jih aplikacija ne vidi. Ne nadaljuj (ne prepiši jih s praznimi). */
function pokaziZaklepShrambe(){
  $("app").classList.remove("show"); $("auth").classList.remove("hidden");
  $("profilePicker").classList.add("hidden"); $("authBox").classList.add("hidden");
  var el = document.createElement("div"); el.className = "auth-box";
  el.innerHTML = '<h1>Dovoli dostop do datotek</h1><p class="sub">Spremni listi so shranjeni v mapi Dokumenti na tej tablici. Za SmartClean omogoči »Dostop do vseh datotek«, nato se vrni v aplikacijo.</p>' +
    '<button type="button" class="btn" id="zsOdpri">Odpri nastavitve</button>';
  document.querySelector("#auth .auth-slot").appendChild(el);
  $("zsOdpri").onclick = function(){ try{ pdfPlugin().requestPermission(); }catch(e){} };
}

/* ══════════ ZAGON ══════════ */
(async function init(){
  try{
    nativnaPriprava();
    await loadSettings(); applyTheme(); nastaviPogled(pogled());
    await loadProfs(); await loadClients(); await loadEntries(); await loadPortalAuth();
    await ensurePdfPerm();
    if(shrambaZaklenjena){ pokaziZaklepShrambe(); return; }
    try{ realtimeKlient(); }catch(e){}
    prikaziProfile();
  }finally{
    requestAnimationFrame(function(){ try{ window.scBootDone(); }catch(e){} });
  }
})();

/* za preizkuse (samo branje stanja) */
window.__pralnica = { verzija: APP_VERZIJA, varianta: VARIANTA, stanje: function(){
  return { entries: entries, CLIENTS: CLIENTS, profili: savedProfs.map(function(p){ return p.name; }), session: session, portal: !!portalAuth, rtZivo: rtZivo, okno: !!_okno }; } };
})();

(function(){
"use strict";
/* ══════════════════════════════════════════════════════════════════════
   SmartClean — spremni listi (tablica + splet), ena koda za obe različici.
   Različico vstavi zgradi.py; kar je odvisno od naprave (tiskanje, PDF v
   Datoteke, izklop), se ugotovi med tekom (Capacitor na tablici).

   Podatki ostanejo v istih ključih kot v prejšnjih različicah (pralnica:*),
   zato posodobitev ne izgubi ničesar.
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
var selectedId = null, draftQty = {}, draftPrevoz = "redni", editingId = null, showHidden = false;
var draftOpombaStranka = "", draftOpombaEvidenca = "";
var searchMode = "", searchQuery = "", searchDate = "", searchClientId = "", clientPickerMode = "entry";
var previewId = null, reviewEntryId = null, kpArt = null, kpBuf = "", kpMode = "entry";
var pdfPermOK = false, askedPerm = false;

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
function normaliziraj(s){ return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function clientById(id){ return CLIENTS.find(function(c){ return c.id === id; }); }
function artById(id){ var c = clientById(selectedId); return c ? c.artikli.find(function(a){ return a.id === id; }) : null; }
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

/* ══════════ OBVESTILO + OKNA ══════════ */
function toast(msg){ var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function(){ t.classList.remove("show"); }, 2600); }

var odprtaOkna = [], obZaprtju = {}, _okna = {};
/* ── OKNO: ista animacija kot v portalu (oknoOdpri v portal.js) ──
   Raste OKNO SAMO (z vsebino in senco), a le s transform: okno se razteguje, vsebina pa z
   nasprotnim raztegom ostane v pravi velikosti (24 izračunanih ključev z isto krivuljo).
   Kopija elementa, ki je okno odprl (»duh«), je prvi okvir odpiranja in zadnji zapiranja —
   element se poveča v okno in skrči nazaj. Samo transform + opacity. */
function oknoMirno(){ try{ return matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){ return false; } }
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
    var f = zapri ? e : 1 - e;   // delež »kartice«: 1 = element, 0 = okno
    var sx = 1 + (sx0 - 1) * f, sy = 1 + (sy0 - 1) * f;
    okno.push({ offset: t, transform: "translate(" + (dx * f) + "px," + (dy * f) + "px) scale(" + sx + "," + sy + ")" });
    /* nasprotni razteg omejen na 2× (kot v portalu): takrat je vsebina še prosojna */
    notr.push({ offset: t, transform: "scale(" + (1 / Math.max(sx, 0.5)) + "," + (1 / Math.max(sy, 0.5)) + ")" });
  }
  return { okno: okno, notr: notr };
}
function oknoDuh(o){
  var k = o.kartica, r = k.getBoundingClientRect(), star = k.parentElement;
  var ovoj = document.createElement("div");
  ovoj.className = (star ? [].filter.call(star.classList, function(c){ return c !== "open" && c !== "hidden"; }).join(" ") + " " : "") + "okno-duh";
  ovoj.style.left = r.left + "px"; ovoj.style.top = r.top + "px"; ovoj.style.width = r.width + "px"; ovoj.style.height = r.height + "px";
  ovoj.setAttribute("aria-hidden", "true");
  var cs = getComputedStyle(k), kop = k.cloneNode(true);
  kop.classList.remove("okno-vir");
  ["id", "style", "tabindex"].forEach(function(a){ kop.removeAttribute(a); });
  kop.querySelectorAll("[id],[style]").forEach(function(el){ el.removeAttribute("id"); el.removeAttribute("style"); });
  kop.style.backgroundColor = cs.backgroundColor; kop.style.backgroundImage = cs.backgroundImage;
  kop.style.borderColor = cs.borderTopColor + " " + cs.borderRightColor + " " + cs.borderBottomColor + " " + cs.borderLeftColor;
  kop.style.boxShadow = cs.boxShadow; kop.style.color = cs.color; kop.style.transition = "none";
  ovoj.appendChild(kop);
  o.back.appendChild(ovoj);
  return ovoj;
}
/* izvor po ponovnem izrisu (npr. vrstica artikla ali gumb »Zaključi«) je lahko nov element */
function najdiIzvor(el){
  if(!el) return function(){ return null; };
  if(el.id){ var id = el.id; return function(){ return $(id); }; }
  var atr = ["data-art", "data-view", "data-edit", "data-del", "data-renum", "data-c", "data-em", "data-pozabi"].find(function(a){ return el.hasAttribute(a); });
  if(atr){ var v = el.getAttribute(atr); return function(){ try{ return document.querySelector("[" + atr + '="' + CSS.escape(v) + '"]'); }catch(e){ return null; } }; }
  return function(){ return el.isConnected ? el : null; };
}
function jeViden(k){
  if(!k || !k.isConnected) return false;
  var r = k.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}
function oknoZaklep(){
  if(document.documentElement.classList.contains("okno-zaklep")) return;
  var drsnik = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.classList.add("okno-zaklep");
  if(drsnik > 0) document.documentElement.style.paddingRight = drsnik + "px";
}
function oknoOdklep(){
  if(Object.keys(_okna).length) return;
  document.documentElement.classList.remove("okno-zaklep"); document.documentElement.style.paddingRight = "";
}
function oknoPospravi(o){
  o.panel.getAnimations().forEach(function(a){ a.cancel(); });
  o.notr.getAnimations().forEach(function(a){ a.cancel(); });
  o.back.querySelectorAll(".okno-duh").forEach(function(d){ d.remove(); });
  o.back.classList.remove("odprto", "show");
  [o.kartica, o.cilj].forEach(function(k){ if(k) k.classList.remove("okno-vir"); });
  if(_okna[o.id] === o) delete _okna[o.id];
  oknoOdklep();
}
function odpriOkno(id, izvor){
  var back = $(id); if(!back) return;
  var star = _okna[id];
  if(star && !star.zapiram) return;
  if(star) oknoPospravi(star);
  var panel = back.querySelector(".okno"), notr = panel.querySelector(".okno-notr");
  var o = _okna[id] = { id: id, back: back, panel: panel, notr: notr, najdi: najdiIzvor(izvor), kartica: jeViden(izvor) ? izvor : null };
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== id; }); odprtaOkna.push(id);
  oknoZaklep();
  back.classList.add("odprto");
  void back.offsetWidth; back.classList.add("show");   // zatemnitev začne takoj
  if(oknoMirno() || !panel.animate) return;
  if(!o.kartica){   // brez izvora: pojavi se kot potrditveno okno portala
    panel.animate([{ opacity: 0, transform: "translateY(10px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: "ease" });
    return;
  }
  o.morf = true;
  var kl = oknoKljuci(o, OKNO_ODPRI, false);
  var duh = oknoDuh(o);
  o.kartica.classList.add("okno-vir");   // element se spremeni v okno: njegovo mesto se izprazni takoj
  panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: "linear" });
  duh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, delay: 60, easing: "ease", fill: "forwards" });
  notr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 190, delay: 110, easing: "ease", fill: "backwards" });
  notr.animate(kl.notr, { duration: 380, easing: "linear" });
  var konecRasti = function(){ if(!o.morf) return; o.morf = false; duh.remove(); };
  panel.animate(kl.okno, { duration: 380, easing: "linear" }).finished.then(konecRasti, konecRasti);
  setTimeout(konecRasti, 800);   // varovalo, če se animacija ne konča (zaslon v ozadju)
}
function zapriOkno(id){
  var o = _okna[id]; if(!o || o.zapiram) return;
  o.zapiram = true;
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== id; });
  var f = obZaprtju[id]; if(f){ try{ f(); }catch(e){} }
  var koncano = false;
  var konec = function(){ if(koncano) return; koncano = true; oknoPospravi(o); };
  o.back.classList.remove("show");
  if(oknoMirno() || !o.panel.animate){ konec(); return; }
  setTimeout(konec, 800);
  var k = o.najdi && o.najdi();
  if(k && k.isConnected && !jeViden(k)){ try{ k.scrollIntoView({ block: "center" }); }catch(e){} }
  o.panel.getAnimations().forEach(function(a){ a.cancel(); });
  o.notr.getAnimations().forEach(function(a){ a.cancel(); });
  if(!jeViden(k)){   // izvora ni več → okno samo izgine
    o.panel.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px) scale(.98)" }], { duration: 200, easing: "ease", fill: "forwards" }).finished.then(konec, konec);
    return;
  }
  if(o.kartica && o.kartica !== k) o.kartica.classList.remove("okno-vir");
  o.kartica = k; o.cilj = k;
  k.classList.add("okno-vir");   // med krčenjem je mesto še prazno; element se vrne, ko je okno spet on
  var kl = oknoKljuci(o, OKNO_ZAPRI, true);
  var duh = oknoDuh(o);
  o.notr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: "ease", fill: "forwards" });
  o.notr.animate(kl.notr, { duration: 320, easing: "linear", fill: "forwards" });
  duh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 150, easing: "ease", fill: "both" });
  o.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, delay: 230, easing: "linear", fill: "forwards" });
  o.panel.animate(kl.okno, { duration: 320, easing: "linear", fill: "forwards" }).finished.then(konec, konec);
}
function zapriVsaOkna(){ odprtaOkna.slice().forEach(function(id){ if(id === "oknoPotrdi") zapriPotrdi(); else zapriOkno(id); }); }
/* priprava: ločena plast zatemnitve in ovoj vsebine (nasprotni razteg) v vsakem oknu */
document.querySelectorAll(".okno-back").forEach(function(back){
  var zat = document.createElement("div"); zat.className = "okno-zatemni"; back.insertBefore(zat, back.firstChild);
  var panel = back.querySelector(".okno"), notr = document.createElement("div"); notr.className = "okno-notr";
  while(panel.firstChild) notr.appendChild(panel.firstChild);
  panel.appendChild(notr);
  back.addEventListener("mousedown", function(e){ back._zunaj = e.target === back; });
  back.addEventListener("touchstart", function(e){ back._zunaj = e.target === back; }, { passive: true });
  back.addEventListener("click", function(ev){ if(ev.target === back && back._zunaj !== false) zapriOkno(back.id); back._zunaj = false; });
  back.querySelectorAll("[data-zapri]").forEach(function(b){ b.addEventListener("click", function(){ zapriOkno(back.id); }); });
});

/* ── potrditev: kot potrdiModal v portalu ── */
var _ptDa = null, _ptFokus = null;
function askConfirm(naslov, sporocilo, gumbDa, onYes, nevarno, gumbNe){
  $("ptT").textContent = naslov; $("ptSp").textContent = sporocilo;
  $("ptDa").textContent = gumbDa || "Potrdi"; $("ptNe").textContent = gumbNe || "Prekliči";
  $("ptDa").className = "sc-modal-btn " + (nevarno ? "danger" : "primary");
  _ptDa = onYes; _ptFokus = document.activeElement;
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== "oknoPotrdi"; }); odprtaOkna.push("oknoPotrdi");
  var back = $("oknoPotrdi"); void back.offsetWidth; back.classList.add("show");
  try{ $("ptDa").focus({ preventScroll: true }); }catch(e){}
}
function zapriPotrdi(){
  $("oknoPotrdi").classList.remove("show");
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== "oknoPotrdi"; });
  try{ if(_ptFokus && _ptFokus.isConnected) _ptFokus.focus({ preventScroll: true }); }catch(e){}
}
$("ptDa").onclick = function(e){ e.stopPropagation(); var f = _ptDa; _ptDa = null; zapriPotrdi(); if(f) f(); };
$("ptNe").onclick = function(e){ e.stopPropagation(); _ptDa = null; zapriPotrdi(); };
$("oknoPotrdi").addEventListener("click", function(e){ if(e.target === this){ _ptDa = null; zapriPotrdi(); } });

/* ══════════ TEMA ══════════ */
function autoDark(){ var h = new Date().getHours(); return !(h >= 7 && h < 19); }
/* Preklop teme kot v portalu (uporabiTemo): View Transitions naredi GPU-pretapljanje (0,34 s),
   ostali CSS prehodi so med tem izklopljeni (sc-notrans); brez podpore je preklop hipen. */
function applyTheme(animiraj){
  var pref = settings.theme || "dark";
  var dark = pref === "auto" ? autoDark() : (pref !== "light");
  var eff = dark ? "dark" : "light", de = document.documentElement;
  if(animiraj && de.getAttribute("data-theme") && de.getAttribute("data-theme") !== eff){
    if(document.startViewTransition && !oknoMirno()){
      de.classList.add("sc-notrans");
      try{
        var vt = document.startViewTransition(function(){ de.setAttribute("data-theme", eff); });
        vt.finished.then(function(){ de.classList.remove("sc-notrans"); }, function(){ de.classList.remove("sc-notrans"); });
      }catch(e){ de.setAttribute("data-theme", eff); de.classList.remove("sc-notrans"); }
    }else{
      de.classList.add("sc-notrans"); de.setAttribute("data-theme", eff); void de.offsetWidth;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ de.classList.remove("sc-notrans"); }); });
    }
  }else de.setAttribute("data-theme", eff);
  var m = document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
  try{ localStorage.setItem("pralnica:tema", pref); }catch(e){}   // za izris pred nalaganjem (zagonski zaslon)
}
async function toggleTheme(){ settings.theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; applyTheme(true); await saveSettings(); }
document.querySelectorAll("[data-tema]").forEach(function(b){ b.onclick = toggleTheme; });

/* ══════════ VNOS SPREMNEGA LISTA ══════════ */
function draftLines(){ var c = clientById(selectedId); if(!c) return [];
  return c.artikli.filter(function(a){ return (draftQty[a.id] || 0) > 0; }).map(function(a){ return { id: a.id, naziv: a.naziv, kosov: draftQty[a.id] }; }); }
function draftPieces(){ return draftLines().reduce(function(s, l){ return s + l.kosov; }, 0); }
/* samodejna teža: Σ(teža na kos × kosov); teža je na artiklu stranke (portal) */
function draftKgAuto(){ var c = clientById(selectedId); if(!c) return { kg: 0, ima: false };
  var kg = 0, ima = false;
  c.artikli.forEach(function(a){ var q = draftQty[a.id] || 0; if(q > 0 && a.teza != null && !isNaN(a.teza)){ kg += a.teza * q; ima = true; } });
  return { kg: Math.round(kg * 1000) / 1000, ima: ima }; }
function draftStOpomb(){ return ((draftOpombaStranka || "").trim() ? 1 : 0) + ((draftOpombaEvidenca || "").trim() ? 1 : 0); }
function praznOsnutek(){ selectedId = null; draftQty = {}; draftPrevoz = "redni"; draftOpombaStranka = ""; draftOpombaEvidenca = ""; showHidden = false; editingId = null; }

function setClientLabel(){
  var c = clientById(selectedId), btn = $("strankaBtn");
  $("strankaIme").textContent = c ? c.naziv : "Izberi stranko";
  btn.classList.toggle("prazen", !c);
  btn.disabled = !!editingId;
}
function renderEntry(){
  var body = $("vnosTelo"), c = clientById(selectedId);
  if(!c){ body.innerHTML = '<div class="vnos-namig"><b>Izberi stranko</b>Nato vpiši število kosov za vsak artikel.</div>'; return; }
  if(!c.artikli.length){ body.innerHTML = '<div class="vnos-namig"><b>Stranka še nima artiklov</b>Artikle doda osebje v portalu (Cenik in artikli).</div>'; return; }
  /* privzeto samo artikli, ki jih stranka ima (viden_app) ali so že vpisani */
  function jeViden(a){ return (a.vid !== false) || (draftQty[a.id] || 0) > 0; }
  var vidni = c.artikli.filter(jeViden), skriti = c.artikli.filter(function(a){ return !jeViden(a); });
  function vrsta(a){ var k = draftQty[a.id] || 0;
    return '<button type="button" class="art' + (k > 0 ? ' polno' : '') + '" data-art="' + esc(a.id) + '"><span class="an">' + esc(a.naziv) + '</span>' +
      '<span class="kos" data-kos="' + esc(a.id) + '">' + k + '</span><span class="chev">›</span></button>'; }
  /* v portalu pri stranki ni obkljukan noben artikel (oznaka »app«) — namesto praznega prostora razlaga */
  var html = vidni.length ? '<div class="artikli">' + vidni.map(vrsta).join("") + '</div>'
    : '<div class="vnos-namig"><b>Ni artiklov, označenih za aplikacijo</b>V portalu jih označiš pri stranki (oznaka »app«). Ostale izbereš spodaj.</div>';
  if(skriti.length){
    html += showHidden
      ? '<p class="drugi-h">Ostali artikli</p><div class="artikli">' + skriti.map(vrsta).join("") + '</div><button type="button" class="drugi-btn" id="drugiSkrij">Skrij ostale artikle</button>'
      : '<button type="button" class="drugi-btn" id="drugiPokazi">Izberi drug artikel <span class="pill">' + skriti.length + '</span></button>';
  }
  body.innerHTML = html;
  body.querySelectorAll("[data-art]").forEach(function(b){ b.onclick = function(){ openKeypad(b.getAttribute("data-art"), b); }; });
  var p = $("drugiPokazi"); if(p) p.onclick = function(){ showHidden = true; renderEntry(); };
  var s = $("drugiSkrij"); if(s) s.onclick = function(){ showHidden = false; renderEntry(); };
}
function updatePill(id){
  var k = draftQty[id] || 0;
  var pill = document.querySelector('[data-kos="' + CSS.escape(id) + '"]'); if(pill) pill.textContent = k;
  var row = document.querySelector('[data-art="' + CSS.escape(id) + '"]'); if(row) row.classList.toggle("polno", k > 0);
}
function renderSummary(){
  var lines = draftLines(), aktiven = !!(selectedId || editingId);
  var e = editingId ? entryById(editingId) : null;
  var st = e ? e.stevilka : nextNumber();
  var ka = draftKgAuto(), nOp = draftStOpomb();
  $("povzetek").innerHTML =
    '<div class="pv-st"><span class="k">' + (e ? "Urejaš spremni list" : "Spremni list št.") + '</span><span class="v">' + esc(st) + '</span></div>' +
    (lines.length ? '<ul class="pv-list">' + lines.map(function(l){ return '<li><span>' + esc(l.naziv) + '</span><b>' + stevilo(l.kosov) + '</b></li>'; }).join("") + '</ul>' : '') +
    '<div class="pv-vrsta"><span class="k">Skupaj kosov</span><span class="v">' + stevilo(draftPieces()) + '</span></div>' +
    '<div class="pv-vrsta"><span class="k">Teža perila</span><span class="v">' + (ka.ima ? tezaFmt(ka.kg) : "—") + '</span></div>' +
    '<div class="pv-vrsta"><span class="k">Prevoz</span><div class="seg" id="prevozSeg">' +
      '<button type="button" class="seg-b' + (draftPrevoz !== "izredni" ? " on" : "") + '" data-pv="redni">Redni</button>' +
      '<button type="button" class="seg-b' + (draftPrevoz === "izredni" ? " on" : "") + '" data-pv="izredni">Izredni</button></div></div>' +
    '<div class="pv-vrsta"><span class="k">Opombe</span><button type="button" class="pill-btn' + (nOp ? " on" : "") + '" id="opombeBtn"' + (aktiven ? "" : " disabled") + '>' + (nOp ? "Uredi opombe (" + nOp + ")" : "Dodaj opombo") + '</button></div>' +
    '<button type="button" class="btn lg" id="zakljuciBtn"' + (draftPieces() > 0 ? "" : " disabled") + '>' + (e ? "Shrani spremembe" : "Zaključi") + '</button>';
  $("prevozSeg").querySelectorAll(".seg-b").forEach(function(b){ b.onclick = function(){
    draftPrevoz = b.getAttribute("data-pv") === "izredni" ? "izredni" : "redni";
    $("prevozSeg").querySelectorAll(".seg-b").forEach(function(x){ x.classList.toggle("on", x === b); });
  }; });
  $("opombeBtn").onclick = function(){ openNote(this); };
  $("zakljuciBtn").onclick = function(){ if(editingId) saveEdit(); else openReview(this); };
}
function updatePanelMode(){
  var e = editingId ? entryById(editingId) : null;
  $("vnosNaslov").textContent = e ? ("Urejanje " + e.stevilka) : "Nov spremni list";
  $("pocistiBtn").textContent = e ? "Prekliči urejanje" : "Počisti";
}
function osveziVse(){ setClientLabel(); updatePanelMode(); renderEntry(); renderSummary(); renderList(); }

/* izbira stranke */
function fillClientGrid(){
  var q = normaliziraj($("stIsci").value), izbran = clientPickerMode === "search" ? searchClientId : selectedId;
  var seznam = strankeUrejene().filter(function(c){ return !q || normaliziraj(c.naziv).indexOf(q) >= 0 || normaliziraj(c.podjetje).indexOf(q) >= 0; });
  $("stGrid").innerHTML = seznam.length
    ? seznam.map(function(c){ return '<button type="button" class="st-tile' + (c.id === izbran ? " sel" : "") + '" data-c="' + esc(c.id) + '">' + esc(c.naziv) + '</button>'; }).join("")
    : '<div class="st-prazno">' + (CLIENTS.length ? "Ni zadetkov." : (pullTecev || katalogTecev ? "Nalagam stranke iz portala …" : "Seznam strank je prazen — potrebna je povezava s portalom.")) + '</div>';
  $("stGrid").querySelectorAll("[data-c]").forEach(function(b){ b.onclick = function(){ pickClient(b.getAttribute("data-c")); }; });
}
function openClientPicker(mode, izvor){
  clientPickerMode = mode || "entry";
  $("stT").textContent = clientPickerMode === "search" ? "Išči po stranki" : "Izberi stranko";
  $("stIsci").value = ""; fillClientGrid();
  odpriOkno("oknoStranke", izvor);
  if(window.matchMedia && matchMedia("(pointer:fine)").matches) setTimeout(function(){ $("stIsci").focus(); }, 60);
}
$("stIsci").oninput = fillClientGrid;
function pickClient(id){
  zapriOkno("oknoStranke");
  if(clientPickerMode === "search"){ clientPickerMode = "entry"; searchMode = "client"; searchClientId = id; updateSearchChip(); renderList(); return; }
  if(selectedId !== id){ selectedId = id; draftQty = {}; showHidden = false; }
  setClientLabel(); renderEntry(); renderSummary();
  if(portalAuth) osveziStrankinArtikle(id);   // artikli TE stranke naravnost iz portala
}

/* številčnica */
function buildKeypad(){
  var keys = ["1","2","3","4","5","6","7","8","9","C","0","back"];
  $("kpGrid").innerHTML = keys.map(function(k){
    if(k === "back") return '<button type="button" class="kp-key util" data-k="back" aria-label="Briši">⌫</button>';
    if(k === "C") return '<button type="button" class="kp-key util" data-k="C">C</button>';
    return '<button type="button" class="kp-key" data-k="' + k + '">' + k + '</button>';
  }).join("") + '<button type="button" class="btn" data-k="enter" id="kpEnter">Potrdi</button>';
  $("kpGrid").querySelectorAll("[data-k]").forEach(function(b){ b.onclick = function(){ kpPress(b.getAttribute("data-k")); }; });
}
function openKeypad(artId, izvor){
  kpMode = "entry"; kpArt = artId; kpBuf = "";
  var a = artById(artId), cur = draftQty[artId] || 0;
  $("kpT").textContent = "Vnos kosov";
  $("kpIme").textContent = a ? a.naziv : "—";
  $("kpZdaj").textContent = cur ? ("Zdaj: " + cur + " kos") : "Še ni vpisano";
  $("kpEnter").textContent = "Potrdi";
  kpRenderDisp(); odpriOkno("oknoKp", izvor);
}
function openSearchKeypad(izvor){
  kpMode = "search"; kpBuf = searchMode === "id" ? searchQuery.replace(/[^0-9]/g, "") : "";
  $("kpT").textContent = "Išči po številki";
  $("kpIme").textContent = "Številka spremnega lista";
  $("kpZdaj").textContent = "Rezultati se osvežujejo sproti";
  $("kpEnter").textContent = "Zapri";
  kpRenderDisp(); odpriOkno("oknoKp", izvor);
}
obZaprtju.oknoKp = function(){ kpArt = null; kpBuf = ""; kpMode = "entry"; };
function kpRenderDisp(){
  var d = $("kpDisp");
  d.classList.toggle("prazen", kpBuf === "");
  d.innerHTML = (kpBuf === "" ? "0" : esc(kpBuf)) + (kpMode === "entry" ? '<span class="e">kos</span>' : "");
}
function kpPress(k){
  if(k === "enter"){
    if(kpMode === "entry" && kpBuf !== "" && kpArt){ var id = kpArt; draftQty[id] = parseInt(kpBuf, 10) || 0; updatePill(id); renderSummary(); }
    zapriOkno("oknoKp"); return;
  }
  if(k === "C"){ kpBuf = ""; }
  else if(k === "back"){ kpBuf = kpBuf.slice(0, -1); }
  else{ if(kpBuf === "0") kpBuf = ""; if(kpBuf.length < (kpMode === "search" ? 8 : 4)) kpBuf += k; }
  if(kpMode === "search"){ searchMode = kpBuf ? "id" : ""; searchQuery = kpBuf; updateSearchChip(); renderList(); }
  kpRenderDisp();
}
document.addEventListener("keydown", function(ev){
  var top = odprtaOkna[odprtaOkna.length - 1];
  if(ev.key === "Escape"){ if($("pinOkno")){ $("pinPreklic").click(); return; } if(top && top !== "oknoPotrdi") zapriOkno(top); else if(top) $("ptNe").click(); return; }
  if(top !== "oknoKp") return;
  if(/^[0-9]$/.test(ev.key)){ kpPress(ev.key); ev.preventDefault(); }
  else if(ev.key === "Backspace"){ kpPress("back"); ev.preventDefault(); }
  else if(ev.key === "Enter"){ kpPress("enter"); ev.preventDefault(); }
});

/* opombe */
function openNote(izvor){
  $("opStranka").value = draftOpombaStranka || ""; $("opEvidenca").value = draftOpombaEvidenca || "";
  odpriOkno("oknoOpombe", izvor);
}
$("opShrani").onclick = function(){
  draftOpombaStranka = ($("opStranka").value || "").trim();
  draftOpombaEvidenca = ($("opEvidenca").value || "").trim();
  zapriOkno("oknoOpombe"); renderSummary(); toast("Opombe shranjene");
};

/* pregled → shrani → natisni */
function novZapis(c, lines){
  return { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    stevilka: nextNumber(), datum: todayISO(), ustvarjeno: new Date().toISOString(),
    strankaId: c.id, strankaNaziv: c.naziv, strankaPodjetje: c.podjetje, strankaNaslov: c.naslov, strankaDavcna: c.davcna,
    izdal: (session ? session.user : ""), postavke: lines, skupajKosov: lines.reduce(function(a, l){ return a + l.kosov; }, 0),
    kg: draftKgAuto().kg, prevoz: draftPrevoz, opombaStranka: draftOpombaStranka || "", opombaEvidenca: draftOpombaEvidenca || "",
    saved: true, syncedAt: null, syncNapaka: null };
}
function openReview(izvor){
  var c = clientById(selectedId); if(!c) return;
  var lines = draftLines(); if(!lines.length){ toast("Vpiši vsaj en artikel."); return; }
  var ka = draftKgAuto();
  $("rvTelo").innerHTML =
    '<div class="rv-glava"><div class="rv-stranka">' + esc(c.naziv) + '</div><div class="rv-st">Spremni list št. ' + esc(nextNumber()) + ' · ' + fmtDateHuman(todayISO()) + '</div></div>' +
    '<ul class="rv-list">' + lines.map(function(l){ return '<li><span>' + esc(l.naziv) + '</span><b>' + stevilo(l.kosov) + '</b></li>'; }).join("") + '</ul>' +
    '<div class="rv-tot"><span>Skupaj kosov</span><b>' + stevilo(draftPieces()) + '</b></div>' +
    '<div class="rv-tot"><span>Teža perila</span><b>' + (ka.ima ? tezaFmt(ka.kg) : "—") + '</b></div>' +
    '<div class="rv-tot"><span>Prevoz</span><b>' + (draftPrevoz === "izredni" ? "Izredni" : "Redni") + '</b></div>' +
    (draftOpombaStranka ? '<div class="rv-tot"><span>Opomba za stranko</span><b style="text-align:right;font-weight:500">' + esc(draftOpombaStranka) + '</b></div>' : '');
  $("rvT").textContent = "Pregled pred shranjevanjem";
  $("rvPotrdiAkc").hidden = false; $("rvTiskAkc").hidden = true;
  odpriOkno("oknoPregled", izvor);
}
obZaprtju.oknoPregled = function(){ reviewEntryId = null; };
var _shranjujem = false;
async function confirmReview(){
  if(_shranjujem) return;
  var c = clientById(selectedId), lines = draftLines(); if(!c || !lines.length) return;
  _shranjujem = true;
  try{
    var ent = novZapis(c, lines);
    entries.push(ent); reviewEntryId = ent.id;
    await saveEntries(); writeBackup();
    /* artikel, ki je bil skrit, a je zdaj na listu, postane viden (enako naredi baza ob prenosu) */
    var razkril = false;
    lines.forEach(function(l){ var a = c.artikli.find(function(x){ return x.id === l.id; }); if(a && a.vid === false){ a.vid = true; razkril = true; } });
    if(razkril) saveClients();
    praznOsnutek(); osveziVse();
    $("rvT").textContent = "Spremni list " + ent.stevilka + " je shranjen";
    $("rvTelo").insertAdjacentHTML("beforeend", '<div class="rv-ok"><span class="dot ok"></span>Shranjen na napravi' + (portalAuth ? " in se pošilja v portal." : ".") + '</div>');
    $("rvPotrdiAkc").hidden = true; $("rvTiskAkc").hidden = false;
    savePdfs(ent);
    try{ syncPush(true); }catch(e){}
  }finally{ _shranjujem = false; }
}
$("rvPotrdi").onclick = confirmReview;
$("rvUredi").onclick = function(){ zapriOkno("oknoPregled"); };
$("rvZavrzi").onclick = function(){ zapriOkno("oknoPregled"); askConfirm("Zavrzi vnos?", "Vpisani kosi za to stranko bodo izbrisani.", "Zavrzi", function(){ praznOsnutek(); osveziVse(); }, true); };
$("rvPreskoci").onclick = function(){ zapriOkno("oknoPregled"); };
$("rvTisk1").onclick = function(){ var e = entryById(reviewEntryId); zapriOkno("oknoPregled"); if(e) printLists([e], true); };
$("rvTisk2").onclick = function(){ var e = entryById(reviewEntryId); zapriOkno("oknoPregled"); if(e) printLists([e], false); };

/* urejanje */
function startEdit(id){
  var e = entryById(id); if(!e) return;
  if(jeZaklenjen(e)){ toast("List " + e.stevilka + " je v portalu potrjen — spremeniš ga lahko samo v portalu."); return; }
  var c = clientById(e.strankaId); if(!c){ toast("Stranke ni več v seznamu — urejanje ni mogoče."); return; }
  editingId = id; selectedId = e.strankaId; draftQty = {}; showHidden = false;
  draftPrevoz = e.prevoz === "izredni" ? "izredni" : "redni";
  draftOpombaStranka = e.opombaStranka || ""; draftOpombaEvidenca = e.opombaEvidenca || "";
  (e.postavke || []).forEach(function(p){
    var art = (p.id && c.artikli.find(function(a){ return a.id === p.id; })) || c.artikli.find(function(a){ return a.naziv === p.naziv; });
    if(art) draftQty[art.id] = (draftQty[art.id] || 0) + p.kosov;
  });
  osveziVse();
  try{ window.scrollTo({ top: 0, behavior: "smooth" }); }catch(_){}
}
function cancelEdit(){ praznOsnutek(); osveziVse(); }
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
async function saveEdit(){
  var e = entryById(editingId); if(!e) return;
  if(jeZaklenjen(e)){ toast("List " + e.stevilka + " je medtem v portalu potrjen — spremembe niso shranjene."); cancelEdit(); return; }
  var lines = draftLines(); if(!lines.length){ toast("Vpiši vsaj en artikel."); return; }
  var novaKg = draftKgAuto().kg, kdo = (session ? session.user : "") || "osebje", zdaj = new Date().toISOString();
  var opis = opisiSpremembe(e.postavke, lines, e.kg, novaKg, e.prevoz, draftPrevoz);
  if(((e.opombaStranka || "") !== (draftOpombaStranka || "")) || ((e.opombaEvidenca || "") !== (draftOpombaEvidenca || ""))) opis += " · opomba posodobljena";
  e.popravil = kdo; e.popravljeno_at = zdaj;
  e.popravki = (e.popravki ? e.popravki + "\n" : "") + fmtDateHuman(zdaj.slice(0, 10)) + " · " + kdo + ": " + opis;
  e.postavke = lines; e.skupajKosov = lines.reduce(function(a, l){ return a + l.kosov; }, 0);
  e.kg = novaKg; e.prevoz = draftPrevoz; e.opombaStranka = draftOpombaStranka; e.opombaEvidenca = draftOpombaEvidenca;
  e.syncedAt = null; e.syncNapaka = null;
  await saveEntries(); writeBackup();
  if(e.saved) savePdfs(e);
  var st = e.stevilka;
  praznOsnutek(); osveziVse();
  toast("Spremni list " + st + " posodobljen");
  try{ syncPush(true); }catch(_){}
}
$("pocistiBtn").onclick = function(){
  if(editingId){ cancelEdit(); return; }
  if(!selectedId && !draftPieces()){ return; }
  if(draftPieces() > 0) askConfirm("Počisti vnos?", "Vpisani kosi bodo izbrisani.", "Počisti", function(){ praznOsnutek(); osveziVse(); }, true, "Prekliči", this);
  else { praznOsnutek(); osveziVse(); }
};
$("strankaBtn").onclick = function(){ openClientPicker("entry", this); };

/* brisanje: samo lokalni osnutki, ki še niso v portalu (portal je vir resnice) */
function delEntry(id, izvor){
  var e = entryById(id); if(!e) return;
  if(e.syncedAt || e.prenesenIzPortala || e.potrjeno){ toast("Spremni list, ki je že v portalu, izbrišeš v portalu."); return; }
  askConfirm("Izbriši spremni list?", e.stevilka + " (" + e.strankaNaziv + ") še ni v portalu in bo izbrisan samo s te naprave.", "Izbriši", async function(){
    await deleteSyncPdf(e);
    entries = entries.filter(function(x){ return x.id !== id; });
    if(id === editingId) cancelEdit();
    await saveEntries(); renderList(); renderSummary(); risiSyncGumb();
  }, true, "Prekliči", izvor);
}
/* številka je v portalu zasedena z drugim listom → predlagaj prosto (portal + naprava) */
async function novaStevilka(id, izvor){
  var e = entryById(id); if(!e) return;
  var leto = String(e.stevilka).split("/")[1] || String(new Date().getFullYear());
  var izPortala = 0;
  try{ var r = await api("rpc/app_prosta_stevilka", { method: "POST", body: { p_leto: parseInt(leto, 10) } }); if(typeof r === "number") izPortala = r; }catch(_){}
  var maxLok = 0; entries.forEach(function(x){ var p = String(x.stevilka || "").split("/"); if(p[1] === leto){ var s = parseInt(p[0], 10); if(!isNaN(s) && s > maxLok) maxLok = s; } });
  var nova = String(Math.max(izPortala, maxLok + 1)).padStart(4, "0") + "/" + leto;
  askConfirm("Nova številka lista?", "Številka " + e.stevilka + " je v portalu že zasedena z drugim spremnim listom. Ta list dobi številko " + nova + ". Na natisnjenem listu popravi številko ali ga natisni znova.", "Spremeni v " + nova, async function(){
    await renameEntryNumber(id, nova);
    e.stevilkaZasedena = false; e.syncNapaka = null; await saveEntries(); renderList();
    try{ syncPush(false); }catch(_){}
  }, false, "Prekliči", izvor);
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

/* ══════════ SEZNAM IN ISKANJE ══════════ */
function currentListEntries(){
  var arr = null;
  if(searchMode === "id" && searchQuery){
    /* samo po zaporedni številki (pred »/«) — sicer bi se 1452 ujel s 1145/2026 */
    var q = String(searchQuery).replace(/[^0-9]/g, "");
    arr = entries.filter(function(e){ var seq = String(e.stevilka || "").split("/")[0].replace(/[^0-9]/g, ""); return q && seq.indexOf(q) >= 0; });
  }else if(searchMode === "date" && searchDate){ arr = entries.filter(function(e){ return e.datum === searchDate; }); }
  else if(searchMode === "client" && searchClientId){ arr = entries.filter(function(e){ return e.strankaId === searchClientId; }); }
  var vsi = (arr || entries).slice().sort(function(a, b){ return stKljuc(b) - stKljuc(a); });
  return arr ? vsi.slice(0, 200) : vsi.slice(0, 40);
}
var IKO_OKO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
var IKO_UREDI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
var IKO_KOS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>';
function renderList(){
  var el = $("seznam"), t = currentListEntries();
  $("seznamNaslov").textContent = searchMode ? ("Rezultati iskanja (" + t.length + ")") : "Zadnji spremni listi";
  if(!t.length){
    el.innerHTML = searchMode ? '<div class="prazno"><b>Ni zadetkov</b>Za to iskanje ni spremnega lista.</div>'
                              : '<div class="prazno"><b>Še ni spremnih listov</b>Prvega ustvariš zgoraj.</div>';
  }else{
    el.innerHTML = '<ul class="listi">' + t.map(function(e){
      var n = (e.postavke || []).length, stanje = [];
      if(!e.syncedAt){
        if(e.stevilkaZasedena) stanje.push('<span class="t-bad">Številka je v portalu zasedena</span>');
        else stanje.push('<span class="dot warn"></span><span class="t-warn">Čaka na prenos' + (e.syncNapaka ? " · " + esc(e.syncNapaka) : "") + '</span>');
      }
      if(e.vSporu) stanje.push('<span class="pill bad">V sporu · reši v portalu</span>');
      if(jeZaklenjen(e)) stanje.push('<span class="pill ok">Potrjeno</span>');
      var lahkoBrise = !(e.syncedAt || e.prenesenIzPortala || e.potrjeno);
      return '<li class="list' + (e.id === editingId ? " ureja" : "") + '">' +
        '<div class="l-info"><div class="l-ime">' + esc(e.strankaNaziv) + '</div>' +
        '<div class="l-sub">' + esc(e.stevilka) + ' · ' + fmtDateHuman(e.datum) + ' · ' + n + ' ' + sklon(n, "artikel", "artikla", "artikli", "artiklov") + '</div>' +
        (stanje.length ? '<div class="l-stanje">' + stanje.join("") + '</div>' : '') + '</div>' +
        '<div class="l-kos">' + stevilo(e.skupajKosov) + '<small>kos</small></div>' +
        '<div class="l-akc">' +
          (e.stevilkaZasedena && !e.syncedAt ? '<button type="button" class="pill-btn novast" data-renum="' + esc(e.id) + '">Nova št.</button>' : '') +
          '<button type="button" class="icon-btn" data-view="' + esc(e.id) + '" aria-label="Predogled in tiskanje">' + IKO_OKO + '</button>' +
          (jeZaklenjen(e) ? '' : '<button type="button" class="icon-btn" data-edit="' + esc(e.id) + '" aria-label="Uredi">' + IKO_UREDI + '</button>') +
          (lahkoBrise ? '<button type="button" class="icon-btn del" data-del="' + esc(e.id) + '" aria-label="Izbriši">' + IKO_KOS + '</button>' : '') +
        '</div></li>';
    }).join("") + '</ul>';
    el.querySelectorAll("[data-view]").forEach(function(b){ b.onclick = function(){ openSheet(b.getAttribute("data-view"), b); }; });
    el.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick = function(){ startEdit(b.getAttribute("data-edit")); }; });
    el.querySelectorAll("[data-del]").forEach(function(b){ b.onclick = function(){ delEntry(b.getAttribute("data-del"), b); }; });
    el.querySelectorAll("[data-renum]").forEach(function(b){ b.onclick = function(){ novaStevilka(b.getAttribute("data-renum"), b); }; });
  }
  var skupaj = entries.length;
  $("noga").textContent = skupaj ? ("Na napravi " + stevilo(skupaj) + " " + sklon(skupaj, "spremni list", "spremna lista", "spremni listi", "spremnih listov") + " · različica " + APP_VERZIJA) : ("Različica " + APP_VERZIJA);
}
function updateSearchChip(){
  var txt = "";
  if(searchMode === "id" && searchQuery) txt = "Številka vsebuje " + searchQuery;
  else if(searchMode === "date" && searchDate) txt = "Datum " + fmtDateHuman(searchDate);
  else if(searchMode === "client" && searchClientId){ var c = clientById(searchClientId); txt = "Stranka " + (c ? c.naziv : "?"); }
  $("isciChip").hidden = !txt; $("isciChipT").textContent = txt;
  $("isciSt").classList.toggle("on", searchMode === "id" && !!txt);
  $("isciDat").classList.toggle("on", searchMode === "date" && !!txt);
  $("isciStr").classList.toggle("on", searchMode === "client" && !!txt);
}
function clearSearch(){ searchMode = ""; searchQuery = ""; searchDate = ""; searchClientId = ""; updateSearchChip(); renderList(); }
$("isciSt").onclick = function(){ openSearchKeypad(this); };
$("isciStr").onclick = function(){ openClientPicker("search", this); };
$("isciPocisti").onclick = clearSearch;
$("isciDatum").onclick = function(){ try{ if(this.showPicker) this.showPicker(); }catch(_){} };
$("isciDatum").onchange = function(){ if(this.value){ searchMode = "date"; searchDate = this.value; updateSearchChip(); renderList(); } };

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

/* predogled = točno dokument, ki se natisne (iframe) */
function openSheet(id, izvor){
  var e = entryById(id); if(!e) return;
  previewId = id; $("pdEna").checked = false;
  $("pdT").textContent = "Spremni list " + e.stevilka;
  var okvir = $("pdOkvir");
  okvir.innerHTML = "";
  var ifr = document.createElement("iframe");
  ifr.setAttribute("title", "Predogled spremnega lista"); ifr.setAttribute("tabindex", "-1");
  ifr.style.width = "794px"; ifr.style.height = "1123px";
  okvir.appendChild(ifr);
  function prilagodi(){
    var w = okvir.clientWidth || 360, s = w / 794;
    var h = 1123; try{ h = Math.max(1123, ifr.contentDocument.documentElement.scrollHeight); }catch(_){}
    ifr.style.height = h + "px"; ifr.style.transform = "scale(" + s + ")"; okvir.style.height = Math.ceil(h * s) + "px";
  }
  ifr.onload = function(){ prilagodi(); try{ ifr.contentDocument.fonts.ready.then(prilagodi); }catch(_){} };
  ifr.srcdoc = dokZaListe([e], 1);
  odpriOkno("oknoPredogled", izvor);
  requestAnimationFrame(prilagodi);
}
obZaprtju.oknoPredogled = function(){ setTimeout(function(){ if(!_okna.oknoPredogled) $("pdOkvir").innerHTML = ""; }, 900); };
$("pdTisk").onclick = function(){ var e = entryById(previewId); if(e) printLists([e], $("pdEna").checked); };

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

/* ══════════ PRIJAVA ══════════
   Profili (kot v portalu): 1× prijava z geslom, nato en dotik (+ PIN, če ga ima
   račun nastavljenega v portalu). Dostop imajo računi, ki jih baza spusti do
   spremnih listov (sme_app: osebje, super admin, lastnik) in naprave. */
var aktivniEmail = "";
function pokaziPrijavo(){ $("app").hidden = true; $("prijava").hidden = false; }
function showAccountLogin(msg, email){
  session = null; clearTimeout(idleTimer); zapriVsaOkna(); pokaziPrijavo();
  $("profili").hidden = true; $("prijavaObr").hidden = false;
  $("acctErr").textContent = msg || ""; $("acctPass").value = "";
  if(email) $("acctEmail").value = email;
  $("acctBack").hidden = !savedProfs.length;
}
function avatarHtml(p){
  if(p && p.avatar && /^https:\/\//.test(p.avatar)) return '<span class="pp-av" style="background-image:url(\'' + encodeURI(p.avatar).replace(/'/g, "%27") + '\')"></span>';
  return '<span class="pp-av av-sc"><span class="sc-s">S</span><span class="sc-c">C</span></span>';
}
function prikaziProfile(msg){
  if(!savedProfs.length){ showAccountLogin(msg || ""); return; }
  session = null; clearTimeout(idleTimer); zapriVsaOkna(); pokaziPrijavo();
  $("prijavaObr").hidden = true; $("profili").hidden = false;
  $("ppMsg").textContent = msg || "";
  var urejeni = savedProfs.slice().sort(function(a, b){ return String(a.name || a.email).localeCompare(String(b.name || b.email), "sl"); });
  $("ppGrid").innerHTML = urejeni.map(function(p){
    return '<div class="pp-tile-wrap"><button type="button" class="pp-tile" data-em="' + esc(p.email) + '">' + avatarHtml(p) + '<span class="pp-nm">' + esc(p.name || p.email) + '</span></button>' +
      '<button type="button" class="pp-tile-x" data-pozabi="' + esc(p.email) + '" aria-label="Odstrani profil">×</button></div>';
  }).join("") + '<div class="pp-tile-wrap"><button type="button" class="pp-tile pp-add" id="ppDodaj"><span class="pp-av">+</span><span class="pp-nm">Dodaj</span></button></div>';
  $("ppGrid").querySelectorAll("[data-em]").forEach(function(b){ b.onclick = function(){ izberiProfil(b.getAttribute("data-em"), b); }; });
  $("ppGrid").querySelectorAll("[data-pozabi]").forEach(function(b){ b.onclick = function(ev){ ev.stopPropagation(); pozabiProfil(b.getAttribute("data-pozabi"), b); }; });
  $("ppDodaj").onclick = function(){ showAccountLogin(""); setTimeout(function(){ $("acctEmail").focus(); }, 50); };
}
function pozabiProfil(em, izvor){
  var p = savedProfs.find(function(x){ return x.email === em; }); if(!p) return;
  askConfirm("Odstrani profil?", "Profil " + (p.name || p.email) + " bo odstranjen s te naprave. Za ponoven vstop bo potrebna prijava z geslom.", "Odstrani", async function(){
    savedProfs = savedProfs.filter(function(x){ return x.email !== em; }); await saveProfs(); prikaziProfile();
  }, true, "Prekliči", izvor);
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
  if(!em || !pw){ er.textContent = "Vpiši e-poštni naslov in geslo."; return; }
  btn.disabled = true; btn.textContent = "Prijavljam …"; er.textContent = "";
  try{
    aktivniEmail = "";
    await portalLogin(em, pw);
    var prof = await portalProfil();
    if(!prof.dostop){ portalAuth = null; await savePortalAuth(); er.textContent = NI_DOSTOPA; return; }
    var email = prof.email || em;
    savedProfs = savedProfs.filter(function(p){ return p.email !== email; });
    var np = { email: email, name: prof.full_name || email, uid: prof.id || null, refresh_token: portalAuth.refresh_token, avatar: prof.avatar_url || "", pin: prof.app_pin || "", dostop: true };
    savedProfs.push(np); await saveProfs();
    $("acctPass").value = "";
    vstopi(np);   // pravkar se je prijavil z geslom → brez PIN-a
  }catch(e){
    var m = (e && e.message) || "";
    er.textContent = /invalid login|invalid_grant|credentials/i.test(m) ? "Napačen e-poštni naslov ali geslo." : (/ni povezave|fetch/i.test(m) ? "Ni povezave z internetom." : (m || "Prijava ni uspela."));
  }finally{ btn.disabled = false; btn.textContent = "Prijavi se"; }
}
$("acctForm").addEventListener("submit", function(e){ e.preventDefault(); acctSubmit(); });
$("acctBack").onclick = function(){ prikaziProfile(); };

async function izberiProfil(em, tile){
  var p = savedProfs.find(function(x){ return x.email === em; }); if(!p) return;
  $("ppMsg").textContent = "";
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
/* PIN (nastavi se v portalu, Moj račun) */
function zahtevajPin(p, onOk){
  var star = $("pinOkno"); if(star) star.remove();
  var buf = "";
  var el = document.createElement("div"); el.className = "pin"; el.id = "pinOkno";
  el.innerHTML = '<div class="pin-in">' + avatarHtml(p) + '<div class="pin-ime">' + esc(p.name || p.email) + '</div><div class="pin-sub">Vpiši svojo 4-mestno kodo</div>' +
    '<div class="pin-dots">' + [0, 1, 2, 3].map(function(){ return '<span class="pin-dot"></span>'; }).join("") + '</div>' +
    '<div class="pin-pad">' + ["1","2","3","4","5","6","7","8","9"].map(function(n){ return '<button type="button" class="pin-key" data-k="' + n + '">' + n + '</button>'; }).join("") +
    '<button type="button" class="pin-key prazna" tabindex="-1"></button><button type="button" class="pin-key" data-k="0">0</button><button type="button" class="pin-key" data-k="del" aria-label="Briši">⌫</button></div>' +
    '<div class="pin-err" id="pinErr"></div><button type="button" class="link-btn" id="pinPreklic">Prekliči</button></div>';
  document.body.appendChild(el);
  function upd(){ el.querySelectorAll(".pin-dot").forEach(function(d, i){ d.classList.toggle("on", i < buf.length); }); }
  function tipka(k){
    if(k === "del") buf = buf.slice(0, -1);
    else if(buf.length < 4){ buf += k; $("pinErr").textContent = ""; }
    upd();
    if(buf.length === 4) setTimeout(function(){
      if(buf === String(p.pin)){ document.removeEventListener("keydown", tipke); el.remove(); onOk(); }
      else{ buf = ""; upd(); $("pinErr").textContent = "Napačna koda"; el.classList.remove("tresi"); void el.offsetWidth; el.classList.add("tresi"); }
    }, 120);
  }
  function tipke(ev){ if(/^[0-9]$/.test(ev.key)) tipka(ev.key); else if(ev.key === "Backspace") tipka("del"); }
  document.addEventListener("keydown", tipke);
  el.querySelectorAll("[data-k]").forEach(function(b){ b.onclick = function(){ tipka(b.getAttribute("data-k")); }; });
  $("pinPreklic").onclick = function(){ document.removeEventListener("keydown", tipke); el.remove(); prikaziProfile(); };
}
function doLogin(u){
  session = { user: u.name, start: new Date().toISOString() };
  $("prijava").hidden = true; $("app").hidden = false;
  $("tbIme").textContent = u.name || "";
  praznOsnutek(); searchMode = ""; searchQuery = ""; searchDate = ""; searchClientId = "";
  updateSearchChip(); osveziVse(); risiSyncGumb();
  resetIdle();
  if(pdfPlugin() && !pdfPermOK && !askedPerm){
    askedPerm = true;
    askConfirm("Dovoljenje za datoteke", "Za samodejno shranjevanje spremnih listov kot PDF v mapo Dokumenti omogoči »Dostop do vseh datotek«.", "Odpri nastavitve",
      function(){ try{ pdfPlugin().requestPermission(); }catch(e){} }, false, "Pozneje");
  }
}
function logout(){ zapriVsaOkna(); session = null; clearTimeout(idleTimer); prikaziProfile(); }
function resetIdle(){ if(!session) return; clearTimeout(idleTimer); idleTimer = setTimeout(logout, (settings.idleMin || 15) * 60000); }
["click", "touchstart", "keydown"].forEach(function(ev){ document.addEventListener(ev, resetIdle, true); });
$("zamenjajBtn").onclick = logout;
$("izklopBtn").onclick = function(){ askConfirm("Izklopim aplikacijo?", "Neposlani spremni listi ostanejo shranjeni na napravi in se pošljejo ob naslednjem zagonu.", "Izklopi", function(){
  try{ Capacitor.Plugins.App.exitApp(); }catch(e){}
}, false, "Prekliči", this); };

/* razkrij geslo (očesce, kot v portalu) */
var _OKO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
var _OKO_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.1 6.1A13.3 13.3 0 0 0 2 12s3 8 10 8a9.3 9.3 0 0 0 5.9-2.1"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><path d="m3 3 18 18"/></svg>';
document.querySelectorAll('input[type="password"]').forEach(function(inp){
  var wrap = document.createElement("span"); wrap.className = "pw-wrap";
  inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
  var b = document.createElement("button"); b.type = "button"; b.className = "pw-eye"; b.tabIndex = -1; b.setAttribute("aria-label", "Pokaži geslo"); b.innerHTML = _OKO;
  wrap.appendChild(b);
  b.onclick = function(e){ e.preventDefault(); var pokazi = inp.type === "password"; inp.type = pokazi ? "text" : "password"; b.innerHTML = pokazi ? _OKO_OFF : _OKO; b.setAttribute("aria-label", pokazi ? "Skrij geslo" : "Pokaži geslo"); };
});

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
  if(_zavrnjenoPotrjeno.length){
    toast("List " + _zavrnjenoPotrjeno.join(", ") + " je v portalu že potrjen — sprememba ni bila prenesena.");
    _zavrnjenoPotrjeno = [];
    osveziIzPortala();
  }else if(!tiho){
    if(spodletelo) toast("Poslano " + poslano + ", ostalo " + spodletelo + " — " + zadnjaNapaka);
    else if(poslano) toast("Poslano v portal: " + poslano);
  }
}

/* ── stanje sinhronizacije v orodni vrstici ── */
var IKO_SYNC = '<svg class="vrti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
function risiSyncGumb(){
  var b = $("syncChip"), dot = $("syncDot"); if(!b) return;
  if(!portalNastavljen() || (!portalAuth && !session)){ b.hidden = true; return; }
  b.hidden = false;
  var caka = entries.filter(function(e){ return !e.syncedAt; }).length;
  var brez = navigator.onLine === false || syncZadnje === "ni povezave" || syncZadnje === "ni omrežja";
  var st, t;
  if(!portalAuth){ st = "bad"; t = "Seja v portalu je potekla — tapni za ponovno prijavo."; }
  else if(syncTecev || rocnoTece){ st = "warn"; t = "Prenos v teku …"; }
  else if(caka){ st = brez ? "bad" : "warn"; t = "Na prenos čaka " + caka + (brez ? " — ni povezave" : (syncZadnje ? " — " + syncZadnje : "")) + ". Tapni za prenos zdaj."; }
  else { st = "ok"; t = "Vse je v portalu. Tapni za osvežitev."; }
  b.classList.toggle("vrti", !!(syncTecev || rocnoTece));
  dot.className = "notif-dot " + st; b.title = t; b.setAttribute("aria-label", t);
}
var rocnoTece = false;
$("syncChip").onclick = async function(){
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
    if(session){ setClientLabel(); renderEntry(); if($("oknoStranke").classList.contains("odprto")) fillClientGrid(); }
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
    if(selectedId === cid){ renderEntry(); renderSummary(); }
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
      if(editingId && !entryById(editingId)){ praznOsnutek(); toast("List, ki si ga urejal, je bil v portalu izbrisan."); }
      if(session) osveziVse();
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
  $("izklopBtn").hidden = false;
  try{
    var App = Capacitor.Plugins.App;
    /* sistemski gumb »nazaj«: zapre odprto okno namesto izhoda iz aplikacije */
    App.addListener("backButton", function(){
      var pin = $("pinOkno"); if(pin){ $("pinPreklic").click(); return; }
      var top = odprtaOkna[odprtaOkna.length - 1];
      if(top){ if(top === "oknoPotrdi") $("ptNe").click(); else zapriOkno(top); return; }
      if(editingId){ cancelEdit(); return; }
      if(!$("prijavaObr").hidden && savedProfs.length){ prikaziProfile(); }
    });
    App.addListener("resume", function(){ if(shrambaZaklenjena) location.reload(); });
  }catch(e){}
}

/* Tablica brez dovoljenja za datoteke (npr. po ponovni namestitvi): stari podatki so
   v mapi Dokumenti, a jih aplikacija ne vidi. Ne nadaljuj (ne prepiši jih s praznimi). */
function pokaziZaklepShrambe(){
  var el = document.createElement("div"); el.className = "pin"; el.id = "zaklepShrambe";
  el.innerHTML = '<div class="pin-in" style="max-width:420px"><div class="wordmark" style="font-size:2rem;margin-bottom:22px">Smart<span>Clean</span></div>' +
    '<div class="pin-ime">Aplikacija potrebuje dostop do datotek</div>' +
    '<p class="pin-sub" style="line-height:1.55">Spremni listi so shranjeni v mapi Dokumenti na tej tablici. Omogoči »Dostop do vseh datotek« za SmartClean, nato se vrni v aplikacijo.</p>' +
    '<button type="button" class="btn lg" id="zsOdpri">Odpri nastavitve</button></div>';
  document.body.appendChild(el);
  $("zsOdpri").onclick = function(){ try{ pdfPlugin().requestPermission(); }catch(e){} };
}

/* ══════════ ZAGON ══════════ */
(async function init(){
  try{
    nativnaPriprava();
    await loadSettings(); applyTheme();
    await loadProfs(); await loadClients(); await loadEntries(); await loadPortalAuth();
    await ensurePdfPerm();
    buildKeypad(); updateSearchChip();
    if(shrambaZaklenjena){ pokaziZaklepShrambe(); return; }
    try{ realtimeKlient(); }catch(e){}
    prikaziProfile();
  }finally{
    requestAnimationFrame(function(){ try{ window.scBootDone(); }catch(e){} });
  }
})();

/* za preizkuse (samo branje stanja) */
window.__pralnica = { verzija: APP_VERZIJA, varianta: VARIANTA, stanje: function(){
  return { entries: entries, CLIENTS: CLIENTS, profili: savedProfs.map(function(p){ return p.name; }), session: session, portal: !!portalAuth, rtZivo: rtZivo }; } };
})();

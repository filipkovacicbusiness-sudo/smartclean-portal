/* SmartClean – app.js
   Vedenja prevzeta z eflitte.si: nav --nav-p, hero blur-up, data-reveal,
   drawer, drseči poudarek v navigaciji, odometer za števila, preklop teme. */
(function () {
'use strict';

/* ══ GLAVA: ozadje se zvezno pojavi glede na drsenje ══ */
(function () {
  var nav = document.getElementById('nav');
  if (!nav) return;
  function onScroll() {
    var y = window.scrollY || 0;
    nav.classList.toggle('scrolled', y > 8);
    nav.style.setProperty('--nav-p', Math.min(1, Math.max(0, y / 72)).toFixed(3));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ══ VSTOP HEROJA (blur-up) ══ */
(function () {
  function fire() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { document.body.classList.add('entered'); });
    });
  }
  if (document.readyState === 'complete') fire();
  else window.addEventListener('load', fire, { once: true });
})();

/* ══ RAZKRIVANJE OB DRSENJU ══ */
(function () {
  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (e) { e.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (ents) {
    var show = ents.filter(function (e) { return e.isIntersecting; });
    show.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
    show.forEach(function (e, i) {
      e.target.style.transitionDelay = (Math.min(i, 7) * 90) + 'ms';
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  els.forEach(function (el) { io.observe(el); });
})();

/* ══ PREDAL (mobilni meni) ══ */
(function () {
  var burger = document.querySelector('.nav-burger');
  var drawer = document.getElementById('drawer');
  if (!burger || !drawer) return;
  function close() {
    document.body.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
  }
  function open() {
    document.body.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
  }
  burger.addEventListener('click', function () {
    document.body.classList.contains('menu-open') ? close() : open();
  });
  drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 880 && document.body.classList.contains('menu-open')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) close();
  });
})();

/* ══ DRSEČI POUDAREK V NAVIGACIJI ══ */
(function () {
  var links = document.getElementById('navLinks');
  if (!links) return;
  var slider = links.querySelector('.nav-slider');
  if (!slider) return;
  var items = links.querySelectorAll('.nav-link');
  function move(el) {
    slider.style.left = el.offsetLeft + 'px';
    slider.style.width = el.offsetWidth + 'px';
    links.classList.add('slide-on');
  }
  items.forEach(function (el) {
    el.addEventListener('mouseenter', function () { move(el); });
    el.addEventListener('focus', function () { move(el); });
  });
  links.addEventListener('mouseleave', function () { links.classList.remove('slide-on'); });
})();

/* ══ ODOMETER ZA ŠTEVILA ══ */
(function () {
  var vals = document.querySelectorAll('.stat .v[data-to]');
  if (!vals.length) return;

  function build(el) {
    var pre = el.getAttribute('data-prefix') || '';
    var suf = el.getAttribute('data-suffix') || '';
    var target = String(el.getAttribute('data-to') || '');
    el.textContent = '';
    var odo = document.createElement('span');
    odo.className = 'odo';
    if (pre) {
      var p = document.createElement('span'); p.className = 'fix'; p.textContent = pre;
      odo.appendChild(p);
    }
    var cols = [];
    target.split('').forEach(function (ch) {
      if (!/[0-9]/.test(ch)) {
        var f = document.createElement('span'); f.className = 'fix'; f.textContent = ch;
        odo.appendChild(f); return;
      }
      var wrap = document.createElement('span'); wrap.className = 'odo-d';
      var col = document.createElement('span'); col.className = 'col';
      for (var i = 0; i <= 9; i++) {
        var s = document.createElement('span'); s.textContent = String(i); col.appendChild(s);
      }
      wrap.appendChild(col); odo.appendChild(wrap);
      cols.push({ col: col, digit: parseInt(ch, 10) });
    });
    if (suf) {
      var s3 = document.createElement('span'); s3.className = 'fix'; s3.textContent = suf;
      odo.appendChild(s3);
    }
    el.appendChild(odo);
    return { odo: odo, cols: cols };
  }

  var recs = [];
  vals.forEach(function (el) { recs.push({ el: el, rec: build(el), done: false }); });

  function spin(r) {
    if (r.done) return;
    r.done = true;
    r.rec.odo.classList.add('spin');
    requestAnimationFrame(function () {
      r.rec.cols.forEach(function (c, i) {
        c.col.style.transitionDelay = (i * 90) + 'ms';
        c.col.style.transform = 'translateY(' + (-c.digit) + 'em)';
      });
    });
  }

  if (!('IntersectionObserver' in window)) { recs.forEach(spin); return; }
  var io = new IntersectionObserver(function (ents) {
    ents.forEach(function (e) {
      if (!e.isIntersecting) return;
      var r = recs.find(function (x) { return x.el === e.target; });
      if (r) { spin(r); io.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  recs.forEach(function (r) { io.observe(r.el); });
})();

/* ══ FAQ ══ */
(function () {
  var items = document.querySelectorAll('.faq-item');
  if (!items.length) return;
  var activeCat = 'vse';

  items.forEach(function (item) {
    var btn = item.querySelector('.faq-q');
    var ans = item.querySelector('.faq-a');
    if (!btn || !ans) return;
    btn.addEventListener('click', function () {
      var willOpen = !item.classList.contains('open');
      items.forEach(function (o) {
        if (o !== item) {
          o.classList.remove('open');
          var oa = o.querySelector('.faq-a'); if (oa) oa.style.maxHeight = '';
          var ob = o.querySelector('.faq-q'); if (ob) ob.setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      ans.style.maxHeight = willOpen ? ans.scrollHeight + 'px' : '';
    });
  });

  function applyFilter() {
    var q = (document.getElementById('faqSearch') || {}).value || '';
    q = q.toLowerCase().trim();
    var shown = 0;
    items.forEach(function (item) {
      var cat = item.getAttribute('data-cat') || '';
      var text = item.textContent.toLowerCase();
      var ok = (activeCat === 'vse' || cat === activeCat) && (!q || text.indexOf(q) !== -1);
      item.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    var empty = document.querySelector('.faq-empty');
    if (empty) empty.style.display = shown ? 'none' : 'block';
  }

  var search = document.getElementById('faqSearch');
  if (search) search.addEventListener('input', applyFilter);
  document.querySelectorAll('.faq-cat-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.faq-cat-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      activeCat = b.getAttribute('data-cat') || 'vse';
      applyFilter();
    });
  });
})();

/* ══ OBRAZCI (web3forms) ══ */
(function () {
  document.querySelectorAll('form[data-w3f]').forEach(function (form) {
    var btn = form.querySelector('button[type=submit]');
    var okBox = document.querySelector(form.getAttribute('data-success') || '#form-success');
    var msg = form.querySelector('.form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var label = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = 'Pošiljam …'; }
      if (msg) { msg.style.display = 'none'; }
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.success) {
          form.reset();
          if (okBox) { okBox.style.display = 'block'; okBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        } else {
          if (msg) { msg.textContent = 'Pošiljanje ni uspelo. Pišite nam na info@smartcleanofficial.com'; msg.style.display = 'block'; }
        }
      }).catch(function () {
        if (msg) { msg.textContent = 'Pošiljanje ni uspelo. Pišite nam na info@smartcleanofficial.com'; msg.style.display = 'block'; }
      }).then(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
      });
    });
  });

  document.querySelectorAll('.file-label input[type=file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var t = inp.closest('.file-label').querySelector('.file-name');
      if (t) t.textContent = inp.files && inp.files[0] ? inp.files[0].name : t.getAttribute('data-default') || '';
    });
  });
})();

/* ══ PREKLOP TEME ══ */
(function () {
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  var root = document.documentElement;
  var veil = document.createElement('div');
  veil.className = 'theme-veil';
  document.body.appendChild(veil);

  btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    veil.style.background = next === 'dark' ? '#0a0a0a' : '#ffffff';
    veil.style.opacity = '1';
    setTimeout(function () {
      root.classList.add('theme-instant');
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('smartclean-theme', next); } catch (e) {}
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.remove('theme-instant');
          veil.style.opacity = '0';
        });
      });
    }, 120);
  });
})();

})();

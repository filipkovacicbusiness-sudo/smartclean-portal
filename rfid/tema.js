/* SmartClean RFID — tema pred prvim izrisom (CSP: le 'self'). */
(function () {
  try {
    var t = localStorage.getItem('sc-rfid-tema') || 'light';
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  } catch (e) {}
})();

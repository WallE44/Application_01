// Applique le thème avant l'affichage (évite un flash clair). Sombre par défaut (EXG-15).
(function () {
  var t = 'dark';
  try {
    t = localStorage.getItem('theme') || 'dark';
  } catch (e) {
    /* stockage indisponible : thème par défaut */
  }
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
})();

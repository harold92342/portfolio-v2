(function () {
  // 1. Apply theme before first paint (no flash of wrong theme)
  try {
    var savedTheme = localStorage.getItem('portfolio_theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch (_) {}

  // 2. First visit to "/" with a French browser redirects to "/fr"
  //    Shared "/fr" links always stay in French regardless of saved preference.
  try {
    var path = window.location.pathname;
    if (path === '/' || path === '') {
      var savedLang = localStorage.getItem('portfolio_lang');
      if (!savedLang) {
        var browserLang = (navigator.language || '').toLowerCase();
        if (browserLang.indexOf('fr') === 0) {
          window.location.replace('/fr' + window.location.search + window.location.hash);
        }
      }
    }
  } catch (_) {}
})();

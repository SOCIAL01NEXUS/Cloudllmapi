/* Runs before first paint (classic script, loaded in <head>) so there is no flash of the wrong theme. */
(function () {
  try {
    var saved = localStorage.getItem('nb-theme');
    var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

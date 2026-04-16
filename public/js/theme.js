/**
 * Dark/light mode toggle — persists preference in localStorage.
 */

(function () {
  'use strict';

  var toggle = document.getElementById('themeToggle');
  var root = document.documentElement;
  var stored = localStorage.getItem('theme');

  if (stored === 'light') {
    root.setAttribute('data-theme', 'light');
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var isLight = root.getAttribute('data-theme') === 'light';
      root.setAttribute('data-theme', isLight ? '' : 'light');
      localStorage.setItem('theme', isLight ? 'dark' : 'light');
    });
  }
})();

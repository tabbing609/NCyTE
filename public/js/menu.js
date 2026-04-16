/**
 * Mobile menu — hamburger toggle, close on link click.
 */

(function () {
  'use strict';

  var hamburger = document.getElementById('hamburger');
  var navLinks = document.getElementById('navLinks');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('open');
    });

    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          hamburger.classList.remove('active');
          navLinks.classList.remove('open');
        }
      });
    });
  }
})();

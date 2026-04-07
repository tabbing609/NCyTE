/**
 * Scroll animations — IntersectionObserver for fade-in + slide-up, staggered.
 */

(function () {
  'use strict';

  var els = document.querySelectorAll('.scroll-in');
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
  );

  els.forEach(function (el) {
    observer.observe(el);
  });
})();

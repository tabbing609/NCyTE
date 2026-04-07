/**
 * Main entry — contact form and other page-level behavior.
 */

(function () {
  'use strict';

  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      alert('Form submitted (placeholder — no backend).');
    });
  }
})();

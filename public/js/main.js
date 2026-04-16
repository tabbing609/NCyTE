/**
 * Main entry — contact form and other page-level behavior.
 */

(function () {
  'use strict';

  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      var name = (document.getElementById('name') && document.getElementById('name').value) || '';
      var email = (document.getElementById('email') && document.getElementById('email').value) || '';
      var message = (document.getElementById('message') && document.getElementById('message').value) || '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }
      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() })
      })
        .then(function (r) {
          return r.text().then(function (text) {
            var trimmed = (text || '').trim();
            if (trimmed.charAt(0) === '<') {
              throw new Error(
                'Contact form API is not available on this host (the server returned a web page instead of JSON). ' +
                'Run Node with serve.js behind IIS and reverse-proxy /api to it, or email support@bottleops.xyz directly.'
              );
            }
            var data = {};
            try {
              data = trimmed ? JSON.parse(trimmed) : {};
            } catch (ignore) {
              throw new Error('Unexpected server response. Try emailing support@bottleops.xyz directly.');
            }
            if (!r.ok) throw new Error((data && data.error) || 'Something went wrong.');
            return data;
          });
        })
        .then(function () {
          alert('Thanks — your message was sent. We will get back to you soon.');
          form.reset();
        })
        .catch(function (err) {
          alert(err.message || 'Could not send your message. Please try again or email support directly.');
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
          }
        });
    });
  }
})();

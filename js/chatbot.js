(function () {
  'use strict';

  var apiUrl = 'https://139.182.185.119.nip.io/';
  var widget = document.createElement('div');
  widget.className = 'chatbot-widget';
  widget.innerHTML = '' +
    '<button class="chatbot-toggle" id="chatbotToggle" aria-label="Open chatbot">💬</button>' +
    '<div class="chatbot-window" id="chatbotWindow" aria-hidden="true">' +
    '  <div class="chatbot-header">BottleOps Assistant</div>' +
    '  <div class="chatbot-messages" id="chatbotMessages">' +
    '    <div class="chatbot-message bot">Hi! I can help with orders, products, and services.</div>' +
    '  </div>' +
    '  <form class="chatbot-form" id="chatbotForm">' +
    '    <input id="chatbotInput" type="text" placeholder="Ask a question..." required />' +
    '    <button type="submit">Send</button>' +
    '  </form>' +
    '</div>';
  document.body.appendChild(widget);

  var toggle = document.getElementById('chatbotToggle');
  var windowEl = document.getElementById('chatbotWindow');
  var messagesEl = document.getElementById('chatbotMessages');
  var form = document.getElementById('chatbotForm');
  var input = document.getElementById('chatbotInput');

  function addMessage(text, role) {
    var bubble = document.createElement('div');
    bubble.className = 'chatbot-message ' + role;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var isOpen = windowEl.classList.toggle('open');
      windowEl.setAttribute('aria-hidden', String(!isOpen));
      if (isOpen) input.focus();
    });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var message = input.value.trim();
      if (!message) return;
      addMessage(message, 'user');
      input.value = '';

      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, context: 'BottleOps store customer support' })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var reply = data.reply || data.response || data.message || 'I can help with orders, checkout, and product details.';
          addMessage(reply, 'bot');
        })
        .catch(function () {
          addMessage('Sorry, the assistant is unavailable right now. Please try again shortly.', 'bot');
        });
    });
  }
})();

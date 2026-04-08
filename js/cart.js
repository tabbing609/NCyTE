/**
 * Cart functionality — in-memory state, badge, drawer, add/clear/checkout.
 */
(function () {
  'use strict';
  const cart = [];
  const cartBadge = document.getElementById('cartBadge');
  const cartNavBtn = document.getElementById('cartNavBtn');
  const cartDrawer = document.getElementById('cartDrawer');
  const cartOverlay = document.getElementById('cartOverlay');
  const cartClose = document.getElementById('cartClose');
  const cartItemsEl = document.getElementById('cartItems');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const clearCartBtn = document.getElementById('clearCartBtn');
  const checkoutModal = document.createElement('div');
  checkoutModal.className = 'checkout-modal';
  checkoutModal.setAttribute('hidden', 'hidden');
  checkoutModal.style.display = 'none';
  checkoutModal.innerHTML = '<div class="checkout-panel"><h3>Checkout</h3><form id="checkoutForm"><label>Name</label><input name="customer_name" autocomplete="name" required><label>Email</label><input type="email" name="customer_email" autocomplete="email" required><label>Shipping Address</label><textarea name="shipping_address" autocomplete="street-address" required></textarea><label>Name on Card</label><input name="card_name" autocomplete="cc-name" required><label>Card Number</label><input name="card_number" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="19" required><label>Expiry (MM/YY)</label><input name="card_expiry" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5" required><label>CVV</label><input name="card_cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" required><div class="checkout-actions"><button class="btn" type="submit">Place Order</button><button class="btn-clear" type="button" id="checkoutCancel">Cancel</button></div><p id="checkoutStatus" class="checkout-status"></p></form></div>';
  if (document.body) document.body.appendChild(checkoutModal);
  const checkoutForm = checkoutModal.querySelector('#checkoutForm');
  const checkoutCancel = checkoutModal.querySelector('#checkoutCancel');
  const checkoutStatus = checkoutModal.querySelector('#checkoutStatus');
  const stockStatusById = {};
  function applyStockStateToCards() {
    document.querySelectorAll('.product-card').forEach(function (card) {
      var id = String(card.dataset.productId || '');
      var addBtn = card.querySelector('.btn-add');
      if (!addBtn || !id || !Object.prototype.hasOwnProperty.call(stockStatusById, id)) return;
      var out = !!stockStatusById[id];
      addBtn.disabled = out;
      addBtn.textContent = out ? 'Out of Stock' : 'Add to Cart';
      addBtn.classList.toggle('added', false);
      addBtn.style.opacity = out ? '0.65' : '';
      addBtn.style.cursor = out ? 'not-allowed' : '';
    });
  }
  function syncStockState() {
    fetch('/api/products')
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        rows.forEach(function (item) {
          stockStatusById[String(item.product_id)] = !!item.out_of_stock;
        });
        applyStockStateToCards();
      })
      .catch(function () {
      });
  }
  function updateBadge() {
    if (!cartBadge) return;
    const total = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    cartBadge.textContent = total;
    cartBadge.classList.toggle('visible', total > 0);
  }
  function renderCart() {
    if (!cartItemsEl || !cartEmpty || !cartSubtotal) return;
    cartEmpty.style.display = cart.length ? 'none' : 'block';
    cartItemsEl.querySelectorAll('.cart-item').forEach(function (el) { el.remove(); });
    var total = 0;
    cart.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'cart-item';
      var lineTotal = (item.price * item.qty).toFixed(2);
      total += item.price * item.qty;
      row.innerHTML = '<span class="cart-item-name">' + item.name + '</span><span class="cart-item-qty">×' + item.qty + '</span><span class="cart-item-price">$' + lineTotal + '</span>';
      cartItemsEl.appendChild(row);
    });
    cartSubtotal.textContent = '$' + total.toFixed(2);
  }
  function openCart() {
    if (!cartDrawer || !cartOverlay) return;
    cartDrawer.classList.add('open');
    cartOverlay.classList.add('open');
    cartOverlay.setAttribute('aria-hidden', 'false');
  }
  function closeCart() {
    if (!cartDrawer || !cartOverlay) return;
    cartDrawer.classList.remove('open');
    cartOverlay.classList.remove('open');
    cartOverlay.setAttribute('aria-hidden', 'true');
  }
  document.addEventListener('click', function (e) {
    var navBtn = e.target && e.target.closest ? e.target.closest('#cartNavBtn') : null;
    if (navBtn) {
      e.preventDefault();
      openCart();
      renderCart();
    }
  });
  if (cartClose) cartClose.addEventListener('click', closeCart);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', function () {
      cart.length = 0;
      updateBadge();
      renderCart();
    });
  }
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', function () {
      if (!cart.length) {
        alert('Your cart is empty.');
        return;
      }
      if (!checkoutForm || !checkoutStatus) return;
      checkoutForm.reset();
      checkoutStatus.textContent = '';
      checkoutModal.removeAttribute('hidden');
      checkoutModal.style.display = '';
      checkoutModal.classList.add('open');
    });
  }
  if (checkoutCancel) {
    checkoutCancel.addEventListener('click', function () {
      checkoutModal.classList.remove('open');
      checkoutModal.setAttribute('hidden', 'hidden');
      checkoutModal.style.display = 'none';
    });
  }
  if (checkoutModal) {
    checkoutModal.addEventListener('click', function (e) {
      if (e.target === checkoutModal) {
        checkoutModal.classList.remove('open');
        checkoutModal.setAttribute('hidden', 'hidden');
        checkoutModal.style.display = 'none';
      }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      checkoutModal.classList.remove('open');
      checkoutModal.setAttribute('hidden', 'hidden');
      checkoutModal.style.display = 'none';
    }
  });
  if (checkoutForm) {
    var cardNumberInput = checkoutForm.querySelector('input[name="card_number"]');
    var expiryInput = checkoutForm.querySelector('input[name="card_expiry"]');
    var cvvInput = checkoutForm.querySelector('input[name="card_cvv"]');
    if (cardNumberInput) {
      cardNumberInput.addEventListener('input', function () {
        var digits = this.value.replace(/\D/g, '').slice(0, 16);
        this.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
      });
    }
    if (expiryInput) {
      expiryInput.addEventListener('input', function () {
        var digits = this.value.replace(/\D/g, '').slice(0, 4);
        if (digits.length > 2) {
          this.value = digits.slice(0, 2) + '/' + digits.slice(2);
        } else {
          this.value = digits;
        }
      });
    }
    if (cvvInput) {
      cvvInput.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '').slice(0, 4);
      });
    }
    checkoutForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const formData = new FormData(checkoutForm);
      const cardNumberDigits = String(formData.get('card_number') || '').replace(/\D/g, '');
      const cardCvvDigits = String(formData.get('card_cvv') || '').replace(/\D/g, '');
      const cardExpiry = String(formData.get('card_expiry') || '').trim();
      const cardName = String(formData.get('card_name') || '').trim();
      if (!cardName) {
        if (checkoutStatus) checkoutStatus.textContent = 'Please enter the name on card.';
        return;
      }
      if (cardNumberDigits.length < 13 || cardNumberDigits.length > 16) {
        if (checkoutStatus) checkoutStatus.textContent = 'Card number must be 13 to 16 digits.';
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        if (checkoutStatus) checkoutStatus.textContent = 'Expiry must be in MM/YY format.';
        return;
      }
      const expMonth = Number(cardExpiry.slice(0, 2));
      if (expMonth < 1 || expMonth > 12) {
        if (checkoutStatus) checkoutStatus.textContent = 'Expiry month must be between 01 and 12.';
        return;
      }
      if (cardCvvDigits.length < 3 || cardCvvDigits.length > 4) {
        if (checkoutStatus) checkoutStatus.textContent = 'CVV must be 3 or 4 digits.';
        return;
      }
      const payload = {
        customer_name: String(formData.get('customer_name') || '').trim(),
        customer_email: String(formData.get('customer_email') || '').trim(),
        shipping_address: String(formData.get('shipping_address') || '').trim(),
        payment_info: {
          card_name: cardName,
          card_number_last4: cardNumberDigits.slice(-4),
          card_expiry: cardExpiry,
          card_cvv_length: cardCvvDigits.length
        },
        items: cart.map(function (item) { return { product_id: Number(item.id), quantity: item.qty }; })
      };
      if (checkoutStatus) checkoutStatus.textContent = 'Processing order...';
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.success) throw new Error((data && data.error) || 'Order failed');
          if (checkoutStatus) checkoutStatus.textContent = 'Success! Order #' + data.order_id + ' confirmed.';
          cart.length = 0;
          updateBadge();
          renderCart();
          syncStockState();
          setTimeout(function () {
            checkoutModal.classList.remove('open');
            checkoutModal.setAttribute('hidden', 'hidden');
            checkoutModal.style.display = 'none';
            alert('Order placed successfully. Order #' + data.order_id);
          }, 900);
        })
        .catch(function (err) {
          if (checkoutStatus) checkoutStatus.textContent = err.message || 'Checkout failed.';
        });
    });
  }
  function handleAddToCart(addBtn) {
    var card = addBtn.closest('.product-card');
    if (!card) return;
    var id = card.dataset.productId;
    if (stockStatusById[String(id)]) return;
    var name = card.dataset.productName;
    var price = parseFloat(card.dataset.price, 10);
    var existing = cart.find(function (item) { return item.id === id; });
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ id: id, name: name, price: price, qty: 1 });
    }
    updateBadge();
    renderCart();
    addBtn.textContent = 'Added!';
    addBtn.classList.add('added');
    setTimeout(function () {
      addBtn.textContent = 'Add to Cart';
      addBtn.classList.remove('added');
    }, 1500);
  }
  document.addEventListener('click', function (e) {
    var addBtn = e.target && e.target.closest ? e.target.closest('.btn-add') : null;
    if (!addBtn) return;
    handleAddToCart(addBtn);
  });
  syncStockState();
})();
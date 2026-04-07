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
  checkoutModal.innerHTML = '<div class="checkout-panel"><h3>Checkout</h3><form id="checkoutForm"><label>Name</label><input name="customer_name" required><label>Email</label><input type="email" name="customer_email" required><label>Address</label><textarea name="shipping_address" required></textarea><label>Payment Info</label><input name="payment_info" placeholder="Card details" required><div class="checkout-actions"><button class="btn" type="submit">Place Order</button><button class="btn-clear" type="button" id="checkoutCancel">Cancel</button></div><p id="checkoutStatus" class="checkout-status"></p></form></div>';
  document.body.appendChild(checkoutModal);
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
    const total = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    cartBadge.textContent = total;
    cartBadge.classList.toggle('visible', total > 0);
  }
  function renderCart() {
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
    cartDrawer.classList.add('open');
    cartOverlay.classList.add('open');
    cartOverlay.setAttribute('aria-hidden', 'false');
  }
  function closeCart() {
    cartDrawer.classList.remove('open');
    cartOverlay.classList.remove('open');
    cartOverlay.setAttribute('aria-hidden', 'true');
  }
  if (cartNavBtn) {
    cartNavBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openCart();
      renderCart();
    });
  }
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
      checkoutForm.reset();
      checkoutStatus.textContent = '';
      checkoutModal.classList.add('open');
    });
  }
  if (checkoutCancel) {
    checkoutCancel.addEventListener('click', function () {
      checkoutModal.classList.remove('open');
    });
  }
  if (checkoutModal) {
    checkoutModal.addEventListener('click', function (e) {
      if (e.target === checkoutModal) checkoutModal.classList.remove('open');
    });
  }
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const formData = new FormData(checkoutForm);
      const payload = {
        customer_name: String(formData.get('customer_name') || '').trim(),
        customer_email: String(formData.get('customer_email') || '').trim(),
        shipping_address: String(formData.get('shipping_address') || '').trim(),
        payment_info: String(formData.get('payment_info') || '').trim(),
        items: cart.map(function (item) { return { product_id: Number(item.id), quantity: item.qty }; })
      };
      checkoutStatus.textContent = 'Processing order...';
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.success) throw new Error((data && data.error) || 'Order failed');
          checkoutStatus.textContent = 'Success! Order #' + data.order_id + ' confirmed.';
          cart.length = 0;
          updateBadge();
          renderCart();
          syncStockState();
          setTimeout(function () {
            checkoutModal.classList.remove('open');
            alert('Order placed successfully. Order #' + data.order_id);
          }, 900);
        })
        .catch(function (err) {
          checkoutStatus.textContent = err.message || 'Checkout failed.';
        });
    });
  }
  document.querySelectorAll('.btn-add').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = this.closest('.product-card');
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
      this.textContent = 'Added!';
      this.classList.add('added');
      var self = this;
      setTimeout(function () {
        self.textContent = 'Add to Cart';
        self.classList.remove('added');
      }, 1500);
    });
  });
  syncStockState();
})();
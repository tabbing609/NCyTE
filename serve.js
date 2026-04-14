const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT || 5500);
const HOST = process.env.HOST || '127.0.0.1';
const DIR = __dirname;
// OpenWebUI: OpenAI-compatible API (competition docs §5 — base URL + /chat/completions).
const AI_BASE_URL = String(process.env.AI_BASE_URL || 'https://ai.cyberlab.csusb.edu/api').replace(/\/$/, '');
const AI_API_URL =
  process.env.AI_API_URL || `${AI_BASE_URL}/chat/completions`;
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = String(process.env.AI_MODEL || '').trim();
const FRONTEND_ORIGINS = String(process.env.FRONTEND_ORIGINS || 'https://localhost')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 1024 * 64);

const SENSITIVE_FILES = new Set(['serve.js', 'package.json', 'package-lock.json', '.env', '.env.example', '.gitignore', 'web.config']);

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'bottleops_store',
  user: process.env.DB_USER || 'storeapp',
  password: process.env.DB_PASSWORD || '',
  ssl: String(process.env.DB_SSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined
});
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@bottleops.xyz';
const SUPPORT_EMAIL = String(process.env.SUPPORT_EMAIL || 'support@bottleops.xyz').trim();
// Default: verify TLS certs. Set SMTP_TLS_REJECT_UNAUTHORIZED=false only if the server chain
// is broken/self-signed and you cannot fix trust (prefer NODE_EXTRA_CA_CERTS or node --use-system-ca).
const SMTP_TLS_REJECT_UNAUTHORIZED =
  String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
const CHATBOT_TIMEOUT_MS = Number(process.env.CHATBOT_TIMEOUT_MS || 12000);
const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  requireTLS: SMTP_PORT !== 465,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  tls: {
    rejectUnauthorized: SMTP_TLS_REJECT_UNAUTHORIZED
  }
});

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_JSON_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function checkAuth(req) {
  if (!ADMIN_PASSWORD) return false;
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  try {
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(ADMIN_PASSWORD, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function getAllowedOrigin(req) {
  const requestOrigin = String(req.headers.origin || '').trim();
  if (!requestOrigin) return '';
  return FRONTEND_ORIGINS.includes(requestOrigin) ? requestOrigin : '';
}

function applyCors(req, res) {
  const allowedOrigin = getAllowedOrigin(req);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidText(value, min, max) {
  const v = String(value || '').trim();
  return v.length >= min && v.length <= max;
}

function isValidOrderItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) return false;
  return items.every(item => {
    const productId = Number(item && item.product_id);
    const quantity = Number(item && item.quantity);
    return Number.isInteger(productId) && productId > 0 &&
      Number.isInteger(quantity) && quantity > 0 && quantity <= 100;
  });
}

function isSensitivePath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || '').split('?')[0]).replace(/^\/+/, '');
  if (!cleanPath) return false;
  const normalized = path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fileName = path.basename(normalized).toLowerCase();
  return SENSITIVE_FILES.has(fileName);
}

const rateState = new Map();
function isRateLimited(req, routeKey, maxRequests, windowMs) {
  const now = Date.now();
  const sourceIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const key = `${routeKey}:${sourceIp}`;
  const current = rateState.get(key);
  if (!current || now > current.resetAt) {
    rateState.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > maxRequests;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, info] of rateState.entries()) {
    if (now > info.resetAt) rateState.delete(key);
  }
}, 60 * 1000).unref();

http.createServer(async (req, res) => {
  applyCors(req, res);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/products' && req.method === 'GET') {
    try {
      const result = await pool.query(`
        SELECT p.product_id, p.name, p.description, p.price, p.stock_quantity, p.sku,
               c.name as category,
               CASE WHEN p.stock_quantity <= 0 THEN true ELSE false END as out_of_stock
        FROM products p
        JOIN categories c ON p.category_id = c.category_id
        WHERE p.is_active = true
        ORDER BY p.category_id, p.product_id
      `);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error('Database error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database connection failed' }));
    }
    return;
  }

  if (req.url === '/api/categories' && req.method === 'GET') {
    try {
      const result = await pool.query('SELECT * FROM categories ORDER BY category_id');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error('Database error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database connection failed' }));
    }
    return;
  }

  if (req.url === '/api/contact' && req.method === 'POST') {
    try {
      if (isRateLimited(req, 'contact_post', 8, 10 * 60 * 1000)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many messages. Please try again in a few minutes.' }));
        return;
      }
      if (!SMTP_HOST) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Contact form is not configured (missing SMTP).' }));
        return;
      }
      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const message = String(body.message || '').trim();
      if (!isValidEmail(email) || !isValidText(name, 2, 120) || !isValidText(message, 5, 8000)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Please enter a valid name, email, and message (at least a few words).' }));
        return;
      }
      const subjectName = name.replace(/[\r\n]/g, ' ').slice(0, 80);
      await mailer.sendMail({
        from: MAIL_FROM,
        to: SUPPORT_EMAIL,
        replyTo: email,
        subject: `[BottleOps] Message from ${subjectName}`,
        text: [`From: ${name} <${email}>`, '', message].join('\n')
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error('Contact form email error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not send your message. Please try again later or email us directly.' }));
    }
    return;
  }

  if (req.url === '/api/orders' && req.method === 'POST') {
    try {
      if (isRateLimited(req, 'orders_post', 20, 60 * 1000)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests. Please try again shortly.' }));
        return;
      }
      const body = await parseBody(req);
      const { customer_email, customer_name, items, shipping_address, payment_info } = body;
      if (
        !isValidEmail(customer_email) ||
        !isValidText(customer_name, 2, 120) ||
        !isValidText(shipping_address, 5, 500) ||
        !isValidOrderItems(items)
      ) {
        throw new Error('Invalid order fields');
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let total = 0;
        for (const item of items) {
          const priceResult = await client.query(
            'SELECT price, stock_quantity, name FROM products WHERE product_id = $1',
            [item.product_id]
          );
          if (priceResult.rows.length === 0) {
            throw new Error(`Product ${item.product_id} not found`);
          }
          if (priceResult.rows[0].stock_quantity < item.quantity) {
            throw new Error(`Sorry, "${priceResult.rows[0].name}" is out of stock`);
          }
          total += priceResult.rows[0].price * item.quantity;
        }
        const orderResult = await client.query(
          `INSERT INTO orders (customer_id, total_amount, shipping_address, status)
           VALUES (NULL, $1, $2, 'pending') RETURNING order_id`,
          [total, shipping_address || `${customer_name} - ${customer_email}`]
        );
        const orderId = orderResult.rows[0].order_id;
        for (const item of items) {
          const priceResult = await client.query(
            'SELECT price FROM products WHERE product_id = $1',
            [item.product_id]
          );
          await client.query(
            `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
             VALUES ($1, $2, $3, $4)`,
            [orderId, item.product_id, item.quantity, priceResult.rows[0].price]
          );
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id = $2',
            [item.quantity, item.product_id]
          );
        }
        await client.query('COMMIT');
        const orderSummary = items.map(item => `Product ${item.product_id} x ${item.quantity}`).join('\n');
        const safePaymentHint = payment_info && typeof payment_info === 'object'
          ? `Payment: card ending in ${payment_info.card_number_last4 || '****'} (exp ${payment_info.card_expiry || 'N/A'})`
          : 'Payment: captured';
        if (SMTP_HOST) {
          try {
            await mailer.sendMail({
              from: MAIL_FROM,
              to: customer_email,
              subject: `BottleOps Order Confirmation #${orderId}`,
              text: [
                `Thanks for your order, ${customer_name}!`,
                `Order Number: ${orderId}`,
                `Shipping Address: ${shipping_address}`,
                `Order Total: $${Number(total).toFixed(2)}`,
                safePaymentHint,
                '',
                'Items:',
                orderSummary
              ].join('\n')
            });
          } catch (mailErr) {
            // Do not fail checkout if confirmation email is unavailable.
            console.warn('Order email failed:', mailErr && mailErr.message ? mailErr.message : mailErr);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, order_id: orderId, total: total }));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Order error:', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order request failed' }));
    }
    return;
  }

  if (req.url === '/api/orders' && req.method === 'GET') {
    if (isRateLimited(req, 'orders_get', 30, 60 * 1000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests. Please try again shortly.' }));
      return;
    }
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      const result = await pool.query(`
        SELECT o.order_id, o.order_date, o.status, o.total_amount, o.shipping_address,
               json_agg(json_build_object(
                 'product_name', p.name,
                 'quantity', oi.quantity,
                 'unit_price', oi.unit_price,
                 'subtotal', oi.subtotal
               )) as items
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN products p ON oi.product_id = p.product_id
        GROUP BY o.order_id
        ORDER BY o.order_date DESC
      `);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error('Database error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unable to fetch orders' }));
    }
    return;
  }

  if (req.url === '/api/chatbot' && req.method === 'POST') {
    try {
      if (isRateLimited(req, 'chatbot_post', 45, 60 * 1000)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many chatbot requests. Please slow down.' }));
        return;
      }
      if (!AI_API_KEY) {
        throw new Error('AI_API_KEY is not configured on server');
      }
      if (!AI_MODEL) {
        throw new Error('AI_MODEL is not configured on server (set the model name from your competition allowlist)');
      }
      const body = await parseBody(req);
      const message = String(body.message || '').trim();
      const context = String(body.context || '').trim();
      if (!isValidText(message, 1, 2000) || (context && !isValidText(context, 1, 3000))) {
        throw new Error('Message is required');
      }
      const messages = [];
      if (context) {
        messages.push({ role: 'system', content: context });
      }
      messages.push({ role: 'user', content: message });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CHATBOT_TIMEOUT_MS);
      const upstreamResponse = await fetch(AI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const raw = await upstreamResponse.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        data = {};
      }
      if (!upstreamResponse.ok) {
        const snippet =
          raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
        console.error(
          `Chatbot upstream failed: HTTP ${upstreamResponse.status} ${upstreamResponse.statusText}`,
          snippet ? `Response: ${snippet}` : '(empty body)'
        );
        throw new Error(`Upstream AI error (${upstreamResponse.status})`);
      }
      const reply =
        (data.choices &&
          data.choices[0] &&
          data.choices[0].message &&
          String(data.choices[0].message.content || '').trim()) ||
        (typeof data.reply === 'string' ? data.reply : '') ||
        (typeof data.response === 'string' ? data.response : '') ||
        '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply ? { reply } : data));
    } catch (err) {
      console.error('Chatbot proxy error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat service unavailable' }));
    }
    return;
  }

  if (isSensitivePath(req.url)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (path.basename(String(req.url || '')).startsWith('.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const filePath = path.join(DIR, req.url === '/' ? 'index.html' : req.url);
  if (!filePath.startsWith(DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Allowed frontend origins: ${FRONTEND_ORIGINS.join(', ') || '(none)'}`);
});
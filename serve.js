const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const PORT = 5500;
const HOST = '127.0.0.1';
const DIR = __dirname;

const ADMIN_PASSWORD = 'Le06PkrDCgF$K&kW';
const SENSITIVE_FILES = new Set(['serve.js', 'package.json', 'package-lock.json', '.env', '.gitignore', 'web.config']);

const pool = new Pool({
  host: '10.0.1.200',
  port: 5432,
  database: 'bottleops_store',
  user: 'storeapp',
  password: '!zXWhM%9HWNh$z1g'
});
const SMTP_HOST = process.env.SMTP_HOST || '192.168.1.105';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@bottleops.xyz';
const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  requireTLS: true,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
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
    req.on('data', chunk => body += chunk);
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
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  return token === ADMIN_PASSWORD;
}

function isSensitivePath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || '').split('?')[0]).replace(/^\/+/, '');
  if (!cleanPath) return false;
  const normalized = path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fileName = path.basename(normalized).toLowerCase();
  return SENSITIVE_FILES.has(fileName);
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

  if (req.url === '/api/orders' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { customer_email, customer_name, items, shipping_address, payment_info } = body;
      if (!customer_email || !customer_name || !shipping_address || !Array.isArray(items) || !items.length) {
        throw new Error('Missing required order fields');
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
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.url === '/api/orders' && req.method === 'GET') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized. Admin password required.' }));
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
      res.end(JSON.stringify({ error: 'Database query failed' }));
    }
    return;
  }

  if (isSensitivePath(req.url)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let filePath = path.join(DIR, req.url === '/' ? 'index.html' : req.url);
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
});
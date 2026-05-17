const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const serverless = require('serverless-http');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

let db = null;
let security = null;
let notificationService = null;
let alipayConfig = null;
let alipaySdk = null;
let AlipaySdk = null;
let AlipayFormData = null;

try {
  const Database = require('../database');
  db = new Database();
} catch(e) {
  console.error('database load failed:', e.message);
}

try {
  security = require('../security');
} catch(e) {
  console.error('security load failed:', e.message);
}

try {
  notificationService = require('../notification-service');
} catch(e) {
  console.error('notification-service load failed:', e.message);
}

try {
  alipayConfig = require('../alipay-config');
  if (alipayConfig && alipayConfig.enabled) {
    AlipaySdk = require('alipay-sdk').default;
    AlipayFormData = require('alipay-sdk/lib/form').default;
    alipaySdk = new AlipaySdk({
      appId: alipayConfig.appId,
      privateKey: alipayConfig.privateKey,
      alipayPublicKey: alipayConfig.alipayPublicKey,
      gateway: alipayConfig.gateway,
      signType: alipayConfig.signType,
      charset: alipayConfig.charset
    });
  }
} catch(e) {
  console.error('alipay load failed:', e.message);
  alipayConfig = { enabled: false };
}

const smsCodes = new Map();

function generateSmsCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: !!db });
});

if (db) {
  app.get('/api/products', (req, res) => {
    try { res.json(db.getProducts()); }
    catch(e) { res.json([]); }
  });

  app.get('/api/products/:id', (req, res) => {
    try {
      const product = db.getProducts().find(p => p.id === req.params.id);
      product ? res.json(product) : res.status(404).json({ error: 'Product not found' });
    } catch(e) { res.status(404).json({ error: 'Product not found' }); }
  });

  app.post('/api/products', (req, res) => {
    try {
      const product = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
      const products = db.getProducts();
      products.push(product);
      db.saveProducts(products);
      res.json(product);
    } catch(e) { res.status(500).json({ error: '保存失败' }); }
  });

  app.put('/api/products/:id', (req, res) => {
    try { db.updateItem('products.json', req.params.id, req.body); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: '更新失败' }); }
  });

  app.delete('/api/products/:id', (req, res) => {
    try { db.deleteItem('products.json', req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: '删除失败' }); }
  });

  app.get('/api/orders', (req, res) => {
    try { res.json(db.getOrders()); }
    catch(e) { res.json([]); }
  });

  app.get('/api/orders/:id', (req, res) => {
    try {
      const order = db.getOrders().find(o => o.id === req.params.id || o.outTradeNo === req.params.id);
      order ? res.json(order) : res.status(404).json({ error: '订单不存在' });
    } catch(e) { res.status(404).json({ error: '订单不存在' }); }
  });

  app.post('/api/orders', (req, res) => {
    try {
      const order = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString(), status: 'pending' };
      const orders = db.getOrders();
      orders.push(order);
      db.saveOrders(orders);
      res.json(order);
    } catch(e) { res.status(500).json({ error: '创建订单失败' }); }
  });

  app.put('/api/orders/:id', (req, res) => {
    try {
      const orders = db.getOrders();
      const existing = orders.find(o => o.id === req.params.id);
      if (!existing) return res.status(404).json({ error: '订单不存在' });
      db.updateItem('orders.json', req.params.id, { ...existing, ...req.body });
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: '更新订单失败' }); }
  });

  app.delete('/api/orders/:id', (req, res) => {
    try { db.deleteItem('orders.json', req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: '删除失败' }); }
  });

  app.post('/api/orders/:id/confirm-payment', (req, res) => {
    try {
      const { transactionNo, paymentMethod, screenshot } = req.body;
      if (!transactionNo) return res.status(400).json({ error: '请输入交易号' });
      const orders = db.getOrders();
      const idx = orders.findIndex(o => o.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: '订单不存在' });
      orders[idx] = { ...orders[idx], status: 'payment_pending', paymentStatus: 'pending_confirmation', paymentMethod, paymentType: 'manual', transactionNo, paymentScreenshot: screenshot, paymentSubmittedAt: new Date().toISOString() };
      db.saveOrders(orders);
      res.json({ success: true, message: '支付确认已提交' });
    } catch(e) { res.status(500).json({ error: '提交失败' }); }
  });

  app.post('/api/orders/:id/verify-payment', (req, res) => {
    try {
      const { verified, note } = req.body;
      const orders = db.getOrders();
      const idx = orders.findIndex(o => o.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: '订单不存在' });
      orders[idx] = { ...orders[idx], status: verified ? 'paid' : 'pending', paymentStatus: verified ? 'confirmed' : 'payment_rejected', paymentVerifiedAt: new Date().toISOString(), paymentVerifiedNote: note };
      db.saveOrders(orders);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: '验证失败' }); }
  });

  app.post('/api/orders/:id/cancel', (req, res) => {
    try {
      const orders = db.getOrders();
      const idx = orders.findIndex(o => o.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: '订单不存在' });
      orders[idx] = { ...orders[idx], status: 'cancelled', cancelledAt: new Date().toISOString() };
      db.saveOrders(orders);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: '取消失败' }); }
  });

  app.post('/api/orders/:id/ship', (req, res) => {
    try {
      const { trackingNo, shippingCompany } = req.body;
      const orders = db.getOrders();
      const idx = orders.findIndex(o => o.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: '订单不存在' });
      orders[idx] = { ...orders[idx], status: 'shipped', trackingNo, shippingCompany, shippedAt: new Date().toISOString() };
      db.saveOrders(orders);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: '发货失败' }); }
  });

  app.get('/api/refunds', (req, res) => {
    try { res.json(db.getRefunds()); }
    catch(e) { res.json([]); }
  });

  app.post('/api/refunds', (req, res) => {
    try {
      const refund = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString(), status: 'pending' };
      const refunds = db.getRefunds();
      refunds.push(refund);
      db.saveRefunds(refunds);
      res.json(refund);
    } catch(e) { res.status(500).json({ error: '创建退款失败' }); }
  });

  app.put('/api/refunds/:id', (req, res) => {
    try {
      const refunds = db.getRefunds();
      const existing = refunds.find(r => r.id === req.params.id);
      if (!existing) return res.status(404).json({ error: '退款不存在' });
      db.updateItem('refunds.json', req.params.id, { ...existing, ...req.body });
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: '更新退款失败' }); }
  });

  app.delete('/api/refunds/:id', (req, res) => {
    try { db.deleteItem('refunds.json', req.params.id); res.json({ success: true }); }
    catch(e) { res.status(500).json({ error: '删除失败' }); }
  });

  app.post('/api/alipay/create', async (req, res) => {
    try {
      const { orderId, totalAmount, subject, body } = req.body;
      if (!orderId || !totalAmount || !subject) return res.status(400).json({ error: '缺少必要参数' });
      if (!alipayConfig || !alipayConfig.enabled || !alipaySdk) {
        return res.status(500).json({ success: false, error: '支付宝支付暂时不可用' });
      }
      const outTradeNo = `KZ${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const formData = new AlipayFormData();
      formData.setMethod('get');
      formData.addField('bizContent', { outTradeNo, productCode: 'FAST_INSTANT_TRADE_PAY', totalAmount: parseFloat(totalAmount).toFixed(2), subject, body: body || subject });
      formData.addField('returnUrl', alipayConfig.returnUrl);
      formData.addField('notifyUrl', alipayConfig.notifyUrl);
      const result = await alipaySdk.pageExec('alipay.trade.page.pay', {}, formData);
      const orders = db.getOrders();
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) { orders[idx] = { ...orders[idx], outTradeNo, paymentStatus: 'pending', paymentMethod: 'alipay' }; db.saveOrders(orders); }
      res.json({ success: true, payUrl: result, outTradeNo });
    } catch(e) { res.status(500).json({ success: false, error: '创建支付订单失败', details: e.message }); }
  });

  app.get('/api/alipay/status/:orderId', (req, res) => {
    try {
      const order = db.getOrders().find(o => o.id === req.params.orderId || o.outTradeNo === req.params.orderId);
      if (!order) return res.status(404).json({ error: '订单不存在' });
      res.json({ success: true, paymentStatus: order.paymentStatus || 'pending', orderStatus: order.status });
    } catch(e) { res.status(500).json({ error: '查询失败' }); }
  });

  app.post('/api/alipay/notify', (req, res) => {
    try {
      const { trade_status, out_trade_no, trade_no } = req.body;
      if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
        const orders = db.getOrders();
        const idx = orders.findIndex(o => o.outTradeNo === out_trade_no);
        if (idx !== -1) { orders[idx] = { ...orders[idx], status: 'paid', paymentStatus: 'success', paidAt: new Date().toISOString(), alipayTradeNo: trade_no }; db.saveOrders(orders); }
      }
      res.send('success');
    } catch(e) { res.send('fail'); }
  });

  app.post('/api/sms/send', async (req, res) => {
    try {
      const { phone, type, email } = req.body;
      if (!phone && !email) return res.status(400).json({ error: '请输入电话号码或邮箱' });
      const identifier = phone || email;
      const existing = smsCodes.get(identifier);
      if (existing && Date.now() - existing.sentAt < 60000) return res.status(429).json({ error: '请求过于频繁' });
      const code = generateSmsCode();
      smsCodes.set(identifier, { code, sentAt: Date.now(), type: type || 'login' });
      setTimeout(() => smsCodes.delete(identifier), 300000);
      if (notificationService && email) {
        try { await notificationService.sendVerificationCodeByEmail(email, code, type); } catch(e) {}
      }
      res.json({ success: true, message: '验证码已发送', code });
    } catch(e) { res.status(500).json({ error: '发送验证码失败' }); }
  });

  app.post('/api/sms/verify', (req, res) => {
    try {
      const { phone, email, code } = req.body;
      const identifier = phone || email;
      if (!identifier || !code) return res.status(400).json({ error: '请输入完整信息' });
      const stored = smsCodes.get(identifier);
      if (!stored) return res.status(400).json({ error: '验证码已过期' });
      if (stored.code !== code) return res.status(400).json({ error: '验证码错误' });
      smsCodes.delete(identifier);
      res.json({ success: true, message: '验证成功' });
    } catch(e) { res.status(500).json({ error: '验证失败' }); }
  });

  app.post('/api/check-email', (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: '请输入邮箱' });
      res.json({ exists: db.getUsers().some(u => u.email === email) });
    } catch(e) { res.status(500).json({ error: '检查失败' }); }
  });

  app.post('/api/check-phone', (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone || !/^1\d{10}$/.test(phone)) return res.status(400).json({ error: '请输入正确的11位手机号' });
      res.json({ exists: !!db.getUsers().find(u => u.phone === phone) });
    } catch(e) { res.status(500).json({ error: '检查失败' }); }
  });

  app.post('/api/check-user', (req, res) => {
    try {
      const { phone, email, username } = req.body;
      const users = db.getUsers();
      let found = null;
      if (phone) found = users.find(u => u.phone === phone);
      else if (email) found = users.find(u => u.email === email);
      else if (username) found = users.find(u => u.username === username);
      res.json({ exists: !!found, hasEmail: !!found?.email, hasPhone: !!found?.phone });
    } catch(e) { res.status(500).json({ exists: false }); }
  });

  app.post('/api/register', async (req, res) => {
    try {
      const { email, phone, password, code } = req.body;
      const users = db.getUsers();
      const sEmail = security ? security.sanitizeInput(email) : email;
      const sPhone = security ? security.sanitizeInput(phone) : phone;
      const sPass = security ? security.sanitizeInput(password) : password;
      if (!sPhone) return res.status(400).json({ error: '请输入手机号' });
      if (!sPass || sPass.length < 4) return res.status(400).json({ error: '密码至少4位' });
      const identifier = sEmail || sPhone;
      if (code) {
        const stored = smsCodes.get(identifier);
        if (!stored || stored.code !== code) return res.status(400).json({ error: '验证码错误' });
        smsCodes.delete(identifier);
      }
      if (users.find(u => u.phone === sPhone)) return res.status(400).json({ error: '手机号已注册' });
      if (sEmail && users.find(u => u.email === sEmail)) return res.status(400).json({ error: '邮箱已注册' });
      const hashed = security ? await security.hashPassword(sPass) : sPass;
      const newUser = { id: uuidv4(), username: sEmail || sPhone, password: hashed, email: sEmail || '', phone: sPhone || '', role: 'user', createdAt: new Date().toISOString(), loginHistory: [] };
      users.push(newUser);
      db.saveUsers(users);
      res.json({ user: { ...newUser, password: undefined }, token: 'demo-token' });
    } catch(e) { res.status(500).json({ error: '注册失败' }); }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const { username, password, loginType } = req.body;
      const users = db.getUsers();
      const sUser = security ? security.sanitizeInput(username) : username;
      const sPass = security ? security.sanitizeInput(password) : password;
      if (!sUser || !sPass) return res.status(400).json({ error: '请输入账号和密码' });
      let user;
      if (loginType === 'phone') user = users.find(u => u.phone === sUser);
      else user = users.find(u => u.email === sUser);
      if (!user) return res.status(401).json({ error: '账号或密码错误' });
      let valid = false;
      if (user.password && user.password.startsWith('$2') && security) valid = await security.verifyPassword(sPass, user.password);
      else valid = sPass === user.password;
      if (!valid) return res.status(401).json({ error: '账号或密码错误' });
      res.json({ user: { ...user, password: undefined }, token: 'demo-token' });
    } catch(e) { res.status(500).json({ error: '登录失败' }); }
  });

  app.post('/api/auto-login', (req, res) => {
    res.json({ success: false });
  });

  app.post('/api/forgot-password', (req, res) => {
    try {
      const { type, email, orderNo } = req.body;
      const users = db.getUsers();
      if (type === 'email') {
        if (!email) return res.status(400).json({ error: '请输入邮箱' });
        const user = users.find(u => u.email === email);
        if (!user) return res.status(404).json({ error: '该邮箱未注册' });
        res.json({ password: user.password });
      } else if (type === 'order') {
        if (!orderNo) return res.status(400).json({ error: '请输入订单号' });
        const order = db.getOrders().find(o => o.alipayTradeNo === orderNo || o.id === orderNo);
        if (!order) return res.status(404).json({ error: '未找到订单' });
        const user = users.find(u => u.phone === (order.userPhone || order.phone) || u.id === order.userId);
        if (!user) return res.status(404).json({ error: '未找到关联账号' });
        res.json({ phone: user.phone, password: user.password });
      } else { res.status(400).json({ error: '无效的找回方式' }); }
    } catch(e) { res.status(500).json({ error: '找回密码失败' }); }
  });

  app.get('/api/login-history', (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: '缺少用户ID' });
      const user = db.getUsers().find(u => u.id === userId);
      if (!user) return res.status(404).json({ error: '用户不存在' });
      res.json({ loginHistory: user.loginHistory || [], lastLoginAt: user.lastLoginAt || null });
    } catch(e) { res.status(500).json({ error: '获取失败' }); }
  });
} else {
  app.get('/api/products', (req, res) => res.json([]));
  app.get('/api/orders', (req, res) => res.json([]));
  app.get('/api/refunds', (req, res) => res.json([]));
  app.post('/api/register', (req, res) => res.status(503).json({ error: '数据库不可用' }));
  app.post('/api/login', (req, res) => res.status(503).json({ error: '数据库不可用' }));
}

module.exports = serverless(app);

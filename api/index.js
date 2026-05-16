const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const serverless = require('serverless-http');

require('dotenv').config();

const app = express();

let alipaySdk = null;
let AlipaySdk = null;
let AlipayFormData = null;

let config, db, notificationService, security, appleShortcuts, alipayConfig;

try { config = require('../config'); } catch(e) { config = { server: { port: 9999 } }; }
try { db = require('../database'); } catch(e) { console.error('database module load failed:', e.message); }
try { notificationService = require('../notification-service'); } catch(e) { console.error('notification-service load failed:', e.message); }
try { security = require('../security'); } catch(e) { console.error('security module load failed:', e.message); }
try { appleShortcuts = require('../apple-shortcuts'); } catch(e) { console.error('apple-shortcuts load failed:', e.message); }
try { alipayConfig = require('../alipay-config'); } catch(e) { console.error('alipay-config load failed:', e.message); alipayConfig = { enabled: false }; }

function initAlipaySdk() {
  if (!alipayConfig || !alipayConfig.enabled) return null;
  try {
    if (!AlipaySdk) {
      AlipaySdk = require('alipay-sdk').default;
      AlipayFormData = require('alipay-sdk/lib/form').default;
    }
    const sdk = new AlipaySdk({
      appId: alipayConfig.appId,
      privateKey: alipayConfig.privateKey,
      alipayPublicKey: alipayConfig.alipayPublicKey,
      gateway: alipayConfig.gateway,
      signType: alipayConfig.signType,
      charset: alipayConfig.charset
    });
    return sdk;
  } catch (error) {
    console.error('Alipay SDK init failed:', error.message);
    return null;
  }
}

if (alipayConfig && alipayConfig.enabled) {
  alipaySdk = initAlipaySdk();
}

app.use(cors());
app.use(bodyParser.json({ limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..')));

if (security) {
  app.use((req, res, next) => {
    try {
      const suspicious = security.isSuspiciousRequest(req);
      if (suspicious && suspicious.suspicious) {
        return res.status(403).json({ error: '请求被拒绝' });
      }
      if (security.setSecurityHeaders) security.setSecurityHeaders(res);
    } catch(e) {}
    next();
  });
}

let smsCodes = new Map();
let currentUser = null;

function generateSmsCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

if (appleShortcuts && db) {
  try { appleShortcuts.registerShortcutsRoutes(app, db); } catch(e) { console.error('apple shortcuts register failed:', e.message); }
}

async function sendVerificationCode(phone, code, type, email) {
  if (!email) throw new Error('必须提供邮箱地址');
  if (!notificationService) throw new Error('通知服务不可用');
  const result = await notificationService.sendVerificationCodeByEmail(email, code, type);
  if (result && result.success) {
    return { success: true, message: '验证码已发送到您的邮箱！', via: 'email' };
  }
  throw new Error('验证码发送失败');
}

app.get('/', (req, res) => { res.redirect('/shop'); });
app.get('/shop', (req, res) => { res.sendFile(path.join(__dirname, '..', 'shop.html')); });
app.get('/customize', (req, res) => { res.sendFile(path.join(__dirname, '..', 'customize.html')); });
app.get('/chat', (req, res) => { res.sendFile(path.join(__dirname, '..', 'chat.html')); });
app.get('/auth', (req, res) => { res.sendFile(path.join(__dirname, '..', 'auth.html')); });
app.get('/product/:id', (req, res) => { res.sendFile(path.join(__dirname, '..', 'product-detail.html')); });
app.get('/cart', (req, res) => { res.sendFile(path.join(__dirname, '..', 'cart.html')); });
app.get('/checkout', (req, res) => { res.sendFile(path.join(__dirname, '..', 'checkout.html')); });
app.get('/my-orders', (req, res) => { res.sendFile(path.join(__dirname, '..', 'my-orders.html')); });
app.get('/orders', (req, res) => { res.sendFile(path.join(__dirname, '..', 'my-orders.html')); });
app.get('/payment-success', (req, res) => { res.sendFile(path.join(__dirname, '..', 'payment-success.html')); });
app.get('/manual-payment', (req, res) => { res.sendFile(path.join(__dirname, '..', 'manual-payment.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '..', 'admin-shop.html')); });
app.get('/contact-us', (req, res) => { res.sendFile(path.join(__dirname, '..', 'contact-us.html')); });
app.get('/user-center', (req, res) => { res.sendFile(path.join(__dirname, '..', 'user-center.html')); });
app.get('/test-payment', (req, res) => { res.sendFile(path.join(__dirname, '..', 'test-payment.html')); });

if (db) {
  app.get('/api/products', (req, res) => { res.json(db.getProducts()); });

  app.get('/api/products/:id', (req, res) => {
    const products = db.getProducts();
    const product = products.find(p => p.id === req.params.id);
    if (product) res.json(product);
    else res.status(404).json({ error: 'Product not found' });
  });

  app.post('/api/products', (req, res) => {
    const product = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    const products = db.getProducts();
    products.push(product);
    db.saveProducts(products);
    res.json(product);
  });

  app.put('/api/products/:id', (req, res) => {
    db.updateItem('products.json', req.params.id, req.body);
    res.json({ success: true });
  });

  app.delete('/api/products/:id', (req, res) => {
    db.deleteItem('products.json', req.params.id);
    res.json({ success: true });
  });

  app.get('/api/orders', (req, res) => { res.json(db.getOrders()); });

  app.get('/api/orders/:id', (req, res) => {
    const orders = db.getOrders();
    const order = orders.find(o => o.id === req.params.id || o.outTradeNo === req.params.id);
    if (order) res.json(order);
    else res.status(404).json({ error: '订单不存在' });
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const order = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString(), status: 'pending' };
      const orders = db.getOrders();
      orders.push(order);
      db.saveOrders(orders);
      if (notificationService) {
        const users = db.getUsers();
        const user = users.find(u => u.id === order.userId || u.phone === order.userPhone);
        if (user) {
          try { await notificationService.sendOrderNotification(order, 'created', user.email, user.phone); } catch(e) {}
        }
      }
      res.json(order);
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: '创建订单失败' });
    }
  });

  app.put('/api/orders/:id', async (req, res) => {
    try {
      const orderId = req.params.id;
      const updateData = req.body;
      const orders = db.getOrders();
      const existingOrder = orders.find(o => o.id === orderId);
      if (!existingOrder) return res.status(404).json({ error: '订单不存在' });
      const updatedOrder = { ...existingOrder, ...updateData };
      db.updateItem('orders.json', orderId, updatedOrder);
      if (updateData.status && updateData.status !== existingOrder.status && notificationService) {
        const users = db.getUsers();
        const user = users.find(u => u.id === updatedOrder.userId || u.phone === updatedOrder.userPhone);
        if (user) {
          try { await notificationService.sendOrderNotification(updatedOrder, updateData.status, user.email, user.phone); } catch(e) {}
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating order:', error);
      res.status(500).json({ error: '更新订单失败' });
    }
  });

  app.delete('/api/orders/:id', (req, res) => {
    db.deleteItem('orders.json', req.params.id);
    res.json({ success: true });
  });

  app.post('/api/orders/:id/confirm-payment', async (req, res) => {
    try {
      const orderId = req.params.id;
      const { transactionNo, paymentMethod, screenshot } = req.body;
      if (!transactionNo) return res.status(400).json({ error: '请输入交易号' });
      const orders = db.getOrders();
      const orderIndex = orders.findIndex(o => o.id === orderId);
      if (orderIndex === -1) return res.status(404).json({ error: '订单不存在' });
      orders[orderIndex] = {
        ...orders[orderIndex],
        status: 'payment_pending',
        paymentStatus: 'pending_confirmation',
        paymentMethod: paymentMethod,
        paymentType: 'manual',
        transactionNo: transactionNo,
        paymentScreenshot: screenshot,
        paymentSubmittedAt: new Date().toISOString()
      };
      db.saveOrders(orders);
      if (notificationService) {
        const users = db.getUsers();
        const admins = users.filter(u => u.isAdmin);
        for (const admin of admins) {
          if (admin.email) {
            try { await notificationService.sendOrderNotification(orders[orderIndex], 'payment_pending', admin.email, admin.phone); } catch(e) {}
          }
        }
      }
      res.json({ success: true, message: '支付确认已提交，等待审核' });
    } catch (error) {
      console.error('Error confirming payment:', error);
      res.status(500).json({ error: '提交失败' });
    }
  });

  app.post('/api/orders/:id/verify-payment', async (req, res) => {
    try {
      const orderId = req.params.id;
      const { verified, note } = req.body;
      const orders = db.getOrders();
      const orderIndex = orders.findIndex(o => o.id === orderId);
      if (orderIndex === -1) return res.status(404).json({ error: '订单不存在' });
      if (verified) {
        orders[orderIndex] = { ...orders[orderIndex], status: 'paid', paymentStatus: 'confirmed', paymentVerifiedAt: new Date().toISOString(), paymentVerifiedNote: note };
      } else {
        orders[orderIndex] = { ...orders[orderIndex], status: 'pending', paymentStatus: 'payment_rejected', paymentVerifiedAt: new Date().toISOString(), paymentVerifiedNote: note };
      }
      db.saveOrders(orders);
      if (notificationService) {
        const users = db.getUsers();
        const user = users.find(u => u.id === orders[orderIndex].userId);
        if (user && user.email) {
          try { await notificationService.sendOrderNotification(orders[orderIndex], verified ? 'paid' : 'payment_rejected', user.email, user.phone); } catch(e) {}
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ error: '验证失败' });
    }
  });

  app.post('/api/orders/:id/cancel', async (req, res) => {
    try {
      const orderId = req.params.id;
      const orders = db.getOrders();
      const orderIndex = orders.findIndex(o => o.id === orderId);
      if (orderIndex === -1) return res.status(404).json({ error: '订单不存在' });
      orders[orderIndex] = { ...orders[orderIndex], status: 'cancelled', cancelledAt: new Date().toISOString() };
      db.saveOrders(orders);
      res.json({ success: true });
    } catch (error) {
      console.error('Error cancelling order:', error);
      res.status(500).json({ error: '取消失败' });
    }
  });

  app.post('/api/orders/:id/ship', async (req, res) => {
    try {
      const orderId = req.params.id;
      const { trackingNo, shippingCompany } = req.body;
      const orders = db.getOrders();
      const orderIndex = orders.findIndex(o => o.id === orderId);
      if (orderIndex === -1) return res.status(404).json({ error: '订单不存在' });
      orders[orderIndex] = { ...orders[orderIndex], status: 'shipped', trackingNo, shippingCompany, shippedAt: new Date().toISOString() };
      db.saveOrders(orders);
      if (notificationService) {
        const users = db.getUsers();
        const user = users.find(u => u.id === orders[orderIndex].userId);
        if (user && user.email) {
          try { await notificationService.sendOrderNotification(orders[orderIndex], 'shipped', user.email, user.phone); } catch(e) {}
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error shipping order:', error);
      res.status(500).json({ error: '发货失败' });
    }
  });

  app.get('/api/refunds', (req, res) => { res.json(db.getRefunds()); });

  app.post('/api/refunds', async (req, res) => {
    try {
      const refund = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString(), status: 'pending' };
      const refunds = db.getRefunds();
      refunds.push(refund);
      db.saveRefunds(refunds);
      if (notificationService) {
        const users = db.getUsers();
        const user = users.find(u => u.id === refund.userId || u.phone === refund.userPhone);
        if (user) {
          try { await notificationService.sendRefundNotification(refund, user.email, user.phone); } catch(e) {}
        }
      }
      res.json(refund);
    } catch (error) {
      console.error('Error creating refund:', error);
      res.status(500).json({ error: '创建退款失败' });
    }
  });

  app.put('/api/refunds/:id', async (req, res) => {
    try {
      const refundId = req.params.id;
      const updateData = req.body;
      const refunds = db.getRefunds();
      const existingRefund = refunds.find(r => r.id === refundId);
      if (!existingRefund) return res.status(404).json({ error: '退款不存在' });
      const updatedRefund = { ...existingRefund, ...updateData };
      db.updateItem('refunds.json', refundId, updatedRefund);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating refund:', error);
      res.status(500).json({ error: '更新退款失败' });
    }
  });

  app.delete('/api/refunds/:id', (req, res) => {
    db.deleteItem('refunds.json', req.params.id);
    res.json({ success: true });
  });

  app.post('/api/alipay/create', async (req, res) => {
    try {
      const { orderId, totalAmount, subject, body } = req.body;
      if (!orderId || !totalAmount || !subject) return res.status(400).json({ error: '缺少必要参数' });
      const outTradeNo = `KZ${Date.now()}${Math.floor(Math.random() * 1000)}`;
      if (!alipaySdk) alipaySdk = initAlipaySdk();
      if (!alipayConfig || !alipayConfig.enabled || !alipaySdk) {
        return res.status(500).json({ success: false, error: '支付宝支付暂时不可用' });
      }
      const formData = new AlipayFormData();
      formData.setMethod('get');
      formData.addField('bizContent', {
        outTradeNo: outTradeNo,
        productCode: 'FAST_INSTANT_TRADE_PAY',
        totalAmount: parseFloat(totalAmount).toFixed(2),
        subject: subject,
        body: body || subject
      });
      formData.addField('returnUrl', alipayConfig.returnUrl);
      formData.addField('notifyUrl', alipayConfig.notifyUrl);
      const result = await alipaySdk.pageExec('alipay.trade.page.pay', {}, formData);
      const orders = db.getOrders();
      const orderIndex = orders.findIndex(o => o.id === orderId);
      if (orderIndex !== -1) {
        orders[orderIndex] = { ...orders[orderIndex], outTradeNo: outTradeNo, paymentStatus: 'pending', paymentMethod: 'alipay' };
        db.saveOrders(orders);
      }
      res.json({ success: true, payUrl: result, outTradeNo: outTradeNo });
    } catch (error) {
      console.error('Alipay create error:', error);
      res.status(500).json({ success: false, error: '创建支付订单失败', details: error.message });
    }
  });

  app.get('/api/alipay/status/:orderId', async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const orders = db.getOrders();
      const order = orders.find(o => o.id === orderId || o.outTradeNo === orderId);
      if (!order) return res.status(404).json({ error: '订单不存在' });
      res.json({ success: true, paymentStatus: order.paymentStatus || 'pending', orderStatus: order.status, paidAt: order.paidAt, alipayTradeNo: order.alipayTradeNo });
    } catch (error) {
      console.error('Alipay status error:', error);
      res.status(500).json({ error: '查询失败' });
    }
  });

  app.post('/api/alipay/notify', async (req, res) => {
    try {
      const { trade_status, out_trade_no, trade_no } = req.body;
      if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
        const orders = db.getOrders();
        const orderIndex = orders.findIndex(o => o.outTradeNo === out_trade_no);
        if (orderIndex !== -1) {
          orders[orderIndex] = { ...orders[orderIndex], status: 'paid', paymentStatus: 'success', paidAt: new Date().toISOString(), alipayTradeNo: trade_no };
          db.saveOrders(orders);
        }
      }
      res.send('success');
    } catch (error) {
      console.error('Alipay notify error:', error);
      res.send('fail');
    }
  });

  app.post('/api/sms/send', async (req, res) => {
    try {
      const { phone, type, email } = req.body;
      if (!phone && !email) return res.status(400).json({ error: '请输入电话号码或邮箱' });
      const identifier = phone || email;
      const existingCode = smsCodes.get(identifier);
      if (existingCode && Date.now() - existingCode.sentAt < 60000) return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      const code = generateSmsCode();
      smsCodes.set(identifier, { code, sentAt: Date.now(), type: type || 'login', via: email ? 'email' : 'phone' });
      setTimeout(() => { smsCodes.delete(identifier); }, 300000);
      const smsResult = await sendVerificationCode(phone, code, type, email);
      if (smsResult.success) {
        res.json({ success: true, message: smsResult.message || '验证码已发送', code: smsResult.code, via: smsResult.via });
      } else {
        res.status(500).json({ error: smsResult.message || '发送失败' });
      }
    } catch (error) {
      console.error('Error sending verification code:', error);
      res.status(500).json({ error: '发送验证码失败' });
    }
  });

  app.post('/api/sms/verify', (req, res) => {
    try {
      const { phone, email, code } = req.body;
      const identifier = phone || email;
      if (!identifier || !code) return res.status(400).json({ error: '请输入完整信息' });
      const storedCode = smsCodes.get(identifier);
      if (!storedCode) return res.status(400).json({ error: '验证码已过期' });
      if (storedCode.code !== code) return res.status(400).json({ error: '验证码错误' });
      smsCodes.delete(identifier);
      res.json({ success: true, message: '验证成功' });
    } catch (error) {
      console.error('Error verifying SMS:', error);
      res.status(500).json({ error: '验证失败' });
    }
  });

  app.post('/api/check-email', (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: '请输入邮箱' });
      const users = db.getUsers();
      const exists = users.some(user => user.email === email);
      res.json({ exists });
    } catch (error) {
      console.error('Error checking email:', error);
      res.status(500).json({ error: '检查失败' });
    }
  });

  app.post('/api/check-phone', (req, res) => {
    try {
      const { phone } = req.body;
      const users = db.getUsers();
      const phoneRegex = /^1\d{10}$/;
      if (!phone || !phoneRegex.test(phone)) return res.status(400).json({ error: '请输入正确的11位手机号', exists: false });
      const user = users.find(u => u.phone === phone);
      res.json({ exists: !!user });
    } catch (error) {
      console.error('Error checking phone:', error);
      res.status(500).json({ error: '检查失败' });
    }
  });

  app.post('/api/check-user', (req, res) => {
    try {
      const { phone, email, username } = req.body;
      const users = db.getUsers();
      let foundUser = null;
      if (phone) foundUser = users.find(u => u.phone === phone);
      else if (email) foundUser = users.find(u => u.email === email);
      else if (username) foundUser = users.find(u => u.username === username);
      res.json({ exists: !!foundUser, hasEmail: foundUser ? !!foundUser.email : false, hasPhone: foundUser ? !!foundUser.phone : false });
    } catch (error) {
      console.error('Error checking user:', error);
      res.status(500).json({ exists: false });
    }
  });

  app.post('/api/register', async (req, res) => {
    try {
      const { email, phone, password, code } = req.body;
      const users = db.getUsers();
      const safeEmail = security ? security.sanitizeInput(email) : email;
      const safePhone = security ? security.sanitizeInput(phone) : phone;
      const safePassword = security ? security.sanitizeInput(password) : password;
      if (!safePhone || (security && !security.validatePhone(safePhone))) return res.status(400).json({ error: '请输入正确的11位手机号' });
      if (safeEmail && security && !security.validateEmail(safeEmail)) return res.status(400).json({ error: '请输入正确的邮箱地址' });
      if (!safePassword || safePassword.length < 4) return res.status(400).json({ error: '密码至少4位' });
      const identifier = safeEmail || safePhone;
      if (code) {
        const storedCode = smsCodes.get(identifier);
        if (!storedCode || storedCode.code !== code) return res.status(400).json({ error: '验证码错误或已过期' });
        smsCodes.delete(identifier);
      }
      if (safePhone && users.find(u => u.phone === safePhone)) return res.status(400).json({ error: '电话号码已被注册' });
      if (safeEmail && users.find(u => u.email === safeEmail)) return res.status(400).json({ error: '邮箱已被注册' });
      const hashedPassword = security ? await security.hashPassword(safePassword) : safePassword;
      const newUser = {
        id: uuidv4(), username: safeEmail || safePhone || 'user_' + Date.now(), password: hashedPassword,
        email: safeEmail || '', phone: safePhone || '', role: 'user',
        createdAt: new Date().toISOString(), loginHistory: [], lastLoginAt: null, lastLoginLocation: null
      };
      users.push(newUser);
      db.saveUsers(users);
      currentUser = newUser;
      res.json({ user: { ...newUser, password: undefined }, token: 'demo-token' });
    } catch (error) {
      console.error('Error registering:', error);
      res.status(500).json({ error: '注册失败' });
    }
  });

  function getLoginLocation(req) {
    const ip = req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    let deviceType = 'unknown';
    if (/mobile|android|iphone|ipad|ipod/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet/i.test(userAgent)) deviceType = 'tablet';
    else deviceType = 'desktop';
    return { ip, userAgent: userAgent.substring(0, 200), deviceType, timestamp: new Date().toISOString() };
  }

  function recordLogin(userId, location, isSuccessful) {
    try {
      const users = db.getUsers();
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex === -1) return;
      const user = users[userIndex];
      if (!user.loginHistory) user.loginHistory = [];
      user.loginHistory.push({ ...location, isSuccessful, id: uuidv4() });
      if (user.loginHistory.length > 20) user.loginHistory = user.loginHistory.slice(-20);
      if (isSuccessful) { user.lastLoginAt = new Date().toISOString(); user.lastLoginLocation = location; }
      users[userIndex] = user;
      db.saveUsers(users);
    } catch(e) { console.error('recordLogin error:', e); }
  }

  app.post('/api/login', async (req, res) => {
    try {
      const { username, password, loginType } = req.body;
      const location = getLoginLocation(req);
      const users = db.getUsers();
      const safeUsername = security ? security.sanitizeInput(username) : username;
      const safePassword = security ? security.sanitizeInput(password) : password;
      if (!safeUsername || !safePassword) return res.status(400).json({ error: '请输入手机号和密码' });
      let user;
      if (loginType === 'phone') {
        if (security && !security.validatePhone(safeUsername)) return res.status(400).json({ error: '请输入正确的11位手机号' });
        user = users.find(u => u.phone === safeUsername);
      } else {
        if (security && !security.validateEmail(safeUsername)) return res.status(400).json({ error: '请输入正确的邮箱地址' });
        user = users.find(u => u.email === safeUsername);
      }
      if (!user) return res.status(401).json({ error: '账号或密码错误' });
      let passwordValid = false;
      if (user.password && user.password.startsWith('$2') && security) {
        passwordValid = await security.verifyPassword(safePassword, user.password);
      } else {
        passwordValid = safePassword === user.password;
      }
      if (!passwordValid) {
        recordLogin(user.id, location, false);
        return res.status(401).json({ error: '账号或密码错误' });
      }
      recordLogin(user.id, location, true);
      const allUsers = db.getUsers();
      const userIndex = allUsers.findIndex(u => u.id === user.id);
      if (userIndex !== -1) {
        allUsers[userIndex].lastLoginIp = location.ip;
        allUsers[userIndex].lastLoginAt = new Date().toISOString();
        allUsers[userIndex].autoLoginEnabled = true;
        db.saveUsers(allUsers);
      }
      currentUser = user;
      res.json({ user: { ...user, password: undefined }, token: 'demo-token', loginLocation: location });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({ error: '登录失败' });
    }
  });

  app.post('/api/auto-login', (req, res) => {
    try {
      const location = getLoginLocation(req);
      const clientIp = location.ip;
      const users = db.getUsers();
      const user = users.find(u => u.lastLoginIp === clientIp && u.autoLoginEnabled && u.lastLoginAt && (new Date() - new Date(u.lastLoginAt)) < 7 * 24 * 60 * 60 * 1000);
      if (user) res.json({ success: true, user: { ...user, password: undefined }, token: 'demo-token' });
      else res.json({ success: false });
    } catch (error) {
      console.error('Auto login error:', error);
      res.json({ success: false });
    }
  });

  app.post('/api/forgot-password', (req, res) => {
    try {
      const { type, email, orderNo } = req.body;
      const users = db.getUsers();
      const orders = db.getOrders();
      if (type === 'email') {
        if (!email) return res.status(400).json({ error: '请输入邮箱' });
        const user = users.find(u => u.email === email);
        if (!user) return res.status(404).json({ error: '该邮箱未注册' });
        res.json({ password: user.password });
      } else if (type === 'order') {
        if (!orderNo) return res.status(400).json({ error: '请输入支付宝订单号' });
        const order = orders.find(o => o.alipayTradeNo === orderNo || o.id === orderNo);
        if (!order) return res.status(404).json({ error: '未找到该订单' });
        const userPhone = order.userPhone || order.phone;
        const user = users.find(u => u.phone === userPhone || u.id === order.userId);
        if (!user) return res.status(404).json({ error: '找到订单，但未找到关联账号' });
        res.json({ phone: user.phone, password: user.password });
      } else {
        res.status(400).json({ error: '无效的找回方式' });
      }
    } catch (error) {
      console.error('Error in forgot password:', error);
      res.status(500).json({ error: '找回密码失败' });
    }
  });

  app.get('/api/login-history', (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: '缺少用户ID' });
      const users = db.getUsers();
      const user = users.find(u => u.id === userId);
      if (!user) return res.status(404).json({ error: '用户不存在' });
      res.json({ loginHistory: user.loginHistory || [], lastLoginAt: user.lastLoginAt || null, lastLoginLocation: user.lastLoginLocation || null });
    } catch (error) {
      console.error('Error getting login history:', error);
      res.status(500).json({ error: '获取登录历史失败' });
    }
  });
}

module.exports = serverless(app);

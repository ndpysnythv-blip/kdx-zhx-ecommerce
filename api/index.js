const express = require('express');
const cors = require('cors');
const path = require('path');
const uuid = require('uuid');
const helmet = require('helmet');
const serverless = require('serverless-http');

const app = express();

// ==================== 安全中间件 ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:", "https://cdn.staticfile.org"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

// CORS配置
app.use(cors());

// Body解析器限制
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 静态文件服务 - 让 Express 能够服务根目录下的所有静态文件
app.use(express.static(path.join(__dirname, '..')));

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

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: !!db });
});

// 首页重定向到 shop
app.get('/', function(req, res) {
  res.redirect(302, '/shop');
});

if (db) {
  app.get('/api/products', function(req, res) {
    try { res.json(db.getProducts()); }
    catch(e) { res.json([]); }
  });

  app.get('/api/products/:id', function(req, res) {
    try {
      const products = db.getProducts();
      const product = products.find(function(p) { return p.id === req.params.id; });
      if (product) {
        res.json(product);
      } else {
        res.status(404).json({ error: 'Product not found' });
      }
    } catch(e) {
      res.status(404).json({ error: 'Product not found' });
    }
  });

  app.post('/api/products', function(req, res) {
    try {
      const product = { id: uuid.v4() };
      for (var key in req.body) {
        if (req.body.hasOwnProperty(key)) {
          product[key] = req.body[key];
        }
      }
      product.createdAt = new Date().toISOString();
      const products = db.getProducts();
      products.push(product);
      db.saveProducts(products);
      res.json(product);
    } catch(e) {
      res.status(500).json({ error: '保存失败' });
    }
  });

  app.put('/api/products/:id', function(req, res) {
    try {
      db.updateItem('products.json', req.params.id, req.body);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '更新失败' });
    }
  });

  app.delete('/api/products/:id', function(req, res) {
    try {
      db.deleteItem('products.json', req.params.id);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '删除失败' });
    }
  });

  app.get('/api/orders', function(req, res) {
    try { res.json(db.getOrders()); }
    catch(e) { res.json([]); }
  });

  app.get('/api/orders/:id', function(req, res) {
    try {
      const orders = db.getOrders();
      const order = orders.find(function(o) { return o.id === req.params.id || o.outTradeNo === req.params.id; });
      if (order) {
        res.json(order);
      } else {
        res.status(404).json({ error: '订单不存在' });
      }
    } catch(e) {
      res.status(404).json({ error: '订单不存在' });
    }
  });

  app.post('/api/orders', function(req, res) {
    try {
      const order = { id: uuid.v4(), status: 'pending' };
      for (var key in req.body) {
        if (req.body.hasOwnProperty(key)) {
          order[key] = req.body[key];
        }
      }
      order.createdAt = new Date().toISOString();
      const orders = db.getOrders();
      orders.push(order);
      db.saveOrders(orders);
      res.json(order);
    } catch(e) {
      res.status(500).json({ error: '创建订单失败' });
    }
  });

  app.put('/api/orders/:id', function(req, res) {
    try {
      const orders = db.getOrders();
      const existing = orders.find(function(o) { return o.id === req.params.id; });
      if (!existing) {
        return res.status(404).json({ error: '订单不存在' });
      }
      db.updateItem('orders.json', req.params.id, req.body);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '更新订单失败' });
    }
  });

  app.delete('/api/orders/:id', function(req, res) {
    try {
      db.deleteItem('orders.json', req.params.id);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '删除失败' });
    }
  });

  app.post('/api/orders/:id/confirm-payment', function(req, res) {
    try {
      const transactionNo = req.body.transactionNo;
      const paymentMethod = req.body.paymentMethod;
      const screenshot = req.body.screenshot;
      if (!transactionNo) {
        return res.status(400).json({ error: '请输入交易号' });
      }
      const orders = db.getOrders();
      const idx = orders.findIndex(function(o) { return o.id === req.params.id; });
      if (idx === -1) {
        return res.status(404).json({ error: '订单不存在' });
      }
      orders[idx].status = 'payment_pending';
      orders[idx].paymentStatus = 'pending_confirmation';
      orders[idx].paymentMethod = paymentMethod;
      orders[idx].paymentType = 'manual';
      orders[idx].transactionNo = transactionNo;
      orders[idx].paymentScreenshot = screenshot;
      orders[idx].paymentSubmittedAt = new Date().toISOString();
      db.saveOrders(orders);
      res.json({ success: true, message: '支付确认已提交' });
    } catch(e) {
      res.status(500).json({ error: '提交失败' });
    }
  });

  app.post('/api/orders/:id/verify-payment', function(req, res) {
    try {
      const verified = req.body.verified;
      const note = req.body.note;
      const orders = db.getOrders();
      const idx = orders.findIndex(function(o) { return o.id === req.params.id; });
      if (idx === -1) {
        return res.status(404).json({ error: '订单不存在' });
      }
      orders[idx].status = verified ? 'paid' : 'pending';
      orders[idx].paymentStatus = verified ? 'confirmed' : 'payment_rejected';
      orders[idx].paymentVerifiedAt = new Date().toISOString();
      orders[idx].paymentVerifiedNote = note;
      db.saveOrders(orders);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '验证失败' });
    }
  });

  app.post('/api/orders/:id/cancel', function(req, res) {
    try {
      const orders = db.getOrders();
      const idx = orders.findIndex(function(o) { return o.id === req.params.id; });
      if (idx === -1) {
        return res.status(404).json({ error: '订单不存在' });
      }
      orders[idx].status = 'cancelled';
      orders[idx].cancelledAt = new Date().toISOString();
      db.saveOrders(orders);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '取消失败' });
    }
  });

  app.post('/api/orders/:id/ship', function(req, res) {
    try {
      const trackingNo = req.body.trackingNo;
      const shippingCompany = req.body.shippingCompany;
      const orders = db.getOrders();
      const idx = orders.findIndex(function(o) { return o.id === req.params.id; });
      if (idx === -1) {
        return res.status(404).json({ error: '订单不存在' });
      }
      orders[idx].status = 'shipped';
      orders[idx].trackingNo = trackingNo;
      orders[idx].shippingCompany = shippingCompany;
      orders[idx].shippedAt = new Date().toISOString();
      db.saveOrders(orders);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '发货失败' });
    }
  });

  app.get('/api/refunds', function(req, res) {
    try { res.json(db.getRefunds()); }
    catch(e) { res.json([]); }
  });

  app.post('/api/refunds', function(req, res) {
    try {
      const refund = { id: uuid.v4(), status: 'pending' };
      for (var key in req.body) {
        if (req.body.hasOwnProperty(key)) {
          refund[key] = req.body[key];
        }
      }
      refund.createdAt = new Date().toISOString();
      const refunds = db.getRefunds();
      refunds.push(refund);
      db.saveRefunds(refunds);
      res.json(refund);
    } catch(e) {
      res.status(500).json({ error: '创建退款失败' });
    }
  });

  app.put('/api/refunds/:id', function(req, res) {
    try {
      const refunds = db.getRefunds();
      const existing = refunds.find(function(r) { return r.id === req.params.id; });
      if (!existing) {
        return res.status(404).json({ error: '退款不存在' });
      }
      db.updateItem('refunds.json', req.params.id, req.body);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '更新退款失败' });
    }
  });

  app.delete('/api/refunds/:id', function(req, res) {
    try {
      db.deleteItem('refunds.json', req.params.id);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '删除失败' });
    }
  });

  app.post('/api/alipay/create', async function(req, res) {
    try {
      const orderId = req.body.orderId;
      const totalAmount = req.body.totalAmount;
      const subject = req.body.subject;
      const body = req.body.body;
      if (!orderId || !totalAmount || !subject) {
        return res.status(400).json({ error: '缺少必要参数' });
      }
      if (!alipayConfig || !alipayConfig.enabled || !alipaySdk) {
        return res.status(500).json({ success: false, error: '支付宝支付暂时不可用' });
      }
      const outTradeNo = 'KZ' + Date.now() + Math.floor(Math.random() * 1000);
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
      const idx = orders.findIndex(function(o) { return o.id === orderId; });
      if (idx !== -1) {
        orders[idx].outTradeNo = outTradeNo;
        orders[idx].paymentStatus = 'pending';
        orders[idx].paymentMethod = 'alipay';
        db.saveOrders(orders);
      }
      res.json({ success: true, payUrl: result, outTradeNo: outTradeNo });
    } catch(e) {
      res.status(500).json({ success: false, error: '创建支付订单失败', details: e.message });
    }
  });

  app.get('/api/alipay/status/:orderId', function(req, res) {
    try {
      const orders = db.getOrders();
      const order = orders.find(function(o) { return o.id === req.params.orderId || o.outTradeNo === req.params.orderId; });
      if (!order) {
        return res.status(404).json({ error: '订单不存在' });
      }
      res.json({ success: true, paymentStatus: order.paymentStatus || 'pending', orderStatus: order.status });
    } catch(e) {
      res.status(500).json({ error: '查询失败' });
    }
  });

  app.post('/api/alipay/notify', function(req, res) {
    try {
      const trade_status = req.body.trade_status;
      const out_trade_no = req.body.out_trade_no;
      const trade_no = req.body.trade_no;
      if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
        const orders = db.getOrders();
        const idx = orders.findIndex(function(o) { return o.outTradeNo === out_trade_no; });
        if (idx !== -1) {
          orders[idx].status = 'paid';
          orders[idx].paymentStatus = 'success';
          orders[idx].paidAt = new Date().toISOString();
          orders[idx].alipayTradeNo = trade_no;
          db.saveOrders(orders);
        }
      }
      res.send('success');
    } catch(e) {
      res.send('fail');
    }
  });

  app.post('/api/sms/send', async function(req, res) {
    try {
      const phone = req.body.phone;
      const type = req.body.type;
      const email = req.body.email;
      if (!phone && !email) {
        return res.status(400).json({ error: '请输入电话号码或邮箱' });
      }
      const identifier = phone || email;
      const existing = smsCodes.get(identifier);
      if (existing && Date.now() - existing.sentAt < 60000) {
        return res.status(429).json({ error: '请求过于频繁' });
      }
      const code = generateSmsCode();
      smsCodes.set(identifier, { code: code, sentAt: Date.now(), type: type || 'login' });
      setTimeout(function() { smsCodes.delete(identifier); }, 300000);
      if (notificationService && email) {
        try {
          await notificationService.sendVerificationCodeByEmail(email, code, type);
        } catch(e) {}
      }
      res.json({ success: true, message: '验证码已发送', code: code });
    } catch(e) {
      res.status(500).json({ error: '发送验证码失败' });
    }
  });

  app.post('/api/sms/verify', function(req, res) {
    try {
      const phone = req.body.phone;
      const email = req.body.email;
      const code = req.body.code;
      const identifier = phone || email;
      if (!identifier || !code) {
        return res.status(400).json({ error: '请输入完整信息' });
      }
      const stored = smsCodes.get(identifier);
      if (!stored) {
        return res.status(400).json({ error: '验证码已过期' });
      }
      if (stored.code !== code) {
        return res.status(400).json({ error: '验证码错误' });
      }
      smsCodes.delete(identifier);
      res.json({ success: true, message: '验证成功' });
    } catch(e) {
      res.status(500).json({ error: '验证失败' });
    }
  });

  app.post('/api/check-email', function(req, res) {
    try {
      const email = req.body.email;
      if (!email) {
        return res.status(400).json({ error: '请输入邮箱' });
      }
      const users = db.getUsers();
      var exists = false;
      for (var i = 0; i < users.length; i++) {
        if (users[i].email === email) {
          exists = true;
          break;
        }
      }
      res.json({ exists: exists });
    } catch(e) {
      res.status(500).json({ error: '检查失败' });
    }
  });

  app.post('/api/check-phone', function(req, res) {
    try {
      const phone = req.body.phone;
      if (!phone || !/^1\d{10}$/.test(phone)) {
        return res.status(400).json({ error: '请输入正确的11位手机号' });
      }
      const users = db.getUsers();
      var exists = false;
      for (var i = 0; i < users.length; i++) {
        if (users[i].phone === phone) {
          exists = true;
          break;
        }
      }
      res.json({ exists: exists });
    } catch(e) {
      res.status(500).json({ error: '检查失败' });
    }
  });

  app.post('/api/check-user', function(req, res) {
    try {
      const phone = req.body.phone;
      const email = req.body.email;
      const username = req.body.username;
      const users = db.getUsers();
      var found = null;
      if (phone) {
        for (var i = 0; i < users.length; i++) {
          if (users[i].phone === phone) {
            found = users[i];
            break;
          }
        }
      } else if (email) {
        for (var i = 0; i < users.length; i++) {
          if (users[i].email === email) {
            found = users[i];
            break;
          }
        }
      } else if (username) {
        for (var i = 0; i < users.length; i++) {
          if (users[i].username === username) {
            found = users[i];
            break;
          }
        }
      }
      var hasEmail = found && found.email;
      var hasPhone = found && found.phone;
      res.json({ exists: !!found, hasEmail: hasEmail, hasPhone: hasPhone });
    } catch(e) {
      res.status(500).json({ exists: false });
    }
  });

  app.post('/api/register', async function(req, res) {
    try {
      const email = req.body.email;
      const phone = req.body.phone;
      const password = req.body.password;
      const code = req.body.code;
      const users = db.getUsers();
      var sEmail = security ? security.sanitizeInput(email) : email;
      var sPhone = security ? security.sanitizeInput(phone) : phone;
      var sPass = security ? security.sanitizeInput(password) : password;
      if (!sPhone) {
        return res.status(400).json({ error: '请输入手机号' });
      }
      if (!sPass || sPass.length < 4) {
        return res.status(400).json({ error: '密码至少4位' });
      }
      const identifier = sEmail || sPhone;
      if (code) {
        const stored = smsCodes.get(identifier);
        if (!stored || stored.code !== code) {
          return res.status(400).json({ error: '验证码错误' });
        }
        smsCodes.delete(identifier);
      }
      for (var i = 0; i < users.length; i++) {
        if (users[i].phone === sPhone) {
          return res.status(400).json({ error: '手机号已注册' });
        }
      }
      if (sEmail) {
        for (var i = 0; i < users.length; i++) {
          if (users[i].email === sEmail) {
            return res.status(400).json({ error: '邮箱已注册' });
          }
        }
      }
      var hashed = sPass;
      if (security) {
        hashed = await security.hashPassword(sPass);
      }
      const newUser = {
        id: uuid.v4(),
        username: sEmail || sPhone,
        password: hashed,
        email: sEmail || '',
        phone: sPhone || '',
        role: 'user',
        createdAt: new Date().toISOString(),
        loginHistory: []
      };
      users.push(newUser);
      db.saveUsers(users);
      var newUserWithoutPassword = {};
      for (var key in newUser) {
        if (key !== 'password') {
          newUserWithoutPassword[key] = newUser[key];
        }
      }
      res.json({ user: newUserWithoutPassword, token: 'demo-token' });
    } catch(e) {
      res.status(500).json({ error: '注册失败' });
    }
  });

  app.post('/api/login', async function(req, res) {
    try {
      const username = req.body.username;
      const password = req.body.password;
      const loginType = req.body.loginType;
      const users = db.getUsers();
      var sUser = security ? security.sanitizeInput(username) : username;
      var sPass = security ? security.sanitizeInput(password) : password;
      if (!sUser || !sPass) {
        return res.status(400).json({ error: '请输入账号和密码' });
      }
      var user = null;
      if (loginType === 'phone') {
        for (var i = 0; i < users.length; i++) {
          if (users[i].phone === sUser) {
            user = users[i];
            break;
          }
        }
      } else {
        for (var i = 0; i < users.length; i++) {
          if (users[i].email === sUser) {
            user = users[i];
            break;
          }
        }
      }
      if (!user) {
        return res.status(401).json({ error: '账号或密码错误' });
      }
      var valid = false;
      if (user.password && user.password.substring(0, 2) === '$2' && security) {
        valid = await security.verifyPassword(sPass, user.password);
      } else {
        valid = sPass === user.password;
      }
      if (!valid) {
        return res.status(401).json({ error: '账号或密码错误' });
      }
      var userWithoutPassword = {};
      for (var key in user) {
        if (key !== 'password') {
          userWithoutPassword[key] = user[key];
        }
      }
      res.json({ user: userWithoutPassword, token: 'demo-token' });
    } catch(e) {
      res.status(500).json({ error: '登录失败' });
    }
  });

  app.post('/api/auto-login', function(req, res) {
    res.json({ success: false });
  });

  app.post('/api/forgot-password', function(req, res) {
    try {
      const type = req.body.type;
      const email = req.body.email;
      const orderNo = req.body.orderNo;
      const users = db.getUsers();
      if (type === 'email') {
        if (!email) {
          return res.status(400).json({ error: '请输入邮箱' });
        }
        var user = null;
        for (var i = 0; i < users.length; i++) {
          if (users[i].email === email) {
            user = users[i];
            break;
          }
        }
        if (!user) {
          return res.status(404).json({ error: '该邮箱未注册' });
        }
        res.json({ password: user.password });
      } else if (type === 'order') {
        if (!orderNo) {
          return res.status(400).json({ error: '请输入订单号' });
        }
        const orders = db.getOrders();
        var order = null;
        for (var i = 0; i < orders.length; i++) {
          if (orders[i].alipayTradeNo === orderNo || orders[i].id === orderNo) {
            order = orders[i];
            break;
          }
        }
        if (!order) {
          return res.status(404).json({ error: '未找到订单' });
        }
        const userPhone = order.userPhone || order.phone;
        var foundUser = null;
        for (var i = 0; i < users.length; i++) {
          if (users[i].phone === userPhone || users[i].id === order.userId) {
            foundUser = users[i];
            break;
          }
        }
        if (!foundUser) {
          return res.status(404).json({ error: '未找到关联账号' });
        }
        res.json({ phone: foundUser.phone, password: foundUser.password });
      } else {
        res.status(400).json({ error: '无效的找回方式' });
      }
    } catch(e) {
      res.status(500).json({ error: '找回密码失败' });
    }
  });

  app.get('/api/login-history', function(req, res) {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: '缺少用户ID' });
      }
      const users = db.getUsers();
      var user = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].id === userId) {
          user = users[i];
          break;
        }
      }
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }
      res.json({ loginHistory: user.loginHistory || [], lastLoginAt: user.lastLoginAt || null });
    } catch(e) {
      res.status(500).json({ error: '获取失败' });
    }
  });
} else {
  app.get('/api/products', function(req, res) { res.json([]); });
  app.get('/api/orders', function(req, res) { res.json([]); });
  app.get('/api/refunds', function(req, res) { res.json([]); });
  app.post('/api/register', function(req, res) { res.status(503).json({ error: '数据库不可用' }); });
  app.post('/api/login', function(req, res) { res.status(503).json({ error: '数据库不可用' }); });
}

// ==================== 页面路由 ====================
app.get('/', function(req, res) {
  res.redirect('/shop');
});

app.get('/shop', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'shop.html'));
});

app.get('/customize', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'customize.html'));
});

app.get('/chat', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'chat.html'));
});

app.get('/auth', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'auth.html'));
});

app.get('/product/:id', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'product-detail.html'));
});

app.get('/cart', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'cart.html'));
});

app.get('/checkout', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'checkout.html'));
});

app.get('/my-orders', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'my-orders.html'));
});

app.get('/orders', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'my-orders.html'));
});

app.get('/payment-success', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'payment-success.html'));
});

app.get('/manual-payment', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'manual-payment.html'));
});

app.get('/admin', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'admin-shop.html'));
});

app.get('/contact-us', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'contact-us.html'));
});

app.get('/user-center', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'user-center.html'));
});

app.get('/test-payment', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'test-payment.html'));
});

// ==================== 静态字体文件路由 ====================
app.get('/webfonts/:file', function(req, res) {
  var file = req.params.file;
  var filePath = path.join(__dirname, '..', 'webfonts', file);
  console.log('[webfonts] Request for:', file);
  console.log('[webfonts] __dirname:', __dirname);
  console.log('[webfonts] Full path:', filePath);
  res.sendFile(filePath);
});

module.exports = serverless(app);
// force redeploy Fri May 22 15:35:01 UTC 2026

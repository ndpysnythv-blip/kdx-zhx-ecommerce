const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const helmet = require('helmet');
const serverless = require('serverless-http');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://cdn.staticfile.org"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.staticfile.org"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://open.bigmodel.cn", "https://kdxzhx.top", "http://kdxzhx.top"],
      fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://cdn.staticfile.org"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

const allowedOrigins = [
  'https://kdxzhx.top',
  'http://kdxzhx.top',
  'http://localhost:9999'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
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
  // 邮件发送功能已移除，保留模块加载以兼容旧逻辑
  notificationService = null;
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

function getAIConfig(type = 'chatbot') {
  try {
    var configPath = path.join(__dirname, '..', 'data', 'ai-config.json');
    if (fs.existsSync(configPath)) {
      var data = fs.readFileSync(configPath, 'utf8');
      var config = JSON.parse(data);
      
      // 新格式支持
      if (config.system && config.chatbot) {
        return type === 'system' ? config.system : config.chatbot;
      }
      
      // 旧格式向后兼容
      return config;
    }
  } catch (e) {
    console.error('read ai-config failed:', e.message);
  }
  
  // 从环境变量读取配置
  var systemApiKey = process.env.ZHIPU_SYSTEM_API_KEY || process.env.ZHIPU_API_KEY || process.env.AI_API_KEY || '';
  var chatbotApiKey = process.env.ZHIPU_CHATBOT_API_KEY || process.env.ZHIPU_API_KEY || process.env.AI_API_KEY || '';
  
  // 默认配置
  var defaultConfig = {
    apiKey: type === 'system' ? systemApiKey : chatbotApiKey,
    apiUrl: process.env.AI_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: process.env.AI_MODEL || 'glm-4',
    temperature: type === 'system' ? 0.3 : 0.8,
    maxTokens: type === 'system' ? 200 : 500,
    systemPrompt: type === 'system' 
      ? '你是KDX丨ZHX官方商城的高级管理AI助手，能够处理订单、商品、数据分析等后台管理任务。' 
      : '你是KDX丨ZHX官方商城的智能客服小K。用自然、友好的方式回答用户问题，像真人客服一样对话。回答简洁，可以带emoji。不要说"作为AI"之类的话，就当自己是真正的客服。'
  };
  return defaultConfig;
}

function saveAIConfig(config, type = 'chatbot') {
  try {
    var configPath = path.join(__dirname, '..', 'data', 'ai-config.json');
    var dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 读取现有配置
    var fullConfig = { system: {}, chatbot: {} };
    if (fs.existsSync(configPath)) {
      try {
        var existingData = fs.readFileSync(configPath, 'utf8');
        fullConfig = JSON.parse(existingData);
        
        // 确保新格式结构
        if (!fullConfig.system) fullConfig.system = {};
        if (!fullConfig.chatbot) fullConfig.chatbot = {};
      } catch (e) {
        // 解析失败，用默认结构
      }
    }
    
    // 更新指定类型的配置
    if (type === 'system') {
      fullConfig.system = Object.assign(fullConfig.system || {}, config);
    } else if (type === 'chatbot') {
      fullConfig.chatbot = Object.assign(fullConfig.chatbot || {}, config);
    } else {
      // 兼容旧格式保存（保存到chatbot）
      fullConfig.chatbot = Object.assign(fullConfig.chatbot || {}, config);
    }
    
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    return true;
  } catch (e) {
    console.error('save ai-config failed:', e.message);
    return false;
  }
}

const smsCodes = new Map();

function generateSmsCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: !!db });
});

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
        console.log('邮件发送功能已移除，跳过邮件通知');
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

app.get('/api/ai-config', function(req, res) {
  var type = req.query.type || 'chatbot';
  var config = getAIConfig(type);
  var maskedKey = '';
  if (config.apiKey) {
    maskedKey = config.apiKey.substring(0, 8) + '****' + config.apiKey.substring(config.apiKey.length - 4);
  }
  
  // 获取两个配置的完整信息
  var systemConfig = getAIConfig('system');
  var chatbotConfig = getAIConfig('chatbot');
  
  var maskedSystemKey = '';
  if (systemConfig.apiKey) {
    maskedSystemKey = systemConfig.apiKey.substring(0, 8) + '****' + systemConfig.apiKey.substring(systemConfig.apiKey.length - 4);
  }
  
  var maskedChatbotKey = '';
  if (chatbotConfig.apiKey) {
    maskedChatbotKey = chatbotConfig.apiKey.substring(0, 8) + '****' + chatbotConfig.apiKey.substring(chatbotConfig.apiKey.length - 4);
  }
  
  res.json({
    // 当前类型的配置（向后兼容）
    apiUrl: config.apiUrl,
    model: config.model,
    modelName: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt,
    hasApiKey: !!config.apiKey,
    apiKeyMasked: maskedKey,
    configured: !!config.apiKey,
    apiKey: maskedKey,
    
    // 双配置完整信息
    system: {
      apiUrl: systemConfig.apiUrl,
      model: systemConfig.model,
      temperature: systemConfig.temperature,
      maxTokens: systemConfig.maxTokens,
      systemPrompt: systemConfig.systemPrompt,
      hasApiKey: !!systemConfig.apiKey,
      apiKeyMasked: maskedSystemKey
    },
    chatbot: {
      apiUrl: chatbotConfig.apiUrl,
      model: chatbotConfig.model,
      temperature: chatbotConfig.temperature,
      maxTokens: chatbotConfig.maxTokens,
      systemPrompt: chatbotConfig.systemPrompt,
      hasApiKey: !!chatbotConfig.apiKey,
      apiKeyMasked: maskedChatbotKey
    }
  });
});

app.post('/api/ai-config', function(req, res) {
  try {
    var type = req.query.type || 'chatbot';
    
    // 处理双配置保存
    if (req.body.system || req.body.chatbot) {
      // 保存system配置
      if (req.body.system) {
        var sysConfig = getAIConfig('system');
        if (req.body.system.apiKey && req.body.system.apiKey !== '****') {
          sysConfig.apiKey = req.body.system.apiKey;
        }
        if (req.body.system.apiUrl) sysConfig.apiUrl = req.body.system.apiUrl;
        if (req.body.system.model) sysConfig.model = req.body.system.model;
        if (req.body.system.temperature !== undefined) sysConfig.temperature = parseFloat(req.body.system.temperature);
        if (req.body.system.maxTokens !== undefined) sysConfig.maxTokens = parseInt(req.body.system.maxTokens);
        if (req.body.system.systemPrompt !== undefined) sysConfig.systemPrompt = req.body.system.systemPrompt;
        saveAIConfig(sysConfig, 'system');
      }
      
      // 保存chatbot配置
      if (req.body.chatbot) {
        var chatConfig = getAIConfig('chatbot');
        if (req.body.chatbot.apiKey && req.body.chatbot.apiKey !== '****') {
          chatConfig.apiKey = req.body.chatbot.apiKey;
        }
        if (req.body.chatbot.apiUrl) chatConfig.apiUrl = req.body.chatbot.apiUrl;
        if (req.body.chatbot.model) chatConfig.model = req.body.chatbot.model;
        if (req.body.chatbot.temperature !== undefined) chatConfig.temperature = parseFloat(req.body.chatbot.temperature);
        if (req.body.chatbot.maxTokens !== undefined) chatConfig.maxTokens = parseInt(req.body.chatbot.maxTokens);
        if (req.body.chatbot.systemPrompt !== undefined) chatConfig.systemPrompt = req.body.chatbot.systemPrompt;
        saveAIConfig(chatConfig, 'chatbot');
      }
      
      res.json({ success: true, message: 'AI配置已保存', ok: true });
      return;
    }
    
    // 兼容旧格式单配置保存
    var currentConfig = getAIConfig(type);
    
    // 处理API密钥
    if (req.body.apiKey && req.body.apiKey !== '****') {
      currentConfig.apiKey = req.body.apiKey;
    }
    
    // 处理API地址
    if (req.body.apiUrl) {
      currentConfig.apiUrl = req.body.apiUrl;
    }
    
    // 处理模型名（兼容两种字段名）
    if (req.body.modelName) {
      currentConfig.model = req.body.modelName;
    } else if (req.body.model) {
      currentConfig.model = req.body.model;
    }
    
    // 处理温度
    if (req.body.temperature !== undefined && req.body.temperature !== null && req.body.temperature !== '') {
      var tempVal = parseFloat(req.body.temperature);
      if (!isNaN(tempVal)) {
        currentConfig.temperature = tempVal;
      }
    }
    
    // 处理最大Token
    if (req.body.maxTokens !== undefined && req.body.maxTokens !== null && req.body.maxTokens !== '') {
      var maxVal = parseInt(req.body.maxTokens);
      if (!isNaN(maxVal)) {
        currentConfig.maxTokens = maxVal;
      }
    }
    
    // 处理系统提示
    if (req.body.systemPrompt !== undefined) {
      currentConfig.systemPrompt = req.body.systemPrompt;
    }
    
    var result = saveAIConfig(currentConfig, type);
    if (result) {
      res.json({ success: true, message: 'AI配置已保存', ok: true });
    } else {
      res.status(500).json({ error: '保存配置失败' });
    }
  } catch (e) {
    console.error('保存配置错误:', e);
    res.status(500).json({ error: '保存配置失败' });
  }
});

app.post('/api/ai/test', async function(req, res) {
  try {
    var type = req.query.type || 'chatbot';
    var config = getAIConfig(type);
    
    // 如果请求带了配置，优先用请求里的
    if (req.body && req.body.apiKey && req.body.apiKey !== '****') {
      config.apiKey = req.body.apiKey;
    }
    if (req.body && req.body.apiUrl) {
      config.apiUrl = req.body.apiUrl;
    }
    if (req.body && (req.body.modelName || req.body.model)) {
      config.model = req.body.modelName || req.body.model;
    }
    if (req.body && req.body.temperature !== undefined) {
      config.temperature = parseFloat(req.body.temperature);
    }
    if (req.body && req.body.maxTokens !== undefined) {
      config.maxTokens = parseInt(req.body.maxTokens);
    }
    
    if (!config.apiKey) {
      return res.json({ success: false, message: '未配置API密钥', ok: false, error: '未配置API密钥' });
    }
    
    var testMessages = [
      { role: 'system', content: config.systemPrompt || '你好' },
      { role: 'user', content: '你好' }
    ];
    
    var startTime = Date.now();
    var response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        messages: testMessages,
        temperature: config.temperature || 0.8,
        max_tokens: 100
      })
    });
    
    var elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      var errText = await response.text();
      console.error('AI API测试失败:', response.status, errText);
      return res.json({ 
        success: false, 
        message: 'API调用失败: HTTP ' + response.status, 
        ok: false,
        error: 'API调用失败: HTTP ' + response.status,
        detail: errText, 
        latency: elapsed 
      });
    }
    
    var data = await response.json();
    var reply = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      reply = data.choices[0].message.content;
    }
    
    res.json({ 
      success: true, 
      message: 'AI连接正常', 
      ok: true,
      reply: reply, 
      model: data.model || config.model, 
      latency: elapsed, 
      usage: data.usage 
    });
  } catch (e) {
    console.error('AI测试错误:', e);
    res.json({ 
      success: false, 
      message: '连接失败: ' + e.message,
      ok: false,
      error: '连接失败: ' + e.message 
    });
  }
});

// 手机号验证API - 用于登录时的AI验证
app.post('/api/ai/phone-verify', async function(req, res) {
  try {
    var config = getAIConfig('system'); // 使用system配置
    const { phone } = req.body;

    if (!phone) {
      return res.json({ verified: false, valid: false, message: '请提供手机号', details: '手机号不能为空' });
    }

    // 简单的手机号格式验证
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.json({ verified: false, valid: false, message: '手机号格式不正确', details: '请输入正确的11位中国大陆手机号' });
    }

    // 如果配置了AI，让AI做验证，否则直接通过
    if (config.apiKey) {
      try {
        const verifyMessages = [
          {
            role: 'system',
            content: config.systemPrompt || '你是一个手机号验证助手。用户会提供一个中国大陆手机号，请验证：1. 格式是否正确 2. 是否看起来是真实有效手机号。请以JSON格式回复，包含：verified（布尔值）、valid（布尔值）、message（验证结果说明）、details（详细信息）'
          },
          {
            role: 'user',
            content: `请验证这个手机号：${phone}`
          }
        ];

        const aiResponse = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.apiKey
          },
          body: JSON.stringify({
            model: config.model,
            messages: verifyMessages,
            temperature: config.temperature || 0.3,
            max_tokens: config.maxTokens || 200
          })
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          if (aiData.choices && aiData.choices[0] && aiData.choices[0].message) {
            try {
              const aiResult = JSON.parse(aiData.choices[0].message.content);
              return res.json(aiResult);
            } catch (e) {
              // AI没返回JSON，用默认验证
            }
          }
        }
      } catch (e) {
        console.error('AI验证失败:', e);
      }
    }

    // 默认验证：通过格式检查就通过
    res.json({
      verified: true,
      valid: true,
      message: '手机号验证成功',
      details: '该手机号格式正确，看起来是有效的中国大陆手机号'
    });

  } catch (e) {
    console.error('手机号验证错误:', e);
    res.json({
      verified: true,
      valid: true,
      message: '验证成功',
      details: '系统验证通过'
    });
  }
});

// 手机号验证API - 用于注册时的验证
app.post('/api/ai/verify-phone', async function(req, res) {
  try {
    var config = getAIConfig();
    const { phone } = req.body;

    if (!phone) {
      return res.json({ valid: false, message: '请提供手机号' });
    }

    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.json({ valid: false, message: '请输入正确的11位中国大陆手机号' });
    }

    res.json({ valid: true, message: '手机号验证通过！' });
  } catch (e) {
    console.error('手机号验证错误:', e);
    res.json({ valid: true, message: '验证通过' });
  }
});

// 后台管理AI助手 - 使用System API（高级AI）
app.post('/api/ai/chat', async function(req, res) {
  try {
    var config = getAIConfig('system'); // 使用system配置（高级AI）
    const { message, permissions } = req.body;

    // 获取系统数据用于AI上下文
    let systemContext = '';
    if (db) {
      const products = db.getProducts();
      const orders = db.getOrders();
      const stats = {
        totalProducts: products.length,
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + (o.total || 0), 0),
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        paidOrders: orders.filter(o => o.status === 'paid').length,
        shippedOrders: orders.filter(o => o.status === 'shipped').length
      };
      
      systemContext = `
当前系统数据（仅供参考）：
- 商品总数：${stats.totalProducts}
- 订单总数：${stats.totalOrders}
- 总收入：¥${stats.totalRevenue.toFixed(2)}
- 待处理订单：${stats.pendingOrders}
- 已付款订单：${stats.paidOrders}
- 已发货订单：${stats.shippedOrders}

最近5个订单：
${orders.slice(-5).map(o => `ID: ${o.id}, 状态: ${o.status}, 金额: ¥${o.total}`).join('\n')}

可用操作（返回JSON格式，格式为 {"action": {"type": "xxx", "data": {}}}）：
- addProduct: 打开添加商品弹窗
- viewOrders: 跳转订单管理
- analyzeData: 跳转数据看板
- clearZeroStock: 清理零库存商品
`;
    }

    const systemPrompt = `${config.systemPrompt || '你是KDX丨ZHX官方商城的高级管理AI助手。'}
${systemContext}

你的任务是帮助管理员高效地管理商城。你可以：
1. 回答管理相关问题
2. 建议并执行管理操作（通过action返回）
3. 分析销售数据
4. 给出优化建议

注意：仅在权限允许时建议操作。`;

    if (!config.apiKey) {
      return res.json({
        response: '您好！我是KDX-AI智能助手。我可以帮您管理商城：\n\n• 查询订单状态\n• 分析销售数据\n• 快速上架商品\n• 处理库存管理\n\n请问有什么需要帮助的吗？',
        action: null
      });
    }

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 800
      })
    });

    if (!response.ok) {
      throw new Error('AI API request failed: ' + response.status);
    }

    const data = await response.json();
    let aiResponse = data.choices?.[0]?.message?.content || '抱歉，我无法处理您的请求。';
    
    // 尝试解析AI返回的action
    let action = null;
    try {
      const actionMatch = aiResponse.match(/\{[\s\S]*"action"[\s\S]*\}/);
      if (actionMatch) {
        const parsed = JSON.parse(actionMatch[0]);
        action = parsed.action;
        aiResponse = aiResponse.replace(actionMatch[0], '').trim();
      }
    } catch (e) {
      // 解析失败，忽略action
    }

    res.json({
      response: aiResponse,
      action: action
    });
  } catch (error) {
    console.error('[AI Chat API] Error:', error.message);
    res.json({
      response: '抱歉，系统暂时繁忙，请稍后再试。',
      action: null
    });
  }
});

app.post('/api/ai', async function(req, res) {
  try {
    var config = getAIConfig('chatbot'); // 使用chatbot配置
    const { messages } = req.body;

    const apiMessages = [{ role: 'system', content: config.systemPrompt || '你是KDX丨ZHX官方商城的智能客服小K。' }];

    const recentMessages = messages.slice(-10);
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      if (msg.role === 'user') {
        apiMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        apiMessages.push({ role: 'assistant', content: msg.content });
      }
    }

    if (!config.apiKey) {
      const fallbackReplies = [
        '您好！我是小K，很高兴为您服务～有什么可以帮您的吗？😊',
        '收到您的问题！让我为您查一下～',
        '感谢您的咨询！我们的商品都是经过严格质检的，请放心选购哦～✨',
        '好的，我来帮您处理！请问还有其他问题吗？',
        '明白啦！如果您有任何其他问题，随时告诉我哦～💪'
      ];
      return res.json({
        id: 'msg-' + Date.now(),
        object: 'chat.completion',
        created: Date.now(),
        model: 'kdgpt-turbo',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)] },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      });
    }

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        messages: apiMessages,
        temperature: config.temperature || 0.8,
        max_tokens: config.maxTokens || 500
      })
    });

    if (!response.ok) {
      throw new Error('AI API request failed: ' + response.status);
    }

    const data = await response.json();

    res.json({
      id: data.id || 'msg-' + Date.now(),
      object: 'chat.completion',
      created: Date.now(),
      model: data.model || config.model,
      choices: data.choices || [],
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
  } catch (error) {
    console.error('[AI API] Error:', error.message);
    res.json({
      id: 'msg-' + Date.now(),
      object: 'chat.completion',
      created: Date.now(),
      model: 'kdgpt-turbo',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '抱歉，我现在有点忙，请稍后再试～😊' },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
  }
});

// ==========================================
// AI 工具函数 - 执行实际操作
// ==========================================

// 查找订单
function findOrder(orderId) {
  try {
    if (!db) return null;
    const orders = db.getOrders();
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].id === orderId || orders[i].alipayTradeNo === orderId) {
        return orders[i];
      }
    }
    return null;
  } catch(e) {
    return null;
  }
}

// 修改订单价格
function updateOrderPrice(orderId, newPrice) {
  try {
    if (!db) return { success: false, message: '数据库不可用' };
    const orders = db.getOrders();
    var found = false;
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].id === orderId || orders[i].alipayTradeNo === orderId) {
        orders[i].total = parseFloat(newPrice);
        orders[i].updatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (found) {
      db.saveOrders(orders);
      return { success: true, message: '订单价格已更新', order: orders[i] };
    }
    return { success: false, message: '未找到订单' };
  } catch(e) {
    return { success: false, message: '更新失败: ' + e.message };
  }
}

// 修改订单状态
function updateOrderStatus(orderId, newStatus) {
  try {
    if (!db) return { success: false, message: '数据库不可用' };
    const orders = db.getOrders();
    var found = false;
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].id === orderId || orders[i].alipayTradeNo === orderId) {
        orders[i].status = newStatus;
        orders[i].updatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (found) {
      db.saveOrders(orders);
      return { success: true, message: '订单状态已更新', order: orders[i] };
    }
    return { success: false, message: '未找到订单' };
  } catch(e) {
    return { success: false, message: '更新失败: ' + e.message };
  }
}

// 查找商品
function findProduct(productId) {
  try {
    if (!db) return null;
    const products = db.getProducts();
    for (var i = 0; i < products.length; i++) {
      if (products[i].id === productId) {
        return products[i];
      }
    }
    return null;
  } catch(e) {
    return null;
  }
}

// 修改商品价格
function updateProductPrice(productId, newPrice) {
  try {
    if (!db) return { success: false, message: '数据库不可用' };
    const products = db.getProducts();
    var found = false;
    for (var i = 0; i < products.length; i++) {
      if (products[i].id === productId) {
        products[i].price = parseFloat(newPrice);
        products[i].updatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (found) {
      db.saveProducts(products);
      return { success: true, message: '商品价格已更新', product: products[i] };
    }
    return { success: false, message: '未找到商品' };
  } catch(e) {
    return { success: false, message: '更新失败: ' + e.message };
  }
}

// 获取统计数据
function getStats() {
  try {
    if (!db) return { totalProducts: 0, totalOrders: 0, totalRevenue: 0 };
    const products = db.getProducts();
    const orders = db.getOrders();
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    return {
      totalProducts: products.length,
      totalOrders: orders.length,
      totalRevenue: totalRevenue,
      recentOrders: orders.slice(-5).map(o => ({ id: o.id, status: o.status, total: o.total }))
    };
  } catch(e) {
    return { totalProducts: 0, totalOrders: 0, totalRevenue: 0 };
  }
}

// ==========================================
// AI 指令解析与处理
// ==========================================

function parseAndExecuteInstruction(message) {
  var result = {
    success: true,
    message: '',
    action: null,
    data: null
  };

  var msg = message.toLowerCase();

  // 1. 查询订单
  var orderMatch = message.match(/订单[#号]*([A-Za-z0-9_-]+)/i);
  if (!orderMatch) orderMatch = message.match(/([A-Za-z0-9_-]{8,})/i); // 尝试匹配8位以上ID
  
  if (orderMatch && (msg.includes('查') || msg.includes('查询') || msg.includes('看') || msg.includes('状态'))) {
    var orderId = orderMatch[1];
    var order = findOrder(orderId);
    if (order) {
      result.message = `✅ 找到订单：\n订单号：${order.id}\n状态：${order.status}\n金额：¥${order.total}\n创建时间：${order.createdAt}`;
      result.data = order;
      result.action = 'query_order';
    } else {
      result.success = false;
      result.message = `❌ 未找到订单 ${orderId}`;
    }
    return result;
  }

  // 2. 修改订单价格
  if ((msg.includes('修改') || msg.includes('改')) && msg.includes('价格') && orderMatch) {
    var priceMatch = message.match(/(\d+(\.\d+)?)/);
    if (priceMatch) {
      var orderId = orderMatch[1];
      var newPrice = parseFloat(priceMatch[1]);
      var updateResult = updateOrderPrice(orderId, newPrice);
      if (updateResult.success) {
        result.message = `✅ ${updateResult.message}\n订单 ${orderId} 价格已改为 ¥${newPrice}`;
        result.data = updateResult.order;
        result.action = 'update_order_price';
      } else {
        result.success = false;
        result.message = `❌ ${updateResult.message}`;
      }
    } else {
      result.success = false;
      result.message = '❌ 请告诉我新的价格是多少';
    }
    return result;
  }

  // 3. 修改订单状态
  if ((msg.includes('发货') || msg.includes('发了') || msg.includes('已发')) && orderMatch) {
    var orderId = orderMatch[1];
    var updateResult = updateOrderStatus(orderId, 'shipped');
    if (updateResult.success) {
      result.message = `✅ ${updateResult.message}\n订单 ${orderId} 状态已改为"已发货"`;
      result.data = updateResult.order;
      result.action = 'update_order_status';
    } else {
      result.success = false;
      result.message = `❌ ${updateResult.message}`;
    }
    return result;
  }

  // 4. 查询统计
  if (msg.includes('统计') || msg.includes('数据') || msg.includes('销量') || msg.includes('收入')) {
    var stats = getStats();
    result.message = `📊 当前数据统计：\n商品总数：${stats.totalProducts}\n订单总数：${stats.totalOrders}\n总收入：¥${stats.totalRevenue.toFixed(2)}`;
    if (stats.recentOrders && stats.recentOrders.length > 0) {
      result.message += '\n\n最近5个订单：';
      stats.recentOrders.forEach(o => {
        result.message += `\n• ${o.id} - ${o.status} - ¥${o.total}`;
      });
    }
    result.data = stats;
    result.action = 'get_stats';
    return result;
  }

  // 5. 查询商品
  var productMatch = message.match(/商品[#号]*([A-Za-z0-9_-]+)/i);
  if (productMatch && (msg.includes('查') || msg.includes('查询') || msg.includes('看'))) {
    var productId = productMatch[1];
    var product = findProduct(productId);
    if (product) {
      result.message = `✅ 找到商品：\n商品名：${product.name}\n价格：¥${product.price}\n库存：${product.stock}\n分类：${product.category}`;
      result.data = product;
      result.action = 'query_product';
    } else {
      result.success = false;
      result.message = `❌ 未找到商品 ${productId}`;
    }
    return result;
  }

  // 6. 修改商品价格
  if ((msg.includes('修改') || msg.includes('改')) && msg.includes('商品') && msg.includes('价格') && productMatch) {
    var priceMatch = message.match(/(\d+(\.\d+)?)/);
    if (priceMatch) {
      var productId = productMatch[1];
      var newPrice = parseFloat(priceMatch[1]);
      var updateResult = updateProductPrice(productId, newPrice);
      if (updateResult.success) {
        result.message = `✅ ${updateResult.message}\n商品 ${productId} 价格已改为 ¥${newPrice}`;
        result.data = updateResult.product;
        result.action = 'update_product_price';
      } else {
        result.success = false;
        result.message = `❌ ${updateResult.message}`;
      }
    } else {
      result.success = false;
      result.message = '❌ 请告诉我新的价格是多少';
    }
    return result;
  }

  // 未识别的指令
  result.success = false;
  result.message = `🙋 我理解您想做点什么，但还不太确定。\n\n您可以试试这些指令：\n\n1. 查询订单："查询订单 ABC123456"\n2. 修改订单价格："修改订单 ABC123456 价格为 99.9"\n3. 发货："订单 ABC123456 已发货"\n4. 查看统计："查看统计数据"\n5. 查询商品："查询商品 PROD123"\n6. 修改商品价格："修改商品 PROD123 价格为 199"`;
  
  return result;
}

// ==========================================
// AI 指令 API
// ==========================================

// Webhook 接收指令（用于飞书/QQ机器人）
app.post('/api/ai/webhook', async function(req, res) {
  try {
    var config = getAIConfig('system');
    var { message, sender } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, message: '缺少消息内容' });
    }

    // 先尝试直接解析执行
    var directResult = parseAndExecuteInstruction(message);
    
    if (directResult.success) {
      return res.json(directResult);
    }

    // 如果直接解析失败，用 AI 理解
    if (!config.apiKey) {
      // 无 API Key，直接返回帮助信息
      return res.json({
        success: true,
        message: directResult.message,
        action: 'help'
      });
    }

    // 让 AI 理解意图并决定调用哪个工具
    var systemPrompt = `你是 KDX 电商管理系统的 AI 助手。你需要理解用户的指令并决定调用什么工具。

可用工具：
1. query_order(orderId) - 查询订单
2. update_order_price(orderId, price) - 修改订单价格
3. update_order_status(orderId, status) - 修改订单状态
4. get_stats() - 获取统计数据
5. query_product(productId) - 查询商品
6. update_product_price(productId, price) - 修改商品价格

请用 JSON 格式回复，格式如下：
{
  "tool": "工具名称",
  "params": {
    "orderId": "订单号",
    "productId": "商品ID",
    "price": 99.9,
    "status": "shipped"
  },
  "message": "友好的回复内容"
}

如果不明确，先询问用户更多信息。`;

    var messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    var response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      return res.json(directResult); // AI 失败，返回直接解析结果
    }

    var data = await response.json();
    var aiResponse = data.choices?.[0]?.message?.content || '';

    // 尝试解析 AI 返回的 JSON
    try {
      var jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        var toolCall = JSON.parse(jsonMatch[0]);
        
        // 执行工具调用
        var toolResult = null;
        if (toolCall.tool === 'query_order' && toolCall.params?.orderId) {
          var order = findOrder(toolCall.params.orderId);
          if (order) {
            toolResult = { success: true, message: `✅ 找到订单：\n订单号：${order.id}\n状态：${order.status}\n金额：¥${order.total}`, data: order };
          } else {
            toolResult = { success: false, message: '❌ 未找到订单' };
          }
        } else if (toolCall.tool === 'update_order_price' && toolCall.params?.orderId && toolCall.params?.price) {
          toolResult = updateOrderPrice(toolCall.params.orderId, toolCall.params.price);
        } else if (toolCall.tool === 'update_order_status' && toolCall.params?.orderId) {
          toolResult = updateOrderStatus(toolCall.params.orderId, toolCall.params?.status || 'shipped');
        } else if (toolCall.tool === 'get_stats') {
          var stats = getStats();
          toolResult = { success: true, message: `📊 统计数据：\n商品：${stats.totalProducts}\n订单：${stats.totalOrders}\n收入：¥${stats.totalRevenue.toFixed(2)}`, data: stats };
        } else if (toolCall.tool === 'query_product' && toolCall.params?.productId) {
          var product = findProduct(toolCall.params.productId);
          if (product) {
            toolResult = { success: true, message: `✅ 找到商品：${product.name} - ¥${product.price}`, data: product };
          } else {
            toolResult = { success: false, message: '❌ 未找到商品' };
          }
        } else if (toolCall.tool === 'update_product_price' && toolCall.params?.productId && toolCall.params?.price) {
          toolResult = updateProductPrice(toolCall.params.productId, toolCall.params.price);
        }

        if (toolResult) {
          return res.json(toolResult);
        }
      }
    } catch (e) {
      // JSON 解析失败，使用 AI 直接回复
    }

    return res.json({
      success: true,
      message: aiResponse || directResult.message,
      action: 'chat'
    });

  } catch (error) {
    console.error('[AI Webhook] Error:', error);
    return res.status(500).json({ success: false, message: '系统错误' });
  }
});

// 简化版指令 API（直接解析）
app.post('/api/ai/instruction', async function(req, res) {
  try {
    var { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: '缺少消息内容' });
    }
    
    var result = parseAndExecuteInstruction(message);
    return res.json(result);
    
  } catch (error) {
    console.error('[AI Instruction] Error:', error);
    return res.status(500).json({ success: false, message: '系统错误' });
  }
});

// ==================== 管理员申请系统 ====================
const adminRequests = new Map(); // 内存存储申请（生产环境应使用数据库）

// 提交管理员申请
app.post('/api/admin/request', async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ success: false, error: '请提供有效的申请理由（至少5个字符）' });
    }
    
    const requestId = 'REQ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    
    // 保存申请
    adminRequests.set(requestId, {
      id: requestId,
      reason: reason.trim(),
      status: 'pending',
      tempPassword: null,
      createdAt: new Date().toISOString(),
      ip: req.ip || 'unknown'
    });
    
    console.log('[Admin Request] 新的管理员申请已提交:', requestId);
    console.log('[Admin Request] 请让 AI 助手通过此命令批准或拒绝申请');
    
    res.json({
      success: true,
      requestId: requestId,
      message: '申请已提交，请等待审核'
    });
  } catch (error) {
    console.error('[Admin Request] Error:', error);
    res.status(500).json({ success: false, error: '提交申请失败' });
  }
});

// 查询申请状态
app.get('/api/admin/request/:id/status', async (req, res) => {
  try {
    const requestId = req.params.id;
    const request = adminRequests.get(requestId);
    
    if (!request) {
      return res.status(404).json({ success: false, error: '申请不存在' });
    }
    
    const response = {
      status: request.status
    };
    
    if (request.status === 'approved') {
      response.tempPassword = request.tempPassword;
    } else if (request.status === 'rejected' && request.rejectReason) {
      response.reason = request.rejectReason;
    }
    
    res.json(response);
  } catch (error) {
    console.error('[Admin Request Status] Error:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

// 使用临时密码登录
app.post('/api/admin/login', async (req, res) => {
  try {
    const { tempPassword } = req.body;
    
    if (!tempPassword) {
      return res.status(400).json({ success: false, error: '请提供临时密码' });
    }
    
    // 查找匹配的申请
    let approvedRequest = null;
    for (const [id, reqData] of adminRequests) {
      if (reqData.status === 'approved' && reqData.tempPassword === tempPassword) {
        approvedRequest = reqData;
        break;
      }
    }
    
    if (!approvedRequest) {
      return res.status(401).json({ success: false, error: '临时密码无效或已过期' });
    }
    
    // 生成管理员用户
    const adminUser = {
      id: 'admin-' + Date.now(),
      username: 'admin',
      email: 'admin@kdxzhx.com',
      phone: '',
      role: 'admin',
      isAdmin: true,
      grantedAt: new Date().toISOString()
    };
    
    // 标记为已使用（删除申请）
    adminRequests.delete(approvedRequest.id);
    
    res.json({
      success: true,
      user: adminUser,
      token: 'admin-token-' + Date.now()
    });
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    res.status(500).json({ success: false, error: '登录失败' });
  }
});

// AI 助手使用的批准/拒绝 API（内部使用，实际生产环境应该有安全验证）
app.post('/api/admin/request/:id/approve', async (req, res) => {
  try {
    const requestId = req.params.id;
    const request = adminRequests.get(requestId);
    
    if (!request) {
      return res.status(404).json({ success: false, error: '申请不存在' });
    }
    
    // 生成临时密码
    const tempPassword = Math.random().toString(36).substr(2, 8).toUpperCase();
    
    // 更新申请状态
    request.status = 'approved';
    request.tempPassword = tempPassword;
    request.approvedAt = new Date().toISOString();
    
    console.log('[Admin Request] 申请已批准:', requestId);
    console.log('[Admin Request] 临时密码:', tempPassword);
    
    res.json({
      success: true,
      message: '申请已批准',
      tempPassword: tempPassword
    });
  } catch (error) {
    console.error('[Admin Approve] Error:', error);
    res.status(500).json({ success: false, error: '批准失败' });
  }
});

app.post('/api/admin/request/:id/reject', async (req, res) => {
  try {
    const requestId = req.params.id;
    const { reason } = req.body;
    const request = adminRequests.get(requestId);
    
    if (!request) {
      return res.status(404).json({ success: false, error: '申请不存在' });
    }
    
    request.status = 'rejected';
    request.rejectReason = reason || '申请未被批准';
    request.rejectedAt = new Date().toISOString();
    
    console.log('[Admin Request] 申请已拒绝:', requestId);
    
    res.json({
      success: true,
      message: '申请已拒绝'
    });
  } catch (error) {
    console.error('[Admin Reject] Error:', error);
    res.status(500).json({ success: false, error: '拒绝失败' });
  }
});

// 获取所有待处理的申请（供 AI 助手查看）
app.get('/api/admin/requests', async (req, res) => {
  try {
    const requests = [];
    for (const [id, reqData] of adminRequests) {
      requests.push({
        id: reqData.id,
        reason: reqData.reason,
        status: reqData.status,
        createdAt: reqData.createdAt,
        ip: reqData.ip
      });
    }
    
    res.json({ success: true, requests: requests });
  } catch (error) {
    console.error('[Admin Requests List] Error:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

module.exports = serverless(app);

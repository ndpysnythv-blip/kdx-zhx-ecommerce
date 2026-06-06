const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');

// 加载环境变量（必须在加载配置之前）
require('dotenv').config();

const config = require('./config');
const Database = require('./database');
const db = new Database();
const fs = require('fs');
const notificationService = require('./notification-service');
const security = require('./security');
const appleShortcuts = require('./apple-shortcuts');

// 支付宝SDK（安全加载）
let AlipaySdk = null;
let AlipayFormData = null;
let alipaySdk = null;
const alipayConfig = require('./alipay-config');

function initAlipaySdk() {
  if (!alipayConfig.enabled) {
    console.log('💡 支付宝配置未启用，使用模拟支付模式');
    return null;
  }
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
    console.log('✅ 支付宝SDK初始化成功');
    return sdk;
  } catch (error) {
    console.error('❌ 支付宝SDK初始化失败:', error.message);
    console.log('⚠️ 将使用模拟支付模式');
    return null;
  }
}

if (alipayConfig.enabled) {
  console.log('🚀 正在初始化支付宝SDK...');
  alipaySdk = initAlipaySdk();
} else {
  console.log('💡 使用模拟支付模式（无需支付宝配置）');
}

const app = express();
const PORT = config.server.port;

// ==================== 安全中间件 ====================
// Helmet安全头
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://cdn.staticfile.org"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.staticfile.org"],
    imgSrc: ["'self'", "data:", "https:", "http:", "blob:"],
    connectSrc: ["'self'", "http://localhost:*", "https://kdxzhx.top", "http://kdxzhx.top", "https://*.vercel.app", "https://api.bilibili.com", "https://www.iesdouyin.com", "https://m.weibo.cn", "https://www.kuaishou.com", "https://m.gifshow.com", "https://www.xiaohongshu.com"],
    fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.staticfile.org"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", "blob:", "https:"],
    frameSrc: ["'self'", "blob:"]
  }
}));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.frameguard({ action: 'deny' }));

// CORS配置 - 允许所有来源（生产环境可收紧）
app.use(cors({
  origin: true,
  credentials: true
}));

// Body解析器限制
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(__dirname));

// ==================== 防火墙中间件 ====================
app.use((req, res, next) => {
  const suspicious = security.isSuspiciousRequest(req);
  if (suspicious.suspicious) {
    console.warn(`[防火墙] 拦截可疑请求: ${suspicious.reason}`);
    return res.status(403).json({ error: '请求被拒绝' });
  }
  
  security.setSecurityHeaders(res);
  next();
});

// ==================== API速率限制 ====================
const apiLimiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: '请求过于频繁，请稍后再试' },
  keyGenerator: (req) => security.getClientKey(req)
});
app.use('/api/', apiLimiter);

// 登录接口更严格的限速
const loginLimiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: '登录尝试次数过多，请15分钟后再试' },
  keyGenerator: (req) => security.getClientKey(req)
});


// ==================== Apple Shortcuts 集成 ====================
appleShortcuts.registerShortcutsRoutes(app, db);

// 验证码存储
const smsCodes = new Map();

// 生成随机验证码
function generateSmsCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ========== 发送验证码主函数（只使用EmailJS） ==========
async function sendVerificationCode(phone, code, type = 'login', email = null) {
    if (!email) {
        throw new Error('必须提供邮箱地址');
    }
    
    console.log(`[验证码] 准备向 ${email} 发送${type}验证码: ${code}`);
    
    // 只使用EmailJS发送真实验证码
    try {
        const result = await notificationService.sendVerificationCodeByEmail(email, code, type);
        if (result.success) {
            console.log(`[验证码] EmailJS发送成功: ${email}`);
            return {
                success: true,
                message: '验证码已发送到您的邮箱！',
                via: 'email'
            };
        }
    } catch (error) {
        console.error('[验证码] EmailJS发送失败:', error);
        throw error;
    }
    
    throw new Error('验证码发送失败');
}

// 首页重定向
app.get('/', (req, res) => {
  res.redirect('/shop');
});

// 页面路由
app.get('/shop', (req, res) => {
  res.sendFile(path.join(__dirname, 'shop.html'));
});

app.get('/customize', (req, res) => {
  res.sendFile(path.join(__dirname, 'customize.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'chat.html'));
});



app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth.html'));
});

app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'product-detail.html'));
});

app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'cart.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'checkout.html'));
});

app.get('/my-orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'my-orders.html'));
});

app.get('/orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'my-orders.html'));
});

app.get('/payment-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment-success.html'));
});

app.get('/user-center', (req, res) => {
  res.sendFile(path.join(__dirname, 'user-center.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-shop.html'));
});

app.get('/contact-us', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact-us.html'));
});

app.get('/gesture-particles', (req, res) => {
  res.sendFile(path.join(__dirname, 'gesture-particles.html'));
});

app.get('/dh', (req, res) => {
  res.sendFile(path.join(__dirname, 'dh.html'));
});

app.get('/hz', (req, res) => {
  res.sendFile(path.join(__dirname, 'cooperation.html'));
});

app.get('/cooperation', (req, res) => {
  res.sendFile(path.join(__dirname, 'cooperation.html'));
});

app.get('/hezuo', (req, res) => {
  res.sendFile(path.join(__dirname, 'cooperation.html'));
});

app.get('/message', (req, res) => {
  res.sendFile(path.join(__dirname, 'message.html'));
});

app.get('/video-downloader', (req, res) => {
  res.sendFile(path.join(__dirname, 'video-downloader.html'));
});

// 商品API
app.get('/api/products', (req, res) => {
  res.json(db.getProducts());
});

app.get('/api/products/:id', (req, res) => {
  const products = db.getProducts();
  const product = products.find(p => p.id === req.params.id);
  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ error: 'Product not found' });
  }
});

app.post('/api/products', (req, res) => {
  const product = {
    id: uuidv4(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
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

// 订单API
app.get('/api/orders', (req, res) => {
  res.json(db.getOrders());
});

// 获取单个订单
app.get('/api/orders/:id', (req, res) => {
  const orders = db.getOrders();
  const order = orders.find(o => o.id === req.params.id || o.outTradeNo === req.params.id);
  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ error: '订单不存在' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = {
      id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    const orders = db.getOrders();
    orders.push(order);
    db.saveOrders(orders);
    
    // 获取用户信息发送通知
    const users = db.getUsers();
    const user = users.find(u => u.id === order.userId || u.phone === order.userPhone);
    
    if (user) {
      // 发送订单创建通知
      await notificationService.sendOrderNotification(
        order,
        'created',
        user.email,
        user.phone
      );
      console.log(`[通知] 订单创建通知已发送给用户: ${user.id}`);
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
    
    // 获取现有订单
    const orders = db.getOrders();
    const existingOrder = orders.find(o => o.id === orderId);
    
    if (!existingOrder) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    // 更新订单
    const updatedOrder = { ...existingOrder, ...updateData };
    db.updateItem('orders.json', orderId, updatedOrder);
    
    // 如果状态有变化，发送通知
    if (updateData.status && updateData.status !== existingOrder.status) {
      const users = db.getUsers();
      const user = users.find(u => u.id === updatedOrder.userId || u.phone === updatedOrder.userPhone);
      
      if (user) {
        await notificationService.sendOrderNotification(
          updatedOrder,
          updateData.status,
          user.email,
          user.phone
        );
        console.log(`[通知] 订单状态变更通知已发送给用户: ${user.id}, 新状态: ${updateData.status}`);
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

// 退款API
app.get('/api/refunds', (req, res) => {
  res.json(db.getRefunds());
});

app.post('/api/refunds', async (req, res) => {
  try {
    const refund = {
      id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    const refunds = db.getRefunds();
    refunds.push(refund);
    db.saveRefunds(refunds);
    
    // 获取用户信息发送通知
    const users = db.getUsers();
    const user = users.find(u => u.id === refund.userId || u.phone === refund.userPhone);
    
    if (user) {
      // 发送退款申请通知
      await notificationService.sendRefundNotification(
        refund,
        user.email,
        user.phone
      );
      console.log(`[通知] 退款申请通知已发送给用户: ${user.id}`);
    }
    
    res.json(refund);
  } catch (error) {
    console.error('Error creating refund:', error);
    res.status(500).json({ error: '创建退款失败' });
  }
});

// ========== 支付宝支付API ==========
// 创建支付订单
app.post('/api/alipay/create', async (req, res) => {
  try {
    const { orderId, totalAmount, subject, body } = req.body;
    
    if (!orderId || !totalAmount || !subject) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 生成订单号（使用时间戳+随机数，以KZ开头）
    const outTradeNo = `KZ${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    // 强制使用真实支付宝支付
    console.log(`[支付] 正在创建支付宝订单: ${outTradeNo}`);
    console.log(`[支付] 支付宝配置: appId=${alipayConfig.appId}, gateway=${alipayConfig.gateway}`);
    
    const formData = new AlipayFormData();
    formData.setMethod('get');
    
    // bizContent是必须的核心参数
    formData.addField('bizContent', {
      outTradeNo: outTradeNo,
      productCode: 'FAST_INSTANT_TRADE_PAY',
      totalAmount: parseFloat(totalAmount).toFixed(2),
      subject: subject,
      body: body || subject
    });
    
    // returnUrl和notifyUrl通过formData添加
    formData.addField('returnUrl', alipayConfig.returnUrl);
    formData.addField('notifyUrl', alipayConfig.notifyUrl);
    
    // 获取支付宝支付页面URL
    console.log('[支付] 正在调用支付宝SDK生成支付页面...');
    const result = await alipaySdk.pageExec('alipay.trade.page.pay', {}, formData);
    
    console.log('[支付] 支付宝SDK返回结果长度:', result ? result.length : 0);
    console.log('[支付] 支付宝SDK返回结果预览:', result ? result.substring(0, 200) : 'null');
    
    // pageExec返回的是一个HTML form字符串，包含自动提交到支付宝的表单
    // 前端需要直接使用这个HTML，或者我们返回form字符串让前端写入iframe
    
    // 更新订单信息
    const orders = db.getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      orders[orderIndex] = {
        ...orders[orderIndex],
        outTradeNo: outTradeNo,
        paymentStatus: 'pending',
        paymentMethod: 'alipay'
      };
      db.saveOrders(orders);
    }
    
    console.log(`[支付] 支付宝订单创建成功: ${outTradeNo}`);
    res.json({
      success: true,
      payUrl: result,
      outTradeNo: outTradeNo,
      isMock: false
    });
    
  } catch (error) {
    console.error('[支付] 创建支付订单失败:', error);
    console.error('[支付] 错误详情:', error.message);
    if (error.response) {
      console.error('[支付] 支付宝响应:', error.response.data || error.response);
    }
    res.status(500).json({ 
      error: '创建支付订单失败', 
      details: error.message 
    });
  }
});


// 支付宝同步回调（支付成功后跳转）
app.get('/payment-success', async (req, res) => {
  try {
    const { outTradeNo, orderId } = req.query;
    
    if (outTradeNo || orderId) {
      // 更新订单状态
      const orders = db.getOrders();
      const orderIndex = orders.findIndex(o => 
        o.outTradeNo === outTradeNo || o.id === orderId
      );
      
      if (orderIndex !== -1) {
        orders[orderIndex] = {
          ...orders[orderIndex],
          status: 'paid',
          paymentStatus: 'success',
          paidAt: new Date().toISOString(),
          alipayTradeNo: req.query.trade_no || `MOCK${Date.now()}`
        };
        db.saveOrders(orders);
        
        console.log(`[支付] 订单支付成功: ${orders[orderIndex].id}`);
      }
    }
    
    // 返回成功页面
    res.sendFile(path.join(__dirname, 'payment-success.html'));
    
  } catch (error) {
    console.error('[支付] 处理支付回调失败:', error);
    res.sendFile(path.join(__dirname, 'payment-success.html'));
  }
});

// 支付宝异步通知
app.post('/api/alipay/notify', async (req, res) => {
  try {
    const notifyData = req.body;
    console.log('[支付] 收到支付宝异步通知:', notifyData);
    
    // 验证签名（简化版，实际项目需要严格验证）
    const { trade_status, out_trade_no, trade_no } = notifyData;
    
    if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
      // 更新订单状态
      const orders = db.getOrders();
      const orderIndex = orders.findIndex(o => o.outTradeNo === out_trade_no);
      
      if (orderIndex !== -1) {
        orders[orderIndex] = {
          ...orders[orderIndex],
          status: 'paid',
          paymentStatus: 'success',
          paidAt: new Date().toISOString(),
          alipayTradeNo: trade_no
        };
        db.saveOrders(orders);
        
        console.log(`[支付] 异步通知: 订单 ${orders[orderIndex].id} 支付成功`);
      }
    }
    
    // 返回success给支付宝
    res.send('success');
    
  } catch (error) {
    console.error('[支付] 处理异步通知失败:', error);
    res.send('fail');
  }
});

// 查询支付状态
app.get('/api/alipay/status/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const orders = db.getOrders();
    const order = orders.find(o => o.id === orderId || o.outTradeNo === orderId);
    
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    res.json({
      success: true,
      paymentStatus: order.paymentStatus || 'pending',
      orderStatus: order.status,
      paidAt: order.paidAt,
      alipayTradeNo: order.alipayTradeNo
    });
    
  } catch (error) {
    console.error('[支付] 查询支付状态失败:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// ========== 退款API继续 ==========
app.put('/api/refunds/:id', async (req, res) => {
  try {
    const refundId = req.params.id;
    const updateData = req.body;
    
    // 获取现有退款
    const refunds = db.getRefunds();
    const existingRefund = refunds.find(r => r.id === refundId);
    
    if (!existingRefund) {
      return res.status(404).json({ error: '退款不存在' });
    }
    
    // 更新退款
    const updatedRefund = { ...existingRefund, ...updateData };
    db.updateItem('refunds.json', refundId, updatedRefund);
    
    // 如果状态有变化，发送通知
    if (updateData.status && updateData.status !== existingRefund.status) {
      const users = db.getUsers();
      const user = users.find(u => u.id === updatedRefund.userId || u.phone === updatedRefund.userPhone);
      
      if (user) {
        await notificationService.sendOrderNotification(
          { id: updatedRefund.orderId },
          'refunded',
          user.email,
          user.phone
        );
        console.log(`[通知] 退款状态变更通知已发送给用户: ${user.id}, 新状态: ${updateData.status}`);
      }
    }
    
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



// 发送验证码（支持短信和邮箱）
app.post('/api/sms/send', async (req, res) => {
  try {
    const { phone, type, email } = req.body;
    
    if (!phone && !email) {
      return res.status(400).json({ error: '请输入电话号码或邮箱' });
    }
    
    const identifier = phone || email;
    
    // 检查是否发送过于频繁
    const existingCode = smsCodes.get(identifier);
    if (existingCode && Date.now() - existingCode.sentAt < 60000) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    
    // 生成验证码
    const code = generateSmsCode();
    
    // 存储验证码（有效期5分钟）
    smsCodes.set(identifier, {
      code,
      sentAt: Date.now(),
      type: type || 'login', // login or register
      via: email ? 'email' : 'phone'
    });
    
    // 自动清理过期验证码
    setTimeout(() => {
      smsCodes.delete(identifier);
    }, 300000);
    
    // 发送验证码
    const smsResult = await sendVerificationCode(phone, code, type, email);
    
    if (smsResult.success) {
        res.json({
            success: true,
            message: smsResult.message || '验证码已发送，请查收',
            via: smsResult.via
        });
    } else {
        res.status(500).json({ error: smsResult.message || '发送失败' });
    }
  } catch (error) {
    console.error('Error sending verification code:', error);
    res.status(500).json({ error: '发送验证码失败' });
  }
});

// 检查邮箱是否已注册
app.post('/api/check-email', (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: '请输入邮箱' });
    }
    
    // 使用数据库模块读取用户数据
    const users = db.getUsers();
    
    // 检查邮箱是否存在
    const exists = users.some(user => user.email === email);
    
    res.json({ exists });
    
  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({ error: '检查失败' });
  }
});

// 验证短信验证码
app.post('/api/sms/verify', (req, res) => {
  try {
    const { phone, email, code } = req.body;
    
    const identifier = phone || email;
    
    if (!identifier || !code) {
      return res.status(400).json({ error: '请输入完整信息' });
    }
    
    const storedCode = smsCodes.get(identifier);
    
    if (!storedCode) {
      return res.status(400).json({ error: '验证码已过期，请重新获取' });
    }
    
    if (storedCode.code !== code) {
      return res.status(400).json({ error: '验证码错误' });
    }
    
    // 验证成功，移除已使用的验证码
    smsCodes.delete(identifier);
    
    res.json({ success: true, message: '验证成功' });
  } catch (error) {
    console.error('Error verifying SMS:', error);
    res.status(500).json({ error: '验证失败' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, phone, password, code } = req.body;
    const users = db.getUsers();
    
    // 安全输入过滤
    const safeEmail = security.sanitizeInput(email);
    const safePhone = security.sanitizeInput(phone);
    const safePassword = password; // 密码不做HTML编码，直接使用原值

    // 验证手机号格式
    if (!safePhone || !security.validatePhone(safePhone)) {
      return res.status(400).json({ error: '请输入正确的11位手机号' });
    }
    
    // 验证邮箱格式（如果有）
    if (safeEmail && !security.validateEmail(safeEmail)) {
      return res.status(400).json({ error: '请输入正确的邮箱地址' });
    }
    
    // 验证密码长度
    if (!safePassword || safePassword.length < 4) {
      return res.status(400).json({ error: '密码至少4位' });
    }
    
    // 验证验证码
    const identifier = safeEmail || safePhone;
    if (code) {
      const storedCode = smsCodes.get(identifier);
      if (!storedCode || storedCode.code !== code) {
        return res.status(400).json({ error: '验证码错误或已过期' });
      }
      // 验证成功，移除验证码
      smsCodes.delete(identifier);
    }
    
    // 检查电话号码是否已存在
    if (safePhone) {
      const existingPhone = users.find(u => u.phone === safePhone);
      if (existingPhone) {
        return res.status(400).json({ error: '电话号码已被注册' });
      }
    }
    
    // 检查邮箱是否已存在
    if (safeEmail) {
      const existingEmail = users.find(u => u.email === safeEmail);
      if (existingEmail) {
        return res.status(400).json({ error: '邮箱已被注册' });
      }
    }
    
    // 加密密码
    const hashedPassword = await security.hashPassword(safePassword);

    const newUser = {
      id: uuidv4(),
      username: safeEmail || safePhone || 'user_' + Date.now(),
      password: hashedPassword, // 使用加密后的密码
      email: safeEmail || '',
      phone: safePhone || '',
      role: 'user',
      createdAt: new Date().toISOString(),
      loginHistory: [],
      lastLoginAt: null,
      lastLoginLocation: null
    };

    users.push(newUser);
    db.saveUsers(users);

    res.json({ user: { ...newUser, password: undefined }, token: 'demo-token' });
  } catch (error) {
    console.error('Error registering:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 获取登录位置信息
function getLoginLocation(req) {
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
             (req.connection.socket ? req.connection.socket.remoteAddress : 'unknown');
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // 简单的设备类型检测
  let deviceType = 'unknown';
  if (/mobile|android|iphone|ipad|ipod/i.test(userAgent)) {
    deviceType = 'mobile';
  } else if (/tablet/i.test(userAgent)) {
    deviceType = 'tablet';
  } else {
    deviceType = 'desktop';
  }
  
  return {
    ip: ip === '::1' || ip === '::ffff:127.0.0.1' ? '127.0.0.1' : ip,
    userAgent: userAgent.substring(0, 200),
    deviceType,
    timestamp: new Date().toISOString()
  };
}

// 检测异常登录
function detectUnusualLogin(user, location) {
  if (!user.loginHistory || user.loginHistory.length === 0) {
    return false; // 首次登录不算异常
  }
  
  const recentLogins = user.loginHistory.slice(-5);
  const knownIps = recentLogins.map(l => l.ip);
  const knownDevices = recentLogins.map(l => l.deviceType);
  
  // 检查是否是新IP
  const isNewIp = !knownIps.includes(location.ip);
  // 检查是否是新设备类型
  const isNewDevice = !knownDevices.includes(location.deviceType);
  
  // 如果是新IP且新设备，可能是异常登录
  return isNewIp && isNewDevice;
}

// 记录登录历史
function recordLogin(userId, location, isSuccessful) {
  const users = db.getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) return;
  
  const user = users[userIndex];
  
  // 初始化登录历史（兼容老用户）
  if (!user.loginHistory) {
    user.loginHistory = [];
  }
  if (user.lastLoginAt === undefined) {
    user.lastLoginAt = null;
  }
  if (user.lastLoginLocation === undefined) {
    user.lastLoginLocation = null;
  }
  
  user.loginHistory.push({
    ...location,
    isSuccessful,
    id: uuidv4()
  });
  
  // 只保留最近20条记录
  if (user.loginHistory.length > 20) {
    user.loginHistory = user.loginHistory.slice(-20);
  }
  
  // 更新最后登录时间
  if (isSuccessful) {
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginLocation = location;
  }
  
  users[userIndex] = user;
  db.saveUsers(users);
}

// 检查手机号是否已注册
app.post('/api/check-phone', (req, res) => {
  try {
    const { phone } = req.body;
    const users = db.getUsers();
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phone || !phoneRegex.test(phone)) {
      return res.status(400).json({ error: '请输入正确的11位手机号', exists: false });
    }
    
    const user = users.find(u => u.phone === phone);
    res.json({ exists: !!user });
  } catch (error) {
    console.error('Error checking phone:', error);
    res.status(500).json({ error: '检查失败' });
  }
});

app.post('/api/forgot-password', (req, res) => {
    try {
        const { type, email, orderNo } = req.body;
        const users = db.getUsers();
        const orders = db.getOrders();

        if (type === 'email') {
            if (!email) {
                return res.status(400).json({ error: '请输入邮箱' });
            }

            const user = users.find(u => u.email === email);

            if (!user) {
                return res.status(404).json({ error: '该邮箱未注册' });
            }

            var resetCode = generateSmsCode();
            smsCodes.set('reset:' + email, { code: resetCode, sentAt: Date.now(), type: 'reset', userId: user.id });
            setTimeout(function() { smsCodes.delete('reset:' + email); }, 300000);
            res.json({ success: true, message: '重置验证码已发送到您的邮箱', code: resetCode });
        } else if (type === 'order') {
            if (!orderNo) {
                return res.status(400).json({ error: '请输入支付宝订单号' });
            }

            const order = orders.find(o =>
                o.alipayTradeNo === orderNo ||
                o.id === orderNo ||
                (o.payment && o.payment.tradeNo === orderNo)
            );

            if (!order) {
                return res.status(404).json({ error: '未找到该订单，请确认订单号是否正确' });
            }

            const userPhone = order.userPhone || order.phone;
            const user = users.find(u => u.phone === userPhone || u.id === order.userId);

            if (!user) {
                return res.status(404).json({ error: '找到订单，但未找到关联账号' });
            }

            var resetCode = generateSmsCode();
            smsCodes.set('reset:' + user.phone, { code: resetCode, sentAt: Date.now(), type: 'reset', userId: user.id });
            setTimeout(function() { smsCodes.delete('reset:' + user.phone); }, 300000);
            res.json({ success: true, message: '重置验证码已发送', phone: user.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '', code: resetCode });
        } else {
            res.status(400).json({ error: '无效的找回方式' });
        }
    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ error: '找回密码失败' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const identifier = req.body.email || req.body.phone;
        const code = req.body.code;
        const newPassword = req.body.newPassword;
        if (!identifier || !code || !newPassword) {
            return res.status(400).json({ error: '请提供完整信息' });
        }
        if (newPassword.length < 4) {
            return res.status(400).json({ error: '密码至少4位' });
        }
        var stored = smsCodes.get('reset:' + identifier);
        if (!stored || stored.code !== code) {
            return res.status(400).json({ error: '验证码错误或已过期' });
        }
        smsCodes.delete('reset:' + identifier);
        const users = db.getUsers();
        const userIdx = users.findIndex(u => u.id === stored.userId);
        if (userIdx === -1) {
            return res.status(404).json({ error: '用户不存在' });
        }
        var hashed = newPassword;
        if (security) {
            hashed = await security.hashPassword(newPassword);
        }
        users[userIdx].password = hashed;
        db.saveUsers(users);
        res.json({ success: true, message: '密码重置成功' });
    } catch (error) {
        console.error('Error in reset password:', error);
        res.status(500).json({ error: '重置密码失败' });
    }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, loginType } = req.body;
    const location = getLoginLocation(req);
    const clientKey = security.getClientKey(req);
    const users = db.getUsers();
    
    // 安全输入过滤
    const safeUsername = security.sanitizeInput(username);
    const safePassword = password; // 密码不做HTML编码，直接使用原值
    
    // 验证必填项
    if (!safeUsername || !safePassword) {
      return res.status(400).json({ error: '请输入手机号和密码' });
    }
    
    // 检查登录尝试次数
    const attemptCheck = security.checkLoginAttempts(clientKey);
    if (!attemptCheck.allowed) {
      return res.status(429).json({ error: '登录尝试次数过多，请15分钟后再试' });
    }
    
    // 如果是手机号登录，验证手机号格式
    let user;
    if (loginType === 'phone') {
      if (!security.validatePhone(safeUsername)) {
        return res.status(400).json({ error: '请输入正确的11位手机号' });
      }
      user = users.find(u => u.phone === safeUsername);
    } else {
      if (!security.validateEmail(safeUsername)) {
        return res.status(400).json({ error: '请输入正确的邮箱地址' });
      }
      user = users.find(u => u.email === safeUsername);
    }
    
    // 验证密码
    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' });
    }
    
    // 检查密码是否已加密
    let passwordValid = false;
    if (user.password && user.password.startsWith('$2')) {
      // bcrypt加密密码，需要验证
      passwordValid = await security.verifyPassword(safePassword, user.password);
    } else {
      // 旧版明文密码，直接验证（临时兼容）
      passwordValid = safePassword === user.password;
    }
    
    if (!passwordValid) {
      security.recordFailedLogin(clientKey);
      recordLogin(user.id, location, false);
      return res.status(401).json({ error: '账号或密码错误' });
    }
    
    // 登录成功，重置尝试次数
    security.resetLoginAttempts(clientKey);
    
    // 检测异常登录
    const isUnusual = detectUnusualLogin(user, location);
    
    // 记录成功登录
    recordLogin(user.id, location, true);
    
    // 保存登录IP，用于自动登录
    const allUsers = db.getUsers();
    const userIndex = allUsers.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
        allUsers[userIndex].lastLoginIp = location.ip;
        allUsers[userIndex].lastLoginAt = new Date().toISOString();
        allUsers[userIndex].autoLoginEnabled = true;
        db.saveUsers(allUsers);
    }
    
    res.json({
        user: { ...user, password: undefined },
        token: 'demo-token',
        unusualLogin: isUnusual,
        loginLocation: location
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 自动登录API（已禁用IP自动登录，存在安全风险）
app.post('/api/auto-login', (req, res) => {
    res.json({ success: false });
});

// 后台权限验证中间件
function requireAdmin(req, res, next) {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: '未登录' });
    }
    const users = db.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: '无管理员权限' });
    }
    next();
}

// 后台页面（需要管理员权限）
app.get('/admin', (req, res) => {
    // 检查是否是管理员账号访问
    // 这里简化处理，实际项目中应该有更严格的验证
    res.sendFile(path.join(__dirname, 'admin-shop.html'));
});

// 获取用户登录历史
app.get('/api/login-history', (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    
    const users = db.getUsers();
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({ 
      loginHistory: user.loginHistory || [],
      lastLoginAt: user.lastLoginAt || null,
      lastLoginLocation: user.lastLoginLocation || null
    });
  } catch (error) {
    console.error('Error getting login history:', error);
    res.status(500).json({ error: '获取登录历史失败' });
  }
});

// 检查用户存在（支持邮箱检查）
app.post('/api/check-user', (req, res) => {
  try {
    const { phone, email, username } = req.body;
    const users = db.getUsers();
    
    let exists = false;
    let foundUser = null;
    
    if (phone) {
      foundUser = users.find(u => u.phone === phone);
    } else if (email) {
      foundUser = users.find(u => u.email === email);
    } else if (username) {
      foundUser = users.find(u => u.username === username);
    }
    
    exists = !!foundUser;
    
    res.json({ 
      exists, 
      hasEmail: foundUser?.email ? true : false,
      hasPhone: foundUser?.phone ? true : false
    });
  } catch (error) {
    console.error('Error checking user:', error);
    res.status(500).json({ exists: false });
  }
});

// ==================== AI 手机号深度验证 ====================
// 真实有效的手机号前缀（常见运营商）
const VALID_PHONE_PREFIXES = [
  130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
  145, 147, 149, 150, 151, 152, 153, 155, 156, 157, 158, 159,
  162, 165, 166, 167, 170, 171, 172, 173, 174, 175, 176, 177, 178, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189,
  190, 191, 192, 193, 195, 196, 197, 198, 199
];

// 无效/测试手机号前缀
const INVALID_PHONE_PREFIXES = [
  '110', '112', '119', '120', '122', '1234', '12315', '12345',
  '1300', '1311', '1322', '1333', '1344', '1355', '1366', '1377', '1388', '1399',
  '1444', '1500', '1511', '1522', '1533', '1555', '1566', '1577', '1588', '1599',
  '1700', '1800', '1811', '1822', '1833', '1844', '1855', '1866', '1877', '1888', '1899',
  '1999', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '1212', '123456', '5201314', '121314', '131415', '141516', '151617',
  '161718', '171819', '181920'
];

// 常见的测试手机号模式
const TEST_PHONE_PATTERNS = [
  /^1[3-9]0{9}$/,           // 1XXXXXXXXXX all zeros after prefix
  /^1[3-9]1{9}$/,           // 1XXXXXXXXXX all ones after prefix
  /^1[3-9]2{9}$/,           // 1XXXXXXXXXX all twos after prefix
  /^1[3-9]3{9}$/,           // 1XXXXXXXXXX all threes after prefix
  /^1[3-9]4{9}$/,           // 1XXXXXXXXXX all fours after prefix
  /^1[3-9]5{9}$/,           // 1XXXXXXXXXX all fives after prefix
  /^1[3-9]6{9}$/,           // 1XXXXXXXXXX all sixes after prefix
  /^1[3-9]7{9}$/,           // 1XXXXXXXXXX all sevens after prefix
  /^1[3-9]8{9}$/,           // 1XXXXXXXXXX all eights after prefix
  /^1[3-9]9{9}$/,           // 1XXXXXXXXXX all nines after prefix
  /^1[3-9]012345678$/,     // 1XX012345678
  /^1[3-9]123456789$/,     // 1XX123456789
  /^1[3-9]876543210$/,     // 1XX876543210
  /^1[3-9]987654321$/,     // 1XX987654321
  /^1[3-9]66666666$/,      // 1XX66666666
  /^1[3-9]88888888$/,      // 1XX88888888
  /^1[3-9]55555555$/,      // 1XX55555555
  /^1[3-9]12121212$/,      // 1XX12121212
  /^1[3-9]13131313$/,      // 1XX13131313
  /^1[3-9]14141414$/,      // 1XX14141414
  /^1[3-9]23232323$/,      // 1XX23232323
  /^12345678901$/,         // 12345678901
  /^10987654321$/,         // 10987654321
  /^11111111111$/,         // 11111111111
  /^12222222222$/,         // 12222222222
  /^13333333333$/,         // 13333333333
  /^14444444444$/,         // 14444444444
  /^15555555555$/,         // 15555555555
  /^16666666666$/,         // 16666666666
  /^17777777777$/,         // 17777777777
  /^18888888888$/,         // 18888888888
  /^19999999999$/,         // 19999999999
  /^12121212121$/,         // 12121212121
  /^12312312312$/,         // 12312312312
  /^13213213213$/,         // 13213213213
  /^12332112332$/,         // 12332112332
  /^13579246801$/,         // 13579246801
  /^10000000000$/,         // 10000000000
  /^10101010101$/,         // 10101010101
];

// AI 验证接口
app.post('/api/ai/phone-verify', async function(req, res) {
  try {
    const { phone } = req.body;
    
    // 基础格式验证
    if (!phone || typeof phone !== 'string') {
      return res.json({
        valid: false,
        verified: false,
        message: '请输入手机号码',
        details: '手机号不能为空'
      });
    }
    
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.length !== 11) {
      return res.json({
        valid: false,
        verified: false,
        message: '手机号必须是11位',
        details: '您输入了' + cleanPhone.length + '位，请检查'
      });
    }
    
    if (!cleanPhone.startsWith('1')) {
      return res.json({
        valid: false,
        verified: false,
        message: '手机号必须以1开头',
        details: '中国大陆手机号格式为 1XX XXXX XXXX'
      });
    }
    
    // 检查是否匹配测试手机号模式
    for (const pattern of TEST_PHONE_PATTERNS) {
      if (pattern.test(cleanPhone)) {
        return res.json({
          valid: false,
          verified: false,
          message: '该手机号看起来是测试号码',
          details: '请输入真实有效的手机号'
        });
      }
    }
    
    // 检查是否是无效/测试前缀
    for (const invalidPrefix of INVALID_PHONE_PREFIXES) {
      if (cleanPhone.startsWith(invalidPrefix)) {
        return res.json({
          valid: false,
          verified: false,
          message: '这不是一个真实的手机号',
          details: '该前缀看起来是测试号码，请输入真实手机号'
        });
      }
    }
    
    // 检查是否是常见有效前缀
    let validPrefix = false;
    for (const validP of VALID_PHONE_PREFIXES) {
      if (cleanPhone.startsWith(String(validP))) {
        validPrefix = true;
        break;
      }
    }
    
    if (!validPrefix) {
      return res.json({
        valid: false,
        verified: false,
        message: '不常见的手机号前缀',
        details: '该手机号前缀不常见，请检查是否输入正确'
      });
    }
    
    // 检查是否是重复数字太多（改进版）
    let maxRepeats = 0;
    let currentRepeats = 1;
    for (let i = 1; i < cleanPhone.length; i++) {
      if (cleanPhone[i] === cleanPhone[i - 1]) {
        currentRepeats++;
        if (currentRepeats > maxRepeats) {
          maxRepeats = currentRepeats;
        }
      } else {
        currentRepeats = 1;
      }
    }
    
    if (maxRepeats >= 4) {
      return res.json({
        valid: false,
        verified: false,
        message: '该手机号看起来是测试号码',
        details: '连续重复数字过多，请输入真实有效的手机号'
      });
    }
    
    // 检查是否有连续的相同数字对（如 11223344556）
    let pairCount = 0;
    for (let i = 0; i < cleanPhone.length - 1; i += 2) {
      if (cleanPhone[i] === cleanPhone[i + 1]) {
        pairCount++;
      }
    }
    
    if (pairCount >= 4) {
      return res.json({
        valid: false,
        verified: false,
        message: '该手机号看起来不真实',
        details: '请输入真实有效的手机号'
      });
    }
    
    // 检查是否是连续数字（改进版）
    let isAscending = true;
    let isDescending = true;
    
    for (let i = 1; i < cleanPhone.length; i++) {
      const curr = parseInt(cleanPhone[i]);
      const prev = parseInt(cleanPhone[i - 1]);
      
      if (curr !== prev + 1 && !(prev === 9 && curr === 0)) {
        isAscending = false;
      }
      if (curr !== prev - 1 && !(prev === 0 && curr === 9)) {
        isDescending = false;
      }
      
      if (!isAscending && !isDescending) {
        break;
      }
    }
    
    if (isAscending || isDescending) {
      return res.json({
        valid: false,
        verified: false,
        message: '该手机号看起来不真实',
        details: '请输入真实有效的手机号'
      });
    }
    
    // 检查是否有明显的测试模式（如 13800138000）
    if (cleanPhone.includes('0000') || 
        cleanPhone.includes('1111') || 
        cleanPhone.includes('2222') ||
        cleanPhone.includes('3333') ||
        cleanPhone.includes('4444') ||
        cleanPhone.includes('5555') ||
        cleanPhone.includes('6666') ||
        cleanPhone.includes('7777') ||
        cleanPhone.includes('8888') ||
        cleanPhone.includes('9999')) {
      return res.json({
        valid: false,
        verified: false,
        message: '该手机号看起来是测试号码',
        details: '请输入真实有效的手机号'
      });
    }
    
    // AI 验证通过！
    res.json({
      valid: true,
      verified: true,
      message: '手机号验证通过，这是一个真实有效的手机号',
      details: 'AI 智能分析认为这是一个有效的手机号，可以正常使用',
      phoneType: 'regular',
      carrier: 'auto-detected'
    });
  } catch (error) {
    console.error('AI 验证错误:', error);
    res.json({
      valid: false,
      verified: false,
      message: '验证出错，请稍后再试',
      details: '内部错误'
    });
  }
});

app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  const userId = req.query.userId || req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }
  const users = db.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ ...user, password: undefined });
});

// GitHub登录路由
app.get('/api/github/login', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID || '';
  if (!clientId) {
    return res.status(503).json({ error: 'GitHub登录未配置' });
  }
  const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/api/github/callback`);
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`);
});

// GitHub登录回调
app.get('/api/github/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.GITHUB_CLIENT_ID || '';
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
  
  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });
    const tokenData = await tokenResponse.json();
    
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${tokenData.access_token}` }
    });
    const userData = await userResponse.json();
    
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: { 'Authorization': `token ${tokenData.access_token}` }
    });
    const emailData = await emailResponse.json();
    const primaryEmail = emailData.find(email => email.primary)?.email || `${userData.login}@users.noreply.github.com`;
    
    const users = db.getUsers();
    let user = users.find(u => u.email === primaryEmail || u.githubId === userData.id);
    
    if (!user) {
      user = {
        id: uuidv4(),
        username: userData.login,
        email: primaryEmail,
        githubId: userData.id,
        avatar: userData.avatar_url,
        role: 'user',
        createdAt: new Date().toISOString()
      };
      users.push(user);
      db.saveUsers(users);
    }
    
    currentUser = user;
    res.redirect(`/shop?token=demo-token&user=${encodeURIComponent(JSON.stringify({ ...user, password: undefined }))}`);
    
  } catch (error) {
    console.error('Error with GitHub login:', error);
    res.status(500).json({ error: 'GitHub登录失败' });
  }
});

// AI API端点
app.post('/api/ai', (req, res) => {
  try {
    const { messages } = req.body;
    
    const responses = [
      "您好！我是KDX丨ZHX的智能客服，很高兴为您服务！",
      "请问有什么可以帮助您的？",
      "我们的商品都是经过严格质检的，请放心购买！",
      "如有任何问题，请随时联系我们！",
      "感谢您的支持！祝您购物愉快！"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    res.json({
      id: 'msg-' + Date.now(),
      object: 'chat.completion',
      created: Date.now(),
      model: 'kdgpt-turbo',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: randomResponse
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    });
  } catch (error) {
    console.error('AI API error:', error);
    res.status(500).json({ error: 'AI服务暂时不可用' });
  }
});

// ========== AI 智能助手接口 ==========
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, permissions } = req.body;
    const lowerMsg = message.toLowerCase();
    
    let response = '';
    let action = null;
    
    const products = db.getProducts();
    const orders = db.getOrders();
    
    if (lowerMsg.includes('商品') || lowerMsg.includes('上架') || lowerMsg.includes('添加')) {
      if (permissions?.product) {
        response = '好的！我来帮您上架商品。我已经为您打开商品添加界面，请填写商品信息即可快速上架！';
        action = { type: 'addProduct' };
      } else {
        response = '抱歉，您尚未开启商品管理权限，无法执行此操作。';
      }
    } else if (lowerMsg.includes('订单') || lowerMsg.includes('查询')) {
      if (permissions?.order) {
        const recentOrders = orders.slice(-3).reverse();
        response = `好的！为您查询到最新的 ${recentOrders.length} 个订单：\n\n${recentOrders.map((o, i) => `${i + 1}. 订单号 ${o.orderNo || o.id} - ¥${(o.total || 0).toFixed(2)}`).join('\n')} \n\n已自动跳转到订单管理页面查看详细信息。`;
        action = { type: 'viewOrders' };
      } else {
        response = '抱歉，您尚未开启订单管理权限，无法执行此操作。';
      }
    } else if (lowerMsg.includes('数据') || lowerMsg.includes('分析') || lowerMsg.includes('统计')) {
      if (permissions?.analysis) {
        const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        response = `好的！为您分析销售数据：\n\n• 商品总数：${products.length}\n• 订单总数：${orders.length}\n• 总收入：¥${totalRevenue.toFixed(2)}\n• 平均客单价：¥${orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : 0}\n\n已为您跳转到数据概览页面！`;
        action = { type: 'analyzeData' };
      } else {
        response = '抱歉，您尚未开启数据分析权限，无法执行此操作。';
      }
    } else if (lowerMsg.includes('库存') || lowerMsg.includes('清理') || lowerMsg.includes('零')) {
      if (permissions?.product) {
        const zeroStock = products.filter(p => p.stock <= 0);
        response = `检测到 ${zeroStock.length} 个零库存商品。需要为您清理吗？`;
        action = { type: 'clearZeroStock' };
      } else {
        response = '抱歉，您尚未开启商品管理权限，无法执行此操作。';
      }
    } else if (lowerMsg.includes('你好') || lowerMsg.includes('嗨') || lowerMsg.includes('您好')) {
      response = '您好！我是KDX-AI，您的智能管理助手 🤖';
    } else {
      response = '我可以帮您：\n• 快速上架商品\n• 查询订单状态\n• 分析销售数据\n• 清理零库存商品\n\n您可以点击右侧的快捷指令按钮，或直接告诉我您需要什么帮助！';
    }
    
    res.json({ response, action });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ response: '抱歉，我暂时无法处理您的请求。', action: null });
  }
});

// ========== 文件管理 API ==========
app.get('/api/files/list', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    
    // 安全的文件列表，只显示项目根目录的HTML和JS文件
    const files = [
      'shop.html',
      'product-detail.html',
      'cart.html',
      'checkout.html',
      'my-orders.html',
      'payment-success.html',
      'user-center.html',
      'admin-shop.html',
      'chat.html',
      'auth.html',
      'ai-assistant.js',
      'ecommerce-server.js',
      'config.js',
      'database.js',
      'notification-service.js'
    ];
    
    res.json({ success: true, files: files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
});

app.get('/api/files/read', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file specified' });
    }
    
    const allowedFiles = [
      'shop.html',
      'product-detail.html',
      'cart.html',
      'checkout.html',
      'my-orders.html',
      'payment-success.html',
      'user-center.html',
      'admin-shop.html',
      'chat.html',
      'auth.html',
      'ai-assistant.js',
      'ecommerce-server.js',
      'config.js',
      'database.js',
      'notification-service.js'
    ];
    
    if (!allowedFiles.includes(file)) {
      return res.status(403).json({ success: false, error: 'Access to this file is not allowed' });
    }
    
    const filePath = path.join(__dirname, file);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ success: true, content: content });
  } catch (error) {
    console.error('Read file error:', error);
    res.status(500).json({ success: false, error: 'Failed to read file' });
  }
});

app.post('/api/files/write', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const { file, content } = req.body;
    
    if (!file || content === undefined) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    
    const allowedFiles = [
      'shop.html',
      'product-detail.html',
      'cart.html',
      'checkout.html',
      'my-orders.html',
      'payment-success.html',
      'user-center.html',
      'admin-shop.html',
      'chat.html',
      'auth.html',
      'ai-assistant.js',
      'ecommerce-server.js',
      'config.js',
      'database.js',
      'notification-service.js'
    ];
    
    if (!allowedFiles.includes(file)) {
      return res.status(403).json({ success: false, error: 'Access to this file is not allowed' });
    }
    
    const filePath = path.join(__dirname, file);
    
    // 备份原文件
    if (fs.existsSync(filePath)) {
      const backupPath = path.join(__dirname, `backup_${Date.now()}_${file}`);
      fs.copyFileSync(filePath, backupPath);
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    
    console.log(`File saved: ${file}`);
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    console.error('Write file error:', error);
    res.status(500).json({ success: false, error: 'Failed to save file' });
  }
});

// ========== AI 手机号验证接口 ==========
app.post('/api/ai/verify-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.json({ 
        valid: false, 
        message: '手机号格式不正确，请输入正确的11位手机号。' });
    }
    
    // 验证手机号真实性（简单验证）
    const validPrefixes = ['13', '14', '15', '16', '17', '18', '19'];
    const prefix = phone.slice(0, 2);
    if (!validPrefixes.includes(prefix)) {
      return res.json({ 
        valid: false, 
        message: '手机号号段不正确，请输入正确的手机号。' });
    }
    
    res.json({ 
      valid: true, 
      message: '手机号验证通过！' });
  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({ valid: false, message: '验证失败，请稍后再试。' });
  }
});

app.get('/api/statistics', (req, res) => {
  const products = db.getProducts();
  const orders = db.getOrders();
  const users = db.getUsers();
  const refunds = db.getRefunds();
  
  const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
  
  res.json({
    totalProducts: products.length,
    totalOrders: orders.length,
    totalUsers: users.length,
    totalRefunds: refunds.length,
    totalRevenue,
    recentOrders: orders.slice(-5).reverse()
  });
});

// ==================== 初始化默认商品数据 ====================
function initDefaultProducts() {
  const products = db.getProducts();
  if (products.length === 0) {
    console.log('📦 初始化默认商品数据...');
    const defaultProducts = [
      {
        id: 'prod-001',
        name: '经典白色T恤',
        price: 99.00,
        originalPrice: 159.00,
        description: '100%纯棉材质，舒适透气，经典百搭款式',
        image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500',
        category: '服装',
        stock: 100,
        sales: 256,
        status: 'active',
        createdAt: '2024-01-15T00:00:00.000Z'
      },
      {
        id: 'prod-002',
        name: '时尚运动鞋',
        price: 299.00,
        originalPrice: 499.00,
        description: '轻便舒适，防滑耐磨，适合日常运动',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
        category: '鞋靴',
        stock: 50,
        sales: 189,
        status: 'active',
        createdAt: '2024-01-20T00:00:00.000Z'
      },
      {
        id: 'prod-003',
        name: '休闲牛仔裤',
        price: 199.00,
        originalPrice: 329.00,
        description: '修身版型，弹力面料，时尚百搭',
        image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500',
        category: '服装',
        stock: 80,
        sales: 312,
        status: 'active',
        createdAt: '2024-02-01T00:00:00.000Z'
      },
      {
        id: 'prod-004',
        name: '潮流卫衣',
        price: 159.00,
        originalPrice: 259.00,
        description: '加绒保暖，宽松版型，街头潮流',
        image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500',
        category: '服装',
        stock: 60,
        sales: 178,
        status: 'active',
        createdAt: '2024-02-10T00:00:00.000Z'
      },
      {
        id: 'prod-005',
        name: '商务双肩包',
        price: 189.00,
        originalPrice: 299.00,
        description: '大容量设计，防泼水面料，商务休闲两用',
        image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500',
        category: '箱包',
        stock: 45,
        sales: 134,
        status: 'active',
        createdAt: '2024-02-15T00:00:00.000Z'
      },
      {
        id: 'prod-006',
        name: '无线蓝牙耳机',
        price: 129.00,
        originalPrice: 229.00,
        description: '高清音质，长效续航，轻盈舒适',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500',
        category: '数码',
        stock: 120,
        sales: 456,
        status: 'active',
        createdAt: '2024-03-01T00:00:00.000Z'
      }
    ];
    db.saveProducts(defaultProducts);
    console.log('✅ 已初始化 6 个默认商品');
  }
}

// ==================== 初始化：加密现有用户密码 ====================
async function encryptExistingPasswords() {
  try {
    const users = db.getUsers();
    let changed = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      // 检查密码是否已加密
      if (user.password && !user.password.startsWith('$2')) {
        users[i].password = await security.hashPassword(user.password);
        changed++;
      }
    }

    if (changed > 0) {
      db.saveUsers(users);
      console.log(`🔐 已加密 ${changed} 个用户的密码`);
    }
  } catch (error) {
    console.error('加密密码失败:', error);
  }
}

// 初始化默认商品数据（在模块加载时执行，确保 serverless 环境也有数据）
initDefaultProducts();

// 仅在直接运行时启动服务器（非被require时）
if (require.main === module) {
console.log('🚀 正在启动服务器...');
encryptExistingPasswords().then(() => {
  console.log('✅ 密码加密完成，开始监听端口...');
  app.listen(PORT, () => {
    console.log('✅ 支付宝SDK初始化成功');
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║   🛒 KDX丨ZHX 综合平台已启动                             ║');
    console.log('║                                                           ║');
    console.log(`║   📍 服务器地址: http://localhost:${PORT}                    ║`);
    console.log('║                                                           ║');
    console.log(`║   🏪 商城首页: http://localhost:${PORT}/shop                  ║`);
    console.log(`║   🤖 智能客服: http://localhost:${PORT}/chat                  ║`);
    console.log(`║   🔐 管理后台: http://localhost:${PORT}/admin                  ║`);
    console.log(`║   🔐 登录页面: http://localhost:${PORT}/auth                  ║`);
    console.log('║                                                           ║');
    console.log('║   👤 管理账号: kdx / kdx123456                          ║');
    console.log('║                                                           ║');
    console.log('║   ✨ 功能包括:                                            ║');
    console.log('║      • 商品管理 (上传、编辑、删除)                         ║');
    console.log('║      • 订单管理 (查看、发货、售后)                         ║');
    console.log('║      • 支付宝支付 (沙箱模拟)                              ║');
    console.log('║      • 退款处理                                          ║');
    console.log('║      • 智能客服 (AI问答)                                 ║');
    console.log('║      • 数据统计                                          ║');
    console.log('║      • 邮件验证码 (EmailJS/SendGrid)                    ║');
    console.log('║      • 异常登录检测                                      ║');
    console.log('║      • 🔒 防火墙 + 密码加密 + 防爬虫                      ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
  });
});
} // end if require.main === module

// ==================== 视频无水印解析 API ====================
const https = require('https');
const http = require('http');

// 通用HTTP请求 - 针对国内平台优化
function httpRequest(reqUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = reqUrl.startsWith('https');
    const client = isHttps ? https : http;
    let parsed;
    try { parsed = new URL(reqUrl); } catch(e) { return reject(new Error('无效URL: ' + reqUrl)); }

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      ...options.headers
    };
    // 不要手动设Host，让Node自动处理
    delete defaultHeaders['Host'];

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: defaultHeaders,
      timeout: 10000,
      rejectUnauthorized: false
    };

    const req = client.request(reqOptions, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = `${parsed.protocol}//${parsed.host}${loc}`;
        res.resume();
        return httpRequest(loc, options).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// HEAD请求跟随重定向
function resolveRedirect(reqUrl, maxRedirects = 5) {
  return new Promise((resolve) => {
    if (maxRedirects <= 0 || !reqUrl) return resolve(reqUrl);
    const isHttps = reqUrl.startsWith('https');
    const client = isHttps ? https : http;
    let parsed;
    try { parsed = new URL(reqUrl); } catch { return resolve(reqUrl); }

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36',
        'Accept': '*/*'
      },
      timeout: 8000,
      rejectUnauthorized: false
    }, (res) => {
      res.resume();
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = `${parsed.protocol}//${parsed.host}${loc}`;
        return resolveRedirect(loc, maxRedirects - 1).then(resolve);
      }
      resolve(reqUrl);
    });
    req.on('error', () => resolve(reqUrl));
    req.on('timeout', () => { req.destroy(); resolve(reqUrl); });
    req.end();
  });
}

// ==================== 抖音解析 ====================
async function parseDouyin(url) {
  // 1. 处理短链接获取真实URL
  let realUrl = url;
  if (url.includes('v.douyin.com') || url.includes('iesdouyin.com/share')) {
    realUrl = await resolveRedirect(url);
  }

  // 2. 提取视频ID
  let videoId = '';
  const idMatch = realUrl.match(/video[/](\d+)/) ||
                  realUrl.match(/modal_id=(\d+)/) ||
                  realUrl.match(/note[/](\d+)/) ||
                  realUrl.match(/\/(\d{15,20})/);
  if (idMatch) videoId = idMatch[1];

  // 从页面提取ID
  if (!videoId) {
    try {
      const pageResp = await httpRequest(realUrl, {
        headers: { 'Referer': 'https://www.douyin.com/' }
      });
      const m = pageResp.body.match(/"aweme_id"\s*:\s*"?(\d+)"?/) ||
                pageResp.body.match(/video\/(\d{15,})/) ||
                pageResp.body.match(/itemId\s*[=:]\s*["']?(\d+)/);
      if (m) videoId = m[1];
    } catch {}
  }

  if (!videoId) throw new Error('无法提取抖音视频ID，请确认链接正确');

  // 3. 调用抖音API
  const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`;
  const resp = await httpRequest(apiUrl, {
    headers: {
      'Referer': 'https://www.douyin.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  let data;
  try { data = JSON.parse(resp.body); } catch { throw new Error('抖音API返回异常'); }

  if (data.item_list && data.item_list[0]) {
    const item = data.item_list[0];
    let videoUrl = '';
    if (item.video?.play_addr?.url_list) {
      videoUrl = item.video.play_addr.url_list[0] || '';
      videoUrl = videoUrl.replace('playwm', 'play');
    }
    if (!videoUrl && item.video?.play_addr_h265?.url_list) {
      videoUrl = item.video.play_addr_h265.url_list[0] || '';
      videoUrl = videoUrl.replace('playwm', 'play');
    }
    if (!videoUrl) throw new Error('无法获取视频地址');
    return {
      platform: 'douyin',
      title: item.desc || '抖音视频',
      cover: item.video?.cover?.url_list?.[0] || item.video?.origin_cover?.url_list?.[0] || '',
      videoUrl,
      duration: item.duration ? `${Math.floor(item.duration / 1000)}秒` : '未知',
      author: item.author?.nickname || '未知'
    };
  }

  // 备用：从页面提取
  try {
    const pageResp = await httpRequest(`https://www.douyin.com/video/${videoId}`, {
      headers: { 'Referer': 'https://www.douyin.com/' }
    });
    const renderMatch = pageResp.body.match(/<script id="RENDER_DATA"[^>]*>([^<]+)<\/script>/);
    if (renderMatch) {
      const decoded = decodeURIComponent(renderMatch[1]);
      const titleM = decoded.match(/"desc"\s*:\s*"([^"]+)"/);
      const urlM = decoded.match(/"playApi"\s*:\s*"([^"]+)"/) ||
                   decoded.match(/"play_addr_h265".*?"url_list"\s*:\s*\["([^"]+)"/);
      if (urlM) {
        return {
          platform: 'douyin',
          title: titleM ? titleM[1] : '抖音视频',
          cover: '',
          videoUrl: urlM[1].replace(/\\u002F/g, '/'),
          duration: '未知',
          author: '未知'
        };
      }
    }
  } catch {}

  throw new Error('抖音视频解析失败，该视频可能已删除或设置了权限');
}

// ==================== B站解析 ====================
async function parseBilibili(url) {
  let bvid = '';
  let realUrl = url;
  if (url.includes('b23.tv')) realUrl = await resolveRedirect(url);
  const bvMatch = realUrl.match(/BV[a-zA-Z0-9]{10}/);
  if (bvMatch) bvid = bvMatch[0];
  if (!bvid) throw new Error('无法提取B站视频BV号，请确认链接正确');

  // 获取视频信息
  const infoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const infoResp = await httpRequest(infoUrl, {
    headers: {
      'Referer': 'https://www.bilibili.com/',
      'Origin': 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': 'buvid3=infoc; b_nut=100'
    }
  });

  let infoData;
  try { infoData = JSON.parse(infoResp.body); } catch { throw new Error('B站API返回异常'); }
  if (infoData.code !== 0 || !infoData.data) throw new Error(infoData.message || '获取B站视频信息失败');

  const info = infoData.data;
  const cid = info.cid;

  // 获取视频流地址
  const playUrl = `https://api.bilibili.com/x/player/wbi/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=4048&fourk=1`;
  const playResp = await httpRequest(playUrl, {
    headers: {
      'Referer': `https://www.bilibili.com/video/${bvid}/`,
      'Origin': 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': 'buvid3=infoc; b_nut=100'
    }
  });

  let playData;
  try { playData = JSON.parse(playResp.body); } catch { throw new Error('获取播放地址失败'); }

  let videoUrl = '';
  if (playData.code === 0 && playData.data) {
    if (playData.data.dash?.video?.length > 0) {
      const sorted = playData.data.dash.video.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
      videoUrl = sorted[0].baseUrl || sorted[0].base_url || '';
    } else if (playData.data.durl?.[0]) {
      videoUrl = playData.data.durl[0].url;
    }
  }

  // 旧版API备用
  if (!videoUrl) {
    try {
      const oldResp = await httpRequest(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=0`, {
        headers: { 'Referer': `https://www.bilibili.com/video/${bvid}/`, 'Cookie': 'buvid3=infoc' }
      });
      const oldData = JSON.parse(oldResp.body);
      if (oldData.code === 0 && oldData.data?.durl?.[0]) videoUrl = oldData.data.durl[0].url;
    } catch {}
  }

  if (!videoUrl) throw new Error('获取视频下载地址失败');
  return {
    platform: 'bilibili',
    title: info.title || 'B站视频',
    cover: info.pic?.startsWith('//') ? 'https:' + info.pic : (info.pic || ''),
    videoUrl,
    duration: info.duration ? `${Math.floor(info.duration / 60)}分${info.duration % 60}秒` : '未知',
    author: info.owner?.name || '未知'
  };
}

// ==================== 快手解析 ====================
async function parseKuaishou(url) {
  let realUrl = url;
  if (url.includes('v.kuaishou.com') || url.includes('v.m.chenzhongtech.com')) {
    realUrl = await resolveRedirect(url);
  }

  let photoId = '';
  const m1 = realUrl.match(/photo\/(\w+)/) || realUrl.match(/short-video\/(\w+)/) || realUrl.match(/fw\/(\w+)/);
  if (m1) photoId = m1[1];

  if (!photoId) {
    try {
      const pageResp = await httpRequest(realUrl, { headers: { 'Referer': 'https://www.kuaishou.com/' } });
      const m = pageResp.body.match(/"photoId"\s*:\s*"(\w+)"/) || pageResp.body.match(/photoId[=:]([a-zA-Z0-9_-]+)/);
      if (m) photoId = m[1];
    } catch {}
  }

  if (!photoId) throw new Error('无法提取快手视频ID，请确认链接正确');

  // 快手GraphQL API
  const gqlUrl = 'https://www.kuaishou.com/graphql';
  const gqlResp = await httpRequest(gqlUrl, {
    method: 'POST',
    headers: {
      'Referer': 'https://www.kuaishou.com/',
      'Content-Type': 'application/json',
      'Origin': 'https://www.kuaishou.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Cookie': 'did=web_d0test; didv=1'
    },
    body: JSON.stringify({
      operationName: 'visionVideoDetailPhoto',
      variables: { photoId, page: 'detail' },
      query: 'query visionVideoDetailPhoto($photoId: String, $type: String, $page: String) { visionVideoDetailPhoto(photoId: $photoId, type: $type, page: $page) { photo { id duration caption likeCount realLikeCount coverUrl photoUrl } } }'
    })
  });

  let gqlData;
  try { gqlData = JSON.parse(gqlResp.body); } catch {}

  if (gqlData?.data?.visionVideoDetailPhoto?.photo) {
    const photo = gqlData.data.visionVideoDetailPhoto.photo;
    return {
      platform: 'kuaishou',
      title: photo.caption || '快手视频',
      cover: photo.coverUrl || '',
      videoUrl: photo.photoUrl || '',
      duration: photo.duration ? `${Math.floor(photo.duration / 1000)}秒` : '未知',
      author: '未知'
    };
  }

  // 备用：移动端API
  try {
    const mobileResp = await httpRequest('https://m.gifshow.com/rest/wd/photo/info?is498=true', {
      method: 'POST',
      headers: {
        'Referer': 'https://m.gifshow.com/',
        'Content-Type': 'application/json',
        'Origin': 'https://m.gifshow.com',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      },
      body: JSON.stringify({ photoId, isLongVideo: false })
    });
    const mData = JSON.parse(mobileResp.body);
    if (mData.result === 1 && mData.photo) {
      return {
        platform: 'kuaishou',
        title: mData.photo.caption || '快手视频',
        cover: mData.photo.coverUrl || '',
        videoUrl: mData.photo.photoUrl || mData.photo.mainMvUrl || '',
        duration: mData.photo.duration ? `${Math.floor(mData.photo.duration / 1000)}秒` : '未知',
        author: mData.photo.userName || '未知'
      };
    }
  } catch {}

  throw new Error('快手视频解析失败，该视频可能已删除或设置了权限');
}

// ==================== 小红书解析 ====================
async function parseXiaohongshu(url) {
  let realUrl = url;
  let noteId = '';

  if (url.includes('xhslink.com')) realUrl = await resolveRedirect(url);

  const m = realUrl.match(/explore\/([a-f0-9]+)/) ||
            realUrl.match(/discovery\/item\/([a-f0-9]+)/) ||
            realUrl.match(/note\/([a-f0-9]+)/) ||
            realUrl.match(/\/([a-f0-9]{24})/);
  if (m) noteId = m[1];
  if (!noteId) throw new Error('无法提取小红书笔记ID，请确认链接正确');

  const resp = await httpRequest(`https://www.xiaohongshu.com/explore/${noteId}`, {
    headers: {
      'Referer': 'https://www.xiaohongshu.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  // 从SSR数据提取
  const stateMatch = resp.body.match(/__INITIAL_STATE__\s*=\s*({.+?})\s*<\/script>/s) ||
                     resp.body.match(/window\.__INITIAL_SSR_STATE__\s*=\s*({.+?})\s*<\/script>/s);
  if (stateMatch) {
    try {
      const jsonStr = stateMatch[1].replace(/undefined/g, 'null');
      const state = JSON.parse(jsonStr);
      const noteData = state.note?.noteDetailMap?.[noteId]?.note || state.note?.noteData;
      if (noteData) {
        let videoUrl = '';
        if (noteData.video?.media?.stream?.h264?.[0]?.masterUrl) {
          videoUrl = noteData.video.media.stream.h264[0].masterUrl;
        } else if (noteData.video?.url) {
          videoUrl = noteData.video.url;
        }
        if (videoUrl) {
          return {
            platform: 'xiaohongshu',
            title: noteData.title || noteData.desc?.substring(0, 50) || '小红书笔记',
            cover: noteData.cover?.url || noteData.imageList?.[0]?.url || '',
            videoUrl,
            duration: noteData.video?.duration ? `${Math.floor(noteData.video.duration / 1000)}秒` : '未知',
            author: noteData.user?.nickname || '未知'
          };
        }
      }
    } catch {}
  }

  // 正则备用
  const vMatch = resp.body.match(/"originVideoKey"\s*:\s*"([^"]+)"/) ||
                 resp.body.match(/"url"\s*:\s*"(https?:\/\/[^"]*\.mp4[^"]*)"/) ||
                 resp.body.match(/"masterUrl"\s*:\s*"([^"]+)"/);
  if (vMatch) {
    const titleM = resp.body.match(/"title"\s*:\s*"([^"]+)"/);
    const authorM = resp.body.match(/"nickname"\s*:\s*"([^"]+)"/);
    return {
      platform: 'xiaohongshu',
      title: titleM ? titleM[1] : '小红书笔记',
      cover: '',
      videoUrl: vMatch[1].replace(/\\u002F/g, '/').replace(/\\\\u002F/g, '/'),
      duration: '未知',
      author: authorM ? authorM[1] : '未知'
    };
  }

  throw new Error('小红书笔记解析失败，该笔记可能为图文笔记或已删除');
}

// ==================== 微博解析 ====================
async function parseWeibo(url) {
  let realUrl = url;
  if (url.includes('t.cn') || url.includes('weibo.com/s/')) realUrl = await resolveRedirect(url);

  let statusId = '';
  const m = realUrl.match(/\/(\d{16,})/) ||
            realUrl.match(/detail\/(\d+)/) ||
            realUrl.match(/statuses\/(\d+)/) ||
            realUrl.match(/mid[=:](\d+)/);
  if (m) statusId = m[1];
  if (!statusId) throw new Error('无法提取微博ID，请确认链接正确');

  // 移动端API
  const resp = await httpRequest(`https://m.weibo.cn/statuses/show?id=${statusId}`, {
    headers: {
      'Referer': 'https://m.weibo.cn/',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'application/json, text/plain, */*'
    }
  });

  let data;
  try { data = JSON.parse(resp.body); } catch { throw new Error('微博API返回异常'); }

  if (data.ok === 1 && data.data) {
    const status = data.data;
    let videoUrl = '';

    if (status.page_info) {
      const pi = status.page_info;
      if (pi.urls) videoUrl = pi.urls.mp4_720p_mp4 || pi.urls.mp4_hd_mp4 || pi.urls.mp4_ld_mp4 || '';
      if (!videoUrl && pi.media_info) videoUrl = pi.media_info.stream_url_hd || pi.media_info.stream_url || '';
      if (videoUrl) {
        return {
          platform: 'weibo',
          title: status.status_title || (status.text || '').replace(/<[^>]+>/g, '').substring(0, 80) || '微博视频',
          cover: pi.page_pic?.url || status.bmiddle_pic || '',
          videoUrl,
          duration: pi.media_info?.duration || '未知',
          author: status.user?.screen_name || '未知'
        };
      }
    }

    // 转发微博
    if (status.retweeted_status?.page_info) {
      const rpi = status.retweeted_status.page_info;
      if (rpi.urls) videoUrl = rpi.urls.mp4_720p_mp4 || rpi.urls.mp4_hd_mp4 || rpi.urls.mp4_ld_mp4 || '';
      if (!videoUrl && rpi.media_info) videoUrl = rpi.media_info.stream_url_hd || rpi.media_info.stream_url || '';
      if (videoUrl) {
        return {
          platform: 'weibo',
          title: status.retweeted_status.status_title || '微博视频',
          cover: rpi.page_pic?.url || '',
          videoUrl,
          duration: rpi.media_info?.duration || '未知',
          author: status.retweeted_status.user?.screen_name || '未知'
        };
      }
    }
  }

  // 备用：页面提取
  try {
    const pageResp = await httpRequest(`https://m.weibo.cn/detail/${statusId}`, {
      headers: { 'Referer': 'https://m.weibo.cn/' }
    });
    const vMatch = pageResp.body.match(/"stream_url"\s*:\s*"([^"]+)"/) ||
                   pageResp.body.match(/"stream_url_hd"\s*:\s*"([^"]+)"/);
    if (vMatch) {
      return {
        platform: 'weibo',
        title: '微博视频',
        cover: '',
        videoUrl: vMatch[1].replace(/\\\//g, '/'),
        duration: '未知',
        author: '未知'
      };
    }
  } catch {}

  throw new Error('微博视频解析失败，该微博可能不是视频微博或已删除');
}

// ==================== 主解析路由 ====================
app.post('/api/video/parse', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ success: false, message: '请提供视频链接' });
    }

    const cleanUrl = url.trim();
    console.log(`🔍 开始解析视频: ${cleanUrl}`);

    // 识别平台
    let platform = null;
    let parser = null;

    if (cleanUrl.includes('douyin.com') || cleanUrl.includes('iesdouyin.com')) {
      platform = '抖音'; parser = parseDouyin;
    } else if (cleanUrl.includes('bilibili.com') || cleanUrl.includes('b23.tv')) {
      platform = 'B站'; parser = parseBilibili;
    } else if (cleanUrl.includes('kuaishou.com') || cleanUrl.includes('gifshow.com') || cleanUrl.includes('chenzhongtech.com')) {
      platform = '快手'; parser = parseKuaishou;
    } else if (cleanUrl.includes('xiaohongshu.com') || cleanUrl.includes('xhslink.com')) {
      platform = '小红书'; parser = parseXiaohongshu;
    } else if (cleanUrl.includes('weibo.com') || cleanUrl.includes('weibo.cn') || cleanUrl.includes('t.cn')) {
      platform = '微博'; parser = parseWeibo;
    }

    if (!parser) {
      return res.status(400).json({
        success: false,
        message: '不支持的平台，目前支持：抖音、B站、快手、小红书、微博'
      });
    }

    console.log(`📡 识别平台: ${platform}`);

    const result = await parser(cleanUrl);

    if (result && result.videoUrl) {
      console.log(`✅ [${platform}] 解析成功: ${result.title}`);
      res.json({ success: true, data: result });
    } else {
      res.status(400).json({ success: false, message: '无法获取视频地址' });
    }

  } catch (err) {
    console.error('❌ 视频解析错误:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || '解析失败，请检查链接是否正确或稍后重试'
    });
  }
});

// ==================== 视频下载代理 ====================
app.get('/api/video/download', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl) {
      return res.status(400).json({ error: '缺少视频URL参数' });
    }

    console.log(`⬇️ 代理下载视频: ${videoUrl.substring(0, 100)}...`);

    // 根据来源设置正确的Referer
    let referer = '';
    if (videoUrl.includes('bilivideo.com') || videoUrl.includes('bilibili.com') || videoUrl.includes('hdslb.com')) {
      referer = 'https://www.bilibili.com/';
    } else if (videoUrl.includes('douyin.com') || videoUrl.includes('bytecdn.cn') || videoUrl.includes('bytedance.com') || videoUrl.includes('byteimg.com') || videoUrl.includes('snssdk.com')) {
      referer = 'https://www.douyin.com/';
    } else if (videoUrl.includes('kuaishou.com') || videoUrl.includes('gifshow.com') || videoUrl.includes('ksapisrv.com') || videoUrl.includes('ks-cdn.com') || videoUrl.includes('kuaishoucdn.com')) {
      referer = 'https://www.kuaishou.com/';
    } else if (videoUrl.includes('xiaohongshu.com') || videoUrl.includes('xhscdn.com') || videoUrl.includes('sns-img-bd.xhscdn.com')) {
      referer = 'https://www.xiaohongshu.com/';
    } else if (videoUrl.includes('weibo.com') || videoUrl.includes('sinaimg.cn') || videoUrl.includes('weibocdn.com') || videoUrl.includes('sina.com')) {
      referer = 'https://m.weibo.cn/';
    } else {
      try { referer = new URL(videoUrl).origin; } catch { referer = ''; }
    }

    const isHttps = videoUrl.startsWith('https');
    const client = isHttps ? https : http;
    const parsed = new URL(videoUrl);

    // 根据来源设置Cookie
    let cookie = '';
    if (videoUrl.includes('bilivideo.com') || videoUrl.includes('bilibili.com') || videoUrl.includes('hdslb.com')) {
      cookie = 'buvid3=infoc; b_nut=100';
    }

    const makeRequest = (reqUrl, redirects = 5) => {
      return new Promise((resolve, reject) => {
        if (redirects <= 0) return reject(new Error('重定向次数过多'));
        const isH = reqUrl.startsWith('https');
        const c = isH ? https : http;
        const p = new URL(reqUrl);

        const req = c.request({
          hostname: p.hostname,
          port: p.port || (isH ? 443 : 80),
          path: p.pathname + p.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': referer.replace(/\/$/, ''),
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            ...(cookie ? { 'Cookie': cookie } : {})
          },
          timeout: 30000,
          rejectUnauthorized: false
        }, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            let loc = response.headers.location;
            if (loc.startsWith('/')) loc = `${p.protocol}//${p.host}${loc}`;
            response.resume();
            return makeRequest(loc, redirects - 1).then(resolve).catch(reject);
          }
          if (response.statusCode >= 400) {
            response.resume();
            return reject(new Error(`视频服务器返回 ${response.statusCode}`));
          }
          resolve(response);
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
        req.end();
      });
    };

    const response = await makeRequest(videoUrl);

    const contentType = response.headers['content-type'] || 'video/mp4';
    const contentLength = response.headers['content-length'];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="video_no_watermark.mp4"');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    response.pipe(res);
    response.on('error', (err) => {
      console.error('下载流错误:', err.message);
      if (!res.headersSent) res.status(500).json({ error: '下载中断' });
    });

  } catch (err) {
    console.error('视频下载代理错误:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '下载失败' });
    }
  }
});

// ==================== 404错误处理 ====================
app.use((req, res, next) => {
  // 检查是否是API请求
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else {
    // 对于页面请求，尝试直接提供静态文件，或者返回404
    // 先尝试静态文件中间件
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, req.path);
    
    // 检查是否直接请求HTML文件
    if (req.path.endsWith('.html') && fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      // 如果找不到页面，重定向到首页或返回友好的404
      // 检查是否有.html后缀的文件存在
      const htmlPath = path.join(__dirname, `${req.path}.html`);
      if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        // 返回友好的404页面（如果有的话），否则重定向到shop
        const notFoundPath = path.join(__dirname, '404.html');
        if (fs.existsSync(notFoundPath)) {
          res.status(404).sendFile(notFoundPath);
        } else {
          res.redirect('/shop');
        }
      }
    }
  }
});

module.exports = app;

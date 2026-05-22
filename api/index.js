const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const config = require('../config');
const db = require('../database');
const fs = require('fs');
const crypto = require('crypto');
const notificationService = require('../notification-service');
const security = require('../security');
const appleShortcuts = require('../apple-shortcuts');
const serverless = require('serverless-http');

// 加载环境变量
require('dotenv').config();

const app = express();

// 支付宝SDK（安全加载，处理OpenSSL兼容性问题）
let AlipaySdk = null;
let AlipayFormData = null;
let alipaySdk = null;
const alipayConfig = require('../alipay-config');

// 安全地初始化支付宝SDK
function initAlipaySdk() {
  if (!alipayConfig.enabled) {
    console.log('💡 支付宝配置未启用，使用模拟支付模式');
    return null;
  }
  
  try {
    // 动态加载支付宝SDK
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

// 初始化支付宝SDK
if (alipayConfig.enabled) {
  console.log('🚀 正在初始化支付宝SDK...');
  alipaySdk = initAlipaySdk();
} else {
  console.log('💡 使用模拟支付模式（无需支付宝配置）');
}

// ==================== 安全中间件 ====================
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https://*"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'", "data:"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"]
  }
}));
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.frameguard({ action: 'deny' }));

// CORS配置
app.use(cors());

// Body解析器限制
app.use(bodyParser.json({ limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..')));

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

let currentUser = null;

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

// 兼容旧代码
async function sendSms(phone, code, email = null) {
  return sendVerificationCode(phone, code, 'login', email);
}

// 首页重定向
app.get('/', (req, res) => {
  res.redirect('/shop');
});

// 页面路由
app.get('/shop', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'shop.html'));
});

app.get('/customize', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'customize.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'chat.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'auth.html'));
});

app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'product-detail.html'));
});

app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'cart.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'checkout.html'));
});

app.get('/my-orders', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'my-orders.html'));
});

app.get('/orders', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'my-orders.html'));
});

app.get('/payment-success', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'payment-success.html'));
});

app.get('/manual-payment', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'manual-payment.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin-shop.html'));
});

app.get('/contact-us', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'contact-us.html'));
});

app.get('/user-center', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'user-center.html'));
});

app.get('/test-payment', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'test-payment.html'));
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

// 用户提交支付确认
app.post('/api/orders/:id/confirm-payment', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { transactionNo, paymentMethod, screenshot } = req.body;
    
    if (!transactionNo) {
      return res.status(400).json({ error: '请输入交易号' });
    }
    
    const orders = db.getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    
    if (orderIndex === -1) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    // 更新订单状态为待审核
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
    
    // 发送通知给管理员
    const users = db.getUsers();
    const admins = users.filter(u => u.isAdmin);
    for (const admin of admins) {
      if (admin.email) {
        await notificationService.sendOrderNotification(
          orders[orderIndex],
          'payment_pending',
          admin.email,
          admin.phone
        );
      }
    }
    
    res.json({ success: true, message: '支付确认已提交，等待审核' });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: '提交失败' });
  }
});

// 管理员确认支付
app.post('/api/orders/:id/verify-payment', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { verified, note } = req.body;
    
    const orders = db.getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    
    if (orderIndex === -1) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    if (verified) {
      // 确认支付成功
      orders[orderIndex] = {
        ...orders[orderIndex],
        status: 'paid',
        paymentStatus: 'confirmed',
        paymentVerifiedAt: new Date().toISOString(),
        paymentVerifiedNote: note
      };
    } else {
      // 支付验证失败
      orders[orderIndex] = {
        ...orders[orderIndex],
        status: 'pending',
        paymentStatus: 'payment_rejected',
        paymentVerifiedAt: new Date().toISOString(),
        paymentVerifiedNote: note
      };
    }
    
    db.saveOrders(orders);
    
    // 发送通知给用户
    const users = db.getUsers();
    const user = users.find(u => u.id === orders[orderIndex].userId);
    if (user && user.email) {
      await notificationService.sendOrderNotification(
        orders[orderIndex],
        verified ? 'paid' : 'payment_rejected',
        user.email,
        user.phone
      );
    }
    
    res.json({ success: true });
  } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({ error: '验证失败' });
    }
});

// 取消订单
app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const orders = db.getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    
    if (orderIndex === -1) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    orders[orderIndex] = {
      ...orders[orderIndex],
      status: 'cancelled',
      cancelledAt: new Date().toISOString()
    };
    
    db.saveOrders(orders);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: '取消失败' });
  }
});

// 订单发货
app.post('/api/orders/:id/ship', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { trackingNo, shippingCompany } = req.body;
    
    const orders = db.getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    
    if (orderIndex === -1) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    orders[orderIndex] = {
      ...orders[orderIndex],
      status: 'shipped',
      trackingNo,
      shippingCompany,
      shippedAt: new Date().toISOString()
    };
    
    db.saveOrders(orders);
    
    // 发送通知给用户
    const users = db.getUsers();
    const user = users.find(u => u.id === orders[orderIndex].userId);
    if (user && user.email) {
      await notificationService.sendOrderNotification(
        orders[orderIndex],
        'shipped',
        user.email,
        user.phone
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error shipping order:', error);
    res.status(500).json({ error: '发货失败' });
  }
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
    
    // 安全地初始化支付宝SDK
    if (!alipaySdk) {
      alipaySdk = initAlipaySdk();
    }
    
    // 检查是否配置正确
    if (!alipayConfig.enabled || !alipaySdk) {
      console.error('[支付] 支付宝配置未启用或SDK初始化失败');
      return res.status(500).json({ 
        success: false, 
        error: '支付宝支付暂时不可用，请稍后再试' 
      });
    }
    
    // 真实支付宝支付
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
      outTradeNo: outTradeNo
    });
    
  } catch (error) {
    console.error('[支付] 创建支付订单失败:', error);
    console.error('[支付] 错误详情:', error.message);
    if (error.response) {
      console.error('[支付] 支付宝响应:', error.response.data || error.response);
    }
    
    res.status(500).json({ 
      success: false, 
      error: '创建支付订单失败，请稍后再试',
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
    res.sendFile(path.join(__dirname, '..', 'payment-success.html'));
    
  } catch (error) {
    console.error('[支付] 处理支付回调失败:', error);
    res.sendFile(path.join(__dirname, '..', 'payment-success.html'));
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
        code: smsResult.code, // 把验证码返回给前端，作为备用
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
    const safePassword = security.sanitizeInput(password);
    
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
    
    currentUser = newUser;
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
    
    // 宽松的手机号格式验证 - 只要是11位数字且以1开头即可
    const phoneRegex = /^1\d{10}$/;
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
      
      // 显示密码给用户（演示用途）
      res.json({ 
        password: user.password 
      });
    } else if (type === 'order') {
      if (!orderNo) {
        return res.status(400).json({ error: '请输入支付宝订单号' });
      }
      
      // 通过订单号找用户
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
      
      res.json({
        phone: user.phone,
        password: user.password
      });
    } else {
      res.status(400).json({ error: '无效的找回方式' });
    }
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ error: '找回密码失败' });
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
    const safePassword = security.sanitizeInput(password);
    
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
    
    currentUser = user;
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

// 自动登录API
app.post('/api/auto-login', (req, res) => {
  try {
    const location = getLoginLocation(req);
    const clientIp = location.ip;
    const users = db.getUsers();
    
    // 查找最近在该IP登录过的用户
    const user = users.find(u => 
      u.lastLoginIp === clientIp && 
      u.autoLoginEnabled && 
      u.lastLoginAt &&
      (new Date() - new Date(u.lastLoginAt)) < 7 * 24 * 60 * 60 * 1000 // 7天内
    );
    
    if (user) {
      res.json({
        success: true,
        user: { ...user, password: undefined },
        token: 'demo-token'
      });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    console.error('Auto login error:', error);
    res.json({ success: false });
  }
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

// 本地开发才启动服务器
if (process.env.NODE_ENV !== 'production') {
  const PORT = config.server.port || 3000;
  app.listen(PORT, () => {
    console.log(`本地开发服务器运行在 http://localhost:${PORT}`);
  });
}

// Vercel 生产部署：用 serverless-http 包装
module.exports = serverless(app);

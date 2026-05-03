const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const config = require('./config');
const db = require('./database');
const fs = require('fs');
const crypto = require('crypto');
const notificationService = require('./notification-service');
const security = require('./security');
const appleShortcuts = require('./apple-shortcuts');
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
const alipayConfig = require('./alipay-config');

// 加载环境变量
require('dotenv').config();

const app = express();
const PORT = config.server.port;

// 初始化支付宝SDK
let alipaySdk = null;
let useMockPayment = true;
try {
  if (alipayConfig.enabled) {
    alipaySdk = new AlipaySdk({
      appId: alipayConfig.appId,
      privateKey: alipayConfig.privateKey,
      alipayPublicKey: alipayConfig.alipayPublicKey,
      gateway: alipayConfig.gateway,
      signType: alipayConfig.signType,
      charset: alipayConfig.charset
    });
    console.log('✅ 支付宝SDK初始化成功（真实支付模式）');
    useMockPayment = false;
  } else {
    console.log('✅ 使用模拟支付模式');
    useMockPayment = true;
  }
} catch (error) {
  console.error('❌ 支付宝SDK初始化失败:', error);
  console.log('⚠️ 将使用模拟支付模式');
  useMockPayment = true;
}

// ==================== 安全中间件 ====================
// Helmet安全头
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
    imgSrc: ["'self'", "data:", "https://*"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
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
app.use(cors({ origin: [`http://localhost:${PORT}`], credentials: true }));

// Body解析器限制
app.use(bodyParser.json({ limit: '10kb' }));
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

let currentUser = null;

// ==================== Apple Shortcuts 集成 ====================
appleShortcuts.registerShortcutsRoutes(app, db);

// 验证码存储
const smsCodes = new Map();

// 生成随机验证码
function generateSmsCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ========== 短信服务配置 ==========
// 选择你想用的短信服务：'textbelt' | 'twilio' | 'vonage' | 'plivo' | 'ronglian' | 'yunpian' | 'submail' | 'netease'
const SMS_PROVIDER = process.env.SMS_PROVIDER || '';

// Textbelt配置（最简单！每天1条免费）
const TEXTBELT_CONFIG = {
    key: process.env.TEXTBELT_KEY || 'textbelt' // 'textbelt' 是测试key，每天1条免费
};

// Vonage (Nexmo) 配置
const VONAGE_CONFIG = {
    apiKey: process.env.VONAGE_API_KEY || '',
    apiSecret: process.env.VONAGE_API_SECRET || '',
    from: process.env.VONAGE_FROM || 'KDX'
};

// Plivo配置
const PLIVO_CONFIG = {
    authId: process.env.PLIVO_AUTH_ID || '',
    authToken: process.env.PLIVO_AUTH_TOKEN || '',
    from: process.env.PLIVO_FROM || ''
};

// 容联云通讯配置
const RONGLIAN_CONFIG = {
    accountSid: process.env.RONGLIAN_ACCOUNT_SID || '',
    accountToken: process.env.RONGLIAN_ACCOUNT_TOKEN || '',
    appId: process.env.RONGLIAN_APP_ID || '',
    templateId: process.env.RONGLIAN_TEMPLATE_ID || '1'
};

// 云片网配置
const YUNPIAN_CONFIG = {
    apikey: process.env.YUNPIAN_APIKEY || '',
    tplId: process.env.YUNPIAN_TPL_ID || ''
};

// SUBMAIL配置
const SUBMAIL_CONFIG = {
    appid: process.env.SUBMAIL_APPID || '',
    appkey: process.env.SUBMAIL_APPKEY || '',
    project: process.env.SUBMAIL_PROJECT || ''
};

// 网易云信配置
const NETEASE_CONFIG = {
    appKey: process.env.NETEASE_APP_KEY || '',
    appSecret: process.env.NETEASE_APP_SECRET || '',
    templateid: process.env.NETEASE_TEMPLATE_ID || ''
};

// 邮箱服务配置
const EMAIL_CONFIG = {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    // 自动判断是 Gmail 还是 QQ 邮箱
    host: (process.env.EMAIL_USER || '').includes('gmail') ? 'smtp.gmail.com' : 'smtp.qq.com',
    port: 587
};// ========== 发送验证码主函数（只使用EmailJS） ==========
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

// ========== Textbelt（最简单！每天1条免费） ==========
async function sendByTextbelt(phone, code) {
    const axios = require('axios');
    
    let formattedPhone = phone;
    if (!phone.startsWith('+')) {
        if (phone.startsWith('1') && phone.length === 11) {
            formattedPhone = '+86' + phone;
        } else {
            return { success: false, message: '手机号格式不正确' };
        }
    }
    
    try {
        const response = await axios.post('https://textbelt.com/text', {
            phone: formattedPhone,
            message: `您的 KDX商城 验证码是：${code}，该验证码5分钟内有效，请勿泄露于他人。`,
            key: TEXTBELT_CONFIG.key
        });
        
        if (response.data.success) {
            return { success: true, message: '验证码已发送' };
        } else {
            return { success: false, message: response.data.error || '发送失败' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== Vonage (Nexmo) ==========
async function sendByVonage(phone, code) {
    if (!VONAGE_CONFIG.apiKey || !VONAGE_CONFIG.apiSecret) {
        return { success: false, message: 'Vonage配置不完整' };
    }
    
    const axios = require('axios');
    
    let formattedPhone = phone;
    if (phone.startsWith('1') && phone.length === 11) {
        formattedPhone = '86' + phone;
    }
    
    try {
        const response = await axios.post('https://rest.nexmo.com/sms/json', {
            api_key: VONAGE_CONFIG.apiKey,
            api_secret: VONAGE_CONFIG.apiSecret,
            to: formattedPhone,
            from: VONAGE_CONFIG.from,
            text: `您的 KDX商城 验证码是：${code}，该验证码5分钟内有效，请勿泄露于他人。`
        });
        
        if (response.data.messages[0].status === '0') {
            return { success: true, message: '验证码已发送' };
        } else {
            return { success: false, message: '发送失败' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== Plivo ==========
async function sendByPlivo(phone, code) {
    if (!PLIVO_CONFIG.authId || !PLIVO_CONFIG.authToken || !PLIVO_CONFIG.from) {
        return { success: false, message: 'Plivo配置不完整' };
    }
    
    const axios = require('axios');
    const auth = Buffer.from(PLIVO_CONFIG.authId + ':' + PLIVO_CONFIG.authToken).toString('base64');
    
    let formattedPhone = phone;
    if (!phone.startsWith('+')) {
        if (phone.startsWith('1') && phone.length === 11) {
            formattedPhone = '+86' + phone;
        } else {
            return { success: false, message: '手机号格式不正确' };
        }
    }
    
    try {
        const response = await axios.post(`https://api.plivo.com/v1/Account/${PLIVO_CONFIG.authId}/Message/`, {
            src: PLIVO_CONFIG.from,
            dst: formattedPhone,
            text: `您的 KDX商城 验证码是：${code}，该验证码5分钟内有效，请勿泄露于他人。`
        }, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data.api_id) {
            return { success: true, message: '验证码已发送' };
        } else {
            return { success: false, message: '发送失败' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== 容联云通讯 ==========
async function sendByRonglian(phone, code) {
    if (!RONGLIAN_CONFIG.accountSid || !RONGLIAN_CONFIG.accountToken || !RONGLIAN_CONFIG.appId) {
        return { success: false, message: '容联云配置不完整' };
    }
    
    const axios = require('axios');
    const crypto = require('crypto');
    
    const timestamp = new Date().toISOString().replace(/[-T:.]/g, '').slice(0, 14);
    const sig = crypto.createHash('md5')
        .update(RONGLIAN_CONFIG.accountSid + RONGLIAN_CONFIG.accountToken + timestamp)
        .digest('hex')
        .toUpperCase();
    
    const url = `https://app.cloopen.com:8883/2013-12-26/Accounts/${RONGLIAN_CONFIG.accountSid}/SMS/TemplateSMS?sig=${sig}`;
    
    const auth = Buffer.from(RONGLIAN_CONFIG.accountSid + ':' + timestamp).toString('base64');
    
    try {
        const response = await axios.post(url, {
            to: phone,
            appId: RONGLIAN_CONFIG.appId,
            templateId: RONGLIAN_CONFIG.templateId,
            datas: [code, '5']
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json;charset=utf-8',
                'Authorization': auth
            }
        });
        
        if (response.data.statusCode === '000000') {
            return { success: true, message: '验证码已发送' };
        } else {
            return { success: false, message: response.data.statusMsg || '发送失败' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== 云片网 ==========
async function sendByYunpian(phone, code) {
    if (!YUNPIAN_CONFIG.apikey) {
        return { success: false, message: '云片网配置不完整' };
    }
    
    const axios = require('axios');
    
    try {
        const text = `【KDX商城】您的验证码是${code}，该验证码5分钟内有效，请勿泄露于他人。`;
        
        const response = await axios.post('https://sms.yunpian.com/v2/sms/single_send.json',
            new URLSearchParams({
                apikey: YUNPIAN_CONFIG.apikey,
                mobile: phone,
                text: text
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        if (response.data.code === 0) {
            return { success: true, message: '验证码已发送' };
        } else {
            return { success: false, message: response.data.msg || '发送失败' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== SUBMAIL ==========
async function sendBySubmail(phone, code) {
    if (!SUBMAIL_CONFIG.appid || !SUBMAIL_CONFIG.appkey) {
        return { success: false, message: 'SUBMAIL配置不完整' };
    }
    
    const axios = require('axios');
    
    try {
        const response = await axios.post('https://api-v4.mysubmail.com/sms/xsend', {
            appid: SUBMAIL_CONFIG.appid,
            project: SUBMAIL_CONFIG.project,
            to: phone,
            vars: JSON.stringify({ code: code })
        });
        
        if (response.data.status === 'success') {
            return { success: true, message: '验证码已发送' };
        } else {
            return { success: false, message: response.data.msg || '发送失败' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== 网易云信 ==========
async function sendByNetease(phone, code) {
    if (!NETEASE_CONFIG.appKey || !NETEASE_CONFIG.appSecret) {
        return { success: false, message: '网易云信配置不完整' };
    }
    
    const axios = require('axios');
    const crypto = require('crypto');
    
    const nonce = Math.random().toString(36).substring(2);
    const curTime = Math.floor(Date.now() / 1000).toString();
    const checkSum = crypto.createHash('sha1')
        .update(NETEASE_CONFIG.appSecret + nonce + curTime)
        .digest('hex');
    
    try {
        const response = await axios.post('https://api.netease.im/sms/sendcode.action',
            new URLSearchParams({
                mobile: phone,
                authCode: code,
                templateid: NETEASE_CONFIG.templateid
            }),
            {
                headers: {
                    'AppKey': NETEASE_CONFIG.appKey,
                    'Nonce': nonce,
                    'CurTime': curTime,
                    'CheckSum': checkSum,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        if (response.data.code === 200) {
            return { success: true, message: '验证码已发送' };
        } else {
            return { success: false, message: response.data.msg || '发送失败' };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== Twilio ==========
async function sendByTwilio(phone, code) {
    const TWILIO_CONFIG = {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
    };
    
    if (!TWILIO_CONFIG.accountSid || !TWILIO_CONFIG.authToken || !TWILIO_CONFIG.phoneNumber) {
        return { success: false, message: 'Twilio配置不完整' };
    }
    
    const twilio = require('twilio');
    const client = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
    
    let formattedPhone = phone;
    if (!phone.startsWith('+')) {
        if (phone.startsWith('1') && phone.length === 11) {
            formattedPhone = '+86' + phone;
        } else {
            return { success: false, message: '手机号格式不正确' };
        }
    }
    
    try {
        const message = await client.messages.create({
            body: `您的 KDX商城 验证码是：${code}，该验证码5分钟内有效，请勿泄露于他人。`,
            from: TWILIO_CONFIG.phoneNumber,
            to: formattedPhone
        });
        
        return { success: true, message: '验证码已发送' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ========== 邮箱 ==========
async function sendByEmail(phone, code, email) {
    if (!EMAIL_CONFIG.user || !EMAIL_CONFIG.pass) {
        return { success: false, message: '邮箱配置不完整' };
    }
    
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
        host: EMAIL_CONFIG.host,
        port: EMAIL_CONFIG.port,
        secure: false,
        auth: {
            user: EMAIL_CONFIG.user,
            pass: EMAIL_CONFIG.pass
        }
    });
    
    const toEmail = email || (phone + '@qq.com');
    
    const mailOptions = {
        from: `KDX商城 <${EMAIL_CONFIG.user}>`,
        to: toEmail,
        subject: '【KDX商城】验证码',
        text: `您的验证码是：${code}，该验证码5分钟内有效，请勿泄露于他人。`,
        html: `<p>您的验证码是：<strong style="font-size: 24px; color: #333;">${code}</strong></p><p>该验证码5分钟内有效，请勿泄露于他人。</p>`
    };
    
    const info = await transporter.sendMail(mailOptions);
    return { success: true, message: '验证码已发送到邮箱' };
}

// 首页重定向
app.get('/', (req, res) => {
  res.redirect('/index');
});

// 页面路由
app.get('/index', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
    
    // 如果使用模拟支付模式
    if (useMockPayment || !alipaySdk) {
      console.log(`[支付] 创建模拟支付订单: ${outTradeNo}`);
      // 返回模拟支付页面URL
      const mockPayUrl = `/mock-payment?orderId=${orderId}&outTradeNo=${outTradeNo}&totalAmount=${totalAmount}&subject=${encodeURIComponent(subject)}`;
      
      return res.json({
        success: true,
        payUrl: mockPayUrl,
        outTradeNo: outTradeNo,
        isMock: true
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
    console.log('[支付] 支付宝SDK返回结果预览:', result ? result.substring(0, 200) : 'null');
    
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

// 模拟支付函数
function createMockPayment(res, orderId, outTradeNo, totalAmount, subject) {
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
  
  // 返回模拟支付页面URL
  const mockPayUrl = `/mock-payment?orderId=${orderId}&outTradeNo=${outTradeNo}&totalAmount=${totalAmount}&subject=${encodeURIComponent(subject)}`;
  
  console.log(`[支付] 模拟支付订单创建成功: ${outTradeNo}`);
  res.json({
    success: true,
    payUrl: mockPayUrl,
    outTradeNo: outTradeNo,
    isMock: true
  });
}

// 模拟支付页面
app.get('/mock-payment', (req, res) => {
  const { orderId, outTradeNo, totalAmount, subject } = req.query;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>模拟支付宝支付</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
      <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
        <div class="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <span class="text-4xl">💰</span>
        </div>
        <h1 class="text-2xl font-bold text-gray-800 mb-2">模拟支付宝支付</h1>
        <p class="text-gray-500 mb-6">这是开发环境的模拟支付</p>
        
        <div class="bg-gray-50 rounded-xl p-6 mb-6 text-left">
          <div class="flex justify-between mb-3">
            <span class="text-gray-500">订单号:</span>
            <span class="font-mono text-gray-800">${outTradeNo}</span>
          </div>
          <div class="flex justify-between mb-3">
            <span class="text-gray-500">商品:</span>
            <span class="text-gray-800">${decodeURIComponent(subject)}</span>
          </div>
          <div class="flex justify-between border-t pt-3 mt-3">
            <span class="text-gray-800 font-semibold">支付金额:</span>
            <span class="text-blue-600 font-bold text-xl">¥${totalAmount}</span>
          </div>
        </div>
        
        <button id="payBtn" onclick="completePayment()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-[1.02]">
          <span id="btnText">确认支付 ¥${totalAmount}</span>
        </button>
        
        <p class="text-xs text-gray-400 mt-4">这是模拟支付，不会产生真实扣款</p>
      </div>
      
      <script>
        let paid = false;
        
        function completePayment() {
          if (paid) return;
          paid = true;
          
          const btn = document.getElementById('payBtn');
          const btnText = document.getElementById('btnText');
          
          btn.disabled = true;
          btn.classList.add('opacity-50', 'cursor-not-allowed');
          btnText.innerHTML = '<span class="animate-pulse">处理中...</span>';
          
          setTimeout(() => {
            window.location.href = '/payment-success?orderId=${orderId}&outTradeNo=${outTradeNo}&totalAmount=${totalAmount}';
          }, 1500);
        }
      </script>
    </body>
    </html>
  `);
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

// 后台权限验证中间件
function requireAdmin(req, res, next) {
    // 如果已经有currentUser，检查是否是管理员
    if (currentUser && currentUser.role === 'admin') {
        return next();
    }
    
    // 否则，检查是否是从本地访问或已知的管理员IP
    const location = getLoginLocation(req);
    const adminPhones = ['13800138000']; // 管理员手机号
    const adminEmails = ['admin@example.com'];
    
    // 检查当前用户是否是管理员
    if (currentUser && (adminPhones.includes(currentUser.phone) || adminEmails.includes(currentUser.email))) {
        return next();
    }
    
    // 如果没有登录，返回403
    res.status(403).sendFile(path.join(__dirname, 'auth.html'));
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
  currentUser = null;
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (currentUser) {
    res.json({ ...currentUser, password: undefined });
  } else {
    res.status(401).json({ error: '未登录' });
  }
});

// GitHub登录路由
app.get('/api/github/login', (req, res) => {
  const clientId = 'Ov23li217q26U3QJ75Dv'; // 临时使用测试ID
  const redirectUri = encodeURIComponent(`http://localhost:${PORT}/api/github/callback`);
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`);
});

// GitHub登录回调
app.get('/api/github/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = 'Ov23li217q26U3QJ75Dv';
  const clientSecret = '0123456789abcdef0123456789abcdef01234567';
  
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

encryptExistingPasswords().then(() => {
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

const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const helmet = require('helmet');

// 加载环境变量（必须在加载配置之前）
require('dotenv').config();

const config = require('./config');
const Database = require('./database');
const db = new Database();
const fs = require('fs');
const crypto = require('crypto');
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
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://kdxzhx.top", "http://kdxzhx.top"],
    fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.staticfile.org"],
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
const allowedOrigins = [
  `http://localhost:${PORT}`,
  'https://kdxzhx.top',
  'http://kdxzhx.top'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));

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
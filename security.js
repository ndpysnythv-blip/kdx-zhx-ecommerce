
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ==================== 安全配置 ====================
const SECURITY_CONFIG = {
  bcryptRounds: 14, // 增加加密轮数
  rateLimitWindow: 15 * 60 * 1000, // 15分钟
  maxLoginAttempts: 5, // 最大登录尝试次数
  maxApiRequests: 100, // API请求限制
  sessionSecret: crypto.randomBytes(32).toString('hex'),
  jwtSecret: crypto.randomBytes(64).toString('hex'),
  
  // 新增配置
  paymentSecret: crypto.randomBytes(32).toString('hex'),
  csrfSecret: crypto.randomBytes(32).toString('hex'),
  requestTimeout: 30000,
  maxPayloadSize: '50kb'
};

// ==================== 存储结构 ====================
const requestRecords = new Map();
const loginAttempts = new Map();
const blockedIPs = new Map();
const csrfTokens = new Map();
const paymentNonces = new Map();

// ==================== 密码加密 ====================
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(SECURITY_CONFIG.bcryptRounds);
  return await bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// ==================== XSS防护 ====================
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeInput(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
}

// ==================== 输入验证 ====================
const VALIDATORS = {
  phone: /^1[3-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  username: /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/,
  password: /^.{8,50}$/, // 增强密码长度要求
  amount: /^\d+(\.\d{1,2})?$/
};

function validatePhone(phone) {
  return VALIDATORS.phone.test(phone);
}

function validateEmail(email) {
  return VALIDATORS.email.test(email);
}

function validateUsername(username) {
  return VALIDATORS.username.test(username);
}

function validatePassword(password) {
  return VALIDATORS.password.test(password);
}

function validateAmount(amount) {
  return VALIDATORS.amount.test(amount);
}

// ==================== CSRF保护 ====================
function generateCSRFToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 3600000; // 1小时有效期
  csrfTokens.set(`${sessionId}:${token}`, expires);
  return token;
}

function validateCSRFToken(sessionId, token) {
  const key = `${sessionId}:${token}`;
  const expires = csrfTokens.get(key);
  if (!expires || expires < Date.now()) {
    return false;
  }
  csrfTokens.delete(key);
  return true;
}

// ==================== 支付安全 ====================
function generatePaymentNonce(orderId) {
  const nonce = crypto.randomBytes(16).toString('hex');
  paymentNonces.set(`${orderId}:${nonce}`, Date.now() + 600000); // 10分钟有效期
  return nonce;
}

function validatePaymentNonce(orderId, nonce) {
  const key = `${orderId}:${nonce}`;
  const expires = paymentNonces.get(key);
  if (!expires || expires < Date.now()) {
    return false;
  }
  paymentNonces.delete(key);
  return true;
}

function hashPaymentData(data, secret) {
  const sortedKeys = Object.keys(data).sort();
  const signString = sortedKeys.map(key => `${key}=${data[key]}`).join('&');
  return crypto.createHmac('sha256', secret).update(signString).digest('hex');
}

function verifyPaymentData(data, signature, secret) {
  const expectedSignature = hashPaymentData(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ==================== 速率限制 ====================
function getClientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!requestRecords.has(key)) {
    requestRecords.set(key, []);
  }
  
  const requests = requestRecords.get(key).filter(time => time > windowStart);
  requestRecords.set(key, requests);
  
  if (requests.length >= maxRequests) {
    return { allowed: false, resetIn: windowMs - (now - requests[0]) };
  }
  
  requests.push(now);
  return { allowed: true, remaining: maxRequests - requests.length };
}

function checkLoginAttempts(key) {
  const now = Date.now();
  const windowStart = now - SECURITY_CONFIG.rateLimitWindow;
  
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, []);
  }
  
  const attempts = loginAttempts.get(key).filter(time => time > windowStart);
  loginAttempts.set(key, attempts);
  
  if (attempts.length >= SECURITY_CONFIG.maxLoginAttempts) {
    // 自动阻止IP
    blockIP(key, 30 * 60 * 1000); // 阻止30分钟
    return { allowed: false, retryAfter: SECURITY_CONFIG.maxLoginAttempts };
  }
  
  return { allowed: true, attempts: attempts.length };
}

function recordFailedLogin(key) {
  const attempts = loginAttempts.get(key) || [];
  attempts.push(Date.now());
  loginAttempts.set(key, attempts);
}

function resetLoginAttempts(key) {
  loginAttempts.delete(key);
  unblockIP(key);
}

// ==================== IP阻止功能 ====================
function blockIP(ip, durationMs) {
  blockedIPs.set(ip, Date.now() + durationMs);
  console.warn(`[安全] IP已阻止: ${ip}, 持续时间: ${durationMs/1000}秒`);
}

function unblockIP(ip) {
  blockedIPs.delete(ip);
}

function isIPBlocked(ip) {
  const blockExpires = blockedIPs.get(ip);
  if (blockExpires && blockExpires > Date.now()) {
    return true;
  }
  if (blockExpires) {
    blockedIPs.delete(ip);
  }
  return false;
}

// ==================== 数据加密 ====================
function encryptData(data, secret) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret, 'hex').slice(0, 32), iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData, secret) {
  const parts = encryptedData.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted data format');
  
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secret, 'hex').slice(0, 32), iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

// ==================== 安全头 ====================
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-Powered-By', 'KDX-Server'); // 隐藏真实技术栈
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // 更严格的CSP
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "frame-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
}

// ==================== 高级防火墙/爬虫检测 ====================
const SUSPICIOUS_USER_AGENTS = [
  'sqlmap', 'nmap', 'nikto', 'nessus', 'havij', 'pangolin', 'hydra', 'zap',
  'w3af', 'arachni', 'skipfish', 'dirbuster', 'gobuster', 'dirb', 'wpscan',
  'fuzz', 'fuzzdb', 'burp', 'paros', 'webscarab', 'acunetix', 'netsparker',
  'waf', 'qualys', 'ibm', 'hp', 'mcafee', 'symantec', 'fireeye', 'cenzic',
  'qualysguard', 'webinspect', 'appscan', 'security', 'scanner', 'crawler',
  'bot', 'spider', 'scraper', 'harvester', 'sitemap', 'python-requests',
  'python-urllib', 'scrapy', 'selenium', 'phantom', 'headless', 'puppeteer',
  'webdriver', 'curl', 'wget', 'httpie', 'postmanruntime', 'java/', 'php/'
];

const SUSPICIOUS_PATHS = [
  '/wp-', '/.env', '/.git', '/config', '/phpmyadmin', '/mysql',
  '/backup', '/db', '/database', '/.htaccess', '/.htpasswd'
];

const SUSPICIOUS_HEADERS = [
  'x-scanner', 'x-hacker', 'x-waf', 'x-forwarded-host', 'x-http-method-override'
];

function isSuspiciousRequest(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const path = req.path.toLowerCase();
  const clientKey = getClientKey(req);
  
  // 检查是否已被阻止
  if (isIPBlocked(clientKey)) {
    return { suspicious: true, reason: 'IP已被阻止' };
  }
  
  // 检查User-Agent
  for (const keyword of SUSPICIOUS_USER_AGENTS) {
    if (ua.includes(keyword)) {
      blockIP(clientKey, 3600000); // 阻止1小时
      return { suspicious: true, reason: `检测到恶意User-Agent: ${keyword}` };
    }
  }
  
  // 检查可疑路径
  for (const suspiciousPath of SUSPICIOUS_PATHS) {
    if (path.includes(suspiciousPath)) {
      return { suspicious: true, reason: `检测到可疑路径: ${suspiciousPath}` };
    }
  }
  
  // 检查可疑Header
  for (const header of SUSPICIOUS_HEADERS) {
    if (req.headers[header]) {
      return { suspicious: true, reason: `检测到可疑HTTP Header: ${header}` };
    }
  }
  
  // 检查多层代理
  if (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',').length > 2) {
    return { suspicious: true, reason: '检测到过多代理层' };
  }
  
  // 检查无User-Agent的请求
  if (!req.headers['user-agent']) {
    return { suspicious: true, reason: '请求缺少User-Agent' };
  }
  
  return { suspicious: false };
}

// ==================== 防抓包检测 ====================
function detectPacketSniffing(req) {
  const checks = [];
  
  // 检查是否有Proxy相关Header
  if (req.headers['via'] || req.headers['proxy-connection']) {
    checks.push('检测到代理相关Header');
  }
  
  // 检查异常的连接头
  if (req.headers['connection'] && req.headers['connection'].toLowerCase() !== 'keep-alive') {
    // 这可能是异常连接，但不一定是抓包
  }
  
  return checks;
}

// ==================== 清理过期记录 ====================
function cleanup() {
  const now = Date.now();
  const cutoff = now - 2 * SECURITY_CONFIG.rateLimitWindow;
  
  // 清理请求记录
  for (const [key, records] of requestRecords.entries()) {
    const filtered = records.filter(time => time > cutoff);
    if (filtered.length === 0) {
      requestRecords.delete(key);
    }
  }
  
  // 清理登录尝试
  for (const [key, attempts] of loginAttempts.entries()) {
    const filtered = attempts.filter(time => time > cutoff);
    if (filtered.length === 0) {
      loginAttempts.delete(key);
    }
  }
  
  // 清理过期IP阻止
  for (const [ip, expires] of blockedIPs.entries()) {
    if (expires < now) {
      blockedIPs.delete(ip);
    }
  }
  
  // 清理过期CSRF token
  for (const [key, expires] of csrfTokens.entries()) {
    if (expires < now) {
      csrfTokens.delete(key);
    }
  }
  
  // 清理过期支付nonce
  for (const [key, expires] of paymentNonces.entries()) {
    if (expires < now) {
      paymentNonces.delete(key);
    }
  }
  
  console.log('[安全] 定期清理完成');
}

// 每5分钟清理一次
setInterval(cleanup, 5 * 60 * 1000);

module.exports = {
  SECURITY_CONFIG,
  hashPassword,
  verifyPassword,
  sanitizeInput,
  sanitizeObject,
  validatePhone,
  validateEmail,
  validateUsername,
  validatePassword,
  validateAmount,
  checkRateLimit,
  checkLoginAttempts,
  recordFailedLogin,
  resetLoginAttempts,
  getClientKey,
  encryptData,
  decryptData,
  setSecurityHeaders,
  isSuspiciousRequest,
  generateCSRFToken,
  validateCSRFToken,
  generatePaymentNonce,
  validatePaymentNonce,
  hashPaymentData,
  verifyPaymentData,
  blockIP,
  unblockIP,
  isIPBlocked,
  detectPacketSniffing
};

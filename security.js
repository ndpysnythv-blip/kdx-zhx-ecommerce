
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ==================== 安全配置 ====================
const SECURITY_CONFIG = {
  bcryptRounds: 12,
  rateLimitWindow: 15 * 60 * 1000, // 15分钟
  maxLoginAttempts: 5, // 最大登录尝试次数
  maxApiRequests: 100, // API请求限制
  sessionSecret: crypto.randomBytes(32).toString('hex'),
  jwtSecret: crypto.randomBytes(64).toString('hex')
};

// ==================== 请求记录存储 ====================
const requestRecords = new Map();
const loginAttempts = new Map();

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
    .replace(/'/g, '&#039;');
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
  phone: /^1\d{10}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  username: /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/,
  password: /^.{4,50}$/
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
}

// ==================== 数据加密 ====================
function encryptData(data, secret) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', secret);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData, secret) {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipher('aes-256-cbc', secret);
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
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:; img-src 'self' data: https:;");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

// ==================== 防火墙/爬虫检测 ====================
const SUSPICIOUS_USER_AGENTS = [
  'sqlmap', 'nmap', 'nikto', 'nessus', 'havij', 'pangolin', 'hydra', 'zap',
  'w3af', 'arachni', 'skipfish', 'dirbuster', 'gobuster', 'dirb', 'wpscan',
  'fuzz', 'fuzzdb', 'burp', 'paros', 'webscarab', 'acunetix', 'netsparker',
  'waf', 'qualys', 'ibm', 'hp', 'mcafee', 'symantec', 'fireeye', 'cenzic',
  'qualysguard', 'webinspect', 'appscan', 'security', 'scanner', 'crawler',
  'bot', 'spider', 'scraper', 'harvester', 'sitemap'
];

function isSuspiciousRequest(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  
  for (const keyword of SUSPICIOUS_USER_AGENTS) {
    if (ua.includes(keyword)) {
      return { suspicious: true, reason: `检测到恶意User-Agent: ${keyword}` };
    }
  }
  
  if (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].includes(',')) {
    return { suspicious: true, reason: '检测到可疑代理' };
  }
  
  return { suspicious: false };
}

// ==================== 清理过期记录 ====================
function cleanup() {
  const now = Date.now();
  const cutoff = now - 2 * SECURITY_CONFIG.rateLimitWindow;
  
  for (const [key, records] of requestRecords.entries()) {
    const filtered = records.filter(time => time > cutoff);
    if (filtered.length === 0) {
      requestRecords.delete(key);
    }
  }
  
  for (const [key, attempts] of loginAttempts.entries()) {
    const filtered = attempts.filter(time => time > cutoff);
    if (filtered.length === 0) {
      loginAttempts.delete(key);
    }
  }
}

setInterval(cleanup, 30 * 60 * 1000);

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
  checkRateLimit,
  checkLoginAttempts,
  recordFailedLogin,
  resetLoginAttempts,
  getClientKey,
  encryptData,
  decryptData,
  setSecurityHeaders,
  isSuspiciousRequest
};

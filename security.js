const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SECURITY_CONFIG = {
  bcryptRounds: 12,
  rateLimitWindow: 15 * 60 * 1000,
  maxLoginAttempts: 5,
  maxApiRequests: 100,
  sessionSecret: crypto.randomBytes(32).toString('hex'),
  jwtSecret: crypto.randomBytes(64).toString('hex')
};

const requestRecords = new Map();
const loginAttempts = new Map();

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(SECURITY_CONFIG.bcryptRounds);
  return await bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

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
    var result = [];
    for (var i = 0; i < obj.length; i++) {
      result.push(sanitizeObject(obj[i]));
    }
    return result;
  }
  
  const sanitized = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    sanitized[key] = sanitizeObject(obj[key]);
  }
  return sanitized;
}

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

function getClientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!requestRecords.has(key)) {
    requestRecords.set(key, []);
  }
  
  var requests = requestRecords.get(key);
  var filteredRequests = [];
  for (var i = 0; i < requests.length; i++) {
    if (requests[i] > windowStart) {
      filteredRequests.push(requests[i]);
    }
  }
  requestRecords.set(key, filteredRequests);
  
  if (filteredRequests.length >= maxRequests) {
    return { allowed: false, resetIn: windowMs - (now - filteredRequests[0]) };
  }
  
  filteredRequests.push(now);
  return { allowed: true, remaining: maxRequests - filteredRequests.length };
}

function checkLoginAttempts(key) {
  const now = Date.now();
  const windowStart = now - SECURITY_CONFIG.rateLimitWindow;
  
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, []);
  }
  
  var attempts = loginAttempts.get(key);
  var filteredAttempts = [];
  for (var i = 0; i < attempts.length; i++) {
    if (attempts[i] > windowStart) {
      filteredAttempts.push(attempts[i]);
    }
  }
  loginAttempts.set(key, filteredAttempts);
  
  if (filteredAttempts.length >= SECURITY_CONFIG.maxLoginAttempts) {
    return { allowed: false, retryAfter: SECURITY_CONFIG.maxLoginAttempts };
  }
  
  return { allowed: true, attempts: filteredAttempts.length };
}

function recordFailedLogin(key) {
  var attempts = loginAttempts.get(key) || [];
  attempts.push(Date.now());
  loginAttempts.set(key, attempts);
}

function resetLoginAttempts(key) {
  loginAttempts.delete(key);
}

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

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://cdn.staticfile.org; img-src 'self' data: https:; font-src 'self' data: https://cdn.staticfile.org;");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

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
  
  for (var i = 0; i < SUSPICIOUS_USER_AGENTS.length; i++) {
    var keyword = SUSPICIOUS_USER_AGENTS[i];
    if (ua.indexOf(keyword) !== -1) {
      return { suspicious: true, reason: '检测到恶意User-Agent: ' + keyword };
    }
  }
  
  if (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].indexOf(',') !== -1) {
    return { suspicious: true, reason: '检测到可疑代理' };
  }
  
  return { suspicious: false };
}

function cleanup() {
  const now = Date.now();
  const cutoff = now - 2 * SECURITY_CONFIG.rateLimitWindow;
  
  var keysToDelete = [];
  var keys = Array.from(requestRecords.keys());
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var records = requestRecords.get(key);
    var filtered = [];
    for (var j = 0; j < records.length; j++) {
      if (records[j] > cutoff) {
        filtered.push(records[j]);
      }
    }
    if (filtered.length === 0) {
      keysToDelete.push(key);
    } else {
      requestRecords.set(key, filtered);
    }
  }
  for (var k = 0; k < keysToDelete.length; k++) {
    requestRecords.delete(keysToDelete[k]);
  }
  
  var loginKeysToDelete = [];
  var loginKeys = Array.from(loginAttempts.keys());
  for (var l = 0; l < loginKeys.length; l++) {
    var key2 = loginKeys[l];
    var attempts2 = loginAttempts.get(key2);
    var filtered2 = [];
    for (var m = 0; m < attempts2.length; m++) {
      if (attempts2[m] > cutoff) {
        filtered2.push(attempts2[m]);
      }
    }
    if (filtered2.length === 0) {
      loginKeysToDelete.push(key2);
    } else {
      loginAttempts.set(key2, filtered2);
    }
  }
  for (var n = 0; n < loginKeysToDelete.length; n++) {
    loginAttempts.delete(loginKeysToDelete[n]);
  }
}

setInterval(cleanup, 30 * 60 * 1000);

module.exports = {
  SECURITY_CONFIG: SECURITY_CONFIG,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  sanitizeInput: sanitizeInput,
  sanitizeObject: sanitizeObject,
  validatePhone: validatePhone,
  validateEmail: validateEmail,
  validateUsername: validateUsername,
  validatePassword: validatePassword,
  checkRateLimit: checkRateLimit,
  checkLoginAttempts: checkLoginAttempts,
  recordFailedLogin: recordFailedLogin,
  resetLoginAttempts: resetLoginAttempts,
  getClientKey: getClientKey,
  encryptData: encryptData,
  decryptData: decryptData,
  setSecurityHeaders: setSecurityHeaders,
  isSuspiciousRequest: isSuspiciousRequest
};

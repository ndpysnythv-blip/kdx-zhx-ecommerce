
// ==================== Apple Shortcuts API接口 ====================
const express = require('express');
const crypto = require('crypto');

const SHORTCUTS_CONFIG = {
  API_KEY_LENGTH: 32,
  API_KEY_SALT: 'apple_shortcuts_2024',
  API_PREFIX: 'kd_'
};

// Shortcuts权限等级
const SHORTCUTS_PERMISSIONS = {
  read_products: true,
  read_orders: true,
  create_order: true,
  get_user_info: true,
  update_profile: false
};

// 存储API密钥
let shortcutsApiKey = null;
let shortcutsConfig = {
  enabled: true,
  rate_limit_per_hour: 100,
  request_count: 0,
  last_reset_hour: new Date().getHours(),
  permissions: { ...SHORTCUTS_PERMISSIONS },
  created_at: null
};

// 加载或生成API密钥
function initShortcutsKey() {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, 'data', 'shortcuts-config.json');
    
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (saved) {
        shortcutsApiKey = saved.api_key;
        shortcutsConfig = { ...shortcutsConfig, ...saved.config };
        shortcutsConfig.created_at = saved.created_at;
        console.log('🍎 Apple Shortcuts API密钥已加载');
        return shortcutsApiKey;
      }
    }
    // 生成新密钥
    generateNewShortcutsKey();
  } catch (e) {
    console.error('加载Shortcuts配置失败:', e);
    generateNewShortcutsKey();
  }
}

function generateNewShortcutsKey() {
  const randomKey = SHORTCUTS_CONFIG.API_PREFIX + crypto.randomBytes(SHORTCUTS_CONFIG.API_KEY_LENGTH).toString('hex');
  shortcutsApiKey = randomKey;
  shortcutsConfig.created_at = new Date().toISOString();
  saveShortcutsConfig();
  console.log('🍎 Apple Shortcuts API密钥已生成:', randomKey.substring(0, 15) + '...');
  return randomKey;
}

function saveShortcutsConfig() {
  try {
    const fs = require('fs');
    const path = require('path');
    const configDir = path.join(__dirname, 'data');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    
    const configPath = path.join(configDir, 'shortcuts-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      api_key: shortcutsApiKey,
      config: { ...shortcutsConfig, request_count: undefined },
      created_at: shortcutsConfig.created_at,
      updated_at: new Date().toISOString()
    }, null, 2));
  } catch (e) {
    console.error('保存Shortcuts配置失败:', e);
  }
}

// 验证API密钥
function verifyApiKey(req) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
    if (!authHeader) {
      return { valid: false, error: '缺少API密钥' };
    }
    
    const key = authHeader.replace('Bearer ', '').replace('bearer ', '');
    if (!shortcutsApiKey || key !== shortcutsApiKey) {
      return { valid: false, error: 'API密钥无效' };
    }
    
    // 检查限速
    const nowHour = new Date().getHours();
    if (nowHour !== shortcutsConfig.last_reset_hour) {
      shortcutsConfig.request_count = 0;
      shortcutsConfig.last_reset_hour = nowHour;
    }
    if (shortcutsConfig.request_count >= shortcutsConfig.rate_limit_per_hour) {
      return { valid: false, error: 'API请求次数超限' };
    }
    shortcutsConfig.request_count++;
    saveShortcutsConfig();
    
    return { valid: true };
  } catch (e) {
    console.error('验证Shortcuts API密钥失败:', e);
    return { valid: false, error: '内部错误' };
  }
}

// 注册Shortcuts路由
function registerShortcutsRoutes(app, db) {
  initShortcutsKey();
  
  // 验证中间件
  function shortcutsAuth(req, res, next) {
    const auth = verifyApiKey(req);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }
    next();
  }
  
  // 1. 获取API状态
  app.get('/api/shortcuts/status', (req, res) => {
    res.json({
      ok: true,
      version: '1.0.0',
      app_name: 'KDX丨ZHX',
      features: ['products', 'orders', 'cart', 'user_profile'],
      permissions: shortcutsConfig.permissions
    });
  });
  
  // 2. 获取商品列表
  app.get('/api/shortcuts/products', shortcutsAuth, (req, res) => {
    const products = db.getProducts();
    const limit = Math.min(parseInt(req.query.limit) || 50, products.length);
    
    res.json({
      ok: true,
      total: products.length,
      products: products.slice(0, limit)
    });
  });
  
  // 3. 搜索商品
  app.get('/api/shortcuts/products/search', shortcutsAuth, (req, res) => {
    const query = (req.query.q || '').toLowerCase();
    const products = db.getProducts().filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
    
    res.json({
      ok: true,
      count: products.length,
      products
    });
  });
  
  // 4. 获取用户信息（通过手机号/邮箱）
  app.post('/api/shortcuts/user', shortcutsAuth, (req, res) => {
    const { phone, email } = req.body;
    const users = db.getUsers();
    let user = null;
    
    if (phone) user = users.find(u => u.phone === phone);
    else if (email) user = users.find(u => u.email === email);
    
    if (!user) return res.status(404).json({ ok: false, error: '用户不存在' });
    
    // 隐藏敏感信息
    res.json({
      ok: true,
      user: {
        username: user.username,
        phone: user.phone,
        email: user.email,
        role: user.role
      }
    });
  });
  
  // 5. 获取订单查询
  app.get('/api/shortcuts/orders', shortcutsAuth, (req, res) => {
    const { phone, limit = 10 } = req.query;
    let orders = db.getOrders();
    
    if (phone) orders = orders.filter(o => o.user_phone === phone || o.userId === phone);
    orders = orders.slice(-limit).reverse();
    
    res.json({
      ok: true,
      total: orders.length,
      orders
    });
  });
  
  // 6. 获取管理API密钥
  app.get('/api/shortcuts/api-key', (req, res) => {
    // 检查本地请求（管理员使用）
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' ||
                    req.ip === 'localhost';
    if (!isLocal) {
      return res.status(403).json({ error: '仅允许本地访问' });
    }
    res.json({ ok: true, api_key: shortcutsApiKey, config: { ...shortcutsConfig, request_count: undefined } });
  });
  
  // 7. 重新生成API密钥
  app.post('/api/shortcuts/regenerate-key', (req, res) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' ||
                    req.ip === 'localhost';
    if (!isLocal) {
      return res.status(403).json({ error: '仅允许本地访问' });
    }
    const newKey = generateNewShortcutsKey();
    res.json({ ok: true, api_key: newKey });
  });
}

module.exports = {
  registerShortcutsRoutes,
  getApiKey: () => shortcutsApiKey
};


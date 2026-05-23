const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const serverless = require('serverless-http');

const app = express();

app.use(cors());

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

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
  console.log('✅ Database loaded successfully, dataDir:', db.dataDir);
} catch(e) {
  console.error('❌ Database load failed:', e.message);
}

try {
  security = require('../security');
} catch(e) {
  console.error('❌ Security load failed:', e.message);
}

try {
  notificationService = null;
} catch(e) {
  console.error('❌ Notification service load failed:', e.message);
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
  console.error('❌ Alipay load failed:', e.message);
  alipayConfig = { enabled: false };
}

function getAIConfig(type = 'chatbot') {
  try {
    var configPath = path.join(__dirname, '..', 'data', 'ai-config.json');
    if (fs.existsSync(configPath)) {
      var data = fs.readFileSync(configPath, 'utf8');
      var config = JSON.parse(data);
      
      if (config.system && config.chatbot) {
        return type === 'system' ? config.system : config.chatbot;
      }
      
      return config;
    }
  } catch (e) {
    console.error('read ai-config failed:', e.message);
  }
  
  var systemApiKey = process.env.ZHIPU_SYSTEM_API_KEY || process.env.ZHIPU_API_KEY || process.env.AI_API_KEY || '';
  var chatbotApiKey = process.env.ZHIPU_CHATBOT_API_KEY || process.env.ZHIPU_API_KEY || process.env.AI_API_KEY || '';
  
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
    
    var fullConfig = { system: {}, chatbot: {} };
    if (fs.existsSync(configPath)) {
      try {
        var existingData = fs.readFileSync(configPath, 'utf8');
        fullConfig = JSON.parse(existingData);
        
        if (!fullConfig.system) fullConfig.system = {};
        if (!fullConfig.chatbot) fullConfig.chatbot = {};
      } catch (e) {
        
      }
    }
    
    if (type === 'system') {
      fullConfig.system = Object.assign(fullConfig.system || {}, config);
    } else if (type === 'chatbot') {
      fullConfig.chatbot = Object.assign(fullConfig.chatbot || {}, config);
    } else {
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

app.get('/health', function(req, res) {
  try {
    let dbInfo = { exists: !!db };
    if (db) {
      dbInfo.dataDir = db.dataDir;
      try {
        dbInfo.products = db.getProducts();
      } catch (e) {
        dbInfo.productsError = e.message;
      }
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: dbInfo,
      env: { VERCEL: !!process.env.VERCEL, NODE_ENV: process.env.NODE_ENV }
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

if (db) {
  app.get('/products', function(req, res) {
    try { res.json(db.getProducts()); }
    catch(e) { res.json([]); }
  });

  app.get('/products/:id', function(req, res) {
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

  app.post('/products', function(req, res) {
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

  app.put('/products/:id', function(req, res) {
    try {
      db.updateItem('products.json', req.params.id, req.body);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '更新失败' });
    }
  });

  app.delete('/products/:id', function(req, res) {
    try {
      db.deleteItem('products.json', req.params.id);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '删除失败' });
    }
  });

  app.get('/orders', function(req, res) {
    try { res.json(db.getOrders()); }
    catch(e) { res.json([]); }
  });

  app.get('/orders/:id', function(req, res) {
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

  app.post('/orders', function(req, res) {
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

  app.put('/orders/:id', function(req, res) {
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

  app.delete('/orders/:id', function(req, res) {
    try {
      db.deleteItem('orders.json', req.params.id);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '删除失败' });
    }
  });

  app.post('/orders/:id/confirm-payment', function(req, res) {
    try {
      const transactionNo = req.body.transactionNo;
      const paymentMethod = req.body.paymentMethod;
      const orders = db.getOrders();
      const order = orders.find(o => o.id === req.params.id || o.outTradeNo === req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: '订单不存在' });
      }
      order.status = 'paid';
      order.transactionNo = transactionNo;
      order.paymentMethod = paymentMethod;
      db.updateItem('orders.json', order.id, order);
      res.json({ success: true, order: order });
    } catch (e) {
      res.status(500).json({ error: '确认支付失败' });
    }
  });
}

app.get('*', (req, res) => {
  res.json({ message: 'Route not found', path: req.path });
});

app.use(function(err, req, res, next) {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Server error', message: err.message });
});

module.exports = serverless(app);

const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const uuid = require('uuid');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 简单的健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uuid: uuid.v4(),
    env: { VERCEL: !!process.env.VERCEL, NODE_ENV: process.env.NODE_ENV }
  });
});

// 简单的产品端点（返回静态数据，不依赖数据库）
app.get('/products', (req, res) => {
  res.json([
    {
      id: uuid.v4(),
      name: '定制数据线',
      price: 80,
      category: '数据线'
    },
    {
      id: uuid.v4(),
      name: '小天才6点数据线',
      price: 60,
      category: '数据线'
    }
  ]);
});

// 404 处理
app.get('*', (req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.path });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Server error', message: err.message });
});

module.exports = serverless(app);

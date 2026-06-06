const express = require('express');
const serverless = require('serverless-http');
const path = require('path');
const cors = require('cors');

const app = express();

// 安全和中间件
app.use(cors());
app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname, '..')));
app.use('/store', express.static(path.join(__dirname, '..', 'apps', 'store')));

// 主站路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('API 错误:', err);
    if (req.path.startsWith('/store/')) {
        res.status(500).json({ error: '商城服务暂时不可用' });
    } else {
        res.status(500).json({ error: '服务错误' });
    }
});

// 404
app.use((req, res) => {
    if (req.path.startsWith('/store/')) {
        res.redirect('/store/shop.html');
    } else {
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    }
});

module.exports.handler = serverless(app);

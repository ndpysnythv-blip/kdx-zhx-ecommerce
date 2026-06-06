const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全中间件
app.use(helmet());
app.use(cors());
app.use(express.json());

// 静态文件服务 - 主网站
app.use(express.static(__dirname));

// 路由到各个应用
// 1. 电商应用
const storeAppPath = path.join(__dirname, 'apps', 'store');
app.use('/store', express.static(storeAppPath));

// 路由处理
// 主网站首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 错误处理 - 应用隔离
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    
    // 如果是子应用路径出错，返回友好错误，不影响主站
    if (req.path.startsWith('/store/')) {
        res.status(500).json({
            error: '应用暂时不可用',
            message: '商城服务遇到问题，请稍后重试'
        });
    } else {
        // 主站错误
        res.status(500).send('服务器错误');
    }
});

// 404 处理
app.use((req, res) => {
    if (req.path.startsWith('/store/')) {
        res.status(404).sendFile(path.join(storeAppPath, 'shop.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`主服务器运行在 http://localhost:${PORT}`);
    console.log(`- 主站: http://localhost:${PORT}`);
    console.log(`- 商城: http://localhost:${PORT}/store/`);
});

module.exports = app;

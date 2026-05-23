// 简单的服务器启动脚本
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 9999;

// 静态文件服务
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 引入主服务器文件
try {
    console.log('正在启动服务器...');
    require('./ecommerce-server.js');
} catch (error) {
    console.error('启动服务器时出错:', error);
    process.exit(1);
}

# KDX丨ZHX 电商平台

一个现代化的电商平台系统，支持商品浏览、个性化定制、购物车、订单管理、支付宝支付等功能。

## 功能特性

- 商品浏览与搜索
- 个性化定制（颜色选择 + 刻字）
- 购物车管理
- 订单管理
- 支付宝网页跳转支付
- 智能客服
- 管理员后台
- 密钥加密存储（AES-256-CBC）

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写支付宝密钥等配置

# 启动服务
npm start
```

## 环境变量

需要配置以下环境变量：

- `ALIPAY_APP_ID` - 支付宝应用ID
- `ALIPAY_PRIVATE_KEY` - 应用私钥（加密格式）
- `ALIPAY_PUBLIC_KEY` - 支付宝公钥（加密格式）
- `ALIPAY_ENCRYPT_KEY` - 密钥加密密码
- `ALIPAY_GATEWAY` - 支付宝网关地址

## 项目结构

```
├── data/                 # 数据文件
├── uploads/              # 上传文件
├── ecommerce-server.js   # 主服务器
├── alipay-config.js      # 支付宝配置
├── key-manager.js        # 密钥管理工具
── shop.html             # 商城首页
├── customize.html        # 个性化定制页面
├── cart.html             # 购物车
├── checkout.html         # 结算页面
├── admin-shop.html       # 管理后台
└── ...
```

## 许可证

MIT

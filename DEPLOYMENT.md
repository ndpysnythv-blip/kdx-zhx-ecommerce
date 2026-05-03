# KDX丨ZHX 电商平台 - 部署指南

## 📋 目录

- [方案概述](#方案概述)
- [Vercel 部署](#vercel-部署)
- [Railway 部署](#railway-部署)
- [Render 部署](#render-部署)
- [GitHub Pages 配置](#github-pages-配置)
- [支付宝回调配置](#支付宝回调配置)
- [环境变量](#环境变量)

---

## 🎯 方案概述

### 推荐方案：前后端分离部署

为了获得最佳的用户体验，我们推荐：

- **前端**：GitHub Pages 或 Vercel (免费)
- **后端**：Vercel 或 Railway (免费额度)

### 为什么不直接用 GitHub Pages 部署完整应用？

GitHub Pages 只能托管静态文件，**无法运行 Node.js 后端服务器**，所以：
- ❌ API 无法工作
- ❌ 支付宝支付无法工作
- ❌ 数据库无法工作

---

## 🚀 Vercel 部署 (推荐)

### 优势

- ✅ 完全免费
- ✅ 支持 Node.js
- ✅ 自动 HTTPS
- ✅ 全球 CDN
- ✅ 自动部署

### 部署步骤

#### 1. 准备代码

确保项目有以下文件：
- `package.json`
- `ecommerce-server.js`
- `vercel.json` (已创建)
- `.env` (部署时在 Vercel 设置)

#### 2. 推送到 GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/你的仓库.git
git push -u origin main
```

#### 3. 在 Vercel 部署

1. 访问 [vercel.com](https://vercel.com)
2. 使用 GitHub 账号登录
3. 点击 "New Project"
4. 选择你的仓库
5. 配置项目：
   - **Project Name**: 自定义名称
   - **Framework Preset**: Other
   - **Root Directory**: ./
6. 点击 "Environment Variables"，添加以下变量：
   ```
   ALIPAY_ENCRYPT_KEY=你的加密密钥
   ALIPAY_APP_ID_ENCRYPTED=加密后的APPID
   ALIPAY_PRIVATE_KEY_ENCRYPTED=加密后的私钥
   ALIPAY_PUBLIC_KEY_ENCRYPTED=加密后的公钥
   ALIPAY_APP_PUBLIC_KEY_ENCRYPTED=加密后的应用公钥
   ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
   ALIPAY_NOTIFY_URL=https://你的域名.vercel.app/api/alipay/notify
   ALIPAY_RETURN_URL=https://你的域名.vercel.app/payment-success
   NODE_ENV=production
   ```
7. 点击 "Deploy"

#### 4. 配置自定义域名 (可选)

1. 部署成功后，进入项目设置
2. 找到 "Domains" 部分
3. 添加你的域名

---

## 🚂 Railway 部署

### 优势

- ✅ 免费额度充足
- ✅ 支持 Node.js
- ✅ 简单易用
- ✅ 支持数据库

### 部署步骤

#### 1. 准备代码

确保项目有以下文件：
- `package.json`
- `ecommerce-server.js`
- `railway.json` (已创建)

#### 2. 推送到 GitHub

同上

#### 3. 在 Railway 部署

1. 访问 [railway.app](https://railway.app)
2. 使用 GitHub 账号登录
3. 点击 "New Project"
4. 选择 "Deploy from repo"
5. 选择你的仓库
6. 点击 "Variables"，添加环境变量（同上）
7. 点击 "Deploy"

---

## 🎨 GitHub Pages 配置（仅前端）

如果你只想在 GitHub Pages 展示前端页面，需要修改 API 地址指向你的后端服务器。

### 步骤

1. 修改前端代码中的 API 地址，从相对路径改为绝对路径
2. 在仓库设置中开启 GitHub Pages
3. 部署静态文件

---

## 🔐 支付宝回调配置

部署成功后，需要在支付宝开放平台配置回调地址：

### 1. 登录支付宝开放平台

访问 [open.alipay.com](https://open.alipay.com)

### 2. 找到你的应用

进入应用详情页面

### 3. 配置回调地址

找到 "开发信息" -> "接口加签方式" -> "异步/同步通知地址"

配置以下地址：
- **异步通知地址 (notify_url)**: `https://你的域名/api/alipay/notify`
- **同步返回地址 (return_url)**: `https://你的域名/payment-success`

### 4. 测试支付

1. 访问你的网站
2. 下单并选择支付
3. 完成支付流程

---

## 📝 环境变量说明

### 必需的环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `ALIPAY_ENCRYPT_KEY` | 加密密钥 | 32字节的随机HEX字符串 |
| `ALIPAY_APP_ID_ENCRYPTED` | 加密后的APPID | |
| `ALIPAY_PRIVATE_KEY_ENCRYPTED` | 加密后的应用私钥 | |
| `ALIPAY_PUBLIC_KEY_ENCRYPTED` | 加密后的支付宝公钥 | |
| `ALIPAY_GATEWAY` | 支付宝网关 | https://openapi.alipay.com/gateway.do |
| `ALIPAY_NOTIFY_URL` | 异步回调地址 | https://你的域名/api/alipay/notify |
| `ALIPAY_RETURN_URL` | 同步回调地址 | https://你的域名/payment-success |

### 可选的环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | production |
| `PORT` | 服务器端口 | 9999 |

### 生成加密密钥

可以使用以下方式生成安全的加密密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🎉 部署后检查清单

- [ ] 网站可以正常访问
- [ ] 商品列表可以正常加载
- [ ] 可以加入购物车
- [ ] 可以创建订单
- [ ] 支付宝支付可以正常工作
- [ ] 支付后可以回调成功
- [ ] 订单状态可以正常更新
- [ ] HTTPS 已启用
- [ ] 自定义域名已配置（可选）

---

## 🆘 常见问题

### Q: 支付后没有回调？

A: 请检查：
1. 支付宝开放平台配置的回调地址是否正确
2. 回调地址是否是 HTTPS
3. 回调地址是否可以公网访问
4. 服务器防火墙是否开放

### Q: 二维码无法显示？

A: 请检查：
1. QRCode.js CDN 是否可以访问
2. 浏览器控制台是否有错误

### Q: 部署后 API 404？

A: 请检查：
1. 后端服务器是否正常运行
2. 路由配置是否正确
3. Vercel/Railway 配置是否正确

---

## 📚 更多资源

- [Vercel 文档](https://vercel.com/docs)
- [Railway 文档](https://docs.railway.app)
- [支付宝开放平台文档](https://opendocs.alipay.com)

---

## 💡 技术支持

如有问题，请查看：
1. 服务器日志
2. 浏览器控制台
3. 支付宝开放平台调试中心

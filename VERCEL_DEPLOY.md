# Vercel 部署指南

## 📋 目录

1. [前置条件](#前置条件)
2. [快速开始](#快速开始)
3. [环境变量配置](#环境变量配置)
4. [常见问题](#常见问题)

---

## 前置条件

- ✅ GitHub 仓库账号
- ✅ Vercel 账号
- ✅ 项目代码已推送到 GitHub

---

## 快速开始

### 1. 导入项目到 Vercel

1. 登录 [Vercel](https://vercel.com)
2. 点击 "Add New Project"
3. 选择你的 GitHub 仓库
4. 点击 "Import"

### 2. 配置项目

- **Project Name**: 输入你的项目名称 (如: kdxzhx-ecommerce)
- **Framework Preset**: 选择 "Other" (或保持默认)
- **Root Directory**: 保持为空 (当前目录)
- **Build Command**: 留空
- **Output Directory**: 留空
- **Install Command**: 留空

### 3. 添加环境变量

在 "Environment Variables" 部分，参考下面的 [环境变量配置](#环境变量配置) 添加需要的变量。

### 4. 部署

点击 "Deploy" 按钮，等待部署完成。

---

## 环境变量配置

### 必需的环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `PORT` | 服务器端口 | `9999` |
| `NODE_ENV` | 环境类型 | `production` |

### 支付宝支付 (可选)

如果你需要真实支付功能，请配置以下变量：

| 变量名 | 说明 |
|--------|------|
| `ALIPAY_ENCRYPT_KEY` | AES-256 加密密钥 (32字节十六进制) |
| `ALIPAY_APP_ID_ENCRYPTED` | 加密后的支付宝 APPID |
| `ALIPAY_PRIVATE_KEY_ENCRYPTED` | 加密后的应用私钥 |
| `ALIPAY_PUBLIC_KEY_ENCRYPTED` | 加密后的支付宝公钥 |
| `ALIPAY_GATEWAY` | 支付宝网关地址 |
| `ALIPAY_NOTIFY_URL` | 支付异步通知地址 |
| `ALIPAY_RETURN_URL` | 支付同步返回地址 |

**生成加密密钥：**

```bash
node key-manager.js generate
```

**加密支付宝配置：**

```bash
node key-manager.js encrypt
```

### EmailJS 邮件通知 (推荐)

| 变量名 | 说明 |
|--------|------|
| `EMAIL_PROVIDER` | 设置为 `emailjs` |
| `EMAILJS_PUBLIC_KEY` | EmailJS Public Key |
| `EMAILJS_PRIVATE_KEY` | EmailJS Private Key |
| `EMAILJS_SERVICE_ID` | EmailJS Service ID |
| `EMAILJS_OTP_TEMPLATE_ID` | 验证码模板 ID |
| `EMAILJS_ORDER_TEMPLATE_ID` | 订单通知模板 ID |

---

## 常见问题

### Q: 部署后访问页面 404？

A: 检查 `vercel.json` 中的路由配置是否正确，确保所有页面路由都已定义。

### Q: 静态资源加载失败？

A: 检查 HTML 文件中的资源路径是否正确，应该使用相对路径或绝对路径。

### Q: API 接口返回 500 错误？

A: 检查 Vercel 控制台的函数日志，查看具体错误信息。

### Q: 数据库文件没有保存？

A: Vercel 是无服务器环境，文件系统是临时的。建议使用真实数据库替代 JSON 文件存储。

### Q: 如何更新部署？

A: 只需要推送代码到 GitHub 的 main 分支，Vercel 会自动重新部署。

---

## 📞 获取帮助

如有问题，请查看：
- Vercel 官方文档: https://vercel.com/docs
- 项目 README.md

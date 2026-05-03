# GitHub OAuth 登录集成说明

## 📋 概述

本项目已成功集成 GitHub OAuth 登录功能！用户可以通过 GitHub 账户快速登录 KDX丨ZHX 商城。

---

## 🚀 配置步骤

### 1️⃣ 创建 GitHub OAuth 应用

1. 访问 GitHub Developer Settings: https://github.com/settings/developers
2. 点击 **"OAuth Apps"** → **"New OAuth App"**
3. 填写以下信息：
   - **Application name**: `KDX丨ZHX`
   - **Homepage URL**: `http://localhost:3002`
   - **Application description`: `KDX丨ZHX 电商平台 - GitHub OAuth 登录`
   - **Authorization callback URL**: `http://localhost:3002/api/github/callback`
4. 点击 **"Register Application"**

### 2️⃣ 获取凭证

创建成功后，你会获得：
- **Client ID** (显示在页面顶部)
- **Client Secret** (需要点击 **"Generate a new client secret"** 生成)

⚠️ **重要**: Client Secret 只显示一次，请立即保存！

### 3️⃣ 配置到项目

修改 `ecommerce-server.js` 文件：

```javascript
// 在第 249-250 行和第 257-258 行
const clientId = '你的_Client_ID'; // 替换为实际的 Client ID
const clientSecret = '你的_Client_Secret'; // 替换为实际的 Client Secret
```

---

## ✨ 功能特性

### 🔐 GitHub 登录流程
1. 用户点击 **"GitHub登录"** 按钮
2. 跳转到 GitHub 授权页面
3. 用户授权后，GitHub 回调到 `/api/github/callback`
4. 服务器获取用户信息并创建/登录账户
5. 自动跳转到商城首页

### 👤 自动创建账户
- 首次使用 GitHub 登录会自动创建新账户
- 使用 GitHub 用户名、邮箱和头像
- GitHub ID 关联用户账户

### 📱 用户体验
- 无需输入密码
- 一键登录
- 安全的 OAuth 授权流程

---

## 🛠️ 技术实现

### 后端 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/github/login` | GET | 重定向到 GitHub 授权页面 |
| `/api/github/callback` | GET | 处理 GitHub 授权回调 |

### 数据流

```
用户 → GitHub授权 → 获取access_token → 获取用户信息 → 登录/创建用户 → 跳转商城
```

---

## 📝 测试账户

系统已预配置以下测试账户（可在 auth.html 使用）：

| 账户类型 | 用户名 | 密码 | 说明 |
|----------|--------|------|------|
| 管理员 | 13800138000 | admin123 | 后台管理权限 |
| 普通用户 | 13900139000 | test123 | 普通用户权限 |
| 开发者管理 | 13700137000 | devadmin123 | 开发测试管理 |
| 开发者测试 | 13600136000 | devtest123 | 开发测试用户 |

---

## 🎯 使用 GitHub 登录

1. 访问 http://localhost:3002/auth
2. 点击 **"GitHub登录"** 按钮
3. 在 GitHub 授权页面点击 **"Authorize"**
4. 自动登录并跳转到商城首页！

---

## 📂 文件清单

| 文件 | 说明 |
|------|------|
| `auth.html` | 登录页面，包含 GitHub 登录按钮 |
| `shop.html` | 商城首页，处理 GitHub 登录回调 |
| `ecommerce-server.js` | 后端服务器，包含 GitHub OAuth 逻辑 |
| `database.js` | 数据库管理，用户数据存储 |

---

## 🔒 安全建议

1. **生产环境**:
   - 使用 HTTPS
   - 不要在代码中硬编码凭证
   - 使用环境变量存储 Client Secret
   - 添加 CSRF 防护

2. **凭证安全**:
   - 不要将 Client Secret 提交到 Git
   - 使用环境变量或配置文件
   - 定期轮换凭证

---

## 🐛 故障排除

### GitHub 授权失败
- 检查回调 URL 是否正确
- 确认 Client ID/Secret 正确
- 查看浏览器控制台错误

### 用户创建失败
- 检查 data/users.json 文件权限
- 确认用户数据正确解析

---

## 📞 支持

如有问题，请检查：
1. 服务器日志
2. 浏览器控制台
3. GitHub OAuth 应用配置

---

🎉 **恭喜！GitHub OAuth 登录已成功集成！**

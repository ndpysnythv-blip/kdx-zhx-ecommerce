# KDX丨ZHX - 通知系统配置指南

## 📋 概述

本项目现已支持完整的验证码和订单通知系统，支持多种邮件服务提供商：

✅ **SendGrid** - 专业邮件服务，推荐用于生产环境
✅ **Nodemailer** - 支持Gmail、QQ邮箱等SMTP服务
✅ **短信验证码** - 支持8+家国内外短信服务商
✅ **订单状态通知** - 创建、付款、发货、完成、取消、退款
✅ **异常登录检测** - 记录登录位置，检测可疑登录
✅ **精美的邮件模板** - 渐变色设计，现代化UI

---

## 🚀 快速开始（推荐使用SendGrid）

### 方案一：SendGrid配置（推荐用于生产环境）

#### 步骤1：注册SendGrid账号

访问 https://sendgrid.com 注册免费账号（免费额度：每天100封邮件）

#### 步骤2：创建API Key

1. 登录SendGrid控制台
2. 进入 Settings → API Keys
3. 点击 "Create API Key"
4. 选择 "Full Access" 或 "Restricted Access"（建议选择 Mail Send 权限）
5. 生成API Key并复制保存（只显示一次！）

#### 步骤3：验证发件人邮箱

1. 进入 Settings → Sender Authentication
2. 点击 "Verify a Single Sender"（验证单个发件人）或 "Authenticate a Domain"（验证整个域名）
3. 填写发件人邮箱信息
4. 点击验证邮件中的链接完成验证

#### 步骤4：配置.env文件

```env
# 选择SendGrid作为邮件服务
EMAIL_PROVIDER=sendgrid

# 配置SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key-here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

#### 步骤5：安装依赖并启动

```bash
# 安装SendGrid依赖
npm install

# 启动服务器
npm run dev
```

🎉 完成！SendGrid已成功配置。

---

### 方案二：Nodemailer（SMTP服务）

#### Gmail邮箱配置（推荐）

1. **开启Gmail两步验证**
   - 访问：https://myaccount.google.com/security
   - 搜索"两步验证"并开启

2. **创建应用专用密码**
   - 访问：https://myaccount.google.com/apppasswords
   - 应用选择：邮件 (Mail)
   - 设备选择：其他 (Other) → 输入 "KDX电商"
   - 点击生成 → **复制保存这个16位密码**

3. **配置.env文件**
   ```env
   EMAIL_PROVIDER=nodemailer
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-16-character-app-password
   ```

#### QQ邮箱配置（国内推荐）

1. **获取QQ邮箱授权码**
   - 登录QQ邮箱 → 设置 → 账户
   - 找到 "POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务"
   - 开启 "IMAP/SMTP服务"
   - 发送短信验证 → 获取授权码

2. **配置.env文件**
   ```env
   EMAIL_PROVIDER=nodemailer
   EMAIL_USER=your-email@qq.com
   EMAIL_PASS=your-authorization-code
   ```

---

## 📱 短信服务配置（可选）

如果需要短信验证码，选择以下任一服务商：

### Textbelt（最简单，每天1条免费）

```env
SMS_PROVIDER=textbelt
TEXTBELT_KEY=textbelt
```

### Twilio（国际短信，有免费额度）

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

### 国内短信服务商

项目支持：容联云、云片网、SUBMAIL、网易云信等

参考 `.env.example` 配置相应参数

---

## 🔔 订单状态通知说明

系统会在以下场景自动发送通知：

| 订单状态 | 通知内容 | 触发条件 |
|---------|---------|---------|
| created | 订单创建成功，总额多少 | 用户下单 |
| paid | 订单付款成功 | 订单状态更新为paid |
| shipped | 订单已发货 | 订单状态更新为shipped |
| completed | 订单已完成，感谢您的购买 | 订单状态更新为completed |
| cancelled | 订单已取消 | 订单状态更新为cancelled |
| refunded | 退款申请已处理 | 退款申请或退款状态变更 |

### 通知方式优先级

1. **优先邮箱** - 如果用户有邮箱且配置了邮箱服务
2. **其次短信** - 如果配置了短信服务
3. **最后控制台** - 开发模式会在控制台输出

---

## 🔐 安全特性

### 登录位置记录

系统会自动记录每次登录：
- 登录IP地址
- 设备类型（手机/平板/桌面）
- User-Agent信息
- 登录时间
- 登录是否成功

### 异常登录检测

当检测到以下情况会标记为异常登录：
- 新的IP地址 + 新的设备类型
- 系统会在前端显示黄色警告

### 登录历史API

```
GET /api/login-history?userId=xxx
```

返回用户最近的登录记录

---

## 📧 邮件模板说明

所有邮件都是精美的HTML格式，包含：
- 渐变色头部设计
- 清晰的信息展示
- 订单详情表格
- 退款详情展示
- 现代化的UI风格

### 验证码邮件示例

🔐 安全验证码

您的验证码是：**123456**

该验证码5分钟内有效，请勿泄露

---

## 🎯 SendGrid优势

选择SendGrid的原因：

✅ **高送达率** - 专业邮件服务，避免进入垃圾邮件
✅ **免费额度** - 每天100封免费邮件，适合初创项目
✅ **详细统计** - 查看邮件打开率、点击率等数据
✅ **易于扩展** - 支持动态模板、批量发送等高级功能
✅ **可靠稳定** - Twilio旗下产品，企业级服务

---

## 🛠️ API接口说明

### 发送验证码

```http
POST /api/sms/send
Content-Type: application/json

{
  "phone": "13800138000",
  "email": "user@example.com",
  "type": "login" // 或 "register", "reset"
}
```

### 验证验证码

```http
POST /api/sms/verify
Content-Type: application/json

{
  "phone": "13800138000", // 或 "email"
  "code": "123456"
}
```

### 登录接口（已增强）

```http
POST /api/login
Content-Type: application/json

{
  "username": "13800138000", // 或邮箱
  "password": "password123",
  "loginType": "phone" // 或 "email"
}

响应包含：
{
  "isUnusualLogin": boolean,
  "loginLocation": {
    "ip": "xxx.xxx.xxx.xxx",
    "deviceType": "desktop",
    "userAgent": "..."
  }
}
```

---

## 📊 用户数据结构更新

现有用户已自动迁移，新用户包含以下字段：

```javascript
{
  "id": "...",
  "username": "...",
  "email": "...",
  "phone": "...",
  "loginHistory": [
    {
      "ip": "xxx.xxx.xxx.xxx",
      "deviceType": "desktop",
      "userAgent": "...",
      "isSuccessful": true,
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "lastLoginAt": "2024-01-01T00:00:00.000Z",
  "lastLoginLocation": {
    "ip": "...",
    "deviceType": "..."
  }
}
```

---

## 🎯 测试账号

| 账号类型 | 电话 | 密码 | 邮箱 |
|---------|-----|------|------|
| 管理员 | 13800138000 | admin123 | admin@kdxzhx.com |
| 测试用户 | 13900139000 | test123 | test@kdxzhx.com |
| 开发者 | 13700137000 | devadmin123 | devadmin@kdxzhx.com |

---

## 📝 注意事项

### SendGrid配置注意事项

1. **保护API Key** - 永远不要将包含真实API Key的.env文件提交到Git
2. **验证发件人** - 必须在SendGrid验证发件人邮箱或域名
3. **监控配额** - 注意使用量，避免超出免费额度
4. **IP预热** - 如果发送大量邮件，建议逐步增加发送量
5. **退订链接** - SendGrid会自动添加退订链接（符合法规要求）

### 通用注意事项

1. **验证码有效期** - 5分钟内有效
2. **发送频率限制** - 每分钟只能发送1次验证码
3. **环境变量安全** - .env文件应该添加到.gitignore
4. **生产环境建议** - 使用SendGrid或其他专业邮件服务

---

## 🔧 故障排除

### SendGrid邮件发送失败

检查清单：

1. **API Key是否正确**
   - 确认API Key是否已复制完整
   - 确认API Key权限是否包含 "Mail Send"

2. **发件人邮箱是否已验证**
   - 登录SendGrid控制台 → Settings → Sender Authentication
   - 确认发件人邮箱状态为 "Verified"

3. **查看SendGrid活动日志**
   - 进入 Activity → Email Activity
   - 查看是否有发送记录和错误信息

4. **检查.env配置**
   - 确认 EMAIL_PROVIDER=sendgrid
   - 确认 SENDGRID_API_KEY 和 SENDGRID_FROM_EMAIL 已正确配置

5. **查看服务器日志**
   - 服务器控制台会输出详细的错误信息

### Nodemailer邮件发送失败

检查清单：

1. 邮箱和密码是否正确
2. Gmail是否开启了两步验证和应用密码
3. QQ邮箱是否获取了授权码
4. 网络连接是否正常

### 短信发送失败

检查清单：

1. 短信服务商配置是否完整
2. 账户余额是否充足
3. 手机号格式是否正确（国际号码需加国家码）
4. 短信模板是否已审核通过

### 订单通知不发送

检查清单：

1. 用户是否有邮箱或手机号
2. 订单数据中是否有userId或userPhone字段
3. 服务器控制台是否有错误日志

---

## 💡 SendGrid高级功能

### 使用动态模板（可选）

SendGrid支持动态邮件模板，可以在SendGrid控制台设计精美的模板，然后通过API调用：

```javascript
// 示例代码（需要在notification-service.js中扩展）
const msg = {
  to: 'user@example.com',
  from: 'noreply@yourdomain.com',
  templateId: 'your-template-id',
  dynamicTemplateData: {
    code: '123456',
    username: '张三'
  }
};
await sgMail.send(msg);
```

### 批量发送邮件

SendGrid支持一次API调用发送多封邮件，适合发送营销邮件等场景。

### Webhook集成

可以配置SendGrid Webhook，接收邮件送达、打开、点击等事件回调。

---

## 📚 更多文档

- [SendGrid官方文档](https://docs.sendgrid.com/)
- [SMS_SETUP.md](./SMS_SETUP.md) - 详细的短信服务配置
- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Firebase相关配置
- [GITHUB_OAUTH_SETUP.md](./GITHUB_OAUTH_SETUP.md) - GitHub登录配置

---

## 🎉 完成！

恭喜你配置完成！现在你的电商平台拥有了专业的邮件通知系统。

如有问题，请查看服务器控制台日志或访问SendGrid控制台查看活动记录。

# 验证码服务配置指南

## 🎯 推荐顺序

**1. Gmail 邮箱验证（强烈推荐！最稳定！）✅**
**2. QQ 邮箱验证（国内推荐！）✅**
**3. 网页显示（无需配置，直接用）✅**
**4. 其他短信服务**

---

## 📧 Gmail 邮箱验证（强烈推荐！）

### 前置条件
⚠️ **必须先开启 Gmail 两步验证！**

### 步骤

1. **开启 Google 两步验证**
   - 去：https://myaccount.google.com/
   - 搜索 "两步验证"（2-Step Verification）
   - 按提示开启

2. **创建 Gmail 应用密码**
   - 去：https://myaccount.google.com/apppasswords
   - 应用：选择 `邮件 (Mail)`
   - 设备：选择 `其他 (Other)` → 输入 `KDX商城`
   - 点击 **生成**
   - **保存那个 16位的应用密码**（就是一堆字母！）

3. **配置 `.env` 文件**
   在项目根目录的 `.env` 文件中填入：
```env
# 不用短信服务
# SMS_PROVIDER=textbelt
# TEXTBELT_KEY=textbelt

# Gmail 邮箱配置
EMAIL_USER=你的真实Gmail邮箱@gmail.com
EMAIL_PASS=刚才生成的应用密码
```

4. **重启服务器**
   服务器会自动重启，或者手动重启一下：
```bash
npm run dev
```

5. **测试！**
   - 去注册/登录页面
   - 输入手机号（必须）
   - 输入你的真实邮箱（接收验证码的邮箱）
   - 点击发送验证码
   - 去 Gmail 收邮件！

---

## 📧 QQ 邮箱验证（国内推荐）

### 步骤

1. **获取 QQ 邮箱授权码**
   - 登录 QQ 邮箱：https://mail.qq.com/
   - 设置 → 账户 → 开启 IMAP/SMTP服务
   - 发短信验证 → 获取授权码

2. **配置 `.env` 文件**
```env
EMAIL_USER=你的QQ邮箱@qq.com
EMAIL_PASS=你的授权码
```

---

## 🚀 Textbelt（短信，每天1条免费）

```env
SMS_PROVIDER=textbelt
TEXTBELT_KEY=textbelt
```

---

## 📱 其他短信服务

### Twilio（$15免费额度）
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
```

### Vonage（€2免费额度）
```env
SMS_PROVIDER=vonage
VONAGE_API_KEY=...
VONAGE_API_SECRET=...
```

### Plivo（$0.50免费额度）
```env
SMS_PROVIDER=plivo
PLIVO_AUTH_ID=...
PLIVO_AUTH_TOKEN=...
PLIVO_FROM=...
```

### 国内服务
- 云片网、容联云通讯、SUBMAIL、网易云信
- 详见文档其他部分

---

## 💡 我的建议

**强烈推荐先用 Gmail 邮箱验证！**
- 最稳定！
- 完全免费！
- 全球通用！
- 配置简单！

如果不想配置，还是可以用**网页显示验证码**，零配置直接用！

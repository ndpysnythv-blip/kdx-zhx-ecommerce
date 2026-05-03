# KDX丨ZHX - EmailJS配置指南

## 📋 概述

EmailJS是一个强大的邮件服务，特别适合前端项目。本项目现在支持三种邮件服务方案：

✅ **EmailJS** - 前端友好，适合联系表单和轻量级通知
✅ **SendGrid** - 专业邮件服务，推荐用于生产环境
✅ **Nodemailer** - 支持Gmail、QQ邮箱等SMTP服务

---

## 🎯 EmailJS的优势

选择EmailJS的原因：

✅ **前端友好** - 无需后端代码，直接在浏览器中发送邮件
✅ **配置简单** - 可视化创建邮件模板，无需编程
✅ **免费额度** - 每月200封免费邮件，足够大多数项目
✅ **多种集成** - 支持Gmail、Outlook、SendGrid等30+邮件服务
✅ **动态模板** - 支持变量替换，个性化邮件内容
✅ **详细统计** - 查看邮件发送情况和成功率

---

## 🚀 快速开始 - EmailJS配置

### 步骤1：注册EmailJS账号

访问 https://www.emailjs.com 注册免费账号

### 步骤2：添加邮件服务

1. 登录EmailJS控制台
2. 点击左侧菜单 "Email Services" → "Add New Service"
3. 选择您想使用的邮件服务：
   - **Gmail** - 推荐（配置简单）
   - **Outlook** - 微软邮箱
   - **SendGrid** - 专业服务
   - 或其他30+邮件服务
4. 按照提示完成OAuth授权或SMTP配置
5. 记录下生成的 **Service ID**（形如 `service_xxxxx`）

### 步骤3：创建邮件模板

#### 模板1：联系我们表单

1. 点击左侧菜单 "Email Templates" → "Create New Template"
2. 填写模板信息：
   - **Template Name**: `联系我们表单`
3. 使用以下HTML模板：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>新的联系表单提交</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h2 style="color: white; margin: 0;">📬 新的联系表单提交</h2>
  </div>
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
    <p><strong>姓名：</strong> {{to_name}}</p>
    <p><strong>邮箱：</strong> {{from_email}}</p>
    <p><strong>电话：</strong> {{phone}}</p>
    <p><strong>主题：</strong> {{subject}}</p>
    <p><strong>消息：</strong></p>
    <p style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #667eea;">{{message}}</p>
    <p style="margin-top: 20px; color: #999; font-size: 12px; text-align: center;">
      此邮件来自KDX商城联系表单
    </p>
  </div>
</body>
</html>
```

4. 填写以下字段：
   - **Subject**: `新的联系表单: {{subject}}`
   - **To Email**: `您的邮箱地址@example.com` (接收表单提交的邮箱)
   - **From Name**: `KDX商城`
   - **Reply To**: `{{from_email}}`

5. 点击 "Save" 保存
6. 记录下 **Template ID**（形如 `template_xxxxx`）

#### 模板2：订单状态通知（可选）

如果您想使用EmailJS发送订单通知，可以创建以下模板：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>订单状态更新</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h2 style="color: white; margin: 0;">{{status_icon}} 订单{{status_text}}</h2>
  </div>
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
    <div style="background: {{status_color}}15; padding: 20px; border-left: 4px solid {{status_color}}; border-radius: 8px; margin-bottom: 25px;">
      <p style="color: {{status_color}}; margin: 0; font-weight: 600; font-size: 16px;">{{status_description}}</p>
    </div>
    
    <div style="background: white; padding: 25px; border-radius: 10px;">
      <p><strong>订单号：</strong> <span style="color: #667eea;">{{order_id}}</span></p>
      <p><strong>下单时间：</strong> {{order_date}}</p>
      
      <h3 style="margin: 20px 0 10px 0; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">📋 订单详情</h3>
      {{products_list}}
      
      <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #eee; text-align: right;">
        <p style="margin: 0; color: #666;">
          订单总额：<span style="color: #ef4444; font-size: 28px; font-weight: bold; margin-left: 10px;">¥{{total_amount}}</span>
        </p>
      </div>
    </div>
    
    <div style="margin-top: 25px; text-align: center;">
      <p style="color: #999; font-size: 14px; margin: 0;">如有问题，请随时联系客服</p>
      <p style="color: #ccc; font-size: 12px; margin-top: 10px;">这是一封自动发送的邮件，请勿直接回复</p>
    </div>
  </div>
</body>
</html>
```

### 步骤4：获取Public Key

1. 点击左侧菜单 "Account" → "API Keys"
2. 复制 **Public Key**（形如 `user_xxxxx`）

### 步骤5：配置前端

在项目中创建或更新配置文件：

#### 选项A：在HTML中直接使用（推荐用于联系表单）

```html
<!-- 1. 引入EmailJS SDK -->
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>

<!-- 2. 初始化EmailJS -->
<script type="text/javascript">
  emailjs.init("your_public_key_here");
</script>

<!-- 3. 创建联系表单 -->
<form id="contact-form">
  <input type="text" name="to_name" placeholder="收件人姓名" required>
  <input type="email" name="from_email" placeholder="您的邮箱" required>
  <input type="tel" name="phone" placeholder="您的电话">
  <input type="text" name="subject" placeholder="主题" required>
  <textarea name="message" placeholder="您的消息" rows="5" required></textarea>
  <button type="submit">发送消息</button>
</form>

<!-- 4. 处理表单提交 -->
<script type="text/javascript">
  document.getElementById('contact-form').addEventListener('submit', function(event) {
    event.preventDefault();
    
    const formData = {
      to_name: this.to_name.value,
      from_email: this.from_email.value,
      phone: this.phone.value,
      subject: this.subject.value,
      message: this.message.value
    };
    
    emailjs.send(
      'your_service_id',
      'your_template_id',
      formData
    ).then(function(response) {
      console.log('邮件发送成功！', response);
      alert('消息已发送！我们会尽快回复您。');
      document.getElementById('contact-form').reset();
    }, function(error) {
      console.error('邮件发送失败:', error);
      alert('发送失败，请稍后重试。');
    });
  });
</script>
```

#### 选项B：作为后端服务（需要EmailJS Node SDK）

```javascript
// 安装SDK
// npm install @emailjs/nodejs

const emailjs = require('@emailjs/nodejs');

// 初始化
emailjs.init({
  publicKey: 'your_public_key',
  privateKey: 'your_private_key' // 需要在EmailJS控制台生成
});

// 发送邮件
emailjs.send(
  'your_service_id',
  'your_template_id',
  {
    to_name: '客户姓名',
    from_email: 'sender@example.com',
    message: '消息内容'
  }
).then(response => {
  console.log('发送成功:', response);
}).catch(error => {
  console.error('发送失败:', error);
});
```

---

## 🎨 本项目的EmailJS集成方案

### 推荐方案：混合架构

为了最佳的用户体验和系统稳定性，我们推荐以下方案：

```
┌─────────────────────────────────────────────────────────┐
│                     KDX电商平台                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────┐         ┌───────────────┐          │
│  │   前端表单    │         │   后端服务    │          │
│  │  (EmailJS)    │         │  (SendGrid)   │          │
│  │               │         │               │          │
│  │ • 联系我们    │         │ • 验证码      │          │
│  │ • 咨询建议    │         │ • 订单通知    │          │
│  │ • 反馈表单    │         │ • 退款通知    │          │
│  └───────────────┘         └───────────────┘          │
│         │                            │                 │
│         └─────────────┬──────────────┘                 │
│                       │                                │
│              用户邮件通知                              │
└─────────────────────────────────────────────────────────┘
```

### 为什么选择混合方案？

| 功能 | EmailJS | SendGrid/Nodemailer | 推荐使用 |
|-----|---------|-------------------|---------|
| 联系表单 | ✅ 完美 | ⚠️ 可以 | **EmailJS** |
| 用户反馈 | ✅ 完美 | ⚠️ 可以 | **EmailJS** |
| 登录验证码 | ⚠️ 可以 | ✅ 完美 | **SendGrid** |
| 订单通知 | ⚠️ 可以 | ✅ 完美 | **SendGrid** |
| 退款通知 | ⚠️ 可以 | ✅ 完美 | **SendGrid** |

**原因**：
- **EmailJS**：适合用户主动发起的表单提交，前端体验好
- **SendGrid**：适合后端自动触发的通知，更可靠且易于集成

---

## 📁 项目配置说明

### 更新.env配置

在`.env`文件中添加EmailJS配置：

```env
# ====================================================
# 邮件服务选择（必选）
# ====================================================

# 选择邮件服务提供商：'sendgrid'、'nodemailer' 或 'emailjs'
# 注意：'emailjs' 主要用于前端，后端建议使用 'sendgrid'
EMAIL_PROVIDER=sendgrid

# ====================================================
# EmailJS配置（可选，用于前端联系表单）
# ====================================================

# EmailJS Public Key
EMAILJS_PUBLIC_KEY=your_emailjs_public_key

# EmailJS Service ID
EMAILJS_SERVICE_ID=your_emailjs_service_id

# EmailJS Contact Form Template ID
EMAILJS_CONTACT_TEMPLATE_ID=your_contact_template_id

# ====================================================
# SendGrid配置（推荐用于生产环境）
# ====================================================

SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

### 前端联系表单集成

在您的联系页面添加EmailJS表单：

```html
<!DOCTYPE html>
<html>
<head>
  <title>联系我们 - KDX商城</title>
  <style>
    .contact-form {
      max-width: 500px;
      margin: 50px auto;
      padding: 30px;
      background: #f8f9fa;
      border-radius: 12px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      color: #333;
    }
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
    }
    .submit-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      width: 100%;
    }
    .submit-btn:hover {
      opacity: 0.9;
    }
    .success-message {
      background: #11998e;
      color: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 20px;
      display: none;
    }
    .error-message {
      background: #ef4444;
      color: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 20px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="contact-form">
    <h2 style="text-align: center; color: #333; margin-bottom: 30px;">📬 联系我们</h2>
    
    <div id="success-message" class="success-message">
      ✅ 消息已发送！我们会尽快回复您。
    </div>
    <div id="error-message" class="error-message">
      ❌ 发送失败，请稍后重试。
    </div>
    
    <form id="contact-form">
      <div class="form-group">
        <label>您的姓名 *</label>
        <input type="text" name="to_name" placeholder="请输入您的姓名" required>
      </div>
      
      <div class="form-group">
        <label>您的邮箱 *</label>
        <input type="email" name="from_email" placeholder="请输入您的邮箱" required>
      </div>
      
      <div class="form-group">
        <label>您的电话</label>
        <input type="tel" name="phone" placeholder="请输入您的电话">
      </div>
      
      <div class="form-group">
        <label>主题 *</label>
        <input type="text" name="subject" placeholder="请输入主题" required>
      </div>
      
      <div class="form-group">
        <label>消息内容 *</label>
        <textarea name="message" rows="5" placeholder="请输入您的消息" required></textarea>
      </div>
      
      <button type="submit" class="submit-btn" id="submit-btn">
        发送消息
      </button>
    </form>
  </div>

  <!-- 引入EmailJS SDK -->
  <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>

  <script type="text/javascript">
    // 初始化EmailJS（请替换为您的Public Key）
    emailjs.init("your_public_key_here");

    // 处理表单提交
    document.getElementById('contact-form').addEventListener('submit', function(event) {
      event.preventDefault();
      
      const submitBtn = document.getElementById('submit-btn');
      const successMsg = document.getElementById('success-message');
      const errorMsg = document.getElementById('error-message');
      
      // 隐藏消息，禁用按钮
      successMsg.style.display = 'none';
      errorMsg.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.innerHTML = '发送中...';
      
      const formData = {
        to_name: this.to_name.value,
        from_email: this.from_email.value,
        phone: this.phone.value,
        subject: this.subject.value,
        message: this.message.value
      };
      
      // 发送邮件
      emailjs.send(
        'your_service_id',        // 替换为您的Service ID
        'your_template_id',       // 替换为您的Template ID
        formData
      ).then(function(response) {
        console.log('邮件发送成功！', response);
        successMsg.style.display = 'block';
        document.getElementById('contact-form').reset();
      }, function(error) {
        console.error('邮件发送失败:', error);
        errorMsg.style.display = 'block';
      }).finally(function() {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '发送消息';
      });
    });
  </script>
</body>
</html>
```

---

## 🎯 EmailJS邮件模板变量说明

### 变量命名规则

在EmailJS模板中使用变量时，使用双大括号 `{{variable_name}}`

### 常用变量示例

```html
<!-- 用户信息 -->
<p>姓名：{{to_name}}</p>
<p>邮箱：{{from_email}}</p>
<p>电话：{{phone}}</p>

<!-- 订单信息 -->
<p>订单号：{{order_id}}</p>
<p>订单日期：{{order_date}}</p>
<p>订单总额：¥{{total_amount}}</p>

<!-- 消息内容 -->
<p>主题：{{subject}}</p>
<p>消息：{{message}}</p>

<!-- 状态信息 -->
<p>状态：{{status_text}}</p>
<p>状态描述：{{status_description}}</p>
```

---

## 📊 免费额度对比

| 服务 | 免费额度 | 适合场景 |
|-----|---------|---------|
| **EmailJS** | 每月200封 | 联系表单、轻量级通知 |
| **SendGrid** | 每天100封 | 订单通知、验证码、营销邮件 |
| **Textbelt** | 每天1条 | 短信验证码（仅短信） |
| **Gmail SMTP** | 限制较严 | 开发测试、个人项目 |

---

## 🔧 故障排除

### EmailJS邮件发送失败

检查清单：

1. **Public Key是否正确**
   - 确认Public Key已复制完整
   - 确认PublicKey没有多余的空格

2. **Service ID和Template ID是否正确**
   - 登录EmailJS控制台确认ID是否匹配
   - 检查是否有拼写错误

3. **邮件服务是否已正确配置**
   - 确认邮件服务状态为 "Active"
   - 检查OAuth授权是否有效

4. **查看EmailJS活动日志**
   - 进入 EmailJS控制台 → "Email History"
   - 查看是否有发送记录和错误信息

5. **检查浏览器控制台**
   - 按F12打开开发者工具
   - 查看Console标签是否有错误信息

### 邮件进入垃圾邮箱

解决方案：

1. **验证发件人邮箱**
   - 在EmailJS中使用已验证的发件人
   - 考虑使用域名邮箱而非个人邮箱

2. **避免触发垃圾邮件过滤器**
   - 避免使用过多的大写字母
   - 避免使用特殊符号
   - 保持内容真实自然

3. **配置SPF/DKIM（可选）**
   - 如果使用自己的域名，配置邮件验证记录
   - 提高邮件送达率

---

## 💡 EmailJS高级功能

### 1. 附件支持

EmailJS支持发送附件，但需要额外配置。查看官方文档了解详情。

### 2. 自动回复

可以配置EmailJS在收到邮件后自动发送确认回复给用户。

### 3. Webhook集成

EmailJS支持Webhook，在邮件发送成功或失败时收到通知回调。

### 4. 团队协作

EmailJS支持团队功能，多人可以协作管理邮件模板和服务。

---

## 📚 更多资源

- [EmailJS官方文档](https://www.emailjs.com/docs/)
- [EmailJS控制台](https://dashboard.emailjs.com/)
- [NOTIFICATION_SETUP.md](./NOTIFICATION_SETUP.md) - SendGrid和Nodemailer配置
- [SMS_SETUP.md](./SMS_SETUP.md) - 短信服务配置

---

## 🎉 完成！

恭喜您配置完成！现在您的电商平台拥有了多种邮件服务选择：

- ✅ **EmailJS** - 用于前端联系表单
- ✅ **SendGrid** - 用于后端订单通知和验证码
- ✅ **Nodemailer** - 作为备选方案

选择最适合您业务需求的方案，或者同时使用多种方案！

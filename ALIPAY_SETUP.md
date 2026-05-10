# 支付宝支付配置指南

## 概述

本系统已完全集成支付宝电脑网站支付功能，移除了所有模拟支付代码。请按照以下步骤配置支付宝支付。

## 前置准备

1. **注册支付宝开放平台账号**
   - 访问：https://open.alipay.com/
   - 注册并完成实名认证

2. **创建应用**
   - 登录支付宝开放平台
   - 进入「控制台」→「应用」→「创建应用」
   - 填写应用信息并提交审核

3. **配置应用环境**
   - 应用审核通过后，进入应用详情页
   - 在「开发信息」中配置接口加签方式

## 密钥配置步骤

### 1. 生成密钥

支付宝推荐使用支付宝密钥生成工具：

**方式一：使用支付宝密钥生成工具（推荐）**
- 下载地址：https://opendocs.alipay.com/common/02kipl
- 选择密钥格式：`PKCS8`（非JAVA适用）
- 选择密钥长度：`2048`
- 点击「生成密钥」
- 保存生成的 `应用私钥` 和 `应用公钥`

**方式二：使用OpenSSL命令生成**
```bash
# 生成应用私钥
openssl genrsa -out app_private_key.pem 2048

# 将私钥转换为PKCS8格式
openssl pkcs8 -topk8 -inform PEM -in app_private_key.pem -outform PEM -nocrypt -out app_private_key_pkcs8.pem

# 生成应用公钥
openssl rsa -in app_private_key.pem -pubout -out app_public_key.pem
```

### 2. 配置应用公钥

1. 登录支付宝开放平台
2. 进入应用详情页
3. 找到「接口加签方式」→「设置」
4. 选择「公钥」模式
5. 将生成的 `应用公钥` 粘贴进去
6. 点击「确定设置」
7. **重要**：复制页面显示的 `支付宝公钥`（不是应用公钥）

### 3. 配置系统环境变量

复制 `.env.example` 为 `.env`：
```bash
cp .env.example .env
```

编辑 `.env` 文件，填入以下信息：

```env
# 支付宝应用ID
ALIPAY_APP_ID=你的应用ID

# 应用私钥 (PKCS8格式，去掉首尾的-----BEGIN/END-----)
ALIPAY_PRIVATE_KEY=你的应用私钥

# 支付宝公钥 (从开放平台获取，去掉首尾的-----BEGIN/END-----)
ALIPAY_PUBLIC_KEY=你的支付宝公钥

# 支付宝网关
# 沙箱环境：https://openapi.alipaydev.com/gateway.do
# 正式环境：https://openapi.alipay.com/gateway.do
ALIPAY_GATEWAY=https://openapi.alipaydev.com/gateway.do

# 异步通知地址 (需要公网可访问)
ALIPAY_NOTIFY_URL=https://yourdomain.com/api/alipay/notify

# 同步返回地址
ALIPAY_RETURN_URL=https://yourdomain.com/payment-success
```

## 沙箱环境测试

### 1. 获取沙箱账号

1. 登录支付宝开放平台
2. 进入「控制台」→「沙箱」
3. 可以看到沙箱买家账号和卖家账号

### 2. 使用沙箱环境测试

1. 修改 `.env` 中的网关地址为沙箱地址
2. 使用沙箱买家账号登录支付宝进行测试支付

## 生产环境部署

### 1. 申请正式环境权限

1. 在支付宝开放平台提交应用上线申请
2. 等待审核通过
3. 获取正式环境的 APPID 和密钥

### 2. 配置生产环境

1. 修改 `.env` 中的网关地址为正式环境
2. 使用正式环境的 APPID 和密钥
3. 配置正确的异步通知地址（必须是公网可访问的HTTPS地址）

## 安全注意事项

### 1. 密钥安全

- 私钥绝对不能提交到代码仓库
- 私钥绝对不能泄露给任何人
- 建议使用环境变量或加密存储密钥
- 定期更换密钥

### 2. 回调安全

- **必须**验证异步通知的签名
- **必须**验证订单金额是否一致
- **必须**通过异步通知确认支付成功，不能依赖同步跳转
- 处理重复通知（支付宝可能会多次发送通知）

### 3. 服务器配置

- 使用 HTTPS
- 配置防火墙限制访问
- 记录所有支付相关的日志

## 常见问题

### Q: 提示「支付宝配置不完整」？

A: 请检查 `.env` 文件中是否正确配置了以下参数：
- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`

### Q: 支付后订单状态没有更新？

A: 请检查：
1. 异步通知地址是否公网可访问
2. 服务器日志中是否收到了支付宝的异步通知
3. 签名验证是否通过

### Q: 签名验证失败？

A: 请检查：
1. 支付宝公钥是否正确（是支付宝公钥，不是应用公钥）
2. 密钥格式是否正确（去掉了首尾的注释）
3. 是否使用了正确的签名算法（RSA2）

### Q: OpenSSL 相关错误？

A: 本系统已经在 `package.json` 中配置了 `--openssl-legacy-provider` 参数，正常情况下不会出现问题。如果仍有问题，请确保：
1. 使用 Node.js 16 或更高版本
2. 使用 `npm start` 或 `npm run dev` 启动服务

## 测试流程

1. 启动服务：`npm start`
2. 在网站上创建订单
3. 点击支付，跳转到支付宝页面
4. 使用沙箱账号完成支付
5. 检查订单状态是否更新为「已支付」

## 技术支持

如遇到问题，请查看：
- 支付宝开放平台文档：https://opendocs.alipay.com/
- 支付宝电脑网站支付文档：https://opendocs.alipay.com/open/270

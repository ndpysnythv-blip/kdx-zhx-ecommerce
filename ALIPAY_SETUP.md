# 支付宝真实API 配置指南

## 前置准备

在开始之前，请确保你已经在支付宝开放平台完成以下操作：

1. ✅ 注册支付宝开放平台账号：https://open.alipay.com/
2. ✅ 创建应用并获取 APPID
3. ✅ 生成应用私钥和应用公钥（推荐使用 PKCS8 格式）
4. ✅ 在开放平台配置应用公钥，获取支付宝公钥
5. ✅ 配置回调地址（可选，用于异步通知）

## 配置步骤

### 方式一：通过命令行快速配置（推荐）

直接运行以下命令，替换为你的真实密钥：

```bash
node setup-alipay.js \
  --appId=你的APPID \
  --privateKey=你的应用私钥 \
  --alipayPublicKey=支付宝公钥
```

**注意**：密钥需要去掉首尾的 `-----BEGIN...-----` 和 `-----END...-----` 标记，以及所有换行符。

---

### 方式二：通过 .env 文件配置

1. 复制示例配置文件：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入你的支付宝密钥：
```env
ALIPAY_APP_ID=2021000000000000
ALIPAY_PRIVATE_KEY=MIIEpQIBAAKCAQEA...
ALIPAY_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
```

3. 运行加密脚本：
```bash
node setup-alipay.js
```

---

## 验证配置

配置完成后，你可以运行以下命令验证解密是否正常：

```bash
node key-manager.js decrypt
```

---

## 启动服务

配置成功后，启动电商服务：

```bash
npm start
```

启动后，你会看到类似以下日志：
```
✅ 支付宝配置已加载（真实支付模式）
✅ 支付宝SDK初始化成功（真实支付模式）
KDX丨ZHX电商平台已启动: http://localhost:9999
```

---

## 网关环境选择

在 `.env` 文件中配置 `ALIPAY_GATEWAY`：

| 环境 | 网关地址 | 说明 |
|------|---------|------|
| 沙箱环境 | `https://openapi.alipaydev.com/gateway.do` | 用于测试，不产生真实资金交易 |
| 正式环境 | `https://openapi.alipay.com/gateway.do` | 真实支付环境 |

**建议**：首次配置先使用沙箱环境测试，确认无误后再切换到正式环境。

---

## 密钥获取说明

### 应用私钥
- 使用支付宝官方密钥生成工具生成
- 格式：`-----BEGIN RSA PRIVATE KEY-----...-----END RSA PRIVATE KEY-----`
- 需要去掉首尾标记和换行后填入

### 支付宝公钥
- 在支付宝开放平台配置应用公钥后获取
- 格式：`-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----`
- 需要去掉首尾标记和换行后填入

### ⚠️ 安全注意事项
1. 绝对不要将 `.env` 文件提交到代码仓库（已添加到 .gitignore）
2. 妥善保管加密密钥（ALIPAY_ENCRYPT_KEY），丢失将无法解密
3. 建议定期轮换密钥
4. 生产环境请使用正式环境配置

---

## 故障排查

### 问题：启动后仍显示"使用模拟支付模式"
**解决方案**：
- 检查 `.env` 文件是否存在
- 运行 `node key-manager.js decrypt` 验证密钥
- 确认 `alipayConfig.enabled` 为 true

### 问题：支付时报签名错误
**解决方案**：
- 检查应用私钥和支付宝公钥是否匹配
- 确认密钥格式正确（已去掉首尾标记）
- 确认签名算法为 RSA2

### 问题：支付后没有回调通知
**解决方案**：
- 检查支付宝开放平台配置的回调地址是否正确
- 确保回调地址可以公网访问
- 检查服务器防火墙设置

---

## 测试支付流程

1. 启动服务
2. 在前端选择商品下单
3. 选择支付宝支付
4. 系统会跳转到真实支付宝页面
5. 完成支付后自动返回

---

如需更多帮助，请参考：
- 支付宝开放平台文档：https://opendocs.alipay.com/
- alipay-sdk NPM 包：https://www.npmjs.com/package/alipay-sdk

# Vercel 部署配置指南

## 📋 步骤 1：获取你的 Vercel 域名

在 Vercel 部署成功后，你会获得一个域名，例如：
- `https://kdx-zhx.vercel.app`
- `https://你的自定义域名`

## 📋 步骤 2：配置 Vercel 环境变量

### 2.1 进入 Vercel 项目设置

1. 登录 Vercel 控制台
2. 选择你的项目
3. 点击 "Settings"
4. 选择 "Environment Variables"

### 2.2 添加环境变量

添加以下环境变量（按顺序添加）：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `ALIPAY_ENCRYPT_KEY` | `6f4030c714e9226c9cda4b84584610880e3b114d209a08a0df8cbbbeb7ef01ec` | 加密密钥 |
| `ALIPAY_APP_ID_ENCRYPTED` | `8c413425502dba3745ecdc3fe0162f4c:1b2f3497c8eff7bb7bd37f0663394b280b9e7932c710fbbd4d168935393bf4e7` | 加密后的 APPID |
| `ALIPAY_PRIVATE_KEY_ENCRYPTED` | `a673eaec02bd67f6025b8bb31568922e:9847e9b36a50bf476c09db9ee7b57d1f884cb067ceeac703d5c18b8ce6d33444` | 加密后的应用私钥 |
| `ALIPAY_PUBLIC_KEY_ENCRYPTED` | `a307ffa5df7c1ec2db9fede3f5850603:42ba477d2dd716fbcdf310963b2e538c5fc31ff637a858a5e7e37bd15c6a171f4a9ce1ac3f3c2c8f6337b191d78c97af50b7a311d329d2b53f7420f3e470fb22` | 加密后的支付宝公钥 |
| `ALIPAY_GATEWAY` | `https://openapi.alipay.com/gateway.do` | 正式环境网关 |
| `ALIPAY_NOTIFY_URL` | `https://kdx-zhx-电子商务.vercel.app/api/alipay/notify` | 异步回调地址 |
| `ALIPAY_RETURN_URL` | `https://kdx-zhx-电子商务.vercel.app/payment-success` | 同步回调地址 |
| `NODE_ENV` | `production` | 生产环境 |

**⚠️ 重要：**
- 如果域名是英文的（如 `kdx-zhx-dianzishangwu.vercel.app`），请修改为实际域名

## 📋 步骤 3：重新部署

配置完环境变量后，需要重新部署：

1. 在 Vercel 项目页面
2. 点击 "Deployments"
3. 选择最新的部署
4. 点击 "Redeploy"

或者，你也可以重新推送代码到 GitHub 触发自动部署：
```bash
git add .
git commit -m "Update config for Vercel"
git push
```

## 📋 步骤 4：配置支付宝开放平台回调地址

### 4.1 登录支付宝开放平台

访问 https://open.alipay.com

### 4.2 配置回调地址

1. 进入你的应用详情
2. 找到 "开发信息" -> "接口加签方式"
3. 配置以下地址：

**异步通知地址 (notify_url)**:
```
https://kdx-zhx-电子商务.vercel.app/api/alipay/notify
```

**同步返回地址 (return_url)**:
```
https://kdx-zhx-电子商务.vercel.app/payment-success
```

**⚠️ 重要：**
- 如果域名是英文的（如 `kdx-zhx-dianzishangwu.vercel.app`），请修改为实际域名

## 📋 步骤 5：测试

### 5.1 访问网站

打开你的 Vercel 域名，检查：
- ✅ 首页可以正常显示
- ✅ 商品列表可以加载
- ✅ 可以加入购物车
- ✅ 可以跳转到结算页面

### 5.2 测试支付流程

1. 添加商品到购物车
2. 进入结算页面
3. 填写收货信息
4. 选择支付方式
5. 完成支付
6. 检查订单状态是否更新

## 🔍 常见问题

### Q: 环境变量配置后还需要做什么？

A: 需要重新部署项目才能让环境变量生效。

### Q: 支付后没有回调？

A: 请检查：
1. 支付宝开放平台的回调地址是否正确
2. 回调地址是否是 HTTPS
3. Vercel 的环境变量是否正确配置

### Q: 如何查看 Vercel 的日志？

A: 在 Vercel 项目页面 -> "Functions" -> 选择函数 -> 查看日志

## 📚 更多资源

- [Vercel 环境变量文档](https://vercel.com/docs/projects/environment-variables)
- [支付宝开放平台文档](https://opendocs.alipay.com)

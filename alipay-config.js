/**
 * 支付宝支付配置
 *
 * 支付宝开放平台: https://open.alipay.com/
 *
 * 配置步骤:
 * 1. 注册支付宝开放平台账号
 * 2. 创建应用获取 APPID
 * 3. 生成应用私钥和应用公钥（使用支付宝密钥生成工具，推荐PKCS8格式）
 * 4. 在开放平台配置应用公钥，获取支付宝公钥（注意：不是应用公钥）
 * 5. 在 .env 文件中配置相关参数
 *
 * 安全机制:
 * - 支持明文配置或 AES-256-CBC 加密配置
 * - 加密配置时，私钥不会以明文形式出现在文件中
 *
 * 重要: 本系统仅支持真实支付宝支付，不提供模拟支付功能
 */

const crypto = require('crypto');
const config = require('./config');
const PORT = config.server.port || 9999;

// 安全的AES-256-CBC解密函数
function decrypt(encryptedText, key) {
  try {
    if (!encryptedText || !key) return null;

    const parts = encryptedText.split(':');
    if (parts.length !== 2) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    // 使用更兼容的方式处理解密
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    decipher.setAutoPadding(true);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('❌ 密钥解密失败:', error.message);
    return null;
  }
}

// 读取支付宝配置（支持明文和加密两种方式，兼容旧版本）
let appId = process.env.ALIPAY_APP_ID || '';
let privateKey = process.env.ALIPAY_PRIVATE_KEY || '';
let alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY || '';

// 如果没有明文配置，尝试解密方式
if (!appId || !privateKey || !alipayPublicKey) {
  const encryptKey = process.env.ALIPAY_ENCRYPT_KEY;
  if (encryptKey && encryptKey.length === 64) {
    try {
      appId = appId || decrypt(process.env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
      privateKey = privateKey || decrypt(process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
      alipayPublicKey = alipayPublicKey || decrypt(process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);
    } catch (error) {
      console.error('❌ 支付宝密钥解密失败:', error.message);
    }
  }
}

// 验证配置是否完整
const isConfigured = !!appId && !!privateKey && !!alipayPublicKey;

if (isConfigured) {
  console.log('✅ 支付宝配置加载成功');
  console.log(`   - AppID: ${appId}`);
  console.log(`   - Gateway: ${process.env.ALIPAY_GATEWAY || 'https://openapi.alipaydev.com/gateway.do'}`);
} else {
  console.error('❌ 支付宝配置不完整，请在 .env 文件中配置以下参数:');
  console.error('   - ALIPAY_APP_ID 或 ALIPAY_APP_ID_ENCRYPTED');
  console.error('   - ALIPAY_PRIVATE_KEY 或 ALIPAY_PRIVATE_KEY_ENCRYPTED');
  console.error('   - ALIPAY_PUBLIC_KEY 或 ALIPAY_PUBLIC_KEY_ENCRYPTED');
  console.error('   - ALIPAY_ENCRYPT_KEY (如果使用加密配置)');
  console.error('   - ALIPAY_GATEWAY (可选，默认沙箱环境)');
  console.error('   - ALIPAY_NOTIFY_URL (可选)');
  console.error('   - ALIPAY_RETURN_URL (可选)');
}

module.exports = {
  // 配置是否完整
  isConfigured: isConfigured,

  // 支付宝应用APPID
  appId: appId,

  // 应用私钥
  privateKey: privateKey,

  // 支付宝公钥
  alipayPublicKey: alipayPublicKey,

  // 支付宝网关地址
  gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipaydev.com/gateway.do',

  // 支付结果异步通知地址 (需要公网可访问的URL)
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || `http://localhost:${PORT}/api/alipay/notify`,

  // 支付结果同步返回地址
  returnUrl: process.env.ALIPAY_RETURN_URL || `http://localhost:${PORT}/payment-success`,

  // 签名算法 (RSA2)
  signType: 'RSA2',

  // 字符集
  charset: 'UTF-8',

  // 密钥格式 (PKCS8)
  keyType: 'PKCS8'
};

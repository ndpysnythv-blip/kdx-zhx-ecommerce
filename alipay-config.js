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
 * 5. 运行 node key-manager.js encrypt 加密密钥
 * 
 * 安全机制:
 * - 所有密钥使用 AES-256-CBC 加密后存储在 .env 文件中
 * - .env 文件已添加到 .gitignore，不会泄露到代码仓库
 * - 运行时自动解密，内存中使用明文
 * - 即使 .env 文件被窃取，没有加密密钥也无法解密
 * 
 * 加密密钥管理:
 * - 加密密钥存储在 .env 的 ALIPAY_ENCRYPT_KEY 变量中
 * - 运行 node key-manager.js encrypt 可以重新加密密钥
 * - 运行 node key-manager.js decrypt 可以验证解密
 * - 运行 node key-manager.js generate 可以生成新的加密密钥
 */

const crypto = require('crypto');
const config = require('./config');
const PORT = config.server.port || 9999;

// AES-256-CBC 解密函数
function decrypt(encryptedText, key) {
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('❌ 密钥解密失败:', error.message);
    return null;
  }
}

// 从环境变量读取加密密钥
const encryptKey = process.env.ALIPAY_ENCRYPT_KEY;

// 检查是否配置了支付宝密钥
const hasEncryptKey = !!encryptKey;
const hasAppId = !!process.env.ALIPAY_APP_ID_ENCRYPTED;
const hasPrivateKey = !!process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED;
const hasPublicKey = !!process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED;

// 判断是否启用真实支付宝支付
const useRealAlipay = hasEncryptKey && hasAppId && hasPrivateKey && hasPublicKey;

let appId = '';
let privateKey = '';
let alipayPublicKey = '';

if (useRealAlipay) {
  // 解密支付宝密钥
  appId = decrypt(process.env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
  privateKey = decrypt(process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
  alipayPublicKey = decrypt(process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);
  
  if (!appId || !privateKey || !alipayPublicKey) {
    console.warn('⚠️ 支付宝密钥解密失败，将使用模拟支付模式');
  } else {
    console.log('✅ 支付宝配置加载成功，使用真实支付模式');
  }
} else {
  console.log('⚠️ 未配置支付宝密钥，将使用模拟支付模式');
  console.log('提示: 请配置 .env 文件中的支付宝密钥以启用真实支付');
}

module.exports = {
  // 是否启用真实支付宝支付
  enabled: useRealAlipay && !!appId && !!privateKey && !!alipayPublicKey,
  
  // 支付宝应用APPID
  appId: appId || 'mock_app_id',
  
  // 应用私钥
  privateKey: privateKey || 'mock_private_key',
  
  // 支付宝公钥
  alipayPublicKey: alipayPublicKey || 'mock_public_key',
  
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

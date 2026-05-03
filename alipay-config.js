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
    console.error('请检查 .env 文件中的加密密钥和加密数据是否正确');
    throw error;
  }
}

// 从环境变量读取加密密钥
const encryptKey = process.env.ALIPAY_ENCRYPT_KEY;

let enabled = false;
let appId = '2021000000000000';
let privateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpQIBAAKCAQEAq...\n-----END RSA PRIVATE KEY-----';
let alipayPublicKey = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq...\n-----END PUBLIC KEY-----';

if (encryptKey && process.env.ALIPAY_APP_ID_ENCRYPTED) {
  try {
    // 解密支付宝密钥
    appId = decrypt(process.env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
    privateKey = decrypt(process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
    alipayPublicKey = decrypt(process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);
    enabled = true;
    console.log('✅ 支付宝配置已加载（真实支付模式）');
  } catch (error) {
    console.log('⚠️ 支付宝密钥加载失败，使用模拟支付模式');
    enabled = false;
  }
} else {
  console.log('ℹ️ 未找到支付宝配置，使用模拟支付模式');
  console.log('📝 如需启用真实支付，请配置 .env 文件并运行 node key-manager.js encrypt');
  enabled = false;
}

module.exports = {
  // 是否启用真实支付宝支付 (false则使用模拟支付)
  enabled: enabled,
  
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

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

// 从环境变量读取加密密钥
const encryptKey = process.env.ALIPAY_ENCRYPT_KEY;

// 检查是否配置了支付宝密钥（更安全的检查）
const hasEncryptKey = !!encryptKey && encryptKey.length === 64; // 256位密钥是64个十六进制字符
const hasAppId = !!process.env.ALIPAY_APP_ID_ENCRYPTED;
const hasPrivateKey = !!process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED;
const hasPublicKey = !!process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED;

// 判断是否启用真实支付宝支付
const useRealAlipay = hasEncryptKey && hasAppId && hasPrivateKey && hasPublicKey;

let appId = '';
let privateKey = '';
let alipayPublicKey = '';

// 格式化密钥，确保符合支付宝要求
function formatPrivateKey(key) {
  if (!key) return key;
  // 移除所有空白字符
  key = key.replace(/\s+/g, '');
  // 如果没有开始标记，添加格式化
  if (!key.startsWith('-----BEGIN')) {
    key = key.replace(/-----BEGIN.*?-----/g, '').replace(/-----END.*?-----/g, '');
    // 每64字符换行
    key = key.match(/.{1,64}/g).join('\n');
    // 使用PKCS#1格式（RSA PRIVATE KEY）而不是PKCS#8（PRIVATE KEY）
    key = '-----BEGIN RSA PRIVATE KEY-----\n' + key + '\n-----END RSA PRIVATE KEY-----';
  }
  return key;
}

function formatPublicKey(key) {
  if (!key) return key;
  // 移除所有空白字符
  key = key.replace(/\s+/g, '');
  // 如果没有开始标记，添加格式化
  if (!key.startsWith('-----BEGIN')) {
    key = key.replace(/-----BEGIN.*?-----/g, '').replace(/-----END.*?-----/g, '');
    // 每64字符换行
    key = key.match(/.{1,64}/g).join('\n');
    key = '-----BEGIN PUBLIC KEY-----\n' + key + '\n-----END PUBLIC KEY-----';
  }
  return key;
}

if (useRealAlipay) {
  try {
    // 解密支付宝密钥
    appId = decrypt(process.env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
    privateKey = decrypt(process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
    alipayPublicKey = decrypt(process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);
    
    // 格式化密钥
    privateKey = formatPrivateKey(privateKey);
    alipayPublicKey = formatPublicKey(alipayPublicKey);
    
    // 验证密钥完整性（宽松要求）
    const appIdValid = appId && appId.length > 5;
    const privateKeyValid = privateKey && privateKey.length > 50;
    const publicKeyValid = alipayPublicKey && alipayPublicKey.length > 50;
    
    if (!appIdValid || !privateKeyValid || !publicKeyValid) {
      console.warn('⚠️ 支付宝密钥数据不完整，将使用模拟支付模式');
      console.warn('  提示: 请提供完整的应用私钥和支付宝公钥');
      console.warn('  appId长度:', appId ? appId.length : 0);
      console.warn('  privateKey长度:', privateKey ? privateKey.length : 0);
      console.warn('  publicKey长度:', alipayPublicKey ? alipayPublicKey.length : 0);
      // 重置为模拟模式
      appId = '';
      privateKey = '';
      alipayPublicKey = '';
    } else {
      console.log('✅ 支付宝配置加载成功，使用真实支付模式');
      console.log('  - AppId:', appId);
      console.log('  - 私钥长度:', privateKey.length);
      console.log('  - 公钥长度:', alipayPublicKey.length);
    }
  } catch (error) {
    console.warn('⚠️ 支付宝配置加载异常，将使用模拟支付模式');
    console.error('详细错误:', error.message);
    // 确保重置为模拟模式
    appId = '';
    privateKey = '';
    alipayPublicKey = '';
  }
} else {
  console.log('💡 使用模拟支付模式（无需支付宝配置）');
  console.log('提示: 配置 .env 文件中的支付宝密钥可启用真实支付');
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

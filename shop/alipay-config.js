const crypto = require('crypto');
const config = require('./config');
const PORT = config.server.port || 9999;

function decrypt(encryptedText, key) {
  try {
    if (!encryptedText || !key) return null;
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
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

const encryptKey = process.env.ALIPAY_ENCRYPT_KEY;
const hasEncryptKey = !!encryptKey && encryptKey.length === 64;
const hasAppId = !!process.env.ALIPAY_APP_ID_ENCRYPTED;
const hasPrivateKey = !!process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED;
const hasPublicKey = !!process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED;
const useRealAlipay = hasEncryptKey && hasAppId && hasPrivateKey && hasPublicKey;

let appId = '';
let privateKey = '';
let alipayPublicKey = '';

if (useRealAlipay) {
  try {
    appId = decrypt(process.env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
    privateKey = decrypt(process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
    alipayPublicKey = decrypt(process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);
    const appIdValid = appId && appId.length > 5;
    const privateKeyValid = privateKey && privateKey.length > 100;
    const publicKeyValid = alipayPublicKey && alipayPublicKey.length > 100;
    if (!appIdValid || !privateKeyValid || !publicKeyValid) {
      console.warn('⚠️ 支付宝密钥数据不完整，将使用模拟支付模式');
      appId = '';
      privateKey = '';
      alipayPublicKey = '';
    } else {
      console.log('✅ 支付宝配置加载成功，使用真实支付模式');
    }
  } catch (error) {
    console.warn('⚠️ 支付宝配置加载异常，将使用模拟支付模式');
    appId = '';
    privateKey = '';
    alipayPublicKey = '';
  }
} else {
  console.log('💡 使用模拟支付模式（无需支付宝配置）');
}

module.exports = {
  enabled: useRealAlipay && !!appId && !!privateKey && !!alipayPublicKey,
  appId: appId || 'mock_app_id',
  privateKey: privateKey || 'mock_private_key',
  alipayPublicKey: alipayPublicKey || 'mock_public_key',
  gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipaydev.com/gateway.do',
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || `http://localhost:${PORT}/api/alipay/notify`,
  returnUrl: process.env.ALIPAY_RETURN_URL || `http://localhost:${PORT}/payment-success`,
  signType: 'RSA2',
  charset: 'UTF-8',
  keyType: 'PKCS8'
};

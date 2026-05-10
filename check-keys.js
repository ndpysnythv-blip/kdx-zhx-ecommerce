// 检查解密后的密钥格式
console.log('🔍 检查支付宝密钥格式...\n');

require('dotenv').config();
const crypto = require('crypto');

// 解密函数（和 alipay-config.js 中的一样）
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
    console.error('❌ 解密失败:', error.message);
    return null;
  }
}

const encryptKey = process.env.ALIPAY_ENCRYPT_KEY;
const appId = decrypt(process.env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
const privateKey = decrypt(process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
const alipayPublicKey = decrypt(process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);

console.log('📋 AppId:', appId);
console.log('\n🔑 应用私钥长度:', privateKey ? privateKey.length : 0);
console.log('私钥开头:', privateKey ? privateKey.substring(0, 50) + '...' : 'null');
console.log('私钥结尾:', privateKey ? '...' + privateKey.substring(privateKey.length - 50) : 'null');
console.log('私钥包含 \\n:', privateKey ? privateKey.includes('\n') : 'N/A');

console.log('\n🔑 支付宝公钥长度:', alipayPublicKey ? alipayPublicKey.length : 0);
console.log('公钥开头:', alipayPublicKey ? alipayPublicKey.substring(0, 50) + '...' : 'null');
console.log('公钥结尾:', alipayPublicKey ? '...' + alipayPublicKey.substring(alipayPublicKey.length - 50) : 'null');

// 尝试格式化私钥
console.log('\n🔧 尝试格式化密钥...');
let formattedPrivateKey = privateKey;
if (formattedPrivateKey) {
  // 确保私钥有正确的格式
  if (!formattedPrivateKey.startsWith('-----BEGIN')) {
    formattedPrivateKey = '-----BEGIN PRIVATE KEY-----\n' + 
                          formattedPrivateKey.match(/.{1,64}/g).join('\n') + 
                          '\n-----END PRIVATE KEY-----';
    console.log('✅ 格式化私钥完成');
  }
}

let formattedPublicKey = alipayPublicKey;
if (formattedPublicKey) {
  if (!formattedPublicKey.startsWith('-----BEGIN')) {
    formattedPublicKey = '-----BEGIN PUBLIC KEY-----\n' + 
                         formattedPublicKey.match(/.{1,64}/g).join('\n') + 
                         '\n-----END PUBLIC KEY-----';
    console.log('✅ 格式化公钥完成');
  }
}

console.log('\n🔍 格式化后的密钥:');
console.log('私钥:', formattedPrivateKey);
console.log('\n公钥:', formattedPublicKey);

console.log('\n✅ 检查完成！');

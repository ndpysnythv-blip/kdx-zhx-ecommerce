// 修复密钥格式
const crypto = require('crypto');

// 读取当前 .env
const fs = require('fs');
const envContent = fs.readFileSync('./.env', 'utf8');

// 解密函数
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
    console.error('解密失败:', error.message);
    return null;
  }
}

const encryptKey = envContent.match(/ALIPAY_ENCRYPT_KEY=(.+)/)?.[1];
const privateKey = decrypt(envContent.match(/ALIPAY_PRIVATE_KEY_ENCRYPTED=(.+)/)?.[1], encryptKey);

console.log('原始私钥长度:', privateKey?.length);
console.log('原始私钥前100字符:', privateKey?.substring(0, 100));
console.log('原始私钥后100字符:', privateKey?.substring(privateKey.length - 100));

// 尝试不同的密钥格式
const formats = [
  { name: 'PKCS#1 RSA', header: '-----BEGIN RSA PRIVATE KEY-----', footer: '-----END RSA PRIVATE KEY-----' },
  { name: 'PKCS#8', header: '-----BEGIN PRIVATE KEY-----', footer: '-----END PRIVATE KEY-----' },
  { name: 'PKCS#8 Encrypted', header: '-----BEGIN ENCRYPTED PRIVATE KEY-----', footer: '-----END ENCRYPTED PRIVATE KEY-----' }
];

// 测试原始密钥是否能被Node.js解析
console.log('\n🔍 测试密钥解析...');

try {
  // 尝试直接解析（不带标记）
  const keyBuffer = Buffer.from(privateKey, 'base64');
  console.log('Base64解码后长度:', keyBuffer.length);
  
  // 尝试创建签名来测试密钥
  const sign = crypto.createSign('RSA-SHA256');
  sign.update('test');
  const signature = sign.sign(privateKey, 'base64');
  console.log('✅ 密钥可以直接使用！');
} catch (error) {
  console.log('❌ 密钥不能直接解析:', error.message);
  
  // 尝试添加PKCS#1格式
  try {
    const formattedKey = `-----BEGIN RSA PRIVATE KEY-----\n${privateKey.match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update('test');
    const signature = sign.sign(formattedKey, 'base64');
    console.log('✅ PKCS#1格式可以工作！');
  } catch (error2) {
    console.log('❌ PKCS#1格式也不行:', error2.message);
    
    // 尝试添加PKCS#8格式
    try {
      const formattedKey = `-----BEGIN PRIVATE KEY-----\n${privateKey.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
      const sign = crypto.createSign('RSA-SHA256');
      sign.update('test');
      const signature = sign.sign(formattedKey, 'base64');
      console.log('✅ PKCS#8格式可以工作！');
    } catch (error3) {
      console.log('❌ PKCS#8格式也不行:', error3.message);
    }
  }
}

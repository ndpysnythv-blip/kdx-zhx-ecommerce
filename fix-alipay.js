// 修复支付宝密钥配置
const crypto = require('crypto');
const fs = require('fs');

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

// 加密函数
function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// 读取当前 .env
const envPath = './.env';
const envContent = fs.readFileSync(envPath, 'utf8');

// 提取加密密钥
const encryptKeyMatch = envContent.match(/ALIPAY_ENCRYPT_KEY=(.+)/);
const encryptKey = encryptKeyMatch ? encryptKeyMatch[1] : null;

console.log('加密密钥:', encryptKey);

// 尝试解密当前值
const appIdEncrypted = envContent.match(/ALIPAY_APP_ID_ENCRYPTED=(.+)/)?.[1];
const privateKeyEncrypted = envContent.match(/ALIPAY_PRIVATE_KEY_ENCRYPTED=(.+)/)?.[1];
const publicKeyEncrypted = envContent.match(/ALIPAY_PUBLIC_KEY_ENCRYPTED=(.+)/)?.[1];

console.log('\n当前加密值:');
console.log('AppID加密长度:', appIdEncrypted?.length);
console.log('私钥加密长度:', privateKeyEncrypted?.length);
console.log('公钥加密长度:', publicKeyEncrypted?.length);

const appId = decrypt(appIdEncrypted, encryptKey);
const privateKey = decrypt(privateKeyEncrypted, encryptKey);
const publicKey = decrypt(publicKeyEncrypted, encryptKey);

console.log('\n解密结果:');
console.log('AppID:', appId, '长度:', appId?.length);
console.log('私钥:', privateKey, '长度:', privateKey?.length);
console.log('公钥:', publicKey, '长度:', publicKey?.length);

// 您之前提供的公钥
const yourPublicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkzKRf9OusDwgcyy99B0wRNmFNUrGSDREvSzcbXXfT9PiAjyNS8b7K73K32wyWvNP7LsN0zU/kFekyaf02YQCAJaRowiLWNp5Zh4IqesRageVmwLBjvOkQC2YRju0xXKcuqSCSFApksfANLlirDfEeTsAKWHmUeQD0L6cm/hpUywiINxwbn07dj2tDuTrh34Lp69m8ERWOt8qehkkd1ZvTrGGH3O7vuK8aNp1OpUgSR7FnOEYDE/zsIHUoX+z7qgWOUfZMjQAe/ix4d6EQuRaICFjrqVIvyw0wzzjKAGHH+EhsuYGCUSQtxVBsvg/6r/gbi1e8NLRdMOoq8DXScyD7QIDAQAB';

console.log('\n您之前提供的公钥长度:', yourPublicKey.length);

// 如果解密后的密钥太短，使用您提供的公钥重新加密
if (!publicKey || publicKey.length < yourPublicKey.length) {
  console.log('\n⚠️ 当前公钥太短，使用您提供的公钥重新加密...');
  
  const newPublicKeyEncrypted = encrypt(yourPublicKey, encryptKey);
  console.log('新公钥加密值:', newPublicKeyEncrypted);
  console.log('新公钥加密长度:', newPublicKeyEncrypted.length);
  
  // 更新 .env 文件
  let newEnvContent = envContent;
  newEnvContent = newEnvContent.replace(
    /ALIPAY_PUBLIC_KEY_ENCRYPTED=.+/,
    `ALIPAY_PUBLIC_KEY_ENCRYPTED=${newPublicKeyEncrypted}`
  );
  
  fs.writeFileSync(envPath, newEnvContent);
  console.log('✅ .env 文件已更新');
  
  // 验证
  const updatedContent = fs.readFileSync(envPath, 'utf8');
  const updatedPublicKey = decrypt(
    updatedContent.match(/ALIPAY_PUBLIC_KEY_ENCRYPTED=(.+)/)?.[1],
    encryptKey
  );
  console.log('验证解密后公钥长度:', updatedPublicKey?.length);
}

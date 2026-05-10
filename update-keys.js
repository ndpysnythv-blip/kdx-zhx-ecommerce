// 更新支付宝密钥配置
const crypto = require('crypto');
const fs = require('fs');

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

console.log('🔑 使用加密密钥:', encryptKey.substring(0, 16) + '...');

// 您提供的密钥
const appId = '2021006146695686';
const privateKey = `MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCPvhwZmcFJkMVVVYgoxNxceOT22YAKD4oZJp/5KSBcTnQWdG+hFaV83QFqAFG4uX8AybbL3HTgU8YUbkijYdsqYfdNTLA7uSe0SO0yXyX6c5NRdVjhvoHauquoJ//lRNuJ2tlyagUXkKF1i8pMqTuJe4+B7WY9TQ7i7KDnDra0W6XyXACtwSpxTt7NfweX+xp8OP3MMUvfThRjSeJoNa4Ky9lD0IH8lA/BEYKxm0GjWWnIQKm8OPHp8OnDQL2BnZlMW4maekvGLhwgd9WvDucGMtBVm4VUEXXCHkbvgl6HZmBopDah8ht2V7WbYHMKGWSMAQzsHKf680sKpzJErrKBAgMBAAECggEAB1LNRbSit2fL1gQskr8s5v011SnRrzGJfKyOG/ivcGSC354BDfj3XHw6FTd88mdpBBZC3PIXdlJuVh4kT0auDuO84NBWbkSJtFK+2wEkAzWePNk4tQ+quAUot8GJ9RlkAgsHZx/lsISq5T1BClTY9rE354u72MWzS3Z44CzMvDWWztIm0+67lOwYWRr+e6VHPjteUTQ0cJtD8pda39903siZQoISXd6OIHkEQVAJDJtbNDv+WwGgcoVcH0xmlm8DIbGeV6TaXRzrD4ty69TBM2Cmmh9Oe83fQ7kSJvqncTXeVt6G1q78YU0itpnCZnOiurt0RYyFiNuuwF5GrQ+GkQKBgQD/KB9EybnUpYgho6jrmdrtPpeKXxbCQh8rS+fM0HC+dLVmo0rfuliWMa4/yAn8ojCiF6qPTN25Pg0N3Y4h6eMjZ2WFFv66mXfaqzDdChSLSfaghe20/71IbW3OM2balXbb+qJGYyT0QW1/F1uWKFVxc/SrSrZgU4zfCAF47cDs9QKBgQCQN7mAnl6fWUGyQs3v72xlGAQBhyGeVEsBe7h0ka/fFXoJz7mgHdH6SUz4q7/bYZQhztsPjEMcwJsM1rT+R3xkNMsUcNZERxCPKmiX8UoEA9sf4aBtQ4LJdhdy09AxiRq3gwZ7/3xWpKjjp/DaGwjwOpzAArWMx+QwqgPe9WO33QKBgQDnwgK80Vn4Wy5OF8BL12CyEyNELOCYK8Tx560xLLbrV0iZZIKSukjSi2eRSVpA3PS9li92n8PZCRKEYJREG5QTSUw92cgfp1vlA4+Lhido6RKZdWyW9Z9w1Oxi2e93ZUEjyABzXIRpU7BoOsgWmKYbOc6nc2I6FkmjHztvIs0UrQKBgB2WsUKIO5Wp9GakeigOEUk0gi3mEamwVas6PP/9m/3DJES7D7SgKaKWQ2qJolVaUdAV5q/r8SEHC0i5DG1XMVhF1JyfAfcENYuKAeeao7rrJ5wE6KtCPKUky27NsltXa9nW0g/CvTnxko0SucGl5lGTVPG4HJODt3eciirGYe0pAoGBAJE3LPcQU6ivWoNE6k3Ec0eWKgQu0Ipv3sdAEX/1M6DpErmsk8RP16PffWsk5TR/MTxWqt5W4U2z6gXFfZcKHSv81NTuom8dio0+8PgxDIhdUSAq3oNV1lspB5k3W45RAztCFUG0BJ0HukYVj6L7edUzd70sLIxZiLUitxr3gsUl`;

const alipayPublicKey = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkzKRf9OusDwgcyy99B0wRNmFNUrGSDREvSzcbXXfT9PiAjyNS8b7K73K32wyWvNP7LsN0zU/kFekyaf02YQCAJaRowiLWNp5Zh4IqesRageVmwLBjvOkQC2YRju0xXKcuqSCSFApksfANLlirDfEeTsAKWHmUeQD0L6cm/hpUywiINxwbn07dj2tDuTrh34Lp69m8ERWOt8qehkkd1ZvTrGGH3O7vuK8aNp1OpUgSR7FnOEYDE/zsIHUoX+z7qgWOUfZMjQAe/ix4d6EQuRaICFjrqVIvyw0wzzjKAGHH+EhsuYGCUSQtxVBsvg/6r/gbi1e8NLRdMOoq8DXScyD7QIDAQAB`;

console.log('\n📋 原始密钥长度:');
console.log('AppID:', appId.length);
console.log('私钥:', privateKey.length);
console.log('公钥:', alipayPublicKey.length);

// 加密密钥
const appIdEncrypted = encrypt(appId, encryptKey);
const privateKeyEncrypted = encrypt(privateKey, encryptKey);
const publicKeyEncrypted = encrypt(alipayPublicKey, encryptKey);

console.log('\n🔐 加密后的长度:');
console.log('AppID:', appIdEncrypted.length);
console.log('私钥:', privateKeyEncrypted.length);
console.log('公钥:', publicKeyEncrypted.length);

// 更新 .env 文件
let newEnvContent = envContent;
newEnvContent = newEnvContent.replace(/ALIPAY_APP_ID_ENCRYPTED=.*/, `ALIPAY_APP_ID_ENCRYPTED=${appIdEncrypted}`);
newEnvContent = newEnvContent.replace(/ALIPAY_PRIVATE_KEY_ENCRYPTED=.*/, `ALIPAY_PRIVATE_KEY_ENCRYPTED=${privateKeyEncrypted}`);
newEnvContent = newEnvContent.replace(/ALIPAY_PUBLIC_KEY_ENCRYPTED=.*/, `ALIPAY_PUBLIC_KEY_ENCRYPTED=${publicKeyEncrypted}`);

fs.writeFileSync(envPath, newEnvContent);
console.log('\n✅ .env 文件已更新');

// 验证
const updatedContent = fs.readFileSync(envPath, 'utf8');

// 解密验证
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

const verifyAppId = decrypt(updatedContent.match(/ALIPAY_APP_ID_ENCRYPTED=(.+)/)?.[1], encryptKey);
const verifyPrivateKey = decrypt(updatedContent.match(/ALIPAY_PRIVATE_KEY_ENCRYPTED=(.+)/)?.[1], encryptKey);
const verifyPublicKey = decrypt(updatedContent.match(/ALIPAY_PUBLIC_KEY_ENCRYPTED=(.+)/)?.[1], encryptKey);

console.log('\n🔍 验证解密结果:');
console.log('AppID:', verifyAppId, '长度:', verifyAppId?.length);
console.log('私钥长度:', verifyPrivateKey?.length);
console.log('公钥长度:', verifyPublicKey?.length);

if (verifyAppId === appId && verifyPrivateKey === privateKey && verifyPublicKey === alipayPublicKey) {
  console.log('\n🎉 验证成功！密钥配置正确');
} else {
  console.log('\n❌ 验证失败！');
}

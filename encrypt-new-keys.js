// 临时脚本：加密新的支付宝密钥
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔐 加密支付宝密钥\n');
console.log('='.repeat(70));

const encryptKey = '6f4030c714e9226c9cda4b84584610880e3b114d209a08a0df8cbbbeb7ef01ec';
const appId = '2021006146695686';

// 用户提供的密钥
const appPublicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAj74cGZnBSZDFVVWIKMTcXHjk9tmACg+KGSaf+SkgXE50FnRvoRWlfN0BagBRuLl/AMm2y9x04FPGFG5Io2HbKmH3TUywO7kntEjtMl8l+nOTUXVY4b6B2rqrqCf/5UTbidrZcmoFF5ChdYvKTKk7iXuPge1mPU0O4uyg5w62tFul8lwArcEqcU7ezX8Hl/safDj9zDFL304UY0niaDWuCsvZQ9CB/JQPwRGCsZtBo1lpyECpvDjx6fDpw0C9gZ2ZTFuJmnpLxi4cIHfVrw7nBjLQVZuFVBF1wh5G74Jeh2ZgaKQ2ofIbdle1m2BzChlkjAEM7Byn+vNLCqcyRK6ygQIDAQAB';
const appPrivateKey = 'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCPvhwZmcFJkMVVVYgoxNxceOT22YAKD4oZJp/5KSBcTnQWdG+hFaV83QFqAFG4uX8AybbL3HTgU8YUbkijYdsqYfdNTLA7uSe0SO0yXyX6c5NRdVjhvoHauquoJ//lRNuJ2tlyagUXkKF1i8pMqTuJe4+B7WY9TQ7i7KDnDra0W6XyXACtwSpxTt7NfweX+xp8OP3MMUvfThRjSeJoNa4Ky9lD0IH8lA/BEYKxm0GjWWnIQKm8OPHp8OnDQL2BnZlMW4maekvGLhwgd9WvDucGMtBVm4VUEXXCHkbvgl6HZmBopDah8ht2V7WbYHMKGWSMAQzsHKf680sKpzJErrKBAgMBAAECggEAB1LNRbSit2fL1gQskr8s5v011SnRrzGJfKyOG/ivcGSC354BDfj3XHw6FTd88mdpBBZC3PIXdlJuVh4kT0auDuO84NBWbkSJtFK+2wEkAzWePNk4tQ+quAUot8GJ9RlkAgsHZx/lsISq5T1BClTY9rE354u72MWzS3Z44CzMvDWWztIm0+67lOwYWRr+e6VHPjteUTQ0cJtD8pda39903siZQoISXd6OIHkEQVAJDJtbNDv+WwGgcoVcH0xmlm8DIbGeV6TaXRzrD4ty69TBM2Cmmh9Oe83fQ7kSJvqncTXeVt6G1q78YU0itpnCZnOiurt0RYyFiNuuwF5GrQ+GkQKBgQD/KB9EybnUpYgho6jrmdrtPpeKXxbCQh8rS+fM0HC+dLVmo0rfuliWMa4/yAn8ojCiF6qPTN25Pg0N3Y4h6eMjZ2WFFv66mXfaqzDdChSLSfaghe20/71IbW3OM2balXbb+qJGYyT0QW1/F1uWKFVxc/SrSrZgU4zfCAF47cDs9QKBgQCQN7mAnl6fWUGyQs3v72xlGAQBhyGeVEsBe7h0ka/fFXoJz7mgHdH6SUz4q7/bYZQhztsPjEMcwJsM1rT+R3xkNMsUcNZERxCPKmiX8UoEA9sf4aBtQ4LJdhdy09AxiRq3gwZ7/3xWpKjjp/DaGwjwOpzAArWMx+QwqgPe9WO33QKBgQDnwgK80Vn4Wy5OF8BL12CyEyNELOCYK8Tx560xLLbrV0iZZIKSukjSi2eRSVpA3PS9li92n8PZCRKEYJREG5QTSUw92cgfp1vlA4+Lhido6RKZdWyW9Z9w1Oxi2e93ZUEjyABzXIRpU7BoOsgWmKYbOc6nc2I6FkmjHztvIs0UrQKBgB2WsUKIO5Wp9GakeigOEUk0gi3mEamwVas6PP/9m/3DJES7D7SgKaKWQ2qJolVaUdAV5q/r8SEHC0i5DG1XMVhF1JyfAfcENYuKAeeao7rrJ5wE6KtCPKUky27NsltXa9nW0g/CvTnxko0SucGl5lGTVPG4HJODt3eciirGYe0pAoGBAJE3LPcQU6ivWoNE6k3Ec0eWKgQu0Ipv3sdAEX/1M6DpErmsk8RP16PffWsk5TR/MTxWqt5W4U2z6gXFfZcKHSv81NTuom8dio0+8PgxDIhdUSAq3oNV1lspB5k3W45RAztCFUG0BJ0HukYVj6L7edUzd70sLIxZiLUitxr3gsUl';

console.log('\n📋 输入密钥:');
console.log('  AppID:', appId);
console.log('  应用公钥长度:', appPublicKey.length);
console.log('  应用私钥长度:', appPrivateKey.length);
console.log('  ⚠️ 缺少支付宝公钥！');

// AES-256-CBC 加密
function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// AES-256-CBC 解密（用于验证）
function decrypt(encryptedText, key) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

console.log('\n🔑 加密中...');

const encryptedAppId = encrypt(appId, encryptKey);
const encryptedAppPrivateKey = encrypt(appPrivateKey, encryptKey);
const encryptedAppPublicKey = encrypt(appPublicKey, encryptKey);

console.log('\n✅ 加密完成！\n');
console.log('加密后的密钥:');
console.log('  AppID:', encryptedAppId);
console.log('  应用私钥:', encryptedAppPrivateKey);
console.log('  应用公钥:', encryptedAppPublicKey);

console.log('\n📝 验证解密...');
const testDecrypt = decrypt(encryptedAppPrivateKey, encryptKey);
console.log('  解密验证成功:', testDecrypt.substring(0, 50) === appPrivateKey.substring(0, 50));

console.log('\n' + '='.repeat(70));
console.log('\n⚠️ 注意：需要您提供支付宝公钥才能完成完整配置！');
console.log('支付宝公钥是从支付宝开放平台获取的公钥，用于验证支付宝的通知。\n');

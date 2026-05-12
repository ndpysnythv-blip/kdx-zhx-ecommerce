// 重新加密密钥
const crypto = require('crypto');
const fs = require('fs');

function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

const encryptKey = '6f4030c714e9226c9cda4b84584610880e3b114d209a08a0df8cbbbeb7ef01ec';

const appId = '2021006146695686';
const privateKey = `MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCPvhwZmcFJkMVVVYgoxNxceOT22YAKD4oZJp/5KSBcTnQWdG+hFaV83QFqAFG4uX8AybbL3HTgU8YUbkijYdsqYfdNTLA7uSe0SO0yXyX6c5NRdVjhvoHauquoJ//lRNuJ2tlyagUXkKF1i8pMqTuJe4+B7WY9TQ7i7KDnDra0W6XyXACtwSpxTt7NfweX+xp8OP3MMUvfThRjSeJoNa4Ky9lD0IH8lA/BEYKxm0GjWWnIQKm8OPHp8OnDQL2BnZlMW4maekvGLhwgd9WvDucGMtBVm4VUEXXCHkbvgl6HZmBopDah8ht2V7WbYHMKGWSMAQzsHKf680sKpzJErrKBAgMBAAECggEAB1LNRbSit2fL1gQskr8s5v011SnRrzGJfKyOG/ivcGSC354BDfj3XHw6FTd88mdpBBZC3PIXdlJuVh4kT0auDuO84NBWbkSJtFK+2wEkAzWePNk4tQ+quAUot8GJ9RlkAgsHZx/lsISq5T1BClTY9rE354u72MWzS3Z44CzMvDWWztIm0+67lOwYWRr+e6VHPjteUTQ0cJtD8pda39903siZQoISXd6OIHkEQVAJDJtbNDv+WwGgcoVcH0xmlm8DIbGeV6TaXRzrD4ty69TBM2Cmmh9Oe83fQ7kSJvqncTXeVt6G1q78YU0itpnCZnOiurt0RYyFiNuuwF5GrQ+GkQKBgQD/KB9EybnUpYgho6jrmdrtPpeKXxbCQh8rS+fM0HC+dLVmo0rfuliWMa4/yAn8ojCiF6qPTN25Pg0N3Y4h6eMjZ2WFFv66mXfaqzDdChSLSfaghe20/71IbW3OM2balXbb+qJGYyT0QW1/F1uWKFVxc/SrSrZgU4zfCAF47cDs9QKBgQCQN7mAnl6fWUGyQs3v72xlGAQBhyGeVEsBe7h0ka/fFXoJz7mgHdH6SUz4q7/bYZQhztsPjEMcwJsM1rT+R3xkNMsUcNZERxCPKmiX8UoEA9sf4aBtQ4LJdhdy09AxiRq3gwZ7/3xWpKjjp/DaGwjwOpzAArWMx+QwqgPe9WO33QKBgQDnwgK80Vn4Wy5OF8BL12CyEyNELOCYK8Tx560xLLbrV0iZZIKSukjSi2eRSVpA3PS9li92n8PZCRKEYJREG5QTSUw92cgfp1vlA4+Lhido6RKZdWyW9Z9w1Oxi2e93ZUEjyABzXIRpU7BoOsgWmKYbOc6nc2I6FkmjHztvIs0UrQKBgB2WsUKIO5Wp9GakeigOEUk0gi3mEamwVas6PP/9m/3DJES7D7SgKaKWQ2qJolVaUdAV5q/r8SEHC0i5DG1XMVhF1JyfAfcENYuKAeeao7rrJ5wE6KtCPKUky27NsltXa9nW0g/CvTnxko0SucGl5lGTVPG4HJODt3eciirGYe0pAoGBAJE3LPcQU6ivWoNE6k3Ec0eWKgQu0Ipv3sdAEX/1M6DpErmsk8RP16PffWsk5TR/MTxWqt5W4U2z6gXFfZcKHSv81NTuom8dio0+8PgxDIhdUSAq3oNV1lspB5k3W45RAztCFUG0BJ0HukYVj6L7edUzd70sLIxZiLUitxr3gsUl`;
const alipayPublicKey = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkzKRf9OusDwgcyy99B0wRNmFNUrGSDREvSzcbXXfT9PiAjyNS8b7K73K32wyWvNP7LsN0zU/kFekyaf02YQCAJaRowiLWNp5Zh4IqesRageVmwLBjvOkQC2YRju0xXKcuqSCSFApksfANLlirDfEeTsAKWHmUeQD0L6cm/hpUywiINxwbn07dj2tDuTrh34Lp69m8ERWOt8qehkkd1ZvTrGGH3O7vuK8aNp1OpUgSR7FnOEYDE/zsIHUoX+z7qgWOUfZMjQAe/ix4d6EQuRaICFjrqVIvyw0wzzjKAGHH+EhsuYGCUSQtxVBsvg/6r/gbi1e8NLRdMOoq8DXScyD7QIDAQAB`;

console.log('原始密钥长度:', privateKey.length, alipayPublicKey.length);

const appIdEncrypted = encrypt(appId, encryptKey);
const privateKeyEncrypted = encrypt(privateKey, encryptKey);
const publicKeyEncrypted = encrypt(alipayPublicKey, encryptKey);

console.log('加密后长度:', appIdEncrypted.length, privateKeyEncrypted.length, publicKeyEncrypted.length);

const envContent = `ALIPAY_ENCRYPT_KEY=${encryptKey}
ALIPAY_APP_ID_ENCRYPTED=${appIdEncrypted}
ALIPAY_PRIVATE_KEY_ENCRYPTED=${privateKeyEncrypted}
ALIPAY_PUBLIC_KEY_ENCRYPTED=${publicKeyEncrypted}
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
ALIPAY_NOTIFY_URL=https://kdx-zhx.vercel.app/api/alipay/notify
ALIPAY_RETURN_URL=https://kdx-zhx.vercel.app/payment-success
NODE_ENV=production`;

fs.writeFileSync('./.env', envContent);
console.log('✅ 已写入 .env 文件');

// 验证
function decrypt(encryptedText, key) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const verifyPrivate = decrypt(privateKeyEncrypted, encryptKey);
const verifyPublic = decrypt(publicKeyEncrypted, encryptKey);
console.log('验证:', verifyPrivate.length, verifyPublic.length);

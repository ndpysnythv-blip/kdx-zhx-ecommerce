const crypto = require('crypto');
require('dotenv').config();

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

console.log('🔐 开始验证支付宝密钥配置...\n');

if (!encryptKey || encryptKey.length !== 64) {
  console.error('❌ ALIPAY_ENCRYPT_KEY 无效，长度应为64个十六进制字符');
  process.exit(1);
}

console.log('✅ 加密密钥格式正确');

const appId = decrypt(process.env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
const privateKey = decrypt(process.env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
const alipayPublicKey = decrypt(process.env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);

console.log('\n📋 密钥信息:');
console.log('AppID:', appId ? `已配置 (长度: ${appId.length})` : '❌ 未配置');
console.log('应用私钥:', privateKey ? `已配置 (长度: ${privateKey.length})` : '❌ 未配置');
console.log('支付宝公钥:', alipayPublicKey ? `已配置 (长度: ${alipayPublicKey.length})` : '❌ 未配置');

if (privateKey) {
  console.log('\n🔍 私钥格式分析:');
  if (privateKey.includes('BEGIN RSA PRIVATE KEY')) {
    console.log('   ✅ 私钥格式: PKCS#1 (RSA PRIVATE KEY)');
  } else if (privateKey.includes('BEGIN PRIVATE KEY')) {
    console.log('   ⚠️ 私钥格式: PKCS#8 (PRIVATE KEY) - 支付宝SDK需要PKCS#1格式');
  } else if (privateKey.includes('-----BEGIN')) {
    console.log('   ℹ️ 私钥包含PEM头部');
  } else {
    console.log('   ⚠️ 私钥可能是纯Base64格式，需要添加PEM头部');
  }
}

if (alipayPublicKey) {
  console.log('\n🔍 支付宝公钥格式分析:');
  if (alipayPublicKey.includes('BEGIN PUBLIC KEY')) {
    console.log('   ✅ 公钥包含PEM头部');
  } else {
    console.log('   ⚠️ 公钥可能是纯Base64格式，需要添加PEM头部');
  }
}

if (privateKey && alipayPublicKey) {
  console.log('\n🔑 测试密钥配对...');
  
  let formattedPrivateKey = privateKey;
  let formattedPublicKey = alipayPublicKey;
  
  if (!formattedPrivateKey.includes('-----BEGIN')) {
    formattedPrivateKey = `-----BEGIN RSA PRIVATE KEY-----\n${formattedPrivateKey.match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`;
  }
  
  if (!formattedPublicKey.includes('-----BEGIN')) {
    formattedPublicKey = `-----BEGIN PUBLIC KEY-----\n${formattedPublicKey.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  }
  
  try {
    const testData = 'test_signature_data';
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(testData);
    const signature = sign.sign(formattedPrivateKey, 'base64');
    
    console.log(`   签名生成成功 (长度: ${signature.length})`);
    
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(testData);
    const verified = verify.verify(formattedPublicKey, signature, 'base64');
    
    if (verified) {
      console.log('   ✅ 密钥配对验证成功 - 私钥和公钥匹配');
    } else {
      console.log('   ❌ 密钥配对验证失败 - 私钥和公钥不匹配');
      console.log('      请检查：支付宝公钥应该是在开放平台配置应用公钥后获取的公钥，不是应用公钥本身');
    }
  } catch (error) {
    console.log('   ❌ 密钥配对测试失败:', error.message);
  }
}

console.log('\n📝 配置检查总结:');
console.log('- ALIPAY_GATEWAY:', process.env.ALIPAY_GATEWAY || '未配置');
console.log('- ALIPAY_NOTIFY_URL:', process.env.ALIPAY_NOTIFY_URL || '未配置');
console.log('- ALIPAY_RETURN_URL:', process.env.ALIPAY_RETURN_URL || '未配置');

console.log('\n💡 常见印签错误原因:');
console.log('1. 私钥格式不正确（需要PKCS#1格式：BEGIN RSA PRIVATE KEY）');
console.log('2. 私钥和支付宝公钥不匹配');
console.log('3. 支付宝公钥配置错误（应该是支付宝开放平台提供的公钥）');
console.log('4. 应用公钥未在支付宝开放平台正确配置');
console.log('5. 签名算法不匹配（应使用RSA2/SHA256）');

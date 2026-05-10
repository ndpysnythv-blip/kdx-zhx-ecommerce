/**
 * 密钥管理工具 - 用于加密/解密支付宝密钥
 * 
 * 使用方法:
 * node key-manager.js encrypt    # 加密支付宝密钥
 * node key-manager.js decrypt    # 解密支付宝密钥（用于验证）
 * node key-manager.js generate   # 生成新的加密密钥
 * 
 * ⚠️ 此工具仅用于本地管理密钥，不要部署到生产环境
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// AES-256-CBC 加密
function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// AES-256-CBC 解密
function decrypt(encryptedText, key) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 生成随机加密密钥
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

// 从 .env 读取配置
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
  
  return env;
}

// 更新 .env 文件
function updateEnv(updates) {
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }
  
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ .env 文件已更新');
}

// 加密支付宝密钥
async function encryptKeys() {
  console.log('\n🔐 支付宝密钥加密工具\n');
  console.log('请输入支付宝密钥（或直接回车使用默认值）:\n');
  
  const appId = await question('支付宝 AppID: ');
  const privateKey = await question('应用私钥 (去掉首尾标记和换行): ');
  const alipayPublicKey = await question('支付宝公钥 (去掉首尾标记和换行): ');
  const appPublicKey = await question('应用公钥 (去掉首尾标记和换行): ');
  
  const env = loadEnv();
  let encryptKey = env.ALIPAY_ENCRYPT_KEY;
  
  if (!encryptKey) {
    encryptKey = generateKey();
    console.log(`\n🔑 已生成新的加密密钥: ${encryptKey}`);
    console.log('⚠️ 请妥善保存此密钥！丢失将无法解密支付宝密钥！\n');
  } else {
    console.log('\n🔑 使用现有的加密密钥\n');
  }
  
  const updates = {
    ALIPAY_ENCRYPT_KEY: encryptKey,
    ALIPAY_APP_ID_ENCRYPTED: encrypt(appId, encryptKey),
    ALIPAY_PRIVATE_KEY_ENCRYPTED: encrypt(privateKey, encryptKey),
    ALIPAY_PUBLIC_KEY_ENCRYPTED: encrypt(alipayPublicKey, encryptKey),
    ALIPAY_APP_PUBLIC_KEY_ENCRYPTED: encrypt(appPublicKey, encryptKey)
  };
  
  updateEnv(updates);
  
  console.log('\n✅ 支付宝密钥已加密并保存到 .env 文件\n');
  console.log('📝 下一步:');
  console.log('   1. 更新 alipay-config.js 使用加密密钥');
  console.log('   2. 确保 .env 文件已添加到 .gitignore');
  console.log('   3. 删除 alipay-config.js 中的明文密钥\n');
}

// 解密支付宝密钥（用于验证）
async function decryptKeys() {
  console.log('\n🔓 支付宝密钥解密工具\n');
  
  const env = loadEnv();
  const encryptKey = env.ALIPAY_ENCRYPT_KEY;
  
  if (!encryptKey) {
    console.log('❌ 未找到加密密钥，请先运行加密命令');
    return;
  }
  
  console.log('🔑 使用加密密钥解密...\n');
  
  try {
    const appId = decrypt(env.ALIPAY_APP_ID_ENCRYPTED, encryptKey);
    const privateKey = decrypt(env.ALIPAY_PRIVATE_KEY_ENCRYPTED, encryptKey);
    const alipayPublicKey = decrypt(env.ALIPAY_PUBLIC_KEY_ENCRYPTED, encryptKey);
    
    console.log('📋 解密结果:\n');
    console.log(`AppID: ${appId}`);
    console.log(`\n应用私钥 (前50字符): ${privateKey.substring(0, 50)}...`);
    console.log(`\n支付宝公钥 (前50字符): ${alipayPublicKey.substring(0, 50)}...`);
    console.log('\n✅ 解密成功！\n');
  } catch (error) {
    console.log('❌ 解密失败，请检查加密密钥是否正确');
    console.log('错误详情:', error.message);
  }
}

// 生成新的加密密钥
function generateNewKey() {
  const newKey = generateKey();
  console.log('\n🔑 新生成的加密密钥:\n');
  console.log(newKey);
  console.log('\n⚠️ 请妥善保存此密钥！丢失将无法解密支付宝密钥！\n');
}

// 主程序
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'encrypt':
      await encryptKeys();
      break;
    case 'decrypt':
      await decryptKeys();
      break;
    case 'generate':
      generateNewKey();
      break;
    default:
      console.log('\n🔐 密钥管理工具\n');
      console.log('用法:');
      console.log('  node key-manager.js encrypt    # 加密支付宝密钥');
      console.log('  node key-manager.js decrypt    # 解密支付宝密钥（用于验证）');
      console.log('  node key-manager.js generate   # 生成新的加密密钥\n');
  }
  
  rl.close();
}

main().catch(console.error);

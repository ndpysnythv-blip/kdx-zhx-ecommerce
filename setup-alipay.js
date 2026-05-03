/**
 * 支付宝快速配置工具 - 非交互式版本
 * 
 * 使用方法:
 * node setup-alipay.js --appId=xxx --privateKey=xxx --alipayPublicKey=xxx
 * 
 * 或者创建 .env 文件后运行:
 * node setup-alipay.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// AES-256-CBC 加密
function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// 生成随机加密密钥
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

// 从 .env 读取配置
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  
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
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }
  
  fs.writeFileSync(envPath, envContent.trim(), 'utf8');
  console.log('✅ .env 文件已更新');
}

// 解析命令行参数
function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (key && value !== undefined) {
        args[key] = value;
      }
    }
  }
  return args;
}

// 清理密钥格式（去掉首尾标记和换行）
function cleanKey(key) {
  if (!key) return '';
  return key
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// 主程序
function main() {
  console.log('\n🔐 支付宝快速配置工具\n');
  
  const args = parseArgs();
  const existingEnv = loadEnv();
  
  // 获取密钥，优先使用命令行参数，其次使用 .env 中的明文
  let appId = args.appId || existingEnv.ALIPAY_APP_ID || '';
  let privateKey = cleanKey(args.privateKey || existingEnv.ALIPAY_PRIVATE_KEY || '');
  let alipayPublicKey = cleanKey(args.alipayPublicKey || existingEnv.ALIPAY_PUBLIC_KEY || '');
  let appPublicKey = cleanKey(args.appPublicKey || existingEnv.ALIPAY_APP_PUBLIC_KEY || '');
  
  // 检查是否有密钥
  if (!appId || !privateKey || !alipayPublicKey) {
    console.log('❌ 缺少必要的支付宝密钥\n');
    console.log('📝 请按以下方式之一提供密钥：\n');
    console.log('方式 1: 通过命令行参数');
    console.log('  node setup-alipay.js --appId=你的APPID --privateKey=应用私钥 --alipayPublicKey=支付宝公钥\n');
    console.log('方式 2: 在 .env 文件中添加以下内容（明文），然后运行此脚本：');
    console.log('  ALIPAY_APP_ID=你的APPID');
    console.log('  ALIPAY_PRIVATE_KEY=应用私钥');
    console.log('  ALIPAY_PUBLIC_KEY=支付宝公钥');
    console.log('  ALIPAY_APP_PUBLIC_KEY=应用公钥（可选）\n');
    console.log('⚠️ 注意：密钥需要去掉首尾的 -----BEGIN...----- 和 -----END...----- 标记，以及换行符');
    process.exit(1);
  }
  
  console.log('✅ 检测到支付宝密钥，正在加密...\n');
  
  // 获取或生成加密密钥
  let encryptKey = existingEnv.ALIPAY_ENCRYPT_KEY;
  if (!encryptKey) {
    encryptKey = generateKey();
    console.log(`🔑 已生成新的加密密钥`);
    console.log(`⚠️ 请妥善保存此密钥！丢失将无法解密支付宝密钥！\n`);
  } else {
    console.log(`🔑 使用现有的加密密钥\n`);
  }
  
  // 加密密钥
  const updates = {
    ALIPAY_ENCRYPT_KEY: encryptKey,
    ALIPAY_APP_ID_ENCRYPTED: encrypt(appId, encryptKey),
    ALIPAY_PRIVATE_KEY_ENCRYPTED: encrypt(privateKey, encryptKey),
    ALIPAY_PUBLIC_KEY_ENCRYPTED: encrypt(alipayPublicKey, encryptKey)
  };
  
  if (appPublicKey) {
    updates.ALIPAY_APP_PUBLIC_KEY_ENCRYPTED = encrypt(appPublicKey, encryptKey);
  }
  
  // 更新 .env
  updateEnv(updates);
  
  console.log('\n✅ 支付宝密钥配置完成！\n');
  console.log('📋 配置信息:');
  console.log(`   - AppID: ${appId}`);
  console.log(`   - 应用私钥: ${privateKey.substring(0, 20)}...`);
  console.log(`   - 支付宝公钥: ${alipayPublicKey.substring(0, 20)}...`);
  console.log('\n🚀 下一步:');
  console.log('   1. 确保支付宝开放平台已配置正确的回调地址');
  console.log('   2. 启动服务，系统将自动使用真实支付宝API');
  console.log('   3. 可以运行 node key-manager.js decrypt 验证解密\n');
}

main().catch(console.error);

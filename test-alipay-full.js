// 完整的支付宝支付测试
console.log('🚀 完整测试支付宝支付创建流程...\n');

// 加载环境变量
require('dotenv').config();

// 加载必要的模块
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
const alipayConfig = require('./alipay-config');

console.log('📋 支付宝配置:');
console.log('  enabled:', alipayConfig.enabled);
console.log('  appId:', alipayConfig.appId);
console.log('  gateway:', alipayConfig.gateway);
console.log('  returnUrl:', alipayConfig.returnUrl);
console.log('  notifyUrl:', alipayConfig.notifyUrl);
console.log();

if (!alipayConfig.enabled) {
  console.error('❌ 支付宝配置未启用！');
  process.exit(1);
}

// 初始化支付宝 SDK
console.log('🔧 初始化支付宝 SDK...');
let alipaySdk;

try {
  alipaySdk = new AlipaySdk({
    appId: alipayConfig.appId,
    privateKey: alipayConfig.privateKey,
    alipayPublicKey: alipayConfig.alipayPublicKey,
    gateway: alipayConfig.gateway,
    signType: alipayConfig.signType,
    charset: alipayConfig.charset
  });
  console.log('✅ SDK 初始化成功\n');
} catch (error) {
  console.error('❌ SDK 初始化失败:', error);
  process.exit(1);
}

// 测试创建支付订单
async function testPayment() {
  console.log('📝 测试创建支付宝订单...');

  const testOrderId = 'TEST_' + Date.now();
  const testOutTradeNo = 'KZ' + Date.now() + Math.floor(Math.random() * 1000);
  const testTotalAmount = '0.01';
  const testSubject = '测试商品';

  console.log('  - 订单ID:', testOrderId);
  console.log('  - 商户订单号:', testOutTradeNo);
  console.log('  - 金额:', testTotalAmount);
  console.log('  - 商品标题:', testSubject);
  console.log();

  try {
    const formData = new AlipayFormData();
    formData.setMethod('get');
    
    // bizContent是必须的核心参数
    formData.addField('bizContent', {
      outTradeNo: testOutTradeNo,
      productCode: 'FAST_INSTANT_TRADE_PAY',
      totalAmount: testTotalAmount,
      subject: testSubject,
      body: testSubject
    });
    
    // returnUrl和notifyUrl通过formData添加
    formData.addField('returnUrl', alipayConfig.returnUrl);
    formData.addField('notifyUrl', alipayConfig.notifyUrl);
    
    console.log('📤 正在调用支付宝API...\n');
    const result = await alipaySdk.pageExec('alipay.trade.page.pay', {}, formData);
    
    console.log('✅ 调用成功！');
    console.log('返回内容长度:', result.length);
    console.log('\n📋 结果预览:');
    console.log(result.substring(0, 500) + (result.length > 500 ? '...' : ''));
    
    console.log('\n🎉 测试完成！');
    console.log('您可以将上面的HTML保存为test.html文件并打开来测试支付跳转');
    
  } catch (error) {
    console.error('\n❌ 创建支付失败！');
    console.error('错误信息:', error.message);
    console.error('\n完整错误对象:');
    console.error(error);
    
    if (error.response) {
      console.error('\n响应数据:');
      console.error(error.response.data || error.response);
    }
  }
}

testPayment();

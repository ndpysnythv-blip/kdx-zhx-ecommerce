// 生成支付宝支付链接
require('dotenv').config();
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
const alipayConfig = require('./alipay-config');

console.log('🚀 生成支付宝支付链接...\n');

if (!alipayConfig.enabled) {
  console.error('❌ 支付宝配置未启用');
  process.exit(1);
}

const alipaySdk = new AlipaySdk({
  appId: alipayConfig.appId,
  privateKey: alipayConfig.privateKey,
  alipayPublicKey: alipayConfig.alipayPublicKey,
  gateway: alipayConfig.gateway,
  signType: alipayConfig.signType,
  charset: alipayConfig.charset
});

const testOutTradeNo = 'KZ' + Date.now() + Math.floor(Math.random() * 1000);

const formData = new AlipayFormData();
formData.setMethod('get');
formData.addField('bizContent', {
  outTradeNo: testOutTradeNo,
  productCode: 'FAST_INSTANT_TRADE_PAY',
  totalAmount: '0.01',
  subject: '测试商品',
  body: '测试商品'
});
formData.addField('returnUrl', alipayConfig.returnUrl);

async function generate() {
  try {
    const result = await alipaySdk.pageExec('alipay.trade.page.pay', {}, formData);
    
    console.log('✅ 支付链接生成成功！\n');
    console.log('📋 订单信息:');
    console.log('  商户订单号:', testOutTradeNo);
    console.log('  金额: ¥0.01');
    console.log('  商品: 测试商品');
    console.log('\n🔗 支付链接:');
    console.log(result);
    
  } catch (error) {
    console.error('❌ 生成失败:', error.message);
  }
}

generate();

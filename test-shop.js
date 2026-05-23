const { chromium } = require('playwright');

async function testShop() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}`);
  });

  console.log('🧪 开始测试商城...\n');

  // 测试1: 商城首页
  console.log('📍 测试1: 商城首页 (shop.html)');
  try {
    await page.goto('http://localhost:9999/shop', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('  ✅ 商城首页加载成功');
    
    // 检查商品是否存在
    const products = await page.locator('.product-card, .product-item, [class*="product"]').count();
    console.log(`  📦 发现 ${products} 个商品`);
  } catch (e) {
    console.log(`  ❌ 商城首页加载失败: ${e.message}`);
  }

  // 测试2: 登录页面
  console.log('\n📍 测试2: 登录页面 (auth.html)');
  try {
    await page.goto('http://localhost:9999/auth', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('  ✅ 登录页面加载成功');
    
    // 检查登录表单
    const emailInput = await page.locator('input[type="email"], input[name="email"], input[name="username"]').count();
    const passwordInput = await page.locator('input[type="password"]').count();
    console.log(`  📝 找到 ${emailInput} 个邮箱输入框, ${passwordInput} 个密码输入框`);
  } catch (e) {
    console.log(`  ❌ 登录页面加载失败: ${e.message}`);
  }

  // 测试3: 尝试登录
  console.log('\n📍 测试3: 登录功能测试');
  try {
    await page.goto('http://localhost:9999/auth', { waitUntil: 'networkidle', timeout: 15000 });
    
    // 查找登录表单
    const emailField = await page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
    const passwordField = await page.locator('input[type="password"]').first();
    const loginButton = await page.locator('button[type="submit"], button:has-text("登录"), button:has-text("Login")').first();
    
    if (await emailField.count() > 0 && await passwordField.count() > 0) {
      await emailField.fill('kdx');
      await passwordField.fill('kdx123456');
      await loginButton.click();
      await page.waitForTimeout(3000);
      
      const currentUrl = page.url();
      console.log(`  🔄 登录后URL: ${currentUrl}`);
      
      if (currentUrl.includes('shop') || currentUrl.includes('user')) {
        console.log('  ✅ 登录成功');
      } else {
        console.log('  ⚠️ 登录后跳转可能有问题');
      }
    } else {
      console.log('  ⚠️ 未找到登录表单');
    }
  } catch (e) {
    console.log(`  ❌ 登录测试失败: ${e.message}`);
  }

  // 测试4: 商品详情页
  console.log('\n📍 测试4: 商品详情页');
  try {
    await page.goto('http://localhost:9999/shop', { waitUntil: 'networkidle', timeout: 15000 });
    
    // 点击第一个商品
    const firstProduct = await page.locator('.product-card, .product-item, [class*="product"]').first();
    if (await firstProduct.count() > 0) {
      await firstProduct.click();
      await page.waitForTimeout(2000);
      console.log(`  ✅ 点击商品后URL: ${page.url()}`);
    } else {
      console.log('  ⚠️ 未找到商品卡片');
    }
  } catch (e) {
    console.log(`  ❌ 商品详情页测试失败: ${e.message}`);
  }

  // 测试5: 购物车页面
  console.log('\n📍 测试5: 购物车页面 (cart.html)');
  try {
    await page.goto('http://localhost:9999/cart', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('  ✅ 购物车页面加载成功');
  } catch (e) {
    console.log(`  ❌ 购物车页面加载失败: ${e.message}`);
  }

  // 测试6: 结账页面
  console.log('\n📍 测试6: 结账页面 (checkout.html)');
  try {
    await page.goto('http://localhost:9999/checkout', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('  ✅ 结账页面加载成功');
  } catch (e) {
    console.log(`  ❌ 结账页面加载失败: ${e.message}`);
  }

  // 测试7: 用户中心
  console.log('\n📍 测试7: 用户中心 (user-center.html)');
  try {
    await page.goto('http://localhost:9999/user-center', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('  ✅ 用户中心加载成功');
  } catch (e) {
    console.log(`  ❌ 用户中心加载失败: ${e.message}`);
  }

  // 错误汇总
  console.log('\n' + '='.repeat(50));
  console.log('📋 测试结果汇总');
  console.log('='.repeat(50));
  
  if (errors.length > 0) {
    console.log(`\n发现 ${errors.length} 个错误:\n`);
    errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err}`);
    });
  } else {
    console.log('\n✅ 未发现JavaScript错误');
  }

  await browser.close();
}

testShop().catch(console.error);

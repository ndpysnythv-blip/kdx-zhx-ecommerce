const Database = require('./database');
const fs = require('fs');
const path = require('path');

console.log('=== 测试数据库功能 ===');

// 测试直接读取数据文件
console.log('\n1. 直接读取 data/products.json:');
try {
  const productsPath = path.join(__dirname, 'data', 'products.json');
  const productsData = fs.readFileSync(productsPath, 'utf8');
  const products = JSON.parse(productsData);
  console.log('✅ 成功读取商品数据:');
  products.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.name} - ¥${p.price}`);
  });
} catch (e) {
  console.error('❌ 读取失败:', e.message);
}

// 测试数据库类
console.log('\n2. 测试 Database 类:');
try {
  const db = new Database();
  const dbProducts = db.getProducts();
  console.log('✅ Database.getProducts() 返回:');
  if (dbProducts.length > 0) {
    dbProducts.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.name} - ¥${p.price}`);
    });
  } else {
    console.log('  ❌ 返回空数组！');
    console.log('  dataDir:', db.dataDir);
    // 检查路径是否存在
    const testPath = path.join(db.dataDir, 'products.json');
    console.log('  尝试读取路径:', testPath);
    console.log('  路径是否存在:', fs.existsSync(testPath));
  }
} catch (e) {
  console.error('❌ Database 测试失败:', e.message);
}

console.log('\n=== 测试完成 ===');

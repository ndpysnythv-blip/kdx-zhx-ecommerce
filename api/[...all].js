const uuid = require('uuid');

module.exports = (req, res) => {
  // 设置响应头
  res.setHeader('Content-Type', 'application/json');
  
  // 获取请求路径
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  
  try {
    if (path === '/api/health' || path === '/health') {
      // 健康检查端点
      res.statusCode = 200;
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uuid: uuid.v4(),
        env: { VERCEL: !!process.env.VERCEL, NODE_ENV: process.env.NODE_ENV }
      }));
    } else if (path === '/api/products' || path === '/products') {
      // 产品端点
      res.statusCode = 200;
      res.end(JSON.stringify([
        {
          id: uuid.v4(),
          name: '定制数据线',
          price: 80,
          category: '数据线'
        },
        {
          id: uuid.v4(),
          name: '小天才6点数据线',
          price: 60,
          category: '数据线'
        }
      ]));
    } else {
      // 404
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'Route not found', path }));
    }
  } catch (error) {
    console.error('API Error:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Server error', message: error.message }));
  }
};

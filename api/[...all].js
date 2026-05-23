module.exports = (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  
  if (pathname === '/api/health' || pathname === '/health') {
    res.status(200).json({ status: 'ok', message: 'Hello from plain Vercel function!' });
    return;
  }
  
  if (pathname === '/api/products' || pathname === '/products') {
    res.status(200).json([
      { id: '1', name: 'Test Product', price: 100 }
    ]);
    return;
  }
  
  res.status(404).json({ message: 'Route not found', path: pathname });
};

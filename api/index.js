const express = require('express');
const serverless = require('serverless-http');

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Hello from minimal api!' });
});

app.get('/api/products', (req, res) => {
  res.json([
    { id: '1', name: 'Test Product', price: 100 }
  ]);
});

app.get('*', (req, res) => {
  res.json({ message: 'Route not found', path: req.path });
});

module.exports = serverless(app);

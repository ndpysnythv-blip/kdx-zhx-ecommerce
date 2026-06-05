const serverless = require('serverless-http');
const app = require('../ecommerce-server');

module.exports = serverless(app);

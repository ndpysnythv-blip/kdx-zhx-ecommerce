const PORT = process.env.PORT || 9999;
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.BASE_URL || (isProduction ? 'https://kdxzhx.top' : `http://localhost:${PORT}`);

module.exports = {
  server: {
    port: PORT,
    host: process.env.HOST || 'localhost'
  },
  alipay: {
    appId: '2021000000000000',
    privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEAq...
-----END RSA PRIVATE KEY-----`,
    publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq...
-----END PUBLIC KEY-----`,
    gatewayUrl: 'https://openapi.alipaydev.com/gateway.do',
    returnUrl: process.env.ALIPAY_RETURN_URL || `${BASE_URL}/payment-success`,
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || `${BASE_URL}/api/alipay/notify`
  },
  database: {
    productsFile: './data/products.json',
    ordersFile: './data/orders.json',
    usersFile: './data/users.json',
    refundsFile: './data/refunds.json'
  }
}
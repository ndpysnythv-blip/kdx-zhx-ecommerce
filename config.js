module.exports = {
  server: {
    port: process.env.PORT || 9999,
    host: 'localhost'
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
    returnUrl: `http://localhost:${process.env.PORT || 9999}/payment-success`,
    notifyUrl: `http://localhost:${process.env.PORT || 9999}/api/alipay/notify`
  },
  database: {
    productsFile: './data/products.json',
    ordersFile: './data/orders.json',
    usersFile: './data/users.json',
    refundsFile: './data/refunds.json'
  }
}
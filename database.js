const fs = require('fs');
const path = require('path');
const config = require('./config');

class Database {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  readJSON(fileName) {
    const filePath = path.join(this.dataDir, fileName);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error(`Error reading ${fileName}:`, error);
      return [];
    }
  }

  writeJSON(fileName, data) {
    const filePath = path.join(this.dataDir, fileName);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`Error writing ${fileName}:`, error);
      return false;
    }
  }

  getProducts() {
    return this.readJSON('products.json');
  }

  saveProducts(products) {
    return this.writeJSON('products.json', products);
  }

  getOrders() {
    return this.readJSON('orders.json');
  }

  saveOrders(orders) {
    return this.writeJSON('orders.json', orders);
  }

  getUsers() {
    return this.readJSON('users.json');
  }

  saveUsers(users) {
    return this.writeJSON('users.json', users);
  }

  getRefunds() {
    return this.readJSON('refunds.json');
  }

  saveRefunds(refunds) {
    return this.writeJSON('refunds.json', refunds);
  }

  getOperationLogs() {
    return this.readJSON('operation-logs.json');
  }

  saveOperationLogs(logs) {
    return this.writeJSON('operation-logs.json', logs);
  }

  addOperationLog(log) {
    const logs = this.readJSON('operation-logs.json');
    logs.unshift(log);
    return this.writeJSON('operation-logs.json', logs);
  }

  getSecurityLogs() {
    return this.readJSON('security-logs.json');
  }

  saveSecurityLogs(logs) {
    return this.writeJSON('security-logs.json', logs);
  }

  addSecurityLog(log) {
    const logs = this.readJSON('security-logs.json');
    logs.unshift(log);
    return this.writeJSON('security-logs.json', logs);
  }

  getNotificationLogs() {
    return this.readJSON('notification-logs.json');
  }

  saveNotificationLogs(logs) {
    return this.writeJSON('notification-logs.json', logs);
  }

  addNotificationLog(log) {
    const logs = this.readJSON('notification-logs.json');
    logs.unshift(log);
    return this.writeJSON('notification-logs.json', logs);
  }

  findById(data, id) {
    return data.find(item => item.id === id);
  }

  addItem(fileName, item) {
    const data = this.readJSON(fileName);
    data.push(item);
    return this.writeJSON(fileName, data);
  }

  updateItem(fileName, id, updatedItem) {
    const data = this.readJSON(fileName);
    const index = data.findIndex(item => item.id === id);
    if (index !== -1) {
      data[index] = { ...data[index], ...updatedItem };
      return this.writeJSON(fileName, data);
    }
    return false;
  }

  deleteItem(fileName, id) {
    const data = this.readJSON(fileName);
    const filtered = data.filter(item => item.id !== id);
    return this.writeJSON(fileName, filtered);
  }
}

module.exports = new Database();
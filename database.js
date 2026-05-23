const fs = require('fs');
const path = require('path');

const IS_VERCEL = process.env.VERCEL || process.env.VERCEL_ENV;

class Database {
  constructor() {
    // 在 Vercel 上也使用实际的 data 目录，避免数据丢失
    try {
      const config = require('./config');
      this.dataDir = path.join(__dirname, 'data');
    } catch(e) {
      this.dataDir = path.join(__dirname, 'data');
    }
    this.ensureDataDir();
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch(e) {
      console.error('ensureDataDir failed:', e.message);
    }
  }

  readJSON(fileName) {
    const filePath = path.join(this.dataDir, fileName);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
      // 从原始 data 目录读取作为后备
      const fallbackPath = path.join(__dirname, 'data', fileName);
      if (fs.existsSync(fallbackPath)) {
        const data = fs.readFileSync(fallbackPath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch(e) {
      console.error('Error reading ' + fileName + ':', e.message);
      return [];
    }
  }

  writeJSON(fileName, data) {
    const filePath = path.join(this.dataDir, fileName);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch(e) {
      console.error('Error writing ' + fileName + ':', e.message);
      return false;
    }
  }

  getProducts() { return this.readJSON('products.json'); }
  saveProducts(products) { return this.writeJSON('products.json', products); }
  getOrders() { return this.readJSON('orders.json'); }
  saveOrders(orders) { return this.writeJSON('orders.json', orders); }
  getUsers() { return this.readJSON('users.json'); }
  saveUsers(users) { return this.writeJSON('users.json', users); }
  getRefunds() { return this.readJSON('refunds.json'); }
  saveRefunds(refunds) { return this.writeJSON('refunds.json', refunds); }

  findById(data, id) {
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === id) {
        return data[i];
      }
    }
    return null;
  }

  addItem(fileName, item) {
    const data = this.readJSON(fileName);
    data.push(item);
    return this.writeJSON(fileName, data);
  }

  updateItem(fileName, id, updatedItem) {
    const data = this.readJSON(fileName);
    var index = -1;
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === id) {
        index = i;
        break;
      }
    }
    if (index !== -1) {
      var mergedItem = {};
      for (var key in data[index]) {
        mergedItem[key] = data[index][key];
      }
      for (var key2 in updatedItem) {
        if (updatedItem.hasOwnProperty(key2)) {
          mergedItem[key2] = updatedItem[key2];
        }
      }
      data[index] = mergedItem;
      return this.writeJSON(fileName, data);
    }
    return false;
  }

  deleteItem(fileName, id) {
    const data = this.readJSON(fileName);
    var filtered = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].id !== id) {
        filtered.push(data[i]);
      }
    }
    return this.writeJSON(fileName, filtered);
  }
}

module.exports = Database;

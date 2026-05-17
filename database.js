const fs = require('fs');
const path = require('path');

const IS_VERCEL = process.env.VERCEL || process.env.VERCEL_ENV;

class Database {
  constructor() {
    if (IS_VERCEL) {
      this.dataDir = '/tmp/kdx-data';
    } else {
      try {
        const config = require('./config');
        this.dataDir = path.join(__dirname, 'data');
      } catch(e) {
        this.dataDir = path.join(__dirname, 'data');
      }
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
      if (!IS_VERCEL) {
        const fallbackPath = path.join(__dirname, 'data', fileName);
        if (fs.existsSync(fallbackPath)) {
          const data = fs.readFileSync(fallbackPath, 'utf8');
          return JSON.parse(data);
        }
      }
      return [];
    } catch(e) {
      console.error(`Error reading ${fileName}:`, e.message);
      return [];
    }
  }

  writeJSON(fileName, data) {
    const filePath = path.join(this.dataDir, fileName);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch(e) {
      console.error(`Error writing ${fileName}:`, e.message);
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

  findById(data, id) { return data.find(item => item.id === id); }

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

module.exports = Database;

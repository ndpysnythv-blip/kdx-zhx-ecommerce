const fs = require('fs');
const path = require('path');

const isVercel = !!(process.env.VERCEL || process.env.NOW_REGION || process.env.VERCEL_ENV);

class Database {
  constructor() {
    if (isVercel) {
      this.dataDir = '/tmp/kdx-data';
    } else {
      this.dataDir = path.join(__dirname, 'data');
    }
    this.ensureDataDir();
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch (e) {
      console.error('ensureDataDir failed:', e.message);
      if (this.dataDir !== '/tmp/kdx-data') {
        this.dataDir = '/tmp/kdx-data';
        try {
          if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
          }
        } catch (e2) {
          console.error('fallback ensureDataDir failed:', e2.message);
        }
      }
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

module.exports = Database;
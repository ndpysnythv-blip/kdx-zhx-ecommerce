# 前后端分离部署指南

## 📋 部署架构

- **前端**：GitHub Pages - `https://ndpysnythv-blip.github.io/kdx-zhx-ecommerce/`
- **后端**：Vercel - `https://kdx-zhx.vercel.app`

---

## 🚀 配置步骤

### 1️⃣ 配置 GitHub Pages 前端

因为 GitHub Pages 只是静态文件，我们需要：

#### 选项 A：手动修改（简单快速）

在 GitHub Pages 的文件中，找到所有 API 调用的地方，把相对路径改为绝对路径：

例如，把：
```javascript
fetch('/api/products')
```

改为：
```javascript
fetch('https://kdx-zhx.vercel.app/api/products')
```

#### 选项 B：使用脚本批量替换（推荐）

如果你可以访问 GitHub 仓库文件，可以用这个简单的方法：

1. 在仓库中创建一个 `api-config.js` 文件（已提供）
2. 在所有 HTML 文件的 `<head>` 中引入：
   ```html
   <script src="api-config.js"></script>
   ```
3. 在 JavaScript 中使用：
   ```javascript
   fetch(API_CONFIG.getApiUrl('/api/products'))
   ```

---

### 2️⃣ 后端已配置完成（Vercel）

✅ CORS 已配置，允许 GitHub Pages 访问
✅ 环境变量已配置
✅ 支付宝支付已配置

---

## 📝 快速解决方案（推荐先试这个）

### 方法 1：直接访问 Vercel 域名（最简单）

直接把 `https://kdx-zhx.vercel.app` 分享给用户！

因为 Vercel 已经部署了完整的应用（前端+后端），可以直接使用。

### 方法 2：使用 GitHub Pages + 全局替换

如果你一定要用 GitHub Pages，我可以帮你批量修改所有前端文件中的 API 地址。

---

## 🎯 我的建议

**最简单的方式：直接分享 Vercel 域名给用户！**

- ✅ 地址：`https://kdx-zhx.vercel.app`
- ✅ 已经包含完整的前端和后端
- ✅ 不需要任何额外配置
- ✅ 支付功能完整可用

---

## 🔍 检查清单

### Vercel 域名检查
- [ ] 访问 `https://kdx-zhx.vercel.app`
- [ ] 首页能正常显示
- [ ] 商品列表能加载
- [ ] 购物车功能正常
- [ ] 支付功能正常

### GitHub Pages 检查（如果使用）
- [ ] 访问 `https://ndpysnythv-blip.github.io/kdx-zhx-ecommerce/`
- [ ] 页面能正常显示
- [ ] API 调用指向 `https://kdx-zhx.vercel.app`
- [ ] 没有 CORS 错误

---

## 💡 后续配置（如果需要 GitHub Pages）

告诉我：
1. 你想直接用 Vercel 域名，还是一定要用 GitHub Pages？
2. 如果要用 GitHub Pages，我需要批量修改所有前端文件中的 API 地址。

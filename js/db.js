/**
 * db.js - 数据存储层
 * 基于 localStorage 的数据持久化，管理商品、库存、操作记录、交易记录
 */

const DB = {
    // ==================== 清空全部数据 ====================
    clearAll() {
        Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
    },

    // ==================== 数据导出 / 导入 ====================
    // 导出为 JSON 字符串，由用户自行保存为文件，不绑定本浏览器
    exportData() {
        const data = {
            app: 'ScanFlow',
            version: 1,
            exportedAt: Date.now(),
            products: this.getProducts(),
            operations: this.getOperations(),
            transactions: this.getTransactions(),
            staffPassword: this.getPassword(),
        };
        return JSON.stringify(data, null, 2);
    },

    // 从 JSON 字符串导入数据，返回是否成功
    importData(json) {
        if (typeof json !== 'string') return false;
        let data;
        try {
            data = JSON.parse(json);
        } catch {
            return false;
        }
        if (!data || typeof data !== 'object') return false;

        if (Array.isArray(data.products)) this._write(this.KEYS.PRODUCTS, data.products);
        if (Array.isArray(data.operations)) this._write(this.KEYS.OPERATIONS, data.operations);
        if (Array.isArray(data.transactions)) this._write(this.KEYS.TRANSACTIONS, data.transactions);
        if (typeof data.staffPassword === 'string') this._write(this.KEYS.STAFF_PASSWORD, data.staffPassword);
        return true;
    },

    // ==================== 存储键名 ====================
    KEYS: {
        PRODUCTS: 'scan_products',
        OPERATIONS: 'scan_operations',
        TRANSACTIONS: 'scan_transactions',
        STAFF_PASSWORD: 'scan_staff_password',
        CART: 'scan_cart',
    },

    // ==================== 内部工具 ====================
    _read(key, defaultValue = []) {
        const raw = localStorage.getItem(key);
        if (!raw) return defaultValue;
        try {
            return JSON.parse(raw);
        } catch {
            return defaultValue;
        }
    },

    _write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    _uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    // ==================== 商品管理 ====================
    getProducts() {
        return this._read(this.KEYS.PRODUCTS, []);
    },

    getProduct(barcode) {
        const products = this.getProducts();
        return products.find(p => p.barcode === barcode) || null;
    },

    addProduct(product) {
        const products = this.getProducts();
        // 如果条码已存在，更新信息
        const existing = products.find(p => p.barcode === product.barcode);
        if (existing) {
            Object.assign(existing, product, { updatedAt: Date.now() });
        } else {
            products.push({
                ...product,
                stock: product.stock || 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
        this._write(this.KEYS.PRODUCTS, products);
        return this.getProduct(product.barcode);
    },

    updateProduct(barcode, updates) {
        const products = this.getProducts();
        const idx = products.findIndex(p => p.barcode === barcode);
        if (idx === -1) return null;
        Object.assign(products[idx], updates, { updatedAt: Date.now() });
        this._write(this.KEYS.PRODUCTS, products);
        return products[idx];
    },

    adjustStock(barcode, delta) {
        const product = this.getProduct(barcode);
        if (!product) return null;
        const newStock = product.stock + delta;
        if (newStock < 0) return { error: '库存不足', currentStock: product.stock };
        this.updateProduct(barcode, { stock: newStock });
        return this.getProduct(barcode);
    },

    // ==================== 操作记录 ====================
    addOperation(op) {
        const operations = this._read(this.KEYS.OPERATIONS, []);
        const record = {
            id: this._uid(),
            type: op.type,            // 'in' | 'out'
            barcode: op.barcode,
            productName: op.productName,
            quantity: op.quantity || 1,
            operator: op.operator || 'system',
            note: op.note || '',
            timestamp: Date.now(),
        };
        operations.push(record);
        this._write(this.KEYS.OPERATIONS, operations);
        return record;
    },

    getOperations(limit = 100) {
        const operations = this._read(this.KEYS.OPERATIONS, []);
        return operations.reverse().slice(0, limit);
    },

    getOperationsByType(type, limit = 100) {
        const operations = this._read(this.KEYS.OPERATIONS, []);
        return operations.filter(o => o.type === type).reverse().slice(0, limit);
    },

    // ==================== 交易记录 ====================
    addTransaction(transaction) {
        const transactions = this._read(this.KEYS.TRANSACTIONS, []);
        const record = {
            id: this._uid(),
            items: transaction.items,
            total: transaction.total,
            paymentMethod: transaction.paymentMethod,
            type: transaction.type,    // 'self' | 'staff'
            timestamp: Date.now(),
        };
        transactions.push(record);
        this._write(this.KEYS.TRANSACTIONS, transactions);
        return record;
    },

    getTransactions(limit = 50) {
        const transactions = this._read(this.KEYS.TRANSACTIONS, []);
        return transactions.reverse().slice(0, limit);
    },

    // ==================== 购物车 ====================
    getCart() {
        return this._read(this.KEYS.CART, []);
    },

    addToCart(barcode, quantity = 1) {
        const product = this.getProduct(barcode);
        if (!product) return { error: '商品不存在' };
        if (product.stock < quantity) return { error: '库存不足', stock: product.stock };

        const cart = this.getCart();
        const existing = cart.find(item => item.barcode === barcode);
        if (existing) {
            existing.quantity += quantity;
        } else {
            cart.push({
                barcode: product.barcode,
                name: product.name,
                price: product.price,
                quantity: quantity,
            });
        }
        this._write(this.KEYS.CART, cart);
        return { success: true, cart };
    },

    updateCartQuantity(barcode, quantity) {
        const cart = this.getCart();
        const item = cart.find(i => i.barcode === barcode);
        if (!item) return { error: '购物车中无此商品' };
        if (quantity <= 0) {
            return this.removeFromCart(barcode);
        }
        item.quantity = quantity;
        this._write(this.KEYS.CART, cart);
        return { success: true, cart };
    },

    removeFromCart(barcode) {
        let cart = this.getCart();
        cart = cart.filter(i => i.barcode !== barcode);
        this._write(this.KEYS.CART, cart);
        return { success: true, cart };
    },

    clearCart() {
        this._write(this.KEYS.CART, []);
    },

    getCartTotal() {
        const cart = this.getCart();
        return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    },

    getCartCount() {
        const cart = this.getCart();
        return cart.reduce((sum, item) => sum + item.quantity, 0);
    },

    // ==================== 结算 ====================
    checkout(paymentMethod, type) {
        const cart = this.getCart();
        if (cart.length === 0) return { error: '购物车为空' };

        // 扣减库存
        for (const item of cart) {
            const result = this.adjustStock(item.barcode, -item.quantity);
            if (result && result.error) {
                return { error: `${item.name} ${result.error}` };
            }
        }

        // 记录交易
        const total = this.getCartTotal();
        const transaction = this.addTransaction({
            items: cart,
            total,
            paymentMethod,
            type,
        });

        // 清空购物车
        this.clearCart();
        return { success: true, transaction };
    },

    // ==================== 员工密码 ====================
    getPassword() {
        return localStorage.getItem(this.KEYS.STAFF_PASSWORD) || '123456';
    },

    setPassword(newPassword) {
        localStorage.setItem(this.KEYS.STAFF_PASSWORD, newPassword);
    },

    verifyPassword(input) {
        return input === this.getPassword();
    },

    // ==================== 统计 ====================
    getStats() {
        const products = this.getProducts();
        const operations = this._read(this.KEYS.OPERATIONS, []);
        const transactions = this._read(this.KEYS.TRANSACTIONS, []);
        const today = new Date().setHours(0, 0, 0, 0);

        const todayOps = operations.filter(o => o.timestamp >= today);
        const todayIn = todayOps.filter(o => o.type === 'in').reduce((s, o) => s + o.quantity, 0);
        const todayOut = todayOps.filter(o => o.type === 'out').reduce((s, o) => s + o.quantity, 0);
        const todayTx = transactions.filter(t => t.timestamp >= today);
        const todayRevenue = todayTx.reduce((s, t) => s + t.total, 0);

        return {
            totalProducts: products.length,
            totalStock: products.reduce((s, p) => s + p.stock, 0),
            todayIn,
            todayOut,
            todayTxCount: todayTx.length,
            todayRevenue,
        };
    },
};

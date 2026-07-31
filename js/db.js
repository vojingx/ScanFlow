/**
 * db.js - 数据存储层（云端同步版）
 *
 * 架构：
 *  - 数据存放在 GitHub 仓库的 data/db.json（通过 Contents API 读写），实现多设备共享。
 *  - 内存 cache 为唯一数据源，所有 getter 同步读取 cache（界面无需改异步）。
 *  - 每次修改后：① 写入本地 localStorage（离线兜底）② 后台静默推送到 GitHub。
 *  - 若配置了 TOKEN，启动时会从 GitHub 拉取最新数据，并每 15 秒轮询一次以合并他人改动。
 *  - 若未配置 TOKEN，自动降级为「仅本浏览器」模式（localStorage）。
 *
 * 购物车(cart)为设备私有，不参与云端同步。
 */

// UTF-8 安全的 base64 编解码（GitHub API 需要 base64 内容）
function _utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}
function _b64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

const DB = {
    // 云端数据缓存（唯一数据源）
    cache: {
        products: [],
        operations: [],
        transactions: [],
        staffPassword: '123456',
    },
    sha: null,        // 云端文件的 git sha，用于乐观并发更新
    online: false,    // 是否已连上云端
    ready: false,     // init 是否完成
    _saveTimer: null,
    _syncTimer: null,
    onSync: null,     // 云端数据变化后触发的回调（页面可设置用于刷新 UI）

    KEYS: {
        PRODUCTS_LOCAL: 'scan_products',
        OPERATIONS_LOCAL: 'scan_operations',
        TRANSACTIONS_LOCAL: 'scan_transactions',
        STAFF_PASSWORD_LOCAL: 'scan_staff_password',
        CART: 'scan_cart',
    },

    _uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    // ==================== 初始化 ====================
    async init() {
        if (this.ready) return;
        // 本地兜底始终先加载；首次开启云端同步时，本地已有数据会被合并上云（迁移）
        this._loadLocal();
        if (CONFIG.TOKEN) {
            try {
                await this._pull(true);
                this.online = true;
            } catch (e) {
                console.warn('云端拉取失败，降级为本地模式：', e);
                this.online = false;
            }
        } else {
            this.online = false;
        }
        this.ready = true;
        this._startPolling();
    },

    // 从 GitHub 拉取最新数据并合并到 cache
    async _pull(initial = false) {
        const url = `${CONFIG.GITHUB_API}/repos/${CONFIG.OWNER}/${CONFIG.REPO}/contents/${CONFIG.DATA_PATH}?ref=${CONFIG.BRANCH}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${CONFIG.TOKEN}`, 'Accept': 'application/vnd.github+json' },
        });
        if (res.status === 404) {
            // 文件不存在：用当前 cache（可能含本地迁移数据）创建空数据文件
            this.sha = null;
            await this._push(true);
            return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        this.sha = data.sha;
        const remote = JSON.parse(_b64ToUtf8(data.content));
        this._merge(remote);
        this._persistLocal();
        if (!initial && typeof this.onSync === 'function') this.onSync();
    },

    // 合并远端数据（远端为权威源，避免互相覆盖丢失记录）
    _merge(remote) {
        // 商品：以条码为键，远端优先（保证库存等以最后一次推送为准）
        const map = new Map();
        (remote.products || []).forEach(p => map.set(p.barcode, p));
        (this.cache.products || []).forEach(p => { if (!map.has(p.barcode)) map.set(p.barcode, p); });
        this.cache.products = Array.from(map.values());

        // 操作/交易记录：按 id 并集，避免丢记录
        const opIds = new Set(this.cache.operations.map(o => o.id));
        (remote.operations || []).forEach(o => { if (!opIds.has(o.id)) this.cache.operations.push(o); });
        const txIds = new Set(this.cache.transactions.map(t => t.id));
        (remote.transactions || []).forEach(t => { if (!txIds.has(t.id)) this.cache.transactions.push(t); });

        // 员工密码：远端优先
        if (remote.staffPassword) this.cache.staffPassword = remote.staffPassword;
    },

    // 推送到 GitHub（带乐观并发重试）
    async _push(create = false) {
        if (!CONFIG.TOKEN) return;
        const json = JSON.stringify(this.cache);
        const body = {
            message: `ScanFlow 数据更新 ${new Date().toLocaleString('zh-CN')}`,
            content: _utf8ToB64(json),
            branch: CONFIG.BRANCH,
        };
        if (this.sha && !create) body.sha = this.sha;

        const url = `${CONFIG.GITHUB_API}/repos/${CONFIG.OWNER}/${CONFIG.REPO}/contents/${CONFIG.DATA_PATH}`;
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${CONFIG.TOKEN}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json();
                this.sha = data.content.sha;
                this.online = true;
                return;
            }
            if (res.status === 409) {
                // 冲突：重新拉取远端 sha 再试
                await this._pull(true);
                continue;
            }
            throw new Error('推送失败 HTTP ' + res.status);
        }
    },

    // 后台防抖保存
    _scheduleSave() {
        this._persistLocal();
        if (!CONFIG.TOKEN) return;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._push().catch(e => console.warn('后台保存失败：', e));
        }, 600);
    },

    // 轮询远端，合并他人改动
    _startPolling() {
        if (!CONFIG.TOKEN) return;
        clearInterval(this._syncTimer);
        this._syncTimer = setInterval(() => {
            this._pull().catch(() => {});
        }, 15000);
    },

    // ==================== 本地兜底 ====================
    _loadLocal() {
        try { this.cache.products = JSON.parse(localStorage.getItem(this.KEYS.PRODUCTS_LOCAL)) || []; } catch { this.cache.products = []; }
        try { this.cache.operations = JSON.parse(localStorage.getItem(this.KEYS.OPERATIONS_LOCAL)) || []; } catch { this.cache.operations = []; }
        try { this.cache.transactions = JSON.parse(localStorage.getItem(this.KEYS.TRANSACTIONS_LOCAL)) || []; } catch { this.cache.transactions = []; }
        this.cache.staffPassword = localStorage.getItem(this.KEYS.STAFF_PASSWORD_LOCAL) || '123456';
    },

    _persistLocal() {
        localStorage.setItem(this.KEYS.PRODUCTS_LOCAL, JSON.stringify(this.cache.products));
        localStorage.setItem(this.KEYS.OPERATIONS_LOCAL, JSON.stringify(this.cache.operations));
        localStorage.setItem(this.KEYS.TRANSACTIONS_LOCAL, JSON.stringify(this.cache.transactions));
        localStorage.setItem(this.KEYS.STAFF_PASSWORD_LOCAL, this.cache.staffPassword);
    },

    // ==================== 数据导出 / 导入 ====================
    exportData() {
        return JSON.stringify({
            app: 'ScanFlow', version: 1, exportedAt: Date.now(),
            products: this.cache.products,
            operations: this.cache.operations,
            transactions: this.cache.transactions,
            staffPassword: this.cache.staffPassword,
        }, null, 2);
    },

    importData(json) {
        if (typeof json !== 'string') return false;
        let data;
        try { data = JSON.parse(json); } catch { return false; }
        if (!data || typeof data !== 'object') return false;
        if (Array.isArray(data.products)) this.cache.products = data.products;
        if (Array.isArray(data.operations)) this.cache.operations = data.operations;
        if (Array.isArray(data.transactions)) this.cache.transactions = data.transactions;
        if (typeof data.staffPassword === 'string') this.cache.staffPassword = data.staffPassword;
        this._scheduleSave();
        return true;
    },

    clearAll() {
        this.cache = { products: [], operations: [], transactions: [], staffPassword: '123456' };
        this._persistLocal();
        if (CONFIG.TOKEN) this._push().catch(() => {});
    },

    // ==================== 商品管理 ====================
    getProducts() { return this.cache.products; },

    getProduct(barcode) {
        return this.cache.products.find(p => p.barcode === barcode) || null;
    },

    addProduct(product) {
        const existing = this.cache.products.find(p => p.barcode === product.barcode);
        if (existing) {
            Object.assign(existing, product, { updatedAt: Date.now() });
        } else {
            this.cache.products.push({
                ...product,
                category: product.category || '未分类',
                minStock: (product.minStock != null && product.minStock >= 0) ? Number(product.minStock) : 10,
                stock: product.stock || 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
        this._scheduleSave();
        return this.getProduct(product.barcode);
    },

    updateProduct(barcode, updates) {
        const idx = this.cache.products.findIndex(p => p.barcode === barcode);
        if (idx === -1) return null;
        Object.assign(this.cache.products[idx], updates, { updatedAt: Date.now() });
        this._scheduleSave();
        return this.cache.products[idx];
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
        const record = {
            id: this._uid(),
            type: op.type,
            barcode: op.barcode,
            productName: op.productName,
            quantity: op.quantity || 1,
            operator: op.operator || 'system',
            note: op.note || '',
            timestamp: Date.now(),
        };
        this.cache.operations.push(record);
        this._scheduleSave();
        return record;
    },

    getOperations(limit = 100) {
        return this.cache.operations.slice().reverse().slice(0, limit);
    },

    getOperationsByType(type, limit = 100) {
        return this.cache.operations.filter(o => o.type === type).slice().reverse().slice(0, limit);
    },

    // ==================== 交易记录 ====================
    addTransaction(transaction) {
        const record = {
            id: this._uid(),
            items: transaction.items,
            total: transaction.total,
            paymentMethod: transaction.paymentMethod,
            type: transaction.type,
            timestamp: Date.now(),
        };
        this.cache.transactions.push(record);
        this._scheduleSave();
        return record;
    },

    getTransactions(limit = 50) {
        return this.cache.transactions.slice().reverse().slice(0, limit);
    },

    // ==================== 购物车（设备私有，仅本地） ====================
    getCart() {
        try { return JSON.parse(localStorage.getItem(this.KEYS.CART)) || []; } catch { return []; }
    },

    addToCart(barcode, quantity = 1) {
        const product = this.getProduct(barcode);
        if (!product) return { error: '商品不存在' };
        if (product.stock < quantity) return { error: '库存不足', stock: product.stock };
        const cart = this.getCart();
        const existing = cart.find(item => item.barcode === barcode);
        if (existing) existing.quantity += quantity;
        else cart.push({ barcode: product.barcode, name: product.name, price: product.price, quantity });
        localStorage.setItem(this.KEYS.CART, JSON.stringify(cart));
        return { success: true, cart };
    },

    updateCartQuantity(barcode, quantity) {
        const cart = this.getCart();
        const item = cart.find(i => i.barcode === barcode);
        if (!item) return { error: '购物车中无此商品' };
        if (quantity <= 0) return this.removeFromCart(barcode);
        item.quantity = quantity;
        localStorage.setItem(this.KEYS.CART, JSON.stringify(cart));
        return { success: true, cart };
    },

    removeFromCart(barcode) {
        let cart = this.getCart();
        cart = cart.filter(i => i.barcode !== barcode);
        localStorage.setItem(this.KEYS.CART, JSON.stringify(cart));
        return { success: true, cart };
    },

    clearCart() {
        localStorage.setItem(this.KEYS.CART, JSON.stringify([]));
    },

    getCartTotal() {
        return this.getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
    },

    getCartCount() {
        return this.getCart().reduce((sum, item) => sum + item.quantity, 0);
    },

    // ==================== 结算 ====================
    checkout(paymentMethod, type) {
        const cart = this.getCart();
        if (cart.length === 0) return { error: '购物车为空' };
        for (const item of cart) {
            const result = this.adjustStock(item.barcode, -item.quantity);
            if (result && result.error) return { error: `${item.name} ${result.error}` };
        }
        const total = this.getCartTotal();
        const transaction = this.addTransaction({ items: cart, total, paymentMethod, type });
        this.clearCart();
        return { success: true, transaction };
    },

    // ==================== 员工密码 ====================
    getPassword() { return this.cache.staffPassword || '123456'; },

    setPassword(newPassword) {
        this.cache.staffPassword = newPassword;
        this._scheduleSave();
    },

    verifyPassword(input) { return input === this.getPassword(); },

    // ==================== 统计 ====================
    getStats() {
        const products = this.cache.products;
        const operations = this.cache.operations;
        const transactions = this.cache.transactions;
        const today = new Date().setHours(0, 0, 0, 0);
        const todayOps = operations.filter(o => o.timestamp >= today);
        const todayIn = todayOps.filter(o => o.type === 'in').reduce((s, o) => s + o.quantity, 0);
        const todayOut = todayOps.filter(o => o.type === 'out').reduce((s, o) => s + o.quantity, 0);
        const todayTx = transactions.filter(t => t.timestamp >= today);
        const todayRevenue = todayTx.reduce((s, t) => s + t.total, 0);
        return {
            totalProducts: products.length,
            totalStock: products.reduce((s, p) => s + p.stock, 0),
            todayIn, todayOut,
            todayTxCount: todayTx.length,
            todayRevenue,
        };
    },
};

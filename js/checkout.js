/**
 * checkout.js - 收银结算逻辑（自助版 & 人工版共用）
 */

const Checkout = {
    mode: 'self',    // 'self' | 'staff'
    state: 'shopping', // 'shopping' | 'payment' | 'success'
    selectedPayment: 'cash',

    /**
     * 初始化
     * @param {string} mode - 'self' or 'staff'
     */
    init(mode) {
        this.mode = mode;
        this.state = 'shopping';
        this.render();
    },

    // ==================== 扫码添加商品 ====================
    startScan() {
        Scanner.open(
            (barcode) => this.addProduct(barcode),
            (barcode) => this.addProduct(barcode)
        );
    },

    addProduct(barcode) {
        const result = DB.addToCart(barcode, 1);
        if (result.error) {
            // 商品不存在
            if (result.error === '商品不存在') {
                showToast('商品不存在，请先在出入库页面入库', 'error', 3000);
            } else {
                showToast(result.error, 'error');
            }
            return;
        }
        const product = DB.getProduct(barcode);
        showToast(`已添加：${product.name}`, 'success');
        this.render();
    },

    // ==================== 数量调整 ====================
    increaseQty(barcode) {
        const cart = DB.getCart();
        const item = cart.find(i => i.barcode === barcode);
        if (!item) return;
        const product = DB.getProduct(barcode);
        if (product && item.quantity >= product.stock) {
            showToast('库存不足', 'error');
            return;
        }
        DB.updateCartQuantity(barcode, item.quantity + 1);
        this.render();
    },

    decreaseQty(barcode) {
        const cart = DB.getCart();
        const item = cart.find(i => i.barcode === barcode);
        if (!item) return;
        if (item.quantity <= 1) {
            DB.removeFromCart(barcode);
        } else {
            DB.updateCartQuantity(barcode, item.quantity - 1);
        }
        this.render();
    },

    removeItem(barcode) {
        DB.removeFromCart(barcode);
        this.render();
    },

    // ==================== 清空购物车 ====================
    clearCart() {
        if (DB.getCart().length === 0) return;
        if (confirm('确认清空购物车？')) {
            DB.clearCart();
            this.render();
            showToast('购物车已清空', 'default');
        }
    },

    // ==================== 进入结算 ====================
    goToPayment() {
        if (DB.getCart().length === 0) {
            showToast('购物车为空', 'error');
            return;
        }
        this.state = 'payment';
        this.render();
    },

    selectPayment(method) {
        this.selectedPayment = method;
        document.querySelectorAll('.payment-method').forEach(el => {
            el.classList.toggle('selected', el.dataset.method === method);
        });
    },

    confirmPayment() {
        const result = DB.checkout(this.selectedPayment, this.mode);
        if (result.error) {
            showToast(result.error, 'error');
            return;
        }
        this._lastTransaction = result.transaction;
        this.state = 'success';
        this.render();
    },

    // ==================== 返回购物 ====================
    backToShopping() {
        this.state = 'shopping';
        this.render();
    },

    // ==================== 继续购物（结算成功后） ====================
    newOrder() {
        this.state = 'shopping';
        this.render();
    },

    // ==================== 渲染 ====================
    render() {
        if (this.state === 'shopping') {
            this.renderShopping();
        } else if (this.state === 'payment') {
            this.renderPayment();
        } else if (this.state === 'success') {
            this.renderSuccess();
        }
    },

    renderShopping() {
        const container = document.getElementById('checkout-app');
        const cart = DB.getCart();
        const total = DB.getCartTotal();
        const count = DB.getCartCount();

        container.innerHTML = `
            <div class="cart-container">
                <!-- 左侧：购物车列表 -->
                <div class="cart-items">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <div class="card-title" style="margin-bottom:0;">🛒 购物车 (${count})</div>
                        ${cart.length > 0 ? `<button class="btn btn-sm btn-danger" onclick="Checkout.clearCart()">清空</button>` : ''}
                    </div>
                    ${cart.length === 0 ? `
                        <div class="empty-state">
                            <span class="empty-state-icon">🛒</span>
                            <div>购物车为空</div>
                            <div style="font-size:13px;margin-top:4px;">点击下方按钮扫码添加商品</div>
                        </div>
                    ` : cart.map(item => `
                        <div class="cart-item">
                            <div class="cart-item-info">
                                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                                <div class="cart-item-barcode">${escapeHtml(item.barcode)} · ${formatMoney(item.price)}/件</div>
                            </div>
                            <div class="cart-item-controls">
                                <button class="qty-btn" onclick="Checkout.decreaseQty('${escapeHtml(item.barcode)}')">−</button>
                                <span class="qty-display">${item.quantity}</span>
                                <button class="qty-btn" onclick="Checkout.increaseQty('${escapeHtml(item.barcode)}')">+</button>
                                <span class="cart-item-price" style="margin-left:12px;">${formatMoney(item.price * item.quantity)}</span>
                                <button class="qty-btn" onclick="Checkout.removeItem('${escapeHtml(item.barcode)}')" style="margin-left:8px;color:var(--danger);border-color:var(--danger);" title="移除">×</button>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- 右侧：扫码按钮和结算 -->
                <div class="cart-summary">
                    <div class="card-title" style="margin-bottom:16px;">结算</div>
                    <button class="btn btn-primary btn-lg" onclick="Checkout.startScan()" style="margin-bottom:16px;">
                        📷 扫码添加商品
                    </button>
                    <div class="summary-row">
                        <span>商品数量</span>
                        <span>${count} 件</span>
                    </div>
                    <div class="summary-row">
                        <span>商品种类</span>
                        <span>${cart.length} 种</span>
                    </div>
                    <div class="summary-total">
                        <span>合计</span>
                        <span class="amount">${formatMoney(total)}</span>
                    </div>
                    <button class="btn btn-success btn-lg" style="margin-top:16px;"
                            onclick="Checkout.goToPayment()" ${cart.length === 0 ? 'disabled' : ''}>
                        💰 去结算
                    </button>
                </div>
            </div>
        `;
    },

    renderPayment() {
        const container = document.getElementById('checkout-app');
        const cart = DB.getCart();
        const total = DB.getCartTotal();

        container.innerHTML = `
            <div style="max-width:600px;margin:0 auto;">
                <div class="card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <div class="card-title" style="margin-bottom:0;">💰 确认支付</div>
                        <button class="btn btn-sm btn-secondary" onclick="Checkout.backToShopping()">← 返回</button>
                    </div>

                    <!-- 商品明细 -->
                    <div style="margin-bottom:20px;max-height:240px;overflow-y:auto;">
                        ${cart.map(item => `
                            <div class="cart-item">
                                <div class="cart-item-info">
                                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                                    <div class="cart-item-barcode">${formatMoney(item.price)} × ${item.quantity}</div>
                                </div>
                                <div class="cart-item-price">${formatMoney(item.price * item.quantity)}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="summary-total" style="margin-bottom:24px;">
                        <span>应付金额</span>
                        <span class="amount">${formatMoney(total)}</span>
                    </div>

                    <!-- 支付方式 -->
                    <div class="input-label" style="margin-bottom:12px;">选择支付方式</div>
                    <div class="payment-methods">
                        <div class="payment-method ${this.selectedPayment === 'cash' ? 'selected' : ''}" data-method="cash"
                             onclick="Checkout.selectPayment('cash')">
                            <span class="payment-method-icon">💵</span>
                            <div class="payment-method-name">现金支付</div>
                        </div>
                        <div class="payment-method ${this.selectedPayment === 'wechat' ? 'selected' : ''}" data-method="wechat"
                             onclick="Checkout.selectPayment('wechat')">
                            <span class="payment-method-icon">💚</span>
                            <div class="payment-method-name">微信支付</div>
                        </div>
                        <div class="payment-method ${this.selectedPayment === 'alipay' ? 'selected' : ''}" data-method="alipay"
                             onclick="Checkout.selectPayment('alipay')">
                            <span class="payment-method-icon">💙</span>
                            <div class="payment-method-name">支付宝</div>
                        </div>
                    </div>

                    <button class="btn btn-success btn-lg" style="margin-top:20px;" onclick="Checkout.confirmPayment()">
                        ✅ 确认支付 ${formatMoney(total)}
                    </button>
                </div>
            </div>
        `;
    },

    renderSuccess() {
        const container = document.getElementById('checkout-app');
        const tx = this._lastTransaction;
        const paymentNames = {
            cash: '现金支付',
            wechat: '微信支付',
            alipay: '支付宝',
        };

        container.innerHTML = `
            <div style="max-width:500px;margin:0 auto;">
                <div class="card">
                    <div class="success-screen">
                        <span class="success-icon">✅</span>
                        <div class="success-title">支付成功</div>
                        <div class="success-amount">${formatMoney(tx.total)}</div>

                        <div id="receipt-print-area" style="text-align:left;background:var(--bg);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px;">
                            <div class="summary-row">
                                <span>交易单号</span>
                                <span style="font-size:12px;">${tx.id}</span>
                            </div>
                            <div class="summary-row">
                                <span>支付方式</span>
                                <span>${paymentNames[tx.paymentMethod] || tx.paymentMethod}</span>
                            </div>
                            <div class="summary-row">
                                <span>商品数量</span>
                                <span>${tx.items.reduce((s,i)=>s+i.quantity,0)} 件</span>
                            </div>
                            <div class="summary-row">
                                <span>收银类型</span>
                                <span>${tx.type === 'staff' ? '人工收银' : '自助收银'}</span>
                            </div>
                            <div class="summary-row">
                                <span>交易时间</span>
                                <span>${formatTime(tx.timestamp)}</span>
                            </div>
                            <div style="border-top:1px dashed var(--border);padding-top:12px;margin-top:12px;">
                                <div class="input-label" style="margin-bottom:8px;">商品明细</div>
                                ${tx.items.map(item => `
                                    <div style="display:flex;justify-content:space-between;font-size:14px;padding:4px 0;">
                                        <span>${escapeHtml(item.name)} × ${item.quantity}</span>
                                        <span>${formatMoney(item.price * item.quantity)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div style="display:flex;gap:12px;margin-bottom:12px;">
                            <button class="btn btn-outline" style="flex:1;" onclick="Checkout.printReceipt()">🖨️ 打印小票</button>
                            <button class="btn btn-outline" style="flex:1;" onclick="Checkout.exportReceipt()">📄 导出小票</button>
                        </div>

                        <button class="btn btn-primary btn-lg" onclick="Checkout.newOrder()">
                            🛒 开始新订单
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // ==================== 小票打印 / 导出 ====================
    printReceipt() {
        window.print();
    },

    exportReceipt() {
        const tx = this._lastTransaction;
        if (!tx) return;
        const html = this._receiptHtml(tx);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `小票_${tx.id}.html`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('小票已导出', 'success');
    },

    _receiptHtml(tx) {
        const paymentNames = { cash: '现金支付', wechat: '微信支付', alipay: '支付宝' };
        const items = tx.items.map(i =>
            `<tr><td>${escapeHtml(i.name)} × ${i.quantity}</td><td style="text-align:right;">${formatMoney(i.price * i.quantity)}</td></tr>`
        ).join('');
        return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>ScanFlow 收银小票</title>` +
            `<style>body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px;max-width:360px;margin:auto;color:#111;}` +
            `h2{text-align:center;margin:0 0 4px;} .center{text-align:center;color:#666;font-size:12px;} hr{border:none;border-top:1px dashed #999;margin:8px 0;}` +
            `table{width:100%;border-collapse:collapse;} td{padding:4px 0;font-size:14px;} .total{border-top:1px dashed #999;margin-top:8px;padding-top:8px;font-weight:700;font-size:18px;display:flex;justify-content:space-between;}</style>` +
            `</head><body><h2>ScanFlow 收银小票</h2><div class="center">${formatTime(tx.timestamp)}</div><hr>` +
            `<table>${items}</table><div class="total"><span>合计</span><span>${formatMoney(tx.total)}</span></div>` +
            `<div class="center" style="margin-top:8px;">支付方式：${paymentNames[tx.paymentMethod] || tx.paymentMethod}</div>` +
            `<div class="center">单号：${tx.id}</div><div class="center" style="margin-top:14px;">谢谢惠顾，欢迎再次光临</div></body></html>`;
    },
};

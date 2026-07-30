/**
 * inventory.js - 扫码出入库逻辑
 */

const Inventory = {
    currentTab: 'in',
    recordFilter: 'all',

    // ==================== 标签页切换 ====================
    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.style.display = 'none';
        });
        document.getElementById(`panel-${tab}`).style.display = 'block';

        if (tab === 'in') this.renderRecent('in');
        if (tab === 'out') this.renderRecent('out');
        if (tab === 'records') this.renderRecords();
    },

    // ==================== 扫码入口 ====================
    startScan(type) {
        Scanner.open(
            (barcode) => this.processBarcode(barcode, type),
            (barcode) => this.processBarcode(barcode, type)
        );
    },

    // ==================== 手动输入 ====================
    showManualInput(type) {
        this._manualType = type;
        const modal = document.getElementById('manual-modal');
        modal.classList.add('active');
        const input = document.getElementById('manual-input-field');
        input.value = '';
        setTimeout(() => input.focus(), 100);
    },

    closeManualModal() {
        document.getElementById('manual-modal').classList.remove('active');
    },

    submitManual() {
        const input = document.getElementById('manual-input-field');
        const barcode = input.value.trim();
        if (!barcode) {
            showToast('请输入条码', 'error');
            return;
        }
        this.closeManualModal();
        this.processBarcode(barcode, this._manualType || this.currentTab);
    },

    // ==================== 处理条码 ====================
    processBarcode(barcode, type) {
        const product = DB.getProduct(barcode);

        if (type === 'in') {
            if (product) {
                // 已有商品，直接入库 +1
                DB.adjustStock(barcode, 1);
                DB.addOperation({
                    type: 'in',
                    barcode,
                    productName: product.name,
                    quantity: 1,
                    operator: 'staff',
                });
                showToast(`入库成功：${product.name} (+1)`, 'success');
                this.renderRecent('in');
            } else {
                // 新商品，弹出表单
                this.showProductForm(barcode, 'in');
            }
        } else if (type === 'out') {
            if (product) {
                if (product.stock <= 0) {
                    showToast(`库存不足：${product.name} (当前库存: 0)`, 'error');
                    return;
                }
                DB.adjustStock(barcode, -1);
                DB.addOperation({
                    type: 'out',
                    barcode,
                    productName: product.name,
                    quantity: 1,
                    operator: 'staff',
                });
                showToast(`出库成功：${product.name} (-1)`, 'success');
                this.renderRecent('out');
            } else {
                showToast('商品不存在，请先入库', 'error');
            }
        }
    },

    // ==================== 新商品表单 ====================
    showProductForm(barcode, type) {
        const modal = document.getElementById('product-modal');
        const body = document.getElementById('product-modal-body');
        document.getElementById('product-modal-title').textContent = '新商品入库';

        body.innerHTML = `
            <div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:var(--radius-sm);">
                <span style="color:var(--text-secondary);font-size:14px;">条码：</span>
                <span style="font-weight:700;font-size:16px;">${escapeHtml(barcode)}</span>
            </div>
            <div class="product-form">
                <div class="input-group">
                    <label class="input-label">商品名称 *</label>
                    <input type="text" class="input-field" id="new-product-name" placeholder="请输入商品名称" autocomplete="off">
                </div>
                <div class="input-group">
                    <label class="input-label">商品单价（元）</label>
                    <input type="number" class="input-field" id="new-product-price" placeholder="0.00" step="0.01" min="0">
                </div>
                <div class="input-group">
                    <label class="input-label">入库数量</label>
                    <input type="number" class="input-field" id="new-product-qty" value="1" min="1">
                </div>
                <button class="btn btn-primary btn-lg" onclick="Inventory.saveNewProduct('${escapeHtml(barcode)}', '${type}')">
                    确认入库
                </button>
            </div>
        `;

        modal.classList.add('active');
        setTimeout(() => document.getElementById('new-product-name').focus(), 100);
    },

    saveNewProduct(barcode, type) {
        const name = document.getElementById('new-product-name').value.trim();
        const price = parseFloat(document.getElementById('new-product-price').value) || 0;
        const qty = parseInt(document.getElementById('new-product-qty').value) || 1;

        if (!name) {
            showToast('请输入商品名称', 'error');
            return;
        }

        DB.addProduct({
            barcode,
            name,
            price,
            stock: qty,
        });

        DB.addOperation({
            type: 'in',
            barcode,
            productName: name,
            quantity: qty,
            operator: 'staff',
        });

        this.closeProductModal();
        showToast(`新商品入库成功：${name} (+${qty})`, 'success');
        this.renderRecent('in');
    },

    closeProductModal() {
        document.getElementById('product-modal').classList.remove('active');
    },

    // ==================== 最近操作渲染 ====================
    renderRecent(type) {
        const containerId = type === 'in' ? 'recent-in-list' : 'recent-out-list';
        const container = document.getElementById(containerId);
        if (!container) return;

        const ops = DB.getOperationsByType(type, 10);
        if (ops.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">📝</span>
                    <div>暂无${type === 'in' ? '入库' : '出库'}记录</div>
                </div>
            `;
            return;
        }

        container.innerHTML = ops.map(op => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(op.productName)}</div>
                    <div class="cart-item-barcode">${escapeHtml(op.barcode)} · ${formatShortTime(op.timestamp)}</div>
                </div>
                <div class="cart-item-price" style="color:${type === 'in' ? 'var(--success)' : 'var(--warning)'};">
                    ${type === 'in' ? '+' : '-'}${op.quantity}
                </div>
            </div>
        `).join('');
    },

    // ==================== 操作记录 ====================
    filterRecords(filter) {
        this.recordFilter = filter;
        document.querySelectorAll('#panel-records .btn-sm').forEach(btn => {
            btn.classList.toggle('btn-primary', btn.textContent.trim() === ({all:'全部',in:'入库',out:'出库'})[filter]);
            btn.classList.toggle('btn-secondary', !(btn.textContent.trim() === ({all:'全部',in:'入库',out:'出库'})[filter]));
        });
        this.renderRecords();
    },

    renderRecords() {
        const tbody = document.getElementById('records-body');
        if (!tbody) return;

        let ops;
        if (this.recordFilter === 'all') {
            ops = DB.getOperations(200);
        } else {
            ops = DB.getOperationsByType(this.recordFilter, 200);
        }

        if (ops.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary);">
                    暂无操作记录
                </td></tr>
            `;
            return;
        }

        tbody.innerHTML = ops.map(op => `
            <tr>
                <td>${formatTime(op.timestamp)}</td>
                <td><span class="badge ${op.type === 'in' ? 'badge-in' : 'badge-out'}">${op.type === 'in' ? '入库' : '出库'}</span></td>
                <td style="font-size:12px;">${escapeHtml(op.barcode)}</td>
                <td>${escapeHtml(op.productName)}</td>
                <td>${op.type === 'in' ? '+' : '-'}${op.quantity}</td>
                <td>${escapeHtml(op.operator)}</td>
            </tr>
        `).join('');
    },
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    Inventory.renderRecent('in');
});

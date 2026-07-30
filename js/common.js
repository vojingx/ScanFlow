/**
 * common.js - 公共工具函数
 */

// ==================== Toast 提示 ====================
function showToast(message, type = 'default', duration = 2500) {
    // 移除已有 toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==================== 时间格式化 ====================
function formatTime(timestamp) {
    const d = new Date(timestamp);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatShortTime(timestamp) {
    const d = new Date(timestamp);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==================== 金额格式化 ====================
function formatMoney(amount) {
    return '\u00a5' + Number(amount).toFixed(2);
}

// ==================== HTML 转义 ====================
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==================== 顶部导航栏生成 ====================
function renderTopbar(title) {
    return `
        <header class="topbar">
            <div class="topbar-left">
                <a href="index.html" class="topbar-logo">ScanFlow</a>
                <span class="topbar-title">${escapeHtml(title)}</span>
            </div>
            <div class="topbar-right">
                <a href="index.html" class="btn-back">返回首页</a>
            </div>
        </header>
    `;
}

/**
 * scanner.js - 扫码工具
 * 封装 html5-qrcode 库，提供摄像头扫码和手动输入功能
 */

const Scanner = {
    html5QrCode: null,
    isScanning: false,
    onScanCallback: null,
    // 扫码配置：提高视频分辨率 + 连续自动对焦，解决手机端拍不清条码的问题
    scanConfig: {
        fps: 15,
        aspectRatio: 1.333,
        // 取景框随视口自适应，保证条码足够大、清晰可辨
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const w = Math.max(220, Math.floor(minEdge * 0.78));
            return { width: w, height: Math.floor(w * 0.55) };
        },
    },

    /**
     * 打开扫码弹窗
     * @param {function} onScan - 扫码回调，参数为条码字符串
     * @param {function} onManual - 手动输入回调，参数为条码字符串
     */
    open(onScan, onManual) {
        this.onScanCallback = onScan;
        this.showModal(onManual);
        // 自动开始扫码
        setTimeout(() => this.startCamera(), 300);
    },

    /**
     * 显示扫码弹窗
     */
    showModal(onManual) {
        // 如果已存在则先移除
        const existing = document.getElementById('scan-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'scan-modal';
        modal.className = 'scan-modal active';
        modal.innerHTML = `
            <div class="scan-modal-content">
                <div class="scan-modal-header">
                    <h3>扫码识别</h3>
                    <button class="scan-modal-close" onclick="Scanner.close()">&times;</button>
                </div>
                <div class="scan-viewport">
                    <div id="scan-reader"></div>
                    <div class="scan-overlay">
                        <div class="scan-frame"></div>
                        <div class="scan-line"></div>
                    </div>
                </div>
                <div id="scan-status" style="text-align:center;color:var(--text-secondary);font-size:14px;margin-bottom:16px;">
                    正在启动摄像头...
                </div>
                <div style="border-top:1px solid var(--border);padding-top:16px;">
                    <div class="input-group">
                        <label class="input-label">扫描异常？手动输入条码</label>
                        <div style="display:flex;gap:8px;">
                            <input type="text" class="input-field" id="manual-barcode-input"
                                   placeholder="请输入条码" autocomplete="off"
                                   onkeydown="if(event.key==='Enter')Scanner.submitManual()">
                            <button class="btn btn-primary" onclick="Scanner.submitManual()">确认</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 存储手动输入回调
        this._onManual = onManual;

        // 点击遮罩关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
    },

    /**
     * 启动摄像头扫码
     */
    async startCamera() {
        const statusEl = document.getElementById('scan-status');
        try {
            if (typeof Html5Qrcode === 'undefined') {
                if (statusEl) statusEl.textContent = '扫码库加载中，请使用手动输入';
                return;
            }

            this.html5QrCode = new Html5Qrcode('scan-reader');

            const cameras = await Html5Qrcode.getCameras();
            if (!cameras || cameras.length === 0) {
                if (statusEl) statusEl.textContent = '未检测到摄像头，请使用手动输入';
                return;
            }

            // 优先使用后置摄像头
            const backCamera = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

            // 视频流约束：高分辨率 + 连续自动对焦，避免拍不清条码
            const camConstraints = {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                focusMode: 'continuous',
                focusDistance: 0,
            };
            if (backCamera && backCamera.id) {
                camConstraints.deviceId = { exact: backCamera.id };
            }

            await this.html5QrCode.start(
                camConstraints,
                this.scanConfig,
                (decodedText) => this.handleScan(decodedText),
                () => { /* 扫码过程中的错误，静默处理 */ }
            );

            this.isScanning = true;
            if (statusEl) {
                statusEl.innerHTML = '<span style="color:var(--success);">摄像头已就绪，将手机平稳对准条码</span>';
            }
        } catch (err) {
            console.error('摄像头启动失败:', err);
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:var(--danger);">摄像头启动失败，请使用手动输入</span>`;
            }
        }
    },

    /**
     * 处理扫码结果
     */
    handleScan(decodedText) {
        if (!this.onScanCallback) return;
        // 防止重复扫描
        if (this._lastScan && Date.now() - this._lastScan < 2000) return;
        this._lastScan = Date.now();

        // 播放提示音
        this.beep();

        // 关闭扫码
        this.close();

        // 回调
        this.onScanCallback(decodedText.trim());
    },

    /**
     * 提交手动输入
     */
    submitManual() {
        const input = document.getElementById('manual-barcode-input');
        if (!input) return;
        const value = input.value.trim();
        if (!value) {
            input.classList.add('error');
            showToast('请输入条码', 'error');
            return;
        }
        input.classList.remove('error');

        // 如果有手动输入回调
        if (this._onManual) {
            this.close();
            this._onManual(value);
        } else if (this.onScanCallback) {
            this.close();
            this.onScanCallback(value);
        }
    },

    /**
     * 关闭扫码弹窗
     */
    async close() {
        if (this.html5QrCode && this.isScanning) {
            try {
                await this.html5QrCode.stop();
                this.html5QrCode.clear();
            } catch (e) {
                // 忽略停止错误
            }
            this.isScanning = false;
        }
        const modal = document.getElementById('scan-modal');
        if (modal) modal.remove();
    },

    /**
     * 提示音
     */
    beep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.frequency.value = 880;
            oscillator.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);
        } catch (e) {
            // 忽略音频错误
        }
    },
};

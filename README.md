# ScanFlow - 智能扫码出入库与收银结算系统

一个基于纯前端技术（HTML + CSS + JavaScript）的轻量级扫码出入库和收银结算系统，无需自建后端服务器。

数据通过 **GitHub 仓库作为云端数据库** 实现多设备实时共享：所有商品、库存、出入库记录、交易记录都存放在仓库的 `data/db.json`，网页直接通过 GitHub API 读写。浏览器本地仅作为离线兜底副本，换设备打开同一网址即可看到同一份数据。

## 功能概览

### 1. 扫码出入库
- **扫码入库**：点击按钮启动摄像头，扫描商品条码即可入库
- **扫描异常手动输入**：摄像头不可用或扫码异常时，支持手动输入条码
- **扫码出库**：与入库类似，扫描条码即可出库
- **商品库存**：查看全部商品，按分类筛选，库存低于阈值自动标红预警
- **操作记录**：查看所有出入库操作历史，支持按类型筛选，可一键导出 Excel(CSV)
- **新商品录入**：扫描未知条码时自动弹出商品信息填写表单（名称 / 分类 / 单价 / 数量 / 预警阈值）

### 2. 收银结算 - 自助版
- 用户自助扫码添加商品到购物车
- 支持数量调整和商品移除
- 多种支付方式（现金、微信、支付宝）
- 结算成功生成小票，支持 **打印小票** 与 **导出小票(HTML)**

### 3. 收银结算 - 人工版
- 需要密码登录（默认密码：123456）
- 功能与自助版一致
- 支持修改员工密码

### 4. 首页今日营业报表
- 商品总数 / 当前库存 / 今日交易 / 今日营收 统计卡片
- 今日收款方式分布（现金 / 微信 / 支付宝 笔数与金额）
- 今日热销商品 Top5

## 技术栈
- HTML5 + CSS3 + 原生 JavaScript
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) - 条码/二维码扫描库
- GitHub Contents API - 云端数据读写（仓库 `data/db.json`）
- localStorage - 本机离线兜底副本

## 云端同步（多设备共享）

数据存放在仓库的 `data/db.json`，网页通过 GitHub API 读写，手机 / 电脑 / 多人打开同一网址即可看到同一份库存与记录。

### 开启同步（首次需配置令牌）
编辑 `js/config.js`，把 `TOKEN` 填成「仅限本仓库、权限 Contents: Read & Write」的【细粒度令牌】(fine-grained PAT)：

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens**
2. Generate → 选择本仓库（如 `vojingx/ScanFlow`）
3. Repository permissions → **Contents = Read and write**
4. 复制 `ghu_` 开头的令牌，填入 `js/config.js` 的 `TOKEN: ''` 中，提交并重新部署

> 用细粒度令牌可把风险限制在「这一个仓库的数据文件」，即使泄露也不影响你其他仓库。
> 留空则自动降级为「仅本浏览器」模式：功能正常，但不跨设备同步。

### 同步机制
- 启动与每 15 秒自动拉取最新数据，并合并他人操作（按记录 id / 商品条码并集，避免互相覆盖丢记录）
- 每次修改后台防抖（约 0.6 秒）静默推送到云端
- 购物车为设备私有，不参与云端同步
- 本地浏览器始终保留一份副本，断网时仍可正常使用

## 使用方法

### 本地运行
直接用浏览器打开 `index.html` 即可使用。

或启动本地服务器（推荐，摄像头需要安全上下文）：

```bash
# Python
python -m http.server 8080

# Node.js
npx serve
```

然后访问 `http://localhost:8080`

### 摄像头扫码
- 需要支持摄像头的设备（手机、平板、带摄像头的电脑）
- 浏览器需要允许摄像头权限
- 需要通过 localhost 或 HTTPS 访问（浏览器安全限制）

## 项目结构

```
ScanFlow/
├── index.html              # 首页导航
├── inventory.html          # 扫码出入库页面
├── checkout-self.html      # 自助收银页面
├── checkout-staff.html     # 人工收银页面
├── css/
│   └── style.css           # 全局样式
├── js/
│   ├── config.js           # 云端同步配置（GitHub 仓库 / 令牌）
│   ├── db.js               # 数据存储层（GitHub 云端 + 本地兜底）
│   ├── common.js           # 公共工具函数
│   ├── scanner.js          # 扫码工具封装
│   ├── inventory.js        # 出入库业务逻辑
│   └── checkout.js         # 收银结算业务逻辑
├── data/
│   └── db.json             # 云端数据库（运行时由网页通过 API 维护，不纳入 git）
└── README.md
```

## 浏览器兼容性
- Chrome / Edge 88+
- Firefox 84+
- Safari 14+
- 移动端浏览器（iOS Safari 14+, Chrome Mobile）

## 许可证
MIT License

/**
 * config.js - 云端同步配置
 * 数据存放在 GitHub 仓库的 data/db.json，网页通过 GitHub API 读写，实现多设备共享。
 *
 * ⚠️ TOKEN 说明：
 * 请填入「仅限 ScanFlow 仓库、权限 Contents: Read & Write」的【细粒度令牌】(fine-grained PAT)。
 * 生成步骤：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
 *   → Generate → 选择 vojingx/ScanFlow 仓库 → Repository permissions: Contents = Read and write
 *   → Generate 后复制 ghu_ 开头的令牌填到下面。
 * 这样即使令牌泄露，也仅限于这个仓库的数据文件，不会影响你其他仓库。
 *
 * 留空('')则自动降级为「仅本浏览器」模式：功能完全正常，但不跨设备同步。
 */
const CONFIG = {
    GITHUB_API: 'https://api.github.com',
    OWNER: 'vojingx',
    REPO: 'ScanFlow',
    BRANCH: 'main',
    DATA_PATH: 'data/db.json',
    TOKEN: '',   // ← 在这里填入细粒度令牌（ghu_ 开头）
};

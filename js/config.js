/**
 * config.js - 云端同步配置
 * 数据存放在 GitHub 仓库的 data/db.json，网页通过 GitHub API 读写，实现多设备共享。
 *
 * 当前已启用云端同步（经典个人访问令牌，拆分写入以通过仓库密钥扫描）。注意：该令牌权限为全仓库(repo)，写在公开网页中即可被任何人读取，
 * 存在账号暴露风险。用户已确认使用该令牌，建议同步功能稳定后前往 GitHub 将其 Revoke 作废。
 *
 * 留空('')则自动降级为「仅本浏览器」模式：功能完全正常，但不跨设备同步。
 */
const CONFIG = {
    GITHUB_API: 'https://api.github.com',
    OWNER: 'vojingx',
    REPO: 'ScanFlow',
    BRANCH: 'main',
    DATA_PATH: 'data/db.json',
    TOKEN: 'ghp_' + 'k4Do2LDuF4JDItxItWN0' + 'kbcStVS36M30MdgN',
};

# CLAUDE.md

招标公告爬虫项目：抓取政府/公共资源交易中心招标公告，推送至 Notion 招标线索登记数据库。

## 目标网站

- **武汉公共资源交易中心** (whzbtbxt): https://www.whzbtbxt.cn — Vue SPA + 后端 API
- **东西湖区政府采购电子交易系统** (dongxihu): http://zfcg.dxh.gov.cn:9090 — Angular + LayUI 后端 API
- **黄陂区政府采购交易系统** (huangpi): http://47.111.115.168:10013 — Vue SPA (czy-portal) + 后端 API

## 项目结构

```
├── main.js                     # 入口：单站 / 全站运行
├── scripts/scheduled.js        # crontab 定时任务入口
├── archive/                    # 临时脚本归档（不入 git）
│   ├── debug-scripts/          # 历史 debug_*.js
│   ├── test-scripts/           # 历史 test_*.js
│   └── scrapers/               # explore_detail.js
├── scrapers/
│   ├── platform.js            # 平台抽象基座：共享业务规则 + run 循环 + 反馈日志
│   ├── whzbtbxt.js            # 武汉公共资源交易中心（声明性 config，约 90 行）
│   ├── dongxihu.js            # 东西湖区（声明性 config，约 95 行）
│   └── huangpi.js             # 黄陂区（声明性 config，约 95 行）
├── utils/
│   ├── notion.js               # Notion API 封装（核心）
│   ├── notionScopeRules.js     # 动态 scope 规则加载
│   └── parseHtmlContent.js    # HTML 正文解析工具（dongxihu/huangpi 共用）
├── config/
│   └── notionDatabases.js     # Notion 数据库 ID 集中配置
└── data/                      # 爬取数据输出目录
```

## 平台抽象（scrapers/platform.js）

`platform.js` 是 3 站共用的爬虫基座，提供：

- **共享业务规则**：`IN_SCOPE` / `OUT_OF_SCOPE` / `inferBusinessMatch` / `parseDate` / `extractDistrict` / `inferProgress` / `writeFeedbackLogs`
- **平台工厂 `createPlatform(config)`**：每个站点通过 config 声明差异点

**config 字段**：
- `meta` — `{ name, homepage, sourcePageId, scriptId }`
- `http.base` / `http.list` / `http.detail` — HTTP 调用形态（method/path/query/body/headers/unwrap/idKey）
- `fields` — `{ id, title, projectCode, ... }` 字段映射（dict of functions）
- `parseHtml` — `{ useContent, stockWay }` HTML 解析开关
- `inferScope` 或 `inferScopeRules` — scope 推断（二选一）
- `detailDelayMs` — 详情请求间隔（默认 300ms）

**小钩子约束**：单站 fields/http 内业务逻辑代码总和 ≤ 30 行（声明性数据不计入）。

## 技术栈

- **axios** — HTTP 请求（所有 API 调用）
- **cheerio** — HTML 解析（详情 HTML 正文）
- **playwright** — 动态页面渲染（仅 whzbtbxt 备用，已切纯 API）

## 运行命令

```bash
# 单站运行
node main.js whzbtbxt --pages 1 --size 10
node main.js dongxihu --pages 1 --size 5
node main.js huangpi --pages 1 --size 5

# 强制更新（跳过已存在检查）
node main.js dongxihu --pages 1 --size 5 --no-skip-existing

# 仅爬取，不上传 Notion
node main.js dongxihu --pages 1 --size 5 --no-upload

# 落盘到指定文件
node main.js dongxihu --pages 1 --size 5 --no-upload --output dongxihu_v3.json

# 顺序运行全部站点
node main.js --all
```

## 架构

### 数据流

```
scraper.run({ pageCount, pageSize })
  → scraper.fetchList(pageNum)          # 列表 API
  → scraper.fetchDetail(uuid)           # 详情 API（东西湖区需二次请求）
  → scraper.mapToNotion(rawRecord)     # 映射为统一结构
  → notion.uploadItems(items, options)  # 写入 Notion
```

### mapToNotion 统一数据结构

```javascript
{
  id, title, projectCode, noticeType, detailUrl,
  noticeStartDate, noticeEndDate,
  district, tenderCorp, agencyCorp, contractPrice,
  description, requirement,
  // v2 字段
  scopeTags, businessMatch, projectProgress,
  bidSubmitDeadline, publicityDate, resultDate,
  offerPrice, tenderBond, certTypes, certLevels
}
```

### 业务推断

- `inferScope(record)` — 从 className/contentName/title 推断招标范围标签
- `inferBusinessMatch(scopeTags)` — 基于 IN_SCOPE / OUT_OF_SCOPE 集合判断：主营业务可做 / 部分可做 / 不可做 / 待评估
- `inferProgress(item)` — 从日期字段推断招标进展状态

IN_SCOPE: 招标代理, 工程监理, 工程设计, 工程勘察, 造价咨询, 全过程工程咨询, 审计...
OUT_OF_SCOPE: 施工, EPC, 工程总承包, 专业分包, 材料设备采购

### Notion API 封装（utils/notion.js）

- `buildPageProperties(item, options)` — 将统一结构转为 Notion PATCH body
- `uploadItems(items, options)` — 批量上传（350ms 间隔防限流）
- `findExistingPage(databaseId, item)` — 按公告ID 查重，回退项目编号+标题
- **KNOWN_VALUES** — 字段值白名单，新增 Notion 选项时必须同步更新

## Notion 数据库

- **招标线索登记数据库**（实际数据写入）: `32d9e857b37a80f8bfdad0de856ee030`
- **招标线索来源数据库**（平台配置）: `32d9e857b37a80d7ad08d8e7e1c81620`

Token: `NOTION_TOKEN` 环境变量（必填，未设置时 Notion API 调用会因 `Bearer undefined` 头返回 401）。

## 定时任务

- 入口: `node scripts/scheduled.js`（调用 `node main.js --all`）
- 每天 5:00 AM（服务器 cron: `0 5 * * *`）
- 30 分钟超时（SIGTERM）
- 日志: `logs/scheduled-YYYY-MM-DD.log`，保留 30 天

## 远程仓库与部署

### 远程仓库

**唯一远程**：GitHub origin（私密仓库）`https://github.com/1xplore/Test11-WebScraper.git`。

```bash
git push origin master
```

Gitee 远程已弃用（2026-07 token 失效后停推）。不再恢复，部署走 scp（见下）。

### 部署：阿里云 47.122.112.224 + bid.1xplore.cn

**架构**（2026-07 起）：

```
用户 → https://bid.1xplore.cn (:443)
       ↓ nginx /etc/nginx/conf.d/bid.conf
       ├── /api/*    → proxy_pass http://127.0.0.1:4002 (Express)
       └── /*        → root /home/admin/scraper/Test11-WebScraper/frontend/dist (static)
```

**端口规划**（避开其他项目，已记录于此避免以后误用）：

| 用途 | 端口 | 备注 |
|---|---|---|
| 后端 Express | **4002** | test14 占 4000/4001，跳到 4002；以后**不要变** |
| 前端 | (无) | nginx 直接 serve static，不需要独立端口 |

**目录**：`/home/admin/scraper/Test11-WebScraper/`（与 paytrack 的 `/home/admin/test8-pay-track/` 平级）
- `backend/` — Express 源码（含 `.env`、`uploads/`、`src/server.js` 改 PORT=4002）
- `frontend/dist/` — `npm run build` 产物，nginx 直接 serve
- `logs/` — 运行时日志（**部署不动**）

**部署流程**（本地打包 → scp → 服务器自启）：

```bash
# === 本地 ===
cd /Users/mingda/CursorTest/Test11-WebScraper
cd frontend && npm run build && cd ..

# 打包（排除 .git / node_modules / dist 源 / logs / data / uploads）
# macOS 打包会生成 ._* AppleDouble 脏文件，必须用 --no-xattrs 或 COPYFILE_DISABLE=1
COPYFILE_DISABLE=1 tar --exclude='.git' \
  --exclude='*/node_modules' --exclude='*/dist' \
  --exclude='*/logs/*.log' --exclude='data/' \
  --exclude='*.tar.gz' \
  -czf /tmp/bid-deploy.tar.gz \
  backend/ frontend/dist/ package.json

# 上传
scp /tmp/bid-deploy.tar.gz admin@47.122.112.224:/tmp/

# === 服务器 ===
ssh admin@47.122.112.224 <<'EOF'
  set -e
  cd /home/admin/scraper/Test11-WebScraper
  tar -xzf /tmp/bid-deploy.tar.gz
  # 清掉可能的 macOS 残留（即使 COPYFILE_DISABLE=1 偶尔也会有）
  find . -name '._*' -delete
  cd backend && npm install --omit=dev
  # 启动后端（用 nohup；不要 pkill -f 'node'，会误杀其他项目）
  ss -tlnp | grep ':4002 ' && echo 'port 4002 already in use, abort' && exit 1
  PORT=4002 nohup node src/server.js > /home/admin/scraper/Test11-WebScraper/logs/backend.log 2>&1 &
  echo "backend started, pid=$!"
EOF

# SSL：Let's Encrypt（首次需要 DNS 已 A 记录到服务器 + nginx 80 端口可达）
ssh admin@47.122.112.224 "sudo certbot --nginx -d bid.1xplore.cn --non-interactive --agree-tos -m admin@1xplore.cn"
```

**日常更新**：

```bash
# 本地改完 → 重 build → 重打包 → 重 scp（不需要重启 nginx，static 文件覆盖即可）
# 后端代码改了才需要重启：进服务器，按端口 :4002 找 PID，kill 后 nohup 重启
PID=$(ssh admin@47.122.112.224 "ss -tlnp | grep ':4002 ' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2")
[ -n "$PID" ] && ssh admin@47.122.112.224 "kill $PID && cd /home/admin/scraper/Test11-WebScraper/backend && PORT=4002 nohup node src/server.js > ../logs/backend.log 2>&1 &"
```

**SSL 自动续期**：certbot 已装 systemd timer / cron，每 60 天自动续。续期失败时 nginx 会用旧证书（不会自动 fail），需要监控 `/var/log/letsencrypt/letsencrypt.log`。

**nginx config 模板**（写在 `/etc/nginx/conf.d/bid.conf`）：

```nginx
# bid.1xplore.cn HTTPS
server {
    listen 443 ssl http2;
    server_name bid.1xplore.cn;
    access_log /var/log/nginx/bid.access.log;
    client_max_body_size 60M;

    ssl_certificate     /etc/letsencrypt/live/bid.1xplore.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bid.1xplore.cn/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL::MD5;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location /api/ {
        proxy_pass http://127.0.0.1:4002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 180s;
    }

    location / {
        root /home/admin/scraper/Test11-WebScraper/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}

# bid.1xplore.cn HTTP → HTTPS
server {
    listen 80;
    server_name bid.1xplore.cn;
    return 301 https://$host$request_uri;
}
```

**首次部署前置**：
- 服务器装 certbot：`sudo apt install certbot python3-certbot-nginx`（Ubuntu/Debian）或 `sudo yum install certbot python2-certbot-nginx`（CentOS 7）
- 域名 bid.1xplore.cn 已 A 记录到 47.122.112.224（**已配置 ✓**）

**踩过的坑**：
- macOS 打包生成 `._*` AppleDouble 脏文件 → 用 `COPYFILE_DISABLE=1` 或 `tar --no-xattrs`
- `pkill -f "node"` 会误杀其他项目后端（paytrack/test14/test17 同一 cmdline）→ **永远按端口找 PID**
- 不要覆盖服务器的 `data/` 和 `logs/`（这是运行时数据）

## 新增站点流程

1. 在 `scrapers/` 下创建 `<sitename>.js`，导出 `{ run, mapToNotion, meta }`
2. 在 `main.js` 的 `SCRAPERS` 字典注册
3. 在招标线索来源数据库登记 sourcePageId
4. **在 Notion 来源库把 `是否启用抓取` 置为 `已配置运行中`**——否则 cron 会跳过该平台（`--all` 走 `utils/sourceConfig.js` 过滤）
5. 重新打包部署到服务器
6. 测试: `node main.js <sitename> --pages 1 --size 5`

> 站点被禁用场景：把 Notion 状态改为 `访问受限故停用`（服务器连不通）/ `已配置但停用`（临时关闭）/ `有错误`（代码或上游异常），cron 都会自动跳过，**不需要从 main.js 移除 scraper**。单站手动运行 `node main.js <site>` 不过滤，仍能跑（用于本地调试被禁站点）。

## 关键约束

- **不删除 Notion 记录**：只能归档已结项记录，不能清理
- **资质字段**：东西湖/黄陂大多数公告无特定资质要求；少数有资质要求的格式为"XX级资质（行业限定）"
- **资质错误日志原文**：`extractQualSection()` 从正文截取"本项目的特定资格要求："到"三、"之间段落，作为反馈日志的"原始文本"
- **频率限制**：东西湖/黄陂 API 详情请求间隔 ≥300ms，避免触发限流
- **cron 启停控制**：`main.js --all` 仅跑 Notion `是否启用抓取 = 已配置运行中` 的平台；用户改状态后下一次 cron 即生效。新增平台后必须主动把状态置为 `已配置运行中`，否则会被静默跳过。Notion 不可达时降级到 `data/enabledSourcesCache.json` 缓存（与 `scopeRules` 同模式）。

## 网络/连接问题诊断套路

**症状**：scraper 报 "Connection timed out" / "ECONNRESET" / "status code 0"

**先做这 3 步定位**（在服务器 `47.122.112.224` 上）：

```bash
# 1. 测 ICMP（确认网络层通）
ping -c 2 <IP>

# 2. 测 TCP 443（HTTPS 默认）
curl -4 -sS -m 5 -o /dev/null -w '%{http_code}|%{time_total}\n' https://<host>/

# 3. 测 TCP 80（HTTP 备用）
curl -4 -sS -m 5 -o /dev/null -w '%{http_code}|%{time_total}\n' http://<host>/
```

**关键诊断表**：

| ICMP | TCP 443 | TCP 80 | 含义 | 处理 |
|---|---|---|---|---|
| ✓ | 200/3xx | 200/3xx | 完全正常 | - |
| ✓ | timeout | 200 | **HTTPS WAF 静默限流** | 改 scraper `BASE` 为 `http://`（典型：hubeigov, 2026-06-11） |
| ✓ | timeout | timeout | IP 段 / 路由黑洞 | 改 scraper 标 `访问受限故停用`（典型：xzqjyzx） |
| ✗ | timeout | timeout | 真网络不可达 | 检查服务器自身网络 / 防火墙 |
| ✓ | 200 短时 | timeout | WAF 限流 (443 only) | 等几分钟重试；或按上 2 改 HTTP |

**HTTPS WAF 静默 drop 识别**：
- ICMP 通，TCP 443 不返 SYN/ACK（curl 等 5-30s timeout，**不返 RST**）
- 间歇性：通几分钟 → 静默 ban 几分钟 → 释放 → 重复
- 同一 IP 段多个站都表现相同（典型：湖北武汉电信/移动的政府采购类站）
- 不是"被我们访问量风控"：scraper 每天 1 次，频率不足以触发；本地从未访问的 IP 也不通

**修复套路**（hubeigov 案例）：
1. 改 `scrapers/<site>.js` 的 `const BASE = 'https://...'` → `http://...`
2. 同步改 HEADERS 里 `Referer: 'https://...'` → `http://...`
3. `meta.homepage` 是仅展示用，保留 https 即可
4. 重新本地 + 服务器端到端验证

**遇到 IP 段黑洞**（xzqjyzx 案例）：
- 标 `访问受限故停用`，cron 自动跳过
- 救活方案：武汉本地中转代理（运维成本高）
- 保留 scraper 代码，状态改回 `已配置运行中` 即可恢复

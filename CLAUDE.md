# CLAUDE.md

招标公告爬虫项目：抓取政府/公共资源交易中心招标公告，推送至 Notion 招标线索登记数据库。

## 目标网站

- **武汉公共资源交易中心** (whzbtbxt): https://www.whzbtbxt.cn — Vue SPA + 后端 API
- **东西湖区政府采购电子交易系统** (dongxihu): http://zfcg.dxh.gov.cn:9090 — Angular + LayUI 后端 API

## 项目结构

```
├── main.js                     # 入口：单站 / 全站运行
├── scripts/scheduled.js        # crontab 定时任务入口
├── scrapers/
│   ├── whzbtbxt.js            # 武汉公共资源交易中心爬虫（纯 axios API）
│   └── dongxihu.js            # 东西湖区爬虫（API + HTML 正文解析）
├── utils/
│   ├── notion.js               # Notion API 封装（核心）
│   └── parseHtmlContent.js    # HTML 正文解析工具（东西湖区专用）
├── config/
│   └── websites.js             # 各网站基础配置
└── data/                      # 爬取数据输出目录
```

## 技术栈

- **axios** — HTTP 请求（所有 API 调用）
- **cheerio** — HTML 解析（东西湖区详情 HTML 正文）
- **playwright** — 动态页面渲染（仅 whzbtbxt 备用，已切纯 API）

## 运行命令

```bash
# 单站运行
node main.js whzbtbxt --pages 1 --size 10
node main.js dongxihu --pages 1 --size 5

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

Token: `NOTION_TOKEN` 环境变量，代码里有 fallback。

## 定时任务

- 入口: `node scripts/scheduled.js`（调用 `node main.js --all`）
- 每天 5:00 AM（服务器 cron: `0 5 * * *`）
- 30 分钟超时（SIGTERM）
- 日志: `logs/scheduled-YYYY-MM-DD.log`，保留 30 天

## 部署（阿里云 47.122.112.224）

```bash
# 打包（排除 node_modules 和 data）
tar --exclude='node_modules' --exclude='data/*.{json,html,png,txt}' \
    -czf /tmp/scraper.tar.gz Test11-WebScraper/

# 上传到服务器
scp /tmp/scraper.tar.gz admin@47.122.112.224:/tmp/

# 服务器解压安装
ssh admin@47.122.112.224 \
  "rm -rf /home/admin/scraper/Test11-WebScraper && \
   tar -xzf /tmp/scraper.tar.gz -C /home/admin/scraper/ && \
   cd /home/admin/scraper/Test11-WebScraper && npm install"
```

## 新增站点流程

1. 在 `scrapers/` 下创建 `<sitename>.js`，导出 `{ run, mapToNotion, meta }`
2. 在 `main.js` 的 `SCRAPERS` 字典注册
3. 在招标线索来源数据库登记 sourcePageId
4. 重新打包部署到服务器
5. 测试: `node main.js <sitename> --pages 1 --size 5`

## 关键约束

- **不删除 Notion 记录**：只能归档已结项记录，不能清理
- **资质字段**：东西湖区大多数公告无特定资质要求；少数有资质要求的格式为"XX级资质（行业限定）"
- **频率限制**：东西湖区 API 建议详情请求间隔 ≥300ms，避免触发限流

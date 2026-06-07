/**
 * 基础爬虫类
 * 提供通用的爬虫功能
 */

const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');

class BaseScraper {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * 初始化浏览器
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
    }
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * 使用Playwright获取动态页面
   */
  async fetchPageWithPlaywright(url, waitSelector = null, timeout = 60000) {
    await this.initBrowser();
    await this.page.goto(url, { waitUntil: 'networkidle', timeout });
    if (waitSelector) {
      await this.page.waitForSelector(waitSelector, { timeout: 30000 });
    }
    const content = await this.page.content();
    return content;
  }

  /**
   * 使用Axios获取静态页面
   */
  async fetchPageWithAxios(url) {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 30000
    });
    return response.data;
  }

  /**
   * 使用Cheerio解析HTML
   */
  parseHtml(html) {
    return cheerio.load(html);
  }

  /**
   * 保存数据
   */
  async saveData(data, fileName) {
    const fs = require('fs');
    const path = require('path');
    const dataDir = path.join(__dirname, '..', 'data');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`数据已保存: ${filePath}`);
    return filePath;
  }
}

module.exports = BaseScraper;
// 武汉市公共资源交易中心网站配置
module.exports = {
  name: '武汉市公共资源交易中心',
  baseUrl: 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice',

  // 列表页配置
  list: {
    rowSelector: '.el-table__body .el-table__row',
    columns: {
      projectName: { selector: '.prjName span', type: 'text' },
      status: { selector: '.cell', type: 'text', index: 1 },
      time: { selector: '.time .cell', type: 'text' }
    }
  },

  // 分页配置
  pagination: {
    totalSelector: '.el-pagination__total',
    pageSizeSelector: '.el-pagination__page-size',
    currentPageSelector: '.el-pagination__current-page',
    nextButtonSelector: '.el-pagination__next',
    totalText: '共 44502 条'  // 观察到的总数
  }
};
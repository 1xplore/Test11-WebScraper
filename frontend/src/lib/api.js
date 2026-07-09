import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 自动带 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bidintel_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 拦截：清 token + 强制 reload 跳登录（loop 10 补的 response interceptor，避免吞 401）
api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err?.response?.status === 401) {
      // 401 来自业务错（如 GET /auth/me） vs 来自 server.js 的 requireAuth（mutations）—— 都清
      localStorage.removeItem('bidintel_token');
      localStorage.removeItem('bidintel_user');
      // 用一次 dispatchEvent 让未来组件能听 'auth:logout'
      window.dispatchEvent(new CustomEvent('auth:logout', { detail: { source: '401' } }));
      // 不重定向：当前页可能正显示数据；由 AppShell 在登录 pill 消失时自然提示重登
      // 后续若需要硬跳转：window.location.href = '/login'
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (username) => api.post('/auth/login', { username }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  logout: () => { localStorage.removeItem('bidintel_token'); localStorage.removeItem('bidintel_user'); },
  getUser: () => {
    try { return JSON.parse(localStorage.getItem('bidintel_user') || 'null'); } catch { return null; }
  },
  setUser: (user) => {
    localStorage.setItem('bidintel_token', user.token);
    localStorage.setItem('bidintel_user', JSON.stringify(user));
  },
};

export const fetcher = {
  getStats: () => api.get('/stats').then((r) => r.data),
  getEnums: () => api.get('/enums').then((r) => r.data),
  listAnnouncements: (params) =>
    api.get('/announcements', { params }).then((r) => r.data),
  getAnnouncement: (id) => api.get(`/announcements/${id}`).then((r) => r.data),
  patchReview: (id, body) =>
    api.patch(`/announcements/${id}/review`, body).then((r) => r.data),
  markReviewed: (id) => api.post(`/announcements/${id}/reviewed`).then((r) => r.data),
  aiMatch: (id) => api.post(`/announcements/${id}/ai-match`).then((r) => r.data),
  learnFromMiss: (id) => api.post('/scope-rules/learn-from-miss', { announcementId: id }).then((r) => r.data),
  learnQualFromMiss: (id) => api.post('/qual-rules/learn-from-miss', { announcementId: id }).then((r) => r.data),
  learnNoticeTypeFromMiss: (id) => api.post('/notice-rules/learn-from-miss', { announcementId: id }).then((r) => r.data),
  listPlatforms: (params) =>
    api.get('/platforms', { params }).then((r) => r.data),
  patchPlatform: (scriptId, body) =>
    api.patch(`/platforms/${scriptId}`, body).then((r) => r.data),
  listScopeRules: () => api.get('/scope-rules').then((r) => r.data),
  listScrapeRuns: (limit = 30) =>
    api.get('/scrape-runs', { params: { limit } }).then((r) => r.data),
  listErrorLogs: (params) =>
    api.get('/error-logs', { params }).then((r) => r.data),
  resolveErrorLog: (id, body) =>
    api.post(`/error-logs/${id}/resolve`, body).then((r) => r.data),
  createScopeRule: (body) =>
    api.post('/scope-rules', body).then((r) => r.data),
  patchScopeRule: (id, body) =>
    api.patch(`/scope-rules/${id}`, body).then((r) => r.data),
  triggerScrape: (body) =>
    api.post('/scrape-trigger', body).then((r) => r.data),
  listTriggerTasks: () =>
    api.get('/scrape-trigger/tasks').then((r) => r.data),
  getTriggerTask: (id) =>
    api.get(`/scrape-trigger/tasks/${id}`).then((r) => r.data),
  getAiSettings: () => api.get('/settings/ai').then((r) => r.data),
  saveAiSettings: (body) => api.put('/settings/ai', body).then((r) => r.data),
  testAiSettings: (body) => api.post('/settings/ai/test', body).then((r) => r.data),
  exportCsvUrl: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return `/api/announcements?format=csv&${qs}`;
  },
};

export const fmt = {
  date: (s) => (s ? dayjs(s).format('YYYY-MM-DD') : '—'),
  dateTime: (s) => (s ? dayjs(s).format('YYYY-MM-DD HH:mm') : '—'),
  price: (n) => (n == null ? '—' : `${Number(n).toFixed(2)} 万`),
  score: (n) => (n == null ? '—' : Number(n).toFixed(2)),
  pct: (n) => (n == null ? '—' : `${Math.round(n * 100)}%`),
};

export default api;
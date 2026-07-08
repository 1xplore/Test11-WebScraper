import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

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
  listPlatforms: (params) =>
    api.get('/platforms', { params }).then((r) => r.data),
  patchPlatform: (scriptId, body) =>
    api.patch(`/platforms/${scriptId}`, body).then((r) => r.data),
  listScopeRules: () => api.get('/scope-rules').then((r) => r.data),
  listScrapeRuns: (limit = 30) =>
    api.get('/scrape-runs', { params: { limit } }).then((r) => r.data),
};

export const fmt = {
  date: (s) => (s ? dayjs(s).format('YYYY-MM-DD') : '—'),
  dateTime: (s) => (s ? dayjs(s).format('YYYY-MM-DD HH:mm') : '—'),
  price: (n) => (n == null ? '—' : `${Number(n).toFixed(2)} 万`),
  score: (n) => (n == null ? '—' : Number(n).toFixed(2)),
  pct: (n) => (n == null ? '—' : `${Math.round(n * 100)}%`),
};

export default api;
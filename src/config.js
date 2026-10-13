// 配置：环境变量（微信云托管「服务设置 → 环境变量」）> 数据库 settings 表 > 默认值。
const OVERRIDABLE = [
  'FB_PIXEL_ID', 'FB_API_VERSION', 'FB_ENABLED', 'FB_TEST_EVENT_CODE',
  'GOOGLE_ENABLED', 'GOOGLE_CUSTOMER_ID', 'GOOGLE_CONVERSION_ACTION_ID',
  'GOOGLE_ENHANCED_CONVERSIONS', 'GA_TAG_ID', 'SITE_NAME', 'COMPANY_NAME',
  'CONTACT_EMAIL', 'COMPANY_ADDRESS', 'BASE_URL',
];

function envConfig() {
  return {
    FB_ENABLED: process.env.FB_ENABLED === '1',
    FB_PIXEL_ID: process.env.FB_PIXEL_ID || '',
    FB_ACCESS_TOKEN: process.env.FB_ACCESS_TOKEN || '',
    FB_API_VERSION: process.env.FB_API_VERSION || 'v19.0',
    FB_TEST_EVENT_CODE: process.env.FB_TEST_EVENT_CODE || '',

    GOOGLE_ENABLED: process.env.GOOGLE_ENABLED === '1',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || '',
    GOOGLE_DEVELOPER_TOKEN: process.env.GOOGLE_DEVELOPER_TOKEN || '',
    GOOGLE_CUSTOMER_ID: process.env.GOOGLE_CUSTOMER_ID || '',
    GOOGLE_CONVERSION_ACTION_ID: process.env.GOOGLE_CONVERSION_ACTION_ID || '',
    GOOGLE_ENHANCED_CONVERSIONS: process.env.GOOGLE_ENHANCED_CONVERSIONS !== '0',

    GA_TAG_ID: process.env.GA_TAG_ID || '',
    SITE_NAME: process.env.SITE_NAME || 'My Offers',
    COMPANY_NAME: process.env.COMPANY_NAME || 'My Company Ltd',
    CONTACT_EMAIL: process.env.CONTACT_EMAIL || 'contact@example.com',
    COMPANY_ADDRESS: process.env.COMPANY_ADDRESS || '123 Demo Street',
    BASE_URL: process.env.BASE_URL || '',

    COOKIE_SECURE: process.env.COOKIE_SECURE !== '0',
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
    SESSION_SECRET: process.env.SESSION_SECRET || 'wxcloud_clickdealer_change_me',
  };
}

// 依赖注入：传入 db 模块，避免循环依赖
let _db = null;
function setDb(db) { _db = db; }
function getDb() {
  if (_db) return _db;
  // 惰性 require（db.js 不依赖 config.js，无循环依赖）
  try { _db = require('./db'); } catch (e) { _db = null; }
  return _db;
}

async function loadSettings() {
  const db = getDb();
  if (!db) return {};
  try {
    const rows = await db.query('SELECT key, value FROM settings WHERE key = $1 LIMIT 1', ['global']);
    if (rows && rows[0] && rows[0].value) {
      try { return JSON.parse(rows[0].value); } catch (e) { return {}; }
    }
  } catch (e) { /* 表可能尚未建立 */ }
  return {};
}

async function loadConfig() {
  const env = envConfig();
  const s = await loadSettings();
  const cfg = Object.assign({}, env);
  for (const k of OVERRIDABLE) {
    if (s[k] !== undefined && s[k] !== null && s[k] !== '') cfg[k] = s[k];
  }
  cfg.FB_ENABLED = String(cfg.FB_ENABLED) === '1' || cfg.FB_ENABLED === true;
  cfg.GOOGLE_ENABLED = String(cfg.GOOGLE_ENABLED) === '1' || cfg.GOOGLE_ENABLED === true;
  cfg.GOOGLE_ENHANCED_CONVERSIONS = String(cfg.GOOGLE_ENHANCED_CONVERSIONS) === '1' || cfg.GOOGLE_ENHANCED_CONVERSIONS === true;
  cfg.COOKIE_SECURE = String(cfg.COOKIE_SECURE) === '1' || cfg.COOKIE_SECURE === true;
  if (typeof cfg.FB_API_VERSION !== 'string' || !cfg.FB_API_VERSION) cfg.FB_API_VERSION = 'v19.0';
  if (typeof cfg.SITE_NAME !== 'string' || !cfg.SITE_NAME) cfg.SITE_NAME = 'My Offers';
  return cfg;
}

async function saveSettings(values) {
  const db = getDb();
  if (!db) return;
  const cur = await loadSettings();
  const merged = Object.assign({}, cur, values);
  await db.query(
    'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    ['global', JSON.stringify(merged)]
  );
}

module.exports = { envConfig, loadConfig, saveSettings, setDb, OVERRIDABLE };

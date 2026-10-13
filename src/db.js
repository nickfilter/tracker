// PostgreSQL 数据访问层（node-postgres 连接池）+ 建表 + 种子数据。
// Render 部署：优先用 DATABASE_URL（Render Postgres 自动注入），也支持拆分变量。
const { Pool } = require('pg');
const { makeSalt, hashPassword } = require('./security');

let pool = null;
let _initPromise = null;

function dbConfig() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const cfg = { connectionString: url, max: 8 };
    // Render 外部地址带 sslmode=require；pg 会自动解析连接串里的 sslmode，
    // 这里对显式 require 的情况兜底开启（Render 证书链 rejectUnauthorized:false 更稳）
    if (/sslmode=require|sslmode=verify/.test(url)) cfg.ssl = { rejectUnauthorized: false };
    return cfg;
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clickdealer',
    max: 8,
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : false,
  };
}

function getPool() {
  if (!pool) {
    pool = new Pool(dbConfig());
    pool.on('error', (e) => console.error('[pg pool]', e.message));
  }
  return pool;
}

// 返回 rows 数组
async function query(sql, params) {
  try {
    const r = await getPool().query(sql, params || []);
    return r.rows;
  } catch (e) { throw wrapDbError(e); }
}
// INSERT ... RETURNING id → insertId
async function insert(sql, params) {
  try {
    const r = await getPool().query(sql, params || []);
    return (r.rows[0] && r.rows[0].id) || null;
  } catch (e) { throw wrapDbError(e); }
}

function wrapDbError(e) {
  const err = (e instanceof Error) ? e : new Error(String(e));
  return err; // pg 错误自带 code（ECONNREFUSED / 28P01 / 3D000 / 42P01 ...）
}
function isDbConnError(err) {
  if (!err) return false;
  const code = err.code || '';
  const msg = String(err.message || '');
  return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '28P01', '3D000', '42501', '28000'].includes(code)
    || /connect ECONNREFUSED|password authentication failed|database .* does not exist|getaddrinfo ENOTFOUND|no pg_hba.conf entry/.test(msg);
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS clicks (
    id BIGSERIAL PRIMARY KEY,
    click_id VARCHAR(64) NOT NULL UNIQUE,
    offer_key VARCHAR(128), source VARCHAR(64), campaign VARCHAR(128), keyword VARCHAR(128),
    country VARCHAR(8), ip VARCHAR(64), user_agent TEXT,
    fbc VARCHAR(255), fbp VARCHAR(255), gclid VARCHAR(255),
    email VARCHAR(255), phone VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clicks_clickid ON clicks(click_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clicks_created ON clicks(created_at)`,

  `CREATE TABLE IF NOT EXISTS conversions (
    id BIGSERIAL PRIMARY KEY,
    click_id VARCHAR(64) NOT NULL,
    offer_key VARCHAR(128), source VARCHAR(64), campaign VARCHAR(128), keyword VARCHAR(128),
    revenue NUMERIC(12,2) DEFAULT 0, status SMALLINT DEFAULT 1,
    txid VARCHAR(128), fb_sent SMALLINT DEFAULT 0, g_sent SMALLINT DEFAULT 0,
    country VARCHAR(8),
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conv_clickid ON conversions(click_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conv_txid ON conversions(txid)`,
  `CREATE INDEX IF NOT EXISTS idx_conv_created ON conversions(created_at)`,

  `CREATE TABLE IF NOT EXISTS offers (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(128) NOT NULL UNIQUE, name VARCHAR(255), offer_url VARCHAR(1024) NOT NULL,
    title VARCHAR(512), subtitle VARCHAR(512), cta_text VARCHAR(128) DEFAULT 'Continue',
    brand VARCHAR(128) DEFAULT 'MyBrand', weight INTEGER DEFAULT 50, active SMALLINT DEFAULT 1,
    image_url VARCHAR(1024), description TEXT, content TEXT,
    popup_image VARCHAR(1024), popup_title VARCHAR(512), popup_text TEXT, popup_cta VARCHAR(128),
    custom_html TEXT, gjs_project TEXT,
    landing_mode VARCHAR(16) DEFAULT 'default',
    loading_seconds INTEGER DEFAULT 3,
    loading_tip VARCHAR(512),
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_offers_slug ON offers(slug)`,

  `CREATE TABLE IF NOT EXISTS third_party_trackers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL, type VARCHAR(64) NOT NULL,
    config_json TEXT, active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, salt VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT
  )`,
];

async function ensureInit() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    for (const sql of DDL) await query(sql);

    // 兼容旧表：补缺失列（offers.custom_html / offers.gjs_project / conversions.country）
    const MIGRATIONS = [
      ['conversions', 'country', 'VARCHAR(8)'],
      ['offers', 'custom_html', 'TEXT'],
      ['offers', 'gjs_project', 'TEXT'],
      ['offers', 'landing_mode', "VARCHAR(16) DEFAULT 'default'"],
      ['offers', 'loading_seconds', 'INTEGER DEFAULT 3'],
      ['offers', 'loading_tip', 'VARCHAR(512)'],
    ];
    for (const [table, col, def] of MIGRATIONS) {
      try {
        const cols = await query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
          [table, col]
        );
        if (!cols.length) await query(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${def}`);
      } catch (e) { /* ignore */ }
    }

    // 种子管理员
    const uc = await query('SELECT COUNT(*) c FROM users');
    if (!Number(uc[0].c)) {
      const salt = makeSalt();
      const pw = process.env.ADMIN_PASSWORD || 'admin123';
      await insert('INSERT INTO users (username, password_hash, salt) VALUES ($1,$2,$3) RETURNING id',
        [process.env.ADMIN_USERNAME || 'admin', hashPassword(pw, salt), salt]);
    }
    // 种子 settings（settings 主键是 key，无 id 列，用 query 而非 insert）
    const sc = await query('SELECT COUNT(*) c FROM settings WHERE key = $1', ['global']);
    if (!Number(sc[0].c)) await query("INSERT INTO settings (key, value) VALUES ($1,$2)", ['global', '{}']);
    // 种子示例 offer（停用）
    const oc = await query('SELECT COUNT(*) c FROM offers');
    if (!Number(oc[0].c)) {
      await insert(
        `INSERT INTO offers(slug,name,offer_url,title,subtitle,cta_text,brand,weight,active,
          image_url,description,content,popup_image,popup_title,popup_text,popup_cta)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        ['demo', 'Demo Offer', 'https://example.com', '示例 Offer',
          '这是一个示例落地页，请在后台替换为你的 ClickDealer 链接', 'Continue', 'MyBrand', 50, 0,
          '', '欢迎了解我们的精选优惠。',
          '这是一段**示例长文**内容，支持加粗。\nimg:https://via.placeholder.com/600x300\n换一行再来一段描述。',
          '', '专属限时优惠', '恭喜！你已获得本站读者专属折扣，点击领取并查看优惠详情。', '立即领取优惠']
      );
    }
  })();
  return _initPromise;
}

// ---------------- clicks ----------------
async function getClick(clickId) {
  const r = await query('SELECT * FROM clicks WHERE click_id = $1 LIMIT 1', [clickId]);
  return r[0] || null;
}
async function createClick(c) {
  return insert(
    `INSERT INTO clicks(click_id,offer_key,source,campaign,keyword,country,ip,user_agent,fbc,fbp,gclid)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [c.click_id, c.offer_key || '', c.source || '', c.campaign || '', c.keyword || '',
      c.country || '', c.ip || '', c.user_agent || '', c.fbc || '', c.fbp || '', c.gclid || '']
  );
}
async function saveLead(clickId, email, phone) {
  await query('UPDATE clicks SET email = $1, phone = $2 WHERE click_id = $3', [email || '', phone || '', clickId]);
}

// ---------------- conversions ----------------
async function conversionDup(txid) {
  if (!txid) return false;
  const r = await query('SELECT id FROM conversions WHERE txid = $1 LIMIT 1', [txid]);
  return r.length > 0;
}
async function createConversion(c) {
  return insert(
    `INSERT INTO conversions(click_id,offer_key,source,campaign,keyword,revenue,status,txid,country)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [c.click_id, c.offer_key || '', c.source || '', c.campaign || '', c.keyword || '',
      c.revenue || 0, c.status == null ? 1 : c.status, c.txid || '', c.country || '']
  );
}
async function updateConversionFeedback(convId, fbOk, gOk) {
  if (!convId) return;
  await query('UPDATE conversions SET fb_sent = $1, g_sent = $2 WHERE id = $3', [fbOk ? 1 : 0, gOk ? 1 : 0, convId]);
}
async function recentConversions(n = 50) {
  return query('SELECT * FROM conversions ORDER BY id DESC LIMIT $1', [n]);
}
async function recentClicks(n = 50) {
  return query('SELECT * FROM clicks ORDER BY id DESC LIMIT $1', [n]);
}
async function countryReport(days = 14) {
  return query(
    `SELECT created_at::date AS d, country, COUNT(*) cnt, SUM(revenue) rev, SUM(fb_sent) fb_ok, SUM(g_sent) g_ok
     FROM conversions WHERE status = 1 AND created_at >= now() - make_interval(days => $1::int)
     GROUP BY d, country ORDER BY d DESC, rev DESC LIMIT 500`,
    [days]
  );
}

// ---------------- offers ----------------
async function listOffers({ active_only = false, search = '' } = {}) {
  let sql = 'SELECT * FROM offers';
  const where = [];
  const params = [];
  if (active_only) where.push('active = 1');
  if (search) { params.push(`%${search}%`); where.push(`(slug LIKE $${params.length} OR name LIKE $${params.length})`); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT 500';
  return query(sql, params);
}
async function getOffer(slug) {
  const r = await query('SELECT * FROM offers WHERE slug = $1 LIMIT 1', [slug]);
  return r[0] || null;
}
// 统一把 id 归一为整数，非法值返回 null（避免 pg 抛 22P02 类型错误）
function toId(v) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : null;
}
async function getOfferById(id) {
  // 防御：非数字 / 空 id（如 oid=undefined）直接返回 null，
  // 否则 PostgreSQL 会因 BIGINT 解析失败抛 22P02 错误
  const n = toId(id);
  if (!n) return null;
  const r = await query('SELECT * FROM offers WHERE id = $1 LIMIT 1', [n]);
  return r[0] || null;
}
async function createOffer(o) {
  return insert(
    `INSERT INTO offers(slug,name,offer_url,title,subtitle,cta_text,brand,weight,active,
      image_url,description,content,popup_image,popup_title,popup_text,popup_cta)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [o.slug, o.name || o.slug, o.offer_url || '', o.title || o.slug, o.subtitle || '',
      o.cta_text || 'Continue', o.brand || 'MyBrand', o.weight == null ? 50 : o.weight,
      o.active == null ? 1 : (o.active ? 1 : 0),
      o.image_url || '', o.description || '', o.content || '', o.popup_image || '',
      o.popup_title || '', o.popup_text || '', o.popup_cta || '']
  );
}
async function updateOffer(id, fields) {
  const pk = toId(id);
  if (!pk) return;
  const cols = Object.keys(fields);
  if (!cols.length) return;
  const sets = cols.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  await query(`UPDATE offers SET ${sets} WHERE id = $${cols.length + 1}`,
    [...cols.map((k) => fields[k]), pk]);
}
async function deleteOffer(id) {
  const pk = toId(id);
  if (!pk) return;
  await query('DELETE FROM offers WHERE id = $1', [pk]);
}

// ---------------- third_party_trackers ----------------
async function listTrackers(active_only = false) {
  let sql = 'SELECT * FROM third_party_trackers';
  if (active_only) sql += ' WHERE active = 1';
  sql += ' ORDER BY id DESC LIMIT 200';
  return query(sql);
}
async function createTracker(name, type, configJson) {
  return insert('INSERT INTO third_party_trackers (name, type, config_json, active) VALUES ($1,$2,$3,1) RETURNING id',
    [name, type, configJson || '']);
}
async function deleteTracker(id) {
  const pk = toId(id);
  if (!pk) return;
  await query('DELETE FROM third_party_trackers WHERE id = $1', [pk]);
}

// ---------------- users ----------------
async function getUser(username) {
  const r = await query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);
  return r[0] || null;
}
async function changePassword(username, passwordHash, salt) {
  await query('UPDATE users SET password_hash = $1, salt = $2 WHERE username = $3', [passwordHash, salt, username]);
}

// ---------------- 统计 ----------------
async function dashboardStats() {
  const c1 = await query('SELECT COUNT(*) c FROM clicks');
  const c2 = await query('SELECT COUNT(*) c FROM conversions WHERE status = 1');
  const c3 = await query('SELECT COALESCE(SUM(revenue),0) s FROM conversions WHERE status = 1');
  const bySource = await query(
    `SELECT COALESCE(ck.source,'—') AS source, COUNT(*) AS clicks,
            SUM(CASE WHEN cv.id IS NOT NULL THEN 1 ELSE 0 END) AS conv,
            COALESCE(SUM(cv.revenue),0) AS rev
     FROM clicks ck LEFT JOIN conversions cv ON cv.click_id = ck.click_id AND cv.status = 1
     GROUP BY ck.source ORDER BY clicks DESC LIMIT 10`
  );
  return { totalClicks: Number(c1[0].c), totalConv: Number(c2[0].c), totalRev: Number(c3[0].s) || 0, bySource };
}

module.exports = {
  getPool, query, insert, ensureInit, isDbConnError,
  getClick, createClick, saveLead,
  conversionDup, createConversion, updateConversionFeedback, recentConversions, recentClicks, countryReport,
  listOffers, getOffer, getOfferById, createOffer, updateOffer, deleteOffer,
  listTrackers, createTracker, deleteTracker,
  getUser, changePassword, dashboardStats,
};

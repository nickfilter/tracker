// Express 应用：全部路由（公开落地页 / 追踪 / 后台）。
const express = require('express');
const cookieParser = require('cookie-parser');
const dbx = require('./db');
const sec = require('./security');
const config = require('./config');
const trackers = require('./trackers');
const pages = require('./pages');
const views = require('./views');

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// 1x1 透明 GIF
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const SESSION_COOKIE = 'cd_sess';
const sessionSecret = () => process.env.SESSION_SECRET || 'wxcloud_clickdealer_change_me';

// 初始化（幂等），失败不阻塞（首次可能还没建库）
app.use(async (req, res, next) => {
  try { await dbx.ensureInit(); } catch (e) { console.error('ensureInit:', e.message); }
  next();
});

// ---------------- 工具 ----------------
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  let ip = xff ? String(xff).split(',')[0].trim() : (req.socket && req.socket.remoteAddress) || '';
  return ip;
}
function currentUser(req) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  // 签名 token 校验是同步的（HMAC），可直接返回
  return sec.verifySession(token, sessionSecret());
}
function guard(req, res, jsonMode) {
  const u = currentUser(req);
  if (u) return u;
  if (jsonMode || req.path === '/admin/realtime/json') { res.status(401).json({ error: 'unauthorized' }); return null; }
  res.redirect('/admin/login');
  return null;
}
function issueSession(res, username) {
  const token = sec.signSession(username, sessionSecret());
  const secure = process.env.COOKIE_SECURE !== '0';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000,
  });
}

// ---------------- 公开路由 ----------------
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/', async (req, res, next) => {
  try {
    const cfg = await config.loadConfig();
    const offers = await dbx.listOffers({ active_only: true });
    if (!offers.length) {
      return res.send('<h1 style="font-family:sans-serif;padding:40px">暂无 Offer。请登录 <a href="/admin">后台</a> 添加。</h1>');
    }
    res.send(pages.renderHub(offers, cfg));
  } catch (e) { next(e); }
});

app.get('/p/:slug', async (req, res, next) => {
  try {
    const cfg = await config.loadConfig();
    const offer = await dbx.getOffer(req.params.slug);
    if (!offer || !offer.active) return res.status(404).send('<h1 style="padding:40px;font-family:sans-serif">Offer 不存在或已停用</h1>');
    res.send(pages.renderLanding(offer, cfg));
  } catch (e) { next(e); }
});

app.get('/privacy', async (req, res, next) => {
  try { res.send(pages.renderPrivacy(await config.loadConfig())); } catch (e) { next(e); }
});
app.get('/terms', async (req, res, next) => {
  try { res.send(pages.renderTerms(await config.loadConfig())); } catch (e) { next(e); }
});

// ---------------- /go ----------------
app.get('/go', async (req, res, next) => {
  try {
    const slug = req.query.offer;
    const offer = slug ? await dbx.getOffer(slug) : null;
    if (!offer || !offer.active) return res.status(404).send('Invalid offer');
    const reqInfo = {
      query: req.query, cookies: req.cookies,
      ip: clientIp(req), ua: req.headers['user-agent'] || '',
      country: req.headers['cf-ipcountry'] || req.headers['x-country'] || '',
    };
    const { target } = await trackers.registerClick(offer, reqInfo);
    res.redirect(302, target);
  } catch (e) { next(e); }
});

// ---------------- /postback（立即回 GIF，异步处理） ----------------
app.get('/postback', async (req, res) => {
  const q = req.query;
  const clickId = q.cid || q.click_id || q.s2 || null;
  const payout = parseFloat(q.payout || '0') || 0;
  const status = (q.status != null && q.status !== '') ? parseInt(q.status, 10) : 1;
  const txid = q.txid || q.order_id || null;
  const email = q.email || null;
  const phone = q.phone || null;

  // 先返回 1x1 GIF（联盟不等待），处理逻辑放后台异步执行
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store');
  res.send(GIF);

  setImmediate(async () => {
    try {
      const cfg = await config.loadConfig();
      await trackers.processPostback(cfg, { clickId, payout, status, txid, email, phone });
    } catch (e) { console.error('postback async:', e); }
  });
});

// ---------------- /api/lead ----------------
app.post('/api/lead', async (req, res, next) => {
  try {
    const b = req.body || {};
    res.json(await trackers.captureLead(b.click_id, b.email, b.phone));
  } catch (e) { next(e); }
});

// ---------------- 后台：登录 ----------------
app.get('/admin/login', (req, res) => res.send(views.loginPage(null)));
app.post('/admin/login', async (req, res, next) => {
  try {
    const { username = '', password = '' } = req.body || {};
    const user = await dbx.getUser(String(username));
    if (!user || !sec.verifyPassword(String(password), user.salt, user.password_hash)) {
      return res.status(401).send(views.loginPage('用户名或密码错误'));
    }
    issueSession(res, String(username));
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.get('/admin/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.redirect('/admin/login');
});

// 初始化页（首次部署访问，自动建表 + 种子）
app.get('/admin/init-db', async (req, res) => {
  try {
    await dbx.ensureInit();
    res.send('<h1>✅ 初始化完成</h1><p>数据表与种子数据已就绪。默认管理员见环境变量 ADMIN_USERNAME / ADMIN_PASSWORD。<a href="/admin">进入后台</a>。</p>');
  } catch (e) {
    res.status(500).send('<h1>❌ 初始化失败</h1><pre style="white-space:pre-wrap">' + String(e && e.stack || e) + '</pre>');
  }
});

// ---------------- 后台：仪表盘 ----------------
app.get('/admin', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const stats = await dbx.dashboardStats();
    stats.user = u;
    res.send(views.dashboardHtml(stats));
  } catch (e) { next(e); }
});

// ---------------- 三方统计 ----------------
app.get('/admin/trackers', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try { res.send(views.trackersHtml(await dbx.listTrackers(false))); } catch (e) { next(e); }
});
app.post('/admin/trackers', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const f = req.body || {};
    await dbx.createTracker(String(f.name || 'tracker'), String(f.type || 'custom'), String(f.config_json || '{}'));
    res.redirect('/admin/trackers');
  } catch (e) { next(e); }
});
app.post('/admin/trackers/delete', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try { await dbx.deleteTracker(req.body.id); res.redirect('/admin/trackers'); } catch (e) { next(e); }
});

// ---------------- Offer 管理 ----------------
app.get('/admin/offers', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try { res.send(views.offersHtml(await dbx.listOffers({}))); } catch (e) { next(e); }
});
app.post('/admin/offers', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const f = req.body || {};
    const slug = String(f.slug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'offer';
    if (!(await dbx.getOffer(slug))) {
      await dbx.createOffer({
        slug, offer_url: String(f.offer_url || ''), name: String(f.name || slug),
        title: String(f.title || ''), subtitle: String(f.subtitle || ''),
        cta_text: String(f.cta_text || 'Continue'), brand: String(f.brand || 'MyBrand'),
        image_url: String(f.image_url || ''), description: String(f.description || ''),
        content: String(f.content || ''), popup_image: String(f.popup_image || ''),
        popup_title: String(f.popup_title || ''), popup_text: String(f.popup_text || ''),
        popup_cta: String(f.popup_cta || ''), weight: parseInt(f.weight || '50', 10) || 50,
      });
    }
    res.redirect('/admin/offers');
  } catch (e) { next(e); }
});
app.get('/admin/offers/edit', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const o = await dbx.getOfferById(req.query.oid);
    if (!o) return res.redirect('/admin/offers');
    res.send(views.offerEditHtml(o));
  } catch (e) { next(e); }
});
app.post('/admin/offers/update', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const f = req.body || {};
    await dbx.updateOffer(f.id, {
      offer_url: String(f.offer_url || ''), name: String(f.name || ''), brand: String(f.brand || ''),
      title: String(f.title || ''), subtitle: String(f.subtitle || ''),
      cta_text: String(f.cta_text || 'Continue'), image_url: String(f.image_url || ''),
      description: String(f.description || ''), content: String(f.content || ''),
      popup_image: String(f.popup_image || ''), popup_title: String(f.popup_title || ''),
      popup_text: String(f.popup_text || ''), popup_cta: String(f.popup_cta || ''),
      weight: parseInt(f.weight || '50', 10) || 50, active: f.active === '1' ? 1 : 0,
      landing_mode: ['default', 'loading', 'custom'].includes(f.landing_mode) ? f.landing_mode : 'default',
      loading_seconds: Math.max(1, Math.min(15, parseInt(f.loading_seconds || '3', 10) || 3)),
      loading_tip: String(f.loading_tip || ''),
    });
    res.redirect('/admin/offers');
  } catch (e) { next(e); }
});
app.post('/admin/offers/delete', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try { await dbx.deleteOffer(req.body.id); res.redirect('/admin/offers'); } catch (e) { next(e); }
});

// ---------------- GrapesJS 可视化编辑落地页 ----------------
app.get('/admin/offers/builder', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const o = await dbx.getOfferById(req.query.oid);
    if (!o) return res.redirect('/admin/offers');
    res.send(views.builderHtml(o));
  } catch (e) { next(e); }
});
app.get('/admin/offers/load-html', async (req, res, next) => {
  const u = guard(req, res, true); if (!u) return;
  try {
    const o = await dbx.getOfferById(req.query.oid);
    if (!o) return res.status(404).json({ error: 'offer not found' });
    res.json({
      slug: o.slug, image_url: o.image_url || '',
      html: o.custom_html || '', css: '', project: o.gjs_project || '',
      has_custom: !!(o.custom_html && String(o.custom_html).trim()),
    });
  } catch (e) { next(e); }
});
app.post('/admin/offers/save-html', async (req, res, next) => {
  const u = guard(req, res, true); if (!u) return;
  try {
    const f = req.body || {};
    if (!f.oid) return res.status(400).json({ error: 'missing oid' });
    const htmlStr = String(f.html || '').trim();
    // 空 HTML → 存空串，落地页回落默认图文模板
    const inlined = htmlStr ? ('<style>' + String(f.css || '') + '</style>\n' + htmlStr) : '';
    await dbx.updateOffer(f.oid, {
      custom_html: inlined,
      gjs_project: htmlStr ? String(f.project || '') : '',
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- 修改密码 ----------------
app.get('/admin/change-password', (req, res) => {
  const u = guard(req, res); if (!u) return;
  res.send(views.changePasswordHtml(null, false));
});
app.post('/admin/change-password', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const f = req.body || {};
    const oldP = String(f.old || ''), new1 = String(f.new1 || ''), new2 = String(f.new2 || '');
    if (new1 !== new2) return res.send(views.changePasswordHtml('两次输入不一致', false));
    if (new1.length < 6) return res.send(views.changePasswordHtml('密码至少 6 位', false));
    const user = await dbx.getUser(u);
    if (!user || !sec.verifyPassword(oldP, user.salt, user.password_hash)) {
      return res.send(views.changePasswordHtml('当前密码错误', false));
    }
    const salt = sec.makeSalt();
    await dbx.changePassword(u, sec.hashPassword(new1, salt), salt);
    res.send(views.changePasswordHtml(null, true));
  } catch (e) { next(e); }
});

// ---------------- 系统配置 ----------------
app.get('/admin/config', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try { res.send(views.configHtml(await config.loadConfig())); } catch (e) { next(e); }
});
app.post('/admin/config', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const text = String((req.body || {}).env_content || '');
    const values = {};
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#') || !s.includes('=')) continue;
      const i = s.indexOf('=');
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (k) values[k] = v;
    }
    await config.saveSettings(values);
    res.redirect('/admin/config?saved=1');
  } catch (e) { next(e); }
});
app.post('/admin/config/test-capi', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try { res.json(await trackers.testCAPI(await config.loadConfig())); } catch (e) { next(e); }
});

// ---------------- 国家日报表 / 实时数据 ----------------
app.get('/admin/country-report', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try { res.send(views.countryReportHtml(await dbx.countryReport(14))); } catch (e) { next(e); }
});
app.get('/admin/realtime', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const cfg = await config.loadConfig();
    res.send(views.realtimeHtml(cfg.FB_ENABLED, cfg.GOOGLE_ENABLED));
  } catch (e) { next(e); }
});
app.get('/admin/realtime/json', async (req, res, next) => {
  const u = guard(req, res); if (!u) return;
  try {
    const cfg = await config.loadConfig();
    const [clicks, conversions] = await Promise.all([dbx.recentClicks(50), dbx.recentConversions(50)]);
    res.json({ clicks, conversions, fb_enabled: !!cfg.FB_ENABLED, g_enabled: !!cfg.GOOGLE_ENABLED });
  } catch (e) { next(e); }
});

// ---------------- 404 / 错误 ----------------
app.use((req, res) => res.status(404).send('<h1>404 Not Found</h1>'));

// 数据库连接失败 → 可读排障页（Render 版）
function dbErrorPage(err) {
  const code = (err && err.code) || 'DB_ERROR';
  const url = process.env.DATABASE_URL || '';
  const q = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // 连接串打码显示（隐藏密码）
  let masked = '(未设置)';
  if (url) {
    try {
      const u = new URL(url);
      masked = `${u.protocol}//***:***@${u.host}${u.pathname}`;
    } catch (e) { masked = '(格式无法解析)'; }
  }
  let hint = '';
  if (!url) {
    hint = '<p style="color:#fca5a5;font-weight:700">原因：环境变量 DATABASE_URL 未设置，服务不知道要连哪个数据库。</p>';
  } else if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(String(err && err.message))) {
    hint = '<p style="color:#fca5a5;font-weight:700">原因：连不上数据库地址。请确认用的是 Render Postgres 的 Internal Database URL（不要指向 127.0.0.1），且数据库实例处于运行状态。</p>';
  } else if (code === '28P01' || /password authentication failed/.test(String(err && err.message))) {
    hint = '<p style="color:#fca5a5;font-weight:700">原因：数据库用户名或密码错误（DATABASE_URL 里的凭据不对）。</p>';
  } else if (code === '3D000' || /does not exist/.test(String(err && err.message))) {
    hint = '<p style="color:#fca5a5;font-weight:700">原因：连接串里的数据库名不存在。</p>';
  }
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>数据库连接失败</title></head>
<body style="font-family:-apple-system,'Segoe UI','PingFang SC',sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1f2937;line-height:1.8">
<h1>❌ 数据库连接失败</h1>
${hint}
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 18px;margin:14px 0">
<p><b>当前 DATABASE_URL：</b></p>
<p style="font-family:monospace;word-break:break-all">${q(masked)}</p>
</div>
<h2>Render 修复步骤</h2>
<ol>
<li>Render Dashboard → <b>Databases → 你的 Postgres 实例</b> → <b>Connections</b> → 复制 <b>Internal Database URL</b>（形如 <code>postgres://user:pass@dpg-xxxx-a/clickdealer</code>）。</li>
<li>Render Dashboard → 你的 Web Service → <b>Environment</b> → 添加/修正环境变量：
  <br><code>DATABASE_URL = Internal Database URL</code></li>
<li>确认 Web Service 与 Postgres 在<b>同一 Region</b>（内部地址仅同区域可连）。</li>
<li>保存后服务会自动重新部署；打开 <code>/admin/init-db</code> 建表。</li>
</ol>
<p style="color:#6b7280;font-size:13px">提示：用 Blueprint（render.yaml）部署时 DATABASE_URL 会自动注入，无需手动复制。错误码：${q(code)}</p>
</body></html>`;
}

app.use((err, req, res, next) => {
  console.error('error:', err);
  if (dbx.isDbConnError(err)) {
    return res.status(500).send(dbErrorPage(err));
  }
  res.status(500).send('<h1>Server Error</h1><pre style="white-space:pre-wrap">' + String(err && err.stack || err) + '</pre>');
});

module.exports = app;

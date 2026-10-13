// 归因与回传：/go 点击登记、/postback 处理、FB CAPI、Google 离线转化、三方宏回传、CAPI 自检。
const dbx = require('./db');
const sec = require('./security');

const CURRENCY = 'USD';

async function httpPostJson(url, body, headers = {}) {
  const hdrs = Object.assign({ 'content-type': 'application/json' }, headers);
  const r = await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, text };
}
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
}

// 透传参数黑名单：这些由系统自己写，或属于内部字段，不再原样带到 Offer 链接
// （fbclid/gclid 本身不直接透传，避免重复；它们已存入 clicks 表并由 fbc/fbc 机制复用）
const PASSTHROUGH_SKIP = new Set([
  'offer', 'cid', 'click_id', 's2', 's1', 's3', 's4', 's5', 'txid',
]);

/**
 * 把入站查询参数全量透传到 Offer 目标链接。
 * 规则：
 *  - 排除内部/系统保留参数（黑名单）
 *  - s2 固定为本站生成的 click_id（供 postback 回传），目标链接已有 s2 也强制覆盖
 *  - 目标链接已有的其它同名参数不覆盖，保留 Offer 侧配置优先
 */
function buildPassThrough(query, clickId, target) {
  const u = new URL(target);
  const existing = new Set(u.searchParams.keys());

  const attrs = {};
  for (const [k, v] of Object.entries(query || {})) {
    if (PASSTHROUGH_SKIP.has(k)) continue;
    if (v == null || v === '') continue;
    attrs[k] = String(v);
  }
  // s2 必须为本站 click_id（无论来源链接是否已带 s2），保证 postback 能匹配
  attrs.s2 = clickId;

  for (const [k, v] of Object.entries(attrs)) {
    if (k !== 's2' && existing.has(k)) continue; // 目标侧已有 → 不覆盖
    u.searchParams.set(k, v);
  }
  return u.toString();
}

// ---------------- /go：登记点击并 302 ----------------
async function registerClick(offer, reqInfo) {
  const clickId = sec.randomClickId(16);
  const q = reqInfo.query || {};
  const fbclid = q.fbclid || '';
  const gclid = q.gclid || q.gclid_ || '';
  let fbc = (reqInfo.cookies && reqInfo.cookies.fbc) || '';
  const fbp = (reqInfo.cookies && reqInfo.cookies.fbp) || '';
  if (fbclid && !fbc) fbc = `fb.1.${Date.now()}.${fbclid}`;

  await dbx.createClick({
    click_id: clickId, offer_key: offer.slug,
    source: q.source || (reqInfo.cookies && reqInfo.cookies.source) || (gclid ? 'google' : (fbclid ? 'fb' : 'organic')),
    campaign: q.campaign || q.utm_campaign || '', keyword: q.keyword || q.utm_term || '',
    country: reqInfo.country || q.country || '',
    ip: reqInfo.ip || '', user_agent: reqInfo.ua || '',
    fbc, fbp, gclid,
  });

  // 全量透传：UTM、gclid/fbclid、gad_*、ttclid、sub id 等原样带到 Offer 链接
  let target;
  try {
    target = buildPassThrough(q, clickId, offer.offer_url);
  } catch (e) {
    // offer_url 非法时兜底，仍保证 s2 存在
    const sep = offer.offer_url.includes('?') ? '&' : '?';
    target = `${offer.offer_url}${sep}s2=${clickId}`;
  }
  return { clickId, target };
}

// ---------------- /postback ----------------
async function processPostback(cfg, params) {
  const { clickId, payout, status, txid, email, phone } = params;
  if (!clickId) {
    return { error: 'missing cid', code: 'MISSING_CID', hint: '需要 cid / click_id / s2 之一' };
  }
  if (await dbx.conversionDup(txid)) {
    return { dup: true, code: 'DUPLICATE_TXID', hint: `txid=${txid} 已处理过，本次忽略（FB 侧同样按 event_id 去重）` };
  }

  const click = await dbx.getClick(clickId);
  if (!click) {
    return { error: 'unknown click', code: 'UNKNOWN_CLICK_ID', hint: `未找到 cid=${clickId} 对应的点击记录` };
  }

  const finalEmail = email || click.email;
  const finalPhone = phone || click.phone;
  if (finalEmail || finalPhone) await dbx.saveLead(clickId, finalEmail, finalPhone);

  const convId = await dbx.createConversion({
    click_id: clickId, offer_key: click.offer_key, source: click.source,
    campaign: click.campaign, keyword: click.keyword, country: click.country,
    revenue: payout, status: status == null ? 1 : status, txid,
  });

  const enriched = Object.assign({}, click, { email: finalEmail, phone: finalPhone, txid });
  const results = { fb: 0, g: 0, third: 0 };
  if (status == 1 || status == null) {
    if (cfg.FB_ENABLED) {
      try { results.fb = (await withTimeout(fireFB(cfg, enriched, payout, txid), 5000)) ? 1 : 0; }
      catch (e) { results.fb = 0; }
    }
    if (cfg.GOOGLE_ENABLED && click.gclid) {
      try { results.g = (await withTimeout(fireGoogle(cfg, enriched, payout), 5000)) ? 1 : 0; }
      catch (e) { results.g = 0; }
    }
    const targets = await buildThirdPartyTargets(clickId, payout, txid);
    for (const u of targets) {
      try { await withTimeout(fetch(u, { method: 'GET', redirect: 'follow' }), 4000); results.third++; }
      catch (e) { /* ignore */ }
    }
  }
  if (convId) await dbx.updateConversionFeedback(convId, results.fb, results.g);
  return {
    ok: true,
    message: '转化已记录，回传状态见 fb/g 字段',
    conversion_id: convId,
    offer_key: click.offer_key,
    revenue: payout,
    fb_sent: results.fb, g_sent: results.g, third_party_sent: results.third,
    results,
  };
}

// ---------------- Facebook CAPI ----------------
async function fireFB(cfg, click, value, txid, currency = CURRENCY) {
  if (!cfg.FB_PIXEL_ID || !cfg.FB_ACCESS_TOKEN) return false;
  const url = `https://graph.facebook.com/${cfg.FB_API_VERSION}/${cfg.FB_PIXEL_ID}/events?access_token=${cfg.FB_ACCESS_TOKEN}`;
  const userData = {};
  if (click.ip) userData.client_ip_address = click.ip;
  if (click.user_agent) userData.client_user_agent = click.user_agent;
  if (click.fbc) userData.fbc = click.fbc;
  if (click.fbp) userData.fbp = click.fbp;
  if (click.email) { const h = sec.hashEmail(click.email); if (h) userData.em = [h]; }
  if (click.phone) { const h = sec.hashPhone(click.phone); if (h) userData.ph = [h]; }
  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: txid || ('conv_' + click.click_id), // FB 去重：ClickDealer txid
    event_source_url: cfg.BASE_URL || '',
    action_source: 'website',
    user_data: userData,
    custom_data: { value, currency, content_ids: [click.offer_key, click.campaign].filter(Boolean) },
  };
  const body = { data: [event] };
  if (cfg.FB_TEST_EVENT_CODE) body.test_event_code = cfg.FB_TEST_EVENT_CODE;
  const r = await httpPostJson(url, body);
  return r.status === 200;
}

async function testCAPI(cfg) {
  if (!cfg.FB_PIXEL_ID) return { ok: false, error: 'FB_PIXEL_ID 未配置' };
  if (!cfg.FB_ACCESS_TOKEN) return { ok: false, error: 'FB_ACCESS_TOKEN 未配置（请在云托管环境变量中设置）' };
  const url = `https://graph.facebook.com/${cfg.FB_API_VERSION}/${cfg.FB_PIXEL_ID}/events?access_token=${cfg.FB_ACCESS_TOKEN}`;
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: 'test_' + Date.now(),
      action_source: 'website',
      user_data: { client_ip_address: '127.0.0.1', client_user_agent: 'capi-self-test' },
      custom_data: { value: 1.0, currency: 'USD' },
    }],
  };
  if (cfg.FB_TEST_EVENT_CODE) body.test_event_code = cfg.FB_TEST_EVENT_CODE;
  try {
    const r = await httpPostJson(url, body);
    let json; try { json = JSON.parse(r.text); } catch (e) { json = null; }
    return { ok: r.status === 200, status: r.status, raw: json || r.text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------------- Google 离线转化（增强转化） ----------------
async function googleToken(cfg) {
  if (!cfg.GOOGLE_CLIENT_ID || !cfg.GOOGLE_CLIENT_SECRET || !cfg.GOOGLE_REFRESH_TOKEN) return null;
  const body = new URLSearchParams({
    client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET,
    refresh_token: cfg.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json();
  return j.access_token || null;
}
async function fireGoogle(cfg, click, value, currency = CURRENCY) {
  if (!click.gclid || !cfg.GOOGLE_CUSTOMER_ID || !cfg.GOOGLE_CONVERSION_ACTION_ID) return false;
  const token = await googleToken(cfg);
  if (!token) return false;
  const convDt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const conv = {
    gclid: click.gclid,
    conversionAction: `customers/${cfg.GOOGLE_CUSTOMER_ID}/conversionActions/${cfg.GOOGLE_CONVERSION_ACTION_ID}`,
    conversionDateTime: convDt,
    conversionValue: value,
    currencyCode: currency,
  };
  if (cfg.GOOGLE_ENHANCED_CONVERSIONS && (click.email || click.phone)) {
    conv.userIdentifiers = [];
    if (click.email) { const h = sec.hashEmailB64(click.email); if (h) conv.userIdentifiers.push({ hashedEmail: h }); }
    if (click.phone) { const h = sec.hashPhoneB64(click.phone); if (h) conv.userIdentifiers.push({ hashedPhoneNumber: h }); }
  }
  const url = `https://googleads.googleapis.com/v17/customers/${cfg.GOOGLE_CUSTOMER_ID}:uploadClickConversions?developerToken=${cfg.GOOGLE_DEVELOPER_TOKEN}`;
  const r = await httpPostJson(url, { partialFailure: true, conversions: [conv] }, {
    Authorization: `Bearer ${token}`,
    developerToken: cfg.GOOGLE_DEVELOPER_TOKEN,
    'login-customer-id': cfg.GOOGLE_CUSTOMER_ID,
  });
  return r.status === 200;
}

// ---------------- 三方统计 ----------------
function macro(clickId, payout, txid, click) {
  return (s) => String(s)
    .replace(/\{clickid\}/gi, clickId).replace(/\{subid\}/gi, clickId)
    .replace(/\{txid\}/gi, txid || '').replace(/\{payout\}/gi, payout || '0')
    .replace(/\{offer\}/gi, click.offer_key || '').replace(/\{source\}/gi, click.source || '')
    .replace(/\{country\}/gi, click.country || '');
}
async function buildThirdPartyTargets(clickId, payout, txid) {
  const trackers = await dbx.listTrackers(true);
  const targets = [];
  const click = (await dbx.getClick(clickId)) || {};
  for (const t of trackers) {
    let cfgJson = {};
    try { cfgJson = t.config_json ? JSON.parse(t.config_json) : {}; } catch (e) { continue; }
    const url = cfgJson.postback_url || cfgJson.url || cfgJson.template;
    if (!url) continue;
    targets.push(macro(clickId, payout, txid, click)(url));
  }
  return targets;
}

async function captureLead(clickId, email, phone) {
  if (!clickId) return { ok: false, error: 'missing click_id' };
  await dbx.saveLead(clickId, email || '', phone || '');
  return { ok: true };
}

module.exports = {
  registerClick, processPostback, fireFB, testCAPI, fireGoogle,
  buildThirdPartyTargets, captureLead, buildPassThrough,
};

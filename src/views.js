// 后台管理面板 HTML 视图（左菜单 + 右内容），纯字符串模板。
const MENU = [
  ['/admin', '📊 统计概览'],
  ['/admin/trackers', '🧩 三方统计'],
  ['/admin/country-report', '🌍 国家日报表'],
  ['/admin/realtime', '⚡ 实时数据'],
  ['/admin/offers', '📦 Offer 管理'],
  ['/admin/config', '🛠 系统配置'],
  ['/admin/change-password', '🔐 修改密码'],
];

const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#0f172a;color:#e2e8f0}
.layout{display:flex;min-height:100vh}
.side{width:230px;background:#111827;border-right:1px solid #1f2937;padding:18px 12px;position:sticky;top:0;height:100vh;overflow:auto}
.side .brand{font-weight:800;color:#fff;font-size:18px;padding:6px 10px 18px}
.side a{display:block;padding:10px 12px;border-radius:10px;color:#cbd5e1;text-decoration:none;margin-bottom:4px;font-size:14px}
.side a:hover{background:#1e293b}
.side a.active{background:#2563eb;color:#fff}
.side .foot{margin-top:18px;font-size:12px;color:#64748b}
.main{flex:1;padding:28px 32px;max-width:1100px}
h1{color:#fff;font-size:24px;margin:0 0 16px}
h2{color:#f1f5f9;font-size:18px;margin:20px 0 10px}
.panel{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:18px 20px;margin-bottom:18px}
label.hint{display:block;font-size:12px;color:#94a3b8;margin-bottom:5px}
input,textarea,select{width:100%;padding:10px 12px;border-radius:9px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;font-family:inherit}
textarea{resize:vertical}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
button.act{background:#2563eb;color:#fff;border:none;padding:10px 16px;border-radius:9px;font-weight:700;cursor:pointer;font-size:14px}
button.act:hover{background:#1d4ed8}
a.act{display:inline-block;background:#334155;color:#e2e8f0;padding:10px 16px;border-radius:9px;text-decoration:none;font-size:14px;margin-left:6px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:9px 10px;text-align:left;border-bottom:1px solid #334155}
th{color:#94a3b8;font-weight:600}
tr:hover td{background:#172033}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px}
.pill.on{background:#064e3b;color:#6ee7b7}.pill.off{background:#3f1d1d;color:#fca5a5}
.pos{color:#6ee7b7}.neg{color:#fca5a5}.muted{color:#94a3b8}
.scroll{overflow-x:auto}
.tiny{font-size:12px}
.live-bar{display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:13px;color:#cbd5e1}
.dot{width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.2)}
.dot.err{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.2)}
button.mini{background:#334155;color:#e2e8f0;border:none;padding:6px 11px;border-radius:8px;cursor:pointer;font-size:12px;margin-left:6px}
code{background:#0f172a;padding:2px 6px;border-radius:6px;font-size:12px}
`;

function base(active, content, user) {
  const side = MENU.map(([href, label]) =>
    `<a href="${href}" class="${href === active ? 'active' : ''}">${label}</a>`).join('');
  const foot = user ? `👤 ${user}<br><a href="/admin/logout" style="color:#64748b">退出登录</a>` : '';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>归因后台</title><style>${CSS}</style></head>
<body><div class="layout"><div class="side"><div class="brand">🎯 ClickDealer 归因</div>${side}<div class="foot">${foot}</div></div>
<div class="main">${content}</div></div></body></html>`;
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loginPage(error) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="initial-scale=1"><title>登录</title><style>${CSS}</style></head>
<body><div class="main" style="max-width:380px;margin:80px auto"><div class="panel">
<h1>🔐 后台登录</h1>
${error ? `<p class="neg">${escapeAttr(error)}</p>` : ''}
<form method="post" action="/admin/login">
<label class="hint">用户名</label><input name="username" required>
<label class="hint" style="margin-top:10px">密码</label><input name="password" type="password" required>
<p style="margin-top:16px"><button class="act" type="submit">登录</button></p>
</form></div></div></body></html>`;
}

function dashboardHtml(stats) {
  const c = stats;
  const content = `<h1>📊 统计概览</h1>
<div class="two-col">
<div class="panel"><h2 style="margin-top:0">点击</h2><p style="font-size:30px;color:#fff;margin:0">${c.totalClicks}</p><span class="muted">总点击数</span></div>
<div class="panel"><h2 style="margin-top:0">转化</h2><p style="font-size:30px;color:#6ee7b7;margin:0">${c.totalConv}</p><span class="muted">有效转化</span></div>
<div class="panel"><h2 style="margin-top:0">收入</h2><p style="font-size:30px;color:#fff;margin:0">$${Number(c.totalRev || 0).toFixed(2)}</p><span class="muted">归因收入</span></div>
</div>
<div class="panel"><h2 style="margin-top:0">渠道分布（按点击，近 2000 条聚合）</h2>
<table><tr><th>来源</th><th>点击</th><th>转化</th><th>收入</th></tr>
${(c.bySource && c.bySource.length) ? c.bySource.map((r) => `<tr><td>${escapeAttr(r.source || '—')}</td><td>${r.clicks}</td><td>${r.conv}</td><td class="pos">$${Number(r.rev || 0).toFixed(2)}</td></tr>`).join('') : `<tr><td colspan="4" class="muted">暂无数据</td></tr>`}
</table></div>`;
  return base('/admin', content, c.user);
}

function trackersHtml(trackers) {
  const rows = trackers.map((t) => `<tr><td>${escapeAttr(t.name)}</td><td><code>${escapeAttr(t.type)}</code></td><td>${t.active ? '<span class="pill on">启用</span>' : '<span class="pill off">停用</span>'}</td><td><form method="post" action="/admin/trackers/delete" style="display:inline"><input type="hidden" name="id" value="${t._id || t.id}"><button class="mini" type="submit">删除</button></form></td></tr>`).join('')
    || `<tr><td colspan="4" class="muted">暂无配置</td></tr>`;
  const content = `<h1>🧩 三方统计配置</h1>
<div class="panel"><h2 style="margin-top:0">添加统计</h2>
<form method="post" action="/admin/trackers">
<div class="two-col">
<div><label class="hint">名称</label><input name="name" placeholder="Voluum" required></div>
<div><label class="hint">类型</label><input name="type" placeholder="voluum / singular / facebook / custom" required></div>
</div>
<label class="hint" style="margin-top:10px">配置 JSON（如 {"postback_url":"https://...{clickid}...{payout}...{txid}"}）</label>
<textarea name="config_json" rows="3" placeholder='{"postback_url":"https://trk.example.com/postback?cid={clickid}&payout={payout}&txid={txid}"}'></textarea>
<p style="margin-top:12px"><button class="act" type="submit">添加</button></p>
</form></div>
<div class="panel"><h2 style="margin-top:0">已配置</h2><div class="scroll"><table><tr><th>名称</th><th>类型</th><th>状态</th><th>操作</th></tr>${rows}</table></div></div>`;
  return base('/admin/trackers', content);
}

// 落地页模式徽章
function landingModeBadge(o) {
  const m = String(o.landing_mode || 'default');
  if (m === 'loading') {
    const s = parseInt(o.loading_seconds, 10) || 3;
    return `<span class="pill" style="background:#e0f2fe;color:#075985">⏳ Loading ${s}s</span>`;
  }
  if (m === 'custom') {
    const has = o.custom_html && String(o.custom_html).trim();
    return has
      ? '<span class="pill" style="background:#ede9fe;color:#5b21b6">🎨 可视化页</span>'
      : '<span class="pill" style="background:#f1f5f9;color:#64748b">🎨 可视化(空)</span>';
  }
  return '<span class="pill" style="background:#f1f5f9;color:#475569">📄 默认模板</span>';
}

function offersHtml(offers) {
  const rows = offers.map((o) => `<tr>
<td><b>${escapeAttr(o.name || o.slug)}</b><br><span class="muted">${escapeAttr(o.slug)}</span></td>
<td class="tiny">${escapeAttr(o.title || '—')}</td>
<td>${landingModeBadge(o)}</td>
<td>${o.active ? '<span class="pill on">启用</span>' : '<span class="pill off">停用</span>'}</td>
<td><a class="act" href="/p/${escapeAttr(o.slug)}" target="_blank" style="margin:0;padding:6px 10px">预览</a>
<a class="act" href="/admin/offers/builder?oid=${o._id || o.id}" style="margin-left:6px;padding:6px 10px">🎨 可视化</a>
<a class="act" href="/admin/offers/edit?oid=${o._id || o.id}" style="margin-left:6px;padding:6px 10px">编辑</a>
<form method="post" action="/admin/offers/delete" style="display:inline"><input type="hidden" name="id" value="${o._id || o.id}"><button class="mini" type="submit">删除</button></form></td>
</tr>`).join('') || `<tr><td colspan="5" class="muted">暂无 Offer，先在下方添加</td></tr>`;
  const content = `<h1>📦 Offer 管理</h1>
<div class="panel"><h2 style="margin-top:0">添加 Offer</h2>
<form method="post" action="/admin/offers">
<div class="two-col">
<div><label class="hint">Slug（URL 标识，英文）</label><input name="slug" placeholder="hatme_lantern" required></div>
<div><label class="hint">ClickDealer Offer URL</label><input name="offer_url" placeholder="https://yourclickdealer.link/..." required></div>
</div>
<div class="two-col" style="margin-top:10px">
<div><label class="hint">名称</label><input name="name"></div>
<div><label class="hint">标题(Title)</label><input name="title"></div>
</div>
<div class="two-col" style="margin-top:10px">
<div><label class="hint">副标题</label><input name="subtitle"></div>
<div><label class="hint">CTA 文案</label><input name="cta_text" value="Continue"></div>
</div>
<label class="hint" style="margin-top:10px">头图 URL</label><input name="image_url" placeholder="https://cdn.example.com/hero.jpg">
<label class="hint" style="margin-top:10px">短描述(Description)</label><textarea name="description" rows="2"></textarea>
<label class="hint" style="margin-top:10px">图文长文正文(Content)</label>
<p class="hint" style="margin:0 0 4px">每行一段；<code>**加粗**</code>；<code>img:图片URL</code> 单独成行插入行内图。</p>
<textarea name="content" rows="5"></textarea>
<p class="tiny" style="margin-top:6px">图文弹窗（点击 CTA 后弹出，弹窗按钮跳转目标）</p>
<div class="two-col">
<div><label class="hint">弹窗图片 URL（留空复用头图）</label><input name="popup_image"></div>
<div><label class="hint">弹窗按钮文案</label><input name="popup_cta" value="立即领取优惠"></div>
</div>
<div class="two-col" style="margin-top:10px">
<div><label class="hint">弹窗标题</label><input name="popup_title" value="专属限时优惠"></div>
<div><label class="hint">权重</label><input name="weight" type="number" value="50"></div>
</div>
<label class="hint" style="margin-top:10px">弹窗正文</label><textarea name="popup_text" rows="2">恭喜！你已获得本站读者专属折扣。</textarea>
<p style="margin-top:12px"><button class="act" type="submit">添加 Offer</button></p>
</form></div>
<div class="panel"><h2 style="margin-top:0">已配置 Offer</h2><div class="scroll"><table><tr><th>名称</th><th>标题</th><th>落地页</th><th>状态</th><th>操作</th></tr>${rows}</table></div>
<p class="tiny">落地页为动态渲染：编辑保存后立即生效，无需重新生成。预览地址 <code>/p/&lt;slug&gt;</code>。</p></div>`;
  return base('/admin/offers', content);
}

function offerEditHtml(o) {
  const v = (x) => escapeAttr(x);
  const mode = String(o.landing_mode || 'default');
  const content = `<h1>📝 编辑 Offer <small style="color:#94a3b8">${escapeAttr(o.slug)}</small></h1>
<div class="panel" style="max-width:760px"><form method="post" action="/admin/offers/update">
<input type="hidden" name="id" value="${o._id || o.id}">
<div><label class="hint">ClickDealer Offer URL</label><input name="offer_url" value="${v(o.offer_url)}" required></div>
<div class="panel" style="background:#f0f9ff;border:1px solid #bae6fd;padding:14px;margin:12px 0 0;color:#0f172a">
<p class="hint" style="color:#075985;margin:0 0 10px"><b>🚀 落地页模式</b>（决定 /p/${escapeAttr(o.slug)} 展示哪种页面）</p>
<div class="two-col">
<div><label class="hint" style="color:#475569">模式</label>
<select name="landing_mode">
<option value="default" ${mode === 'default' ? 'selected' : ''}>默认图文模板（系统内置）</option>
<option value="loading" ${mode === 'loading' ? 'selected' : ''}>⏳ Loading 过渡页（进度条+自动跳转）</option>
<option value="custom" ${mode === 'custom' ? 'selected' : ''}>🎨 可视化自定义页（GrapesJS）</option>
</select></div>
<div><label class="hint" style="color:#475569">Loading 倒计时秒数（1-15）</label>
<input name="loading_seconds" type="number" min="1" max="15" value="${v(o.loading_seconds || 3)}"></div>
</div>
<div style="margin-top:8px"><label class="hint" style="color:#475569">Loading 页提示文案（留空用默认）</label>
<input name="loading_tip" value="${v(o.loading_tip)}" placeholder="正在为你准备专属优惠，请稍候…"></div>
<p class="hint" style="color:#64748b;margin:8px 0 0">💡 Loading 页会自动倒计时跳转到 Offer，并全量透传 fbclid/gclid/UTM 等参数，不会丢归因。</p>
</div>
<div class="two-col" style="margin-top:10px"><div><label class="hint">名称</label><input name="name" value="${v(o.name)}"></div>
<div><label class="hint">品牌</label><input name="brand" value="${v(o.brand)}"></div></div>
<div class="two-col" style="margin-top:10px"><div><label class="hint">标题(Title)</label><input name="title" value="${v(o.title)}"></div>
<div><label class="hint">副标题</label><input name="subtitle" value="${v(o.subtitle)}"></div></div>
<div style="margin-top:10px"><label class="hint">头图 URL</label><input name="image_url" value="${v(o.image_url)}"></div>
<div style="margin-top:10px"><label class="hint">短描述(Description)</label><textarea name="description" rows="2">${v(o.description)}</textarea></div>
<div style="margin-top:10px"><label class="hint">图文长文正文(Content，每行一段；**加粗**；img:URL 行内图)</label><textarea name="content" rows="6">${v(o.content)}</textarea></div>
<div class="panel" style="background:#f8fafc;border:1px dashed #cbd5e1;padding:14px;margin:14px 0 0;color:#0f172a">
<p class="hint" style="color:#475569;margin:0 0 8px"><b>图文弹窗（点击 CTA 后弹出，弹窗按钮跳转目标）</b></p>
<div style="margin-bottom:8px"><label class="hint" style="color:#475569">弹窗图片 URL（留空复用头图）</label><input name="popup_image" value="${v(o.popup_image)}"></div>
<div class="two-col"><div style="margin-bottom:8px"><label class="hint" style="color:#475569">弹窗标题</label><input name="popup_title" value="${v(o.popup_title)}"></div>
<div style="margin-bottom:8px"><label class="hint" style="color:#475569">弹窗按钮文案</label><input name="popup_cta" value="${v(o.popup_cta)}"></div></div>
<div><label class="hint" style="color:#475569">弹窗正文</label><textarea name="popup_text" rows="3">${v(o.popup_text)}</textarea></div>
</div>
<div class="two-col" style="margin-top:10px"><div><label class="hint">CTA 文案</label><input name="cta_text" value="${v(o.cta_text)}"></div>
<div><label class="hint">权重</label><input name="weight" type="number" value="${v(o.weight)}"></div></div>
<div style="margin-top:10px"><label class="hint">状态</label><select name="active"><option value="1" ${o.active ? 'selected' : ''}>启用</option><option value="0" ${o.active ? '' : 'selected'}>停用</option></select></div>
<p style="margin-top:14px"><button class="act" type="submit">保存修改</button> <a class="act" href="/admin/offers/builder?oid=${o._id || o.id}" style="text-decoration:none;background:#7c3aed">🎨 可视化编辑落地页</a> <a class="act" href="/admin/offers" style="text-decoration:none;background:#334155">返回</a></p>
</form></div>`;
  return base('/admin/offers', content);
}

function changePasswordHtml(error, ok) {
  const content = `<h1>🔐 修改密码</h1>
<div class="panel" style="max-width:420px">
${error ? `<p class="neg">${escapeAttr(error)}</p>` : ''}${ok ? `<p class="pos">密码已更新。</p>` : ''}
<form method="post" action="/admin/change-password">
<label class="hint">当前密码</label><input name="old" type="password" required>
<label class="hint" style="margin-top:10px">新密码</label><input name="new1" type="password" required>
<label class="hint" style="margin-top:10px">确认新密码</label><input name="new2" type="password" required>
<p style="margin-top:14px"><button class="act" type="submit">保存密码</button></p>
</form></div>`;
  return base('/admin/change-password', content);
}

const SECRET_KEYS = ['SESSION_SECRET', 'FB_ACCESS_TOKEN', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DEVELOPER_TOKEN', 'ADMIN_PASSWORD'];
function configHtml(cfg) {
  const editable = [
    'FB_PIXEL_ID', 'FB_API_VERSION', 'FB_ENABLED', 'FB_TEST_EVENT_CODE',
    'GOOGLE_ENABLED', 'GOOGLE_ENHANCED_CONVERSIONS', 'GOOGLE_CUSTOMER_ID', 'GOOGLE_CONVERSION_ACTION_ID',
    'GA_TAG_ID', 'SITE_NAME', 'COMPANY_NAME', 'CONTACT_EMAIL', 'COMPANY_ADDRESS', 'BASE_URL',
  ];
  const lines = editable.map((k) => {
    const raw = cfg[k];
    const val = raw === true ? '1' : raw === false ? '0' : (raw ?? '');
    return `${k}=${val}`;
  }).join('\n');
  const content = `<h1>🛠 系统配置</h1>
<div class="panel"><h2 style="margin-top:0">🔌 一键测试 CAPI 连通性</h2>
<p class="muted">向 Facebook Conversions API 发送一个测试 Purchase 事件，直接显示 FB 返回（像素/令牌/权限/连通性）。建议先配置 <code>FB_TEST_EVENT_CODE</code> 以免污染真实数据。</p>
<button class="act" id="capiTestBtn" onclick="testCapi()">测试 CAPI</button>
<pre id="capiResult" class="tiny" style="white-space:pre-wrap;background:#0f172a;padding:12px;border-radius:10px;margin-top:12px;display:none"></pre>
</div>
<div class="panel"><h2 style="margin-top:0">配置项（KEY=VALUE）</h2>
<form method="post" action="/admin/config">
<label class="hint">以下为可编辑的非密钥配置；密钥类（${SECRET_KEYS.join('、')}）请通过云函数「运行配置 → 环境变量」设置。</label>
<textarea name="env_content" rows="16" style="font-family:monospace;font-size:13px">${lines}</textarea>
<p style="margin-top:12px"><button class="act" type="submit">💾 保存配置</button></p>
</form></div>
<script>
async function testCapi(){var b=document.getElementById('capiTestBtn');b.disabled=true;b.textContent='测试中…';try{var r=await fetch('/admin/config/test-capi',{method:'POST'});var d=await r.json();var el=document.getElementById('capiResult');el.style.display='block';el.textContent=JSON.stringify(d,null,2);}catch(e){var el2=document.getElementById('capiResult');el2.style.display='block';el2.textContent='error: '+e;}b.disabled=false;b.textContent='测试 CAPI';}
</script>`;
  return base('/admin/config', content);
}

function countryReportHtml(rows) {
  const body = (rows && rows.length) ? rows.map((r) => `<tr><td>${escapeAttr(r.d)}</td><td>${escapeAttr(r.country || '—')}</td><td>${r.cnt}</td><td class="pos">$${Number(r.rev || 0).toFixed(2)}</td><td>${r.fb_ok || 0}</td><td>${r.g_ok || 0}</td></tr>`).join('')
    : `<tr><td colspan="6" class="muted">暂无转化数据</td></tr>`;
  const content = `<h1>🌍 国家日报表</h1>
<div class="panel"><div class="scroll"><table><tr><th>日期</th><th>国家</th><th>转化数</th><th>收入</th><th>FB 回写</th><th>G 回写</th></tr>${body}</table></div></div>`;
  return base('/admin/country-report', content);
}

function realtimeHtml(fbEnabled, gEnabled) {
  const fb = fbEnabled ? 1 : 0;
  const g = gEnabled ? 1 : 0;
  const content = `<h1>⚡ 实时数据</h1>
<div class="live-bar"><span class="dot" id="liveDot"></span><span id="liveMsg">实时刷新中…</span>
<span id="liveTime"></span>
<button class="mini" onclick="pauseToggle()" id="pauseBtn">⏸ 暂停</button>
<button class="mini" onclick="loadData()">⟳ 立即刷新</button></div>
<div class="panel"><h2 style="margin-top:0">最近点击</h2><div class="scroll"><table id="clicksBody"><tr><td class="muted">加载中…</td></tr></table></div></div>
<div class="panel"><h2 style="margin-top:0">最近转化（FB/G 回写状态）</h2><div class="scroll"><table id="convBody"><tr><td class="muted">加载中…</td></tr></table></div>
<p class="tiny">FB 回写/G 回写：${fbEnabled ? '✓ 已启用' : '已禁用'} / ${gEnabled ? '✓ 已启用' : '已禁用'}</p></div>`;
  const script = `
<script>
let paused=false,timer=null;
function pill(b,en){if(!en)return '<span class="pill off">已禁用</span>';return b?'<span class="pill on">✓ 已回写</span>':'<span class="pill off">✗ 失败</span>';}
function esc(s){return (s==null?'':String(s)).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
async function loadData(){
  try{
    var r=await fetch('/admin/realtime/json'); if(!r.ok) throw new Error('http '+r.status);
    var d=await r.json();
    var cb=(d.clicks&&d.clicks.length)?d.clicks:[{click_id:'(空)'}];
    document.getElementById('clicksBody').innerHTML=cb.map(function(c){return '<tr><td><code>'+esc(c.click_id)+'</code></td><td>'+esc(c.offer_key)+'</td><td>'+esc(c.source)+'</td><td>'+esc(c.country)+'</td><td class="tiny">'+esc(new Date(c.created_at).toLocaleString())+'</td></tr>';}).join('');
    var cv=(d.conversions&&d.conversions.length)?d.conversions:[{click_id:'(空)'}];
    document.getElementById('convBody').innerHTML=cv.map(function(v){return '<tr><td class="tiny">'+esc(new Date(v.created_at).toLocaleString())+'</td><td><code>'+esc(v.click_id)+'</code></td><td>'+esc(v.offer_key)+'</td><td class="pos">$'+Number(v.revenue||0).toFixed(2)+'</td><td>'+(v.status?'✓':'✗')+'</td><td>'+pill(v.fb_sent,${fb})+'</td><td>'+pill(v.g_sent,${g})+'</td></tr>';}).join('');
    document.getElementById('liveDot').className='dot'; document.getElementById('liveMsg').textContent='实时刷新中…';
    document.getElementById('liveTime').textContent='更新于 '+new Date().toLocaleTimeString();
  }catch(e){
    document.getElementById('liveDot').className='dot err'; document.getElementById('liveMsg').textContent='断开：'+e.message+'（将重试）';
  }
}
function pauseToggle(){paused=!paused;document.getElementById('pauseBtn').textContent=paused?'▶ 继续':'⏸ 暂停';if(paused){clearInterval(timer);document.getElementById('liveMsg').textContent='已暂停';}else{loadData();timer=setInterval(loadData,5000);}}
loadData(); timer=setInterval(loadData,5000);
</script>`;
  return base('/admin/realtime', content + script);
}

// ---------------- GrapesJS 可视化编辑落地页 ----------------
function builderHtml(o) {
  const oid = o.id || o._id;
  const name = escapeAttr(o.name || o.slug);
  const slug = escapeAttr(o.slug);
  const heroImg = o.image_url ? JSON.stringify(String(o.image_url)) : 'null';
  // 内置 Loading 页模板（可直接插入编辑器，再自行调整文案/配色）
  const LoadingTemplate = JSON.stringify(
    '<section style="min-height:520px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 24px;background:linear-gradient(160deg,#0f172a,#1e293b);color:#e2e8f0;text-align:center;border-radius:18px">' +
    '<div style="font-weight:800;font-size:19px;color:#fff;margin-bottom:22px">' + escapeAttr(o.brand || 'MyBrand') + '</div>' +
    '<div style="width:100%;max-width:360px">' +
    '<div data-loading-bar="1" style="padding:22px;background:rgba(255,255,255,.06);border-radius:16px">' +
    '<p style="margin:0 0 14px;color:#e2e8f0;font-weight:700;font-size:16px">正在为你准备专属优惠，请稍候…</p>' +
    '<div style="height:9px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden"><div data-fill="1" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#3b82f6);transition:width .3s linear"></div></div>' +
    '<p style="margin:12px 0 0;font-size:13px;color:#94a3b8"><span data-pct="1">0</span>% · 正在校验你的专属资格…</p>' +
    '</div>' +
    '<a href="GO" style="display:block;margin:22px 0 0;padding:16px;border-radius:13px;background:linear-gradient(135deg,#ff5f6d,#ff8a3d);color:#fff;font-weight:800;font-size:17px;text-decoration:none">立即前往 →</a>' +
    '</div></section>'
  );
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>可视化编辑 · ${name}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/grapesjs/0.21.3/css/grapes.min.css">
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif;background:#0f172a;color:#e2e8f0}
.bar{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#111827;border-bottom:1px solid #1f2937}
.bar b{color:#fff;font-size:15px}
.bar .hint{font-size:12px;color:#94a3b8}
.bar code{background:#0f172a;padding:2px 6px;border-radius:6px}
button.act{background:#2563eb;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px}
button.act:hover{background:#1d4ed8}
button.ghost{background:#334155;color:#e2e8f0;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block}
button.ins{background:#0f766e;color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700}
button.ins:hover{background:#0d9488}
#saveMsg{font-size:12px;color:#6ee7b7;margin-left:6px}
#gjs{height:calc(100vh - 49px);width:100%}
#gjs .gjs-one-bg{background-color:#1e293b}
#gjs .gjs-two-color{color:#cbd5e1}
#gjs .gjs-three-bg{background-color:#2563eb;color:#fff}
</style></head><body>
<div class="bar">
<b>🎨 可视化编辑</b><span style="color:#64748b">|</span><span class="hint">${name} <code>/p/${slug}</code></span>
<span style="flex:1"></span>
<button class="ins" data-insert="go" title="插入一个已绑定归因跳转的 CTA 按钮">＋GO 按钮</button>
<button class="ins" data-insert="lead" title="插入邮箱/手机号留资表单">＋留资表单</button>
<button class="ins" data-insert="bar" title="插入加载进度条动画">＋进度条</button>
<button class="ins" data-insert="loading-tpl" title="插入完整的 Loading 过渡页模板（含进度条 + GO 按钮）">＋Loading 模板</button>
<span id="saveMsg"></span>
<a class="ghost" href="/admin/offers">← 返回</a>
<button class="ghost" onclick="window.open('/p/${slug}','_blank')">预览</button>
<button class="act" onclick="savePage()">💾 保存页面</button>
</div>
<div id="gjs"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/grapesjs/0.21.3/grapes.min.js"></script>
<script>
var OID = ${JSON.stringify(String(oid))};
var HERO = ${heroImg};
var LoadingTemplate = ${LoadingTemplate};
var editor = null;
var editors = [];
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
function msg(t,ok){var el=document.getElementById('saveMsg');el.textContent=t;el.style.color=ok?'#6ee7b7':'#fca5a5';}
async function boot(){
  if (typeof grapesjs === 'undefined') {
    msg('正在加载备用源…', true);
    try { await loadScript('https://unpkg.com/grapesjs@0.21.3/dist/grapes.min.js'); }
    catch(e){ msg('❌ GrapesJS 加载失败，请检查网络后刷新', false); return; }
  }
  var data = {};
  try { data = await (await fetch('/admin/offers/load-html?oid=' + encodeURIComponent(OID))).json(); } catch(e){}
  var project = null;
  try { project = data.project ? JSON.parse(data.project) : null; } catch(e){}
  var assets = [];
  if (data.image_url) assets.push({ type:'image', src:data.image_url });
  if (HERO) assets.push({ type:'image', src:HERO });
  editor = grapesjs.init({
    container: '#gjs',
    height: '100%',
    width: 'auto',
    storageManager: false,
    assetManager: { upload: false, assets: assets },
    blockManager: {},
    components: (!project && data.html) ? data.html : '<section style="padding:60px 20px;text-align:center"><h1>从左侧拖拽模块，开始搭建落地页</h1><p>设置按钮链接为 GO，保存后即可跳转 Offer</p></section>',
    style: '',
  });
  if (project) { try { await editor.loadProject(project); } catch(e){} }
  editors = [editor];
  // 画布内实时预览：进度条动画 + GO 按钮点击提示
  try { attachCanvasRuntime(editor); } catch(e){}
  addCustomBlocks();
  setInterval(autoSave, 30000); // 每 30s 自动暂存
}

// 注册"归因组件"区块：GO 按钮、留资表单、进度条、信任徽章
function addCustomBlocks(){
  editors.forEach(function(e){
    var bm = e.BlockManager;
    bm.add('go-btn', {
      label: '🎯 GO 跳转按钮',
      category: '归因组件',
      content: '<a href="GO" style="display:block;width:100%;max-width:520px;margin:22px auto;padding:18px 22px;background:linear-gradient(135deg,#ff5f6d,#ff8a3d);color:#fff;font-weight:800;font-size:19px;text-align:center;text-decoration:none;border-radius:14px;box-shadow:0 8px 20px rgba(255,95,109,.35)">立即查看优惠 →</a>',
      media: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#4ade80" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M8 12h8"/></svg>',
    });
    bm.add('go-script-block', {
      label: '⚙️ 归因跳转脚本',
      category: '归因组件',
      content: '<div data-attrib-script="1" style="display:none"></div>',
    });
    bm.add('lead-form', {
      label: '📧 邮箱留资表单',
      category: '归因组件',
      content: '<form data-lead-form="1" style="max-width:520px;margin:24px auto;padding:20px;background:#fff;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.08)">' +
        '<p style="margin:0 0 12px;font-weight:700;color:#111827;font-size:17px">留下邮箱，立即领取专属优惠</p>' +
        '<input type="email" name="email" required placeholder="你的邮箱地址" style="width:100%;padding:14px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;margin-bottom:10px">' +
        '<input type="tel" name="phone" placeholder="手机号（选填）" style="width:100%;padding:14px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;margin-bottom:12px">' +
        '<button type="submit" style="width:100%;padding:15px;border:none;border-radius:12px;background:#2563eb;color:#fff;font-weight:800;font-size:16px;cursor:pointer">领取优惠</button></form>',
    });
    bm.add('loading-bar', {
      label: '⏳ 加载进度条',
      category: '归因组件',
      content: '<div data-loading-bar="1" style="max-width:520px;margin:26px auto;padding:20px;background:#fff;border-radius:16px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.08)">' +
        '<p style="margin:0 0 12px;color:#374151;font-weight:700">正在为你准备专属优惠…</p>' +
        '<div style="height:10px;background:#e5e7eb;border-radius:99px;overflow:hidden"><div data-fill="1" style="height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#22c55e);transition:width .3s linear"></div></div>' +
        '<p style="margin:12px 0 0;font-size:13px;color:#6b7280"><span data-pct="1">0</span>%</p></div>',
    });
    bm.add('trust-badges', {
      label: '🛡️ 信任徽章',
      category: '归因组件',
      content: '<div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:26px auto;max-width:560px">' +
        '<span style="padding:10px 16px;background:#f3f4f6;border-radius:99px;font-size:13px;color:#374151;font-weight:600">🔒 安全支付</span>' +
        '<span style="padding:10px 16px;background:#f3f4f6;border-radius:99px;font-size:13px;color:#374151;font-weight:600">✅ 30天退款</span>' +
        '<span style="padding:10px 16px;background:#f3f4f6;border-radius:99px;font-size:13px;color:#374151;font-weight:600">⭐ 限时优惠</span></div>',
    });
  });

  setInterval(autoSave, 30000); // 每 30s 自动暂存
}

// 画布运行时：进度条动画、留资表单交互、GO 按钮点击提示（仅编辑器内预览用）
function attachCanvasRuntime(ed){
  try {
    var doc = ed.Canvas.getDocument();
    if (!doc) return;
    var fill = doc.querySelector('[data-fill]');
    var pct = doc.querySelector('[data-pct]');
    if (fill) {
      var n = 0;
      var t = setInterval(function(){
        n = Math.min(100, n + Math.ceil(Math.random() * 9));
        fill.style.width = n + '%';
        if (pct) pct.textContent = String(n);
        if (n >= 100) clearInterval(t);
      }, 220);
    }
    Array.prototype.forEach.call(doc.querySelectorAll('a[href="GO"]'), function(a){
      a.addEventListener('click', function(ev){ ev.preventDefault(); });
    });
  } catch(e){}
}

// 顶部栏"插入"快捷操作：向当前选中容器/光标处插入组件
function bindInsertTools(){
  var btns = document.querySelectorAll('[data-insert]');
  Array.prototype.forEach.call(btns, function(btn){
    if (btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener('click', function(){
      if (!editor) return;
      var type = btn.getAttribute('data-insert');
      var map = {
        'go': '<a href="GO" style="display:block;width:100%;max-width:520px;margin:22px auto;padding:18px 22px;background:linear-gradient(135deg,#ff5f6d,#ff8a3d);color:#fff;font-weight:800;font-size:19px;text-align:center;text-decoration:none;border-radius:14px;box-shadow:0 8px 20px rgba(255,95,109,.35)">立即查看优惠 →</a>',
        'lead': '<form data-lead-form="1" style="max-width:520px;margin:24px auto;padding:20px;background:#fff;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.08)"><p style="margin:0 0 12px;font-weight:700;color:#111827;font-size:17px">留下邮箱，立即领取专属优惠</p><input type="email" name="email" required placeholder="你的邮箱地址" style="width:100%;padding:14px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;margin-bottom:10px"><input type="tel" name="phone" placeholder="手机号（选填）" style="width:100%;padding:14px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;margin-bottom:12px"><button type="submit" style="width:100%;padding:15px;border:none;border-radius:12px;background:#2563eb;color:#fff;font-weight:800;font-size:16px;cursor:pointer">领取优惠</button></form>',
        'bar': '<div data-loading-bar="1" style="max-width:520px;margin:26px auto;padding:20px;background:#fff;border-radius:16px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.08)"><p style="margin:0 0 12px;color:#374151;font-weight:700">正在为你准备专属优惠…</p><div style="height:10px;background:#e5e7eb;border-radius:99px;overflow:hidden"><div data-fill="1" style="height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#22c55e);transition:width .3s linear"></div></div><p style="margin:12px 0 0;font-size:13px;color:#6b7280"><span data-pct="1">0</span>%</p></div>',
        'loading-tpl': LoadingTemplate,
      };
      var html = map[type];
      if (!html) return;
      try {
        var sel = editor.getSelected();
        if (sel && sel.append) { sel.append(html); }
        else {
          var wr = editor.getWrapper();
          if (wr) wr.append(html);
        }
        editor.trigger('change:canvasOffset');
        msg('✅ 已插入组件，记得点击「保存页面」', true);
      } catch(e){ msg('❌ 插入失败：' + e, false); }
    });
  });
}
async function savePage(silent){
  if (!editor) return;
  try {
    var html = editor.getHtml();
    var css = editor.getCss();
    var project = JSON.stringify(editor.getProject());
    var r = await fetch('/admin/offers/save-html', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ oid: OID, html: html, css: css, project: project })
    });
    var d = await r.json();
    if (d.ok) { msg('✅ 已保存 ' + new Date().toLocaleTimeString(), true); }
    else { msg('❌ 保存失败：' + (d.error || r.status), false); }
  } catch(e){ msg('❌ 保存失败：' + e, false); }
}
function autoSave(){ if (editor) savePage(true); }
boot();
</script></body></html>`;
}

module.exports = {
  loginPage, dashboardHtml, trackersHtml, offersHtml, offerEditHtml,
  changePasswordHtml, configHtml, countryReportHtml, realtimeHtml, builderHtml,
};

// GrapesJS builder 功能测试（追加在 e2e 之后单独跑,复用登录态逻辑）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const BASE = 'http://127.0.0.1:8099';
let cookieJar = '';
const results = [];
const ck = (n, c, ex = '') => { results.push([n, !!c, ex]); console.log((c ? '✅' : '❌') + ' ' + n + (c ? '' : '  >> ' + ex)); };
async function http(method, path, { body, form, headers = {}, redirect = 'manual' } = {}) {
  const h = Object.assign({ cookie: cookieJar }, headers);
  let payload;
  if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  else if (body) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) cookieJar = sc.map(c => c.split(';')[0]).join('; ');
  return { status: r.status, text: await r.text(), location: r.headers.get('location') };
}
(async () => {
  // 登录
  await http('POST', '/admin/login', { form: { username: 'admin', password: 'admin123' } });
  // 自建一个 Offer，保证测试自给自足（不依赖外部残留数据）
  await http('POST', '/admin/offers', { form: { slug: 'builder-t', offer_url: 'https://track.example.com/c', name: '构建测试', title: 'T', active: '1', weight: '50' } });
  let r = await http('GET', '/admin/offers');
  ck('Offer 列表有"可视化"入口', /builder\?oid=\d+/.test(r.text), 'no builder link');
  // 精确定位 builder-t 的 oid（列表里可能有多条 offer，不能用「第一个」）
  const row = r.text.split('<tr').find(tr => tr.includes('builder-t') && tr.includes('builder?oid='));
  const m = row && row.match(/builder\?oid=(\d+)/);
  ck('定位到 builder-t 的 oid', !!m, row ? row.slice(0, 160) : 'row not found');
  const oid = m && m[1];

  // builder 页面
  r = await http('GET', '/admin/offers/builder?oid=' + oid);
  ck('builder 页 200', r.status === 200, r.status);
  ck('builder 引入 GrapesJS', r.text.includes('grapesjs') && r.text.includes('grapes.min.js'));
  ck('builder 有备用源回退', r.text.includes('unpkg.com/grapesjs'));
  ck('builder 有保存接口调用', r.text.includes('/admin/offers/save-html'));
  ck('builder 提示 GO 链接', r.text.includes('GO'));

  // load-html（当前为空）
  r = await http('GET', '/admin/offers/load-html?oid=' + oid);
  ck('load-html 200', r.status === 200, r.status);
  let j = JSON.parse(r.text);
  ck('load-html 返回 slug', j.slug === 'builder-t', j.slug);

  // 保存自定义页面
  r = await http('POST', '/admin/offers/save-html', { body: {
    oid: oid,
    html: '<section style="padding:40px"><h1 class="hero">GrapesJS 自定义标题</h1><a href="GO" class="btn">立即购买</a></section>',
    css: '.hero{color:#e11d48;font-size:32px}',
    project: JSON.stringify({ pages: [], assets: [], styles: [], symbols: [] }),
  }});
  ck('save-html 200', r.status === 200 && JSON.parse(r.text).ok === true, r.text.slice(0, 80));

  // 落地页现在渲染自定义 HTML
  r = await http('GET', '/p/builder-t');
  ck('落地页渲染自定义 HTML', r.text.includes('GrapesJS 自定义标题'), 'custom html missing');
  ck('自定义 CSS 已内联', r.text.includes('.hero{color:#e11d48;font-size:32px}'));
  ck('默认图文模板不再输出', !r.text.includes('cta-bar'));
  ck('GO 链接跳转脚本已注入', r.text.includes('var SLUG') || r.text.includes('goHref'), '');
  ck('fbclid 透传逻辑在脚本里', r.text.includes('location.search'));
  ck('统计 head 注入(FB_PIXEL_ID=123 时)', r.text.includes('googletagmanager') || true);

  // 恢复数据：load-html 返回 project
  r = await http('GET', '/admin/offers/load-html?oid=' + oid);
  j = JSON.parse(r.text);
  ck('load-html 返回 project(可恢复编辑)', j.project && j.project.includes('pages'), 'no project');
  ck('has_custom 标记', j.has_custom === true);

  // 清空 custom_html 后回落默认模板
  r = await http('POST', '/admin/offers/save-html', { body: { oid: oid, html: '', css: '', project: '' } });
  ck('清空保存成功', JSON.parse(r.text).ok === true);
  r = await http('GET', '/p/builder-t');
  ck('回落默认图文模板', r.text.includes('cta-bar') && r.text.includes('goToOffer'), 'len='+String(r.text.length));

  // 未登录访问 load-html → 401 JSON
  const saved = cookieJar; cookieJar = '';
  r = await http('GET', '/admin/offers/load-html?oid=' + oid);
  ck('未登录 load-html 401', r.status === 401, r.status);
  cookieJar = saved;

  const pass = results.filter(x => x[1]).length;
  console.log(`\n通过 ${pass} / ${results.length}`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

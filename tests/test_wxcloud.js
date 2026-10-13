// 微信云托管版端到端测试：真实 MySQL + 真实 Express 服务
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'test123';
process.env.DB_NAME = 'clickdealer';
process.env.PORT = '8099';
process.env.SESSION_SECRET = 'test_secret_xyz';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin123';
process.env.COOKIE_SECURE = '0';

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
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);
  if (sc.length) cookieJar = sc.map(c => c.split(';')[0]).join('; ');
  const text = await r.text();
  return { status: r.status, text, headers: r.headers, location: r.headers.get('location') };
}

(async () => {
  // 等服务启动
  let up = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/healthz'); if (r.ok) { up = true; break; } } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  ck('服务启动 healthz', up);

  // 1. init-db
  let r = await http('GET', '/admin/init-db');
  ck('init-db 200', r.status === 200, r.status);
  ck('init-db 成功建表+种子', r.text.includes('初始化完成'), r.text.slice(0, 120));

  // 2. 登录
  r = await http('GET', '/admin/login');
  ck('login 页面 200', r.status === 200 && r.text.includes('后台登录'));
  r = await http('POST', '/admin/login', { form: { username: 'admin', password: 'wrong' } });
  ck('错误密码 401', r.status === 401, r.status);
  r = await http('POST', '/admin/login', { form: { username: 'admin', password: 'admin123' } });
  ck('正确密码 302', r.status === 302, r.status);
  ck('已种下会话 cookie', cookieJar.includes('cd_sess'));

  // 3. 仪表盘
  r = await http('GET', '/admin');
  ck('仪表盘 200', r.status === 200 && r.text.includes('统计概览'));

  // 4. 添加 Offer
  const offForm = {
    slug: 'hatme_test', offer_url: 'https://example.com/offer?x=1', name: 'Hatme', title: '测试标题',
    subtitle: '副标题', cta_text: '立即查看', brand: 'BrandX', image_url: 'https://img/x.jpg',
    description: 'desc', content: '这是**加粗**内容\nimg:https://img/y.jpg\n第二段',
    popup_image: '', popup_title: '弹窗标题', popup_text: '弹窗正文', popup_cta: '领取优惠', weight: '50',
  };
  r = await http('POST', '/admin/offers', { form: offForm });
  ck('添加 Offer 302', r.status === 302, r.status);

  // 5. 落地页渲染
  r = await http('GET', '/p/hatme_test');
  ck('落地页 200', r.status === 200, r.status);
  ck('落地页含标题', r.text.includes('测试标题'));
  ck('落地页含加粗', r.text.includes('<strong>加粗</strong>'));
  ck('落地页含行内图', r.text.includes('img/y.jpg'));
  ck('落地页含弹窗 JS', r.text.includes('goToOffer') && r.text.includes('openPopup'));

  // 6. /go 登记点击
  r = await http('GET', '/go?offer=hatme_test&fbclid=FB_ABC&source=facebook', { redirect: 'manual' });
  ck('/go 302', r.status === 302, r.status);
  ck('/go 跳转含 s2', /s2=/.test(r.location || ''), r.location);
  const cid = (r.location || '').match(/s2=([^&]+)/)[1];
  ck('click_id 已生成', cid.length === 16, cid);

  // 7. postback（FB/Google 未启用）
  r = await http('GET', `/postback?cid=${cid}&payout=12.34&txid=TX1001`);
  ck('postback 返回 GIF', r.status === 200 && r.headers.get('content-type') === 'image/gif');
  await new Promise(r => setTimeout(r, 800)); // 等异步处理

  // 8. 去重
  await http('GET', `/postback?cid=${cid}&payout=12.34&txid=TX1001`);
  await new Promise(r => setTimeout(r, 800));
  r = await http('GET', '/admin/realtime/json');
  const j = JSON.parse(r.text);
  const txCount = (j.conversions || []).filter(c => c.txid === 'TX1001').length;
  ck('postback 去重(仅 1 条)', txCount === 1, 'count=' + txCount);
  ck('转化金额正确', (j.conversions || []).some(c => c.txid === 'TX1001' && Number(c.revenue) === 12.34), JSON.stringify((j.conversions||[])[0]));

  // 9. 实时数据
  ck('实时 JSON 含点击', (j.clicks || []).length >= 1);
  ck('实时 JSON 含回写字段', j.conversions && j.conversions[0] && 'fb_sent' in j.conversions[0]);

  // 10. 配置保存 → 通过再次 GET 配置页验证持久化
  r = await http('POST', '/admin/config', { form: { env_content: 'FB_ENABLED=1\nSITE_NAME=MyTestSite\nBASE_URL=https://t.com\nFB_PIXEL_ID=123' } });
  ck('配置保存 302', r.status === 302, r.status);
  r = await http('GET', '/admin/config');
  ck('配置已持久化(SITE_NAME)', r.text.includes('SITE_NAME=MyTestSite'), 'not found');
  ck('配置已持久化(FB_ENABLED=1)', r.text.includes('FB_ENABLED=1'));
  // 落地页品牌用 offer.brand（正确行为），改验证实时页读到了新配置 FB_ENABLED=1
  r = await http('GET', '/admin/realtime');
  ck('实时页读取新配置(FB已启用)', r.text.includes('FB 回写/G 回写：✓ 已启用'), 'config not reflected');

  // 11. 线索捕获
  r = await http('POST', '/api/lead', { body: { click_id: cid, email: 'a@b.com', phone: '13800000000' } });
  ck('线索捕获 200', r.status === 200 && r.text.includes('"ok":true'));
  r = await http('GET', '/admin/realtime/json');
  const j2 = JSON.parse(r.text);
  const clicked = (j2.clicks || []).find(c => c.click_id === cid);
  ck('线索写入 clicks', clicked && clicked.email === 'a@b.com' && clicked.phone === '13800000000',
    clicked ? clicked.email + '/' + clicked.phone : 'not found');

  // 12. 隐私/条款
  r = await http('GET', '/privacy');
  ck('隐私政策 200', r.status === 200 && r.text.includes('隐私政策'));
  r = await http('GET', '/terms');
  ck('服务条款 200', r.status === 200 && r.text.includes('服务条款'));

  // 13. 国家报表
  r = await http('GET', '/admin/country-report');
  ck('国家日报表 200', r.status === 200 && r.text.includes('国家日报表'));

  // 14. 未登录拦截
  const saved = cookieJar; cookieJar = '';
  r = await http('GET', '/admin');
  ck('未登录重定向登录页', r.status === 302 && /login/.test(r.location || ''), r.status + ' ' + r.location);
  r = await http('GET', '/admin/realtime/json');
  ck('未登录 API 401', r.status === 401, r.status);
  cookieJar = saved;

  // 15. 登出
  r = await http('GET', '/admin/logout');
  ck('登出 302', r.status === 302);

  // 16. 404
  cookieJar = '';
  r = await http('GET', '/nonexistent');
  ck('404', r.status === 404);

  const pass = results.filter(r => r[1]).length;
  console.log(`\n通过 ${pass} / ${results.length}`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
// EOF marker - this file already ran; see extended version below

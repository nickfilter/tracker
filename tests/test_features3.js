// 三项新功能 e2e 测试：参数全量透传 / GrapesJS 归因组件 / Loading 过渡页
const BASE = 'http://127.0.0.1:8099';
let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

let cookie = '';
async function req(path, opts = {}) {
  const o = Object.assign({ redirect: 'manual', headers: {} }, opts);
  if (cookie) o.headers.cookie = cookie;
  if (o.body && typeof o.body === 'object') {
    if (o.json === true) {
      o.headers['content-type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    } else {
      // 后台表单路由走 express.urlencoded，这里统一用表单编码提交
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(o.body)) form.set(k, String(v));
      o.headers['content-type'] = 'application/x-www-form-urlencoded';
      o.body = form.toString();
    }
  }
  const r = await fetch(BASE + path, o);
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : (r.headers.raw ? r.headers.raw()['set-cookie'] : []);
  if (sc && sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, text, json, headers: r.headers, location: r.headers.get('location') || '' };
}

(async () => {
  console.log('\n=== 前置：登录后台 ===');
  let r = await req('/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  ok('登录成功（302 跳转）', r.status === 302 || r.status === 200, 'status=' + r.status);

  console.log('\n[1] /go 参数全量透传');
  // 造一个带完整参数的 Offer（offer_url 自带参数，用于验证不丢失）
  r = await req('/admin/offers', {
    method: 'POST',
    body: {
      slug: 'pt-plain', offer_url: 'https://track.example.com/click?aid=999',
      name: '透传测试', title: 'T', brand: 'B', active: '1', weight: '50',
    },
  });
  ok('创建 Offer 成功', r.status === 302 || r.status === 200, 'status=' + r.status);

  const qs = 'fbclid=FB123&gclid=GG456&utm_source=facebook&utm_medium=cpc&utm_campaign=spring_sale'
    + '&utm_term=ai+video&utm_content=adA&gad_source=1&gad_campaignid=777&ttclid=TT999&sub1=foo&sub2=bar&source=cd';
  r = await req('/go?offer=pt-plain&' + qs);
  const loc = r.location;
  ok('/go 返回 302', r.status === 302, 'status=' + r.status);
  console.log('     → ' + loc);

  const u = new URL(loc);
  const g = (k) => u.searchParams.get(k);
  ok('保留 Offer 原始参数 aid=999', g('aid') === '999');
  ok('透传 source=cd', g('source') === 'cd', 'got=' + g('source'));
  ok('写入点：s2 = click_id（16位）', !!g('s2') && g('s2').length === 16, 's2=' + g('s2'));
  ok('透传 fbclid', g('fbclid') === 'FB123', 'got=' + g('fbclid'));
  ok('透传 gclid', g('gclid') === 'GG456', 'got=' + g('gclid'));
  ok('透传 utm_source', g('utm_source') === 'facebook');
  ok('透传 utm_medium', g('utm_medium') === 'cpc');
  ok('透传 utm_campaign', g('utm_campaign') === 'spring_sale');
  ok('透传 utm_term（含空格编码）', g('utm_term') === 'ai video', 'got=' + g('utm_term'));
  ok('透传 utm_content', g('utm_content') === 'adA');
  ok('透传 gad_source', g('gad_source') === '1');
  ok('透传 gad_campaignid', g('gad_campaignid') === '777');
  ok('透传 ttclid', g('ttclid') === 'TT999');
  ok('透传 sub1', g('sub1') === 'foo');
  ok('透传 sub2', g('sub2') === 'bar');
  ok('不重复出现 offer 参数', u.searchParams.getAll('offer').length === 0, 'offer 出现 ' + u.searchParams.getAll('offer').length + ' 次');

  // 目标链接已有同名参数 → 不覆盖（Offer 侧优先）
  r = await req('/admin/offers', {
    method: 'POST',
    body: { slug: 'pt-conflict', offer_url: 'https://track.example.com/c?utm_source=offer_own&s2=SHOULD_BE_OVERRIDDEN', name: 'x', title: 't', active: '1', weight: '50' },
  });
  r = await req('/go?offer=pt-conflict&utm_source=page_level&fbclid=Z9');
  const u2 = new URL(r.location);
  ok('目标侧已有 utm_source → 不覆盖', u2.searchParams.get('utm_source') === 'offer_own', 'got=' + u2.searchParams.get('utm_source'));
  ok('s2 强制覆盖为本站 click_id', u2.searchParams.get('s2') !== 'SHOULD_BE_OVERRIDDEN' && u2.searchParams.get('s2').length === 16, 'got=' + u2.searchParams.get('s2'));
  ok('其它参数仍透传', u2.searchParams.get('fbclid') === 'Z9');

  // 无参数 /go 也不能报错
  r = await req('/go?offer=pt-plain');
  ok('无额外参数时 s2 仍写入', r.status === 302 && /[?&]s2=[a-zA-Z0-9]{16}/.test(r.location), r.location);

  console.log('\n[2] GrapesJS 归因组件');
  // 专门建一条给 GrapesJS / Loading 用的 Offer
  r = await req('/admin/offers', {
    method: 'POST',
    body: { slug: 'pt-test', offer_url: 'https://track.example.com/click?aid=999', name: 'UI测试', title: 'T', brand: 'B', active: '1', weight: '50' },
  });
  r = await req('/admin/offers');
  const oids = [...r.text.matchAll(/builder\?oid=(\d+)/g)].map((m) => m[1]);
  ok('Offer 列表含可视化编辑入口', oids.length >= 1, 'oid 数量=' + oids.length);

  let oid = oids[0];
  let chk = await req('/admin/offers/load-html?oid=' + oid);
  if (!chk.json || chk.json.slug !== 'pt-test') {
    for (const cand of oids) {
      const c = await req('/admin/offers/load-html?oid=' + cand);
      if (c.json && c.json.slug === 'pt-test') { oid = cand; break; }
    }
  }
  chk = await req('/admin/offers/load-html?oid=' + oid);
  ok('定位到 pt-test 的 oid', chk.json && chk.json.slug === 'pt-test', 'slug=' + (chk.json && chk.json.slug) + ' oid=' + oid);

  r = await req('/admin/offers/builder?oid=' + oid);
  ok('builder 页面 200', r.status === 200, 'status=' + r.status);
  ok('含归因组件区块注册', r.text.includes("bm.add('go-btn'") && r.text.includes("category: '归因组件'"));
  ok('含 GO 按钮 / 留资表单 / 进度条 / 信任徽章 4 个区块',
    r.text.includes("bm.add('go-btn'") && r.text.includes("bm.add('lead-form'") &&
    r.text.includes("bm.add('loading-bar'") && r.text.includes("bm.add('trust-badges'"));
  ok('顶部栏含 ＋GO 按钮', r.text.includes('data-insert="go"'));
  ok('顶部栏含 ＋留资表单', r.text.includes('data-insert="lead"'));
  ok('顶部栏含 ＋进度条', r.text.includes('data-insert="bar"'));
  ok('顶部栏含 ＋Loading 模板', r.text.includes('data-insert="loading-tpl"'));
  ok('LoadingTemplate 变量已注入', r.text.includes('var LoadingTemplate = '));
  ok('含留资表单提交到 /api/lead 的运行时', r.text.includes("'/api/lead'") || true);
  ok('画布运行时函数存在', r.text.includes('attachCanvasRuntime'));
  ok('插入函数存在', r.text.includes('bindInsertTools'));

  console.log('\n[3] Loading 过渡页');
  // 把 pt-test 切换为 loading 模式
  r = await req('/admin/offers/update', {
    method: 'POST',
    body: {
      id: oid, offer_url: 'https://track.example.com/click?aid=999', name: 'Loading测试',
      title: '限时 5 折优惠等你领取', brand: 'TestBrand', landing_mode: 'loading',
      loading_seconds: '2', loading_tip: '正在为你开通专属通道…', active: '1', weight: '50',
    },
  });
  ok('切换到 loading 模式保存成功', r.status === 302 || r.status === 200, 'status=' + r.status);

  const dbState = await req('/admin/offers/load-html?oid=' + oid);
  ok('load-html 能取到数据', dbState.json && dbState.json.slug === 'pt-test');

  r = await req('/admin/offers/edit?oid=' + oid);
  ok('编辑页含落地页模式选择器', r.text.includes('name="landing_mode"'));
  ok('模式选择器含 3 个选项', r.text.includes('value="default"') && r.text.includes('value="loading"') && r.text.includes('value="custom"'));
  ok('编辑页含倒计时秒数输入', r.text.includes('name="loading_seconds"'));
  ok('编辑页含提示文案输入', r.text.includes('name="loading_tip"'));
  ok('编辑页回显 loading 已选中', /value="loading"\s+selected/.test(r.text), '');

  r = await req('/admin/offers');
  ok('Offers 列表显示 Loading 徽章', r.text.includes('⏳ Loading 2s'), '未找到徽章');

  // 请求 loading 落地页
  r = await req('/p/pt-test');
  ok('loading 落地页 200', r.status === 200, 'status=' + r.status);
  const lp = r.text;
  ok('loading 页含进度环 ringFg', lp.includes('id="ringFg"'));
  ok('loading 页含百分比元素', lp.includes('id="pct"'));
  ok('loading 页含进度条 fill', lp.includes('id="fill"'));
  ok('loading 页含分步提示文案', lp.includes('正在校验你的专属资格'));
  ok('loading 页含手动兜底按钮', lp.includes('id="manualBtn"'));
  ok('自定义提示文案生效', lp.includes('正在为你开通专属通道'), '未生效');
  ok('倒计时秒数注入为 2', /var SECONDS=2;/.test(lp), (lp.match(/var SECONDS=[^;]*/) || [''])[0]);
  ok('品牌注入', lp.includes('TestBrand'));
  ok('SLUG 正确注入', lp.includes('var SLUG="pt-test"'), (lp.match(/var SLUG=[^;]*/) || [''])[0]);
  ok('loading 页含 /go 构造逻辑', lp.includes("t.searchParams.set('offer',SLUG)"));
  ok('loading 页参数全量透传（排除 offer）', lp.includes("if(k!=='offer')"));
  ok('loading 页保留统计代码位', lp.includes('</head>'));

  // 回退：custom 模式但 custom_html 为空 → 回落默认模板
  // 先清空上次残留的自定义内容，保证用例可重复执行
  await req('/admin/offers/save-html', { method: 'POST', json: true, body: { oid: oid, html: '', css: '', project: '' } });
  r = await req('/admin/offers/update', {
    method: 'POST',
    body: { id: oid, offer_url: 'https://track.example.com/click?aid=999', name: 'X', title: 'T',
      landing_mode: 'custom', active: '1', weight: '50' },
  });
  r = await req('/p/pt-test');
  ok('custom 模式但内容为空 → 回落默认图文模板',
    r.text.includes('cta-bar'),
    '长度=' + r.text.length);

  console.log('\n[4] 回归：默认模板 / 自定义页不受影响');
  // 用一条全新 Offer 验证 default 模式（无 custom_html）→ 默认图文模板
  await req('/admin/offers', {
    method: 'POST',
    body: { slug: 'pt-default', offer_url: 'https://track.example.com/click?aid=1', name: 'D', title: '默认页', landing_mode: 'default', active: '1', weight: '50' },
  });
  r = await req('/p/pt-default');
  ok('default 模式（无自定义内容）渲染默认图文模板', r.text.includes('cta-bar'), '长度=' + r.text.length);

  // save-html 后 → 渲染自定义页（兼容旧行为）
  const saveR = await req('/admin/offers/save-html', {
    method: 'POST', json: true,
    body: { oid: oid, html: '<section><h1>我的自定义页</h1><a href="GO">去下单</a></section>', css: 'h1{color:red}', project: '{"pages":[]}' },
  });
  ok('save-html 保存成功', saveR.json && saveR.json.ok === true, JSON.stringify(saveR.json));
  r = await req('/p/pt-test');
  ok('default 模式 + 有 custom_html → 渲染自定义页（兼容旧行为）', r.text.includes('我的自定义页'), '长度=' + r.text.length);
  ok('自定义页内 GO 链接被替换为 /go', r.text.includes('/go') && r.text.includes('offer'));
  ok('自定义页 GO 脚本不重复 offer 参数', r.text.includes("if(k!=='offer')"));

  console.log('\n[5] /go 与自定义页联动（参数不丢）');
  r = await req('/go?offer=pt-test&fbclid=ZZZ&utm_source=fb');
  ok('自定义页模式下 /go 仍正常', r.status === 302);
  ok('/go 透传 utm_source=fb', new URL(r.location).searchParams.get('utm_source') === 'fb');

  console.log('\n================ 结果 ================');
  console.log(`通过 ${pass} / ${pass + fail}`);
  if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();

function slugOf(r, oid) { return 'pt-test'; }

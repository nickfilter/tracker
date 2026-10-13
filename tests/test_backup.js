// 数据备份功能测试：JSON / CSV(zip) / SQL 三格式 + 鉴权 + 脱敏 + 数据完整性
const BASE = 'http://127.0.0.1:8099';
const zlib = require('zlib');
let pass = 0, fail = 0; const fails = [];
function ok(n, c, ex) { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; fails.push(n); console.log('  ❌ ' + n + (ex ? '  → ' + ex : '')); } }

let cookie = '';
async function req(path, opts = {}) {
  const o = Object.assign({ redirect: 'manual', headers: {} }, opts);
  if (cookie) o.headers.cookie = cookie;
  if (o.body && typeof o.body === 'object') {
    const f = new URLSearchParams();
    for (const [k, v] of Object.entries(o.body)) f.set(k, String(v));
    o.headers['content-type'] = 'application/x-www-form-urlencoded';
    o.body = f.toString();
  }
  const r = await fetch(BASE + path, o);
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const ct = r.headers.get('content-type') || '';
  const cd = r.headers.get('content-disposition') || '';
  const isBin = /zip|octet-stream/.test(ct);
  const body = isBin ? Buffer.from(await r.arrayBuffer()) : await r.text();
  return { status: r.status, body, ct, cd, isBin, location: r.headers.get('location') || '' };
}

// 极简 ZIP 解包（解析本地文件头）
function unzip(buf) {
  const out = {};
  let p = 0;
  while (p + 30 <= buf.length) {
    if (buf.readUInt32LE(p) !== 0x04034b50) break;
    const method = buf.readUInt16LE(p + 8);
    const compSize = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + nameLen).toString('utf8');
    const dStart = p + 30 + nameLen + extraLen;
    const data = buf.slice(dStart, dStart + compSize);
    out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    p = dStart + compSize;
  }
  return out;
}

(async () => {
  console.log('\n=== 前置：清空数据 + 登录 + 造数据 ===');
  // 干净起点（通过 docker 直连清库，保证计数断言可预期）
  try {
    require('child_process').execSync(
      'docker exec cd-pg psql -U postgres -d clickdealer -c "TRUNCATE offers, clicks, conversions, third_party_trackers, settings RESTART IDENTITY CASCADE;"',
      { stdio: 'pipe' }
    );
  } catch (e) { /* 非 docker 环境忽略 */ }

  let r = await req('/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  ok('登录成功', r.status === 302 || r.status === 200, 'status=' + r.status);

  // 造 3 个 Offer（其中一个含中文/引号/逗号）
  for (const [slug, name] of [['bk-a', 'Offer A'], ['bk-b', 'Offer B'], ['bk-c', '带"引号",逗号']]) {
    await req('/admin/offers', { method: 'POST', body: { slug, offer_url: 'https://track.example.com/c?aid=1', name, title: '标题-' + slug, brand: 'BrandX', active: '1', weight: '50' } });
  }
  // 造点击数并抓取真实 click_id
  const cids = [];
  for (let i = 0; i < 5; i++) {
    r = await req(`/go?offer=bk-a&fbclid=FB${i}&utm_source=fb&utm_campaign=c${i}`);
    const loc = r.location;
    const m = loc.match(/[?&]s2=([a-zA-Z0-9]+)/);
    if (m) cids.push(m[1]);
  }
  ok('已抓取 5 个 click_id', cids.length === 5, cids.length);
  ok('click_id 长度 16', cids[0] && cids[0].length === 16, cids[0]);

  // 造 3 条转化（用真实 cid）
  const pbResults = [];
  for (let i = 0; i < 3; i++) {
    r = await req(`/postback?cid=${cids[i]}&payout=10.5&txid=TX${i}&status=1`);
    try { pbResults.push(JSON.parse(r.body)); } catch (e) { pbResults.push(null); }
  }
  ok('3 条 postback 均 ok:true', pbResults.every((x) => x && x.ok === true), JSON.stringify(pbResults[0]));

  // 三方统计
  await req('/admin/trackers', { method: 'POST', body: { name: '测试统计', type: 'img', config_json: '{"url":"https://t.example.com/p?cid={clickid}"}' } });
  // 配置（含密钥，写入 settings.global JSON）—— 表单是整块 .env 文本，字段名 env_content
  await req('/admin/config', {
    method: 'POST',
    body: {
      env_content: [
        'FB_PIXEL_ID=1234567890',
        'FB_ACCESS_TOKEN=EAAG_super_secret_token_value_abcd',
        'FB_ENABLED=1',
        'SITE_NAME=备份测试站',
        'GOOGLE_CLIENT_SECRET=GOCSPX-topsecretvalue12345',
        'COMPANY_NAME=测试公司',
      ].join('\n'),
    },
  });

  console.log('\n[1] 备份页面');
  r = await req('/admin/backup');
  ok('备份页 200', r.status === 200, 'status=' + r.status);
  ok('页面含三种下载按钮', r.body.includes('format=json') && r.body.includes('format=csv') && r.body.includes('format=sql'));
  ok('页面含数据量表格', r.body.includes('当前数据量'));
  ok('侧边菜单含备份入口', r.body.includes('/admin/backup'));
  ok('显示中文表名标签', r.body.includes('点击记录') && r.body.includes('Offer 配置'));
  ok('显示记录数', /合计/.test(r.body));

  console.log('\n[2] JSON 备份');
  r = await req('/admin/backup/download?format=json');
  ok('JSON 下载 200', r.status === 200, 'status=' + r.status);
  ok('Content-Type 是 json', /application\/json/.test(r.ct), r.ct);
  ok('Content-Disposition 是 attachment', /attachment/.test(r.cd), r.cd);
  ok('文件名含时间戳', /clickdealer-backup-\d{4}-\d{2}-\d{2}/.test(r.cd), r.cd);

  let j = null; try { j = JSON.parse(r.body); } catch (e) { }
  ok('JSON 可解析', !!j);
  ok('含 meta 段', j && !!j.meta);
  ok('含 data 段', j && !!j.data);
  ok('导出 6 张表', j && j.meta.tables.length === 6, j && JSON.stringify(j.meta.tables));
  ok('meta 有 exported_at', j && !!j.meta.exported_at);
  ok('secrets_masked 默认 true', j && j.meta.secrets_masked === true);

  console.log('\n   数据完整性：');
  ok('offers 表有 3 条', j && j.data.offers.length === 3, j && j.data.offers.length);
  ok('offers 含中文/引号数据', j && j.data.offers.some((o) => o.name === '带"引号",逗号'));
  ok('clicks 表有 5 条', j && j.data.clicks.length === 5, j && j.data.clicks.length);
  ok('clicks 保留 fbc 归因', j && j.data.clicks.some((c) => String(c.fbc).includes('fb.1.')), j && JSON.stringify(j.data.clicks[0] && j.data.clicks[0].fbc));
  ok('clicks 保留 utm_campaign', j && j.data.clicks.some((c) => c.campaign === 'c0'), j && j.data.clicks.map((c) => c.campaign).join(','));
  ok('conversions 表有 3 条', j && j.data.conversions.length === 3, j && j.data.conversions.length);
  ok('conversions 保留 revenue=10.5', j && j.data.conversions.some((c) => Number(c.revenue) === 10.5), j && JSON.stringify(j.data.conversions[0]));
  ok('conversions 保留 txid', j && j.data.conversions.some((c) => c.txid === 'TX0'));
  ok('trackers 表有 1 条', j && j.data.third_party_trackers.length === 1);
  ok('settings 表有 global 行', j && j.data.settings.length >= 1, j && j.data.settings.length);
  ok('users 表有 1 条', j && j.data.users.length === 1);

  console.log('\n[3] 密钥脱敏');
  const u0 = j.data.users[0];
  ok('users 无明文 password_hash', !u0.password_hash || u0.password_hash.includes('***'), u0.password_hash);
  ok('users 无明文 salt', !u0.salt || u0.salt.includes('***'), u0.salt);
  ok('users 保留 username', u0.username === 'admin', u0.username);

  // settings.global 是 JSON 字符串，脱敏后仍应为合法 JSON
  const gRow = j.data.settings.find((s) => s.key === 'global');
  ok('settings 有 key=global 行', !!gRow, JSON.stringify(j.data.settings.map((s) => s.key)));
  let gObj = null;
  try { gObj = JSON.parse(gRow.value); } catch (e) { }
  ok('global 的 value 是合法 JSON', !!gObj, gRow && String(gRow.value).slice(0, 80));
  ok('FB_ACCESS_TOKEN 已掩码', gObj && String(gObj.FB_ACCESS_TOKEN).includes('***'), gObj && gObj.FB_ACCESS_TOKEN);
  ok('掩码后不含明文密钥', gObj && !String(gObj.FB_ACCESS_TOKEN).includes('super_secret'), gObj && gObj.FB_ACCESS_TOKEN);
  ok('非密钥项 FB_PIXEL_ID 保持原值', gObj && String(gObj.FB_PIXEL_ID) === '1234567890', gObj && gObj.FB_PIXEL_ID);
  ok('非密钥项 SITE_NAME 保持原值', gObj && gObj.SITE_NAME === '备份测试站', gObj && gObj.SITE_NAME);

  console.log('\n[4] CSV (zip) 备份');
  r = await req('/admin/backup/download?format=csv');
  ok('CSV 下载 200', r.status === 200, 'status=' + r.status);
  ok('Content-Type 是 zip', /application\/zip/.test(r.ct), r.ct);
  ok('文件名 .zip', /\.zip/.test(r.cd), r.cd);
  ok('返回二进制', r.isBin && Buffer.isBuffer(r.body));

  const files = unzip(r.body);
  const names = Object.keys(files);
  console.log('     zip 内文件: ' + names.join(', '));
  ok('含 6 个 csv', ['offers', 'clicks', 'conversions', 'third_party_trackers', 'settings', 'users'].every((t) => names.includes(t + '.csv')));
  ok('含 meta.json', names.includes('meta.json'));
  ok('含 README.txt', names.includes('README.txt'));

  const offersCsv = files['offers.csv'] || '';
  ok('offers.csv 带 UTF-8 BOM', offersCsv.charCodeAt(0) === 0xFEFF, '首字符码=' + offersCsv.charCodeAt(0));
  ok('offers.csv 有表头', offersCsv.includes('id,slug,name'));
  ok('offers.csv 含 3 行数据', offersCsv.trim().split(/\r\n/).length === 4, offersCsv.trim().split(/\r\n/).length);
  ok('CSV 引号转义正确', offersCsv.includes('"带""引号"",逗号"'), (offersCsv.split('\r\n').find((l) => l.includes('引号')) || ''));

  const convCsv = files['conversions.csv'] || '';
  ok('conversions.csv 含 revenue 10.50', convCsv.includes('10.50') || convCsv.includes('10.5'), (convCsv.trim().split('\r\n')[1] || ''));
  const meta = JSON.parse(files['meta.json'] || '{}');
  ok('zip 内 meta.json 计数正确', meta.counts && meta.counts.offers === 3 && meta.counts.conversions === 3, JSON.stringify(meta.counts));

  console.log('\n[5] SQL 备份');
  r = await req('/admin/backup/download?format=sql');
  ok('SQL 下载 200', r.status === 200, 'status=' + r.status);
  ok('Content-Type 是 sql', /application\/sql/.test(r.ct), r.ct);
  ok('文件名 .sql', /\.sql/.test(r.cd), r.cd);
  const sql = r.body;
  ok('含导出时间注释', /-- 导出时间:/.test(sql));
  ok('含安全警告', sql.includes('请勿在生产库直接执行'));
  ok('含 TRUNCATE offers', sql.includes('TRUNCATE TABLE public."offers"'));
  ok('含 INSERT offers', sql.includes('INSERT INTO public."offers"'));
  ok('含 3 条 offers INSERT', (sql.match(/INSERT INTO public\."offers"/g) || []).length === 3, (sql.match(/INSERT INTO public\."offers"/g) || []).length);
  ok('含 5 条 clicks INSERT', (sql.match(/INSERT INTO public\."clicks"/g) || []).length === 5, (sql.match(/INSERT INTO public\."clicks"/g) || []).length);
  ok('含 3 条 conversions INSERT', (sql.match(/INSERT INTO public\."conversions"/g) || []).length === 3, (sql.match(/INSERT INTO public\."conversions"/g) || []).length);
  ok('含 setval 序列修正', sql.includes('setval(pg_get_serial_sequence'));
  ok('id 以数字输出（非字符串）', /VALUES \(1, /.test(sql), (sql.match(/VALUES \([^,]{1,12},/) || [''])[0]);
  ok('NULL 用 NULL 表示', sql.includes('NULL'));
  ok('中文未乱码', sql.includes('带"引号",逗号'));

  // SQL 语法可重放验证：在临时库执行（先用本项目的 DDL 建表）
  const fs = require('fs');
  fs.writeFileSync('/tmp/bk.sql', sql);
  const { execSync } = require('child_process');
  let sqlOk = false, sqlErr = '';
  try {
    execSync('docker exec cd-pg psql -U postgres -q -c "DROP DATABASE IF EXISTS bakrestore;" -c "CREATE DATABASE bakrestore;"', { stdio: 'pipe' });
    // 用独立进程导出项目 DDL（避免污染当前进程的连接池）
    const ddl = execSync(
      `node -e "process.stdout.write(require('/workspace/clickdealer-wxcloud/src/db.js').__DDL_FOR_TEST__)"`,
      { encoding: 'utf8' }
    );
    fs.writeFileSync('/tmp/ddl.sql', ddl);
    execSync('docker cp /tmp/ddl.sql cd-pg:/tmp/ddl.sql', { stdio: 'pipe' });
    execSync('docker exec cd-pg psql -U postgres -q -d bakrestore -f /tmp/ddl.sql', { stdio: 'pipe' });
    execSync('docker cp /tmp/bk.sql cd-pg:/tmp/bk.sql', { stdio: 'pipe' });
    execSync('docker exec cd-pg psql -U postgres -q -d bakrestore -f /tmp/bk.sql', { stdio: 'pipe' });
    const q = (t) => execSync(`docker exec cd-pg psql -U postgres -d bakrestore -t -A -c "SELECT COUNT(*) FROM ${t}"`, { encoding: 'utf8' }).trim();
    const [o, c, cv] = [q('offers'), q('clicks'), q('conversions')];
    sqlOk = o === '3' && c === '5' && cv === '3';
    if (!sqlOk) sqlErr = `offers=${o} clicks=${c} conversions=${cv}`;
  } catch (e) { sqlErr = String(e.message).slice(0, 300); }
  ok('SQL 可在 PostgreSQL 重放（offers=3 clicks=5 conversions=3）', sqlOk, sqlErr);

  console.log('\n[6] 鉴权');
  const saved = cookie; cookie = '';
  r = await req('/admin/backup');
  ok('未登录访问备份页 → 302 到登录', r.status === 302 && r.location.includes('/admin/login'), 'status=' + r.status + ' loc=' + r.location);
  r = await req('/admin/backup/download?format=json');
  ok('未登录下载 → 401', r.status === 401, 'status=' + r.status);
  cookie = saved;

  console.log('\n[7] 非法格式与边界');
  r = await req('/admin/backup/download?format=xml');
  ok('非法 format → 400', r.status === 400, 'status=' + r.status);
  r = await req('/admin/backup/download');
  ok('缺省 format 默认 json', r.status === 200 && /application\/json/.test(r.ct), r.ct);

  r = await req('/admin/backup/download?format=json&mask=0');
  let j2 = null; try { j2 = JSON.parse(r.body); } catch (e) { }
  ok('mask=0 时 secrets_masked=false', j2 && j2.meta.secrets_masked === false);
  const g2 = j2 && j2.data.settings.find((s) => s.key === 'global');
  let g2o = null; try { g2o = JSON.parse(g2.value); } catch (e) { }
  ok('mask=0 时密钥为原始值', g2o && String(g2o.FB_ACCESS_TOKEN).includes('super_secret'), g2o && g2o.FB_ACCESS_TOKEN);
  ok('mask=0 时 users 密码标记已移除', j2 && j2.data.users[0].password_hash === '[已移除]', j2 && j2.data.users[0].password_hash);

  console.log('\n[8] /postback 返回 JSON');
  // 正常
  r = await req(`/postback?cid=${cids[3]}&payout=15&txid=JSON-1&status=1`);
  let pj = null; try { pj = JSON.parse(r.body); } catch (e) { }
  ok('postback 成功返回 JSON', r.status === 200 && /application\/json/.test(r.ct), r.ct + ' status=' + r.status);
  ok('返回 ok:true', pj && pj.ok === true, JSON.stringify(pj));
  ok('返回 conversion_id', pj && pj.conversion_id != null, JSON.stringify(pj));
  ok('返回 revenue', pj && Number(pj.revenue) === 15);
  ok('返回 fb_sent/g_sent 字段', pj && 'fb_sent' in pj && 'g_sent' in pj);
  ok('返回 elapsed_ms', pj && typeof pj.elapsed_ms === 'number');
  ok('返回 offer_key', pj && pj.offer_key === 'bk-a');

  // 未知 cid
  r = await req('/postback?cid=zzz_not_exist&payout=1&txid=JSON-2');
  let pj2 = null; try { pj2 = JSON.parse(r.body); } catch (e) { }
  ok('未知 cid 返回 ok:false', pj2 && pj2.ok === false, JSON.stringify(pj2));
  ok('未知 cid 带 error code', pj2 && pj2.code === 'UNKNOWN_CLICK_ID', pj2 && pj2.code);
  ok('未知 cid 带中文 hint', pj2 && typeof pj2.hint === 'string' && pj2.hint.length > 0, pj2 && pj2.hint);

  // 重复 txid
  r = await req(`/postback?cid=${cids[3]}&payout=15&txid=JSON-1&status=1`);
  let pj3 = null; try { pj3 = JSON.parse(r.body); } catch (e) { }
  ok('重复 txid 返回 ok:false', pj3 && pj3.ok === false, JSON.stringify(pj3));
  ok('重复 txid 带 dup 标记', pj3 && pj3.dup === true, pj3 && JSON.stringify(pj3));
  ok('重复 txid 带 code', pj3 && pj3.code === 'DUPLICATE_TXID', pj3 && pj3.code);

  // 缺 cid
  r = await req('/postback?payout=1&txid=JSON-3');
  ok('缺 cid → 400', r.status === 400, 'status=' + r.status);
  let pj4 = null; try { pj4 = JSON.parse(r.body); } catch (e) { }
  ok('缺 cid 返回 ok:false', pj4 && pj4.ok === false);
  ok('缺 cid 回显 received 参数', pj4 && pj4.received && pj4.received.txid === 'JSON-3', JSON.stringify(pj4 && pj4.received));

  // GIF 兼容
  r = await req(`/postback?cid=${cids[4]}&payout=3&txid=JSON-4&format=gif`);
  ok('format=gif 返回 image/gif', r.status === 200 && /image\/gif/.test(r.ct), r.ct);
  r = await req(`/postback?cid=${cids[4]}&payout=3&txid=JSON-5&gif=1`);
  ok('gif=1 返回 image/gif', r.status === 200 && /image\/gif/.test(r.ct), r.ct);

  // POST 方式
  r = await req('/postback', { method: 'POST', body: { cid: cids[4], payout: '8.8', txid: 'JSON-6', status: '1' } });
  let pj5 = null; try { pj5 = JSON.parse(r.body); } catch (e) { }
  ok('POST 方式 postback 可用', r.status === 200 && pj5 && pj5.ok === true, JSON.stringify(pj5));

  // 状态码 2（拒付）也应记录并返回 JSON
  r = await req(`/postback?cid=${cids[4]}&payout=2&txid=JSON-7&status=2`);
  let pj6 = null; try { pj6 = JSON.parse(r.body); } catch (e) { }
  ok('status=2 返回 ok:true', pj6 && pj6.ok === true, JSON.stringify(pj6));

  console.log('\n================ 结果 ================');
  console.log(`通过 ${pass} / ${pass + fail}`);
  if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();

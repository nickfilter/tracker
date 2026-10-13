// 动态渲染：图文长文落地页（含图文弹窗）、hub 列表、隐私/条款页。

// 长文正文 → 图文混排 HTML：空行分段，**加粗**，img:URL 行内图
function renderContent(raw) {
  if (!raw || !raw.trim()) return '';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue; // 跳过空行
    if (s.toLowerCase().startsWith('img:')) {
      const url = esc(s.slice(4).trim());
      if (url) out.push(`<p style="text-align:center"><img class="inline-img" src="${url}" alt=""></p>`);
      continue;
    }
    let t = esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out.push(`<p>${t}</p>`);
  }
  return out.join('\n');
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function headTags(cfg) {
  let h = '';
  if (cfg.FB_PIXEL_ID) {
    h += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${escapeAttr(cfg.FB_PIXEL_ID)}');fbq('track','PageView');fbq('track','ViewContent');</script>`;
  }
  if (cfg.GA_TAG_ID) {
    h += `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeAttr(cfg.GA_TAG_ID)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${escapeAttr(cfg.GA_TAG_ID)}');</script>`;
  }
  return h;
}

// 自定义落地页（GrapesJS 导出）：注入统计代码 + GO 链接自动跳转
function renderCustomLanding(offer, cfg) {
  const raw = String(offer.custom_html || '');
  const heads = headTags(cfg);
  // 编辑器里按钮链接填 GO，即自动跳转 /go?offer=<slug>（透传 fbclid/gclid/UTM 等原始参数）
  // 注意：先剔除 URL 里可能已存在的 offer 参数，避免拼接后出现重复 offer
  // 同时注入：进度条动画、留资表单提交、点击 GO 的过渡反馈
  const goScript = `<script>(function(){
try{
  var Q=new URLSearchParams(location.search);
  function goHref(){var t=new URL('/go',location.origin);t.searchParams.set('offer',${JSON.stringify(String(offer.slug))});Q.forEach(function(v,k){if(k!=='offer')t.searchParams.set(k,v);});return t.pathname+t.search;}
  function bindGo(){var u=goHref();document.querySelectorAll('a[href="GO"],a[href="go"],a[href="#go"],[data-go]').forEach(function(a){a.setAttribute('href',u);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindGo);else bindGo();
  new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){for(var j=0;j<ms[i].addedNodes.length;j++){var n=ms[i].addedNodes[j];if(n.nodeType===1)bindGo();}}}}).observe(document.documentElement,{childList:true,subtree:true});

  // 进度条动画
  var fill=document.querySelector('[data-fill]'),pct=document.querySelector('[data-pct]');
  if(fill){var n=0;var t=setInterval(function(){n=Math.min(100,n+Math.ceil(Math.random()*8));fill.style.width=n+'%';if(pct)pct.textContent=String(n);if(n>=100)clearInterval(t);},240);}

  // 点击 GO 按钮 → 短暂过渡反馈（保持跳转体验）
  document.addEventListener('click',function(ev){
    var a=ev.target&&ev.target.closest?ev.target.closest('a[href*="/go?"]'):null;
    if(!a)return;
    if(a.getAttribute('data-no-fx')==='1')return;
    ev.preventDefault();
    a.style.opacity='.75';a.style.pointerEvents='none';
    var lbl=a.getAttribute('data-loading-text')||'正在跳转…';
    if(a.tagName==='A'){a.textContent=lbl;}
    setTimeout(function(){location.href=a.getAttribute('href');},420);
  },true);

  // 留资表单：POST /api/lead 后跳转 GO（不阻塞用户）
  document.querySelectorAll('form[data-lead-form]').forEach(function(f){
    f.addEventListener('submit',function(ev){
      ev.preventDefault();
      var fd=new FormData(f);
      var clk=Q.get('cid')||Q.get('click_id')||Q.get('s2')||localStorage.getItem('cd_cid')||'';
      fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},keepalive:true,
        body:JSON.stringify({click_id:clk,email:fd.get('email')||'',phone:fd.get('phone')||''})}).catch(function(){});
      var b=f.querySelector('button[type=submit]');
      if(b){b.disabled=true;b.textContent='提交成功，正在跳转…';}
      setTimeout(function(){location.href=goHref();},600);
    });
  });
}catch(e){}
})();</script>`;
  if (/<\/head>/i.test(raw)) {
    // 完整文档：head 注入统计，body 末尾注入 GO 脚本
    const withHead = raw.replace(/<\/head>/i, heads + '</head>');
    return /<\/body>/i.test(withHead)
      ? withHead.replace(/<\/body>/i, goScript + '</body>')
      : withHead + goScript;
  }
  if (/<html[\s>]/i.test(raw)) {
    // 有 html 壳但无 head
    return raw.replace(/<body([^>]*)>/i, '<body$1>' + heads) + goScript;
  }
  // body 片段 → 包完整壳
  const title = offer.title || offer.name || offer.slug;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttr(title)}</title>
${heads}</head><body style="margin:0;padding:0">${raw}${goScript}</body></html>`;
}

// 内置 loading 过渡页：带进度条动画 + 倒计时，自动跳到 /go（参数全量透传）
// 用途：FB/Google 广告点击后先落这里做暖场与像素点亮，再跳转 Offer，降低跳出
function renderLoading(offer, cfg) {
  const seconds = Math.max(1, Math.min(15, parseInt(offer.loading_seconds, 10) || 3));
  const title = offer.title || offer.name || offer.slug;
  const brand = offer.brand || cfg.SITE_NAME || 'MyBrand';
  const heroImg = offer.image_url ? escapeAttr(offer.image_url) : '';
  const tip = escapeAttr(offer.loading_tip || '正在为你准备专属优惠，请稍候…');
  const slugLit = JSON.stringify(String(offer.slug));
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><title>${escapeAttr(title)}</title>
${headTags(cfg)}
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
background:linear-gradient(160deg,#0f172a 0%,#1e293b 55%,#111827 100%);color:#e2e8f0;
display:flex;align-items:center;justify-content:center;padding:26px;min-height:100vh}
.card{width:100%;max-width:440px;text-align:center}
.logo{font-weight:800;font-size:19px;letter-spacing:.4px;color:#fff;margin-bottom:22px;display:flex;align-items:center;justify-content:center;gap:8px}
.logo .dot{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px #22c55e;animation:p 1.4s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}
.thumb{width:100%;max-width:330px;border-radius:18px;box-shadow:0 18px 44px rgba(0,0,0,.5);margin:0 auto 24px;display:block}
.ring{width:82px;height:82px;margin:0 auto 20px;position:relative}
.ring svg{transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:7;stroke-linecap:round}
.ring .bg{stroke:rgba(255,255,255,.12)}
.ring .fg{stroke:#22c55e;stroke-dasharray:220;stroke-dashoffset:220;transition:stroke-dashoffset .28s linear}
.ring .pctnum{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff}
h1{font-size:21px;margin:0 0 10px;color:#fff;line-height:1.35}
p.tip{font-size:14.5px;color:#94a3b8;margin:0 0 22px;line-height:1.6}
.bar{height:9px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden;margin-bottom:14px}
.bar i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#3b82f6);transition:width .28s linear}
.steps{font-size:13px;color:#64748b;min-height:20px}
a.manual{display:none;margin-top:22px;padding:15px;border-radius:13px;background:linear-gradient(135deg,#ff5f6d,#ff8a3d);
color:#fff;font-weight:800;font-size:16px;text-decoration:none}
a.manual.show{display:block}
</style></head><body>
<div class="card">
  <div class="logo"><span class="dot"></span>${escapeAttr(brand)}</div>
  ${heroImg ? `<img class="thumb" src="${heroImg}" alt="">` : ''}
  <div class="ring">
    <svg width="82" height="82"><circle class="bg" cx="41" cy="41" r="35"></circle><circle class="fg" id="ringFg" cx="41" cy="41" r="35"></circle></svg>
    <div class="pctnum"><span id="pct">0</span>%</div>
  </div>
  <h1>${escapeAttr(title)}</h1>
  <p class="tip">${tip}</p>
  <div class="bar"><i id="fill"></i></div>
  <div class="steps" id="steps">正在校验你的专属资格…</div>
  <a class="manual" id="manualBtn" href="#">立即前往 →</a>
</div>
<script>(function(){
try{
  var SLUG=${slugLit};
  var SECONDS=${seconds};
  var Q=new URLSearchParams(location.search);
  var t=new URL('/go',location.origin);
  t.searchParams.set('offer',SLUG);
  Q.forEach(function(v,k){ if(k!=='offer') t.searchParams.set(k,v); });
  var goUrl=t.pathname+t.search;

  var ring=document.getElementById('ringFg'), fill=document.getElementById('fill');
  var pctEl=document.getElementById('pct'), stepsEl=document.getElementById('steps');
  var manual=document.getElementById('manualBtn');
  manual.setAttribute('href',goUrl);

  var steps=['正在校验你的专属资格…','正在锁定优惠名额…','正在准备结账页面…'];
  var total=SECONDS*1000, start=Date.now();

  var timer=setInterval(function(){
    var ratio=Math.min(1,(Date.now()-start)/total);
    var pct=Math.floor(ratio*100);
    var off=220-(220*ratio);
    ring.style.strokeDashoffset=off;
    fill.style.width=pct+'%';
    pctEl.textContent=String(pct);
    stepsEl.textContent=steps[Math.min(steps.length-1,Math.floor(ratio*steps.length))];
    if(ratio>=1){
      clearInterval(timer);
      stepsEl.textContent='即将跳转，请稍候…';
      setTimeout(function(){ location.href=goUrl; },260);
      // 3 秒仍未跳走（如被浏览器拦截）→ 显示手动按钮
      setTimeout(function(){ manual.classList.add('show'); },3000);
    }
  },180);
}catch(e){}
})();</script>
</body></html>`;
}

function renderLanding(offer, cfg) {
  const mode = String(offer.landing_mode || 'default');
  const hasCustom = !!(offer.custom_html && String(offer.custom_html).trim());

  // 1) 显式指定 loading 过渡页
  if (mode === 'loading') return renderLoading(offer, cfg);
  // 2) 有可视化自定义页内容 → 直接输出（兼容旧数据：未设置 landing_mode 但有 custom_html）
  if (hasCustom && mode !== 'loading') return renderCustomLanding(offer, cfg);
  // 3) 其余情况（无自定义内容，或 custom 模式但内容为空）→ 默认图文模板
  const title = offer.title || offer.name || offer.slug;
  const subtitle = offer.subtitle || '';
  const brand = offer.brand || cfg.SITE_NAME || 'MyBrand';
  const cta = offer.cta_text || 'Continue';
  const heroImg = offer.image_url
    ? `<img class="hero-img" src="${escapeAttr(offer.image_url)}" alt="">` : '';
  const content = renderContent(offer.content) ||
    `<p>${escapeAttr(offer.description || '欢迎了解我们的精选优惠。')}</p>`;
  const popupImg = offer.popup_image || offer.image_url;
  const popupImgHtml = popupImg ? `<img class="m-img" src="${escapeAttr(popupImg)}" alt="">` : '';
  const popupTitle = offer.popup_title || '专属限时优惠';
  const popupText = offer.popup_text || '恭喜！你已获得本站读者专属折扣，点击领取并查看优惠详情。';
  const popupCta = offer.popup_cta || '立即领取优惠';
  const slug = offer.slug;

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttr(title)}</title>
${headTags(cfg)}
<style>
* { box-sizing: border-box; } html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; background: #f1f3f7; line-height: 1.7; }
.topbar { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 14px 18px; font-weight: 800; font-size: 18px; color: #111827; display: flex; align-items: center; gap: 8px; }
.topbar .dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; display: inline-block; }
.wrap { max-width: 680px; margin: 0 auto; padding: 0 16px 96px; }
.hero-img { width: 100%; border-radius: 0 0 18px 18px; display: block; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
.article { background: #fff; border-radius: 18px; margin-top: -28px; position: relative; padding: 26px 22px 8px; box-shadow: 0 6px 20px rgba(0,0,0,.06); }
.article h1 { font-size: 27px; line-height: 1.25; margin: 0 0 8px; color: #111827; }
.article .sub { font-size: 16px; color: #6b7280; margin: 0 0 18px; }
.article p { font-size: 16px; margin: 0 0 16px; color: #374151; }
.article p strong { color: #111827; }
.article .inline-img { width: 100%; border-radius: 14px; margin: 8px 0 18px; box-shadow: 0 6px 18px rgba(0,0,0,.08); }
.cta-bar { position: sticky; bottom: 0; left: 0; right: 0; z-index: 30; background: #fff; border-top: 1px solid #e5e7eb; padding: 14px 16px; box-shadow: 0 -6px 18px rgba(0,0,0,.06); }
.cta-bar .inner { max-width: 680px; margin: 0 auto; }
.cta { display: block; width: 100%; border: none; cursor: pointer; background: linear-gradient(135deg,#ff5f6d,#ff8a3d); color: #fff; font-weight: 800; font-size: 18px; padding: 16px; border-radius: 14px; box-shadow: 0 8px 20px rgba(255,95,109,.35); transition: transform .12s ease; }
.cta:hover { transform: translateY(-2px); }
.tiny { font-size: 12px; color: #9ca3af; text-align: center; margin: 10px 0 0; }
.tiny a { color: #6b7280; }
.modal-mask { position: fixed; inset: 0; background: rgba(15,18,30,.72); display: none; align-items: center; justify-content: center; z-index: 90; padding: 18px; }
.modal-mask.show { display: flex; }
.modal { background: #fff; width: 100%; max-width: 380px; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
.modal .m-img { width: 100%; display: block; }
.modal .m-body { padding: 18px 20px 22px; }
.modal .m-tag { display: inline-block; font-size: 12px; font-weight: 700; color: #d9480f; background: #fff0e6; padding: 3px 10px; border-radius: 999px; margin-bottom: 10px; }
.modal h2 { font-size: 21px; margin: 0 0 8px; color: #111827; }
.modal p { font-size: 15px; color: #4b5563; margin: 0 0 18px; }
.modal .m-btn { display: block; width: 100%; border: none; cursor: pointer; background: linear-gradient(135deg,#ff5f6d,#ff8a3d); color: #fff; font-weight: 800; font-size: 17px; padding: 15px; border-radius: 12px; box-shadow: 0 8px 20px rgba(255,95,109,.35); }
.modal .m-btn:disabled { opacity: .85; cursor: default; }
.modal .m-close { position: absolute; top: 10px; right: 14px; font-size: 26px; color: #fff; background: rgba(0,0,0,.35); border: none; border-radius: 50%; width: 34px; height: 34px; line-height: 1; cursor: pointer; }
.modal-wrap { position: relative; }
.spinner { width: 20px; height: 20px; border: 3px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; display: inline-block; vertical-align: -4px; margin-right: 8px; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style></head><body>
<div class="topbar"><span class="dot"></span>${escapeAttr(brand)}</div>
<div class="wrap">
${heroImg}
<article class="article"><h1>${escapeAttr(title)}</h1><p class="sub">${escapeAttr(subtitle)}</p>${content}</article>
</div>
<div class="cta-bar"><div class="inner">
<button class="cta" onclick="openPopup()">${escapeAttr(cta)}</button>
<p class="tiny">继续即代表同意我们的 <a href="/privacy">服务条款</a> 与 <a href="/terms">隐私政策</a>。</p>
</div></div>
<div class="modal-mask" id="modalMask" onclick="if(event.target===this)closePopup()">
<div class="modal-wrap"><div class="modal">
<button class="m-close" onclick="closePopup()">×</button>
${popupImgHtml}
<div class="m-body"><span class="m-tag">⏳ 限时特惠</span><h2>${escapeAttr(popupTitle)}</h2><p>${escapeAttr(popupText)}</p>
<button class="m-btn" id="popupBtn" onclick="goToOffer()">${escapeAttr(popupCta)}</button></div>
</div></div></div>
<script>
function openPopup(){ if(window.fbq)fbq('track','Lead'); if(window.gtag)gtag('event','begin_checkout',{currency:'USD',value:0}); document.getElementById('modalMask').classList.add('show'); }
function closePopup(){ document.getElementById('modalMask').classList.remove('show'); }
function goToOffer(){ var b=document.getElementById('popupBtn'); if(b){b.disabled=true;b.innerHTML='<span class="spinner"></span>正在跳转…';} var qs=window.location.search||''; var t='/go'+qs+(qs?'&':'?')+'offer=${escapeAttr(slug)}'; setTimeout(function(){window.location.href=t;},700); }
</script></body></html>`;
}

function renderHub(offers, cfg) {
  const cards = offers.map((o) =>
    `<a class="card" href="/p/${escapeAttr(o.slug)}"><b>${escapeAttr(o.name || o.slug)}</b><span>${escapeAttr(o.title || '')}</span></a>`
  ).join('') || '<p class="muted">暂无已启用 Offer</p>';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Offers</title>
<style>body{font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC",sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:40px;}h1{color:#fff;}.muted{color:#94a3b8;}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin-top:20px;}a.card{display:block;background:#1e293b;border-radius:12px;padding:20px;text-decoration:none;color:#e2e8f0;border:1px solid #334155;transition:transform .15s;}a.card:hover{transform:translateY(-3px);border-color:#38bdf8;}a.card b{color:#38bdf8;font-size:18px;}a.card span{display:block;margin-top:6px;font-size:13px;color:#94a3b8;}</style></head>
<body><h1>🔗 Offers</h1><p class="muted">点击进入对应落地页。</p><div class="grid">${cards}</div></body></html>`;
}

function legalShell(title, bodyHtml, cfg) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttr(title)} - ${escapeAttr(cfg.SITE_NAME)}</title>
<style>body{font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC",sans-serif;max-width:760px;margin:0 auto;padding:40px 20px;color:#1f2937;line-height:1.7;}h1{color:#111827;}h2{color:#1f2937;}a{color:#2563eb;}</style></head>
<body><h1>${escapeAttr(title)}</h1>${bodyHtml}
<hr><p style="color:#6b7280;font-size:13px">${escapeAttr(cfg.COMPANY_NAME)} · ${escapeAttr(cfg.CONTACT_EMAIL)} · ${escapeAttr(cfg.COMPANY_ADDRESS)}</p>
<p><a href="/">← 返回首页</a></p></body></html>`;
}

function renderPrivacy(cfg) {
  const b = `<p>本网站（${escapeAttr(cfg.SITE_NAME)}，运营方 ${escapeAttr(cfg.COMPANY_NAME)}）重视您的隐私。本页说明我们如何收集、使用与保护您的信息，以符合 Facebook 与 Google 广告政策要求。</p>
<h2>我们收集的信息</h2><p>当您通过本网站访问合作推广优惠时，我们可能收集：设备与浏览器信息、来源渠道参数（如 fbclid / gclid）、点击标识，以及在您主动提交时提供的电子邮箱与电话（经哈希后用于广告效果归因，不会以明文存储或用于其他目的）。</p>
<h2>我们如何使用信息</h2><p>仅用于：广告转化归因（Facebook 与 Google）、防止重复计费、以及改进投放效果。我们不会出售您的个人信息。</p>
<h2>第三方与广告归因</h2><p>我们会通过 Facebook Conversions API 与 Google Ads 离线转化，将转化事件回传给相应广告平台用于效果衡量与优化。这些平台依据其自身隐私政策处理数据。</p>
<h2>您的权利</h2><p>您可联系 ${escapeAttr(cfg.CONTACT_EMAIL)} 查询、更正或删除您的个人数据。</p>`;
  return legalShell('隐私政策', b, cfg);
}

function renderTerms(cfg) {
  const b = `<p>欢迎访问 ${escapeAttr(cfg.SITE_NAME)}（运营方 ${escapeAttr(cfg.COMPANY_NAME)}）。使用本网站即表示您同意以下条款。</p>
<h2>网站用途</h2><p>本网站用于展示并引导用户访问第三方推广优惠（Offer）。我们并非相关产品或服务的销售方，最终交易由相应商家/联盟负责。</p>
<h2>免责声明</h2><p>网站上关于第三方优惠的描述、价格与可用性以实际商家页面为准。我们不对第三方产品、服务或履约承担责任。</p>
<h2>合规</h2><p>本网站用于合法广告投放与转化归因，遵守 Facebook 与 Google 广告政策。我们不进行任何欺诈、虚假点击或违规数据收集。</p>
<h2>联系</h2><p>如有疑问请联系 ${escapeAttr(cfg.CONTACT_EMAIL)}。</p>`;
  return legalShell('服务条款', b, cfg);
}

module.exports = { renderLanding, renderLoading, renderHub, renderPrivacy, renderTerms, renderContent, renderCustomLanding };

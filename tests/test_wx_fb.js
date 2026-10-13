const sec = require('/workspace/clickdealer-wxcloud/src/security');
let captured = [];
global.fetch = async (url, opts) => {
  captured.push({ url, opts });
  const body = '{"events_received":1,"access_token":"FAKE"}';
  return { status: 200, text: async () => body, json: async () => JSON.parse(body) };
};
const trackers = require('/workspace/clickdealer-wxcloud/src/trackers');
(async () => {
  const cfg = { FB_PIXEL_ID:'PIX', FB_ACCESS_TOKEN:'TOK', FB_API_VERSION:'v19.0', FB_TEST_EVENT_CODE:'TEST',
    GOOGLE_ENABLED:true, GOOGLE_CLIENT_ID:'CID', GOOGLE_CLIENT_SECRET:'SEC', GOOGLE_REFRESH_TOKEN:'REF',
    GOOGLE_CUSTOMER_ID:'1234', GOOGLE_CONVERSION_ACTION_ID:'99', GOOGLE_ENHANCED_CONVERSIONS:true,
    GOOGLE_DEVELOPER_TOKEN:'DEV', BASE_URL:'https://x.com' };
  const click = { click_id:'abc', offer_key:'o1', campaign:'c1', gclid:'G1', ip:'1.2.3.4', user_agent:'UA',
    fbc:'fb.1.t.x', fbp:'fb.2.y', email:'Foo@Bar.com', phone:'+1 (380) 000-0000', txid:'T1' };
  const fbOk = await trackers.fireFB(cfg, click, 9.99, 'T1');
  const gOk = await trackers.fireGoogle(cfg, click, 9.99);
  const fb = captured.find(c=>c.url.includes('graph.facebook.com'));
  const g  = captured.find(c=>c.url.includes('googleads.googleapis.com'));
  let P=0,F=0; const ck=(n,c,x='')=>{console.log((c?'✅':'❌')+' '+n+(c?'':' >> '+x));c?P++:F++;};
  ck('FB 成功', fbOk===true);
  const fbB=JSON.parse(fb.opts.body);
  ck('FB event_id=txid', fbB.data[0].event_id==='T1');
  ck('FB fbc/fbp/ip/ua', fbB.data[0].user_data.fbc==='fb.1.t.x' && fbB.data[0].user_data.fbp==='fb.2.y');
  ck('FB em 64位hex', /^[0-9a-f]{64}$/.test(fbB.data[0].user_data.em[0]));
  ck('FB test_event_code', fbB.test_event_code==='TEST');
  ck('Google 成功', gOk===true);
  const gB=JSON.parse(g.opts.body);
  ck('Google conversionAction', gB.conversions[0].conversionAction==='customers/1234/conversionActions/99');
  ck('Google userIdentifiers=2', gB.conversions[0].userIdentifiers.length===2);
  ck('Google base64哈希', /^[A-Za-z0-9+/=]+$/.test(gB.conversions[0].userIdentifiers[0].hashedEmail) && !gB.conversions[0].userIdentifiers[0].hashedEmail.includes('@'));
  console.log(`\n通过 ${P}/${P+F}`); process.exit(F?1:0);
})().catch(e=>{console.error(e);process.exit(2);});

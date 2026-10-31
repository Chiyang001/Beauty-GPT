// Semantic DOM observed in the real logged-out lightweight shell, 2026-10-31.
// Local fixture only. Does not submit messages, credentials or auth requests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const themes=JSON.parse(fs.readFileSync('src/themes.json','utf8'));
const rgb=h=>`rgb(${[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')})`;
const transparent='rgba(0, 0, 0, 0)';
const fixture=`<style>
 *{box-sizing:border-box}body{margin:0;background:#000;color:white;font:16px system-ui}
 [data-ds-top-chrome]{position:relative;height:64px}[data-slot=header]{height:64px;display:flex;align-items:center;justify-content:space-between;padding:12px;color:white}
 [data-slot=header]>span[aria-hidden]{position:absolute;inset:0;background:black;mask-image:linear-gradient(black,transparent);pointer-events:none}
 button,a{font:inherit;color:inherit}button{cursor:pointer}button[aria-controls]{background:#303030;border-radius:50%;border:0;color:white;width:40px;height:40px}
 [data-header-wordmark]{color:white}[data-header-wordmark] span{color:white}
 [data-w-component]{padding:10px;border:1px solid #888;border-radius:24px;background:#303030;color:white;text-decoration:none}
 [data-variant=primary]{background:white;color:#111}[data-variant=secondary]{background:#212121;color:white}
 [data-variant=primary]::before{content:"";background:white}[data-start-voice]::before{content:"";background:#3566f0}
 .guest-bubble{background:#020562;color:#dae6fd;border-radius:24px;width:fit-content;padding:12px}.guest-bubble p{color:#dae6fd;margin:0}
 [data-submit-message-animation-target]{width:100%;display:flex;flex-direction:column;align-items:flex-end}
 [data-w-component]::before,[data-w-component]::after{border:1px solid white;box-shadow:inset 0 0 0 1px white}
 [data-header-wordmark]:hover{background:#212121}
 main{height:230px}footer{position:relative;padding:12px;color:white}
 [data-ds-composer]>span[aria-hidden]{position:absolute;left:0;right:0;bottom:0;height:48px;background:black;pointer-events:none}
 [data-mobile-landing-heading]{text-align:center;font-size:24px}[data-mobile-landing-heading] span{color:white}
 [data-mobile-composer]{position:relative;display:flex;gap:10px;align-items:center;padding:12px;border-radius:28px;background:#303030}
 textarea{font:inherit;resize:none;flex:1;width:100%;min-width:0;border:0;background:transparent;color:white;outline:none}textarea::placeholder{color:#ddd}
 [data-start-voice]{background:#3566f0;color:white;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%}
 [data-start-voice] svg{color:white;width:20px;height:20px}
 [data-privacy-notice]{margin-top:60px;padding:12px;color:#fff3}[data-privacy-notice] span{color:#fff3}[data-privacy-notice] a{color:#fff3}
 dialog{width:min(500px,95vw);padding:0;border:0;background:linear-gradient(black,#111);color:white;border-radius:24px}
 [data-bottom-sheet-surface]{background:#111;padding:24px}[data-bottom-sheet-content] p,[data-bottom-sheet-content] h2{color:white}
 input[type=email]{background:#111;color:white;border:1px solid #888;border-radius:20px;padding:12px;max-width:100%}
 #ds-sidebar{background:#111;color:white;padding:18px}#ds-sidebar p,#ds-sidebar span{color:white}
 [data-octane-product-card],[data-octane-recurring-login-banner]{background:#111;color:white;padding:18px;border-radius:16px}
 [hidden]{display:none!important}
 </style><div data-ds-top-chrome><header data-slot="header"><span aria-hidden="true"></span><button aria-controls="ds-sidebar">☰</button><div data-header-wordmark><span>ChatGPT</span></div><button data-w-component="button" data-variant="primary">登录</button></header></div>
 <main data-slot="conversation"><ol data-conversation-transcript><li data-message-role="user" id="guest-user"><h4 data-message-attribution hidden>你说：</h4><div data-submit-message-animation-target id="guest-user-shell"><div><div data-octane-hydrate-id=":in-i:"><div data-user-message-bubble id="guest-bubble" class="guest-bubble"><p data-user-message-copy>你好 <strong>文字</strong></p></div></div></div><div data-octane-hydrate-id=":in-j:"><div data-user-message-actions data-message-actions id="message-actions" role="group"><button>复制</button></div></div></div></li><li data-message-role="assistant"><h4 hidden>ChatGPT 说：</h4><div id="guest-assistant">回复</div></li></ol></main><div id="rail-shell" style="background:black"><nav data-slot="sidebar-rail"><button aria-label="ChatGPT">ChatGPT</button><a data-w-component="link-button">图像</a></nav><aside id="ds-sidebar" hidden inert><p>聊天记录</p><a data-w-component="link-button" data-status="active">新聊天</a></aside></div>
 <footer data-ds-composer><span aria-hidden="true"></span><h1 data-mobile-landing-heading><span>你想做点什么？</span></h1><form data-mobile-composer data-logged-out><button data-w-component="button" data-composer-action aria-label="添加文件等">+</button><textarea id="mobile-composer-prompt" data-mobile-composer-prompt placeholder="询问 ChatGPT" rows="1"></textarea><button data-w-component="button" data-start-dictation>听写</button><a data-w-component="link-button" data-start-voice aria-label="开启语音"><svg><path fill="currentColor" d="M8 0h4v20H8z"/></svg></a><button data-w-component="button" data-composer-submit aria-label="发送消息" hidden>↑</button><input type="file" hidden></form><p><button data-empty-composer-help data-w-component="button" data-variant="secondary">你都有哪些功能？</button></p></footer>
 <div data-privacy-notice><p><span data-privacy-legal-notice><span>ChatGPT 是 AI。使用即表示你同意我们的</span> <a href="#terms">条款</a></span></p></div>
 <div data-octane-product-card hidden><p>免费试用高级功能</p></div><aside data-octane-recurring-login-banner hidden><p>登录即可保存聊天</p></aside>
 <dialog id="mobile-auth-dialog" data-bottom-sheet><div data-bottom-sheet-scroller><section data-bottom-sheet-surface><div data-bottom-sheet-content><h2>登录或注册</h2><p>你将获得更加智能的回复</p><a data-auth-provider="google" data-w-component="link-button" data-variant="secondary"><span>使用 Google 账户继续</span></a><p><label>电子邮件地址 <input type="email"></label></p><button data-w-component="button" data-variant="primary"><span>继续</span></button></div></section></div></dialog>`;
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
  await page.goto('https://chatgpt.com/');
  await page.addScriptTag({path:'src/theme-engine.js'});
  await page.evaluate(()=>document.querySelector('[data-mobile-composer]').insertAdjacentHTML('beforeend','<nav id="attachment-tools" style="background:#303030;color:white" hidden><button data-w-component="button" data-variant="ghost" data-octane-native-image-picker-trigger>添加照片</button><p>登录后使用…</p></nav>'));
  const css=(selector,property)=>page.locator(selector).first().evaluate((e,p)=>getComputedStyle(e).getPropertyValue(p),property);
  for(const [id,{vars:v}] of Object.entries(themes).filter(([,t])=>t.vars)){
   await page.evaluate(v=>{BeautyGPTTheme.applyTheme(v);BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',bgPrimary:v.bgPrimary})},v);
   const bubbleForeground=await page.evaluate(c=>BeautyGPTTheme.contrastOn(c),v.bubbleUser);
   assert.equal(await css('#guest-bubble','background-color'),rgb(v.bubbleUser),id+' sent user bubble');
   assert.equal(await css('#guest-bubble p','color'),rgb(bubbleForeground));
   assert.equal(await css('#guest-bubble strong','color'),rgb(bubbleForeground));
   for(const sel of ['#guest-user','#guest-user-shell','#guest-assistant','#message-actions'])assert.equal(await css(sel,'background-color'),transparent,id+' keep non-bubble structure transparent');
   assert.equal(await css('#guest-bubble','border-radius'),'24px','native bubble geometry');
   const sizes=await page.evaluate(()=>({outer:document.querySelector('#guest-user-shell').getBoundingClientRect().width,bubble:document.querySelector('#guest-bubble').getBoundingClientRect().width}));
   assert.ok(sizes.outer>sizes.bubble+100,'full-width animation shell is distinct from the text bubble');
   // A newly mounted user row must pick up CSS immediately, before an observer.
   const newBubble=await page.evaluate(()=>{const row=document.createElement('li');row.setAttribute('data-message-role','user');row.innerHTML='<h4 hidden>你说：</h4><div data-submit-message-animation-target><div><div data-octane-hydrate-id="late"><div data-user-message-bubble class="guest-bubble"><p data-user-message-copy>新消息</p></div></div></div></div>';document.querySelector('[data-conversation-transcript]').append(row);const bg=getComputedStyle(row.querySelector('[data-user-message-bubble]')).backgroundColor;row.remove();return bg});
   assert.equal(newBubble,rgb(v.bubbleUser),id+' first render of new user bubble');
   for(const sel of ['[data-slot=header]>span[aria-hidden]','[data-ds-composer]>span[aria-hidden]']){
    assert.equal(await css(sel,'background-color'),transparent,id+' decorative mask removed');
    assert.equal(await css(sel,'mask-image'),'none');
   }
   for(const sel of ['[data-header-wordmark] span','[data-mobile-landing-heading] span','[data-composer-action]'])assert.equal(await css(sel,'color'),rgb(v.textPrimary),id+' '+sel);
   assert.equal(await css('[data-mobile-composer]','background-color'),rgb(v.inputBg));
   assert.equal(await css('textarea','color'),rgb(v.textPrimary));
   const placeholder=await page.locator('textarea').evaluate(e=>getComputedStyle(e,'::placeholder').color);
   assert.equal(placeholder,rgb(v.textSecondary));
   assert.equal(await css('[data-privacy-legal-notice]>span','color'),rgb(v.textSecondary));
   assert.equal(await css('[data-privacy-legal-notice] a','color'),rgb(v.textPrimary));
   for(const sel of ['[data-composer-action]','[data-start-dictation]','[data-start-voice]','button[aria-controls]','[data-slot=sidebar-rail] button']){
    assert.equal(await css(sel,'background-color'),transparent,id+' plain icon background');
    assert.equal(await css(sel,'border-top-color'),transparent,id+' no icon circle border');
    assert.equal(await css(sel,'box-shadow'),'none');
    for(const pseudo of ['::before','::after']){
     const paint=await page.locator(sel).first().evaluate((e,p)=>{const c=getComputedStyle(e,p);return{bg:c.backgroundColor,border:c.borderTopColor,shadow:c.boxShadow}},pseudo);
     assert.deepEqual(paint,{bg:transparent,border:transparent,shadow:'none'},id+' no pseudo circle');
    }
   }
   assert.equal(await page.locator('[data-variant=primary]').first().evaluate(e=>getComputedStyle(e,'::before').backgroundColor),rgb(v.accent));
   const foreground=await page.evaluate(c=>BeautyGPTTheme.contrastOn(c),v.accent);
   assert.equal(await css('[data-start-voice] svg','color'),rgb(v.textPrimary));
   assert.equal(await css('[data-empty-composer-help]','background-color'),rgb(v.bgSecondary));
   assert.equal(await css('#attachment-tools','background-color'),rgb(v.bgPrimary));
   assert.equal(await css('#attachment-tools p','color'),rgb(v.textSecondary));
   assert.equal(await css('#rail-shell','background-color'),rgb(v.bgSidebar));
   assert.equal(await css('[data-slot=sidebar-rail] button','color'),rgb(v.textPrimary));
   // Hidden/inert UI remains hidden until the site's own action opens it.
   assert.equal(await css('#ds-sidebar','display'),'none');
   assert.equal(await css('input[type=file]','display'),'none');
   assert.equal(await css('dialog','display'),'none');
   await page.evaluate(()=>document.querySelector('dialog').showModal());
   assert.equal(await css('[data-bottom-sheet-surface]','background-color'),rgb(v.bgPrimary));
   assert.equal(await css('[data-bottom-sheet-content] h2','color'),rgb(v.textPrimary));
   assert.equal(await css('[data-auth-provider] span','color'),rgb(v.textPrimary));
   assert.equal(await css('input[type=email]','background-color'),rgb(v.inputBg));
   assert.equal(await css('dialog [data-variant=primary] span','color'),rgb(foreground));
   await page.evaluate(()=>{document.querySelector('dialog').close();document.querySelector('[data-start-voice]').hidden=true;document.querySelector('[data-composer-submit]').hidden=false});
   assert.equal(await css('[data-composer-submit]','background-color'),rgb(v.accent));
   await page.evaluate(()=>{document.querySelector('[data-start-voice]').hidden=false;document.querySelector('[data-composer-submit]').hidden=true});
   await page.evaluate(v=>{BeautyGPTTheme.applyWallpaper({enabled:false});BeautyGPTTheme.ensureThemeAlive(v)},v);
   assert.equal(await css('[data-slot=header]>span[aria-hidden]','background-color'),rgb(v.bgPrimary));
   console.log('PASS: '+id+' logged-out header/footer masks, controls, composer, privacy, modal, send and native visibility');
  }
  await page.evaluate(v=>{document.querySelector('#guest-user-shell').style.setProperty('background','#2a4a38','important');BeautyGPTTheme.ensureThemeAlive(v)},themes.mono.vars);
  assert.equal(await css('#guest-user-shell','background-color'),transparent,'remove stale 1.3.4 outer inline fill');
  for(const [bubble,foreground]of [['#111111','rgb(255, 255, 255)'],['#ffeeaa','rgb(0, 0, 0)']]){
   await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),{...themes.sakura.vars,bubbleUser:bubble});
   assert.equal(await css('#guest-bubble','background-color'),rgb(bubble),'custom bubble color');
   assert.equal(await css('#guest-bubble p','color'),foreground,'custom bubble foreground contrast');
  }
  console.log('PASS: 7 preset user bubbles, newly mounted messages, custom light/dark bubble colors and native geometry');
  // Feature pages do not have the home chat composer. Both the header login
  // marker and the product-card marker must independently enable guest theming.
  await page.evaluate(()=>{
   document.querySelector('[data-ds-composer]').remove();
   document.querySelector('[data-slot=header] [data-variant=primary]').setAttribute('data-login-button','');
   document.querySelector('[data-header-wordmark]').setAttribute('data-octane-product-card-trigger','desktop-chatgpt-product-card');
   document.querySelector('[data-octane-product-card]').outerHTML='<div data-octane-product-card popover="manual"><div aria-hidden="true" data-tone="chatgpt" style="height:60px;background:linear-gradient(blue,white)"></div><p>免费试用高级功能</p><button data-w-component="button" data-variant="primary"><span>登录</span></button></div>';
   const sidebar=document.querySelector('#ds-sidebar');sidebar.hidden=false;
   sidebar.insertAdjacentHTML('beforeend','<div id="sidebar-login-card" style="background:#212121;color:#111"><h2>获取为你量身定制的回复</h2><p>登录以保存聊天</p><button data-w-component="button" data-variant="secondary">登录</button></div><div data-slot="sidebar-actions" style="background:black"><span aria-hidden="true" style="display:block;height:30px;background:black;mask-image:linear-gradient(transparent,black)"></span><a data-w-component="link-button">设置</a></div>');
  });
  for(const route of ['/images','/plugins'])for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   for(const [id,{vars:v}]of Object.entries(themes).filter(([,t])=>t.vars)){
    await page.evaluate(({route,v})=>{history.pushState({},'',route);BeautyGPTTheme.applyTheme(v)}, {route,v});
    assert.equal(await css('#ds-sidebar','background-color'),rgb(v.bgSidebar),route+' '+width+' '+id+' drawer');
    assert.equal(await css('#sidebar-login-card','background-color'),transparent,'no nested black login card');
    assert.equal(await css('#sidebar-login-card h2','color'),rgb(v.textPrimary));
    assert.equal(await css('[data-slot=sidebar-actions]>span','background-color'),rgb(v.bgSidebar));
    assert.equal(await css('[data-slot=sidebar-actions]>span','mask-image'),'none');
    await page.locator('[data-header-wordmark]').hover();
    const hover=await css('[data-header-wordmark]','background-color');
    assert.deepEqual(hover.match(/[\d.]+/g).map(Number).slice(0,3),rgb(v.accent).match(/\d+/g).map(Number),'themed wordmark hover');
    await page.evaluate(()=>document.querySelector('[data-octane-product-card]').showPopover());
    assert.equal(await css('[data-octane-product-card]','background-color'),rgb(v.bgPrimary));
    const button=page.locator('[data-octane-product-card] button');
    for(const pseudo of ['::before','::after']){
     assert.equal(await button.evaluate((e,p)=>getComputedStyle(e,p).borderTopColor,pseudo),transparent,'no inner login ring');
     assert.equal(await button.evaluate((e,p)=>getComputedStyle(e,p).boxShadow,pseudo),'none');
    }
    assert.equal(await css('[data-octane-product-card] button','border-top-color'),transparent);
    assert.equal(await css('[data-octane-product-card] button span','color'),rgb(await page.evaluate(c=>BeautyGPTTheme.contrastOn(c),v.accent)));
    assert.notEqual(await css('[data-octane-product-card]>[data-tone]','background-image'),'linear-gradient(rgb(0, 0, 255), rgb(255, 255, 255))');
    await page.evaluate(()=>document.querySelector('[data-octane-product-card]').hidePopover());
    // Header-only and product-card-only shells both work independently.
    await page.evaluate(()=>{document.querySelector('[data-octane-product-card]').id='guest-test-card';document.querySelector('#guest-test-card').removeAttribute('data-octane-product-card')});
    assert.equal(await css('#ds-sidebar','background-color'),rgb(v.bgSidebar),'header-only guest detection');
    await page.evaluate(()=>{document.querySelector('#guest-test-card').setAttribute('data-octane-product-card','');document.querySelector('[data-login-button]').removeAttribute('data-login-button')});
    assert.equal(await css('#ds-sidebar','background-color'),rgb(v.bgSidebar),'product-card-only guest detection');
    await page.evaluate(()=>document.querySelector('[data-slot=header] [data-variant=primary]').setAttribute('data-login-button',''));
   }
   console.log('PASS: '+route+' '+width+'px no-composer guest shell, wordmark hover, popover login rings and drawer internals across 7 presets');
  }
  // Restore a composer for the native reset/mobile checks below.
  await page.evaluate(html=>{document.querySelector('#ds-sidebar').hidden=true;document.body.insertAdjacentHTML('beforeend',html)},fixture.match(/<footer[\s\S]*?<\/footer>/)[0]);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),themes.sakura.vars);
  const bounds=await page.locator('[data-mobile-composer]').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
  fs.mkdirSync('tools/test-results/logged-out',{recursive:true});
  await page.screenshot({path:'tools/test-results/logged-out/sakura-mobile.png'});
  await page.evaluate(()=>BeautyGPTTheme.applyTheme(null));
  assert.equal(await css('[data-slot=header]>span[aria-hidden]','background-color'),'rgb(0, 0, 0)');
  assert.equal(await css('[data-start-voice]','background-color'),'rgb(53, 102, 240)');
  assert.equal(await css('#guest-bubble','background-color'),'rgb(2, 5, 98)','reset restores native bubble');
  await page.evaluate(()=>BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',bgPrimary:'#fff'}));
  assert.equal(await css('[data-slot=header]>span[aria-hidden]','background-color'),transparent,'default theme wallpaper clears the native mask too');
  assert.deepEqual(errors,[]);console.log('PASS: narrow composer bounds, default reset and zero browser errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

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
 <main data-slot="conversation"></main><div id="rail-shell" style="background:black"><nav data-slot="sidebar-rail"><button aria-label="ChatGPT">ChatGPT</button><a data-w-component="link-button">图像</a></nav><aside id="ds-sidebar" hidden inert><p>聊天记录</p><a data-w-component="link-button" data-status="active">新聊天</a></aside></div>
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
   assert.equal(await css('[data-start-voice]','background-color'),rgb(v.accent));
   const foreground=await page.evaluate(c=>BeautyGPTTheme.contrastOn(c),v.accent);
   assert.equal(await css('[data-start-voice] svg','color'),rgb(foreground));
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
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),themes.sakura.vars);
  const bounds=await page.locator('[data-mobile-composer]').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
  fs.mkdirSync('tools/test-results/logged-out',{recursive:true});
  await page.screenshot({path:'tools/test-results/logged-out/sakura-mobile.png'});
  await page.evaluate(()=>BeautyGPTTheme.applyTheme(null));
  assert.equal(await css('[data-slot=header]>span[aria-hidden]','background-color'),'rgb(0, 0, 0)');
  assert.equal(await css('[data-start-voice]','background-color'),'rgb(53, 102, 240)');
  await page.evaluate(()=>BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',bgPrimary:'#fff'}));
  assert.equal(await css('[data-slot=header]>span[aria-hidden]','background-color'),transparent,'default theme wallpaper clears the native mask too');
  assert.deepEqual(errors,[]);console.log('PASS: narrow composer bounds, default reset and zero browser errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

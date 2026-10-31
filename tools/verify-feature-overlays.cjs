// DOM shapes observed on the real health, finances, GPT and model menu pages.
// Local rendering only: no health/financial account connections or model changes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const themes=JSON.parse(fs.readFileSync('src/themes.json','utf8'));
const clear='rgba(0, 0, 0, 0)';
const rgb=h=>`rgb(${[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')})`;
const wallpaper='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const fixture=`<style>
 body{margin:0;font:16px system-ui}main{padding-left:60px}.banner{height:94px;background:var(--color-surface-secondary,#222)}
 .bg-surface{background:var(--color-surface,#111)}
 .shell-test{position:relative;isolation:isolate;width:100%;height:76px}
 .shell-test::before{content:"";position:absolute;inset:0;background:var(--color-surface,#111);z-index:-1}
 .content-test{padding:16px}.headerRow-test{display:flex;height:44px;align-items:center;justify-content:space-between}h1{margin:0;font-size:24px}
 .demo-card{margin:250px auto 0;width:500px;max-width:90%;height:200px;background:#212121;color:white;border-radius:24px;padding:20px}
 .chart-bar{width:8px;height:24px;background:#008cff}.artworkFade-test{position:absolute;bottom:0;left:10%;width:80%;height:100px;background:linear-gradient(transparent,var(--color-surface,#111))}
 [data-model-picker-power-slider]{width:300px;margin:30px}#root{position:relative;display:block;height:36px}
 #track{position:absolute;inset:4px 0;background:#ccc;border-radius:16px}#range{display:block;width:50%;height:100%;background:#ee7c37}
 #visual-rail{position:absolute;inset:0}#visual-thumb{display:block;width:36px;height:36px;border-radius:50%;background:white}
 </style><main><div><div id="feature-page-shell" class="h-full bg-surface"><div class="banner">GPT notice</div><div class="shell-test"><div class="content-test"><div class="headerRow-test"><h1>Feature</h1><input type="search" placeholder="搜索"></div></div></div>
 <div class="demo-card"><p>Health preview</p><div class="chart-bar"></div></div><div class="artworkFade-test bg-linear-to-b from-transparent via-transparent to-surface"></div>
 <div role="menu" data-radix-menu-content><div id="power-menuitem" role="menuitem" data-highlighted><div data-model-picker-power-slider><span id="root" data-orientation="horizontal" data-highlighted="false"><span id="track" data-orientation="horizontal"><span id="range" aria-hidden="true"></span><div><span data-selected="true"></span></div></span><div id="visual-rail" aria-hidden="true"><span><span><span id="visual-thumb"></span></span></span></div><span><span role="slider" aria-hidden="true" data-orientation="horizontal" aria-valuenow="2"></span></span></span></div></div><div id="highlight-option" role="menuitem" data-highlighted>Model option</div></div></div></div></main>`;
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
  const css=(s,p,pseudo)=>page.locator(s).first().evaluate((e,{p,pseudo})=>getComputedStyle(e,pseudo).getPropertyValue(p),{p,pseudo});
  for(const route of ['/health','/finances','/gpts']){
   await page.goto('https://chatgpt.com'+route);await page.addScriptTag({path:'src/theme-engine.js'});
   for(const [id,{vars:v}]of Object.entries(themes).filter(([,t])=>t.vars)){
    await page.evaluate(({v,url})=>{BeautyGPTTheme.applyTheme(v);BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url,bgPrimary:v.bgPrimary});BeautyGPTTheme.ensureThemeAlive(v)},{v,url:wallpaper});
    assert.equal(await css('.shell-test','background-color','::before'),clear,route+' '+id+' header pseudo fill');
    assert.equal(await css('#feature-page-shell','background-color'),clear,'clear the nested full-height page shell, not just its header');
    assert.equal(await css('.artworkFade-test','background-image'),'none','health decorative fade');
    assert.equal(await css('.demo-card','background-color'),'rgb(33, 33, 33)','preserve the actual demo card');
    assert.equal(await css('.banner','background-color'),rgb(v.bgSecondary),'preserve the GPT notice above the header');
    assert.equal(await css('.chart-bar','background-color'),'rgb(0, 140, 255)','preserve chart color');
    for(const state of ['false','true','']){
     await page.locator('#root').evaluate((e,s)=>e.setAttribute('data-highlighted',s),state);
     assert.equal(await css('#root','background-color'),clear,'non-menuitem slider root highlight='+state);
     assert.equal(await css('#root','box-shadow'),'none');
    }
    assert.notEqual(await css('#highlight-option','background-color'),clear,'real highlighted menu items retain feedback');
    await page.locator('#power-menuitem').hover();
    assert.equal(await css('#power-menuitem','background-color'),clear,'slider menuitem must not paint a hover rectangle behind the rail');
    assert.equal(await css('#root','overflow'),'visible','do not clip the moving thumb');
    assert.equal(await css('#visual-thumb','width'),'36px');assert.equal(await css('#visual-thumb','height'),'36px');
    const firstPaint=await page.evaluate(()=>{const shell=document.createElement('div');shell.className='shell-test';shell.innerHTML='<div class="content-test"><div class="headerRow-test"></div></div>';document.querySelector('main').prepend(shell);const bg=getComputedStyle(shell,'::before').backgroundColor;shell.remove();return bg});
    assert.equal(firstPaint,clear,'shared header transparent before title/search mount');
    await page.evaluate(v=>{BeautyGPTTheme.applyWallpaper({enabled:false});BeautyGPTTheme.ensureThemeAlive(v)},v);
    assert.notEqual(await css('.shell-test','background-color','::before'),clear,'restore native header when wallpaper is disabled');
    assert.notEqual(await css('.artworkFade-test','background-image'),'none','restore native artwork fade');
    console.log('PASS: '+route+' '+id+' header/fade, native card, slider rectangle and wallpaper toggle');
   }
   await page.evaluate(url=>{BeautyGPTTheme.applyTheme(null);BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url,bgPrimary:'#fff'})},wallpaper);
   assert.equal(await css('.shell-test','background-color','::before'),clear,'default-theme wallpaper header');
   assert.equal(await css('.artworkFade-test','background-image'),'none','default-theme wallpaper fade');
  }
  assert.deepEqual(errors,[]);console.log('PASS: default-theme wallpaper and zero browser errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

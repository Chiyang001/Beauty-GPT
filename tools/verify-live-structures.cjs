// DOM structures observed in the user's real ChatGPT browser on 2026-10-31.
// No account data or live network access is needed to run this regression suite.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const themes = JSON.parse(fs.readFileSync('src/themes.json', 'utf8'));
const rgb = hex => `rgb(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')})`;
const luminance = c => c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const channels = c => c.match(/[\d.]+/g).map(Number);
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const fixture = `<style>
 body{margin:0}aside{width:250px;height:800px}.sidebar-item svg{color:#ededed}
 main{height:800px}.rounded-2xl.overflow-hidden.border.border-default{background:#000}
 [data-composer-body]{border-radius:32px;display:flex}.preview{background:#123}
 [data-bgpt-slider-range],#range{height:8px}#track{background:#ddd;height:8px}
 #range{background:#ee7c37}#visual-thumb{width:26px;height:26px;background:#fff;border:1px solid #aaa}
 #slider-root{background:#f58038}.tick{background:#f58038;width:4px;height:4px}
 [role=switch]{width:32px;height:20px}#switch-track{background:#3a83f7;width:32px;height:20px;display:inline-flex}
 #switch-thumb{background:#fff;width:16px;height:16px;transform:translateX(14px)}
 </style><aside class="app-shell-left-panel"><nav aria-label="设置"><button class="sidebar-item" aria-current="page"><svg fill="none"></svg><span>常规</span></button><p class="text-tertiary">个人</p></nav></aside>
 <main><div class="rounded-2xl overflow-hidden border border-default">Settings group</div>
 <button role="switch" aria-checked="true"><span id="switch-track" data-state="checked"><span id="switch-thumb" data-state="checked"></span></span></button>
 <div role="progressbar" style="width:300px;background:#aaa"><div id="storage-fill" style="width:3%;height:12px;background:#000"></div></div>
 <button aria-label="颜色预览"><span id="swatch" style="display:block;width:16px;height:16px;background:#ee7c37"></span></button>
 <label><input type="radio"><span id="dark-preview" style="background:#111;display:block;width:80px;height:40px"></span></label>
 <div class="bg-page-search" style="border-radius:999px;background:pink"><svg></svg><input id="installed-plugins-search" type="text" role="searchbox"></div>
 <div data-composer-body><div contenteditable="true" class="ProseMirror">Ask</div><button aria-label="开始语音">Voice</button></div>
 <div role="menu"><div data-model-picker-power-slider><span id="slider-root" dir="ltr" data-orientation="horizontal"><span id="track" data-orientation="horizontal"><span id="range" aria-hidden="true"></span><div><span class="tick" data-selected="true"></span><span class="tick" data-selected="false"></span></div></span><div aria-hidden="true"><span><span><span id="visual-thumb"></span></span></span></div><span><span role="slider" aria-hidden="true" data-orientation="horizontal" aria-valuenow="3"></span></span></span></div></div>
 <div data-dil-message-id="fixture"><span data-d-component="popover-trigger" data-d-inline-text role="button" aria-haspopup="dialog"><span><div id="citation" data-d-component="badge" data-pill style="background:#414141"><span data-d-component="text" style="color:#4a2838">Source</span></div></span></span><div id="content-card" data-d-component="box" data-d-has-border><div id="progress" style="background:#22aa44">65%</div></div></div>
 <div id="toolbar" class="browser:bg-surface" style="background:white"><button aria-label="Chat actions"></button></div><div id="share-toolbar" class="browser:bg-surface" style="background:white"><button aria-label="分享"></button></div>
 </main><section id="inactive-route" style="display:none;opacity:0;visibility:hidden;pointer-events:none"><main>Old page</main></section>
 <div class="preview rounded-2xl"><div class="ProseMirror" contenteditable="false">Document preview</div></div>`;

(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
  await page.goto('https://chatgpt.com/settings/general');
  await page.addScriptTag({path:'src/theme-engine.js'});
  for(const [id,theme] of Object.entries(themes).filter(([,t])=>t.vars)){
   await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),theme.vars);
   const v=theme.vars,values=await page.evaluate(()=>{
    const c=s=>getComputedStyle(document.querySelector(s));return {
     track:c('#switch-track').backgroundColor,thumb:c('#switch-thumb').backgroundColor,
     progress:c('#storage-fill').backgroundColor,progressWidth:c('#storage-fill').width,
     switchWidth:c('[role=switch]').width,thumbTransform:c('#switch-thumb').transform,
     swatch:c('#swatch').backgroundColor,preview:c('#dark-preview').backgroundColor,
     search:c('.bg-page-search').backgroundColor,searchInput:c('#installed-plugins-search').backgroundColor,
     icon:c('.sidebar-item svg').color,selected:c('.sidebar-item').color,selectedBg:c('.sidebar-item').backgroundColor,
     secondary:c('.text-tertiary').color,group:c('main > .rounded-2xl').backgroundColor,
     hidden:c('#inactive-route').display,opacity:c('#inactive-route').opacity,
     visibility:c('#inactive-route').visibility,pointer:c('#inactive-route').pointerEvents,
     docPreview:c('.preview').backgroundColor,oldEditors:document.querySelectorAll('[data-composer-body]').length};
   });
   assert.equal(values.track,rgb(v.accent));assert.notEqual(values.thumb,'rgba(0, 0, 0, 0)');
   assert.equal(values.progress,rgb(v.accent));assert.equal(values.progressWidth,'9px');
   assert.equal(values.switchWidth,'32px');assert.equal(values.thumbTransform,'matrix(1, 0, 0, 1, 14, 0)');
   assert.equal(values.swatch,'rgb(238, 124, 55)');assert.equal(values.preview,'rgb(17, 17, 17)');
   assert.equal(values.search,rgb(v.inputBg));assert.equal(values.searchInput,'rgba(0, 0, 0, 0)');
   assert.equal(values.icon,values.selected);assert.equal(values.group,'rgba(0, 0, 0, 0)');
   assert.equal(values.hidden,'none');assert.equal(values.opacity,'0');assert.equal(values.visibility,'hidden');assert.equal(values.pointer,'none');
   assert.equal(values.docPreview,'rgb(17, 34, 51)');
   const sideBg=channels(rgb(v.bgSidebar)), selectedBg=channels(values.selectedBg);
   const composite=selectedBg.slice(0,3).map((n,i)=>n*(selectedBg[3]??1)+sideBg[i]*(1-(selectedBg[3]??1)));
   assert.ok(contrast(channels(values.selected),composite)>=4.5,id+' selected sidebar contrast');
   assert.ok(contrast(channels(values.secondary),sideBg)>=4.5,id+' sidebar label contrast');
   const foreground=await page.evaluate(color=>BeautyGPTTheme.contrastOn(color),v.accent);
   assert.ok(contrast(channels(rgb(foreground)),channels(rgb(v.accent)))>=4.5,id+' primary foreground contrast');
  }
  await page.evaluate(()=>{document.querySelector('[role=switch]').setAttribute('aria-checked','false')});
  assert.equal(await page.locator('#switch-track').evaluate(e=>getComputedStyle(e).backgroundColor),rgb(themes.mono.vars.border));
  await page.evaluate(v=>{history.pushState({},'', '/c/fixture');BeautyGPTTheme.applyTheme(v);BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',bgPrimary:v.bgPrimary});BeautyGPTTheme.ensureThemeAlive(v)},themes.sakura.vars);
  const rich=await page.evaluate(()=>{const c=s=>getComputedStyle(document.querySelector(s));return{range:c('#range').backgroundColor,thumb:c('#visual-thumb').backgroundColor,root:c('#slider-root').backgroundColor,citation:c('#citation').backgroundColor,text:c('#citation span').color,card:c('#content-card').backgroundColor,progress:c('#progress').backgroundColor,toolbar:c('#toolbar').backgroundColor}});
  assert.equal(rich.range,rgb(themes.sakura.vars.accent));assert.equal(rich.thumb,rgb(themes.sakura.vars.inputBg));assert.equal(rich.root,'rgba(0, 0, 0, 0)');
  assert.equal(rich.citation,rgb(themes.sakura.vars.bgSecondary));assert.equal(rich.text,rgb(themes.sakura.vars.textPrimary));assert.equal(rich.card,'rgba(0, 0, 0, 0)');assert.equal(rich.progress,'rgb(34, 170, 68)');assert.equal(rich.toolbar,'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('#share-toolbar').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.evaluate(v=>{history.pushState({},'', '/plugins');document.querySelector('main').insertAdjacentHTML('beforeend','<div id="plugin-card"><a data-discover="true" href="/plugins/test">Plugin</a></div><div id="skill-card" role="button" class="rounded-2xl">Skill</div><div data-automation-card><button id="task-card">Task</button></div><input id="library-search-test"><div id="library-list" role="grid" aria-multiselectable="true">Files</div>');BeautyGPTTheme.ensureThemeAlive(v)},themes.sakura.vars);
  for(const selector of ['#plugin-card','#skill-card','#task-card','#library-list'])assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)',selector+' transparent content surface');
  await page.evaluate(()=>{document.querySelector('[data-composer-body]').style.opacity='.37';BeautyGPTTheme.applyTheme(null);BeautyGPTTheme.applyWallpaper({enabled:false})});
  assert.equal(await page.locator('#inactive-route').evaluate(e=>getComputedStyle(e).display),'none');
  assert.equal(await page.locator('[data-composer-body]').evaluate(e=>e.style.opacity),'0.37');
  assert.equal(await page.locator('[data-composer-body]').evaluate(e=>getComputedStyle(e).borderRadius),'32px');
  assert.deepEqual(errors,[]);
  console.log('PASS: observed live switches, swatches, sidebar contrast, visual slider, DIL citations/cards, toolbar, hidden routes and native style preservation');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

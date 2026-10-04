// Run with Playwright installed, or set NODE_PATH to the bundled node_modules.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const themes=JSON.parse(fs.readFileSync('src/themes.json','utf8'));
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(`<style>body{margin:0}.layout{display:flex;height:900px}.sidebar{width:280px;flex-shrink:0}.hashed-shell{background:#000;color:#fff}.bg-black{background:#000;color:#fff}.dark{--bg-primary:#000}.text-primary{color:var(--text-primary)}.bg-primary{background:var(--bg-primary)}main{flex:1}span,h1{background:#000}button{border:0} [data-composer-surface]{border-radius:28px}</style><div class="layout hashed-shell"><div class="sidebar bg-black"><button id="back">返回应用</button><nav><button aria-current="page"><svg width="20" height="20"></svg><span>常规</span></button><button><span>外观</span></button></nav></div><main class="dark bg-primary"><h1 class="text-primary">常规</h1><div class="bg-black"><p>语言</p><button role="combobox"><span>自动检测</span></button></div></main></div>`);
 await page.addScriptTag({path:'src/theme-engine.js'});
 for(const name of Object.keys(themes).filter(name=>themes[name].vars)){
  const v=themes[name].vars;
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),v);
  const result=await page.evaluate(()=>{const cs=s=>getComputedStyle(document.querySelector(s));return {settings:document.documentElement.classList.contains('beauty-gpt-settings'),main:cs('main').backgroundColor,nav:cs('nav').backgroundColor,textBg:cs('nav span').backgroundColor,headingBg:cs('h1').backgroundColor,heading:cs('h1').color,root:cs('.layout').backgroundColor,selected:cs('nav button').backgroundColor}});
  const rgb=h=>`rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;
  assert.equal(result.settings,true);assert.equal(result.main,rgb(v.bgPrimary));assert.equal(result.root,rgb(v.bgPrimary));assert.equal(result.nav,rgb(v.bgSidebar));assert.equal(result.textBg,'rgba(0, 0, 0, 0)');assert.equal(result.headingBg,'rgba(0, 0, 0, 0)');assert.equal(result.heading,rgb(v.textPrimary));assert.notEqual(result.selected,'rgba(0, 0, 0, 0)');
 }
 await page.evaluate(v=>{BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',bgPrimary:v.bgPrimary,mediaType:'image'});BeautyGPTTheme.ensureThemeAlive(v)},themes.sakura.vars);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('main')).backgroundColor),'rgb(255, 248, 250)');
 await page.evaluate(()=>{document.querySelector('#back').remove();document.querySelector('main').innerHTML='<form><div data-composer-surface=""><textarea id="mobile-composer-prompt" placeholder="Ask"></textarea><button>Send</button></div></form>';});
 // Apply a real theme following the simulated SPA navigation.
 await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),themes.sakura.vars);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('beauty-gpt-settings')),false);
 assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-bgpt-settings-nav]').length),0);
 const composer=await page.evaluate(()=>getComputedStyle(document.querySelector('[data-composer-surface]')).backgroundColor);
 assert.equal(composer,'rgb(255, 255, 255)');
 await page.evaluate(()=>BeautyGPTTheme.applyTheme(null));
 assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-bgpt-inline]').length),0);
 // Logged-in app-shell structure observed on 2026-10-04. Native rules
 // consume the new namespace rather than the legacy --bg-primary aliases.
 await page.setContent(`<style>
 :root{--color-surface:#000;--color-surface-secondary:#000;--app-color-background-elevated-primary:#1b1b1b;--app-color-text-foreground:#ededed;--color-text-secondary:#cdcdcd;--color-background-primary-ghost-hover:#222}
 body{margin:0;display:flex;height:900px;color:var(--app-color-text-foreground)}
 aside{width:280px}.bg-surface{background:var(--color-surface)}
 main{flex:1;background:var(--color-surface)}
 [data-composer-body]{background:var(--app-color-background-elevated-primary);border-radius:28px}
 .muted{color:var(--color-text-secondary)}
 .sidebar-item:hover{background:var(--color-background-primary-ghost-hover)}
 </style><aside class="app-shell-left-panel bg-surface"><div class="bg-surface"><button class="sidebar-item">New chat<svg fill="none"><path/></svg></button><p class="muted">Projects</p></div></aside><main><form><div data-composer-body data-composer-layout="single-line"><div class="ProseMirror" contenteditable="true"><p data-placeholder="Ask"></p></div><button>Voice</button></div></form><div role="menu" class="bg-surface">Menu</div></main>`);
 await page.addScriptTag({path:'src/theme-engine.js'});
 for(const name of ['sakura','midnight']){
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),themes[name].vars);
  const rgb=h=>`rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;
  const values=await page.evaluate(()=>{const cs=s=>getComputedStyle(document.querySelector(s));return{main:cs('main').backgroundColor,sidebar:cs('aside .bg-surface').backgroundColor,composer:cs('[data-composer-body]').backgroundColor,muted:cs('.muted').color,text:cs('.ProseMirror').color,fill:document.querySelector('svg').getAttribute('fill'),radius:cs('[data-composer-body]').borderRadius}});
  assert.equal(values.main,rgb(themes[name].vars.bgPrimary));
  assert.equal(values.sidebar,rgb(themes[name].vars.bgSidebar));
  assert.equal(values.composer,rgb(themes[name].vars.inputBg));
  assert.equal(values.muted,rgb(themes[name].vars.textSecondary));
  assert.equal(values.text,rgb(themes[name].vars.textPrimary));
  assert.equal(values.fill,'none');assert.equal(values.radius,'28px');
 }
 await page.evaluate(()=>BeautyGPTTheme.applyTheme(null));
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('main')).backgroundColor),'rgb(0, 0, 0)');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-composer-body]')).backgroundColor),'rgb(27, 27, 27)');
 await page.setContent(`<style>body{margin:0}.app-shell-left-panel{width:280px;height:900px}.track{background:var(--color-background-mode-toggle-track)}.indicator{background:var(--color-background-mode-toggle-selected)}[aria-pressed="true"]{color:var(--color-text-mode-toggle-primary)}[aria-pressed="false"]{color:var(--color-text-mode-toggle-inactive)}[data-sidebar-header-search]{border-radius:999px;height:36px}input{outline:none}</style><aside class="app-shell-left-panel"><button aria-label="搜索"><svg fill="none"/></button></aside><main><div role="group" aria-label="撰写器模式"><span class="track"></span><span class="indicator"></span><button aria-pressed="true">聊天</button><button aria-pressed="false">工作</button></div></main>`);
 await page.addScriptTag({path:'src/theme-engine.js'});
 for(const name of ['sakura','midnight']){
  const v=themes[name].vars;
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),v);
  const rgb=h=>`rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;
  const cs=await page.evaluate(()=>{const c=s=>getComputedStyle(document.querySelector(s));return {search:c('[aria-label="搜索"]').backgroundColor,track:c('.track').backgroundColor,selected:c('.indicator').backgroundColor,on:c('[aria-pressed="true"]').color,off:c('[aria-pressed="false"]').color}});
  assert.equal(cs.search,'rgba(0, 0, 0, 0)');assert.equal(cs.track,rgb(v.bgSecondary));assert.equal(cs.selected,rgb(v.inputBg));assert.equal(cs.on,rgb(v.textPrimary));assert.equal(cs.off,rgb(v.textSecondary));
 }
 await page.evaluate(()=>{document.querySelector('aside').insertAdjacentHTML('beforeend','<button>返回应用</button><div data-sidebar-header-search="true"><svg/><input id="settings-search" type="text" placeholder="搜索"></div>')});
 for(const name of ['sakura','midnight']){
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),themes[name].vars);
  const field=await page.evaluate(()=>{const e=document.querySelector('#settings-search'),parent=getComputedStyle(e.parentElement);return{inner:getComputedStyle(e).backgroundColor,bg:parent.backgroundColor,border:parent.boxShadow,radius:parent.borderRadius}});
  assert.equal(field.inner,'rgba(0, 0, 0, 0)');assert.notEqual(field.bg,'rgba(0, 0, 0, 0)');assert.notEqual(field.border,'none');assert.equal(field.radius,'999px');
  await page.locator('#settings-search').focus();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-sidebar-header-search]')).outlineStyle),'solid');
 }
 // The footer scrim disappears with wallpaper; the composer and popovers stay solid.
 await page.setContent(`<style>[role="menu"]{background:var(--bg-elevated-primary)}[data-thread-scroll-footer]{background:#000;backdrop-filter:blur(12px)}.pointer-events-none{background:#000;backdrop-filter:blur(12px)}.pointer-events-none::before{content:"";background:linear-gradient(#000,transparent);backdrop-filter:blur(12px)}#thread-bottom-container::before{content:"";background:linear-gradient(#000,transparent)}</style><main><div class="thread-scroll-container"><div aria-hidden="true" class="pointer-events-none sticky bottom-0"><div id="disclaimer-fade" aria-hidden="true" class="pointer-events-none bg-gradient-to-t from-surface" style="background-image:linear-gradient(#000,transparent)"></div></div></div><div data-thread-scroll-footer="true"><div aria-hidden="true" class="pointer-events-none"></div><div><form><div data-composer-body><div class="ProseMirror" contenteditable="true"></div></div></form><div role="menu">Menu</div></div></div><div id="thread-bottom-container"></div></main>`);
 await page.addScriptTag({path:'src/theme-engine.js'});
 await page.evaluate(v=>{BeautyGPTTheme.applyTheme(v);BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',bgPrimary:v.bgPrimary,mediaType:'image'});BeautyGPTTheme.ensureThemeAlive(v)},themes.ocean.vars);
 const footer=await page.evaluate(()=>{const c=(s,p)=>getComputedStyle(document.querySelector(s),p);return {background:c('[data-thread-scroll-footer]').backgroundColor,blur:c('[data-thread-scroll-footer]').backdropFilter,scrim:c('[data-thread-scroll-footer] > .pointer-events-none').backgroundColor,pseudo:c('[data-thread-scroll-footer] > .pointer-events-none','::before').backgroundImage,old:c('#thread-bottom-container','::before').backgroundImage,composer:c('[data-composer-body]').backgroundColor,menu:c('[role="menu"]').backgroundColor}});
 assert.equal(footer.background,'rgba(0, 0, 0, 0)');assert.equal(footer.blur,'none');assert.equal(footer.scrim,'rgba(0, 0, 0, 0)');assert.equal(footer.pseudo,'none');assert.equal(footer.old,'none');assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#disclaimer-fade')).backgroundImage),'none');assert.notEqual(footer.composer,'rgba(0, 0, 0, 0)');assert.notEqual(footer.menu,'rgba(0, 0, 0, 0)');
 await page.setContent(`<style>.sticky.bg-surface{background:var(--color-surface)}.sticky.bg-surface::after{content:"";background-image:linear-gradient(#000,transparent)}.bg-page-search{border-radius:999px;border:1px solid #000;background:#222}</style><main><div class="sticky bg-surface"><div><div class="bg-page-search"><svg/><input id="plugins-store-page-search" type="text" class="bg-transparent" placeholder="搜索插件"></div></div></div><div class="card" style="background:#123">Plugin</div></main>`);
 await page.addScriptTag({path:'src/theme-engine.js'});
 for(const name of ['latte','midnight']){
  await page.evaluate(v=>{BeautyGPTTheme.applyTheme(v);BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',bgPrimary:v.bgPrimary,mediaType:'image'});BeautyGPTTheme.ensureThemeAlive(v)},themes[name].vars);
  const values=await page.evaluate(()=>{const c=(s,p)=>getComputedStyle(document.querySelector(s),p);return{strip:c('.sticky').backgroundColor,fade:c('.sticky','::after').backgroundImage,input:c('input').backgroundColor,field:c('.bg-page-search').backgroundColor,card:c('.card').backgroundColor,radius:c('.bg-page-search').borderRadius}});
  assert.equal(values.strip,'rgba(0, 0, 0, 0)');assert.equal(values.fade,'none');assert.equal(values.input,'rgba(0, 0, 0, 0)');assert.notEqual(values.field,'rgba(0, 0, 0, 0)');assert.equal(values.radius,'999px');assert.equal(values.card,'rgb(17, 34, 51)');
 }
 await page.setContent(`<style>[role="tooltip"]{--color-background-tooltip:#000;--color-text-tooltip:#fff;background:var(--color-background-tooltip);color:var(--color-text-tooltip)}kbd{background:#000;color:#fff}.description{color:var(--color-text-tooltip-description)}[data-radix-tooltip-arrow]{fill:#000}.bg-transparent{background:transparent}</style><button>返回应用</button><div role="menu" id="other-menu">Menu</div>`);
 await page.addScriptTag({path:'src/theme-engine.js'});
 for(const name of ['sakura','midnight']){
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),themes[name].vars);
  // Simulate tooltip portals mounting after theme apply, as on mouse hover.
  await page.evaluate(()=>{document.querySelector('#tip')?.remove();document.body.insertAdjacentHTML('beforeend','<div id="tip" role="tooltip" data-side="bottom"><div class="bg-token-bg-primary"><span>Show sidebar</span><p class="description">Description</p><kbd>Ctrl+Shift+S</kbd></div><svg data-radix-tooltip-arrow><polygon/></svg></div>')});
  const v=themes[name].vars,rgb=h=>`rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;
  const values=await page.evaluate(()=>{const c=s=>getComputedStyle(document.querySelector(s));return{bg:c('#tip').backgroundColor,text:c('#tip').color,inner:c('#tip div').backgroundColor,shadow:c('#tip div').boxShadow,description:c('.description').color,key:c('kbd').color,arrow:c('[data-radix-tooltip-arrow]').fill}});
  assert.equal(values.bg,rgb(v.bgSecondary));assert.equal(values.text,rgb(v.textPrimary));assert.equal(values.inner,'rgba(0, 0, 0, 0)');assert.equal(values.shadow,'none');assert.equal(values.description,rgb(v.textSecondary));assert.equal(values.key,rgb(v.textSecondary));assert.equal(values.arrow,rgb(v.bgSecondary));
 }
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: all preset themes, settings with wallpaper, nested theme scope, text backgrounds, navigation state, new composer, theme reset');
})().catch(e=>{console.error(e);process.exit(1)});

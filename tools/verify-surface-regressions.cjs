// Regression cases for the twelve user screenshots. Isolated Chromium pages;
// fixtures combine observed app-shell DOM with equivalent neutral fill styles.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const themes = JSON.parse(fs.readFileSync('src/themes.json', 'utf8'));
const transparent = 'rgba(0, 0, 0, 0)';
const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
const wallpaper = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const output = path.resolve('tools/test-results/surface-regressions');
fs.mkdirSync(output, {recursive:true});
const style = `<style>
 *{box-sizing:border-box}body{margin:0;font:16px system-ui}main{padding:28px;margin-left:230px}
 aside{position:absolute;width:230px;inset:0 auto 0 0;padding:22px}
 h1{font-size:26px}h2{font-size:20px}button,input{font:inherit}button{color:inherit}
 .field{border:1px solid #888;border-radius:999px;padding:12px;display:flex;align-items:center;gap:8px;max-width:420px;margin:12px 0;background:var(--color-surface)}
 .field input{width:100%;min-width:0;border:0;padding:0;background:#fff}.field svg{width:18px;height:18px;flex-shrink:0}
 .field:focus-within{outline:3px solid #d54;box-shadow:0 0 0 6px #c9a}
 input:focus{outline:2px solid #d54;box-shadow:0 0 0 4px #c9a}
 .group{border:1px solid #888;border-radius:22px;padding:22px;margin:22px 0}
 #usage-wrap{background:var(--color-surface-secondary)}.heatmap{display:grid;grid-template-columns:repeat(36,12px);gap:4px}
 .heatmap div{width:12px;height:12px;background:#333;border-radius:4px}.heatmap div:nth-child(9n){background:#f80}
 #motion-row{background:var(--segmented-control-background);display:flex;justify-content:space-between;padding:18px}
 .segmented{background:var(--segmented-control-background);display:flex;gap:12px}.selected{border-radius:12px;background:var(--color-background-segmented-form-selected)}
 #profile{border:1px solid #888;border-radius:24px;padding:24px;width:500px;background:#fff;margin:20px 20px 20px 258px}
 #profile header{display:flex;align-items:center;gap:24px}#profile header h2{flex:1}
 .profile-group{background:#0f0f0f;color:#111;border:1px solid #888;border-radius:20px;padding:20px;margin-top:20px}
 .profile-row{display:flex;justify-content:space-between;align-items:center;padding:16px 0;color:#111}
 [role=switch]{border:0;padding:0;background:#a36;width:48px;height:30px;display:inline-flex}
 [role=switch]>span{width:48px;height:30px;border-radius:20px;display:inline-flex;align-items:center;padding:4px}
 [role=switch]>span>span{width:22px;height:22px;border-radius:50%;transform:translateX(18px);display:block}
 #power{width:320px;padding:25px;background:#fff;border-radius:24px}
 #slider-root{position:relative;display:block;width:260px;height:40px;background:#ffe0eb}
 #slider-track{position:absolute;inset:3px 0;background:#ddd;border-radius:18px}
 #slider-range{position:absolute;inset:0 30% 0 0;background:#f80}
 #visual-rail{position:absolute;inset:0}#scale{position:absolute;left:65%;top:0}
 #spring{display:block;width:40px;height:40px;transform:scale(1);background:var(--color-background-slider-thumb)}
 #visual-thumb{display:block;width:40px;height:40px;border:1px solid #aaa;border-radius:50%;background:#fff}
 #input-wrap{position:absolute;left:65%;width:40px;height:40px;background:#fff}
 #input-thumb{display:block;width:40px;height:40px;background:#fff}
 .neutral{background:var(--color-surface)}#library-header{display:flex;justify-content:space-between;align-items:center;padding:24px}
 #empty-state{padding:120px 40px;text-align:center}#library-grid{padding:20px}
 #preview{background:#123;color:white;padding:20px}#skeleton{width:200px;height:16px;background:#ddd}
 </style>`;
const search = (id, attrs='type="text" placeholder="搜索"') => `<div class="field"><svg viewBox="0 0 20 20"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor"/></svg><input id="${id}" ${attrs}></div>`;
const slider = `<div id="power" data-model-picker-power-slider><span id="slider-root" data-orientation="horizontal"><span id="slider-track" data-orientation="horizontal"><span id="slider-range" aria-hidden="true"></span><div><span data-selected="true"></span></div></span><div id="visual-rail" aria-hidden="true"><span id="scale"><span id="spring"><span id="visual-thumb"></span></span></span></div><span id="input-wrap"><span id="input-thumb" role="slider" aria-hidden="true" data-orientation="horizontal" aria-valuenow="3"></span></span></span></div>`;
const profile = `<div id="profile" role="dialog"><header><h2>编辑个人资料</h2><button>取消</button><button class="btn-primary">保存</button></header><section class="profile-group" id="profile-photo"><div>上传照片</div><div>头像选择</div></section><section class="profile-group" id="profile-options"><h3>对他人可见的内容</h3><div class="profile-row"><span id="profile-label">显示电子邮件地址</span><button role="switch" aria-checked="true"><span data-state="checked"><span data-state="checked"></span></span></button></div></section></div>`;
const settings = style + `<aside>${search('settings-search').replace('class="field"','class="field" data-sidebar-header-search')}</aside><main><h1>设置</h1>${search('plugins-search','role="searchbox" type="text" placeholder="搜索已安装的插件"')}<div id="usage-wrap" class="group"><h2>Token 活动</h2><div class="heatmap">${'<div></div>'.repeat(144)}</div><h2>热门插件</h2><p>Gmail · Calendar · Drive</p><h2>洞察</h2><p>最常用的推理强度</p></div><section class="group"><div id="motion-row"><span>减少动态效果</span><div class="segmented"><span class="selected">系统</span><span>开启</span><span>关闭</span></div></div><p>分别设置浅色和深色模式</p></section><div role="menu">${search('language-search','placeholder="搜索语言"')}<button>自动检测</button></div><label>显示名称 <input id="name-input" type="text" placeholder="名称"></label>${slider}</main>${profile}`;
const library = style + `<aside>资料空间</aside><main><header id="library-header" class="neutral"><h1>图像 / Google Drive</h1>${search('library-search-all')}</header><section id="empty-state" class="neutral"><h2>暂无站点</h2><p>创建网站和应用</p><button class="btn-primary">创建新站点</button></section><div id="library-grid" class="neutral" role="grid" aria-multiselectable="true"><div>名称 · 最近活动时间</div><div id="skeleton"></div></div><div id="preview"><div contenteditable="false" class="ProseMirror">内容预览保留自身颜色</div></div></main>`;

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:settings}));
  await page.goto('https://chatgpt.com/settings/appearance');
  await page.addScriptTag({path:'src/theme-engine.js'});
  for(const [id,theme] of Object.entries(themes).filter(([,t])=>t.vars)){
   await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),theme.vars);
   for(const selector of ['#usage-wrap','#motion-row','.segmented','#profile-photo','#profile-options','#spring','#scale','#visual-rail','#input-wrap','#input-thumb']){
    assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).backgroundColor),transparent,id+' '+selector+' fill');
   }
   assert.equal(await page.locator('#visual-thumb').getAttribute('data-bgpt-slider-thumb'),'');
   assert.equal(await page.locator('#spring').getAttribute('data-bgpt-slider-thumb'),null,'only the leaf is a visual thumb');
   const geometry=await page.locator('#visual-thumb').evaluate(e=>{const c=getComputedStyle(e);return[c.width,c.height,c.borderRadius]});
   assert.deepEqual(geometry,['40px','40px','9999px']);
   assert.equal(await page.locator('#slider-track').evaluate(e=>getComputedStyle(e).overflow),'hidden');
   assert.equal(await page.locator('#visual-thumb').evaluate(e=>getComputedStyle(e).backgroundColor),rgb(theme.vars.inputBg));
   assert.equal(await page.locator('#profile-label').evaluate(e=>getComputedStyle(e).color),rgb(theme.vars.textPrimary));
   assert.equal(await page.locator('#profile [role=switch]').evaluate(e=>getComputedStyle(e).backgroundColor),transparent);
   assert.equal(await page.locator('#profile [role=switch]>span').evaluate(e=>getComputedStyle(e).backgroundColor),rgb(theme.vars.accent));
   assert.equal(await page.locator('#name-input').evaluate(e=>getComputedStyle(e).backgroundColor),rgb(theme.vars.inputBg),'ordinary text fields keep a surface');
   for(const selector of ['#settings-search','#plugins-search','#language-search']){
    await page.locator(selector).focus();
    const states=await page.locator(selector).evaluate(e=>[e,e.parentElement].map(el=>{const c=getComputedStyle(el);return{bg:c.backgroundColor,outline:c.outlineStyle,shadow:c.boxShadow}}));
    assert.equal(states[0].bg,transparent,id+' inner search');
    for(const state of states){assert.equal(state.outline,'none',id+' focus outline');assert.equal(state.shadow,'none',id+' focus shadow')}
   }
   assert.equal(await page.locator('.heatmap div').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(51, 51, 51)');
   assert.equal(await page.locator('.heatmap div').nth(8).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 136, 0)');
   if(id==='sakura')await page.screenshot({path:path.join(output,'settings-sakura.png'),fullPage:true});
   console.log('PASS: '+id+' slider corners, usage, profile, search focus, language and motion row');
  }
  // A profile drawer is also an aside, but must never become settings navigation.
  await page.evaluate(v=>{const old=document.querySelector('#profile'),sheet=document.createElement('aside');sheet.id='profile';sheet.append(...old.childNodes);old.replaceWith(sheet);BeautyGPTTheme.applyTheme(v)},themes.sakura.vars);
  assert.equal(await page.locator('#profile').getAttribute('data-bgpt-settings-nav'),null);
  assert.equal(await page.locator('#profile-photo').evaluate(e=>getComputedStyle(e).backgroundColor),transparent);
  // Profile editor may mount outside the settings route, in a portal sheet.
  await page.evaluate(v=>{history.pushState({},'', '/c/profile-fixture');BeautyGPTTheme.applyTheme(v)},themes.sakura.vars);
  assert.equal(await page.locator('#profile-photo').evaluate(e=>getComputedStyle(e).backgroundColor),transparent);
  assert.equal(await page.locator('#profile-label').evaluate(e=>getComputedStyle(e).color),rgb(themes.sakura.vars.textPrimary));
  await page.evaluate(()=>BeautyGPTTheme.applyTheme(null));
  assert.equal(await page.locator('#profile-photo').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(15, 15, 15)','default restores native profile fill');
  await page.unroute('https://chatgpt.com/**');
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:library}));
  await page.goto('https://chatgpt.com/space?tab=suggested');
  await page.addScriptTag({path:'src/theme-engine.js'});
  for(const [id,theme] of Object.entries(themes).filter(([,t])=>t.vars)){
   await page.evaluate(({v,url})=>{BeautyGPTTheme.applyTheme(v);BeautyGPTTheme.applyWallpaper({enabled:true,opacity:40,url,bgPrimary:v.bgPrimary});BeautyGPTTheme.ensureThemeAlive(v)},{v:theme.vars,url:wallpaper});
   const firstPaint = await page.evaluate(() => {
    const main = document.querySelector('main');
    const results = [];
    for (const tag of ['header', 'div']) {
     const chrome = document.createElement(tag);
     chrome.className = 'sticky bg-surface';
     // Search/content is deliberately absent during this loading phase.
     chrome.style.backgroundColor = 'white';
     main.prepend(chrome);
     results.push(getComputedStyle(chrome).backgroundColor);
     chrome.remove();
    }
    return results;
   });
   assert.deepEqual(firstPaint,[transparent,transparent],id+' header must be transparent synchronously before search mounts or observer runs');
   for(const selector of ['#library-header','#empty-state','#library-grid'])assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).backgroundColor),transparent,id+' '+selector);
   assert.equal(await page.locator('#preview').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(17, 34, 51)');
   assert.equal(await page.locator('#skeleton').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(221, 221, 221)');
   await page.locator('#library-search-all').focus();
   assert.equal(await page.locator('#library-search-all').evaluate(e=>getComputedStyle(e).backgroundColor),transparent);
   // Toggle wallpaper off: these surfaces follow the selected theme again.
   await page.evaluate(v=>{BeautyGPTTheme.applyWallpaper({enabled:false});BeautyGPTTheme.ensureThemeAlive(v)},theme.vars);
   assert.equal(await page.locator('#library-header').evaluate(e=>getComputedStyle(e).backgroundColor),rgb(theme.vars.bgPrimary));
   console.log('PASS: '+id+' library/images/Drive header, sites empty state, grid and wallpaper toggle');
  }
  await page.evaluate(v=>{history.pushState({},'', '/settings/codex');document.querySelector('main').insertAdjacentHTML('beforeend','<div class="field"><svg></svg><input id="codex-cloud-search" placeholder="搜索"></div>');BeautyGPTTheme.applyTheme(v)},themes.sakura.vars);
  await page.locator('#codex-cloud-search').focus();
  assert.equal(await page.locator('#codex-cloud-search').evaluate(e=>getComputedStyle(e).backgroundColor),transparent);
  assert.equal(await page.locator('#codex-cloud-search').evaluate(e=>getComputedStyle(e.parentElement).boxShadow),'none');
  // Emulate an input-only SPA repaint after theme application.
  await page.locator('#codex-cloud-search').evaluate(e=>e.style.background='#fff');
  await page.evaluate(v=>BeautyGPTTheme.ensureThemeAlive(v),themes.sakura.vars);
  assert.equal(await page.locator('#codex-cloud-search').evaluate(e=>getComputedStyle(e).backgroundColor),transparent);
  assert.deepEqual(errors,[]);
  console.log('PASS: dynamic Codex cloud search and native repaint; no browser errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

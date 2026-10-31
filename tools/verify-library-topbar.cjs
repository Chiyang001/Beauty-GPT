// Regression: the Library/资料空间 page top bar arrived in a rollout where the
// bar (title + search + create) sits outside <main>, directly under the app's
// content wrapper. Wallpaper mode must keep its opaque theme surface from
// showing as a white/pink strip above the wallpaper.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const themes = JSON.parse(fs.readFileSync('src/themes.json', 'utf8'));
const transparent = 'rgba(0, 0, 0, 0)';
const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
const wallpaper = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const fixture = `<!doctype html><html><head><style>
 *{box-sizing:border-box}body{margin:0;font:16px system-ui}
 #app{display:flex;height:100vh}
 aside{width:240px;flex-shrink:0;padding:20px;background:#f4f4f5}
 #main{flex:1;min-width:0;display:flex;flex-direction:column}
 #page-chrome{height:76px;flex-shrink:0;padding:0 32px;display:flex;align-items:center;position:relative;background:#fff}
 .bar-paint{position:absolute;inset:0;background:#fff;pointer-events:none}
 #page-chrome-inner{position:relative;z-index:1;display:flex;align-items:center;gap:18px;width:100%;height:100%;background:#fff}
 #page-chrome h1{font-size:26px;margin:0}
 #page-chrome .spacer{flex:1}
 #library-search-all{width:260px;height:38px;border:1px solid #b07088;border-radius:999px;padding:0 14px;background:#fff}
 #page-chrome button{height:38px;padding:0 18px;border:0;border-radius:999px;background:#b83868;color:#fff}
 main{flex:1;padding:28px;overflow:auto}
 .card{height:120px;background:#fff;border-radius:20px}
</style></head><body>
<div id="app">
  <aside class="app-shell-left-panel">资料空间</aside>
  <div id="main">
    <div id="page-chrome" class="bg-token-main-surface-primary">
      <div class="bar-paint"></div>
      <div id="page-chrome-inner" class="bg-token-main-surface-primary">
        <h1>全部</h1><span class="spacer"></span>
        <input id="library-search-all" type="text" placeholder="搜索">
        <button>创建</button>
      </div>
    </div>
    <main><div class="card"></div></main>
  </div>
</div>
</body></html>`;

(async () => {
 const browser = await chromium.launch({headless: true});
 try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://chatgpt.com/**', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: fixture}));
  await page.goto('https://chatgpt.com/space');
  await page.addScriptTag({path: 'src/theme-engine.js'});
  const bg = selector => page.locator(selector).evaluate(e => getComputedStyle(e).backgroundColor);

  for (const [id, theme] of Object.entries(themes).filter(([, t]) => t.vars)) {
   await page.evaluate(({v, url}) => {
     BeautyGPTTheme.applyTheme(v);
     BeautyGPTTheme.applyWallpaper({enabled: true, opacity: 40, url, bgPrimary: v.bgPrimary});
     BeautyGPTTheme.ensureThemeAlive(v);
   }, {v: theme.vars, url: wallpaper});
   for (const selector of ['#page-chrome', '#page-chrome-inner', '.bar-paint']) {
    assert.equal(await bg(selector), transparent, `${id} ${selector} top bar must reveal wallpaper`);
   }
   // Content cards keep their own fill; only the page chrome is cleared.
   assert.equal(await bg('.card'), 'rgb(255, 255, 255)', id + ' content card keeps its fill');

   await page.evaluate(v => {
     BeautyGPTTheme.applyWallpaper({enabled: false});
     BeautyGPTTheme.ensureThemeAlive(v);
   }, theme.vars);
   for (const selector of ['#page-chrome', '#page-chrome-inner']) {
    assert.equal(await bg(selector), rgb(theme.vars.bgPrimary), `${id} ${selector} restores theme surface without wallpaper`);
   }
   assert.equal(await bg('.bar-paint'), 'rgb(255, 255, 255)', id + ' decorative bar layer restores its native fill');
   console.log('PASS: ' + id + ' library top bar follows wallpaper toggle');
  }

  // Leaving the page route must release the chrome override. The library DOM is
  // replaced in the real app; removing the search anchor also drops the CSS
  // :has() pre-rule so only restoration is measured here.
  await page.evaluate(({v, url}) => {
    BeautyGPTTheme.applyTheme(v);
    BeautyGPTTheme.applyWallpaper({enabled: true, opacity: 40, url, bgPrimary: v.bgPrimary});
    BeautyGPTTheme.ensureThemeAlive(v);
    document.getElementById('library-search-all').remove();
    history.pushState({}, '', '/c/library-fixture');
    BeautyGPTTheme.ensureThemeAlive(v);
  }, {v: themes.sakura.vars, url: wallpaper});
  assert.equal(await page.locator('[data-bgpt-page-chrome]').count(), 0, 'leaving the page releases chrome marks');
  assert.equal(await bg('#page-chrome'), rgb(themes.sakura.vars.bgPrimary), 'conversation route restores page chrome');

  // Default theme + wallpaper must also keep the top bar clear.
  await page.evaluate(url => {
    const input = document.createElement('input');
    input.id = 'library-search-all';
    input.placeholder = '搜索';
    document.getElementById('page-chrome-inner').append(input);
    history.pushState({}, '', '/space');
    BeautyGPTTheme.applyTheme(null);
    BeautyGPTTheme.applyWallpaper({enabled: true, opacity: 40, url, bgPrimary: '#ffffff'});
    BeautyGPTTheme.ensureThemeAlive(null);
  }, wallpaper);
  for (const selector of ['#page-chrome', '#page-chrome-inner', '.bar-paint']) {
   assert.equal(await bg(selector), transparent, 'default theme ' + selector + ' top bar must reveal wallpaper');
  }
  await page.evaluate(() => {
    BeautyGPTTheme.applyWallpaper({enabled: false});
    BeautyGPTTheme.ensureThemeAlive(null);
  });
  assert.equal(await bg('#page-chrome'), 'rgb(255, 255, 255)', 'default theme restores native page chrome');

  assert.deepEqual(errors, []);
  console.log('PASS: library top bar is cleared only while wallpaper mode is active');
 } finally {
  await browser.close();
 }
})().catch(e => { console.error(e); process.exitCode = 1; });

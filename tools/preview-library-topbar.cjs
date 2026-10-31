// Render the Library/资料空间 top-bar fix against a sakura wallpaper fixture:
// one frame as shipped before 1.2.12, one after. Uses the packaged sakura image.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const themes = JSON.parse(fs.readFileSync('src/themes.json', 'utf8'));
const output = path.resolve('tools/issue');
const sakura = fs.readFileSync('assets/themes-web/sakura.jpg');
const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
 *{box-sizing:border-box}body{margin:0;font:15px/1.5 "Microsoft YaHei",system-ui;color:#1a0810}
 #app{display:flex;height:100vh}
 aside{width:216px;flex-shrink:0;padding:14px 12px;background:#e4a0b8}
 aside .row{display:flex;align-items:center;gap:18px;font-weight:700;font-size:17px;margin:0 8px 18px}
 aside .item{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:10px;margin:2px 0}
 aside .item.active{background:#d488a4}
 #main{flex:1;min-width:0;display:flex;flex-direction:column}
 #page-chrome{height:72px;flex-shrink:0;padding:0 32px;display:flex;align-items:center;background:#fff}
 #page-chrome-inner{display:flex;align-items:center;gap:16px;width:100%;height:100%;background:#fff}
 #page-chrome h1{font-size:26px;font-weight:600;margin:0}
 #page-chrome .spacer{flex:1}
 #library-search-all{width:250px;height:38px;border:1px solid #b07088;border-radius:999px;padding:0 14px;background:#fff;font:inherit}
 #page-chrome button{height:38px;padding:0 18px;border:0;border-radius:999px;background:#b83868;color:#fff;font:inherit}
 main{flex:1;padding:0 32px;overflow:hidden}
 .tabs{display:flex;align-items:center;gap:26px;padding:20px 0 14px;font-size:14px}
 .tabs .active{background:rgba(26,8,16,.08);border-radius:999px;padding:6px 14px}
 .banner{height:150px;border-radius:18px;background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.7);margin-top:6px}
</style></head><body>
<div id="app">
 <aside><div class="row"><span>资料空间</span></div><div class="item active">＋ 创建</div><div class="item">▤ 全部</div><div class="item">▣ 页面</div><div class="item">▤ 幻灯片</div><div class="item">▦ 站点</div></aside>
 <div id="main">
  <div id="page-chrome" class="bg-token-main-surface-primary"><div id="page-chrome-inner" class="bg-token-main-surface-primary"><h1>全部</h1><span class="spacer"></span><input id="library-search-all" placeholder="搜索"><button>创建 ⌄</button></div></div>
  <main><div class="tabs"><span class="active">推荐</span><span>收藏</span><span>你的条目</span><span>与你共享</span></div><div class="banner"></div></main>
 </div>
</div>
</body></html>`;

(async () => {
 const browser = await chromium.launch({headless: true});
 try {
  const page = await browser.newPage({viewport: {width: 1280, height: 420}});
  await page.route('https://chatgpt.com/**', (route) => {
   const url = route.request().url();
   if (url.endsWith('/sakura.jpg')) return route.fulfill({contentType: 'image/jpeg', body: sakura});
   return route.fulfill({contentType: 'text/html; charset=utf-8', body: fixture});
  });
  await page.goto('https://chatgpt.com/space');
  await page.addScriptTag({path: 'src/theme-engine.js'});
  await page.evaluate((v) => {
   BeautyGPTTheme.applyTheme(v);
   BeautyGPTTheme.applyWallpaper({enabled: true, opacity: 55, url: 'https://chatgpt.com/sakura.jpg', bgPrimary: v.bgPrimary});
   BeautyGPTTheme.ensureThemeAlive(v);
  }, themes.sakura.vars);
  await page.waitForTimeout(400);
  await page.screenshot({path: path.join(output, 'library-topbar-after.png'), clip: {x: 0, y: 0, width: 1280, height: 300}});
  // Recreate the pre-1.2.12 state: the theme paints the bar surface again.
  await page.evaluate(() => {
   document.querySelectorAll('[data-bgpt-page-chrome]').forEach((el) => {
    el.removeAttribute('data-bgpt-page-chrome');
    el.style.removeProperty('background');
    el.style.removeProperty('background-color');
    el.style.removeProperty('background-image');
    el.style.removeProperty('box-shadow');
    el.style.removeProperty('backdrop-filter');
   });
  });
  await page.screenshot({path: path.join(output, 'library-topbar-before.png'), clip: {x: 0, y: 0, width: 1280, height: 300}});
  console.log('saved before/after crops');
 } finally {
  await browser.close();
 }
})().catch((e) => { console.error(e); process.exitCode = 1; });

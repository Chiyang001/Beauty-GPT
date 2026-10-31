// Real MV3 extension in Chromium, served against a local ChatGPT shell fixture.
// No account, Chrome profile or live conversation is accessed.
// Run: node tools/verify-extension.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tools/test-results');
const themes = JSON.parse(fs.readFileSync(path.join(root, 'src/themes.json'), 'utf8'));
const rgb = h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
// Decode a one-pixel Chromium PNG so checks verify composited pixels rather
// than merely checking that a background-image declaration exists.
async function pixel(page) {
 const png = await page.screenshot({ clip: { x: 850, y: 420, width: 1, height: 1 } });
 const chunks = [];
 for (let at = 8; at < png.length;) {
   const size = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
   if (type === 'IHDR') {
     assert.equal(png[at + 16], 8);
     assert.ok([2, 6].includes(png[at + 17]));
   }
   if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + size));
   at += size + 12;
 }
 return [...zlib.inflateSync(Buffer.concat(chunks)).subarray(1, 4)];
}
const distance = (a, b) => a.reduce((sum, n, i) => sum + Math.abs(n - b[i]), 0);
const fixture = `<!doctype html><html><head><style>
 *{box-sizing:border-box}body{margin:0;font:16px system-ui}button{font:inherit;cursor:pointer}
 .app-layout{display:flex;height:100vh;background:#fff}aside{width:260px;flex-shrink:0;padding:20px}
 main{flex:1;min-width:0;background:#fff}.new-shell{height:100%;display:flex;flex-direction:column;background:#fff}
 .thread-scroll-container{flex:1;background:#fff;padding:40px;overflow:auto}
 .message{max-width:720px;margin:auto}.user-message-bubble-color{padding:16px;border-radius:24px;width:max-content;margin-left:auto}
 [data-thread-scroll-footer]{padding:20px 32px}form{max-width:840px;margin:auto}
 [data-composer-surface]{display:flex;align-items:center;gap:12px;min-height:64px;padding:10px;border-radius:32px;background:#fff}
 #prompt-textarea{flex:1;min-width:0;outline:none}#prompt-textarea p{margin:0}
 .voice{width:44px;height:44px;flex-shrink:0;border:0;border-radius:50%;background:#d65b25;color:#fff}
 .voice svg{width:24px;height:24px}.actions{display:flex;align-items:center;border-radius:24px;background:#444}
 .effort{padding:10px 14px;background:transparent;color:inherit;border:0;border-radius:24px}
 .reasoning-popover{position:fixed;right:50px;bottom:110px;padding:20px;width:280px;border-radius:24px;background:#fff;box-shadow:0 20px 30px #0005}
 [data-slot=slider-track]{height:8px;border-radius:10px;background:#ddd;position:relative;margin:28px 8px}
 [data-slot=slider-range]{position:absolute;inset:0 30% 0 0;background:#f58038;border-radius:inherit}
 [role=slider]{position:absolute;left:70%;top:-7px;width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid #aaa}
 .card{padding:16px;border-radius:12px;background:#123;color:#fff}
 </style></head><body><div class="app-layout"><aside class="app-shell-left-panel"><b>ChatGPT</b><p><button class="sidebar-item">新聊天</button></p><p>最近</p><a class="sidebar-item" aria-current="page">问候交流</a></aside><main><div class="new-shell"><div class="thread-scroll-container"><div class="message"><div data-message-author-role="user"><div class="user-message-bubble-color">你好</div></div><div data-message-author-role="assistant"><p>你好呀，炽阳！</p><p>这是用于验证背景、控件和配色的本地页面。</p></div><div class="card">保留内容卡片背景</div></div></div><div data-thread-scroll-footer="true"><form data-type="unified-composer"><div data-composer-surface="true" data-composer-body><button id="composer-plus-btn">+</button><div id="prompt-textarea" contenteditable="true"><p>询问 ChatGPT</p></div><div class="actions"><button class="effort" aria-haspopup="dialog">思考强度⌄</button><button class="voice" aria-label="启动语音模式"><svg fill="none" viewBox="0 0 24 24"><path d="M4 10v4m4-8v12m4-16v20m4-16v12m4-8v4" stroke="currentColor" stroke-width="2"/></svg></button></div></div></form></div></div></main></div><div class="reasoning-popover" role="dialog"><p>极高</p><div data-slot="slider-track"><span data-slot="slider-range"></span><span role="slider" aria-label="思考强度" tabindex="0" aria-valuenow="3" aria-valuemin="0" aria-valuemax="4"></span></div></div></body></html>`;

(async () => {
 fs.mkdirSync(output, { recursive: true });
 const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'beauty-gpt-test-'));
 const context = await chromium.launchPersistentContext(profile, {
   channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
   args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
 });
 context.setDefaultTimeout(10000);
 try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  await worker.evaluate(async () => {
    for (let n = 0; n < 100; n++) {
      if ((await chrome.storage.sync.get('beautyGptThemeId')).beautyGptThemeId) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Extension install did not initialize storage');
  });
  await worker.evaluate(() => chrome.storage.sync.set({ beautyGptThemeId: 'sakura', beautyGptBgEnabled: true, beautyGptBgOpacity: 40 }));
  await context.route('https://chatgpt.com/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: fixture,
    headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'" },
  }));
  const page = await context.newPage();
  // This older bundled Chromium rejects waitForFunction's in-page eval on
  // freshly compiled predicates under CSP. Poll via CDP evaluation instead.
  const waitUntil = async (predicate, arg) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await page.evaluate(predicate, arg)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Timed out waiting for: ' + predicate.toString());
  };
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('https://chatgpt.com/c/local-theme-test');
  await page.waitForSelector('html.beauty-gpt-bg', { state: 'attached' });
  await page.locator('#beauty-gpt-root .bgpt-fab').waitFor();
  const before = await page.evaluate(() => {
    const c = s => getComputedStyle(document.querySelector(s));
    return { shell: c('.new-shell').backgroundColor, voice: c('.voice').backgroundColor,
      image: getComputedStyle(document.getElementById('beauty-gpt-bg-layer').shadowRoot.querySelector('[data-wallpaper-paint]')).backgroundImage };
  });
  await page.screenshot({ path: path.join(output, 'sakura-initial.png') });
  assert.equal(before.shell, 'rgba(0, 0, 0, 0)', 'nested chat shell must reveal wallpaper');
  assert.equal(before.voice, rgb(themes.sakura.vars.accent), 'voice action must follow theme');

  const setSync = async values => worker.evaluate(values => chrome.storage.sync.set(values), values);
  const waitColor = (selector, color) => waitUntil(({selector, color}) => getComputedStyle(document.querySelector(selector)).backgroundColor === color, {selector, color});
  for (const [id, theme] of Object.entries(themes).filter(([, t]) => t.vars)) {
    await setSync({ beautyGptThemeId: id, beautyGptBgEnabled: true, beautyGptBgOpacity: 40 });
    await waitColor('.voice', rgb(theme.vars.accent));
    await waitUntil(id => getComputedStyle(document.getElementById('beauty-gpt-bg-layer').shadowRoot.querySelector('[data-wallpaper-paint]')).backgroundImage.includes(id + '.png'), id);
    // Exercise actual packaged resources under a site's CSP, without bypassing it.
    const dimensions = await page.evaluate(async () => {
      const style = getComputedStyle(document.getElementById('beauty-gpt-bg-layer').shadowRoot.querySelector('[data-wallpaper-paint]')).backgroundImage;
      const url = style.match(/url\("([^"]+)"\)/)[1];
      const img = new Image(); img.src = url; await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    });
    assert.ok(dimensions[0] > 1000 && dimensions[1] > 500, id + ' wallpaper decoded');
    const visible = await pixel(page);
    await setSync({ beautyGptBgOpacity: 0 });
    await waitUntil(() => getComputedStyle(document.getElementById('beauty-gpt-bg-layer').shadowRoot.querySelector('[data-wallpaper-paint]')).backgroundImage.includes('rgb('));
    await waitUntil(() => document.getElementById('beauty-gpt-root').shadowRoot.querySelector('[data-bg-hint]').textContent.includes('0%'));
    const hidden = await pixel(page);
    const base = theme.vars.bgPrimary.match(/[0-9a-f]{2}/gi).map(n => parseInt(n, 16));
    assert.ok(distance(hidden, base) < 4, id + ': 0% must be theme base');
    assert.ok(distance(visible, hidden) > 5, id + ': wallpaper must visibly affect pixels at 40%');
    await setSync({ beautyGptBgOpacity: 40 });
    await waitUntil(() => getComputedStyle(document.getElementById('beauty-gpt-bg-layer').shadowRoot.querySelector('[data-wallpaper-paint]')).backgroundImage.includes('0.6)'));
    const colors = await page.evaluate(() => {
      const c = s => getComputedStyle(document.querySelector(s));
      const shadow = document.getElementById('beauty-gpt-root').shadowRoot;
      return {formBorder: c('form').borderTopWidth, composerBorder: c('[data-composer-body]').borderTopWidth,
        track: c('[data-slot="slider-track"]').backgroundColor, range: c('[data-slot="slider-range"]').backgroundColor,
        thumb: c('[role="slider"]').backgroundColor, thumbWidth: c('[role="slider"]').width,
        voiceWidth: c('.voice').width, iconFill: document.querySelector('.voice svg').getAttribute('fill'),
        controls: c('.actions').backgroundColor,
        card: c('.card').backgroundColor, panel: getComputedStyle(shadow.querySelector('.bgpt-panel')).backgroundColor,
        panelAccent: getComputedStyle(shadow.querySelector('input[type="range"]')).accentColor};
    });
    assert.equal(colors.formBorder, '0px', 'composer must have only one border');
    assert.ok(parseFloat(colors.composerBorder) > 0 && parseFloat(colors.composerBorder) <= 1);
    assert.equal(colors.track, rgb(theme.vars.bgSecondary));
    assert.equal(colors.range, rgb(theme.vars.accent));
    assert.equal(colors.thumb, rgb(theme.vars.inputBg));
    assert.equal(colors.thumbWidth, '22px'); assert.equal(colors.voiceWidth, '44px');
    assert.equal(colors.iconFill, 'none'); assert.equal(colors.card, 'rgb(17, 34, 51)');
    assert.equal(colors.controls, 'rgba(0, 0, 0, 0)', 'trailing control group must have no extra fill');
    assert.equal(colors.panel, rgb(theme.vars.bgPrimary)); assert.equal(colors.panelAccent, rgb(theme.vars.accent));
    await page.screenshot({path: path.join(output, id + '.png')});
    console.log('PASS:', id, 'packaged image, visible pixels, composer, slider and panel palette');
  }

  await setSync({beautyGptThemeId:'sakura'});
  await waitColor('.voice', rgb(themes.sakura.vars.accent));
  // Native trailing groups can wrap the primary action multiple levels deep,
  // expose no aria-haspopup, and paint siblings/decorations as separate pills.
  // The old immediate-parent detector never marked this outer group.
  await page.evaluate(() => {
    const actions=document.querySelector('.actions');
    actions.style.cssText='position:relative;background:#b07088!important;';
    actions.innerHTML='<div class="trailing-decoration" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;background:#b07088!important;border-radius:999px"></div><div class="mode-slot" style="background:#b07088"><button class="__composer-pill effort">即时</button></div><span class="mic-slot" style="background:#b07088"><button aria-label="开始听写">🎙</button></span><div class="voice-slot" style="background:#b07088"><span class="voice-transition"><button class="voice" data-testid="composer-speech-button">Voice</button></span></div>';
    const style=document.createElement('style');style.textContent='.actions::before{content:"";position:absolute;inset:0;background:#b07088;pointer-events:none}';document.head.append(style);
  });
  await waitColor('.actions','rgba(0, 0, 0, 0)');
  for(const selector of ['.voice-slot','.voice-transition','.mode-slot','.mic-slot','.trailing-decoration','.mode-slot button']) {
    await waitColor(selector,'rgba(0, 0, 0, 0)');
  }
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.actions'),'::before').backgroundColor),'rgba(0, 0, 0, 0)');
  await waitColor('.voice',rgb(themes.sakura.vars.accent));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-composer-body]')).backgroundColor),rgb(themes.sakura.vars.inputBg));
  await page.screenshot({path:path.join(output,'composer-no-trailing-fill.png')});
  console.log('PASS: nested trailing wrappers, no-haspopup controls, legacy pills and decorative fill removed; primary button preserved');
  // Adversarial app-shell: a site's pseudo-element reset, a separate body
  // stacking context and an opaque, unnamed conversation sibling. The 1.2.5
  // negative ::before layer/limited anchor list did not cover this layout.
  await page.addStyleTag({content:'html::before{content:none!important;display:none!important}body{isolation:isolate}#unknown-conversation::before{content:"";position:absolute;inset:0;background:#fff}'});
  await page.evaluate(() => {
    const scroller=document.querySelector('.thread-scroll-container');
    scroller.className='opaque-unknown-conversation'; scroller.id='unknown-conversation';
    scroller.style.cssText='flex:1;overflow:auto;padding:40px;background:#fff!important;';
    const turn=scroller.querySelector('[data-message-author-role]');
    const article=document.createElement('article'); article.dataset.testid='conversation-turn-1';
    turn.replaceWith(article); article.append(turn);
  });
  await waitColor('#unknown-conversation','rgba(0, 0, 0, 0)');
  const wallpaperPixels=await pixel(page);
  assert.ok(distance(wallpaperPixels,[255,248,250])>5,'wallpaper survives native pseudo reset and opaque conversation sibling');
  await page.evaluate(() => document.querySelector('#unknown-conversation').style.setProperty('background','#123','important'));
  await waitColor('#unknown-conversation','rgba(0, 0, 0, 0)');
  assert.deepEqual(await pixel(page),wallpaperPixels,'attribute-only native repaints must not hide wallpaper');
  assert.equal(await page.evaluate(() => document.elementFromPoint(850,420).id==='beauty-gpt-bg-layer'),false,'background cannot intercept page input');
  await waitUntil(() => document.getElementById('beauty-gpt-root').shadowRoot.querySelector('[data-bg-hint]').textContent.includes('图片已加载'));
  await page.screenshot({path:path.join(output,'sakura-layer-regression.png')});
  console.log('PASS: pseudo resets, opaque unnamed conversation, attribute-only repaint and visible image status');
  // Exercise the real panel control and storage persistence.
  await page.locator('#beauty-gpt-root .bgpt-fab').click();
  await page.locator('#beauty-gpt-root [data-bg-enabled]').uncheck();
  await page.waitForSelector('html:not(.beauty-gpt-bg)', {state:'attached'});
  await page.evaluate(()=>document.querySelector('.actions').style.setProperty('background','#b07088','important'));
  await waitColor('.actions','rgba(0, 0, 0, 0)');
  assert.equal((await worker.evaluate(() => chrome.storage.sync.get('beautyGptBgEnabled'))).beautyGptBgEnabled, false);
  await page.locator('#beauty-gpt-root [data-bg-enabled]').check();
  await page.waitForSelector('html.beauty-gpt-bg', {state:'attached'});
  await page.locator('#beauty-gpt-root .bgpt-close').click();
  // A new shell mounted after navigation must reveal the wallpaper, too.
  await page.evaluate(() => {
    const scroll = document.querySelector('#unknown-conversation');
    const wrapper = document.createElement('div'); wrapper.id='spa-shell'; wrapper.style.background='#fff';
    scroll.replaceWith(wrapper); wrapper.append(scroll);
    document.getElementById('beauty-gpt-wallpaper').remove();
    document.getElementById('beauty-gpt-bg-layer').remove();
  });
  await waitUntil(() => !!document.getElementById('beauty-gpt-wallpaper')?.textContent);
  await page.locator('#beauty-gpt-bg-layer').waitFor({state:'visible'});
  await waitColor('#spa-shell', 'rgba(0, 0, 0, 0)');
  // Portal controls inserted after initial theme application use the same palette.
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="late" role="dialog"><input type="range"><button data-testid="composer-speech-button">Voice</button></div>'));
  await waitColor('#late button', rgb(themes.sakura.vars.accent));
  // Exercise automatic repairs through the installed content-script observer,
  // including attribute-only native repaints (no explicit ensureThemeAlive).
  await page.evaluate(() => {
    history.pushState({}, '', '/space');
    document.querySelector('main').insertAdjacentHTML('beforeend', '<header id="surface-repaint" style="background:#fff!important"><h2>图像</h2><div id="search-repaint-shell" style="border-radius:24px"><svg></svg><input id="library-search-repaint" type="text" placeholder="搜索" style="background:#fff!important"></div></header>');
  });
  await waitColor('#surface-repaint','rgba(0, 0, 0, 0)');
  await waitColor('#library-search-repaint','rgba(0, 0, 0, 0)');
  await page.evaluate(() => {
    document.querySelector('#surface-repaint').style.setProperty('background','#fff','important');
    document.querySelector('#library-search-repaint').style.setProperty('background','#fff','important');
    document.querySelector('#search-repaint-shell').style.setProperty('box-shadow','0 0 0 5px red','important');
  });
  await waitColor('#surface-repaint','rgba(0, 0, 0, 0)');
  await waitColor('#library-search-repaint','rgba(0, 0, 0, 0)');
  await waitUntil(() => getComputedStyle(document.querySelector('#search-repaint-shell')).boxShadow === 'none');
  await page.evaluate(() => {document.querySelector('#surface-repaint').remove();history.pushState({}, '', '/c/local-theme-test')});
  console.log('PASS: installed observer repairs library header, search fill and focus shadow after native attribute-only repaint');
  // Catch the actual flash: inspect every animation frame, not just the final
  // state after a 160ms debounce. The loading band is outside main, has no
  // stable classes/search/title, and uses native inline !important fills.
  for (const route of ['/plugins', '/space']) {
  await page.evaluate(route => history.pushState({}, '', route), route);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const frames = await page.evaluate(async () => {
    const samples = [];
    let bar = document.createElement('div');
    bar.id = 'loading-chrome';
    bar.style.cssText = 'position:fixed;left:260px;right:0;top:0;height:86px;background:#fff!important';
    bar.innerHTML = '<div id="loading-paint" style="position:absolute;inset:0;background:#fff!important"></div>';
    document.body.append(bar);
    for (let i=0; i<12; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      samples.push([getComputedStyle(bar).backgroundColor,getComputedStyle(bar.firstElementChild).backgroundColor]);
      if(i===2)bar.insertAdjacentHTML('beforeend','<h1>插件</h1><input type="search" placeholder="搜索插件">');
      if(i===4){const replacement=bar.cloneNode(true);bar.replaceWith(replacement);bar=replacement;bar.style.setProperty('background','#fff','important');bar.firstElementChild.style.setProperty('background','#fff','important')}
    }
    bar.remove();
    return samples;
  });
  for (const [i, colors] of frames.entries()) assert.deepEqual(colors,['rgba(0, 0, 0, 0)','rgba(0, 0, 0, 0)'],'loading header/paint layer frame '+i);
  console.log('PASS: '+route+' all 12 rendered frames transparent during header loading, delayed anchors and replacement outside main');
  }
  await page.reload();
  await page.waitForSelector('html.beauty-gpt-bg', {state:'attached'});
  await page.waitForSelector('#beauty-gpt-root', {state:'attached'});
  await waitColor('.voice', rgb(themes.sakura.vars.accent));
  console.log('PASS: panel toggle, persistence/reload, SPA wrappers/style recovery and late controls');

  // Default theme plus custom wallpaper has no vars, but must still clear shells.
  const custom = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="red" d="M0 0h100v100H0z"/></svg>');
  await worker.evaluate(data => chrome.storage.local.set({beautyGptBgCustomDataUrl:data, beautyGptBgCustomMediaType:'image'}), custom);
  await setSync({beautyGptThemeId:'default', beautyGptBgUseCustom:true, beautyGptBgOpacity:100});
  await waitUntil(() => !document.documentElement.classList.contains('beauty-gpt-active') && getComputedStyle(document.getElementById('beauty-gpt-bg-layer').shadowRoot.querySelector('[data-wallpaper-paint]')).backgroundImage.includes('data:image'));
  await waitColor('.new-shell', 'rgba(0, 0, 0, 0)');
  assert.ok(distance(await pixel(page), [255, 0, 0]) < 4, 'custom default wallpaper paints actual red pixels');
  await page.evaluate(() => {document.getElementById('beauty-gpt-wallpaper').remove();});
  await waitUntil(() => !!document.getElementById('beauty-gpt-wallpaper')?.textContent);
  await worker.evaluate(() => chrome.storage.local.set({beautyGptBgCustomDataUrl:'data:image/png;base64,aW52YWxpZA=='}));
  await waitUntil(() => document.getElementById('beauty-gpt-root').shadowRoot.querySelector('[data-bg-hint]').textContent.includes('图片加载失败'));
  await worker.evaluate(data => chrome.storage.local.set({beautyGptBgCustomDataUrl:data}), custom);
  await waitUntil(() => document.getElementById('beauty-gpt-root').shadowRoot.querySelector('[data-bg-hint]').textContent.includes('图片已加载'));
  await setSync({beautyGptBgEnabled:false, beautyGptBgUseCustom:false});
  await page.waitForSelector('html:not(.beauty-gpt-bg)', {state:'attached'});
  assert.equal(await page.locator('[data-bgpt-wallpaper-shell]').count(), 0);
  assert.equal(await page.locator('[data-bgpt-composer-action]').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--bg-secondary')), '');
  console.log('PASS: default/custom wallpaper, visible image failures/recovery and full reset');

  await setSync({beautyGptThemeId:'ocean', beautyGptBgEnabled:true});
  await waitColor('.voice', rgb(themes.ocean.vars.accent));
  await page.setViewportSize({width:360,height:780});
  await page.addStyleTag({content:'@media(max-width:640px){aside{display:none}}'});
  const clearOfComposer = async () => {
    const fab=await page.locator('#beauty-gpt-root .bgpt-fab').boundingBox();
    const composer=await page.locator('[data-composer-body]').boundingBox();
    return fab.y+fab.height<=composer.y || fab.x>=composer.x+composer.width || fab.x+fab.width<=composer.x || fab.y>=composer.y+composer.height;
  };
  const collisionDeadline=Date.now()+5000;
  while(!await clearOfComposer() && Date.now()<collisionDeadline) await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(await clearOfComposer(),true,'floating theme button must not cover voice/send controls on mobile');
  await page.evaluate(()=>{document.querySelector('[data-composer-body]').style.minHeight='180px';document.getElementById('prompt-textarea').append(document.createElement('p'))});
  const growingDeadline=Date.now()+5000;
  while(!await clearOfComposer() && Date.now()<growingDeadline) await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(await clearOfComposer(),true,'floating theme button must avoid the expanded composer, too');
  await page.locator('#beauty-gpt-root .bgpt-fab').click();
  const panel = page.locator('#beauty-gpt-root .bgpt-panel');
  await panel.waitFor({state:'visible'});
  // Wait for the panel opening animation before checking its bounds.
  await waitUntil(() => !document.getElementById('beauty-gpt-root').shadowRoot.querySelector('.bgpt-panel').getAnimations().some(a=>a.playState==='running'));
  const bounds = await panel.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 360 && bounds.y >= 0 && bounds.y + bounds.height <= 780, 'panel fits narrow viewport');
  await page.screenshot({path:path.join(output, 'panel-narrow.png')});
  assert.deepEqual(errors, []);
  console.log('PASS: narrow settings panel; zero browser errors');
 } finally {
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
 }
})().catch(e => { console.error(e); process.exitCode = 1; });

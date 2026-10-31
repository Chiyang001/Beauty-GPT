// Native anonymous settings DOM observed on 2026-10-31. Local fixture only:
// no real privacy, consent, training, locale or appearance setting is changed.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const themes=JSON.parse(fs.readFileSync('src/themes.json','utf8'));
const rgb=h=>`rgb(${[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')})`;
const clear='rgba(0, 0, 0, 0)';
const fixture=`<style>
 *{box-sizing:border-box}body{margin:0;background:#000;color:white;font:16px system-ui}
 header{display:flex;align-items:center;gap:20px;height:64px;padding:12px}
 header a{display:block;width:40px;height:40px;border-radius:50%;background:#303030;color:white;text-align:center;padding:6px;text-decoration:none}
 header [role=heading]{color:white} main{padding:30px}nav,.group{background:#303030;border-radius:24px;padding:16px}
 .native-white, label, select{color:white}small{display:block;color:#aaa;margin-top:10px}small a{color:#aaa}
 [data-w-component]{padding:12px;background:#303030;color:white;border:1px solid transparent;font:inherit}
 [data-octane-settings-switch-group]{margin:28px 0}label{display:flex;align-items:center;justify-content:space-between;position:relative;padding:12px}
 input[role=switch]{appearance:none;position:relative;width:32px;height:20px;border-radius:20px;background:#aaa;border:0;margin:0;flex-shrink:0}
 input[role=switch]:checked{background:#3566f0}input[role=switch]::after{content:"";position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:white;transform:translateX(0)}
 input[role=switch]:checked::after{transform:translateX(12px)}
 [data-octane-settings-color-scheme]{position:absolute;inset:0;opacity:0;width:100%;height:100%}
 [hidden]{display:none!important}#menu{display:none}@media(max-width:600px){#menu{display:block}.desktop{display:none}}
 </style><div data-ds-top-chrome><header data-slot="header"><a href="/" aria-label="返回 ChatGPT">←</a><div role="heading" aria-level="1">设置</div></header></div>
 <main><section id="mobile-settings-page"><div data-mobile-settings-modal><section data-octane-settings-pane="settings">
 <nav id="menu" aria-label="设置"><button data-w-component="button" data-octane-settings-open-pane="general"><span class="native-white">常规</span></button><button data-w-component="button" data-octane-settings-open-pane="data-controls"><span class="native-white">数据管理</span></button></nav>
 <section class="desktop"><h3>常规</h3><section class="group"><label><span class="native-white">外观</span><span class="native-white" data-octane-settings-color-scheme-value>系统</span><select aria-label="外观" data-octane-settings-color-scheme><option value="system">系统</option><option value="dark">深色</option></select></label><label><span class="native-white">语言</span><span class="native-white" data-octane-settings-locale-value>自动检测</span></label></section></section>
 </section><section data-octane-settings-pane="data-controls"><h3>数据管理</h3><div class="group"><div data-octane-settings-switch-group="training"><label><span class="native-white">为所有用户改进模型</span><input id="training" role="switch" type="checkbox" checked aria-checked="true" aria-describedby="mobile-settings-training-description" data-octane-settings-training></label><small id="mobile-settings-training-description">允许我们将你的内容用于训练我们的模型。<a href="#learn">了解更多</a></small></div><div data-octane-settings-switch-group="marketing"><label><span class="native-white">营销衡量</span><input id="marketing" role="switch" type="checkbox" aria-checked="false" data-octane-settings-consent="marketing"></label><small>这些 Cookie 可帮助我们衡量营销活动效果。</small></div></div></section>
 <section hidden data-octane-settings-pane="general">Retained hidden pane</section></div></section></main>`;
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
  await page.goto('https://chatgpt.com/settings');await page.addScriptTag({path:'src/theme-engine.js'});
  const css=(s,p,pseudo)=>page.locator(s).first().evaluate((e,{p,pseudo})=>getComputedStyle(e,pseudo).getPropertyValue(p),{p,pseudo});
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   for(const [id,{vars:v}]of Object.entries(themes).filter(([,t])=>t.vars)){
    await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),v);
    for(const sel of ['.native-white','[data-octane-settings-open-pane] span','[data-slot=header] [role=heading]'])assert.equal(await css(sel,'color'),rgb(v.textPrimary),id+' readable '+sel);
    assert.equal(await css('small','color'),rgb(v.textSecondary));assert.equal(await css('small a','color'),rgb(v.textPrimary));
    assert.equal(await css('[data-octane-settings-color-scheme-value]','color'),rgb(v.textSecondary));
    assert.equal(await css('nav','background-color'),clear,'no black entry group');
    assert.equal(await css('.group','background-color'),clear,'no black settings card');
    assert.equal(await css('[aria-label="返回 ChatGPT"]','background-color'),clear);assert.equal(await css('[aria-label="返回 ChatGPT"]','color'),rgb(v.textPrimary));
    assert.equal(await css('#training','background-color'),rgb(v.accent));assert.equal(await css('#marketing','background-color'),rgb(v.border));
    const foreground=await page.evaluate(c=>BeautyGPTTheme.contrastOn(c),v.accent);
    assert.equal(await css('#training','background-color','::after'),rgb(foreground));
    assert.equal(await css('#marketing','background-color','::after'),rgb(v.inputBg));
    assert.equal(await css('#training','width'),'32px');assert.equal(await css('#training','transform','::after'),'matrix(1, 0, 0, 1, 12, 0)');
    assert.equal(await css('#marketing','transform','::after'),'matrix(1, 0, 0, 1, 0, 0)');
    assert.equal(await css('select','opacity'),'0','native select overlay remains invisible');
    assert.equal(await page.locator('select').inputValue(),'system');assert.equal(await page.locator('#training').isChecked(),true);assert.equal(await page.locator('#marketing').isChecked(),false);
    assert.equal(await css('[data-octane-settings-pane=general]','display'),'none');
    assert.equal(await css('#menu','display'),width===390?'block':'none');
    console.log('PASS: '+width+'px '+id+' anonymous settings text, groups, back link, native switches and unchanged values');
   }
  }
  fs.mkdirSync('tools/test-results/logged-out-settings',{recursive:true});
  await page.evaluate(v=>BeautyGPTTheme.applyTheme(v),themes.sakura.vars);
  await page.screenshot({path:'tools/test-results/logged-out-settings/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tools/test-results/logged-out-settings/mobile.png',fullPage:true});
  await page.evaluate(()=>BeautyGPTTheme.applyTheme(null));assert.equal(await css('#training','background-color'),'rgb(53, 102, 240)');
  assert.deepEqual(errors,[]);console.log('PASS: default reset and zero browser errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

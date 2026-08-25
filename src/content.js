(async function () {
  let runtimeId = null;
  try {
    runtimeId = chrome.runtime?.id || null;
  } catch (_) {
    runtimeId = null;
  }

  // 扩展重载后旧实例会失效；若已有存活实例则跳过，失效则可被新注入接管
  if (window.__beautyGptLoaded) {
    const prevId = window.__beautyGptRuntimeId;
    const prevAlive = window.__beautyGptAlive !== false;
    if (prevAlive && prevId && runtimeId && prevId === runtimeId) return;
    if (prevAlive && !runtimeId) return;
  }
  window.__beautyGptLoaded = true;
  window.__beautyGptRuntimeId = runtimeId;
  window.__beautyGptAlive = true;

  const Theme = window.BeautyGPTTheme;
  if (!Theme) {
    console.error("[Beauty-GPT] theme engine missing");
    return;
  }

  let state = {
    themes: {},
    themeId: "default",
    customVars: null,
    fabPosition: null,
    activeVars: null,
    panelOpen: false,
    bgEnabled: true,
    bgOpacity: Theme.DEFAULT_BG_OPACITY || 40,
    bgUseCustom: false,
    bgCustomDataUrl: null,
    bgCustomMediaType: null,
    bgCustomVideoUrl: null,
    bgCustomVideoName: null,
  };

  const HOST_ID = "beauty-gpt-root";
  let disposed = false;

  function isAlive() {
    if (disposed) return false;
    if (typeof Theme.isExtensionContextValid === "function") {
      return Theme.isExtensionContextValid();
    }
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function disposeExtensionRuntime(reason) {
    if (disposed) return;
    disposed = true;
    window.__beautyGptAlive = false;
    try {
      const api = chrome && chrome.storage && chrome.storage.onChanged;
      if (api && typeof api.removeListener === "function") {
        api.removeListener(onStorageChanged);
      }
    } catch (_) {
      /* ignore */
    }
    console.info(
      "[Beauty-GPT] 扩展上下文已失效，请刷新页面以重新加载。",
      reason || ""
    );
  }

  function syncFabTheme(vars) {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    if (!vars) {
      host.style.removeProperty("--bgpt-fab-from");
      host.style.removeProperty("--bgpt-fab-to");
      host.style.removeProperty("--bgpt-fab-fg");
      host.style.removeProperty("--bgpt-fab-shadow");
      return;
    }
    const accent = vars.accent || "#e85d8e";
    const hover = vars.accentHover || accent;
    let fg = "#fff";
    const hex = String(accent).replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      fg = luma < 0.55 ? "#fff" : "#1a1a1a";
    }
    host.style.setProperty("--bgpt-fab-from", accent);
    host.style.setProperty("--bgpt-fab-to", hover);
    host.style.setProperty("--bgpt-fab-fg", fg);
    host.style.setProperty("--bgpt-fab-shadow", `${accent}66`);
  }

  async function syncWallpaper() {
    if (!isAlive()) {
      disposeExtensionRuntime();
      return;
    }
    try {
      const media = await Theme.resolveWallpaperMedia(
        state.themeId,
        state.themes,
        state.bgUseCustom,
        state.bgCustomDataUrl,
        state.bgCustomMediaType,
        state.bgCustomVideoUrl
      );
      Theme.applyWallpaper({
        enabled: state.bgEnabled && !!media.url,
        opacity: state.bgOpacity,
        url: media.url,
        mediaType: media.mediaType,
        bgPrimary: state.activeVars?.bgPrimary || "#f7f7f8",
      });
      // 默认主题 vars 为 null：不要 ensureThemeAlive(null)，否则会清掉壁纸
      if (state.activeVars) {
        Theme.ensureThemeAlive(state.activeVars);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      if (/Extension context invalidated/i.test(msg)) {
        disposeExtensionRuntime(msg);
        return;
      }
      console.error("[Beauty-GPT] syncWallpaper failed", err);
    }
  }

  function bindStorageListener() {
    if (!isAlive()) {
      disposeExtensionRuntime();
      return false;
    }
    try {
      const api = chrome?.storage?.onChanged;
      if (!api || typeof api.addListener !== "function") {
        disposeExtensionRuntime("chrome.storage.onChanged unavailable");
        return false;
      }
      api.addListener(onStorageChanged);
      return true;
    } catch (err) {
      disposeExtensionRuntime(err?.message || String(err));
      return false;
    }
  }

  async function init() {
    if (!isAlive()) {
      disposeExtensionRuntime();
      return;
    }
    try {
      state = { ...state, ...(await Theme.loadState()) };
      state.activeVars = await Theme.resolveActiveVars(
        state.themeId,
        state.customVars,
        state.themes
      );
      Theme.applyTheme(state.activeVars);
      await syncWallpaper();
      await mountUI();
      syncFabTheme(state.activeVars);
      watchSpa();
      bindStorageListener();
    } catch (err) {
      const msg = err?.message || String(err);
      if (
        /Extension context invalidated/i.test(msg) ||
        /Cannot read properties of undefined/i.test(msg)
      ) {
        disposeExtensionRuntime(msg);
        return;
      }
      throw err;
    }
  }

  function onStorageChanged(changes, area) {
    if (!isAlive()) {
      disposeExtensionRuntime();
      return;
    }
    const keys = Theme.STORAGE_KEYS;
    const localKeys = Theme.LOCAL_STORAGE_KEYS;
    let needTheme = false;
    let needWallpaper = false;

    if (area === "sync") {
      if (changes[keys.themeId]) {
        state.themeId = changes[keys.themeId].newValue || "default";
        needTheme = true;
        needWallpaper = true;
      }
      if (changes[keys.customVars]) {
        state.customVars = changes[keys.customVars].newValue || null;
        needTheme = true;
      }
      if (changes[keys.bgEnabled]) {
        state.bgEnabled =
          changes[keys.bgEnabled].newValue === undefined
            ? true
            : !!changes[keys.bgEnabled].newValue;
        needWallpaper = true;
      }
      if (changes[keys.bgOpacity]) {
        state.bgOpacity =
          typeof changes[keys.bgOpacity].newValue === "number"
            ? changes[keys.bgOpacity].newValue
            : Theme.DEFAULT_BG_OPACITY;
        needWallpaper = true;
      }
      if (changes[keys.bgUseCustom]) {
        state.bgUseCustom = !!changes[keys.bgUseCustom].newValue;
        needWallpaper = true;
      }
    }

    if (area === "local") {
      if (changes[localKeys.bgCustomDataUrl]) {
        state.bgCustomDataUrl = changes[localKeys.bgCustomDataUrl].newValue || null;
        needWallpaper = true;
      }
      if (changes[localKeys.bgCustomMediaType]) {
        state.bgCustomMediaType =
          changes[localKeys.bgCustomMediaType].newValue || null;
        needWallpaper = true;
      }
    }

    if (needTheme) {
      Theme.resolveActiveVars(state.themeId, state.customVars, state.themes).then(
        async (vars) => {
          state.activeVars = vars;
          Theme.applyTheme(vars);
          syncFabTheme(vars);
          await syncWallpaper();
          refreshPanelActive();
          syncWallpaperControls();
        }
      );
      return;
    }
    if (needWallpaper) {
      syncWallpaper().then(() => syncWallpaperControls());
    }
  }

  async function mountUI() {
    if (document.getElementById(HOST_ID)) return;
    if (!isAlive()) {
      disposeExtensionRuntime();
      return;
    }

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const cssUrl = Theme.extensionUrl
      ? Theme.extensionUrl("src/styles/panel.css")
      : null;
    if (!cssUrl) {
      host.remove();
      disposeExtensionRuntime();
      return;
    }
    let cssText = "";
    try {
      cssText = await fetch(cssUrl).then((r) => r.text());
    } catch (err) {
      host.remove();
      if (/Extension context invalidated/i.test(err?.message || "")) {
        disposeExtensionRuntime(err.message);
        return;
      }
      throw err;
    }

    const style = document.createElement("style");
    style.textContent = cssText;
    shadow.appendChild(style);

    const logoUrl = Theme.extensionUrl
      ? Theme.extensionUrl("icons/logo.png") || ""
      : "";
    const fab = document.createElement("button");
    fab.className = "bgpt-fab";
    fab.type = "button";
    fab.title = "Beauty-GPT 主题";
    fab.setAttribute("aria-label", "打开 Beauty-GPT 主题面板");
    fab.innerHTML = `
      <img class="bgpt-fab-icon" src="${logoUrl}" alt="" draggable="false" />
    `;

    const panel = document.createElement("div");
    panel.className = "bgpt-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Beauty-GPT 主题设置");
    panel.innerHTML = buildPanelHtml();

    shadow.appendChild(fab);
    shadow.appendChild(panel);

    placeFab(fab, state.fabPosition);
    wireFab(fab, panel);
    wirePanel(panel, fab);

    host._bgpt = { fab, panel, shadow };
  }

  function hasCustomBackground() {
    return !!(
      state.bgCustomDataUrl ||
      state.bgCustomVideoUrl ||
      state.bgCustomMediaType === "video"
    );
  }

  function customBgFileStatus() {
    if (state.bgCustomMediaType === "video" || state.bgCustomVideoUrl) {
      return state.bgCustomVideoName
        ? `已上传视频：${state.bgCustomVideoName}`
        : "已上传视频背景";
    }
    if (state.bgCustomDataUrl) return "已上传自定义图片";
    return "尚未上传自定义文件";
  }

  function customBgHint() {
    if (state.bgCustomMediaType === "video" || state.bgCustomVideoUrl) {
      return "视频背景已启用（静音循环）。上方「未选择任何文件」是选择框重置，不代表没传成功。";
    }
    if (state.bgCustomDataUrl) {
      return "当前自定义：图片背景。也可改传视频（建议 mp4/webm，≤40MB）。";
    }
    return "预设主题自带背景；也可上传图片或视频。视频请用较小的 mp4/webm（≤40MB）。透明度越高，背景越明显。";
  }

  function buildPanelHtml() {
    const themes = Object.values(state.themes);
    const cards = themes
      .map((t) => {
        const swatches = (t.preview || ["#ccc", "#aaa", "#888"])
          .map((c) => `<span style="background:${c}"></span>`)
          .join("");
        const active = t.id === state.themeId ? " is-active" : "";
        return `
          <button type="button" class="bgpt-theme-card${active}" data-theme-id="${t.id}">
            <div class="bgpt-swatches">${swatches}</div>
            <div class="bgpt-theme-name">${escapeHtml(t.name)}</div>
            <div class="bgpt-theme-desc">${escapeHtml(t.description || "")}</div>
          </button>
        `;
      })
      .join("");

    const labels = Theme.getVarLabels();
    const baseVars =
      state.themeId === "custom"
        ? state.customVars
        : state.themes[state.themeId]?.vars || state.customVars;
    const colorRows = Theme.getVarKeys()
      .map((key) => {
        const value =
          (state.customVars && state.customVars[key]) ||
          (baseVars && baseVars[key]) ||
          "#888888";
        return `
          <div class="bgpt-color-row">
            <label for="bgpt-${key}">${escapeHtml(labels[key] || key)}</label>
            <input type="color" id="bgpt-${key}" data-var="${key}" value="${normalizeHex(value)}" />
          </div>
        `;
      })
      .join("");

    return `
      <div class="bgpt-header">
        <div class="bgpt-brand">
          <div class="bgpt-brand-title">Beauty-GPT</div>
          <div class="bgpt-brand-sub">ChatGPT 主题美化</div>
        </div>
        <button type="button" class="bgpt-close" aria-label="关闭">×</button>
      </div>
      <div class="bgpt-body">
        <section>
          <h3 class="bgpt-section-title">预设主题</h3>
          <div class="bgpt-grid">${cards}</div>
        </section>
        <section>
          <h3 class="bgpt-section-title">聊天背景</h3>
          <div class="bgpt-bg-controls">
            <label class="bgpt-switch-row">
              <span>启用背景</span>
              <input type="checkbox" data-bg-enabled ${state.bgEnabled ? "checked" : ""} />
            </label>
            <label class="bgpt-range-row">
              <span>透明度 <em data-bg-opacity-label>${state.bgOpacity}%</em></span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value="${state.bgOpacity}"
                data-bg-opacity
                ${state.bgEnabled ? "" : "disabled"}
              />
            </label>
            <label class="bgpt-switch-row">
              <span>使用自定义背景</span>
              <input type="checkbox" data-bg-use-custom ${state.bgUseCustom ? "checked" : ""} ${state.bgEnabled ? "" : "disabled"} />
            </label>
            <div class="bgpt-bg-file-row">
              <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" data-bg-file ${state.bgEnabled && state.bgUseCustom ? "" : "disabled"} />
              <button type="button" class="bgpt-btn" data-action="clear-bg-custom" ${hasCustomBackground() ? "" : "disabled"}>清除自定义</button>
            </div>
            <div class="bgpt-bg-file-status" data-bg-file-status>${customBgFileStatus()}</div>
            <div class="bgpt-bg-hint" data-bg-hint>${customBgHint()}</div>
          </div>
        </section>
        <section>
          <h3 class="bgpt-section-title">自定义配色</h3>
          <div class="bgpt-custom">${colorRows}</div>
          <div class="bgpt-status" data-status style="margin-top:10px"></div>
        </section>
        <footer class="bgpt-footer">
          <div class="bgpt-footer-brand">
            <img class="bgpt-footer-avatar" src="${Theme.extensionUrl ? Theme.extensionUrl("assets/logo.png") || "" : ""}" alt="" />
            <div class="bgpt-footer-meta">
              <div class="bgpt-footer-name">炽阳001</div>
              <div class="bgpt-footer-tag">Beauty-GPT · 作者</div>
            </div>
          </div>
          <div class="bgpt-footer-links">
            <a class="bgpt-social bgpt-social-bili" href="https://space.bilibili.com/404891612" target="_blank" rel="noopener noreferrer" title="哔哩哔哩">
              <img class="bgpt-social-icon" src="${Theme.extensionUrl ? Theme.extensionUrl("assets/bilibili-color.svg") || "" : ""}" alt="" />
              <span>B站</span>
            </a>
            <a class="bgpt-social bgpt-social-gh" href="https://github.com/Chiyang001?tab=repositories" target="_blank" rel="noopener noreferrer" title="GitHub">
              <img class="bgpt-social-icon" src="${Theme.extensionUrl ? Theme.extensionUrl("assets/github.svg") || "" : ""}" alt="" />
              <span>GitHub</span>
            </a>
          </div>
          <div class="bgpt-footer-contact">
            <span>QQ 3083248889</span>
            <span class="bgpt-footer-dot">·</span>
            <a href="mailto:3083248889@qq.com">3083248889@qq.com</a>
          </div>
        </footer>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeHex(value) {
    if (!value || typeof value !== "string") return "#888888";
    let v = value.trim();
    if (!v.startsWith("#")) v = `#${v}`;
    if (v.length === 4) {
      v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return "#888888";
    return v.toLowerCase();
  }

  function placeFab(fab, pos) {
    const margin = 20;
    const size = 52;
    let left;
    let top;
    if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
      left = pos.left;
      top = pos.top;
    } else {
      left = window.innerWidth - size - margin;
      top = window.innerHeight - size - margin;
    }
    left = clamp(left, margin, window.innerWidth - size - margin);
    top = clamp(top, margin, window.innerHeight - size - margin);
    fab.style.left = `${left}px`;
    fab.style.top = `${top}px`;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function placePanelNearFab(panel, fab) {
    const fabRect = fab.getBoundingClientRect();
    const panelW = Math.min(340, window.innerWidth - 24);
    const panelH = Math.min(560, window.innerHeight - 32);
    let left = fabRect.right - panelW;
    let top = fabRect.top - panelH - 12;
    if (top < 12) top = fabRect.bottom + 12;
    left = clamp(left, 12, window.innerWidth - panelW - 12);
    top = clamp(top, 12, window.innerHeight - Math.min(panelH, window.innerHeight - 24));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function wireFab(fab, panel) {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    fab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      fab.setPointerCapture(e.pointerId);
      fab.classList.add("is-dragging");
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseFloat(fab.style.left) || fab.getBoundingClientRect().left;
      origTop = parseFloat(fab.style.top) || fab.getBoundingClientRect().top;
    });

    fab.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      const size = 52;
      const left = clamp(origLeft + dx, 8, window.innerWidth - size - 8);
      const top = clamp(origTop + dy, 8, window.innerHeight - size - 8);
      fab.style.left = `${left}px`;
      fab.style.top = `${top}px`;
      if (panel.classList.contains("is-open")) {
        placePanelNearFab(panel, fab);
      }
    });

    fab.addEventListener("pointerup", async (e) => {
      if (!dragging) return;
      dragging = false;
      fab.classList.remove("is-dragging");
      try {
        fab.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      if (moved) {
        const pos = {
          left: parseFloat(fab.style.left),
          top: parseFloat(fab.style.top),
        };
        state.fabPosition = pos;
        await Theme.saveFabPosition(pos);
      } else {
        togglePanel(panel, fab);
      }
    });

    window.addEventListener("resize", () => {
      placeFab(fab, {
        left: parseFloat(fab.style.left),
        top: parseFloat(fab.style.top),
      });
      if (panel.classList.contains("is-open")) {
        placePanelNearFab(panel, fab);
      }
    });
  }

  function togglePanel(panel, fab) {
    state.panelOpen = !state.panelOpen;
    if (state.panelOpen) {
      panel.classList.add("is-open");
      placePanelNearFab(panel, fab);
    } else {
      panel.classList.remove("is-open");
    }
  }

  function wirePanel(panel, fab) {
    panel.querySelector(".bgpt-close")?.addEventListener("click", () => {
      state.panelOpen = false;
      panel.classList.remove("is-open");
    });

    panel.querySelectorAll("[data-theme-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-theme-id");
        await selectPreset(id, panel);
      });
    });

    let colorSaveTimer = null;
    panel.querySelectorAll('input[type="color"][data-var]').forEach((input) => {
      input.addEventListener("input", () => {
        // 改色即预览并自动保存，无需再点「应用」
        previewCustom(panel);
        if (colorSaveTimer) clearTimeout(colorSaveTimer);
        colorSaveTimer = setTimeout(() => {
          applyCustom(panel, { quiet: true });
        }, 280);
      });
    });

    wireWallpaperControls(panel);

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!state.panelOpen) return;
        const path = e.composedPath();
        if (path.includes(panel) || path.includes(fab)) return;
        state.panelOpen = false;
        panel.classList.remove("is-open");
      },
      true
    );
  }

  function collectCustomVars(panel) {
    const vars = {};
    panel.querySelectorAll('input[type="color"][data-var]').forEach((input) => {
      vars[input.getAttribute("data-var")] = input.value;
    });
    return vars;
  }

  function getBaseVarsForTheme(themeId) {
    if (themeId === "custom") return state.customVars;
    const theme = state.themes[themeId];
    return theme?.vars || null;
  }

  function previewCustom(panel) {
    const vars = collectCustomVars(panel);
    state.activeVars = vars;
    Theme.applyTheme(vars);
    syncFabTheme(vars);
    syncWallpaper();
    setStatus(panel, "配色已实时预览并自动保存");
  }

  async function applyCustom(panel, options = {}) {
    const vars = collectCustomVars(panel);
    state.themeId = "custom";
    state.customVars = vars;
    state.activeVars = vars;
    Theme.applyTheme(vars);
    syncFabTheme(vars);
    await syncWallpaper();
    await Theme.saveThemeSelection("custom", vars);
    refreshPanelActive(panel);
    if (!options.quiet) setStatus(panel, "自定义主题已保存");
  }

  async function selectPreset(themeId, panel) {
    state.themeId = themeId;
    const vars = await Theme.resolveActiveVars(themeId, state.customVars, state.themes);
    state.activeVars = vars;
    Theme.applyTheme(vars);
    syncFabTheme(vars);
    syncWallpaper();
    await Theme.saveThemeSelection(themeId);
    syncColorInputs(panel, getBaseVarsForTheme(themeId) || state.customVars);
    refreshPanelActive(panel);
    syncWallpaperControls(panel);
    const name = state.themes[themeId]?.name || themeId;
    setStatus(panel, `已切换：${name}`);
  }

  function wireWallpaperControls(panel) {
    const enabledInput = panel.querySelector("[data-bg-enabled]");
    const opacityInput = panel.querySelector("[data-bg-opacity]");
    const useCustomInput = panel.querySelector("[data-bg-use-custom]");
    const fileInput = panel.querySelector("[data-bg-file]");
    const clearBtn = panel.querySelector('[data-action="clear-bg-custom"]');
    const opacityLabel = panel.querySelector("[data-bg-opacity-label]");

    enabledInput?.addEventListener("change", async () => {
      state.bgEnabled = !!enabledInput.checked;
      await Theme.saveWallpaperSettings({ enabled: state.bgEnabled });
      await syncWallpaper();
      syncWallpaperControls(panel);
      setStatus(panel, state.bgEnabled ? "已启用背景" : "已关闭背景");
    });

    opacityInput?.addEventListener("input", () => {
      state.bgOpacity = Number(opacityInput.value) || 0;
      if (opacityLabel) opacityLabel.textContent = `${state.bgOpacity}%`;
      syncWallpaper();
    });

    opacityInput?.addEventListener("change", async () => {
      state.bgOpacity = Number(opacityInput.value) || 0;
      await Theme.saveWallpaperSettings({ opacity: state.bgOpacity });
      setStatus(panel, `背景透明度：${state.bgOpacity}%`);
    });

    useCustomInput?.addEventListener("change", async () => {
      state.bgUseCustom = !!useCustomInput.checked;
      await Theme.saveWallpaperSettings({ useCustom: state.bgUseCustom });
      await syncWallpaper();
      syncWallpaperControls(panel);
      setStatus(
        panel,
        state.bgUseCustom ? "已切换为自定义背景" : "已使用主题预设背景"
      );
    });

    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const isVideo =
        typeof Theme.isVideoFile === "function"
          ? Theme.isVideoFile(file)
          : String(file.type || "").startsWith("video/");
      const fileName = file.name || (isVideo ? "video.mp4" : "image");
      try {
        if (isVideo) {
          setStatus(panel, `正在导入视频「${fileName}」… 0%`);
          const videoUrl = await Theme.saveCustomVideoFile(file, (pct) => {
            setStatus(panel, `正在导入视频「${fileName}」… ${pct}%`);
          });
          if (!videoUrl) throw new Error("视频保存失败");
          state.bgCustomVideoUrl = videoUrl;
          state.bgCustomMediaType = "video";
          state.bgCustomVideoName = fileName;
          state.bgCustomDataUrl = null;
        } else {
          setStatus(panel, `正在导入图片「${fileName}」…`);
          const dataUrl = await readImageAsDataUrl(file);
          state.bgCustomDataUrl = dataUrl;
          state.bgCustomMediaType = "image";
          state.bgCustomVideoUrl = null;
          state.bgCustomVideoName = null;
          await Theme.saveCustomWallpaper(dataUrl);
        }
        state.bgUseCustom = true;
        state.bgEnabled = true;
        await Theme.saveWallpaperSettings({
          enabled: true,
          useCustom: true,
        });
        // 上传后立刻应用，不依赖其它按钮
        await syncWallpaper();
        if (state.activeVars) {
          Theme.ensureThemeAlive(state.activeVars);
        }
        syncWallpaperControls(panel);
        setStatus(
          panel,
          isVideo
            ? `已应用视频背景：${fileName}（可调透明度）`
            : `已应用图片背景：${fileName}`
        );
      } catch (err) {
        console.error("[Beauty-GPT] wallpaper upload failed", err);
        setStatus(panel, err?.message || "背景读取失败，请换一个文件试试");
      }
      // 原生 file 控件选完后会重置显示为「未选择任何文件」，属正常
      fileInput.value = "";
    });

    clearBtn?.addEventListener("click", async () => {
      state.bgCustomDataUrl = null;
      state.bgCustomVideoUrl = null;
      state.bgCustomMediaType = null;
      state.bgCustomVideoName = null;
      state.bgUseCustom = false;
      await Theme.saveCustomWallpaper(null);
      await Theme.saveWallpaperSettings({ useCustom: false });
      await syncWallpaper();
      syncWallpaperControls(panel);
      setStatus(panel, "已清除自定义背景");
    });
  }

  function syncWallpaperControls(panelEl) {
    const host = document.getElementById(HOST_ID);
    const panel = panelEl || host?._bgpt?.panel;
    if (!panel) return;
    const enabledInput = panel.querySelector("[data-bg-enabled]");
    const opacityInput = panel.querySelector("[data-bg-opacity]");
    const useCustomInput = panel.querySelector("[data-bg-use-custom]");
    const fileInput = panel.querySelector("[data-bg-file]");
    const clearBtn = panel.querySelector('[data-action="clear-bg-custom"]');
    const opacityLabel = panel.querySelector("[data-bg-opacity-label]");
    const hint = panel.querySelector("[data-bg-hint]");
    const fileStatus = panel.querySelector("[data-bg-file-status]");

    if (enabledInput) enabledInput.checked = !!state.bgEnabled;
    if (opacityInput) {
      opacityInput.value = String(state.bgOpacity);
      opacityInput.disabled = !state.bgEnabled;
    }
    if (opacityLabel) opacityLabel.textContent = `${state.bgOpacity}%`;
    if (useCustomInput) {
      useCustomInput.checked = !!state.bgUseCustom;
      useCustomInput.disabled = !state.bgEnabled;
    }
    if (fileInput) fileInput.disabled = !state.bgEnabled || !state.bgUseCustom;
    if (clearBtn) clearBtn.disabled = !hasCustomBackground();
    if (fileStatus) fileStatus.textContent = customBgFileStatus();
    if (hint) hint.textContent = customBgHint();
  }

  function readImageAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1920;
          const scale = Math.min(1, maxW / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => reject(new Error("image decode failed"));
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function syncColorInputs(panel, vars) {
    if (!vars) return;
    panel.querySelectorAll('input[type="color"][data-var]').forEach((input) => {
      const key = input.getAttribute("data-var");
      if (vars[key]) input.value = normalizeHex(vars[key]);
    });
  }

  function refreshPanelActive(panelEl) {
    const host = document.getElementById(HOST_ID);
    const panel = panelEl || host?._bgpt?.panel;
    if (!panel) return;
    panel.querySelectorAll("[data-theme-id]").forEach((btn) => {
      const id = btn.getAttribute("data-theme-id");
      btn.classList.toggle("is-active", id === state.themeId);
    });
  }

  function setStatus(panel, text) {
    const el = panel.querySelector("[data-status]");
    if (el) el.textContent = text || "";
  }

  function watchSpa() {
    let timer = null;
    let raf = 0;
    let wasStreaming = false;
    const HOST_SEL = `#${HOST_ID}`;

    const isIgnoredNode = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const id = node.id || "";
      if (
        id === HOST_ID ||
        id === "beauty-gpt-bg-video" ||
        id === "beauty-gpt-bg-frame" ||
        id === "beauty-gpt-theme" ||
        id === "beauty-gpt-wallpaper" ||
        id.startsWith("beauty-gpt")
      ) {
        return true;
      }
      return !!(
        node.closest &&
        node.closest(
          `${HOST_SEL}, #beauty-gpt-bg-video, #beauty-gpt-bg-frame, #beauty-gpt-theme, #beauty-gpt-wallpaper`
        )
      );
    };

    const mutationMatters = (mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (isIgnoredNode(m.target)) continue;
        const added = m.addedNodes;
        for (let j = 0; j < added.length; j++) {
          const n = added[j];
          if (n.nodeType === 3) return true; // streaming text
          if (n.nodeType === 1 && !isIgnoredNode(n)) return true;
        }
        const removed = m.removedNodes;
        for (let j = 0; j < removed.length; j++) {
          const n = removed[j];
          if (n.nodeType === 1 && !isIgnoredNode(n)) return true;
        }
      }
      return false;
    };

    const refreshAfterSpa = () => {
      if (!isAlive()) {
        disposeExtensionRuntime();
        return;
      }
      try {
        const streaming =
          typeof Theme.isChatStreaming === "function"
            ? Theme.isChatStreaming()
            : false;
        // Light while streaming; one full pass when streaming ends; otherwise light
        const mode = streaming ? "light" : wasStreaming ? "full" : "light";
        wasStreaming = streaming;
        if (state.activeVars) {
          Theme.ensureThemeAlive(state.activeVars, { mode });
        }
        // Do NOT syncWallpaper here — async resolve + CSS rewrite on every token
        if (!document.getElementById(HOST_ID)) {
          mountUI();
        }
      } catch (err) {
        const msg = err?.message || String(err);
        if (/Extension context invalidated/i.test(msg)) {
          disposeExtensionRuntime(msg);
        }
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (disposed) {
        observer.disconnect();
        return;
      }
      if (!mutationMatters(mutations)) return;
      if (timer) return;
      const streamingHint =
        typeof Theme.isChatStreaming === "function" && Theme.isChatStreaming();
      // Longer debounce while GPT is streaming tokens
      const delay = streamingHint || wasStreaming ? 320 : 160;
      timer = setTimeout(() => {
        timer = null;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = 0;
          refreshAfterSpa();
        });
      }, delay);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Soft re-apply on history navigation (ChatGPT SPA)
    const wrapHistory = (method) => {
      const original = history[method];
      history[method] = function (...args) {
        const ret = original.apply(this, args);
        queueMicrotask(() => {
          if (!isAlive()) {
            disposeExtensionRuntime();
            return;
          }
          try {
            Theme.ensureThemeAlive(state.activeVars, { mode: "full" });
          } catch (err) {
            if (/Extension context invalidated/i.test(err?.message || "")) {
              disposeExtensionRuntime(err.message);
            }
          }
        });
        return ret;
      };
    };
    wrapHistory("pushState");
    wrapHistory("replaceState");
    window.addEventListener("popstate", () => {
      if (!isAlive()) {
        disposeExtensionRuntime();
        return;
      }
      try {
        Theme.ensureThemeAlive(state.activeVars, { mode: "full" });
      } catch (err) {
        if (/Extension context invalidated/i.test(err?.message || "")) {
          disposeExtensionRuntime(err.message);
        }
      }
    });
  }

  try {
    await init();
  } catch (err) {
    const msg = err?.message || String(err);
    if (
      /Extension context invalidated/i.test(msg) ||
      /Cannot read properties of undefined/i.test(msg)
    ) {
      disposeExtensionRuntime(msg);
      return;
    }
    console.error("[Beauty-GPT] init failed", err);
  }
})();

/**
 * Beauty-GPT theme engine
 * Shared between content script and popup via global BeautyGPTTheme.
 */
(function (global) {
  const STYLE_ID = "beauty-gpt-theme";
  const STORAGE_KEYS = {
    themeId: "beautyGptThemeId",
    customVars: "beautyGptCustomVars",
    fabPosition: "beautyGptFabPosition",
    bgEnabled: "beautyGptBgEnabled",
    bgOpacity: "beautyGptBgOpacity",
    bgUseCustom: "beautyGptBgUseCustom",
  };

  const LOCAL_STORAGE_KEYS = {
    bgCustomDataUrl: "beautyGptBgCustomDataUrl",
    bgCustomMediaType: "beautyGptBgCustomMediaType", // "image" | "video" | null
    bgCustomVideoName: "beautyGptBgCustomVideoName",
  };

  const WALLPAPER_STYLE_ID = "beauty-gpt-wallpaper";
  const VIDEO_EL_ID = "beauty-gpt-bg-video";
  const VIDEO_FRAME_ID = "beauty-gpt-bg-frame";
  const VIDEO_CHUNK_BYTES = 256 * 1024;
  const DEFAULT_BG_OPACITY = 40;
  const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

  /** @type {{ enabled: boolean, opacity: number, url: string|null, bgPrimary: string|null, mediaType: "image"|"video"|null }} */
  let currentWallpaper = {
    enabled: false,
    opacity: DEFAULT_BG_OPACITY,
    url: null,
    bgPrimary: null,
    mediaType: null,
  };

  /** @type {string|null} */
  let activeVideoObjectUrl = null;

  const VAR_KEYS = [
    "bgPrimary",
    "bgSecondary",
    "bgSidebar",
    "textPrimary",
    "textSecondary",
    "accent",
    "accentHover",
    "border",
    "inputBg",
    "bubbleUser",
    "bubbleAssistant",
  ];

  const VAR_LABELS = {
    bgPrimary: "主背景",
    bgSecondary: "次背景",
    bgSidebar: "侧边栏",
    textPrimary: "主文字",
    textSecondary: "次文字",
    accent: "强调色",
    accentHover: "强调色悬停",
    border: "边框",
    inputBg: "输入框背景",
    bubbleUser: "用户气泡",
    bubbleAssistant: "助手气泡",
  };

  const CSS_VAR_MAP = {
    bgPrimary: "--bgpt-bg-primary",
    bgSecondary: "--bgpt-bg-secondary",
    bgSidebar: "--bgpt-bg-sidebar",
    textPrimary: "--bgpt-text-primary",
    textSecondary: "--bgpt-text-secondary",
    accent: "--bgpt-accent",
    accentHover: "--bgpt-accent-hover",
    border: "--bgpt-border",
    inputBg: "--bgpt-input-bg",
    bubbleUser: "--bgpt-bubble-user",
    bubbleAssistant: "--bgpt-bubble-assistant",
  };

  let themesCache = null;

  /** 扩展重载后旧 content script 的 chrome.* 会失效，需先探测再调用 */
  function isExtensionContextValid() {
    try {
      return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function extensionUrl(path) {
    if (!isExtensionContextValid()) return null;
    try {
      return chrome.runtime.getURL(path);
    } catch (_) {
      return null;
    }
  }

  async function loadThemes() {
    if (themesCache) return themesCache;
    const url = extensionUrl("src/themes.json");
    if (!url) return themesCache || {};
    const res = await fetch(url);
    themesCache = await res.json();
    return themesCache;
  }

  function getVarKeys() {
    return VAR_KEYS.slice();
  }

  function getVarLabels() {
    return { ...VAR_LABELS };
  }

  function mergeVars(baseVars, customVars) {
    if (!baseVars && !customVars) return null;
    return { ...(baseVars || {}), ...(customVars || {}) };
  }

  function buildCssVariables(vars) {
    if (!vars) return "";
    return Object.entries(CSS_VAR_MAP)
      .map(([key, cssName]) => {
        const value = vars[key];
        return value ? `${cssName}: ${value};` : "";
      })
      .filter(Boolean)
      .join("\n  ");
  }

  function withAlpha(hex, alpha) {
    const c = normalizeHex(hex);
    if (!c) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function normalizeHex(hex) {
    if (!hex || typeof hex !== "string") return null;
    let v = hex.trim();
    if (!v.startsWith("#")) v = `#${v}`;
    if (v.length === 4) {
      v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
    return v.toLowerCase();
  }

  function contrastOn(hex) {
    return isDark(hex) ? "#ffffff" : "#1a1a1a";
  }

  function generateThemeCss(vars) {
    if (!vars) return "";

    const dark = isDark(vars.bgPrimary);
    const rootVars = buildCssVariables(vars);
    const accentFg = contrastOn(vars.accent);
    const hoverSurface = withAlpha(vars.accent, dark ? 0.14 : 0.1);
    const softSurface = withAlpha(vars.textPrimary, dark ? 0.08 : 0.05);
    const elevated = vars.bgSecondary;
    const composerBg = vars.inputBg;
    const composerBorder = withAlpha(vars.border, 0.9);

    // Override ChatGPT design tokens so Tailwind token utilities pick up theme colors
    const chatgptTokens = `
  --main-surface-primary: ${vars.bgPrimary} !important;
  --main-surface-secondary: ${vars.bgSecondary} !important;
  --main-surface-tertiary: ${vars.bgSecondary} !important;
  --sidebar-surface-primary: ${vars.bgSidebar} !important;
  --sidebar-surface-secondary: ${vars.bgSecondary} !important;
  --sidebar-surface-tertiary: ${withAlpha(vars.textPrimary, 0.06)} !important;
  --composer-surface-primary: ${composerBg} !important;
  --composer-surface-secondary: ${vars.bgSecondary} !important;
  --bg-primary: ${vars.bgPrimary} !important;
  --bg-secondary: ${vars.bgSecondary} !important;
  --bg-tertiary: ${vars.bgSecondary} !important;
  --bg-elevated-primary: ${elevated} !important;
  --bg-elevated-secondary: ${vars.bgSecondary} !important;
  --code-block-surface: ${vars.bgSecondary} !important;
  --surface-primary: ${vars.bgPrimary} !important;
  --surface-secondary: ${vars.bgSecondary} !important;
  --surface-tertiary: ${vars.bgSecondary} !important;
  --token-bg-primary: ${vars.bgPrimary} !important;
  --token-bg-secondary: ${vars.bgSecondary} !important;
  --token-bg-tertiary: ${vars.bgSecondary} !important;
  --token-bg-secondary-surface: ${vars.bgSecondary} !important;
  --text-primary: ${vars.textPrimary} !important;
  --text-secondary: ${vars.textSecondary} !important;
  --text-tertiary: ${vars.textSecondary} !important;
  --text-quaternary: ${withAlpha(vars.textSecondary, 0.75)} !important;
  --icon-primary: ${vars.textPrimary} !important;
  --icon-secondary: ${vars.textSecondary} !important;
  --icon-tertiary: ${vars.textSecondary} !important;
  --border-light: ${vars.border} !important;
  --border-medium: ${vars.border} !important;
  --border-heavy: ${vars.border} !important;
  --border-xheavy: ${vars.border} !important;
  --border-strong: ${vars.accent} !important;
  --link: ${vars.accent} !important;
  --link-hover: ${vars.accentHover} !important;
  --interactive-label-primary: ${vars.textPrimary} !important;
  --interactive-label-secondary: ${vars.textSecondary} !important;
  --interactive-label-accent-default: ${vars.accent} !important;
  --interactive-bg-primary-default: transparent !important;
  --interactive-bg-secondary-default: transparent !important;
  --interactive-bg-secondary-hover: ${withAlpha(vars.textPrimary, dark ? 0.06 : 0.05)} !important;
  --interactive-bg-accent-default: ${withAlpha(vars.accent, 0.12)} !important;
  --interactive-border-focus: ${vars.accent} !important;
  --surface-hover: ${withAlpha(vars.textPrimary, dark ? 0.06 : 0.05)} !important;
  --token-surface-hover: ${withAlpha(vars.textPrimary, dark ? 0.06 : 0.05)} !important;
  --token-main-surface-primary: ${vars.bgPrimary} !important;
  --token-main-surface-secondary: ${vars.bgSecondary} !important;
  --token-sidebar-surface-primary: ${vars.bgSidebar} !important;
  --token-sidebar-surface-secondary: ${vars.bgSecondary} !important;
  --token-text-primary: ${vars.textPrimary} !important;
  --token-text-secondary: ${vars.textSecondary} !important;
  --token-text-tertiary: ${vars.textSecondary} !important;
  --token-border-default: ${vars.border} !important;
  --token-border-light: ${vars.border} !important;
  --gray-50: ${vars.bgPrimary} !important;
  --gray-100: ${vars.bgSecondary} !important;
  --gray-200: ${vars.border} !important;
  --gray-700: ${vars.textSecondary} !important;
  --gray-800: ${vars.textPrimary} !important;
  --gray-900: ${vars.textPrimary} !important;
`;

    return `
html.beauty-gpt-active {
  ${rootVars}
  ${chatgptTokens}
  color-scheme: ${dark ? "dark" : "light"} !important;
}

html.beauty-gpt-active,
html.beauty-gpt-active body {
  color: var(--bgpt-text-primary) !important;
}

/* 无壁纸时铺主题底；有壁纸时保持透明以透出背景层 */
html.beauty-gpt-active:not(.beauty-gpt-bg),
html.beauty-gpt-active:not(.beauty-gpt-bg) body {
  background-color: var(--bgpt-bg-primary) !important;
  background: var(--bgpt-bg-primary) !important;
}

/* ========== Global surfaces ========== */
html.beauty-gpt-active #__next,
html.beauty-gpt-active main,
html.beauty-gpt-active #main,
html.beauty-gpt-active #thread,
html.beauty-gpt-active [data-scroll-root],
html.beauty-gpt-active .composer-parent {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active:not(.beauty-gpt-bg) #__next,
html.beauty-gpt-active:not(.beauty-gpt-bg) main,
html.beauty-gpt-active:not(.beauty-gpt-bg) #main,
html.beauty-gpt-active:not(.beauty-gpt-bg) #thread,
html.beauty-gpt-active:not(.beauty-gpt-bg) [data-scroll-root],
html.beauty-gpt-active:not(.beauty-gpt-bg) .composer-parent {
  background-color: var(--bgpt-bg-primary) !important;
  background: var(--bgpt-bg-primary) !important;
}

/* 资料库 / 项目 / 其它非对话页主内容区 */
html.beauty-gpt-active [class*="page-"],
html.beauty-gpt-active section,
html.beauty-gpt-active [role="main"],
html.beauty-gpt-active main > div,
html.beauty-gpt-active #main > div {
  color: var(--bgpt-text-primary);
}

html.beauty-gpt-active input[type="search"],
html.beauty-gpt-active input[type="text"],
html.beauty-gpt-active [role="search"],
html.beauty-gpt-active [placeholder*="搜索"],
html.beauty-gpt-active [aria-label*="搜索"] {
  background-color: var(--bgpt-input-bg) !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active input::placeholder {
  color: var(--bgpt-text-secondary) !important;
}

/* 资料库：筛选 Tab / 工具条（不含工作区建议列表） */
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"],
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] .bg-surface-primary,
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] [class*="bg-surface-primary"] {
  background-color: var(--bgpt-bg-primary) !important;
  background: var(--bgpt-bg-primary) !important;
  color: var(--bgpt-text-primary) !important;
}

/* 工作模式：输入框下方建议列表 — 圆角 + 主题色，去掉直角硬块 */
html.beauty-gpt-active #thread-bottom .bg-surface-primary,
html.beauty-gpt-active #thread-bottom-container .bg-surface-primary,
html.beauty-gpt-active #thread-bottom [class*="bg-surface-primary"],
html.beauty-gpt-active #thread-bottom-container [class*="bg-surface-primary"],
html.beauty-gpt-active .absolute.top-full .bg-surface-primary,
html.beauty-gpt-active .absolute.top-full [class*="bg-surface-primary"] {
  background: var(--bgpt-input-bg) !important;
  background-color: var(--bgpt-input-bg) !important;
  color: var(--bgpt-text-primary) !important;
  border-radius: 0 0 1.25rem 1.25rem !important;
  overflow: hidden !important;
  box-shadow: none !important;
  border: none !important;
}

/* Composer「+」菜单 / 底部浮层：实底（勿用宽泛 .absolute，否则会染到 composer 外壳） */
html.beauty-gpt-active #thread-bottom .absolute.top-full,
html.beauty-gpt-active #thread-bottom [class*="top-full"],
html.beauty-gpt-active .composer-parent .absolute.top-full,
html.beauty-gpt-active #thread-bottom [role="dialog"],
html.beauty-gpt-active #thread-bottom [role="menu"],
html.beauty-gpt-active #thread-bottom [role="listbox"],
html.beauty-gpt-active #thread-bottom [data-radix-menu-content],
html.beauty-gpt-active #thread-bottom [popover]:not([popover="hint"]),
html.beauty-gpt-active .composer-parent [popover]:not([popover="hint"]),
html.beauty-gpt-active [data-radix-popper-content-wrapper] > div,
html.beauty-gpt-active #thread-bottom [class*="bg-token-main-surface"]:not([data-composer-surface] *):not([data-composer-surface]),
html.beauty-gpt-active #thread-bottom [class*="bg-token-bg-elevated"]:not([data-composer-surface] *):not([data-composer-surface]),
html.beauty-gpt-active .composer-parent [class*="bg-token-bg-elevated"]:not([data-composer-surface] *):not([data-composer-surface]) {
  background: var(--bgpt-bg-secondary) !important;
  background-color: var(--bgpt-bg-secondary) !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
  box-shadow: 0 12px 32px ${withAlpha(vars.textPrimary, dark ? 0.35 : 0.14)} !important;
  border-radius: 1.25rem !important;
  overflow: hidden !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  opacity: 1 !important;
}

/* 输入框内部 absolute 布局槽位不要被涂成浮层实底（勿命中 button，否则会抹平圆形按钮） */
html.beauty-gpt-active [data-composer-surface="true"] .absolute:not(button),
html.beauty-gpt-active [data-composer-surface="true"].absolute:not(button),
html.beauty-gpt-active [data-composer-transition-slot]:not(button),
html.beauty-gpt-active [data-composer-surface="true"] [class*="absolute"]:not(button) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  overflow: visible !important;
}

/* trailing 区：模式选择 / 麦克风 / 语音按钮保持圆形 */
html.beauty-gpt-active [data-composer-surface="true"] button,
html.beauty-gpt-active [data-composer-surface="true"] .composer-btn,
html.beauty-gpt-active [data-composer-surface="true"] .composer-submit-button-color,
html.beauty-gpt-active [data-composer-surface="true"] .__composer-pill,
html.beauty-gpt-active [data-composer-surface="true"] button[data-tone="neutral"] {
  border-radius: 9999px !important;
}

/* 工作模式：选择项目 / 插件 条 */
html.beauty-gpt-active #thread-bottom [class*="bg-black\\/3"],
html.beauty-gpt-active #thread-bottom [class*="dark:bg-white\\/8"],
html.beauty-gpt-active #thread-bottom .rounded-b-2xl.pt-5:not(:has([data-composer-surface="true"])),
html.beauty-gpt-active #thread-bottom-container .rounded-b-2xl.pt-5:not(:has([data-composer-surface="true"])) {
  background: ${softSurface} !important;
  background-color: ${softSurface} !important;
  color: var(--bgpt-text-secondary) !important;
  border-radius: 0 0 1.25rem 1.25rem !important;
}

html.beauty-gpt-active #thread-bottom .rounded-b-2xl .btn,
html.beauty-gpt-active #thread-bottom .rounded-b-2xl a.btn,
html.beauty-gpt-active #thread-bottom-container .rounded-b-2xl .btn,
html.beauty-gpt-active #thread-bottom-container .rounded-b-2xl a.btn {
  color: var(--bgpt-text-secondary) !important;
  background: transparent !important;
  border-color: transparent !important;
}

html.beauty-gpt-active #thread-bottom .rounded-b-2xl .btn:hover,
html.beauty-gpt-active #thread-bottom .rounded-b-2xl a.btn:hover {
  background-color: ${hoverSurface} !important;
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active #thread-bottom .bg-surface-primary li button,
html.beauty-gpt-active #thread-bottom [class*="bg-surface-primary"] li button,
html.beauty-gpt-active .absolute.top-full .bg-surface-primary li button {
  color: var(--bgpt-text-secondary) !important;
  border-radius: 0.75rem !important;
}

html.beauty-gpt-active #thread-bottom .bg-surface-primary li button:hover,
html.beauty-gpt-active .absolute.top-full .bg-surface-primary li button:hover {
  background-color: ${hoverSurface} !important;
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active .bg-token-bg-tertiary,
html.beauty-gpt-active .bg-token-bg-tertiary\\!,
html.beauty-gpt-active [class*="bg-token-bg-tertiary"] {
  background-color: var(--bgpt-bg-secondary) !important;
}

html.beauty-gpt-active [class*="from-token-bg-primary"],
html.beauty-gpt-active [class*="from-token-bg-secondary"] {
  --tw-gradient-from: var(--bgpt-bg-primary) !important;
  --tw-gradient-to: transparent !important;
  --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
}

html.beauty-gpt-active [role="tablist"]:not([data-settings-tab-list]),
html.beauty-gpt-active [role="tablist"]:not([data-settings-tab-list]) > [role="tab"] {
  color: var(--bgpt-text-secondary) !important;
  background: transparent !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active [role="tablist"]:not([data-settings-tab-list]) > [role="tab"][aria-selected="true"],
html.beauty-gpt-active [role="tablist"]:not([data-settings-tab-list]) > [role="tab"][data-state="active"],
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] button[aria-current="page"],
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] .btn-primary-inverse {
  color: var(--bgpt-text-primary) !important;
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.08)} !important;
}

html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] button.btn-ghost {
  color: var(--bgpt-text-secondary) !important;
  background: transparent !important;
}

html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] button[aria-label="网格视图"],
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] button[aria-label="列表视图"],
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] button[aria-label="打开筛选器"],
html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] button[aria-label="更改布局"] {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] .bg-token-border-light {
  background-color: var(--bgpt-border) !important;
}

/* 资料库列表行：扁平，去掉厚重独立框感（勿扫全站 listbox，会打穿 + 菜单） */
html.beauty-gpt-active table,
html.beauty-gpt-active [role="table"],
html.beauty-gpt-active [role="row"],
html.beauty-gpt-active [role="rowgroup"],
html.beauty-gpt-active [role="grid"] {
  background: transparent !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active [data-testid="artifacts-surface-top-controls"] ~ * [role="listbox"],
html.beauty-gpt-active main:has([data-testid="artifacts-surface-top-controls"]) [role="listbox"] {
  background: transparent !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active [role="row"],
html.beauty-gpt-active [role="option"],
html.beauty-gpt-active li[class*="border"],
html.beauty-gpt-active a[class*="border"] {
  border-color: var(--bgpt-border) !important;
  box-shadow: none !important;
}

html.beauty-gpt-active [role="row"]:hover,
html.beauty-gpt-active [role="option"]:hover {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.06 : 0.05)} !important;
}

html.beauty-gpt-active [role="columnheader"],
html.beauty-gpt-active th {
  color: var(--bgpt-text-secondary) !important;
  background: transparent !important;
  border-color: var(--bgpt-border) !important;
}

/* 新建等主按钮 */
html.beauty-gpt-active button.btn-primary,
html.beauty-gpt-active a.btn-primary,
html.beauty-gpt-active button[class*="btn"][class*="primary"] {
  background-color: var(--bgpt-accent) !important;
  color: ${accentFg} !important;
  border-color: transparent !important;
}

/* 页头分享区保持透明；其它 translucent 用次背景 */
html.beauty-gpt-active .translucent-surface:not(#conversation-header-actions) {
  background: ${withAlpha(vars.bgSecondary, 0.85)} !important;
  color: var(--bgpt-text-primary) !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

/* 底部输入区：无壁纸时铺满主题色，避免 sticky 下方露原站底 */
html.beauty-gpt-active #thread-bottom-container,
html.beauty-gpt-active #thread-bottom,
html.beauty-gpt-active #thread-bottom-container > div,
html.beauty-gpt-active [class*="threadFooter"],
html.beauty-gpt-active [class*="ContentFade"],
html.beauty-gpt-active [class*="threadFooterContentFade"] {
  color: var(--bgpt-text-primary) !important;
  box-shadow: none !important;
}

html.beauty-gpt-active:not(.beauty-gpt-bg) #thread-bottom-container,
html.beauty-gpt-active:not(.beauty-gpt-bg) #thread-bottom,
html.beauty-gpt-active:not(.beauty-gpt-bg) #thread-bottom-container > div,
html.beauty-gpt-active:not(.beauty-gpt-bg) [class*="threadFooter"],
html.beauty-gpt-active:not(.beauty-gpt-bg) [class*="ContentFade"],
html.beauty-gpt-active:not(.beauty-gpt-bg) [class*="threadFooterContentFade"] {
  background-color: var(--bgpt-bg-primary) !important;
  background: var(--bgpt-bg-primary) !important;
}

html.beauty-gpt-active #thread-bottom-container::before,
html.beauty-gpt-active #thread-bottom-container::after,
html.beauty-gpt-active [class*="ContentFade"]::before,
html.beauty-gpt-active [class*="ContentFade"]::after,
html.beauty-gpt-active [class*="threadFooter"]::before,
html.beauty-gpt-active [class*="threadFooter"]::after {
  background: linear-gradient(
    to top,
    var(--bgpt-bg-primary) 30%,
    ${withAlpha(vars.bgPrimary, 0)}
  ) !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

/* 覆盖 ChatGPT 底部锐边阴影变量 */
html.beauty-gpt-active {
  --sharp-edge-bottom-shadow: 0 0 0 0 transparent !important;
  --sharp-edge-top-shadow: 0 0 0 0 transparent !important;
}

html.beauty-gpt-active .bg-token-main-surface-primary,
html.beauty-gpt-active .bg-token-bg-primary,
html.beauty-gpt-active [class*="bg-token-main-surface"],
html.beauty-gpt-active [class*="bg-token-bg-primary"] {
  background-color: var(--bgpt-bg-primary) !important;
}

html.beauty-gpt-active .bg-token-main-surface-secondary,
html.beauty-gpt-active .bg-token-bg-secondary,
html.beauty-gpt-active .bg-token-bg-elevated-primary,
html.beauty-gpt-active [class*="bg-token-bg-elevated"] {
  background-color: var(--bgpt-bg-secondary) !important;
}

html.beauty-gpt-active .bg-token-surface-hover:hover,
html.beauty-gpt-active [class*="hover:bg-token-surface-hover"]:hover {
  background-color: ${hoverSurface} !important;
}

/* 不要用宽泛 bg-gray/zinc 扫全站，否则侧栏菜单会被误染成次背景色 */

/* ========== Sidebar (整板铺色，而非仅菜单项) ========== */
html.beauty-gpt-active #stage-slideover-sidebar,
html.beauty-gpt-active #stage-slideover-sidebar > div,
html.beauty-gpt-active .stage-sidebar-pure-surface,
html.beauty-gpt-active .bg-token-sidebar-surface-primary,
html.beauty-gpt-active [class*="bg-token-sidebar-surface"],
html.beauty-gpt-active [class*="bg-(--sidebar-surface"],
html.beauty-gpt-active #stage-slideover-sidebar [class*="bg-(--sidebar-surface"],
html.beauty-gpt-active #stage-slideover-sidebar .sticky.top-0,
html.beauty-gpt-active nav[aria-label="历史聊天记录"],
html.beauty-gpt-active nav[aria-label="侧边栏"],
html.beauty-gpt-active #stage-slideover-sidebar .grow,
html.beauty-gpt-active #stage-slideover-sidebar [class*="relative z-30"] {
  background-color: var(--bgpt-bg-sidebar) !important;
  background: var(--bgpt-bg-sidebar) !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active #stage-slideover-sidebar .border-token-border-extra-light,
html.beauty-gpt-active #stage-slideover-sidebar .border-token-border-heavy,
html.beauty-gpt-active #stage-slideover-sidebar [class*="border-token-border"] {
  border-color: var(--bgpt-border) !important;
}

/* 菜单项：彻底去掉选中/悬停色块与伪元素「框」 */
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item,
html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item],
html.beauty-gpt-active #stage-slideover-sidebar a.__menu-item,
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item:hover,
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item.hoverable:hover,
html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item]:hover,
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item[data-active],
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item[data-active]:hover,
html.beauty-gpt-active #stage-slideover-sidebar a[data-active][data-sidebar-item],
html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item][data-active],
html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item][data-active]:hover {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border: none !important;
  border-width: 0 !important;
  outline: none !important;
  --tw-ring-shadow: 0 0 #0000 !important;
  --tw-ring-offset-shadow: 0 0 #0000 !important;
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active #stage-slideover-sidebar .__menu-item::before,
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item::after,
html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item]::before,
html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item]::after,
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item[data-active]::before,
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item[data-active]::after {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border: none !important;
  opacity: 0 !important;
  display: none !important;
}

html.beauty-gpt-active #stage-slideover-sidebar .__menu-label {
  color: var(--bgpt-text-primary) !important;
  background: transparent !important;
}

/* 当前会话仅用强调色+字重；非当前保持主文字色 */
html.beauty-gpt-active #stage-slideover-sidebar .__menu-item .truncate,
html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item] .truncate,
html.beauty-gpt-active #history .truncate {
  color: var(--bgpt-text-primary) !important;
  font-weight: 400 !important;
  background: transparent !important;
}

html.beauty-gpt-active #stage-slideover-sidebar [data-sidebar-item][data-active] .truncate,
html.beauty-gpt-active #stage-slideover-sidebar a[data-active][data-sidebar-item] .truncate {
  font-weight: 600 !important;
  color: var(--bgpt-accent) !important;
  background: transparent !important;
}

html.beauty-gpt-active .text-token-text-tertiary,
html.beauty-gpt-active .text-token-icon-tertiary,
html.beauty-gpt-active .header-wordmark .text-token-text-tertiary {
  color: var(--bgpt-text-secondary) !important;
}

/* 侧栏顶栏：搜索 / 关闭边栏 */
html.beauty-gpt-active #sidebar-header button,
html.beauty-gpt-active #sidebar-header button[aria-label="搜索"],
html.beauty-gpt-active #sidebar-header button[aria-label="关闭边栏"],
html.beauty-gpt-active button[data-testid="close-sidebar-button"],
html.beauty-gpt-active #stage-slideover-sidebar button[aria-label="搜索"],
html.beauty-gpt-active #stage-slideover-sidebar button[aria-label="打开边栏"] {
  color: var(--bgpt-text-secondary) !important;
  background: transparent !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

html.beauty-gpt-active #sidebar-header button:hover,
html.beauty-gpt-active #sidebar-header button[aria-label="搜索"]:hover,
html.beauty-gpt-active #sidebar-header button[aria-label="关闭边栏"]:hover,
html.beauty-gpt-active button[data-testid="close-sidebar-button"]:hover,
html.beauty-gpt-active #stage-slideover-sidebar button[aria-label="搜索"]:hover,
html.beauty-gpt-active #stage-slideover-sidebar button[aria-label="打开边栏"]:hover {
  color: var(--bgpt-text-primary) !important;
  background-color: ${hoverSurface} !important;
}

html.beauty-gpt-active #sidebar-header button svg.icon,
html.beauty-gpt-active #sidebar-header button .icon,
html.beauty-gpt-active button[data-testid="close-sidebar-button"] svg,
html.beauty-gpt-active #stage-slideover-sidebar button[aria-label="搜索"] svg {
  color: inherit !important;
  fill: currentColor !important;
}

/* ========== Header: 聊天 / 工作 toggle ========== */
/* 顶栏去掉直角实心底，避免盖住壁纸 / 主题色 */
html.beauty-gpt-active #page-header,
html.beauty-gpt-active #page-header.bg-token-main-surface-primary,
html.beauty-gpt-active #page-header.dark\\:bg-token-bg-secondary-surface,
html.beauty-gpt-active #page-header[class*="bg-token-main-surface"],
html.beauty-gpt-active #page-header[class*="bg-token-bg-secondary"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

html.beauty-gpt-active #page-header [role="group"],
html.beauty-gpt-active #page-header [aria-label="选择聊天界面"] {
  background: transparent !important;
}

html.beauty-gpt-active #page-header [role="group"] > div.pointer-events-none.absolute,
html.beauty-gpt-active #page-header [class*="bg-token-text-primary\\/3"],
html.beauty-gpt-active #page-header [class*="dark:bg-\\[\\#131313\\]"],
html.beauty-gpt-active #page-header .dark\\:bg-\\[\\#131313\\] {
  background-color: ${softSurface} !important;
  background: ${softSurface} !important;
}

/* Fallback: any absolute inset pill behind the segmented control */
html.beauty-gpt-active #page-header [role="group"] .absolute.inset-x-px {
  background-color: ${softSurface} !important;
  background: ${softSurface} !important;
  box-shadow: none !important;
}

/* Active thumb inside 聊天/工作 */
html.beauty-gpt-active #page-header [role="group"] .absolute.inset-0 > .relative > .absolute {
  background-color: var(--bgpt-input-bg) !important;
  border-color: var(--bgpt-border) !important;
  box-shadow: 0 1px 4px ${withAlpha(vars.textPrimary, 0.08)} !important;
}

html.beauty-gpt-active #page-header [role="radio"],
html.beauty-gpt-active #page-header button[role="radio"] {
  color: var(--bgpt-text-secondary) !important;
  background: transparent !important;
}

html.beauty-gpt-active #page-header button[role="radio"][data-state="on"],
html.beauty-gpt-active #page-header button[role="radio"][aria-checked="true"] {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active #page-header [data-testid="thread-header-right-actions"] button,
html.beauty-gpt-active #page-header button[aria-label="开启临时聊天"] {
  color: var(--bgpt-text-primary) !important;
  background-color: transparent !important;
}

html.beauty-gpt-active #page-header button[aria-label="开启临时聊天"]:hover {
  background-color: ${hoverSurface} !important;
}

/* 对话页右上角：分享 / 更多选项 */
html.beauty-gpt-active #conversation-header-actions,
html.beauty-gpt-active #conversation-header-actions.translucent-surface,
html.beauty-gpt-active #page-header .translucent-surface,
html.beauty-gpt-active [data-testid="thread-header-right-actions"] .translucent-surface {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active #conversation-header-actions button,
html.beauty-gpt-active #conversation-header-actions .btn,
html.beauty-gpt-active #conversation-header-actions .btn-ghost,
html.beauty-gpt-active button[data-testid="share-chat-button"],
html.beauty-gpt-active button[data-testid="conversation-options-button"],
html.beauty-gpt-active button[aria-label="分享"],
html.beauty-gpt-active button[aria-label="打开对话选项"] {
  color: var(--bgpt-text-primary) !important;
  background: transparent !important;
  background-color: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

html.beauty-gpt-active #conversation-header-actions button:hover,
html.beauty-gpt-active #conversation-header-actions .btn:hover,
html.beauty-gpt-active button[data-testid="share-chat-button"]:hover,
html.beauty-gpt-active button[data-testid="conversation-options-button"]:hover,
html.beauty-gpt-active button[aria-label="分享"]:hover,
html.beauty-gpt-active button[aria-label="打开对话选项"]:hover {
  background-color: ${hoverSurface} !important;
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active #conversation-header-actions svg.icon,
html.beauty-gpt-active button[data-testid="share-chat-button"] svg,
html.beauty-gpt-active button[data-testid="conversation-options-button"] svg {
  color: var(--bgpt-text-primary) !important;
  fill: currentColor !important;
}

/* Kill hardcoded dark header track */
html.beauty-gpt-active #page-header [style*="#131313"],
html.beauty-gpt-active #page-header [class*="#131313"] {
  background-color: ${softSurface} !important;
}

html.beauty-gpt-active .dark\\:bg-\\[\\#131313\\],
html.beauty-gpt-active [class*="dark:bg-[#131313]"] {
  background-color: ${softSurface} !important;
}

/* ========== Composer (unified input bar) ========== */
html.beauty-gpt-active [data-composer-surface="true"],
html.beauty-gpt-active form[data-type="unified-composer"] [data-composer-surface="true"] {
  background-color: var(--bgpt-input-bg) !important;
  background: var(--bgpt-input-bg) !important;
  border: 1px solid ${composerBorder} !important;
  box-shadow: 0 2px 12px ${withAlpha(vars.textPrimary, dark ? 0.25 : 0.08)} !important;
  color: var(--bgpt-text-primary) !important;
  /* 勿加 overflow:clip — Chrome 下会与圆角叠加导致输入区裁切/错位 */
  border-radius: 28px !important;
}

/* composer 外层壳 / corner-superellipse 包裹层保持透明，避免双层输入框 */
html.beauty-gpt-active .composer-parent > div:not([data-composer-surface="true"]),
html.beauty-gpt-active #thread-bottom > div:not([data-composer-surface="true"]),
html.beauty-gpt-active .composer-parent [class*="corner-superellipse"]:not(.user-message-bubble-color):not([class*="user-message-bubble"]),
html.beauty-gpt-active #thread-bottom [class*="corner-superellipse"]:not(.user-message-bubble-color):not([class*="user-message-bubble"]),
html.beauty-gpt-active .composer-parent .rounded-b-2xl.pt-5:has([data-composer-surface="true"]),
html.beauty-gpt-active #thread-bottom .rounded-b-2xl.pt-5:has([data-composer-surface="true"]) {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border: none !important;
}

html.beauty-gpt-active #prompt-textarea,
html.beauty-gpt-active .ProseMirror,
html.beauty-gpt-active .wcDTda_prosemirror-parent,
html.beauty-gpt-active textarea[name="prompt-textarea"],
html.beauty-gpt-active [data-composer-transition-slot="primary"],
html.beauty-gpt-active [data-composer-transition-slot="leading"],
html.beauty-gpt-active [data-composer-transition-slot="trailing"] {
  background-color: transparent !important;
  background: transparent !important;
  color: var(--bgpt-text-primary) !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

html.beauty-gpt-active .ProseMirror p,
html.beauty-gpt-active .ProseMirror .placeholder,
html.beauty-gpt-active [data-placeholder]::before {
  color: var(--bgpt-text-secondary) !important;
}

/* 文稿编辑区 ProseMirror：正文用主文字色，不要次要色 */
html.beauty-gpt-active .writing-block-editor .ProseMirror,
html.beauty-gpt-active .writing-block-editor .ProseMirror p,
html.beauty-gpt-active .writing-block-editor .ProseMirror span,
html.beauty-gpt-active [data-writing-block-fullscreen-editor-region],
html.beauty-gpt-active [data-writing-block-fullscreen-editor-region] p,
html.beauty-gpt-active [data-writing-block-fullscreen-editor-region] span {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active .composer-btn,
html.beauty-gpt-active button.composer-btn,
html.beauty-gpt-active #composer-plus-btn {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.12 : 0.08)} !important;
  color: var(--bgpt-text-primary) !important;
  border: none !important;
}

html.beauty-gpt-active .composer-btn:hover,
html.beauty-gpt-active #composer-plus-btn:hover {
  background-color: ${hoverSurface} !important;
  color: var(--bgpt-accent) !important;
}

html.beauty-gpt-active .__composer-pill,
html.beauty-gpt-active .__composer-pill--neutral,
html.beauty-gpt-active button[data-tone="neutral"] {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  color: var(--bgpt-text-secondary) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active .composer-submit-button-color,
html.beauty-gpt-active button[aria-label="启动语音功能"],
html.beauty-gpt-active button[aria-label="发送提示"],
html.beauty-gpt-active [class*="composer-submit"] {
  background-color: var(--bgpt-accent) !important;
  color: ${accentFg} !important;
  border: none !important;
}

html.beauty-gpt-active .composer-submit-button-color:hover,
html.beauty-gpt-active button[aria-label="启动语音功能"]:hover {
  background-color: var(--bgpt-accent-hover) !important;
  opacity: 1 !important;
}

html.beauty-gpt-active button[aria-label="开始听写"] {
  color: var(--bgpt-text-primary) !important;
  background-color: transparent !important;
}

/* ========== Tooltips：深底浅字，保证可读 ========== */
html.beauty-gpt-active [role="tooltip"],
html.beauty-gpt-active [popover="hint"],
html.beauty-gpt-active [data-radix-tooltip-content],
html.beauty-gpt-active [data-state="delayed-open"]:is([role="tooltip"], [data-radix-tooltip-content]),
html.beauty-gpt-active [data-state="instant-open"]:is([role="tooltip"], [data-radix-tooltip-content]),
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="delayed-open"]:not([role="menu"]):not([data-radix-menu-content]),
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="instant-open"]:not([role="menu"]):not([data-radix-menu-content]) {
  --bgpt-tooltip-bg: #1f1f1f;
  --bgpt-tooltip-fg: #f5f5f5;
}

html.beauty-gpt-active [role="tooltip"],
html.beauty-gpt-active [data-radix-tooltip-content],
html.beauty-gpt-active [popover="hint"] > *:not(style):not(svg),
html.beauty-gpt-active [role="tooltip"] > div,
html.beauty-gpt-active [popover="hint"] > div:not(.bg-transparent),
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="delayed-open"]:not([role="menu"]):not([data-radix-menu-content]),
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="instant-open"]:not([role="menu"]):not([data-radix-menu-content]) {
  background-color: #1f1f1f !important;
  background: #1f1f1f !important;
  color: #f5f5f5 !important;
  border-color: #3a3a3a !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
}

/* 盖过 .bg-token-* 等更高优先级主题色，避免提示框被染回浅色底 */
html.beauty-gpt-active [role="tooltip"].bg-token-main-surface-primary,
html.beauty-gpt-active [role="tooltip"].bg-token-main-surface-secondary,
html.beauty-gpt-active [role="tooltip"][class*="bg-token"],
html.beauty-gpt-active [role="tooltip"] [class*="bg-token"],
html.beauty-gpt-active [role="tooltip"] .bg-token-main-surface-primary,
html.beauty-gpt-active [role="tooltip"] .bg-token-main-surface-secondary,
html.beauty-gpt-active [role="tooltip"] .bg-token-bg-primary,
html.beauty-gpt-active [role="tooltip"] .bg-token-bg-secondary,
html.beauty-gpt-active [role="tooltip"] .bg-token-bg-elevated-primary,
html.beauty-gpt-active [data-radix-tooltip-content][class*="bg-token"],
html.beauty-gpt-active [data-radix-tooltip-content] [class*="bg-token"],
html.beauty-gpt-active [data-radix-tooltip-content] .bg-token-main-surface-primary,
html.beauty-gpt-active [data-radix-tooltip-content] .bg-token-main-surface-secondary,
html.beauty-gpt-active [popover="hint"] [class*="bg-token"],
html.beauty-gpt-active [popover="hint"] .bg-token-main-surface-primary,
html.beauty-gpt-active [popover="hint"] .bg-token-main-surface-secondary,
html.beauty-gpt-active [popover="hint"] [class*="bg-"]:not([class*="bg-transparent"]),
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="delayed-open"]:not([role="menu"]):not([data-radix-menu-content])[class*="bg-token"],
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="instant-open"]:not([role="menu"]):not([data-radix-menu-content])[class*="bg-token"] {
  background-color: #1f1f1f !important;
  background: #1f1f1f !important;
  color: #f5f5f5 !important;
  border-color: #3a3a3a !important;
}

html.beauty-gpt-active [role="tooltip"] *,
html.beauty-gpt-active [data-radix-tooltip-content] *,
html.beauty-gpt-active [popover="hint"] *:not(svg),
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="delayed-open"]:not([role="menu"]):not([data-radix-menu-content]) *,
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="instant-open"]:not([role="menu"]):not([data-radix-menu-content]) * {
  color: #f5f5f5 !important;
}

html.beauty-gpt-active [popover].bg-transparent,
html.beauty-gpt-active [popover="hint"].bg-transparent,
html.beauty-gpt-active [popover][class*="bg-transparent"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

/* ========== 下拉菜单 / 模型选择：跟随主题 ========== */
/* 仅外层 popover 铺色+投影；内层 picker 只做布局，不要阴影 */
html.beauty-gpt-active [data-radix-menu-content],
html.beauty-gpt-active [role="menu"][data-radix-menu-content],
html.beauty-gpt-active [role="menu"].popover {
  background-color: var(--bgpt-bg-secondary) !important;
  background: var(--bgpt-bg-secondary) !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28) !important;
}

html.beauty-gpt-active [data-testid="composer-intelligence-picker-content"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

html.beauty-gpt-active [data-radix-menu-content] .__menu-label,
html.beauty-gpt-active [data-radix-menu-content] .__menu-item,
html.beauty-gpt-active [role="menu"] .__menu-item,
html.beauty-gpt-active [role="menuitem"],
html.beauty-gpt-active [role="menuitemradio"] {
  background: transparent !important;
  color: var(--bgpt-text-primary) !important;
  border: none !important;
  box-shadow: none !important;
}

html.beauty-gpt-active [data-radix-menu-content] .__menu-label {
  color: var(--bgpt-text-secondary) !important;
}

html.beauty-gpt-active [data-radix-menu-content] .text-token-text-tertiary,
html.beauty-gpt-active [role="menu"] .text-token-text-tertiary,
html.beauty-gpt-active [data-radix-menu-content] .text-token-text-secondary {
  color: var(--bgpt-text-secondary) !important;
}

html.beauty-gpt-active [role="menuitem"]:hover,
html.beauty-gpt-active [role="menuitemradio"]:hover,
html.beauty-gpt-active [role="menu"] .__menu-item:hover,
html.beauty-gpt-active [data-radix-menu-content] .__menu-item:hover,
html.beauty-gpt-active [role="menuitem"][data-state="open"],
html.beauty-gpt-active [data-radix-menu-content] [data-highlighted],
html.beauty-gpt-active [data-radix-menu-content] [data-state="open"] {
  background-color: ${hoverSurface} !important;
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active [role="menuitemradio"][aria-checked="true"],
html.beauty-gpt-active [role="menuitemradio"][data-state="checked"] {
  color: var(--bgpt-accent) !important;
}

html.beauty-gpt-active [role="menu"] [role="separator"],
html.beauty-gpt-active [data-radix-menu-content] [role="separator"],
html.beauty-gpt-active [data-radix-menu-content] .bg-token-border-default {
  background-color: var(--bgpt-border) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active [data-radix-menu-content] svg.icon-sm,
html.beauty-gpt-active [role="menu"] svg.icon-sm {
  color: var(--bgpt-accent) !important;
  fill: currentColor !important;
}

/* ========== Splash / chips ========== */
html.beauty-gpt-active h1,
html.beauty-gpt-active .text-heading-2,
html.beauty-gpt-active [data-splash-headline-option] {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active [data-testid="use-case-prompt-chips"] button,
html.beauty-gpt-active [data-testid="use-case-prompt-chips"] .text-token-text-tertiary {
  color: var(--bgpt-text-secondary) !important;
}

html.beauty-gpt-active [data-testid="use-case-prompt-chips"] button:hover {
  background-color: ${hoverSurface} !important;
}

html.beauty-gpt-active [data-testid="use-case-prompt-chips"] button:hover .text-token-text-tertiary,
html.beauty-gpt-active [data-testid="use-case-prompt-chips"] button:hover .text-token-icon-tertiary {
  color: var(--bgpt-text-primary) !important;
}

/* ========== Text tokens ========== */
html.beauty-gpt-active .text-token-text-primary,
html.beauty-gpt-active [class*="text-token-text-primary"] {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active [role="tooltip"] .text-token-text-primary,
html.beauty-gpt-active [role="tooltip"] [class*="text-token-text-primary"],
html.beauty-gpt-active [popover="hint"] .text-token-text-primary,
html.beauty-gpt-active [popover="hint"] [class*="text-token-text-primary"],
html.beauty-gpt-active [data-radix-tooltip-content] .text-token-text-primary,
html.beauty-gpt-active [data-radix-tooltip-content] [class*="text-token-text-primary"],
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="delayed-open"]:not([role="menu"]) .text-token-text-primary,
html.beauty-gpt-active [data-radix-popper-content-wrapper] > [data-state="instant-open"]:not([role="menu"]) .text-token-text-primary {
  color: #f5f5f5 !important;
}

html.beauty-gpt-active .text-token-text-secondary,
html.beauty-gpt-active [class*="text-token-text-secondary"] {
  color: var(--bgpt-text-secondary) !important;
}

html.beauty-gpt-active [role="tooltip"] .text-token-text-secondary,
html.beauty-gpt-active [role="tooltip"] [class*="text-token-text-secondary"],
html.beauty-gpt-active [popover="hint"] .text-token-text-secondary,
html.beauty-gpt-active [data-radix-tooltip-content] .text-token-text-secondary {
  color: #c8c8c8 !important;
}

html.beauty-gpt-active [role="menu"] .text-token-text-primary,
html.beauty-gpt-active [role="menu"] [class*="text-token-text-primary"],
html.beauty-gpt-active [data-radix-menu-content] .text-token-text-primary,
html.beauty-gpt-active [data-radix-menu-content] [class*="text-token-text-primary"] {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active [role="menu"] .text-token-text-secondary,
html.beauty-gpt-active [data-radix-menu-content] .text-token-text-secondary {
  color: var(--bgpt-text-secondary) !important;
}

html.beauty-gpt-active svg.icon,
html.beauty-gpt-active svg.icon-sm,
html.beauty-gpt-active .icon {
  color: inherit;
}

/* ========== Borders ========== */
html.beauty-gpt-active .border-token-border-default,
html.beauty-gpt-active [class*="border-token-border"],
html.beauty-gpt-active hr {
  border-color: var(--bgpt-border) !important;
}

/* ========== Messages：用户气泡用 bubbleUser；外层容器保持透明 ========== */
html.beauty-gpt-active [data-message-author-role="user"],
html.beauty-gpt-active [data-message-author-role="user"] > div,
html.beauty-gpt-active [data-turn="user"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

html.beauty-gpt-active .user-message-bubble-color,
html.beauty-gpt-active [data-message-author-role="user"] .user-message-bubble-color,
html.beauty-gpt-active [data-turn="user"] .user-message-bubble-color,
html.beauty-gpt-active [data-message-author-role="user"] [class*="user-message-bubble"] {
  background: ${vars.bubbleUser} !important;
  background-color: ${vars.bubbleUser} !important;
  color: ${contrastOn(vars.bubbleUser)} !important;
  box-shadow: none !important;
  border: none !important;
  outline: none !important;
  border-radius: 22px !important;
}

html.beauty-gpt-active [class*="corner-superellipse"].user-message-bubble-color,
html.beauty-gpt-active .user-message-bubble-color[class*="corner-superellipse"],
html.beauty-gpt-active [class*="corner-superellipse"] .user-message-bubble-color {
  border-radius: 22px !important;
}

html.beauty-gpt-active .user-message-bubble-color *,
html.beauty-gpt-active [data-message-author-role="user"] .user-message-bubble-color *,
html.beauty-gpt-active [data-turn="user"] .user-message-bubble-color * {
  color: inherit !important;
}

html.beauty-gpt-active [data-message-author-role="user"] .bg-token-main-surface-secondary,
html.beauty-gpt-active [data-message-author-role="user"] .group\\/message-image {
  background-color: ${vars.bubbleUser} !important;
  background: ${vars.bubbleUser} !important;
}

html.beauty-gpt-active [data-message-author-role="assistant"],
html.beauty-gpt-active [data-message-author-role="assistant"] > div,
html.beauty-gpt-active [data-turn="assistant"],
html.beauty-gpt-active .agent-turn,
html.beauty-gpt-active section[data-testid^="conversation-turn"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
  outline: none !important;
  color: var(--bgpt-text-primary) !important;
}

/* GPT 回复：去掉包裹底色（排除文稿块 / 代码块） */
html.beauty-gpt-active [data-message-author-role="assistant"] .bg-token-main-surface-primary:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-message-author-role="assistant"] .bg-token-main-surface-secondary:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-message-author-role="assistant"] [class*="bg-token-main-surface"]:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-message-author-role="assistant"] [class*="bg-token-bg-"]:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)):not(.cm-editor):not(#code-block-viewer),
html.beauty-gpt-active [data-turn="assistant"] .bg-token-main-surface-primary:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-turn="assistant"] [class*="bg-token-main-surface"]:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active .agent-turn [class*="bg-token-main-surface"]:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-message-author-role="assistant"] .rounded-3xl:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-message-author-role="assistant"] .rounded-2xl:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-turn="assistant"] .rounded-3xl:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)),
html.beauty-gpt-active [data-turn="assistant"] .rounded-2xl:not(:has(#code-block-viewer)):not(:has(.cm-editor)):not(:has([data-testid="writing-block-header-surface"])):not(:has(.writing-block-editor)) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
}

html.beauty-gpt-active [data-message-author-role="assistant"] .markdown,
html.beauty-gpt-active [data-message-author-role="assistant"] .prose,
html.beauty-gpt-active [data-turn="assistant"] .markdown,
html.beauty-gpt-active [data-turn="assistant"] .prose,
html.beauty-gpt-active .agent-turn .markdown,
html.beauty-gpt-active .agent-turn .prose,
html.beauty-gpt-active .markdown.prose-invert,
html.beauty-gpt-active .prose.prose-invert,
html.beauty-gpt-active [class*="markdown"][class*="prose"] {
  --tw-prose-body: var(--bgpt-text-primary) !important;
  --tw-prose-headings: var(--bgpt-text-primary) !important;
  --tw-prose-lead: var(--bgpt-text-primary) !important;
  --tw-prose-links: var(--bgpt-accent) !important;
  --tw-prose-bold: var(--bgpt-text-primary) !important;
  --tw-prose-counters: var(--bgpt-text-secondary) !important;
  --tw-prose-bullets: var(--bgpt-text-secondary) !important;
  --tw-prose-quotes: var(--bgpt-text-primary) !important;
  --tw-prose-captions: var(--bgpt-text-secondary) !important;
  --tw-prose-code: var(--bgpt-text-primary) !important;
  --tw-prose-pre-code: var(--bgpt-text-primary) !important;
  --tw-prose-th-borders: var(--bgpt-border) !important;
  --tw-prose-td-borders: var(--bgpt-border) !important;
  --tw-prose-quote-borders: var(--bgpt-border) !important;
  color: var(--bgpt-text-primary) !important;
  background: transparent !important;
}

/* Markdown 子元素：盖过 prose-invert / text-white 残留的白色字（不含代码高亮） */
html.beauty-gpt-active .markdown :is(
  p, li, ul, ol, strong, b, em, i, u, s, mark,
  h1, h2, h3, h4, h5, h6,
  blockquote, q, figcaption, td, th, tr, table,
  label, summary, details
),
html.beauty-gpt-active .markdown > :is(p, ul, ol, blockquote, h1, h2, h3, h4, h5, h6),
html.beauty-gpt-active .markdown p :is(span, strong, b, em),
html.beauty-gpt-active .markdown li :is(span, strong, b, em),
html.beauty-gpt-active .markdown blockquote :is(span, strong, b, em, p),
html.beauty-gpt-active .prose :is(
  p, li, ul, ol, strong, b, em, i, u, s, mark,
  h1, h2, h3, h4, h5, h6,
  blockquote, q, figcaption, td, th, tr, table,
  label, summary, details
),
html.beauty-gpt-active .prose p :is(span, strong, b, em),
html.beauty-gpt-active .prose li :is(span, strong, b, em),
html.beauty-gpt-active .prose blockquote :is(span, strong, b, em, p),
html.beauty-gpt-active [data-message-author-role="assistant"] :is(
  p, li, strong, b, em, blockquote, h1, h2, h3, h4, h5, h6
),
html.beauty-gpt-active [data-message-author-role="assistant"] p span,
html.beauty-gpt-active [data-message-author-role="assistant"] li span,
html.beauty-gpt-active [data-turn="assistant"] :is(
  p, li, strong, b, em, blockquote, h1, h2, h3, h4, h5, h6
),
html.beauty-gpt-active [data-turn="assistant"] p span,
html.beauty-gpt-active [data-turn="assistant"] li span {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active .markdown :is(a, a *),
html.beauty-gpt-active .prose :is(a, a *),
html.beauty-gpt-active [data-message-author-role="assistant"] a,
html.beauty-gpt-active [data-turn="assistant"] a {
  color: var(--bgpt-accent) !important;
}

html.beauty-gpt-active .markdown .text-white,
html.beauty-gpt-active .markdown [class*="text-white"],
html.beauty-gpt-active .prose .text-white,
html.beauty-gpt-active .prose [class*="text-white"],
html.beauty-gpt-active [data-message-author-role="assistant"] .text-white,
html.beauty-gpt-active [data-message-author-role="assistant"] [class*="text-white"] {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active .markdown blockquote,
html.beauty-gpt-active .prose blockquote {
  border-color: var(--bgpt-border) !important;
  color: var(--bgpt-text-primary) !important;
}

/* ========== 代码块 / 行内代码：与主题同步 ========== */
html.beauty-gpt-active,
html.beauty-gpt-active [class*="--code-block-surface"],
html.beauty-gpt-active [class*="code-block-surface"] {
  --code-block-surface: ${vars.bgSecondary} !important;
  --bg-elevated-secondary: ${vars.bgSecondary} !important;
}

html.beauty-gpt-active [class*="bg-(--code-block-surface"],
html.beauty-gpt-active [class*="--code-block-surface"],
html.beauty-gpt-active .border-radius-3xl:has(#code-block-viewer),
html.beauty-gpt-active .border-radius-3xl:has(.cm-editor),
html.beauty-gpt-active .rounded-3xl:has(#code-block-viewer),
html.beauty-gpt-active .rounded-3xl:has(.cm-editor) {
  background-color: ${vars.bgSecondary} !important;
  background: ${vars.bgSecondary} !important;
  border-color: var(--bgpt-border) !important;
  color: var(--bgpt-text-primary) !important;
  --code-block-surface: ${vars.bgSecondary} !important;
  /* 即使 dark: 变体指向 composer，也强制跟主题次背景 */
  --composer-surface-primary: ${vars.bgSecondary} !important;
  --bg-elevated-secondary: ${vars.bgSecondary} !important;
}

html.beauty-gpt-active [class*="bg-(--code-block-surface"] .text-token-text-primary,
html.beauty-gpt-active .rounded-3xl:has(#code-block-viewer) > div > div .text-token-text-primary,
html.beauty-gpt-active .rounded-3xl:has(.cm-editor) .sticky .text-token-text-primary {
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active #code-block-viewer,
html.beauty-gpt-active .cm-editor,
html.beauty-gpt-active .cm-scroller,
html.beauty-gpt-active .cm-gutters,
html.beauty-gpt-active .cm-content,
html.beauty-gpt-active pre.cm-content,
html.beauty-gpt-active .cm-content.q9tKkq_readonly {
  background: ${vars.bgSecondary} !important;
  background-color: ${vars.bgSecondary} !important;
  color: var(--bgpt-text-primary) !important;
  caret-color: var(--bgpt-text-primary) !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

html.beauty-gpt-active .cm-gutters {
  border-right-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active .cm-activeLine,
html.beauty-gpt-active .cm-activeLineGutter {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.08 : 0.05)} !important;
}

html.beauty-gpt-active .rounded-3xl:has(#code-block-viewer) button,
html.beauty-gpt-active .rounded-3xl:has(.cm-editor) button,
html.beauty-gpt-active [class*="--code-block-surface"] button {
  color: var(--bgpt-text-secondary) !important;
  background: transparent !important;
}

html.beauty-gpt-active .rounded-3xl:has(#code-block-viewer) button:hover,
html.beauty-gpt-active .rounded-3xl:has(.cm-editor) button:hover,
html.beauty-gpt-active [class*="--code-block-surface"] button:hover {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  color: var(--bgpt-text-primary) !important;
}

html.beauty-gpt-active .markdown :is(code:not(pre code), pre),
html.beauty-gpt-active .prose :is(code:not(pre code), pre) {
  color: var(--bgpt-text-primary) !important;
}

/* 行内 code：浅底深字，避免深灰胶囊 */
html.beauty-gpt-active .markdown code:not(pre code):not(.cm-content code),
html.beauty-gpt-active .prose code:not(pre code):not(.cm-content code),
html.beauty-gpt-active .markdown :not(pre):not(.cm-content) > code,
html.beauty-gpt-active .markdown p code,
html.beauty-gpt-active .markdown li code,
html.beauty-gpt-active .markdown td code,
html.beauty-gpt-active .prose :not(pre):not(.cm-content) > code,
html.beauty-gpt-active .prose p code,
html.beauty-gpt-active .prose li code,
html.beauty-gpt-active [data-message-author-role="assistant"] p code,
html.beauty-gpt-active [data-message-author-role="assistant"] li code {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.14 : 0.08)} !important;
  background: ${withAlpha(vars.textPrimary, dark ? 0.14 : 0.08)} !important;
  color: var(--bgpt-text-primary) !important;
  border: 1px solid ${withAlpha(vars.border, 0.85)} !important;
  border-radius: 6px !important;
  box-shadow: none !important;
}

/* ========== 引用链接胶囊 / Sources 面板 ========== */
html.beauty-gpt-active .markdown [class*="group/footnote"],
html.beauty-gpt-active .markdown [class*="group\\/footnote"],
html.beauty-gpt-active .markdown button[class*="footnote"],
html.beauty-gpt-active .markdown a[class*="footnote"],
html.beauty-gpt-active [data-testid*="citation"],
html.beauty-gpt-active [data-testid*="footnote"],
html.beauty-gpt-active [data-testid*="source-"],
html.beauty-gpt-active .markdown a:has(> img),
html.beauty-gpt-active .markdown a:has(img[src*="favicon"]),
html.beauty-gpt-active .markdown a:has(img[alt]),
html.beauty-gpt-active .markdown span[data-state] > a[target="_blank"],
html.beauty-gpt-active .markdown span[data-state] a[rel*="noopener"],
html.beauty-gpt-active .markdown a.h-6[href],
html.beauty-gpt-active .markdown a[class*="rounded-full"][href*="http"],
html.beauty-gpt-active .markdown a[class*="rounded-xl"][href*="http"]:has(img) {
  background: ${withAlpha(vars.textPrimary, dark ? 0.14 : 0.08)} !important;
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.14 : 0.08)} !important;
  color: var(--bgpt-text-primary) !important;
  border: 1px solid var(--bgpt-border) !important;
  box-shadow: none !important;
  outline: none !important;
}

html.beauty-gpt-active .markdown [class*="group/footnote"] *,
html.beauty-gpt-active .markdown button[class*="footnote"] *,
html.beauty-gpt-active .markdown a:has(> img) *:not(img),
html.beauty-gpt-active .markdown span[data-state] > a[target="_blank"] *:not(img),
html.beauty-gpt-active [data-testid*="citation"] *:not(img),
html.beauty-gpt-active [data-testid*="footnote"] *:not(img) {
  color: var(--bgpt-text-primary) !important;
  fill: currentColor !important;
}

html.beauty-gpt-active .markdown [class*="group/footnote"]:hover,
html.beauty-gpt-active .markdown a:has(> img):hover,
html.beauty-gpt-active .markdown span[data-state] > a[target="_blank"]:hover,
html.beauty-gpt-active [data-testid*="citation"]:hover {
  background: ${withAlpha(vars.accent, dark ? 0.22 : 0.14)} !important;
  background-color: ${withAlpha(vars.accent, dark ? 0.22 : 0.14)} !important;
  border-color: var(--bgpt-accent) !important;
  color: var(--bgpt-text-primary) !important;
}

/* Sources / 引用侧栏或飞出层 */
html.beauty-gpt-active [data-testid="screen-threadFlyOut"],
html.beauty-gpt-active [data-testid*="sources"],
html.beauty-gpt-active [data-testid*="Sources"] {
  background: var(--bgpt-bg-secondary) !important;
  background-color: var(--bgpt-bg-secondary) !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active [data-testid="screen-threadFlyOut"] a,
html.beauty-gpt-active [data-testid*="sources"] a,
html.beauty-gpt-active [data-testid="screen-threadFlyOut"] [class*="border"] {
  background: ${withAlpha(vars.textPrimary, dark ? 0.08 : 0.05)} !important;
  color: var(--bgpt-text-primary) !important;
  border-color: var(--bgpt-border) !important;
}

html.beauty-gpt-active [data-testid="screen-threadFlyOut"] a:hover {
  background: ${withAlpha(vars.accent, dark ? 0.2 : 0.12)} !important;
}

/* ========== 文稿 Writing Block：整块发光边框（不含普通回复气泡） ========== */
html.beauty-gpt-active :has(> [data-testid="writing-block-header-surface"]),
html.beauty-gpt-active :has(> [data-writing-block-fullscreen-header-surface]),
html.beauty-gpt-active :has(> [data-testid="writing-block-header-surface"]):has(.writing-block-editor),
html.beauty-gpt-active [data-testid="writing-block-root"],
html.beauty-gpt-active [data-testid="writing-block-container"],
html.beauty-gpt-active [data-writing-block-card] {
  border: 1px solid ${withAlpha(vars.accent, 0.55)} !important;
  box-shadow:
    0 0 0 1px ${withAlpha(vars.accent, 0.28)},
    0 0 18px ${withAlpha(vars.accent, 0.42)},
    0 0 36px ${withAlpha(vars.accent, 0.2)} !important;
  border-radius: 1.5rem !important;
  background-color: ${vars.bgSecondary} !important;
  background: ${vars.bgSecondary} !important;
}

/* 明确：普通 GPT 回复对话块不加发光框、不包裹 */
html.beauty-gpt-active [data-message-author-role],
html.beauty-gpt-active [data-turn],
html.beauty-gpt-active section[data-testid^="conversation-turn"],
html.beauty-gpt-active .agent-turn {
  box-shadow: none !important;
  outline: none !important;
  border: none !important;
}

html.beauty-gpt-active .writing-block-editor,
html.beauty-gpt-active [class*="writing-block-editor"],
html.beauty-gpt-active .mt4SwW_editor {
  --wb-text-primary: ${vars.textPrimary} !important;
  --wb-text-secondary: ${vars.textSecondary} !important;
  --wb-text-tertiary: ${vars.textSecondary} !important;
  --wb-surface-primary: ${vars.bgSecondary} !important;
  --wb-surface-secondary: ${vars.bgPrimary} !important;
  --wb-border: ${withAlpha(vars.border, 0.9)} !important;
  --wb-border-hover: ${vars.border} !important;
  --wb-divider: ${vars.border} !important;
  --wb-focus: ${vars.accent} !important;
  --wb-control-border: ${vars.accent} !important;
  --wb-accent: ${vars.accent} !important;
  --wb-on-accent: ${accentFg} !important;
  --wb-interactive-background: ${withAlpha(vars.accent, 0.12)} !important;
  --wb-interactive-secondary-hover: ${withAlpha(vars.textPrimary, dark ? 0.08 : 0.06)} !important;
  --oai-wb-text-primary: ${vars.textPrimary} !important;
  --oai-wb-text-secondary: ${vars.textSecondary} !important;
  --oai-wb-text-tertiary: ${vars.textSecondary} !important;
  --oai-wb-surface-primary: ${vars.bgSecondary} !important;
  --oai-wb-surface-secondary: ${vars.bgPrimary} !important;
  --oai-wb-border: ${withAlpha(vars.border, 0.9)} !important;
  --oai-wb-border-hover: ${vars.border} !important;
  --oai-wb-divider: ${vars.border} !important;
  --oai-wb-focus: ${vars.accent} !important;
  --oai-wb-control-border: ${vars.accent} !important;
  --oai-wb-accent: ${vars.accent} !important;
  --oai-wb-on-accent: ${accentFg} !important;
  --oai-wb-interactive-background: ${withAlpha(vars.accent, 0.12)} !important;
  --oai-wb-interactive-secondary-hover: ${withAlpha(vars.textPrimary, dark ? 0.08 : 0.06)} !important;
  background-color: ${vars.bgSecondary} !important;
  background: ${vars.bgSecondary} !important;
  color: ${vars.textPrimary} !important;
  border: none !important;
  box-shadow: none !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-button"],
html.beauty-gpt-active button[data-testid="writing-block-header-magic-edit-button"],
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-collapsed-label"] {
  --oai-wb-surface-primary: ${vars.bgSecondary} !important;
  --oai-wb-surface-secondary: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  --oai-wb-text-primary: ${vars.textPrimary} !important;
  --oai-wb-divider: ${vars.border} !important;
  color: ${vars.textPrimary} !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-button"],
html.beauty-gpt-active button[data-testid="writing-block-header-magic-edit-button"] {
  background-color: ${vars.bgSecondary} !important;
  background: ${vars.bgSecondary} !important;
  border-color: ${vars.border} !important;
}

/* 文稿顶栏整段：header surface / chrome / magic-edit / 右侧操作 */
html.beauty-gpt-active [data-testid="writing-block-header-surface"],
html.beauty-gpt-active [data-writing-block-fullscreen-header-surface],
html.beauty-gpt-active [data-writing-block-fullscreen-header-surface="true"],
html.beauty-gpt-active [data-writing-block-fullscreen-header-chrome],
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-layout"],
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-entrypoint"],
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-composer"] {
  --wb-text-primary: ${vars.textPrimary} !important;
  --wb-text-secondary: ${vars.textSecondary} !important;
  --wb-surface-primary: ${vars.bgSecondary} !important;
  --wb-surface-secondary: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  --wb-divider: ${vars.border} !important;
  --wb-accent: ${vars.accent} !important;
  --oai-wb-text-primary: ${vars.textPrimary} !important;
  --oai-wb-text-secondary: ${vars.textSecondary} !important;
  --oai-wb-text-tertiary: ${vars.textSecondary} !important;
  --oai-wb-surface-primary: ${vars.bgSecondary} !important;
  --oai-wb-surface-secondary: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  --oai-wb-divider: ${vars.border} !important;
  --oai-wb-border: ${vars.border} !important;
  --oai-wb-accent: ${vars.accent} !important;
  --oai-wb-on-accent: ${accentFg} !important;
  color: ${vars.textPrimary} !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-surface"],
html.beauty-gpt-active [data-writing-block-fullscreen-header-surface],
html.beauty-gpt-active [data-writing-block-fullscreen-header-surface="true"],
html.beauty-gpt-active [data-testid="writing-block-header-surface"] .bg-token-bg-primary,
html.beauty-gpt-active [data-testid="writing-block-header-surface"] [class*="bg-token-bg-primary"],
html.beauty-gpt-active [data-testid="writing-block-header-surface"] [class*="2a2a2a"],
html.beauty-gpt-active [data-writing-block-fullscreen-header-surface][class*="2a2a2a"] {
  background-color: ${vars.bgPrimary} !important;
  background: ${vars.bgPrimary} !important;
  border-color: ${vars.border} !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-composer"],
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-composer"][class*="2a2a2a"] {
  background-color: ${vars.bgSecondary} !important;
  background: ${vars.bgSecondary} !important;
  border-color: ${vars.border} !important;
}

/* 盖过 dark:bg-[#2a2a2a]（顶栏底、编辑按钮、composer） */
html.beauty-gpt-active [data-testid="writing-block-header-surface"] [class*="2a2a2a"],
html.beauty-gpt-active [data-testid="writing-block-header-surface"] [class*="dark:bg-"],
html.beauty-gpt-active button[data-testid="writing-block-header-magic-edit-button"],
html.beauty-gpt-active button[data-testid="writing-block-header-magic-edit-button"][class*="2a2a2a"],
html.beauty-gpt-active button[data-testid="writing-block-header-magic-edit-button"][class*="dark:bg-"],
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-composer"][class*="2a2a2a"],
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-composer"][class*="dark:bg-"] {
  background-color: ${vars.bgSecondary} !important;
  background: ${vars.bgSecondary} !important;
  color: ${vars.textPrimary} !important;
  border-color: ${vars.border} !important;
}

html.beauty-gpt-active button[data-testid="writing-block-header-magic-edit-button"]:hover:enabled {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.12 : 0.08)} !important;
  background: ${withAlpha(vars.textPrimary, dark ? 0.12 : 0.08)} !important;
  color: ${vars.textPrimary} !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-surface"] button,
html.beauty-gpt-active [data-writing-block-fullscreen-header-chrome] button {
  color: ${vars.textPrimary} !important;
  background: transparent !important;
  background-color: transparent !important;
  border-color: transparent !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-surface"] button[data-testid="writing-block-header-magic-edit-button"] {
  background: ${vars.bgSecondary} !important;
  background-color: ${vars.bgSecondary} !important;
  border-color: ${vars.border} !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-surface"] button:hover:not(:disabled),
html.beauty-gpt-active [data-writing-block-fullscreen-header-chrome] button:hover:not(:disabled) {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  background: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  color: ${vars.textPrimary} !important;
}

html.beauty-gpt-active [data-testid="writing-block-header-surface"] svg,
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-leading-icon-slot"] svg,
html.beauty-gpt-active [data-testid="writing-block-header-magic-edit-leading-icon-slot"] .icon {
  color: ${vars.textPrimary} !important;
}

html.beauty-gpt-active .writing-block-editor .ProseMirror.prose-invert,
html.beauty-gpt-active .writing-block-editor .ProseMirror.dark\\:prose-invert,
html.beauty-gpt-active [data-writing-block-fullscreen-editor-region].prose {
  --tw-prose-body: ${vars.textPrimary} !important;
  --tw-prose-bold: ${vars.textPrimary} !important;
  --tw-prose-headings: ${vars.textPrimary} !important;
  color: ${vars.textPrimary} !important;
  background: transparent !important;
}

/* Disclaimer / footer chip */
html.beauty-gpt-active [data-testid="thread-disclaimer"] .bg-token-main-surface-primary,
html.beauty-gpt-active [data-testid="thread-disclaimer"] [class*="bg-token-main-surface"] {
  background-color: var(--bgpt-bg-primary) !important;
  color: var(--bgpt-text-secondary) !important;
  box-shadow: 0 0 8px 8px var(--bgpt-bg-primary) !important;
}

/* ========== Buttons / accents ========== */
html.beauty-gpt-active button.btn-primary,
html.beauty-gpt-active [class*="bg-green-"],
html.beauty-gpt-active [class*="bg-emerald-"] {
  background-color: var(--bgpt-accent) !important;
  color: ${accentFg} !important;
}

html.beauty-gpt-active button.btn-primary:hover,
html.beauty-gpt-active [class*="bg-green-"]:hover,
html.beauty-gpt-active [class*="bg-emerald-"]:hover {
  background-color: var(--bgpt-accent-hover) !important;
}

/* Soften leftover near-black UI chrome inside themed surfaces */
html.beauty-gpt-active [data-composer-surface="true"] [class*="bg-black"],
html.beauty-gpt-active [data-composer-surface="true"] [class*="bg-zinc-9"],
html.beauty-gpt-active [data-composer-surface="true"] [class*="bg-gray-9"],
html.beauty-gpt-active [data-composer-surface="true"] [class*="bg-neutral-9"] {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.2 : 0.12)} !important;
  color: var(--bgpt-text-primary) !important;
}

/* ========== FINAL：GPT 回复彻底去底色包裹（压过全局 token 填色） ========== */
html.beauty-gpt-active #thread [data-message-author-role="assistant"],
html.beauty-gpt-active #thread [data-message-author-role="assistant"] > div,
html.beauty-gpt-active #thread [data-message-author-role="assistant"] > div > div,
html.beauty-gpt-active #thread [data-turn="assistant"],
html.beauty-gpt-active #thread [data-turn="assistant"] > div,
html.beauty-gpt-active #thread [data-turn="assistant"] > div > div,
html.beauty-gpt-active #thread .agent-turn,
html.beauty-gpt-active #thread .agent-turn > div,
html.beauty-gpt-active #thread .agent-turn > div > div,
html.beauty-gpt-active #thread section[data-testid^="conversation-turn"] > div,
html.beauty-gpt-active #thread [data-message-author-role="assistant"] .bg-token-main-surface-primary,
html.beauty-gpt-active #thread [data-message-author-role="assistant"] .bg-token-main-surface-secondary,
html.beauty-gpt-active #thread [data-message-author-role="assistant"] .bg-token-bg-primary,
html.beauty-gpt-active #thread [data-message-author-role="assistant"] .bg-token-bg-secondary,
html.beauty-gpt-active #thread [data-message-author-role="assistant"] .bg-token-bg-tertiary,
html.beauty-gpt-active #thread [data-message-author-role="assistant"] [class*="bg-token-main-surface"],
html.beauty-gpt-active #thread [data-message-author-role="assistant"] [class*="bg-token-bg-"],
html.beauty-gpt-active #thread [data-message-author-role="assistant"] [class*="bg-surface"],
html.beauty-gpt-active #thread [data-turn="assistant"] [class*="bg-token-"],
html.beauty-gpt-active #thread .agent-turn [class*="bg-token-"],
html.beauty-gpt-active #thread [data-message-author-role="assistant"] [class*="rounded-"] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border-color: transparent !important;
}

/* 文稿 / 代码块在回复内仍保留自己的底 */
html.beauty-gpt-active #thread :has(> [data-testid="writing-block-header-surface"]),
html.beauty-gpt-active #thread .writing-block-editor,
html.beauty-gpt-active #thread [class*="--code-block-surface"],
html.beauty-gpt-active #thread .rounded-3xl:has(#code-block-viewer),
html.beauty-gpt-active #thread .rounded-3xl:has(.cm-editor),
html.beauty-gpt-active #thread #code-block-viewer,
html.beauty-gpt-active #thread .cm-editor,
html.beauty-gpt-active #thread .cm-scroller,
html.beauty-gpt-active #thread .cm-content {
  background: ${vars.bgSecondary} !important;
  background-color: ${vars.bgSecondary} !important;
}

/* ========== 活动面板（活动 · 54s 顶栏） ========== */
html.beauty-gpt-active [data-testid*="activity"],
html.beauty-gpt-active [data-testid*="Activity"],
html.beauty-gpt-active [aria-label*="活动"],
html.beauty-gpt-active div.flex.items-center.justify-between.px-4.py-3:has(> div button[aria-label="关闭"]),
html.beauty-gpt-active div.flex.items-center.justify-between:has(button[aria-label="关闭"]):has(.text-token-text-tertiary) {
  background-color: ${vars.bgSecondary} !important;
  background: ${vars.bgSecondary} !important;
  color: ${vars.textPrimary} !important;
  border-color: ${vars.border} !important;
}

html.beauty-gpt-active div.flex.items-center.justify-between:has(button[aria-label="关闭"]):has(.text-token-text-tertiary) .text-token-text-tertiary,
html.beauty-gpt-active div.flex.items-center.justify-between:has(button[aria-label="关闭"]) .text-token-text-tertiary {
  color: ${vars.textSecondary} !important;
}

html.beauty-gpt-active div.flex.items-center.justify-between:has(button[aria-label="关闭"]):has(.text-token-text-tertiary) span,
html.beauty-gpt-active div.flex.items-center.justify-between.px-4.py-3:has(button[aria-label="关闭"]) span {
  color: ${vars.textPrimary} !important;
}

html.beauty-gpt-active div.flex.items-center.justify-between:has(button[aria-label="关闭"]) button[aria-label="关闭"],
html.beauty-gpt-active div.flex.items-center.justify-between:has(button[aria-label="关闭"]) button[aria-label="关闭"] svg {
  color: ${vars.textPrimary} !important;
  background: transparent !important;
}

html.beauty-gpt-active div.flex.items-center.justify-between:has(button[aria-label="关闭"]) button[aria-label="关闭"]:hover {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.06)} !important;
  color: ${vars.textPrimary} !important;
}

/* 活动面板整页/抽屉背景 */
html.beauty-gpt-active [data-testid*="activity"],
html.beauty-gpt-active [data-testid*="activity"] > div,
html.beauty-gpt-active aside:has(div.flex.items-center.justify-between button[aria-label="关闭"]),
html.beauty-gpt-active [role="dialog"]:has(button[aria-label="关闭"]):has(.text-token-text-tertiary) {
  background-color: ${vars.bgPrimary} !important;
  background: ${vars.bgPrimary} !important;
  color: ${vars.textPrimary} !important;
  border-color: ${vars.border} !important;
}

/* 设置弹窗：左侧 Tab 栏实底 + 选中态（勿用全局 tab 透明规则） */
html.beauty-gpt-active [role="dialog"].popover:has([data-settings-tab-list="true"]),
html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) [role="tabpanel"],
html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) .border-token-border-extra-light.flex.shrink-0,
html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) [data-settings-tab-list="true"] {
  background-color: ${vars.bgPrimary} !important;
  background: ${vars.bgPrimary} !important;
  color: ${vars.textPrimary} !important;
}

html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) [data-settings-tab-list="true"] [role="tab"] {
  color: ${vars.textSecondary} !important;
  background: transparent !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0.5rem !important;
}

html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) [data-settings-tab-list="true"] [role="tab"][aria-selected="true"],
html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) [data-settings-tab-list="true"] [role="tab"][data-state="active"] {
  color: ${vars.textPrimary} !important;
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.1 : 0.08)} !important;
}

html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) [data-settings-tab-list="true"] [role="tab"]:hover:not([aria-selected="true"]):not([data-state="active"]) {
  background-color: ${withAlpha(vars.textPrimary, dark ? 0.06 : 0.04)} !important;
  color: ${vars.textPrimary} !important;
}

/* 设置 Tab 列表横向滚动渐变：勿把 from-token-bg-primary 洗成透明 */
html.beauty-gpt-active [role="dialog"]:has([data-settings-tab-list="true"]) [class*="from-token-bg-primary"] {
  --tw-gradient-from: ${vars.bgPrimary} !important;
  --tw-gradient-to: ${vars.bgPrimary} !important;
  --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
  background-color: ${vars.bgPrimary} !important;
}

/* 普通回复的 markdown-new-styling 绝不能套文稿块粉底 */
html.beauty-gpt-active #thread .markdown.markdown-new-styling,
html.beauty-gpt-active #thread .markdown-new-styling:not(.writing-block-editor):not(.mt4SwW_editor),
html.beauty-gpt-active [data-message-author-role="assistant"] .markdown.markdown-new-styling,
html.beauty-gpt-active [data-message-author-role="assistant"] .markdown-new-styling,
html.beauty-gpt-active [data-turn="assistant"] .markdown.markdown-new-styling {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border: none !important;
  color: var(--bgpt-text-primary) !important;
}

/* Scrollbars */
html.beauty-gpt-active ::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
html.beauty-gpt-active ::-webkit-scrollbar-track {
  background: var(--bgpt-bg-secondary);
}
html.beauty-gpt-active ::-webkit-scrollbar-thumb {
  background: var(--bgpt-border);
  border-radius: 8px;
}
html.beauty-gpt-active ::-webkit-scrollbar-thumb:hover {
  background: var(--bgpt-accent);
}
`.trim();
  }

  function isDark(hex) {
    if (!hex || typeof hex !== "string") return true;
    const c = hex.replace("#", "");
    if (c.length !== 6) return true;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma < 0.55;
  }

  function ensureStyleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  const STYLED_ATTR = "data-bgpt-inline";
  const INLINE_PROPS = [
    "background",
    "background-color",
    "background-image",
    "color",
    "border",
    "border-color",
    "border-radius",
    "box-shadow",
    "outline",
    "font-weight",
    "backdrop-filter",
    "-webkit-backdrop-filter",
  ];

  const TOKEN_PROPS = [
    "--composer-surface-primary",
    "--composer-surface-secondary",
    "--sidebar-surface-primary",
    "--sidebar-surface-secondary",
    "--main-surface-primary",
    "--main-surface-secondary",
    "--text-primary",
    "--text-secondary",
    "--text-tertiary",
    "--bg-primary",
    "--bg-elevated-primary",
    "--bg-elevated-secondary",
    "--code-block-surface",
    "--surface-primary",
    "--surface-secondary",
    "--token-bg-primary",
    "--token-bg-secondary",
    "--token-bg-tertiary",
    "--token-sidebar-surface-primary",
    "--token-main-surface-primary",
    "--token-main-surface-secondary",
    "--token-text-primary",
    "--token-text-secondary",
    "--token-text-tertiary",
    "--token-border-default",
    "--token-surface-hover",
    "--interactive-bg-primary-default",
    "--interactive-bg-secondary-default",
    "--interactive-bg-secondary-hover",
    "--surface-hover",
    "--sharp-edge-bottom-shadow",
    "--sharp-edge-top-shadow",
  ];

  let savedColorMode = null;

  function setInline(el, prop, value) {
    if (!el || !el.style) return;
    // Skip no-ops: avoids style invalidation + DevTools mutation thrash
    if (
      el.getAttribute(STYLED_ATTR) === "1" &&
      el.style.getPropertyValue(prop) === value &&
      el.style.getPropertyPriority(prop) === "important"
    ) {
      return;
    }
    el.setAttribute(STYLED_ATTR, "1");
    el.style.setProperty(prop, value, "important");
  }

  /** ChatGPT is actively streaming a reply (token DOM churn). */
  function isChatStreaming() {
    try {
      return !!(
        document.querySelector(
          [
            ".result-streaming",
            ".streaming-animation",
            '[data-is-streaming="true"]',
            ".agent-turn.streaming",
            '[data-message-author-role="assistant"].result-streaming',
            ".markdown.result-streaming",
          ].join(", ")
        ) ||
        document.querySelector(
          'button[aria-label="停止生成"], button[aria-label="Stop streaming"], button[data-testid="stop-button"]'
        )
      );
    } catch (_) {
      return false;
    }
  }

  function isComposerSurface(el) {
    return !!(
      el &&
      (el.matches?.("[data-composer-surface='true']") ||
        el.closest?.("[data-composer-surface='true']"))
    );
  }

  function clearInlinePropsOn(el) {
    INLINE_PROPS.forEach((p) => {
      // 输入框圆角由 ChatGPT 内联 28px / corner-superellipse 控制；
      // 清掉后站点不会立刻写回，恢复默认主题时会变成直角。
      if (p === "border-radius" && isComposerSurface(el)) return;
      el.style.removeProperty(p);
    });
    el.removeAttribute(STYLED_ATTR);
  }

  function clearInlineThemeStyles() {
    document.querySelectorAll(`[${STYLED_ATTR}]`).forEach((el) => {
      clearInlinePropsOn(el);
    });
  }

  /** 恢复 ChatGPT 原生输入框圆角（不带 !important，便于站点自行覆盖） */
  function restoreComposerNativeRadius() {
    document.querySelectorAll("[data-composer-surface='true']").forEach((el) => {
      el.style.removeProperty("border-radius");
      el.style.setProperty("border-radius", "28px");
      el.style.removeProperty("overflow");
    });
  }

  /** Clear leftover inline patches that predate data-bgpt-inline marking */
  function clearLegacyInlineStyles() {
    const selectors = [
      "#stage-slideover-sidebar",
      "#stage-slideover-sidebar .bg-token-sidebar-surface-primary",
      "#stage-slideover-sidebar .sticky.top-0",
      "#stage-slideover-sidebar nav[aria-label]",
      "#stage-slideover-sidebar .__menu-item",
      "#stage-slideover-sidebar [data-sidebar-item]",
      "#stage-slideover-sidebar .truncate",
      "#history .truncate",
      "#page-header [role='group'] .absolute",
      "#conversation-header-actions",
      "#conversation-header-actions button",
      "#page-header .translucent-surface",
      "[data-composer-surface='true']",
      "#prompt-textarea",
      ".ProseMirror",
      "[data-composer-transition-slot]",
      ".composer-btn",
      "#composer-plus-btn",
      ".composer-submit-button-color",
      ".__composer-pill",
      "#thread-bottom-container",
      "#thread-bottom",
      "#main",
      "main",
      "[data-scroll-root]",
      ".user-message-bubble-color",
      "[data-message-author-role='user']",
      "[data-message-author-role='assistant']",
      "[data-turn='user']",
      "[data-turn='assistant']",
      "button[data-testid='share-chat-button']",
      "button[data-testid='conversation-options-button']",
      "[data-testid='artifacts-surface-top-controls']",
      ".bg-surface-primary",
      "button[data-testid='close-sidebar-button']",
      '#sidebar-header button',
      '#stage-slideover-sidebar button[aria-label="搜索"]',
      '#stage-slideover-sidebar button[aria-label="关闭边栏"]',
      "button[aria-label='分享']",
      "button[aria-label='打开对话选项']",
      "button[aria-label='启动语音功能']",
      ".stage-sidebar-pure-surface",
    ];
    try {
      document.querySelectorAll(selectors.join(",")).forEach((el) => {
        if (el.id === "beauty-gpt-root" || el.closest("#beauty-gpt-root")) return;
        clearInlinePropsOn(el);
      });
    } catch (_) {
      /* ignore */
    }
  }

  function syncColorMode(vars) {
    const html = document.documentElement;
    if (!vars) {
      html.removeAttribute("data-bgpt-mode");
      html.style.removeProperty("color-scheme");
      if (savedColorMode) {
        if (savedColorMode.hadDark) html.classList.add("dark");
        else html.classList.remove("dark");
        if (savedColorMode.colorScheme) {
          html.style.colorScheme = savedColorMode.colorScheme;
        } else {
          html.style.removeProperty("color-scheme");
        }
      }
      return;
    }
    if (savedColorMode === null) {
      savedColorMode = {
        hadDark: html.classList.contains("dark"),
        colorScheme: html.style.colorScheme || "",
      };
    }
    const dark = isDark(vars.bgPrimary);
    html.setAttribute("data-bgpt-mode", dark ? "dark" : "light");
    if (dark) {
      html.classList.add("dark");
      html.style.colorScheme = "dark";
    } else {
      html.classList.remove("dark");
      html.style.colorScheme = "light";
    }
  }

  function paintDomTokens(vars) {
    const html = document.documentElement;
    if (!vars) {
      TOKEN_PROPS.forEach((k) => html.style.removeProperty(k));
      return;
    }
    html.style.setProperty("--composer-surface-primary", vars.inputBg, "important");
    html.style.setProperty("--sidebar-surface-primary", vars.bgSidebar, "important");
    html.style.setProperty("--sidebar-surface-secondary", vars.bgSecondary, "important");
    html.style.setProperty("--main-surface-primary", vars.bgPrimary, "important");
    html.style.setProperty("--main-surface-secondary", vars.bgSecondary, "important");
    html.style.setProperty("--text-primary", vars.textPrimary, "important");
    html.style.setProperty("--text-secondary", vars.textSecondary, "important");
    html.style.setProperty("--text-tertiary", vars.textSecondary, "important");
    html.style.setProperty("--bg-primary", vars.bgPrimary, "important");
    html.style.setProperty("--bg-elevated-primary", vars.bgSecondary, "important");
    html.style.setProperty("--bg-elevated-secondary", vars.bgSecondary, "important");
    html.style.setProperty("--code-block-surface", vars.bgSecondary, "important");
    html.style.setProperty("--surface-primary", vars.bgPrimary, "important");
    html.style.setProperty("--surface-secondary", vars.bgSecondary, "important");
    html.style.setProperty("--token-bg-primary", vars.bgPrimary, "important");
    html.style.setProperty("--token-bg-secondary", vars.bgSecondary, "important");
    html.style.setProperty("--token-bg-tertiary", vars.bgSecondary, "important");
    html.style.setProperty("--token-sidebar-surface-primary", vars.bgSidebar, "important");
    html.style.setProperty("--token-main-surface-primary", vars.bgPrimary, "important");
    html.style.setProperty("--token-main-surface-secondary", vars.bgSecondary, "important");
  }

  /**
   * @param {object} vars
   * @param {{ clear?: boolean, mode?: "full"|"light" }} [options]
   */
  function hardenStubbornNodes(vars, options) {
    if (!vars || !document.body) return;
    const opts = options || {};
    const deep = opts.mode !== "light";
    // Only clear on explicit theme apply — clearing every SPA tick causes flicker + lag
    if (opts.clear) {
      clearInlineThemeStyles();
    }

    const soft = withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.08 : 0.05);

    document
      .querySelectorAll(
        "#stage-slideover-sidebar, #stage-slideover-sidebar .bg-token-sidebar-surface-primary, #stage-slideover-sidebar [class*='sidebar-surface'], .stage-sidebar-pure-surface"
      )
      .forEach((el) => {
        setInline(el, "background-color", vars.bgSidebar);
        setInline(el, "background", vars.bgSidebar);
        setInline(el, "color", vars.textPrimary);
      });

    document
      .querySelectorAll(
        "#stage-slideover-sidebar .sticky.top-0, #stage-slideover-sidebar nav[aria-label]"
      )
      .forEach((el) => {
        setInline(el, "background-color", vars.bgSidebar);
        setInline(el, "background", vars.bgSidebar);
      });

    document
      .querySelectorAll("#stage-slideover-sidebar .__menu-item, #stage-slideover-sidebar [data-sidebar-item]")
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "background-image", "none");
        setInline(el, "box-shadow", "none");
        setInline(el, "border", "none");
        setInline(el, "outline", "none");
        setInline(el, "color", vars.textPrimary);
      });

    document
      .querySelectorAll("#stage-slideover-sidebar .truncate, #history .truncate")
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "color", vars.textPrimary);
        setInline(el, "font-weight", "400");
      });

    document
      .querySelectorAll(
        "#stage-slideover-sidebar [data-sidebar-item][data-active] .truncate, #stage-slideover-sidebar a[data-active][data-sidebar-item] .truncate"
      )
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "color", vars.accent);
        setInline(el, "font-weight", "600");
      });

    document
      .querySelectorAll(
        '#page-header [role="group"] .absolute.inset-x-px, #page-header [aria-label="选择聊天界面"] .absolute.rounded-full'
      )
      .forEach((el) => {
        setInline(el, "background-color", soft);
        setInline(el, "background", soft);
      });

    document
      .querySelectorAll(
        "#conversation-header-actions, #page-header .translucent-surface, [data-testid='thread-header-right-actions'] .translucent-surface"
      )
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "box-shadow", "none");
        setInline(el, "color", vars.textPrimary);
      });

    // Sidebar header: 搜索 / 关闭边栏
    document
      .querySelectorAll(
        '#sidebar-header button, button[data-testid="close-sidebar-button"], #stage-slideover-sidebar button[aria-label="搜索"], #stage-slideover-sidebar button[aria-label="关闭边栏"], #stage-slideover-sidebar button[aria-label="打开边栏"]'
      )
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "color", vars.textSecondary);
        setInline(el, "border", "none");
        setInline(el, "box-shadow", "none");
      });

    // Live tooltips: readable dark chrome (exclude menus)
    const isMenuNode = (el) =>
      el.getAttribute("role") === "menu" ||
      el.hasAttribute("data-radix-menu-content") ||
      el.closest?.("[data-radix-menu-content], [role='menu']");

    document
      .querySelectorAll(
        [
          '[role="tooltip"]',
          "[data-radix-tooltip-content]",
          '[popover="hint"] > div',
          '[data-radix-popper-content-wrapper] > [data-state="delayed-open"]',
          '[data-radix-popper-content-wrapper] > [data-state="instant-open"]',
        ].join(", ")
      )
      .forEach((el) => {
        if (isMenuNode(el)) return;
        if (el.classList?.contains("bg-transparent")) return;
        const cls = typeof el.className === "string" ? el.className : "";
        if (cls.includes("bg-transparent") && el.hasAttribute("popover")) return;
        setInline(el, "background", "#1f1f1f");
        setInline(el, "background-color", "#1f1f1f");
        setInline(el, "color", "#f5f5f5");
        setInline(el, "border-color", "#3a3a3a");
        el.querySelectorAll("[class*='bg-token'], [class*='text-token']").forEach((child) => {
          if (isMenuNode(child)) return;
          setInline(child, "background", "#1f1f1f");
          setInline(child, "background-color", "#1f1f1f");
          setInline(child, "color", "#f5f5f5");
        });
      });

    // Outer menu chrome only (inner picker must not get shadow/glow)
    document
      .querySelectorAll('[data-radix-menu-content], [role="menu"].popover')
      .forEach((el) => {
        setInline(el, "background", vars.bgSecondary);
        setInline(el, "background-color", vars.bgSecondary);
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", vars.border);
        setInline(el, "box-shadow", "0 10px 28px rgba(0, 0, 0, 0.28)");
      });

    document
      .querySelectorAll('[data-testid="composer-intelligence-picker-content"]')
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "box-shadow", "none");
      });

    document
      .querySelectorAll(
        '[data-radix-menu-content] .__menu-item, [role="menu"] .__menu-item, [role="menuitem"], [role="menuitemradio"]'
      )
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "color", vars.textPrimary);
        setInline(el, "box-shadow", "none");
      });

    document
      .querySelectorAll(
        '[data-radix-menu-content] .__menu-label, [data-radix-menu-content] .text-token-text-tertiary, [role="menu"] .text-token-text-tertiary'
      )
      .forEach((el) => {
        setInline(el, "color", vars.textSecondary);
      });

    document
      .querySelectorAll(
        '[role="menuitemradio"][aria-checked="true"], [role="menuitemradio"][data-state="checked"]'
      )
      .forEach((el) => {
        setInline(el, "color", vars.accent);
      });

    document
      .querySelectorAll(
        '#conversation-header-actions button, button[data-testid="share-chat-button"], button[data-testid="conversation-options-button"], button[aria-label="分享"], button[aria-label="打开对话选项"]'
      )
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", "transparent");
      });

    document
      .querySelectorAll(
        '#page-header [role="group"] .absolute[class*="bg-token"], #page-header [role="group"] .absolute[class*="shadow"]'
      )
      .forEach((el) => {
        if (el.className.includes("inset-0") || el.className.includes("grid")) return;
        const isThumb =
          el.className.includes("bg-token-bg") ||
          el.className.includes("elevated") ||
          el.className.includes("shadow");
        if (isThumb) {
          setInline(el, "background-color", vars.bgSecondary);
          setInline(el, "border-color", vars.border);
        } else {
          setInline(el, "background-color", soft);
        }
      });

    document.querySelectorAll("[data-composer-surface='true']").forEach((el) => {
      setInline(el, "background-color", vars.inputBg);
      setInline(el, "background", vars.inputBg);
      setInline(el, "border-color", vars.border);
      setInline(el, "color", vars.textPrimary);
      const cls = String(el.className || "");
      if (!cls.includes("corner-superellipse") && !el.closest?.('[class*="corner-superellipse"]')) {
        setInline(el, "border-radius", "28px");
      }
    });

    // Composer 外层壳透明，避免双层输入框
    document
      .querySelectorAll(".composer-parent > div, #thread-bottom > div")
      .forEach((el) => {
        if (el.getAttribute("data-composer-surface") === "true") return;
        if (!el.querySelector?.("[data-composer-surface='true']")) return;
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "background-image", "none");
        setInline(el, "box-shadow", "none");
      });

    const wallpaperOn = !!(currentWallpaper.enabled && currentWallpaper.url);

    document
      .querySelectorAll(
        "#thread-bottom-container, #thread-bottom, [class*='threadFooter'], [class*='ContentFade']"
      )
      .forEach((el) => {
        if (wallpaperOn) {
          setInline(el, "background-color", "transparent");
          setInline(el, "background", "transparent");
          setInline(el, "background-image", "none");
        } else {
          setInline(el, "background-color", vars.bgPrimary);
          setInline(el, "background", vars.bgPrimary);
        }
        setInline(el, "box-shadow", "none");
      });

    document.querySelectorAll("#main, main, [data-scroll-root]").forEach((el) => {
      const painted = buildWallpaperPaint(vars.bgPrimary);
      setInline(el, "background-color", painted.backgroundColor);
      setInline(el, "background", painted.background);
      if (wallpaperOn) setInline(el, "background-image", "none");
      setInline(el, "color", vars.textPrimary);
    });

    // Wallpaper uses a fixed viewport layer — keep chat column clear
    // 仅认节点自身/祖先是浮层；勿用 :has(input)，否则会命中 composer 里的 file input
    const isComposerOverlay = (el) =>
      !!(
        el.matches?.(
          '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-menu-content], [popover]:not([popover="hint"])'
        ) ||
        el.closest?.(
          '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-menu-content], [popover]:not([popover="hint"]), [data-radix-popper-content-wrapper]'
        )
      );

    if (wallpaperOn) {
      document
        .querySelectorAll(
          [
            "#thread",
            ".composer-parent",
            "#thread-bottom-container",
            "#thread-bottom",
            "[class*='threadFooter']",
            "[class*='ContentFade']",
            '[data-testid="use-case-prompt-chips"]',
            '[data-testid="use-case-prompt-chips"] > div',
            "#__next",
            "#root",
          ].join(", ")
        )
        .forEach((el) => {
          if (el.closest("#stage-slideover-sidebar")) return;
          if (el.closest("[data-composer-surface='true']")) return;
          if (isComposerOverlay(el)) return;
          setInline(el, "background-color", "transparent");
          setInline(el, "background", "transparent");
          setInline(el, "background-image", "none");
        });
    }

    // 底部浮层 / + 菜单 / token 面板：强制实底（不再依赖易失效的 role 选择器）
    const paintSolidPanel = (el) => {
      if (!el || el.closest?.("[data-composer-surface='true']")) return;
      if (el.id === "prompt-textarea" || el.classList?.contains("ProseMirror")) return;
      setInline(el, "background", vars.bgSecondary);
      setInline(el, "background-color", vars.bgSecondary);
      setInline(el, "background-image", "none");
      setInline(el, "color", vars.textPrimary);
      setInline(el, "border-color", vars.border);
      setInline(el, "box-shadow", "0 12px 32px rgba(0,0,0,0.2)");
      setInline(el, "opacity", "1");
      setInline(el, "backdrop-filter", "none");
      setInline(el, "-webkit-backdrop-filter", "none");
    };

    const plusBtn = document.getElementById("composer-plus-btn");
    const plusOpen =
      !!plusBtn &&
      (plusBtn.getAttribute("aria-expanded") === "true" ||
        plusBtn.getAttribute("data-state") === "open");

    // Heavy overlay scan only when menus are open or doing a full pass — never force layout
    if (deep || plusOpen) {
      document
        .querySelectorAll(
          [
            '#thread-bottom [role="dialog"]',
            '#thread-bottom [role="menu"]',
            '#thread-bottom [role="listbox"]',
            '#thread-bottom [data-radix-menu-content]',
            '.composer-parent [role="dialog"]',
            '.composer-parent [role="menu"]',
            '.composer-parent [role="listbox"]',
            '#thread-bottom [popover]:not([popover="hint"])',
            '.composer-parent [popover]:not([popover="hint"])',
            "[data-radix-popper-content-wrapper] > div",
            '[data-radix-popper-content-wrapper] [role="menu"]',
            "#thread-bottom .absolute.top-full",
            ".composer-parent .absolute.top-full",
            '#thread-bottom [class*="bg-surface-primary"]',
            '.absolute.top-full [class*="bg-surface-primary"]',
            '#thread-bottom [class*="bg-token-main-surface"]',
            '#thread-bottom [class*="bg-token-bg-elevated"]',
            '#thread-bottom [class*="bg-token-bg-primary"]',
            '#thread-bottom [class*="bg-token-bg-secondary"]',
            '.composer-parent [class*="bg-token-main-surface"]',
            '.composer-parent [class*="bg-token-bg-elevated"]',
          ].join(", ")
        )
        .forEach((el) => {
          if (el.getAttribute("popover") === "hint") return;
          if (
            el.closest("[data-composer-surface='true']") &&
            !el.matches(".absolute.top-full, [class*='top-full']")
          ) {
            return;
          }
          paintSolidPanel(el);
        });
    }

    // + 按钮展开时，再扫一遍其锚定浮层（popover / portal）
    if (plusOpen) {
      const controlsId = plusBtn.getAttribute("aria-controls");
      if (controlsId) {
        const panel = document.getElementById(controlsId);
        if (panel) paintSolidPanel(panel);
      }
      try {
        document
          .querySelectorAll(
            '[data-radix-popper-content-wrapper], [data-state="open"][role="menu"], [data-state="open"][role="dialog"], [popover]:not([popover="hint"])'
          )
          .forEach((el) => {
            if (el.getAttribute("popover") === "hint") return;
            if (el.hasAttribute("popover") && el.hasAttribute("hidden")) return;
            paintSolidPanel(el);
            el.querySelectorAll(":scope > div, [class*='bg-token'], [class*='bg-surface']").forEach(
              paintSolidPanel
            );
          });
      } catch (_) {
        /* ignore selector failures */
      }
    }

    // Thread-history markdown / code / citation passes scale with chat length — CSS covers
    // steady state; only re-harden on full ticks (theme switch / post-stream).
    if (deep) {
    // Assistant markdown: kill prose-invert / leftover white on strong/quotes/lists
    document
      .querySelectorAll(
        [
          ".markdown strong",
          ".markdown b",
          ".markdown em",
          ".markdown blockquote",
          ".markdown li",
          ".markdown p",
          ".markdown p > span",
          ".markdown li > span",
          ".prose strong",
          ".prose b",
          ".prose blockquote",
          ".prose li",
          '[data-message-author-role="assistant"] strong',
          '[data-turn="assistant"] strong',
        ].join(", ")
      )
      .forEach((el) => {
        if (el.closest("pre, .cm-editor")) return;
        setInline(el, "color", vars.textPrimary);
      });

    document
      .querySelectorAll(".markdown, .prose, [data-message-author-role='assistant'] .markdown")
      .forEach((el) => {
        setInline(el, "color", vars.textPrimary);
      });

    // Code blocks: unify header + CodeMirror body to theme surface
    const codeSurface = vars.bgSecondary;
    document
      .querySelectorAll(
        [
          '[class*="--code-block-surface"]',
          '[class*="code-block-surface"]',
          "#code-block-viewer",
          ".cm-editor",
          ".cm-scroller",
          ".cm-content",
          "pre.cm-content",
        ].join(", ")
      )
      .forEach((el) => {
        el.style.setProperty("--code-block-surface", codeSurface, "important");
        el.style.setProperty("--bg-elevated-secondary", codeSurface, "important");
        el.style.setProperty("--composer-surface-primary", codeSurface, "important");
        setInline(el, "background", codeSurface);
        setInline(el, "background-color", codeSurface);
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", vars.border);
      });

    document
      .querySelectorAll(
        ".markdown p code, .markdown li code, .prose p code, .prose li code, [data-message-author-role='assistant'] p code, [data-message-author-role='assistant'] li code, .markdown code"
      )
      .forEach((el) => {
        if (el.closest("pre, .cm-editor, #code-block-viewer")) return;
        setInline(el, "background", withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.14 : 0.08));
        setInline(el, "background-color", withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.14 : 0.08));
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", vars.border);
        setInline(el, "box-shadow", "none");
      });

    // Citation / source pills
    const citeBg = withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.14 : 0.08);
    document
      .querySelectorAll(
        [
          '.markdown [class*="group/footnote"]',
          '.markdown button[class*="footnote"]',
          '.markdown a:has(> img)',
          '.markdown span[data-state] > a[target="_blank"]',
          '.markdown span[data-state] a[rel*="noopener"]',
          '[data-testid*="citation"]',
          '[data-testid*="footnote"]',
        ].join(", ")
      )
      .forEach((el) => {
        setInline(el, "background", citeBg);
        setInline(el, "background-color", citeBg);
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", vars.border);
        setInline(el, "box-shadow", "none");
      });

    document
      .querySelectorAll('[data-testid="screen-threadFlyOut"], [data-testid="screen-threadFlyOut"] a')
      .forEach((el) => {
        const isRoot = el.getAttribute("data-testid") === "screen-threadFlyOut";
        setInline(el, "background", isRoot ? vars.bgSecondary : citeBg);
        setInline(el, "background-color", isRoot ? vars.bgSecondary : citeBg);
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", vars.border);
      });

    // Page header — never paint opaque bar over wallpaper / theme
    document.querySelectorAll("#page-header").forEach((el) => {
      setInline(el, "background", "transparent");
      setInline(el, "background-color", "transparent");
      setInline(el, "box-shadow", "none");
    });
    }

    // Library filter bar vs Work-mode suggestion list
    document
      .querySelectorAll(
        '[data-testid="artifacts-surface-top-controls"], .bg-surface-primary, [class*="bg-surface-primary"]'
      )
      .forEach((el) => {
        if (el.closest("#stage-slideover-sidebar")) return;
        const nearComposerList =
          el.classList.contains("bg-surface-primary") ||
          String(el.className || "").includes("bg-surface-primary");
        const underThread =
          !!el.closest("#thread-bottom, #thread-bottom-container, #thread") &&
          !el.closest('[data-testid="artifacts-surface-top-controls"]');

        if (underThread && nearComposerList) {
          // 建议列表与 + 菜单共用表面：一律实底，避免壁纸透出叠字
          setInline(el, "background", vars.bgSecondary);
          setInline(el, "background-color", vars.bgSecondary);
          setInline(el, "background-image", "none");
          setInline(el, "box-shadow", "0 12px 32px rgba(0,0,0,0.18)");
          setInline(el, "border-radius", "1.25rem");
          setInline(el, "color", vars.textPrimary);
          setInline(el, "opacity", "1");
          return;
        }

        if (el.closest('[data-testid="artifacts-surface-top-controls"]')) {
          setInline(el, "background-color", vars.bgPrimary);
          setInline(el, "background", vars.bgPrimary);
          setInline(el, "color", vars.textPrimary);
        }
      });

    document
      .querySelectorAll(
        "#thread-bottom .rounded-b-2xl.pt-5, #thread-bottom-container .rounded-b-2xl.pt-5"
      )
      .forEach((el) => {
        if (el.querySelector?.("[data-composer-surface='true']")) {
          setInline(el, "background", "transparent");
          setInline(el, "background-color", "transparent");
          setInline(el, "background-image", "none");
          setInline(el, "box-shadow", "none");
          return;
        }
        if (wallpaperOn) {
          setInline(el, "background", withAlpha(vars.bgPrimary, 0.28));
          setInline(el, "background-color", withAlpha(vars.bgPrimary, 0.28));
        } else {
          setInline(
            el,
            "background",
            withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.08 : 0.05)
          );
          setInline(
            el,
            "background-color",
            withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.08 : 0.05)
          );
        }
        setInline(el, "color", vars.textSecondary);
      });

    document
      .querySelectorAll(
        '[data-testid="artifacts-surface-top-controls"] button[aria-current="page"], [data-testid="artifacts-surface-top-controls"] .btn-primary-inverse'
      )
      .forEach((el) => {
        setInline(
          el,
          "background-color",
          withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.1 : 0.08)
        );
        setInline(el, "color", vars.textPrimary);
      });

    document.querySelectorAll("input[type='search'], input[type='text']").forEach((el) => {
      if (el.closest("[data-composer-surface], form[data-type='unified-composer']")) return;
      setInline(el, "background-color", vars.inputBg);
      setInline(el, "color", vars.textPrimary);
      setInline(el, "border-color", vars.border);
    });

    // Settings dialog: solid sidebar + clear inactive tab residue
    const settingsTabActiveBg = withAlpha(
      vars.textPrimary,
      isDark(vars.bgPrimary) ? 0.1 : 0.08
    );
    document
      .querySelectorAll(
        '[role="dialog"].popover:has([data-settings-tab-list="true"]), [role="dialog"]:has([data-settings-tab-list="true"]) [role="tabpanel"], [role="dialog"]:has([data-settings-tab-list="true"]) .border-token-border-extra-light, [role="dialog"]:has([data-settings-tab-list="true"]) [data-settings-tab-list="true"]'
      )
      .forEach((el) => {
        setInline(el, "background-color", vars.bgPrimary);
        setInline(el, "background", vars.bgPrimary);
        setInline(el, "color", vars.textPrimary);
      });

    document.querySelectorAll('[data-settings-tab-list="true"] [role="tab"]').forEach((el) => {
      const active =
        el.getAttribute("aria-selected") === "true" ||
        el.getAttribute("data-state") === "active";
      if (active) {
        setInline(el, "background-color", settingsTabActiveBg);
        setInline(el, "color", vars.textPrimary);
      } else {
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "color", vars.textSecondary);
        setInline(el, "box-shadow", "none");
      }
    });

    document
      .querySelectorAll("[role='tab'][aria-selected='true'], [role='tab'][data-state='active']")
      .forEach((el) => {
        if (el.closest("[data-settings-tab-list]")) return;
        setInline(
          el,
          "background-color",
          withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.1 : 0.08)
        );
        setInline(el, "color", vars.textPrimary);
      });

    document
      .querySelectorAll("#prompt-textarea, .ProseMirror, [data-composer-transition-slot]")
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "color", vars.textPrimary);
      });

    // Writing block editor + magic edit button (skip entirely when absent)
    const hasWritingBlock = !!document.querySelector(
      '.writing-block-editor, [class*="writing-block-editor"], .mt4SwW_editor, [data-testid="writing-block-header-surface"], [data-testid="writing-block-root"]'
    );
    if (hasWritingBlock) {
    document
      .querySelectorAll(
        '.writing-block-editor, [class*="writing-block-editor"], .mt4SwW_editor'
      )
      .forEach((el) => {
        // 勿匹配普通回复里的 markdown-new-styling
        if (
          el.classList?.contains("markdown-new-styling") &&
          !el.classList.contains("writing-block-editor") &&
          !el.className.includes("writing-block-editor") &&
          !el.classList.contains("mt4SwW_editor")
        ) {
          return;
        }
        el.style.setProperty("--wb-text-primary", vars.textPrimary, "important");
        el.style.setProperty("--wb-text-secondary", vars.textSecondary, "important");
        el.style.setProperty("--wb-surface-primary", vars.bgSecondary, "important");
        el.style.setProperty("--wb-surface-secondary", vars.bgPrimary, "important");
        el.style.setProperty("--wb-divider", vars.border, "important");
        el.style.setProperty("--wb-accent", vars.accent, "important");
        el.style.setProperty("--oai-wb-text-primary", vars.textPrimary, "important");
        el.style.setProperty("--oai-wb-text-secondary", vars.textSecondary, "important");
        el.style.setProperty("--oai-wb-surface-primary", vars.bgSecondary, "important");
        el.style.setProperty("--oai-wb-surface-secondary", vars.bgPrimary, "important");
        el.style.setProperty("--oai-wb-divider", vars.border, "important");
        el.style.setProperty("--oai-wb-accent", vars.accent, "important");
        setInline(el, "background", vars.bgSecondary);
        setInline(el, "background-color", vars.bgSecondary);
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border", "none");
        setInline(el, "box-shadow", "none");
      });

    // Outer writing-block card glow (not normal chat turns)
    const glowBorder = `1px solid ${withAlpha(vars.accent, 0.55)}`;
    const glowShadow = `0 0 0 1px ${withAlpha(vars.accent, 0.28)}, 0 0 18px ${withAlpha(vars.accent, 0.42)}, 0 0 36px ${withAlpha(vars.accent, 0.2)}`;
    document
      .querySelectorAll(
        '[data-testid="writing-block-header-surface"], [data-writing-block-fullscreen-header-surface]'
      )
      .forEach((el) => {
        const card = el.parentElement;
        if (!card || card === document.body || card === document.documentElement) return;
        if (
          card.matches?.(
            '[data-message-author-role], [data-turn], section[data-testid^="conversation-turn"], .agent-turn'
          )
        ) {
          return;
        }
        setInline(card, "background", vars.bgSecondary);
        setInline(card, "background-color", vars.bgSecondary);
        setInline(card, "border", glowBorder);
        setInline(card, "border-color", withAlpha(vars.accent, 0.55));
        setInline(card, "box-shadow", glowShadow);
      });

    document
      .querySelectorAll(
        '[data-testid="writing-block-root"], [data-testid="writing-block-container"], [data-writing-block-card]'
      )
      .forEach((el) => {
        setInline(el, "background", vars.bgSecondary);
        setInline(el, "background-color", vars.bgSecondary);
        setInline(el, "border", glowBorder);
        setInline(el, "border-color", withAlpha(vars.accent, 0.55));
        setInline(el, "box-shadow", glowShadow);
      });

    document
      .querySelectorAll('[data-testid="writing-block-header-magic-edit-button"]')
      .forEach((el) => {
        el.style.setProperty("--oai-wb-surface-primary", vars.bgSecondary, "important");
        el.style.setProperty("--oai-wb-surface-secondary", withAlpha(vars.textPrimary, 0.08), "important");
        el.style.setProperty("--oai-wb-text-primary", vars.textPrimary, "important");
        el.style.setProperty("--oai-wb-divider", vars.border, "important");
        setInline(el, "background", vars.bgSecondary);
        setInline(el, "background-color", vars.bgSecondary);
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", vars.border);
      });

    // Writing block header surface / chrome (kills dark:bg-[#2a2a2a])
    const paintWbVars = (el) => {
      el.style.setProperty("--wb-text-primary", vars.textPrimary, "important");
      el.style.setProperty("--wb-surface-primary", vars.bgSecondary, "important");
      el.style.setProperty("--wb-surface-secondary", withAlpha(vars.textPrimary, 0.08), "important");
      el.style.setProperty("--wb-divider", vars.border, "important");
      el.style.setProperty("--oai-wb-text-primary", vars.textPrimary, "important");
      el.style.setProperty("--oai-wb-surface-primary", vars.bgSecondary, "important");
      el.style.setProperty("--oai-wb-surface-secondary", withAlpha(vars.textPrimary, 0.08), "important");
      el.style.setProperty("--oai-wb-divider", vars.border, "important");
      el.style.setProperty("--oai-wb-accent", vars.accent, "important");
    };

    document
      .querySelectorAll(
        [
          '[data-testid="writing-block-header-surface"]',
          "[data-writing-block-fullscreen-header-surface]",
          "[data-writing-block-fullscreen-header-chrome]",
          '[data-testid="writing-block-header-magic-edit-layout"]',
          '[data-testid="writing-block-header-magic-edit-composer"]',
          '[data-testid="writing-block-header-magic-edit-entrypoint"]',
        ].join(", ")
      )
      .forEach((el) => {
        paintWbVars(el);
        const testId = el.getAttribute("data-testid") || "";
        const isBackdrop =
          el.hasAttribute("data-writing-block-fullscreen-header-surface") ||
          testId === "writing-block-header-surface";
        const isChip = testId === "writing-block-header-magic-edit-composer";
        if (isBackdrop) {
          setInline(el, "background", vars.bgPrimary);
          setInline(el, "background-color", vars.bgPrimary);
        } else if (isChip) {
          setInline(el, "background", vars.bgSecondary);
          setInline(el, "background-color", vars.bgSecondary);
          setInline(el, "border-color", vars.border);
        } else {
          setInline(el, "background", "transparent");
          setInline(el, "background-color", "transparent");
        }
        setInline(el, "color", vars.textPrimary);
      });

    document
      .querySelectorAll(
        '[data-testid="writing-block-header-surface"] button, [data-writing-block-fullscreen-header-chrome] button'
      )
      .forEach((el) => {
        if (el.getAttribute("data-testid") === "writing-block-header-magic-edit-button") return;
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "color", vars.textPrimary);
      });

    document
      .querySelectorAll(
        '[data-testid="writing-block-header-surface"] svg, [data-testid="writing-block-header-magic-edit-leading-icon-slot"] svg'
      )
      .forEach((el) => {
        setInline(el, "color", vars.textPrimary);
      });

    document
      .querySelectorAll(
        '.writing-block-editor .ProseMirror, [data-writing-block-fullscreen-editor-region], .writing-block-editor .ProseMirror p, .writing-block-editor .ProseMirror span'
      )
      .forEach((el) => {
        setInline(el, "background", "transparent");
        setInline(el, "color", vars.textPrimary);
      });
    }

    document.querySelectorAll(".composer-btn, #composer-plus-btn").forEach((el) => {
      setInline(
        el,
        "background-color",
        withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.12 : 0.08)
      );
      setInline(el, "color", vars.textPrimary);
      setInline(el, "border-radius", "9999px");
    });

    document
      .querySelectorAll(".composer-submit-button-color, button[aria-label='启动语音功能']")
      .forEach((el) => {
        setInline(el, "background-color", vars.accent);
        setInline(el, "color", contrastOn(vars.accent));
        setInline(el, "border-radius", "9999px");
      });

    document.querySelectorAll(".__composer-pill").forEach((el) => {
      setInline(
        el,
        "background-color",
        withAlpha(vars.textPrimary, isDark(vars.bgPrimary) ? 0.1 : 0.06)
      );
      setInline(el, "color", vars.textSecondary);
      setInline(el, "border-radius", "9999px");
    });

    document.querySelectorAll(".user-message-bubble-color, [class*='user-message-bubble']").forEach((el) => {
      setInline(el, "background", vars.bubbleUser);
      setInline(el, "background-color", vars.bubbleUser);
      setInline(el, "box-shadow", "none");
      setInline(el, "color", contrastOn(vars.bubbleUser));
    });

    document
      .querySelectorAll(
        deep
          ? "[data-message-author-role='user'], [data-message-author-role='assistant'], [data-turn='user'], [data-turn='assistant'], .agent-turn, section[data-testid^='conversation-turn']"
          : `[data-message-author-role='user']:not([${STYLED_ATTR}]), [data-message-author-role='assistant']:not([${STYLED_ATTR}]), [data-turn='user']:not([${STYLED_ATTR}]), [data-turn='assistant']:not([${STYLED_ATTR}]), .agent-turn:not([${STYLED_ATTR}]), section[data-testid^='conversation-turn']:not([${STYLED_ATTR}])`
      )
      .forEach((el) => {
        // 用户气泡本体单独上色，外层 turn 保持透明
        if (
          el.classList.contains("user-message-bubble-color") ||
          (el.className && String(el.className).includes("user-message-bubble"))
        ) {
          setInline(el, "background", vars.bubbleUser);
          setInline(el, "background-color", vars.bubbleUser);
          setInline(el, "color", contrastOn(vars.bubbleUser));
          return;
        }
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "box-shadow", "none");
      });

    // 兜底：部分布局气泡没有 user-message-bubble-color class
    document
      .querySelectorAll(
        '[data-message-author-role="user"] .whitespace-pre-wrap, [data-turn="user"] .whitespace-pre-wrap'
      )
      .forEach((el) => {
        const bubble =
          el.closest(".user-message-bubble-color, [class*='user-message-bubble']") ||
          el.parentElement;
        if (!bubble || bubble.closest("#stage-slideover-sidebar")) return;
        if (bubble.querySelector(".user-message-bubble-color")) return;
        // 仅当父级看起来像气泡容器时上色
        const cls = String(bubble.className || "");
        if (
          cls.includes("rounded") ||
          cls.includes("bubble") ||
          bubble.classList.contains("user-message-bubble-color")
        ) {
          setInline(bubble, "background", vars.bubbleUser);
          setInline(bubble, "background-color", vars.bubbleUser);
          setInline(bubble, "color", contrastOn(vars.bubbleUser));
        }
      });

    // 普通回复 markdown-new-styling：清掉误加的文稿块粉底
    document
      .querySelectorAll(".markdown.markdown-new-styling, .markdown-new-styling")
      .forEach((el) => {
        if (
          el.classList.contains("writing-block-editor") ||
          el.classList.contains("mt4SwW_editor") ||
          el.closest(".writing-block-editor, .mt4SwW_editor")
        ) {
          return;
        }
        [
          "--wb-text-primary",
          "--wb-text-secondary",
          "--wb-surface-primary",
          "--wb-surface-secondary",
          "--wb-divider",
          "--wb-accent",
          "--oai-wb-text-primary",
          "--oai-wb-text-secondary",
          "--oai-wb-surface-primary",
          "--oai-wb-surface-secondary",
          "--oai-wb-divider",
          "--oai-wb-accent",
        ].forEach((k) => el.style.removeProperty(k));
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "background-image", "none");
        setInline(el, "box-shadow", "none");
        setInline(el, "border", "none");
        setInline(el, "color", vars.textPrimary);
      });

    // Strip leftover fill wrappers inside assistant replies (keep code/writing cards)
    // Full-tree `assistant *` is O(history) and kills streaming FPS — CSS already covers it.
    if (deep) {
    const isProtectedFill = (el) =>
      !!(
        el.closest?.(
          [
            ".writing-block-editor",
            "[class*='writing-block-editor']",
            "#code-block-viewer",
            ".cm-editor",
            "[class*='--code-block-surface']",
            "[class*='code-block-surface']",
            "pre",
            "table",
            "[data-testid='writing-block-header-surface']",
          ].join(", ")
        ) ||
        el.querySelector?.(
          "#code-block-viewer, .cm-editor, .writing-block-editor, [data-testid='writing-block-header-surface']"
        )
      );

    document
      .querySelectorAll(
        [
          '#thread [data-message-author-role="assistant"]',
          '#thread [data-turn="assistant"]',
          "#thread .agent-turn",
          '#thread [data-message-author-role="assistant"] [class*="bg-"]',
          '#thread [data-turn="assistant"] [class*="bg-"]',
          '#thread .agent-turn [class*="bg-"]',
          '#thread [data-message-author-role="assistant"] [class*="surface"]',
          '#thread [data-turn="assistant"] [class*="surface"]',
          '#thread .agent-turn [class*="surface"]',
        ].join(", ")
      )
      .forEach((el) => {
        if (isProtectedFill(el)) return;
        const tag = (el.tagName || "").toLowerCase();
        if (tag === "svg" || tag === "path" || tag === "use" || tag === "img") return;
        const cls = typeof el.className === "string" ? el.className : "";
        const maybeFill =
          el.hasAttribute("data-message-author-role") ||
          el.hasAttribute("data-turn") ||
          el.classList?.contains("agent-turn") ||
          cls.includes("bg-") ||
          cls.includes("surface") ||
          cls.includes("rounded");
        if (!maybeFill) return;
        setInline(el, "background", "transparent");
        setInline(el, "background-color", "transparent");
        setInline(el, "background-image", "none");
        setInline(el, "box-shadow", "none");
      });

    // Activity panel header (活动 · 54s)
    document
      .querySelectorAll(
        'div.flex.items-center.justify-between.px-4.py-3, div.flex.items-center.justify-between'
      )
      .forEach((el) => {
        const closeBtn = el.querySelector('button[aria-label="关闭"]');
        if (!closeBtn) return;
        const hasMeta = el.querySelector(".text-token-text-tertiary");
        if (!hasMeta && !(el.textContent || "").includes("活动")) return;
        setInline(el, "background", vars.bgSecondary);
        setInline(el, "background-color", vars.bgSecondary);
        setInline(el, "color", vars.textPrimary);
        setInline(el, "border-color", vars.border);
        el.querySelectorAll("span, svg").forEach((child) => {
          setInline(child, "color", vars.textPrimary);
        });
        el.querySelectorAll(".text-token-text-tertiary").forEach((child) => {
          setInline(child, "color", vars.textSecondary);
        });
        setInline(closeBtn, "background", "transparent");
        setInline(closeBtn, "color", vars.textPrimary);
        const panel =
          el.closest("[role='dialog'], aside, [data-testid*='activity'], [data-testid*='Activity']") ||
          el.parentElement;
        if (panel && panel !== document.body) {
          setInline(panel, "background", vars.bgPrimary);
          setInline(panel, "background-color", vars.bgPrimary);
          setInline(panel, "color", vars.textPrimary);
          setInline(panel, "border-color", vars.border);
        }
      });
    }
  }

  function buildWallpaperPaint(bgPrimary) {
    // Wallpaper is a fixed viewport layer; chat surfaces stay transparent.
    if (!currentWallpaper.enabled || !currentWallpaper.url) {
      return {
        background: bgPrimary,
        backgroundColor: bgPrimary,
      };
    }
    return {
      background: "transparent",
      backgroundColor: "transparent",
    };
  }

  function generateWallpaperCss() {
    if (!currentWallpaper.enabled || !currentWallpaper.url) return "";
    const bgPrimary = currentWallpaper.bgPrimary || "#f7f7f8";
    const opacity = Math.max(0, Math.min(100, Number(currentWallpaper.opacity) || 0)) / 100;
    const scrim = withAlpha(bgPrimary, 1 - opacity);
    const isVideo = currentWallpaper.mediaType === "video";
    const url = String(currentWallpaper.url).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    // 视频模式：遮罩必须半透明，绝不能铺不透明 bgPrimary（否则会整块盖住视频）
    const layerBg = isVideo
      ? `background-color: transparent;
  background-image: linear-gradient(${scrim}, ${scrim});`
      : `background-color: ${bgPrimary};
  background-image: linear-gradient(${scrim}, ${scrim}), url("${url}");
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;`;
    const videoCss = isVideo
      ? `
/* 视频层(0) < 半透明遮罩(1) < 页面(2) */
html.beauty-gpt-bg #${VIDEO_FRAME_ID},
html.beauty-gpt-bg #beauty-gpt-bg-video {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  border: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  z-index: 0 !important;
  pointer-events: none !important;
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  background: #000 !important;
  object-fit: cover !important;
}
html.beauty-gpt-bg body {
  position: relative !important;
  z-index: 2 !important;
}
html.beauty-gpt-bg #beauty-gpt-root {
  position: relative !important;
  z-index: 2147483646 !important;
}
`
      : `
html.beauty-gpt-bg #${VIDEO_FRAME_ID},
html.beauty-gpt-bg #beauty-gpt-bg-video {
  display: none !important;
}
`;
    const scrimZ = isVideo ? "1" : "-1";
    return `
/* 固定视口壁纸：避免画在可滚动容器上导致上下滑动断层 */
html.beauty-gpt-bg::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: ${scrimZ};
  pointer-events: none;
  ${layerBg}
}
${videoCss}

html.beauty-gpt-bg,
html.beauty-gpt-bg body {
  background: transparent !important;
  background-color: transparent !important;
}

html.beauty-gpt-bg #__next,
html.beauty-gpt-bg #root {
  background: transparent !important;
  background-color: transparent !important;
}

/* 仅清「壳层」透明；勿扫 #thread-bottom > div / bg-token-*，否则会打穿 + 菜单 */
html.beauty-gpt-bg #main,
html.beauty-gpt-bg main,
html.beauty-gpt-bg [data-scroll-root],
html.beauty-gpt-bg #thread,
html.beauty-gpt-bg .composer-parent,
html.beauty-gpt-bg #thread-bottom-container,
html.beauty-gpt-bg #thread-bottom,
html.beauty-gpt-bg [class*="threadFooter"],
html.beauty-gpt-bg [class*="ContentFade"],
html.beauty-gpt-bg .relative.flex.h-full.w-full.overflow-hidden,
html.beauty-gpt-bg [data-testid="use-case-prompt-chips"],
html.beauty-gpt-bg [data-testid="use-case-prompt-chips"] > div,
html.beauty-gpt-bg [data-testid="use-case-prompt-chips"] .group.relative,
html.beauty-gpt-bg #page-header,
html.beauty-gpt-bg #page-header[class*="bg-token"] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

/* 输入框：不透明 + 保持原生圆角（默认主题+壁纸时 beauty-gpt-active 已卸下） */
html.beauty-gpt-bg [data-composer-surface="true"],
html.beauty-gpt-bg #thread-bottom-container [data-composer-surface="true"],
html.beauty-gpt-bg #thread-bottom [data-composer-surface="true"] {
  background: var(--bgpt-input-bg, ${bgPrimary}) !important;
  background-color: var(--bgpt-input-bg, ${bgPrimary}) !important;
  border-radius: 28px !important;
}

/*
 * 底部所有「面板型」表面（建议列表 / + 附件菜单 / token 浮层）一律实底。
 * 此前 0.42 半透明 + 对 bg-token-main-surface 强制 transparent 会导致叠字。
 */
html.beauty-gpt-bg #thread-bottom .bg-surface-primary,
html.beauty-gpt-bg #thread-bottom-container .bg-surface-primary,
html.beauty-gpt-bg #thread-bottom [class*="bg-surface-primary"],
html.beauty-gpt-bg .absolute.top-full .bg-surface-primary,
html.beauty-gpt-bg .absolute.top-full [class*="bg-surface-primary"],
html.beauty-gpt-bg #thread-bottom [class*="bg-token-main-surface"],
html.beauty-gpt-bg #thread-bottom [class*="bg-token-bg-elevated"],
html.beauty-gpt-bg #thread-bottom [class*="bg-token-bg-primary"]:not([data-composer-surface] *):not([data-composer-surface]),
html.beauty-gpt-bg #thread-bottom [class*="bg-token-bg-secondary"]:not([data-composer-surface] *):not([data-composer-surface]),
html.beauty-gpt-bg .composer-parent [class*="bg-token-main-surface"]:not([data-composer-surface] *):not([data-composer-surface]),
html.beauty-gpt-bg .composer-parent [class*="bg-token-bg-elevated"]:not([data-composer-surface] *):not([data-composer-surface]),
html.beauty-gpt-bg #thread-bottom .absolute.top-full,
html.beauty-gpt-bg #thread-bottom [class*="absolute"][class*="top-"]:not([data-composer-surface] *),
html.beauty-gpt-bg #thread-bottom [class*="top-full"]:not([data-composer-surface] *),
html.beauty-gpt-bg .composer-parent .absolute.top-full,
html.beauty-gpt-bg #thread-bottom [role="dialog"],
html.beauty-gpt-bg #thread-bottom [role="menu"],
html.beauty-gpt-bg #thread-bottom [role="listbox"],
html.beauty-gpt-bg #thread-bottom [data-radix-menu-content],
html.beauty-gpt-bg #thread-bottom [popover]:not([popover="hint"]),
html.beauty-gpt-bg .composer-parent [popover]:not([popover="hint"]),
html.beauty-gpt-bg [data-radix-popper-content-wrapper] > div,
html.beauty-gpt-bg [data-radix-popper-content-wrapper] [role="menu"],
html.beauty-gpt-bg [data-radix-popper-content-wrapper] [data-radix-menu-content],
html.beauty-gpt-bg #thread-bottom .rounded-b-2xl.pt-5:not(:has([data-composer-surface="true"])),
html.beauty-gpt-bg #thread-bottom [class*="bg-black\\/"],
html.beauty-gpt-bg #thread-bottom [class*="dark:bg-white\\/"] {
  background: ${bgPrimary} !important;
  background-color: ${bgPrimary} !important;
  background-image: none !important;
  opacity: 1 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* 浮层再抬一层次背景，对比更清晰（仅下拉/菜单，不含 composer 布局 absolute） */
html.beauty-gpt-bg #thread-bottom .absolute.top-full,
html.beauty-gpt-bg #thread-bottom [class*="top-full"]:not([data-composer-surface] *),
html.beauty-gpt-bg .composer-parent .absolute.top-full,
html.beauty-gpt-bg #thread-bottom [role="dialog"],
html.beauty-gpt-bg #thread-bottom [role="menu"],
html.beauty-gpt-bg #thread-bottom [role="listbox"],
html.beauty-gpt-bg #thread-bottom [popover]:not([popover="hint"]),
html.beauty-gpt-bg [data-radix-popper-content-wrapper] > div {
  background: var(--bgpt-bg-secondary, ${bgPrimary}) !important;
  background-color: var(--bgpt-bg-secondary, ${bgPrimary}) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22) !important;
  border-radius: 1.25rem !important;
}

html.beauty-gpt-bg .composer-parent > div:not([data-composer-surface="true"]),
html.beauty-gpt-bg #thread-bottom > div:not([data-composer-surface="true"]),
html.beauty-gpt-bg .composer-parent .rounded-b-2xl.pt-5:has([data-composer-surface="true"]),
html.beauty-gpt-bg #thread-bottom .rounded-b-2xl.pt-5:has([data-composer-surface="true"]),
html.beauty-gpt-bg .composer-parent [class*="corner-superellipse"]:not(.user-message-bubble-color),
html.beauty-gpt-bg #thread-bottom [class*="corner-superellipse"]:not(.user-message-bubble-color) {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
}

html.beauty-gpt-bg [data-composer-surface="true"] .absolute:not(button),
html.beauty-gpt-bg [data-composer-surface="true"] [class*="absolute"]:not(button),
html.beauty-gpt-bg [data-composer-transition-slot]:not(button) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

html.beauty-gpt-bg [data-composer-surface="true"] button,
html.beauty-gpt-bg [data-composer-surface="true"] .composer-btn,
html.beauty-gpt-bg [data-composer-surface="true"] .composer-submit-button-color,
html.beauty-gpt-bg [data-composer-surface="true"] .__composer-pill {
  border-radius: 9999px !important;
}

/* 设置弹窗：壁纸模式下保持实底 */
html.beauty-gpt-bg [role="dialog"].popover:has([data-settings-tab-list="true"]),
html.beauty-gpt-bg [role="dialog"]:has([data-settings-tab-list="true"]) [role="tabpanel"],
html.beauty-gpt-bg [role="dialog"]:has([data-settings-tab-list="true"]) .border-token-border-extra-light.flex.shrink-0,
html.beauty-gpt-bg [role="dialog"]:has([data-settings-tab-list="true"]) [data-settings-tab-list="true"] {
  background: var(--bgpt-bg-primary, ${bgPrimary}) !important;
  background-color: var(--bgpt-bg-primary, ${bgPrimary}) !important;
  background-image: none !important;
  opacity: 1 !important;
}

/* 侧栏保持不透明，挡住壁纸 */
html.beauty-gpt-bg #stage-slideover-sidebar,
html.beauty-gpt-bg #stage-slideover-sidebar > div,
html.beauty-gpt-bg .stage-sidebar-pure-surface,
html.beauty-gpt-bg .bg-token-sidebar-surface-primary,
html.beauty-gpt-bg [class*="bg-token-sidebar-surface"] {
  background-color: var(--bgpt-bg-sidebar, ${bgPrimary}) !important;
  background: var(--bgpt-bg-sidebar, ${bgPrimary}) !important;
}

html.beauty-gpt-bg #thread-bottom-container::before,
html.beauty-gpt-bg #thread-bottom-container::after,
html.beauty-gpt-bg [class*="ContentFade"]::before,
html.beauty-gpt-bg [class*="ContentFade"]::after {
  background: linear-gradient(
    to top,
    ${withAlpha(bgPrimary, 0.45)} 15%,
    transparent
  ) !important;
}

/* 壁纸模式下仍保持用户气泡可见 */
html.beauty-gpt-bg .user-message-bubble-color,
html.beauty-gpt-bg [data-message-author-role="user"] .user-message-bubble-color,
html.beauty-gpt-bg [data-turn="user"] .user-message-bubble-color {
  background: var(--bgpt-bubble-user, ${bgPrimary}) !important;
  background-color: var(--bgpt-bubble-user, ${bgPrimary}) !important;
  background-image: none !important;
}
`.trim();
  }

  function ensureWallpaperStyleEl() {
    let el = document.getElementById(WALLPAPER_STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = WALLPAPER_STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  function revokeVideoObjectUrl() {
    if (activeVideoObjectUrl) {
      try {
        URL.revokeObjectURL(activeVideoObjectUrl);
      } catch (_) {
        /* ignore */
      }
      activeVideoObjectUrl = null;
    }
  }

  function removeWallpaperVideo() {
    const video = document.getElementById(VIDEO_EL_ID);
    if (video) video.remove();
    const frame = document.getElementById(VIDEO_FRAME_ID);
    if (frame) frame.remove();
    revokeVideoObjectUrl();
  }

  function ensureWallpaperVideo(url) {
    // 优先用页面内 <video>+blob（不被 frame-src 拦截）；扩展 iframe 作兜底
    const useIframe = String(url || "").includes("bg-player.html");
    if (useIframe) {
      let frame = document.getElementById(VIDEO_FRAME_ID);
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = VIDEO_FRAME_ID;
        frame.setAttribute("aria-hidden", "true");
        frame.title = "Beauty-GPT background video";
        frame.allow = "autoplay";
        const root = document.documentElement;
        if (document.body) root.insertBefore(frame, document.body);
        else root.prepend(frame);
      }
      if (frame.getAttribute("src") !== url) frame.src = url;
      return frame;
    }

    let el = document.getElementById(VIDEO_EL_ID);
    if (!el) {
      el = document.createElement("video");
      el.id = VIDEO_EL_ID;
      el.setAttribute("aria-hidden", "true");
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      el.loop = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute("muted", "");
      el.setAttribute("loop", "");
      el.setAttribute("autoplay", "");
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.preload = "auto";
      const root = document.documentElement;
      if (document.body) root.insertBefore(el, document.body);
      else root.prepend(el);
    }
    if (el.getAttribute("src") !== url && el.src !== url) {
      el.src = url;
      el.load();
    }
    const play = () => {
      el.muted = true;
      el.volume = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => console.warn("[Beauty-GPT] video play failed", err));
      }
    };
    el.onloadeddata = play;
    el.oncanplay = play;
    if (el.readyState >= 2) play();
    return el;
  }

  let lastWallpaperKey = "";

  function wallpaperKey(options) {
    if (!options || !options.enabled || !options.url) return "off";
    return [
      "on",
      options.url,
      typeof options.opacity === "number" ? options.opacity : DEFAULT_BG_OPACITY,
      options.mediaType === "video" ? "video" : "image",
      options.bgPrimary || "",
    ].join("|");
  }

  function applyWallpaper(options) {
    const html = document.documentElement;
    const key = wallpaperKey(options);
    if (key === lastWallpaperKey) {
      // Still ensure video element exists after SPA nukes the DOM
      if (
        key !== "off" &&
        options.mediaType === "video" &&
        !document.getElementById(VIDEO_EL_ID) &&
        !document.getElementById(VIDEO_FRAME_ID)
      ) {
        ensureWallpaperVideo(options.url);
      }
      return;
    }
    lastWallpaperKey = key;
    if (!options || !options.enabled || !options.url) {
      currentWallpaper = {
        enabled: false,
        opacity: DEFAULT_BG_OPACITY,
        url: null,
        bgPrimary: options?.bgPrimary || currentWallpaper.bgPrimary,
        mediaType: null,
      };
      html.classList.remove("beauty-gpt-bg");
      const el = document.getElementById(WALLPAPER_STYLE_ID);
      if (el) el.textContent = "";
      removeWallpaperVideo();
      return;
    }
    const mediaType = options.mediaType === "video" ? "video" : "image";
    currentWallpaper = {
      enabled: true,
      opacity:
        typeof options.opacity === "number" ? options.opacity : DEFAULT_BG_OPACITY,
      url: options.url,
      bgPrimary: options.bgPrimary || "#000000",
      mediaType,
    };
    html.classList.add("beauty-gpt-bg");
    ensureWallpaperStyleEl().textContent = generateWallpaperCss();
    if (mediaType === "video") {
      ensureWallpaperVideo(options.url);
    } else {
      removeWallpaperVideo();
    }
  }

  function resolveWallpaperUrl(themeId, themes, useCustom, customDataUrl) {
    if (useCustom && customDataUrl) return customDataUrl;
    const catalog = themes || {};
    const theme = catalog[themeId];
    if (theme?.bgImage) {
      return extensionUrl(theme.bgImage);
    }
    return null;
  }

  /**
   * @returns {Promise<{ url: string|null, mediaType: "image"|"video"|null }>}
   */
  async function resolveWallpaperMedia(
    themeId,
    themes,
    useCustom,
    customDataUrl,
    customMediaType,
    customVideoUrl
  ) {
    if (useCustom) {
      if (customMediaType === "video" && customVideoUrl) {
        return { url: customVideoUrl, mediaType: "video" };
      }
      if (customDataUrl) {
        return { url: customDataUrl, mediaType: "image" };
      }
    }
    const catalog = themes || {};
    const theme = catalog[themeId];
    if (theme?.bgImage) {
      const url = extensionUrl(theme.bgImage);
      if (url) return { url, mediaType: "image" };
    }
    return { url: null, mediaType: null };
  }

  function guessVideoMime(file) {
    const type = String(file?.type || "").trim();
    if (type.startsWith("video/")) return type;
    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".webm")) return "video/webm";
    if (name.endsWith(".mov")) return "video/quicktime";
    if (name.endsWith(".m4v")) return "video/mp4";
    if (name.endsWith(".ogv")) return "video/ogg";
    return "video/mp4";
  }

  function isVideoFile(file) {
    if (!file) return false;
    if (String(file.type || "").startsWith("video/")) return true;
    return /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(file.name || "");
  }

  function sendBgMessage(payload) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve({ ok: false, error: "Extension context invalidated." });
        return;
      }
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          const errMsg = chrome.runtime.lastError?.message;
          if (errMsg) {
            resolve({ ok: false, error: errMsg });
            return;
          }
          resolve(response || { ok: false, error: "empty response" });
        });
      } catch (err) {
        resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  }

  async function loadCustomVideoObjectUrl() {
    const meta = await sendBgMessage({ type: "bgpt:videoExportMeta" });
    if (!meta?.ok || !meta.totalChunks) {
      // 回退：扩展页播放器
      const has = await sendBgMessage({ type: "bgpt:hasCustomVideo" });
      if (!has?.ok || !has.has) return null;
      const base = extensionUrl("src/bg-player.html");
      return base ? `${base}?t=${Date.now()}` : null;
    }
    const chunks = [];
    for (let index = 0; index < meta.totalChunks; index++) {
      const res = await sendBgMessage({
        type: "bgpt:videoExportChunk",
        index,
      });
      if (!res?.ok || !res.chunk) {
        throw new Error(res?.error || `视频分片读取失败 (${index + 1})`);
      }
      chunks.push(res.chunk);
    }
    revokeVideoObjectUrl();
    const blob = new Blob(chunks, { type: meta.mimeType || "video/mp4" });
    activeVideoObjectUrl = URL.createObjectURL(blob);
    return activeVideoObjectUrl;
  }

  async function saveCustomVideoFile(file, onProgress) {
    if (!file) throw new Error("未选择视频");
    if (!isVideoFile(file)) throw new Error("请选择视频文件（mp4 / webm）");
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error(
        `视频过大（上限 ${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)}MB）`
      );
    }
    if (file.size < 64) throw new Error("视频文件无效");
    if (!isExtensionContextValid()) {
      throw new Error("扩展已失效，请刷新页面后重试");
    }

    const mimeType = guessVideoMime(file);
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const buffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(buffer.byteLength / VIDEO_CHUNK_BYTES);

    const start = await sendBgMessage({
      type: "bgpt:videoUploadStart",
      uploadId,
      mimeType,
      name: file.name || "",
      bytes: file.size,
    });
    if (!start?.ok) throw new Error(start?.error || "无法开始上传");

    for (let index = 0; index < totalChunks; index++) {
      const offset = index * VIDEO_CHUNK_BYTES;
      const chunk = buffer.slice(offset, offset + VIDEO_CHUNK_BYTES);
      const res = await sendBgMessage({
        type: "bgpt:videoUploadChunk",
        uploadId,
        index,
        chunk,
      });
      if (!res?.ok) throw new Error(res?.error || `分片上传失败 (${index + 1})`);
      if (typeof onProgress === "function") {
        onProgress(Math.round(((index + 1) / totalChunks) * 100));
      }
    }

    const fin = await sendBgMessage({
      type: "bgpt:videoUploadFinish",
      uploadId,
      totalChunks,
    });
    if (!fin?.ok) throw new Error(fin?.error || "视频保存失败");

    await setLocalStorage({
      [LOCAL_STORAGE_KEYS.bgCustomMediaType]: "video",
      [LOCAL_STORAGE_KEYS.bgCustomVideoName]: file.name || "video.mp4",
    });
    await safeStorageRemove(LOCAL_STORAGE_KEYS.bgCustomDataUrl);

    // 立刻用本地 blob 播放，不依赖 iframe
    revokeVideoObjectUrl();
    activeVideoObjectUrl = URL.createObjectURL(
      new Blob([buffer], { type: mimeType })
    );
    return activeVideoObjectUrl;
  }

  async function clearCustomVideo() {
    await sendBgMessage({ type: "bgpt:clearCustomVideo" });
    await safeStorageRemove(LOCAL_STORAGE_KEYS.bgCustomVideoName);
    removeWallpaperVideo();
  }

  function applyTheme(vars) {
    const html = document.documentElement;
    if (!vars) {
      html.classList.remove("beauty-gpt-active");
      // 默认主题也要保留壁纸：不在这里强拆 beauty-gpt-bg / video
      const el = document.getElementById(STYLE_ID);
      if (el) el.textContent = "";
      clearInlineThemeStyles();
      clearLegacyInlineStyles();
      restoreComposerNativeRadius();
      syncColorMode(null);
      paintDomTokens(null);
      // 默认主题若仍开着壁纸，需把壁纸 CSS 写回（上面清空了 style 标签）
      if (currentWallpaper.enabled && currentWallpaper.url) {
        applyWallpaper(currentWallpaper);
      }
      return;
    }
    html.classList.add("beauty-gpt-active");
    syncColorMode(vars);
    paintDomTokens(vars);
    const styleEl = ensureStyleEl();
    styleEl.textContent = generateThemeCss(vars);
    if (currentWallpaper.enabled && currentWallpaper.url) {
      currentWallpaper.bgPrimary = vars.bgPrimary;
      applyWallpaper(currentWallpaper);
    }
    hardenStubbornNodes(vars, { clear: true, mode: "full" });
  }

  /**
   * Re-assert theme after SPA DOM churn.
   * @param {object|null} vars
   * @param {{ mode?: "full"|"light", clear?: boolean }} [options]
   */
  function ensureThemeAlive(vars, options) {
    if (!vars) {
      if (
        document.querySelector(`[${STYLED_ATTR}]`) ||
        document.documentElement.classList.contains("beauty-gpt-active")
      ) {
        applyTheme(null);
      }
      return;
    }
    if (!document.getElementById(STYLE_ID)) {
      applyTheme(vars);
      return;
    }
    if (!document.documentElement.classList.contains("beauty-gpt-active")) {
      document.documentElement.classList.add("beauty-gpt-active");
    }
    const opts = options || {};
    const mode =
      opts.mode ||
      (isChatStreaming() ? "light" : "full");
    hardenStubbornNodes(vars, {
      clear: opts.clear === true,
      mode,
    });
  }

  function getStorage(keys) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve({});
        return;
      }
      try {
        chrome.storage.sync.get(keys, (result) => {
          void chrome.runtime.lastError;
          resolve(result || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  function setStorage(obj) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve();
        return;
      }
      try {
        chrome.storage.sync.set(obj, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  function getLocalStorage(keys) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve({});
        return;
      }
      try {
        chrome.storage.local.get(keys, (result) => {
          void chrome.runtime.lastError;
          resolve(result || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  function setLocalStorage(obj) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve();
        return;
      }
      try {
        chrome.storage.local.set(obj, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  async function loadState() {
    const themes = await loadThemes();
    const data = await getStorage([
      STORAGE_KEYS.themeId,
      STORAGE_KEYS.customVars,
      STORAGE_KEYS.fabPosition,
      STORAGE_KEYS.bgEnabled,
      STORAGE_KEYS.bgOpacity,
      STORAGE_KEYS.bgUseCustom,
    ]);
    const local = await getLocalStorage([
      LOCAL_STORAGE_KEYS.bgCustomDataUrl,
      LOCAL_STORAGE_KEYS.bgCustomMediaType,
      LOCAL_STORAGE_KEYS.bgCustomVideoName,
    ]);
    const themeId = data[STORAGE_KEYS.themeId] || "default";
    const customVars = data[STORAGE_KEYS.customVars] || null;
    const fabPosition = data[STORAGE_KEYS.fabPosition] || null;
    const bgEnabled =
      data[STORAGE_KEYS.bgEnabled] === undefined
        ? true
        : !!data[STORAGE_KEYS.bgEnabled];
    const bgOpacity =
      typeof data[STORAGE_KEYS.bgOpacity] === "number"
        ? data[STORAGE_KEYS.bgOpacity]
        : DEFAULT_BG_OPACITY;
    const bgUseCustom = !!data[STORAGE_KEYS.bgUseCustom];
    const bgCustomDataUrl = local[LOCAL_STORAGE_KEYS.bgCustomDataUrl] || null;
    let bgCustomMediaType = local[LOCAL_STORAGE_KEYS.bgCustomMediaType] || null;
    if (!bgCustomMediaType && bgCustomDataUrl) bgCustomMediaType = "image";
    const bgCustomVideoName = local[LOCAL_STORAGE_KEYS.bgCustomVideoName] || null;

    let bgCustomVideoUrl = null;
    if (bgCustomMediaType === "video") {
      try {
        bgCustomVideoUrl = await loadCustomVideoObjectUrl();
      } catch (err) {
        console.error("[Beauty-GPT] load custom video failed", err);
        bgCustomVideoUrl = null;
      }
    }

    return {
      themes,
      themeId,
      customVars,
      fabPosition,
      bgEnabled,
      bgOpacity,
      bgUseCustom,
      bgCustomDataUrl,
      bgCustomMediaType,
      bgCustomVideoUrl,
      bgCustomVideoName,
    };
  }

  async function saveWallpaperSettings({ enabled, opacity, useCustom }) {
    const payload = {};
    if (enabled !== undefined) payload[STORAGE_KEYS.bgEnabled] = !!enabled;
    if (opacity !== undefined) {
      payload[STORAGE_KEYS.bgOpacity] = Math.max(0, Math.min(100, Number(opacity) || 0));
    }
    if (useCustom !== undefined) payload[STORAGE_KEYS.bgUseCustom] = !!useCustom;
    if (Object.keys(payload).length) await setStorage(payload);
  }

  function safeStorageRemove(keys) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve();
        return;
      }
      try {
        chrome.storage.local.remove(keys, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  async function saveCustomWallpaper(dataUrl) {
    if (!dataUrl) {
      await safeStorageRemove([
        LOCAL_STORAGE_KEYS.bgCustomDataUrl,
        LOCAL_STORAGE_KEYS.bgCustomMediaType,
        LOCAL_STORAGE_KEYS.bgCustomVideoName,
      ]);
      await clearCustomVideo();
      return;
    }
    await clearCustomVideo();
    await setLocalStorage({
      [LOCAL_STORAGE_KEYS.bgCustomDataUrl]: dataUrl,
      [LOCAL_STORAGE_KEYS.bgCustomMediaType]: "image",
    });
    await safeStorageRemove(LOCAL_STORAGE_KEYS.bgCustomVideoName);
  }

  async function resolveActiveVars(themeId, customVars, themes) {
    const catalog = themes || (await loadThemes());
    if (themeId === "custom") {
      return customVars;
    }
    const theme = catalog[themeId];
    if (!theme || !theme.vars) return null;
    return mergeVars(theme.vars, null);
  }

  async function saveThemeSelection(themeId, customVars) {
    const payload = { [STORAGE_KEYS.themeId]: themeId };
    if (customVars !== undefined) {
      payload[STORAGE_KEYS.customVars] = customVars;
    }
    await setStorage(payload);
  }

  async function saveFabPosition(pos) {
    await setStorage({ [STORAGE_KEYS.fabPosition]: pos });
  }

  global.BeautyGPTTheme = {
    STYLE_ID,
    STORAGE_KEYS,
    LOCAL_STORAGE_KEYS,
    DEFAULT_BG_OPACITY,
    MAX_VIDEO_BYTES,
    isExtensionContextValid,
    extensionUrl,
    isVideoFile,
    loadThemes,
    getVarKeys,
    getVarLabels,
    mergeVars,
    generateThemeCss,
    applyTheme,
    applyWallpaper,
    resolveWallpaperUrl,
    resolveWallpaperMedia,
    ensureThemeAlive,
    isChatStreaming,
    loadState,
    resolveActiveVars,
    saveThemeSelection,
    saveFabPosition,
    saveWallpaperSettings,
    saveCustomWallpaper,
    saveCustomVideoFile,
    clearCustomVideo,
    loadCustomVideoObjectUrl,
    getStorage,
    setStorage,
    getLocalStorage,
    setLocalStorage,
  };
})(typeof window !== "undefined" ? window : self);

(async function () {
  const nameEl = document.getElementById("theme-name");
  const descEl = document.getElementById("theme-desc");
  const Theme = window.BeautyGPTTheme;

  try {
    const { themes, themeId } = await Theme.loadState();
    if (themeId === "custom") {
      nameEl.textContent = "自定义";
      descEl.textContent = "使用你保存的自定义配色";
      return;
    }
    const theme = themes[themeId] || themes.default;
    nameEl.textContent = theme?.name || themeId;
    descEl.textContent = theme?.description || "";
  } catch (err) {
    nameEl.textContent = "未知";
    descEl.textContent = "无法读取主题状态";
    console.error("[Beauty-GPT popup]", err);
  }
})();

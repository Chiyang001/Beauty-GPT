/**
 * One-off DOM inspector for chatgpt.com (logged-out shell).
 * Run: node tools/inspect-chatgpt-dom.mjs
 */
import { chromium } from "playwright";

const URL = "https://chatgpt.com/";

const INTERESTING = [
  "id",
  "data-testid",
  "data-composer-surface",
  "data-splash-headline-option",
  "data-sidebar-item",
  "data-scroll-root",
  "role",
  "aria-label",
  "class",
];

async function walk(page, selector, maxDepth = 6) {
  return page.evaluate(
    ({ selector, maxDepth, interesting }) => {
      const root = document.querySelector(selector);
      if (!root) return [`MISSING: ${selector}`];

      const lines = [];
      function visit(el, depth) {
        if (depth > maxDepth) return;
        const tag = el.tagName?.toLowerCase?.() || "?";
        const attrs = [];
        for (const name of interesting) {
          const v = el.getAttribute?.(name);
          if (v) attrs.push(`${name}=${JSON.stringify(v.length > 80 ? v.slice(0, 77) + "..." : v)}`);
        }
        const cls = el.className;
        if (typeof cls === "string" && cls) {
          const tokens = cls.split(/\s+/).filter(Boolean);
          const notable = tokens.filter(
            (t) =>
              t.includes("token") ||
              t.includes("sidebar") ||
              t.includes("composer") ||
              t.includes("splash") ||
              t.includes("surface") ||
              t.includes("thread") ||
              t.includes("page-header") ||
              t.startsWith("bg-") ||
              t.startsWith("text-heading") ||
              t.includes("burrito") ||
              t.includes("nux")
          );
          if (notable.length) attrs.push(`notableClasses=${JSON.stringify(notable.slice(0, 8))}`);
        }
        lines.push(`${"  ".repeat(depth)}<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`);
        for (const child of el.children || []) visit(child, depth + 1);
      }
      visit(root, 0);
      return lines;
    },
    { selector, maxDepth, interesting: INTERESTING }
  );
}

async function collectSelectors(page) {
  return page.evaluate(() => {
    const out = {
      ids: [],
      testids: [],
      dataAttrs: [],
      ariaLabels: [],
      images: [],
      backgrounds: [],
    };
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (/thread|sidebar|composer|page|main|header|splash|history|stage/i.test(id)) out.ids.push(id);
    });
    document.querySelectorAll("[data-testid]").forEach((el) => {
      const t = el.getAttribute("data-testid");
      if (t) out.testids.push(t);
    });
    document.querySelectorAll("*").forEach((el) => {
      for (const attr of el.attributes || []) {
        if (attr.name.startsWith("data-") && !attr.name.startsWith("data-testid")) {
          if (/splash|composer|sidebar|scroll|turn|message|nux|burrito/i.test(attr.name + "=" + attr.value)) {
            out.dataAttrs.push(`${attr.name}=${attr.value.slice(0, 60)}`);
          }
        }
      }
    });
    document.querySelectorAll("[aria-label]").forEach((el) => {
      const a = el.getAttribute("aria-label");
      if (a && /聊天|工作|搜索|新|sidebar|chat|work|search|composer/i.test(a)) out.ariaLabels.push(a);
    });
    document.querySelectorAll("img[src], [style*='background']").forEach((el) => {
      const src = el.getAttribute?.("src") || "";
      const style = el.getAttribute?.("style") || "";
      if (/burrito|nux|oaistatic|background/i.test(src + style)) {
        out.images.push({ tag: el.tagName, src: src.slice(0, 120), style: style.slice(0, 120) });
      }
    });
    document.querySelectorAll("main, #main, #thread, [data-scroll-root], .composer-parent, #page-header").forEach((el) => {
      const cs = getComputedStyle(el);
      const bi = cs.backgroundImage;
      if (bi && bi !== "none") {
        out.backgrounds.push({
          sel: el.id || el.tagName,
          bg: bi.slice(0, 120),
          className: String(el.className || "").slice(0, 100),
        });
      }
    });
    const uniq = (arr) => [...new Set(arr)].sort();
    out.ids = uniq(out.ids);
    out.testids = uniq(out.testids);
    out.dataAttrs = uniq(out.dataAttrs);
    out.ariaLabels = uniq(out.ariaLabels);
    return out;
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(8000);

const selectors = await collectSelectors(page);
console.log("=== SELECTORS ===");
console.log(JSON.stringify(selectors, null, 2));

for (const sel of ["#__next", "#main", "#thread", "#page-header", "#stage-slideover-sidebar", "[data-scroll-root]", ".composer-parent"]) {
  console.log(`\n=== TREE ${sel} ===`);
  const lines = await walk(page, sel, 5);
  console.log(lines.join("\n"));
}

await page.screenshot({ path: "tools/chatgpt-logged-out.png", fullPage: true });
console.log("\nScreenshot: tools/chatgpt-logged-out.png");
await browser.close();

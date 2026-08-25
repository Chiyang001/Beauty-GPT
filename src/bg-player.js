/**
 * 在扩展源播放自定义背景视频（绕过 ChatGPT 页面 CSP 对 blob: 的限制）
 */
(function () {
  const VIDEO_DB = "beauty-gpt-bg";
  const VIDEO_STORE = "media";
  const VIDEO_KEY = "customVideo";

  const video = document.getElementById("bgpt-video");
  let objectUrl = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(VIDEO_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VIDEO_STORE)) {
          db.createObjectStore(VIDEO_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb open failed"));
    });
  }

  async function readBlob() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, "readonly");
      const req = tx.objectStore(VIDEO_STORE).get(VIDEO_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error("idb read failed"));
      };
    });
  }

  async function playFromDb() {
    try {
      const row = await readBlob();
      if (!row?.blob) return;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_) {
          /* ignore */
        }
      }
      objectUrl = URL.createObjectURL(row.blob);
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.loop = true;
      video.playsInline = true;
      video.src = objectUrl;
      video.load();
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (err) {
      console.error("[Beauty-GPT] bg-player failed", err);
    }
  }

  video.addEventListener("canplay", () => {
    video.muted = true;
    video.volume = 0;
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  });

  window.addEventListener("message", (event) => {
    if (!event.data || event.data.source !== "beauty-gpt") return;
    if (event.data.type === "reload") playFromDb();
  });

  playFromDb();
})();

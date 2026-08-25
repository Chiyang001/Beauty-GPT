/**
 * Beauty-GPT service worker
 * 自定义视频：分片接收后写入扩展源 IndexedDB，供 bg-player 页面直接读取播放
 */
const DEFAULTS = {
  beautyGptThemeId: "default",
  beautyGptCustomVars: null,
};

const VIDEO_DB = "beauty-gpt-bg";
const VIDEO_STORE = "media";
const VIDEO_KEY = "customVideo";
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** @type {Map<string, { chunks: ArrayBuffer[], mimeType: string, name: string, bytes: number }>} */
const uploads = new Map();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.sync.get(Object.keys(DEFAULTS), (existing) => {
      const toSet = {};
      for (const [key, value] of Object.entries(DEFAULTS)) {
        if (existing[key] === undefined) {
          toSet[key] = value;
        }
      }
      if (Object.keys(toSet).length) {
        chrome.storage.sync.set(toSet);
      }
    });
  }
});

function openVideoDb() {
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

async function idbPut(record) {
  const db = await openVideoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("idb write failed"));
    };
    tx.objectStore(VIDEO_STORE).put(record, VIDEO_KEY);
  });
}

async function idbGet() {
  const db = await openVideoDb();
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

async function idbClear() {
  const db = await openVideoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("idb clear failed"));
    };
    tx.objectStore(VIDEO_STORE).delete(VIDEO_KEY);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return undefined;

  if (msg.type === "bgpt:videoUploadStart") {
    try {
      const bytes = Number(msg.bytes) || 0;
      if (bytes <= 0 || bytes > MAX_VIDEO_BYTES) {
        sendResponse({
          ok: false,
          error: `视频过大或无效（上限 ${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)}MB）`,
        });
        return true;
      }
      uploads.set(String(msg.uploadId), {
        chunks: [],
        mimeType: msg.mimeType || "video/mp4",
        name: msg.name || "",
        bytes,
      });
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
    return true;
  }

  if (msg.type === "bgpt:videoUploadChunk") {
    try {
      const u = uploads.get(String(msg.uploadId));
      if (!u) {
        sendResponse({ ok: false, error: "上传会话不存在，请重试" });
        return true;
      }
      const index = Number(msg.index);
      if (!Number.isFinite(index) || index < 0 || !msg.chunk) {
        sendResponse({ ok: false, error: "分片无效" });
        return true;
      }
      u.chunks[index] = msg.chunk;
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
    return true;
  }

  if (msg.type === "bgpt:videoUploadFinish") {
    const uploadId = String(msg.uploadId);
    const u = uploads.get(uploadId);
    if (!u) {
      sendResponse({ ok: false, error: "上传会话不存在，请重试" });
      return true;
    }
    const total = Number(msg.totalChunks);
    (async () => {
      try {
        if (!Number.isFinite(total) || total <= 0 || u.chunks.length < total) {
          throw new Error("分片不完整，请重试");
        }
        for (let i = 0; i < total; i++) {
          if (!u.chunks[i]) throw new Error(`缺少分片 ${i + 1}/${total}`);
        }
        const blob = new Blob(u.chunks.slice(0, total), {
          type: u.mimeType || "video/mp4",
        });
        if (blob.size > MAX_VIDEO_BYTES) {
          throw new Error(
            `视频过大（上限 ${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)}MB）`
          );
        }
        await idbPut({
          blob,
          mimeType: u.mimeType || "video/mp4",
          name: u.name || "",
          bytes: blob.size,
          savedAt: Date.now(),
        });
        uploads.delete(uploadId);
        sendResponse({ ok: true, bytes: blob.size, name: u.name || "" });
      } catch (err) {
        uploads.delete(uploadId);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "bgpt:hasCustomVideo") {
    idbGet()
      .then((row) =>
        sendResponse({
          ok: true,
          has: !!(row && row.blob),
          name: row?.name || "",
          bytes: row?.bytes || 0,
          mimeType: row?.mimeType || "video/mp4",
        })
      )
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (msg.type === "bgpt:videoExportMeta") {
    idbGet()
      .then(async (row) => {
        if (!row?.blob) {
          sendResponse({ ok: false, error: "无视频" });
          return;
        }
        const buffer = await row.blob.arrayBuffer();
        const chunkSize = 256 * 1024;
        const totalChunks = Math.ceil(buffer.byteLength / chunkSize) || 0;
        // 暂存供分片导出（service worker 生命周期内）
        globalThis.__bgptExport = {
          buffer,
          mimeType: row.mimeType || "video/mp4",
          name: row.name || "",
          chunkSize,
          totalChunks,
        };
        sendResponse({
          ok: true,
          mimeType: row.mimeType || "video/mp4",
          name: row.name || "",
          bytes: buffer.byteLength,
          totalChunks,
          chunkSize,
        });
      })
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  if (msg.type === "bgpt:videoExportChunk") {
    try {
      const exp = globalThis.__bgptExport;
      if (!exp?.buffer) {
        sendResponse({ ok: false, error: "导出会话不存在" });
        return true;
      }
      const index = Number(msg.index);
      if (!Number.isFinite(index) || index < 0 || index >= exp.totalChunks) {
        sendResponse({ ok: false, error: "分片索引无效" });
        return true;
      }
      const start = index * exp.chunkSize;
      const chunk = exp.buffer.slice(start, start + exp.chunkSize);
      sendResponse({ ok: true, index, chunk });
      if (index >= exp.totalChunks - 1) {
        globalThis.__bgptExport = null;
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
    return true;
  }

  if (msg.type === "bgpt:clearCustomVideo") {
    globalThis.__bgptExport = null;
    idbClear()
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true;
  }

  return undefined;
});

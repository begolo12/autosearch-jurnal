const { app, BrowserWindow, session, shell } = require("electron");

const APP_URL =
  process.env.SMARTSARI_URL ||
  process.env.PUSTAKACARI_URL ||
  "https://smartsari.my.id";

function getSafeExternalHttpUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function getAppOrigin() {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return "https://smartsari.my.id";
  }
}

function buildOfflineHtml() {
  const safeTarget = JSON.stringify(APP_URL);
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>SmartSari — Koneksi Terputus</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0F12;color:#F4F4F5;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
    .card{max-width:380px;background:#151619;border:1px solid #2C2E35;border-radius:16px;padding:28px}
    .badge{display:inline-block;background:#DB2777;color:#fff;font-weight:700;font-size:12px;padding:4px 12px;border-radius:999px;margin-bottom:14px}
    h1{font-size:18px;margin:0 0 8px}
    p{font-size:13px;color:#A1A1AA;line-height:1.5;margin:0 0 18px}
    button{background:#DB2777;color:#fff;border:0;border-radius:999px;padding:10px 20px;font-weight:600;font-size:13px;cursor:pointer}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SmartSari</div>
    <h1>Tidak Dapat Terhubung</h1>
    <p>Pastikan koneksi internet aktif, lalu coba hubungkan kembali ke SmartSari.</p>
    <button onclick="location.href=${safeTarget}">Coba Lagi</button>
  </div>
</body>
</html>`;
}

function createWindow() {
  const allowedOrigin = getAppOrigin();
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 640,
    title: "SmartSari — Pencarian Jurnal Terfilter & Akurat",
    backgroundColor: "#0E0F12",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.loadURL(APP_URL);

  win.webContents.on("did-fail-load", (_event, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    void win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(buildOfflineHtml())}`
    );
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = getSafeExternalHttpUrl(url);
    if (safeUrl) {
      void shell.openExternal(safeUrl);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.origin === allowedOrigin || url.startsWith("data:text/html")) {
        return;
      }
      event.preventDefault();
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        void shell.openExternal(parsed.toString());
      }
    } catch {
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = new Set(["clipboard-sanitized-write", "clipboard-read"]);
      callback(allowed.has(permission));
    }
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

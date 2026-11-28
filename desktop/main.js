const { app, BrowserWindow, shell } = require("electron");

const APP_URL =
  process.env.PUSTAKACARI_URL || "https://smartsari.my.id";

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

function createWindow() {
  const allowedOrigin = getAppOrigin();
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 640,
    title: "SmartSari — Pencarian Jurnal Terfilter & Akurat",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(APP_URL);

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
      if (parsed.origin === allowedOrigin) {
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
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

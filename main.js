const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { ensureBinaries } = require('./js/binary-manager');

let binaryPaths = null;
let dependencyError = null;

function createWindow() {
  const win = new BrowserWindow({
    fullscreen: true,
    transparent: true,
    frame: false,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(async () => {
  try {
    const dependencyDir = process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'vibeamp-streamer')
      : app.getPath('userData');
    binaryPaths = await ensureBinaries(dependencyDir);
    console.log('Multimedia dependencies ready:', binaryPaths.binaryDir);
  } catch (error) {
    dependencyError = error;
    console.error('Error preparing multimedia dependencies:', error);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Pass-through mouse events for transparent background
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options);
  }
});

// Window Controls
ipcMain.on('minimize-app', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('close-app', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

/**
 * Helper to run yt-dlp commands directly using the persistent binary.
 */
function runYtDlp(args = []) {
  return new Promise((resolve, reject) => {
    if (!binaryPaths) {
      reject(new Error(`Multimedia dependencies are unavailable: ${dependencyError?.message || 'unknown error'}`));
      return;
    }
    const allArgs = ['--ffmpeg-location', binaryPaths.ffmpegPath, ...args];
    console.log('Executing yt-dlp with arguments:', allArgs);

    execFile(binaryPaths.ytDlpPath, allArgs, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`yt-dlp error: ${stderr || error.message}`);
        reject(new Error(stderr || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// IPC Handler to get stream URL
ipcMain.handle('get-stream-url', async (event, url) => {
  console.log('IPC: get-stream-url for', url);
  try {
    const normalizedUrl = normalizeInput(url);
    if (!normalizedUrl || !isValidUrl(normalizedUrl)) {
      throw new Error('Invalid or unsafe URL');
    }

    const { stdout } = await runYtDlp([
      normalizedUrl,
      '--dump-json',
      '--format', 'bestaudio',
      '--no-warnings'
    ]);

    const data = JSON.parse(stdout);
    const audioUrl = data.url;
    const kbps = data.abr ? Math.round(data.abr) : 128;
    const khz = data.asr ? Math.round(data.asr / 1000) : 44;

    return { success: true, url: audioUrl, kbps, khz };
  } catch (error) {
    console.error('Error fetching stream URL:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler to get structured info about a URL (single video or playlist)
ipcMain.handle('get-url-info', async (event, url) => {
  try {
    const normalizedUrl = normalizeInput(url);
    if (!normalizedUrl || !isValidUrl(normalizedUrl)) {
      throw new Error('Invalid or unsafe URL');
    }

    const { stdout } = await runYtDlp([
      normalizedUrl,
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings'
    ]);

    const data = JSON.parse(stdout);

    if (data._type === 'playlist' || data.entries) {
      return {
        success: true,
        type: 'playlist',
        title: data.title || 'YouTube Playlist',
        entries: data.entries.map(entry => ({
          id: entry.id,
          title: entry.title,
          url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
          thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || '',
          duration: entry.duration_string || '',
        }))
      };
    }

    return {
      success: true,
      type: 'video',
      entry: {
        id: data.id,
        title: data.title,
        url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
        thumbnail: data.thumbnails?.[0]?.url || data.thumbnail || '',
        duration: data.duration_string || '',
      }
    };
  } catch (error) {
    console.error('Error fetching URL info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('search-youtube', async (event, query) => {
  console.log('IPC: search-youtube for', query);
  try {
    const normalizedQuery = normalizeInput(query);
    if (!normalizedQuery) {
      throw new Error('Invalid or empty search query');
    }

    const { stdout } = await runYtDlp([
      `ytsearch3:${normalizedQuery}`,
      '--dump-json',
      '--flat-playlist',
      '--no-playlist',
      '--no-warnings'
    ]);

    const lines = stdout.trim().split('\n');
    const results = lines.map(line => {
      try {
        const data = JSON.parse(line);
        return {
          id: data.id,
          title: data.title,
          url: `https://www.youtube.com/watch?v=${data.id}`,
          thumbnail: data.thumbnails?.[0]?.url || '',
          duration: data.duration_string || '',
        };
      } catch (e) {
        return null;
      }
    }).filter(item => item !== null);

    return { success: true, results };
  } catch (error) {
    console.error('Error searching YouTube:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Normalizes IPC input. Arguments are passed without a shell via execFile.
 */
function normalizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, 2048);
}

/**
 * Validates if the input is a valid URL.
 */
function isValidUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (e) {
    return false;
  }
}

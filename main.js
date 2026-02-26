const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync, exec } = require('child_process');

// Fixed location in AppData/Local for portable mode
const appDataDir = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'vibeamp-streamer');
console.log('Persistent Binary Directory:', appDataDir);

const YT_DLP_PATH = path.join(appDataDir, 'yt-dlp.exe');
const FFMPEG_DIR = path.join(appDataDir, 'ffmpeg');
const FFMPEG_PATH = path.join(FFMPEG_DIR, 'bin', 'ffmpeg.exe');

/**
 * Downloads a file from a URL to a local path.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        if (process.platform !== 'win32') {
          fs.chmodSync(dest, '755');
        }
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => { });
      reject(err);
    });
  });
}

/**
 * Ensures yt-dlp and ffmpeg are present in the persistent AppData directory.
 * Tries copying from bundle first, falls back to downloading.
 */
async function ensureDependencies() {
  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }

    // --- Handle YT-DLP ---
    if (!fs.existsSync(YT_DLP_PATH)) {
      const sourcePath = path.join(__dirname, 'yt-dlp.exe');
      if (fs.existsSync(sourcePath)) {
        console.log(`Copying yt-dlp.exe from bundle to ${YT_DLP_PATH}...`);
        fs.copyFileSync(sourcePath, YT_DLP_PATH);
      } else {
        console.log('yt-dlp.exe not found in bundle, downloading...');
        const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
        await downloadFile(ytDlpUrl, YT_DLP_PATH);
        console.log('yt-dlp.exe downloaded successfully.');
      }
    }

    // --- Handle FFMPEG ---
    if (!fs.existsSync(FFMPEG_PATH)) {
      const sourceDir = path.join(__dirname, 'ffmpeg');
      if (fs.existsSync(sourceDir)) {
        console.log(`Copying ffmpeg directory from bundle to ${FFMPEG_DIR}...`);
        copyDirectory(sourceDir, FFMPEG_DIR);
      } else {
        console.log('ffmpeg not found in bundle, downloading (Windows)...');
        const ffmpegZipPath = path.join(appDataDir, 'ffmpeg.zip');
        const ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

        await downloadFile(ffmpegUrl, ffmpegZipPath);
        console.log('Unzipping ffmpeg...');

        // Use PowerShell to unzip
        const cmd = `PowerShell -Command "Expand-Archive -Path '${ffmpegZipPath}' -DestinationPath '${appDataDir}' -Force"`;
        execSync(cmd);

        // Match gyan.dev structure: ffmpeg-YYYY-MM-DD-git-hash-essentials_build/bin/ffmpeg.exe
        const dirs = fs.readdirSync(appDataDir);
        const extractedDir = dirs.find(d => d.startsWith('ffmpeg-') && fs.lstatSync(path.join(appDataDir, d)).isDirectory());

        if (extractedDir) {
          const targetDir = path.join(appDataDir, 'ffmpeg');
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);

          // Move the bin folder to matched expected structure
          const extractedBin = path.join(appDataDir, extractedDir, 'bin');
          const targetBin = path.join(targetDir, 'bin');
          if (fs.existsSync(extractedBin)) {
            copyDirectory(extractedBin, targetBin);
          }
        }

        fs.unlinkSync(ffmpegZipPath);
        console.log('ffmpeg ready.');
      }
    }
  } catch (error) {
    console.error('Error ensuring dependencies:', error);
  }
}

/**
 * Recursively copy directory
 */
function copyDirectory(source, destination) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

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
  await ensureDependencies();
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
    // Add ffmpeg location if available
    const ffmpegArgs = fs.existsSync(FFMPEG_PATH) ? ['--ffmpeg-location', `"${FFMPEG_PATH}"`] : [];

    // Construct the full command
    const allArgs = [...ffmpegArgs, ...args];
    const command = `"${YT_DLP_PATH}" ${allArgs.join(' ')}`;

    console.log(`Executing: ${command}`);

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
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
    const sanitizedUrl = sanitizeInput(url);
    if (!sanitizedUrl || !isValidUrl(sanitizedUrl)) {
      throw new Error('Invalid or unsafe URL');
    }

    const { stdout } = await runYtDlp([
      `"${sanitizedUrl}"`,
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
    const sanitizedUrl = sanitizeInput(url);
    if (!sanitizedUrl || !isValidUrl(sanitizedUrl)) {
      throw new Error('Invalid or unsafe URL');
    }

    const { stdout } = await runYtDlp([
      `"${sanitizedUrl}"`,
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
    const sanitizedQuery = sanitizeInput(query);
    if (!sanitizedQuery) {
      throw new Error('Invalid or empty search query');
    }

    const { stdout } = await runYtDlp([
      `"ytsearch3:${sanitizedQuery}"`,
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
 * Sanitizes input for yt-dlp to prevent shell injection.
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[;|`$><(){}\[\]\\'"\n\r]/g, '');
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



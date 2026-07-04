const fs = require('fs');
const https = require('https');
const path = require('path');

const YT_DLP_RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

function getPlatformConfig(platform = process.platform) {
  if (platform === 'win32') {
    return { ytDlpName: 'yt-dlp.exe', ytDlpUrl: `${YT_DLP_RELEASE_BASE}/yt-dlp.exe` };
  }
  if (platform === 'darwin') {
    return { ytDlpName: 'yt-dlp', ytDlpUrl: `${YT_DLP_RELEASE_BASE}/yt-dlp_macos` };
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

function getBinaryPaths(userDataDir, platform = process.platform) {
  const config = getPlatformConfig(platform);
  const binaryDir = path.join(userDataDir, 'bin');
  return {
    binaryDir,
    ytDlpPath: path.join(binaryDir, config.ytDlpName),
  };
}

function downloadFile(url, destination, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'VibeAmp' } }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        if (!response.headers.location || redirectsLeft === 0) {
          reject(new Error('Too many redirects while downloading a dependency'));
          return;
        }
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadFile(nextUrl, destination, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Dependency download failed with HTTP ${status}`));
        return;
      }

      const temporaryPath = `${destination}.download`;
      const file = fs.createWriteStream(temporaryPath);
      response.pipe(file);
      file.on('finish', () => file.close(() => {
        fs.renameSync(temporaryPath, destination);
        resolve();
      }));
      file.on('error', error => {
        response.destroy();
        fs.rm(temporaryPath, { force: true }, () => reject(error));
      });
    });
    request.on('error', reject);
  });
}

function resolveFfmpegPath() {
  let ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  return ffmpegPath;
}

async function ensureBinaries(userDataDir, platform = process.platform) {
  const config = getPlatformConfig(platform);
  const paths = getBinaryPaths(userDataDir, platform);
  fs.mkdirSync(paths.binaryDir, { recursive: true });

  if (!fs.existsSync(paths.ytDlpPath)) {
    await downloadFile(config.ytDlpUrl, paths.ytDlpPath);
  }
  if (platform !== 'win32') {
    fs.chmodSync(paths.ytDlpPath, 0o755);
  }

  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error('The bundled FFmpeg executable is unavailable');
  }

  return { ...paths, ffmpegPath };
}

module.exports = {
  ensureBinaries,
  getBinaryPaths,
  getPlatformConfig,
  resolveFfmpegPath,
};

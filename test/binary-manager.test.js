const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { getBinaryPaths, getPlatformConfig, resolveFfmpegPath } = require('../js/binary-manager');

test('selects the Windows yt-dlp executable', () => {
  const config = getPlatformConfig('win32');
  assert.equal(config.ytDlpName, 'yt-dlp.exe');
  assert.match(config.ytDlpUrl, /yt-dlp\.exe$/);
});

test('selects the standalone macOS yt-dlp executable', () => {
  const config = getPlatformConfig('darwin');
  assert.equal(config.ytDlpName, 'yt-dlp');
  assert.match(config.ytDlpUrl, /yt-dlp_macos$/);
});

test('stores downloaded tools below Electron userData', () => {
  const paths = getBinaryPaths('/tmp/vibeamp-user-data', 'darwin');
  assert.equal(paths.ytDlpPath, path.join('/tmp/vibeamp-user-data', 'bin', 'yt-dlp'));
});

test('rejects unsupported platforms explicitly', () => {
  assert.throws(() => getPlatformConfig('freebsd'), /Unsupported platform/);
});

test('resolves the bundled FFmpeg executable', () => {
  assert.ok(resolveFfmpegPath());
});

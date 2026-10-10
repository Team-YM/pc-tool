const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { pipeline } = require('stream/promises');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const publicDir = path.join(__dirname, 'public');
const bundledBinDir = path.join(__dirname, 'bin');
const bundledYtDlp = path.join(bundledBinDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const bundledFfmpeg = path.join(bundledBinDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const ytDlp = process.env.YT_DLP_PATH || (fs.existsSync(bundledYtDlp)
  ? bundledYtDlp
  : (process.platform === 'win32'
    ? 'C:\\Users\\cuteFish\\AppData\\Local\\Programs\\Python\\Python314\\Scripts\\yt-dlp.exe'
    : 'yt-dlp'));
const ffmpeg = process.env.FFMPEG_PATH || (fs.existsSync(bundledFfmpeg)
  ? bundledFfmpeg
  : (process.platform === 'win32'
    ? path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe')
    : 'ffmpeg'));
const parseTimeout = Number(process.env.PARSE_TIMEOUT_MS || 60000);
const ytDlpCookies = process.env.YT_DLP_COOKIES || '';
const ytDlpProxy = process.env.YT_DLP_PROXY || '';
const ytDlpImpersonate = process.env.YT_DLP_IMPERSONATE || '';

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(express.static(publicDir));
app.use('/bil', express.static(path.join(__dirname, 'bil')));

function getPlatform(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname === 'b23.tv' || hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')) return 'bilibili';
  return null;
}

function extractUrl(input) {
  const match = String(input || '').match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  return match[0].replace(/[。，、！？）)】】]+$/g, '');
}

// #region debug-point A:parser-start
function reportDebug(hypothesisId, msg, data) {
  const url = process.env.DEBUG_SERVER_URL;
  if (!url) return;
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: process.env.DEBUG_SESSION_ID || 'bilibili-412', runId: 'pre', hypothesisId, location: 'server.js:runYtDlp', msg: `[DEBUG] ${msg}`, data, ts: Date.now() }) }).catch(() => {});
}
// #endregion

function bilibiliBvid(sourceUrl) {
  const match = String(sourceUrl).match(/(?:\/video\/|^BV)(BV[0-9A-Za-z]{10})/i);
  return match ? match[1] : null;
}

function fetchBilibiliJsonWithCurl(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['--silent', '--show-error', '--max-time', '20', '-A', 'Mozilla/5.0', '-e', 'https://www.bilibili.com/', url], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || error.message));
      try {
        const data = JSON.parse(stdout);
        const endpoint = new URL(url).pathname;
        console.log(`[bilibili] ${endpoint} code=${data.code} message=${data.message || ''}`);
        reportDebug('B', 'Bilibili API response received', { endpoint, code: data.code, message: data.message || '', bytes: stdout.length });
        resolve(data);
      } catch {
        reject(new Error('Bilibili API 返回的数据格式不正确。'));
      }
    });
  });
}

async function fetchBilibiliJson(url) {
  try {
    return await fetchBilibiliJsonWithCurl(url);
  } catch (curlError) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/', Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return data;
    } catch (fetchError) {
      throw new Error(`Bilibili API 请求失败（curl: ${curlError.message}; fetch: ${fetchError.message}）`);
    }
  }
}

async function runBilibiliApi(sourceUrl) {
  const bvid = bilibiliBvid(sourceUrl);
  if (!bvid) return null;
  const view = await fetchBilibiliJson(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`);
  if (view.code !== 0 || !view.data) {
    if (view.code === 62002) throw new Error('B 站详情接口：该稿件不可见、已删除或需要登录后访问。');
    throw new Error(`B 站详情接口返回错误：${view.message || view.code}`);
  }
  const requestedPage = Number(new URL(sourceUrl).searchParams.get('p') || 1);
  if (!Number.isInteger(requestedPage) || requestedPage < 1) throw new Error('分 P 参数无效。');
  const page = view.data.pages?.[requestedPage - 1];
  if (!page?.cid) throw new Error(`B 站视频没有第 ${requestedPage} 个分 P。`);
  let play = await fetchBilibiliJson(`https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${page.cid}&qn=16&fnval=16&fourk=0`);
  if (play.code !== 0 || !play.data) {
    play = await fetchBilibiliJson(`https://api.bilibili.com/x/player/playurl?avid=${view.data.aid}&cid=${page.cid}&qn=16&fnval=16&fourk=0`);
  }
  if (play.code !== 0 || !play.data) {
    play = await fetchBilibiliJson(`https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${page.cid}&qn=32&fnval=16&fourk=0`);
  }
  if (play.code !== 0 || !play.data) {
    if (play.code === 62012) throw new Error('B 站暂时限制了当前服务器的播放接口请求，请稍后重试或配置代理。');
    if (play.message === '啥都木有') throw new Error('该 B 站稿件当前没有可用播放地址，可能已下架或需要登录。');
    throw new Error(`B 站播放接口返回错误：${play.message || play.code}`);
  }
  const formats = [];
  const dash = play.data.dash;
  for (const item of dash?.video || []) {
    const url = item.baseUrl || item.base_url;
    if (url) formats.push({ format_id: `video-${item.id}`, url, vcodec: item.codecs || 'avc1', acodec: 'none', ext: 'mp4', height: item.height || 0 });
  }
  for (const item of dash?.audio || []) {
    const url = item.baseUrl || item.base_url;
    if (url) formats.push({ format_id: `audio-${item.id}`, url, vcodec: 'none', acodec: item.codecs || 'mp4a', ext: 'm4a' });
  }
  for (const item of play.data.durl || []) {
    if (item.url) formats.push({ format_id: 'durl', url: item.url, vcodec: 'avc1', acodec: 'aac', ext: 'mp4', height: 0 });
  }
  if (!formats.length) throw new Error('B 站没有返回可播放媒体地址，可能需要登录或会员权限。');
  reportDebug('B', 'Bilibili API extraction succeeded', { bvid, aid: view.data.aid, cid: page.cid, formatCount: formats.length });
  return {
    id: bvid,
    title: view.data.title,
    uploader: view.data.owner?.name || '',
    duration: Math.round((view.data.duration || page.duration || 0)),
    thumbnail: view.data.pic,
    formats
  };
}

async function runYtDlp(sourceUrl) {
  if (getPlatform(sourceUrl) === 'bilibili') {
    const apiInfo = await runBilibiliApi(sourceUrl);
    if (apiInfo) return apiInfo;
  }
  reportDebug('A', 'yt-dlp invocation started', { executable: ytDlp, sourceHost: new URL(sourceUrl).hostname, node: process.version, platform: process.platform, path: process.env.PATH || '', ytDlpPathConfigured: Boolean(process.env.YT_DLP_PATH) });
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates'
    ];
    if (getPlatform(sourceUrl) === 'bilibili') {
      args.push('--extractor-args', 'bilibili:api=android', '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/worst');
    }
    if (ytDlpCookies) args.push('--cookies', ytDlpCookies);
    if (ytDlpProxy) args.push('--proxy', ytDlpProxy);
    if (ytDlpImpersonate) args.push('--impersonate', ytDlpImpersonate);
    args.push(sourceUrl);
    // #region debug-point A:request-shape
    reportDebug('A', 'yt-dlp request shape captured', { sourceUrl, args, ytDlpVersion: '2026.08.19', cookiesConfigured: Boolean(ytDlpCookies), proxyConfigured: Boolean(ytDlpProxy), impersonateConfigured: Boolean(ytDlpImpersonate) });
    // #endregion
    execFile(ytDlp, args, { timeout: parseTimeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr.trim().split('\n').pop() || error.message;
        reportDebug('A', 'yt-dlp invocation failed', { code: error.code || null, signal: error.signal || null, message: error.message, stderrTail: stderr.trim().slice(-1000) });
        return reject(new Error(`本机解析失败：${detail}`));
      }
      reportDebug('B', 'yt-dlp invocation succeeded', { outputBytes: stdout.length });
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('本机解析器返回的数据格式不正确。'));
      }
    });
  });
}

function pickFormat(info, kind) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  if (kind === 'audio') {
    return formats.find(item => item.vcodec === 'none' && item.acodec !== 'none' && item.url)?.url || '';
  }
  return info.url || formats.find(item => item.url && item.vcodec !== 'none')?.url || '';
}

function safeFilename(title, extension) {
  const base = String(title || 'media').replace(/[\\/:*?"<>|]/g, '_').trim() || 'media';
  return `${base}.${extension}`;
}

function mediaProxyUrl(mediaUrl, filename, download = false) {
  if (!mediaUrl) return '';
  const params = new URLSearchParams({ name: filename, url: mediaUrl });
  if (download) params.set('download', '1');
  return `/api/media?${params}`;
}

function imageProxyUrl(imageUrl, filename, download = false) {
  if (!imageUrl) return '';
  const params = new URLSearchParams({ name: filename, url: imageUrl });
  if (download) params.set('download', '1');
  return `/api/image?${params}`;
}

function mergedVideoUrl(videoUrl, audioUrl, filename, download = false) {
  if (!videoUrl || !audioUrl) return '';
  const params = new URLSearchParams({ name: filename, video: videoUrl, audio: audioUrl });
  if (download) params.set('download', '1');
  return `/api/merged-video?${params}`;
}

function contentDisposition(disposition, filename) {
  const fallback = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function normalizeResult(info, platform, sourceUrl) {
  const videoUrl = pickFormat(info, 'video');
  const audioUrl = pickFormat(info, 'audio');
  const video = mergedVideoUrl(videoUrl, audioUrl, safeFilename(info.title, 'mp4'));
  reportDebug('D', 'media tracks inspected', { platform, formatCount: Array.isArray(info.formats) ? info.formats.length : 0, selectedVideo: info.formats?.find(item => item.vcodec !== 'none' && item.url)?.format_id || null, selectedAudio: info.formats?.find(item => item.vcodec === 'none' && item.acodec !== 'none' && item.url)?.format_id || null, videoCodec: info.formats?.find(item => item.vcodec !== 'none' && item.url)?.vcodec || null, audioCodec: info.formats?.find(item => item.vcodec === 'none' && item.acodec !== 'none' && item.url)?.acodec || null });
  reportDebug('C', 'normalized media URLs', { platform, videoHost: videoUrl ? new URL(videoUrl).hostname : null, videoExt: info.formats?.find(item => item.vcodec !== 'none' && item.url)?.ext || info.ext || null, audioExt: info.formats?.find(item => item.vcodec === 'none' && item.acodec !== 'none' && item.url)?.ext || null });
  return {
    ok: true,
    platform,
    sourceUrl,
    title: info.title || '未命名内容',
    author: info.uploader || info.creator || '',
    duration: info.duration || 0,
    cover: imageProxyUrl(info.thumbnail || '', safeFilename(info.title, 'jpg')),
    video,
    audio: mediaProxyUrl(audioUrl, safeFilename(info.title, 'm4a'))
  };
}

app.get('/api/image', async (req, res) => {
  let imageUrl;
  try {
    imageUrl = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).send('封面地址无效。');
  }
  const allowedHost = imageUrl.hostname.endsWith('.hdslb.com') || imageUrl.hostname.endsWith('.bilibili.com');
  if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') return res.status(403).send('不支持的封面地址。');
  if (!allowedHost) return res.status(403).send('不支持的封面地址。');

  try {
    const upstream = await fetch(imageUrl, { headers: { Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' } });
    if (!upstream.ok || !upstream.body) return res.status(upstream.status || 502).send('封面服务器返回失败。');
    res.status(upstream.status);
    const filename = String(req.query.name || 'cover.jpg').trim() || 'cover.jpg';
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', contentDisposition(disposition, filename));
    const reader = upstream.body.getReader();
    res.on('close', () => reader.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(502).send(`封面转发失败：${error.message}`);
  }
});

const mergedVideos = new Map();

function sendMergedVideo(req, res, output, filename) {
  fs.stat(output, (error, stat) => {
    if (error) return res.status(500).send('合并文件读取失败。');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', contentDisposition(req.query.download === '1' ? 'attachment' : 'inline', filename));
    res.setHeader('Accept-Ranges', 'bytes');
    let start = 0;
    let end = stat.size - 1;
    const range = req.headers.range;
    const match = range && range.match(/bytes=(\\d*)-(\\d*)/);
    if (match) {
      if (match[1]) start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
      if (!match[1]) start = Math.max(0, stat.size - Number(match[2] || 0));
    }
    if (start > end || start >= stat.size) return res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
    const partial = Boolean(match);
    res.status(partial ? 206 : 200).setHeader('Content-Length', end - start + 1);
    if (partial) res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    fs.createReadStream(output, { start, end }).pipe(res);
  });
}

app.get('/api/merged-video', async (req, res) => {
  let videoUrl;
  let audioUrl;
  try {
    videoUrl = new URL(String(req.query.video || ''));
    audioUrl = new URL(String(req.query.audio || ''));
  } catch {
    return res.status(400).send('视频或音频地址无效。');
  }
  const allowed = url => url.protocol === 'https:' && (url.hostname.endsWith('.bilivideo.com') || url.hostname.endsWith('.bilivideo.cn'));
  if (!allowed(videoUrl) || !allowed(audioUrl)) return res.status(403).send('不支持的媒体地址。');

  const filename = String(req.query.name || 'video.mp4').trim() || 'video.mp4';
  const key = crypto.createHash('sha256').update(`${videoUrl}\n${audioUrl}`).digest('hex');
  const cached = mergedVideos.get(key);
  if (cached && cached.output && fs.existsSync(cached.output)) return sendMergedVideo(req, res, cached.output, filename);
  if (cached?.promise) {
    try { await cached.promise; return sendMergedVideo(req, res, cached.output, filename); } catch (error) { return res.status(502).send(error.message); }
  }

  const output = path.join(os.tmpdir(), `media-${key}.mp4`);
  const videoInput = path.join(os.tmpdir(), `media-${key}-video.m4s`);
  const audioInput = path.join(os.tmpdir(), `media-${key}-audio.m4s`);
  const promise = (async () => {
    const download = async (url, target) => {
      const response = await fetch(url, { headers: { Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok || !response.body) throw new Error(`媒体下载失败：HTTP ${response.status}`);
      await pipeline(response.body, fs.createWriteStream(target));
    };
    await download(videoUrl, videoInput);
    await download(audioUrl, audioInput);
    await new Promise((resolve, reject) => {
      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoInput, '-i', audioInput, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', output];
      const process = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = '';
      process.stderr.on('data', chunk => { stderr += chunk.toString(); });
      process.on('error', error => reject(new Error(`FFmpeg 启动失败：${error.message}`)));
      process.on('close', (code, signal) => {
        if (code === 0) return resolve();
        const detail = stderr.trim().slice(-1000) || `退出码=${code || 'null'} 信号=${signal || '无'}`;
        console.error(`[ffmpeg] ${detail}`);
        reject(new Error(`视频和音频合并失败：${detail}`));
      });
    });
  })();
  promise.finally(() => {
    fs.rm(videoInput, { force: true }, () => {});
    fs.rm(audioInput, { force: true }, () => {});
  }).catch(() => {});
  mergedVideos.set(key, { output, promise });
  try {
    await promise;
    mergedVideos.set(key, { output });
    return sendMergedVideo(req, res, output, filename);
  } catch (error) {
    mergedVideos.delete(key);
    fs.rm(output, { force: true }, () => {});
    return res.status(502).send(error.message);
  }
});

app.get('/api/media', async (req, res) => {
  let mediaUrl;
  try {
    mediaUrl = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).send('媒体地址无效。');
  }
  const allowedHost = mediaUrl.hostname.endsWith('.bilivideo.com') || mediaUrl.hostname.endsWith('.bilivideo.cn');
  if (mediaUrl.protocol !== 'https:' || !allowedHost) return res.status(403).send('不支持的媒体地址。');

  try {
    const upstream = await fetch(mediaUrl, {
      headers: {
        Referer: 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!upstream.ok || !upstream.body) return res.status(upstream.status || 502).send('媒体服务器返回失败。');
    res.status(upstream.status);
    const filename = String(req.query.name || 'media').trim() || 'media';
    res.setHeader('Content-Type', upstream.headers.get('content-type') || (filename.endsWith('.m4a') ? 'audio/mp4' : 'video/mp4'));
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', contentDisposition(disposition, filename));
    if (upstream.headers.has('content-length')) res.setHeader('Content-Length', upstream.headers.get('content-length'));
    if (upstream.headers.has('content-range')) res.setHeader('Content-Range', upstream.headers.get('content-range'));
    res.setHeader('Accept-Ranges', 'bytes');
    const reader = upstream.body.getReader();
    res.on('close', () => reader.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(502).send(`媒体转发失败：${error.message}`);
  }
});

app.post('/api/parse', async (req, res) => {
  const sourceUrl = extractUrl(req.body && req.body.url);
  if (!sourceUrl) return res.status(400).json({ message: '请粘贴有效的 B 站分享链接。' });

  let platform;
  try {
    platform = getPlatform(sourceUrl);
  } catch {
    return res.status(400).json({ message: '链接格式不正确，请重新检查。' });
  }
  if (!platform) return res.status(400).json({ message: '暂不支持这个平台，目前仅支持 B 站。' });

  try {
    const info = await runYtDlp(sourceUrl);
    return res.json(normalizeResult(info, platform, sourceUrl));
  } catch (error) {
    return res.status(502).json({ code: 'LOCAL_PARSER_ERROR', platform, sourceUrl, message: error.message });
  }
});

function normalizeBvid(value) {
  const bvid = String(value || '').trim();
  return /^BV[0-9A-Za-z]{10}$/i.test(bvid) ? `BV${bvid.slice(2)}` : null;
}

app.get('/api/bil/video', async (req, res) => {
  const bvid = normalizeBvid(req.query.bvid);
  if (!bvid) return res.status(400).json({ message: '请输入有效的 BV 号。' });

  const sourceUrl = `https://www.bilibili.com/video/${bvid}`;
  try {
    const info = await runYtDlp(sourceUrl);
    return res.json(normalizeResult(info, 'bilibili', sourceUrl));
  } catch (error) {
    return res.status(502).json({ code: 'BILIBILI_PARSE_ERROR', bvid, message: error.message });
  }
});

async function redirectBilVideo(req, res) {
  const [value, legacyQuery = ''] = String(req.params.bvid || '').split('&', 2);
  const bvid = normalizeBvid(value);
  if (!bvid) return res.status(400).send('请输入有效的 BV 号。');
  const page = req.query.p || new URLSearchParams(legacyQuery).get('p');
  if (page && !/^[1-9]\d*$/.test(String(page))) return res.status(400).send('请输入有效的分 P 序号。');

  const sourceUrl = `https://www.bilibili.com/video/${bvid}${page ? `?p=${page}` : ''}`;
  try {
    const info = await runYtDlp(sourceUrl);
    const result = normalizeResult(info, 'bilibili', sourceUrl);
    if (!result.video) return res.status(502).send('没有找到可播放的视频流。');
    const prefix = req.originalUrl.startsWith('/analysis/') || req.headers['x-forwarded-prefix'] === '/analysis' ? '/analysis' : '';
    return res.redirect(302, result.video.startsWith('/api/') ? `${prefix}${result.video}` : result.video);
  } catch (error) {
    return res.status(502).send(`B站视频解析失败：${error.message}`);
  }
}

app.get(['/bil/API=:bvid', '/analysis/bil/API=:bvid'], redirectBilVideo);
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// #region debug-point C:startup
reportDebug('C', 'Linux service startup configuration', { port, host, cwd: process.cwd(), directory: __dirname, ytDlp, ffmpeg, ytDlpExists: fs.existsSync(ytDlp), ffmpegExists: fs.existsSync(ffmpeg), node: process.version, platform: process.platform });
// #endregion

app.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`media-parser-site listening on ${process.env.HOST || '0.0.0.0'}:${port}`);
});

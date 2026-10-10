const form = document.querySelector('#parser-form');
const input = document.querySelector('#url-input');
const parseButton = document.querySelector('#parse-button');
const pasteButton = document.querySelector('#paste-button');
const status = document.querySelector('#status');
const resultPanel = document.querySelector('#result-panel');
const resultContent = document.querySelector('#result-content');
const vrcForm = document.querySelector('#vrc-form');
const vrcUrlInput = document.querySelector('#vrc-bilibili-url');
const vrcPrefixInput = document.querySelector('#vrc-prefix-url');
const vrcError = document.querySelector('#vrc-error');
const vrcResult = document.querySelector('#vrc-result');
const vrcResultText = document.querySelector('#vrc-result-text');
const vrcCopyButton = document.querySelector('#vrc-copy-result');
const apiUrl = (path) => new URL(path, document.baseURI).toString();
const resourceUrl = (path) => path && path.startsWith('/api/') ? apiUrl(path.slice(1)) : path;

async function pasteInto(inputElement) {
  try {
    inputElement.value = await navigator.clipboard.readText();
    inputElement.focus();
  } catch {
    inputElement.focus();
  }
}

document.querySelector('#vrc-paste-url').addEventListener('click', () => pasteInto(vrcUrlInput));
document.querySelector('#vrc-paste-prefix').addEventListener('click', () => pasteInto(vrcPrefixInput));

vrcForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = vrcUrlInput.value.trim();
  const prefix = vrcPrefixInput.value.trim();
  const matchBv = url.match(/BV[a-zA-Z0-9]{10}/);
  const matchP = url.match(/[?&]p=(\d+)/);

  vrcError.textContent = '';
  vrcResult.hidden = true;
  if (!url) {
    vrcError.textContent = '请输入有效的 B 站链接。';
    return;
  }
  if (!matchBv) {
    vrcError.textContent = '未能从链接中提取到 BV 号，请检查链接是否正确。';
    return;
  }
  if (!prefix) {
    vrcError.textContent = '请输入 API 链接。';
    return;
  }

  const link = `${prefix}${matchBv[0]}`;
  vrcResultText.textContent = `${link}${matchP ? `${link.includes('?') ? '&' : '?'}p=${matchP[1]}` : ''}`;
  vrcResult.hidden = false;
});

vrcCopyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(vrcResultText.textContent);
    vrcCopyButton.textContent = '已复制';
  } catch {
    vrcCopyButton.textContent = '复制失败';
  }
  setTimeout(() => { vrcCopyButton.textContent = '复制'; }, 1500);
});

pasteButton.addEventListener('click', async () => {
  try {
    input.value = await navigator.clipboard.readText();
    input.focus();
    status.textContent = '已从剪贴板粘贴内容。';
    status.className = 'status loading';
  } catch {
    input.focus();
    status.textContent = '浏览器未授予剪贴板权限，请手动粘贴。';
    status.className = 'status';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) return;
  parseButton.disabled = true;
  parseButton.querySelector('span').textContent = '解析中…';
  status.textContent = '正在识别链接…';
  status.className = 'status loading';
  resultPanel.hidden = true;

  try {
    const response = await fetch(apiUrl('./api/parse'), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '解析失败');
    const duration = data.duration ? `${Math.floor(data.duration / 60)}分${data.duration % 60}秒` : '未知';
    const downloadUrl = (url) => url ? `${url}${url.includes('?') ? '&' : '?'}download=1` : '';
    const coverUrl = resourceUrl(data.cover);
    const videoUrl = resourceUrl(data.video);
    const audioUrl = resourceUrl(data.audio);
    const coverPreview = coverUrl ? `<img class="cover" src="${escapeHtml(coverUrl)}" alt="视频封面">` : '<div class="cover cover-empty">无封面</div>';
    const coverActions = coverUrl ? `<a class="resource-button" href="${escapeHtml(coverUrl)}" target="_blank" rel="noopener">打开封面 ↗</a><a class="resource-button" href="${escapeHtml(downloadUrl(coverUrl))}" download>下载封面 ↓</a>` : '';
    const videoActions = videoUrl ? `<a class="resource-button" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">打开视频 ↗</a><a class="resource-button" href="${escapeHtml(downloadUrl(videoUrl))}" download>下载视频 ↓</a>` : '';
    const audioActions = audioUrl ? `<a class="resource-button" href="${escapeHtml(audioUrl)}" target="_blank" rel="noopener">打开音频 ↗</a><a class="resource-button" href="${escapeHtml(downloadUrl(audioUrl))}" download>下载音频 ↓</a>` : '';
    resultContent.innerHTML = `<div class="result-grid">${coverPreview}<div><p class="result-title">${escapeHtml(data.title || '解析完成')}</p><p class="result-meta">平台：${escapeHtml(data.platform)}<br>作者：${escapeHtml(data.author || '未知')}<br>时长：${duration}</p><div class="resource-actions">${coverActions}${videoActions}${audioActions}</div></div></div>`;
    resultPanel.hidden = false;
    status.textContent = '解析完成，资源地址由本机解析器生成。';
    status.className = 'status loading';
  } catch (error) {
    status.textContent = error.message;
    status.className = 'status';
  } finally {
    parseButton.disabled = false;
    parseButton.querySelector('span').textContent = '解析链接';
  }
});

document.querySelectorAll('.copy-button[data-copy-target]').forEach(button => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    const text = target ? target.textContent : '';
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = '已复制';
      setTimeout(() => { button.textContent = '复制'; }, 1500);
    } catch {
      button.textContent = '复制失败';
      setTimeout(() => { button.textContent = '复制'; }, 1500);
    }
  });
});

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

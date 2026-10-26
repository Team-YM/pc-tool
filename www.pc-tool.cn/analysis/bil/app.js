const state = document.querySelector('#state');
const video = document.querySelector('#video');
const match = window.location.pathname.match(/API=(BV[0-9A-Za-z]{10})$/i);
const bvid = match ? match[1] : '';



function apiPath() {
  return `/api/bil/video?bvid=${encodeURIComponent(bvid)}`;
}

async function loadVideo() {
  if (!bvid) throw new Error('地址中没有有效的 BV 号。');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  let response;
  try {
    response = await fetch(apiPath(), { signal: controller.signal });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? '视频解析超时，请稍后重试。' : `视频解析请求失败：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '视频解析失败。');
  if (!data.video) throw new Error('没有找到可播放的视频流。');

  video.src = data.video;
  if (data.cover) video.poster = data.cover;
  state.hidden = true;
  video.hidden = false;
}

loadVideo().catch(error => {
  state.textContent = error.message;
  state.className = 'state error';
});

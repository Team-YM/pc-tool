const tokenKey = 'p2p-admin-token';
const apiBase = `${window.location.pathname.replace(/admin\/?$/, '')}admin/api/`;
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem(tokenKey) || '';

function showLogin(message = '') {
  $('login').hidden = false;
  $('dashboard').hidden = true;
  $('loginMsg').textContent = message;
}

function showDashboard(rows) {
  $('login').hidden = true;
  $('dashboard').hidden = false;
  $('banList').replaceChildren();
  if (!rows.length) {
    $('banList').textContent = '暂无记录';
    return;
  }
  rows.forEach(item => {
    const row = document.createElement('div');
    row.className = 'ban-row';
    const info = document.createElement('div');
    const id = document.createElement('strong');
    id.textContent = item.visitorId;
    const detail = document.createElement('small');
    detail.textContent = `失败 ${item.failures} 次，最近：${new Date(item.lastFailure).toLocaleString()}${item.bannedUntil ? `，冷却至 ${new Date(item.bannedUntil).toLocaleString()}` : ''}`;
    info.append(id, detail);
    const button = document.createElement('button');
    button.className = 'unban';
    button.textContent = '解除';
    button.onclick = async () => {
      const response = await fetch(`${apiBase}bans/${encodeURIComponent(item.visitorId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) load();
      else showLogin('登录已失效，请重新输入令牌');
    };
    row.append(info, button);
    $('banList').append(row);
  });
}

async function load() {
  if (!token) return showLogin();
  try {
    const response = await fetch(`${apiBase}bans`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('令牌无效或服务端未配置 ADMIN_TOKEN');
    showDashboard(await response.json());
    $('loginMsg').textContent = '';
  } catch (error) {
    sessionStorage.removeItem(tokenKey);
    token = '';
    showLogin(error.message);
  }
}

$('loginBtn').onclick = () => {
  token = $('token').value.trim();
  sessionStorage.setItem(tokenKey, token);
  load();
};
$('token').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('loginBtn').click();
});
$('refreshBtn').onclick = load;
showLogin();

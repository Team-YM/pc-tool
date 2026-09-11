/* ================= 公共工具脚本 - PC-TOOL ================= */

// ========== 主题同步与初始化 ==========
(function initTheme() {
    try {
        var saved = localStorage.getItem('pctool_theme');
        if (saved === 'light') {
            document.documentElement.classList.add('light-theme');
            if (document.body) {
                document.body.classList.add('light-theme');
            } else {
                document.addEventListener('DOMContentLoaded', function () {
                    document.body.classList.add('light-theme');
                });
            }
        }
    } catch (e) {}

    // 跨页面或同页主题同步监听
    window.addEventListener('storage', function (e) {
        if (e.key === 'pctool_theme') {
            if (e.newValue === 'light') {
                document.documentElement.classList.add('light-theme');
                if (document.body) document.body.classList.add('light-theme');
            } else {
                document.documentElement.classList.remove('light-theme');
                if (document.body) document.body.classList.remove('light-theme');
            }
        }
    });
})();

// ========== 增强粒子背景动画 ==========
(function () {
    var canvas = document.getElementById('bg-canvas');
    if (!canvas) return; // 部分页面没有 canvas 背景
    var ctx = canvas.getContext('2d');
    var W, H, mouseX = -9999, mouseY = -9999;

    function resize() {
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;
    }
    window.addEventListener('resize', resize);
    resize();

    document.addEventListener('mousemove', function (e) { mouseX = e.clientX; mouseY = e.clientY; });
    document.addEventListener('mouseleave', function () { mouseX = -9999; mouseY = -9999; });

    var GS = 8, PS = 6;
    var WORM_COUNT = Math.floor((W * H) / 15000);
    var DUST_COUNT = Math.floor((W * H) / 7000);

    var PALETTE = [
        'rgba(16, 185, 129, ',
        'rgba(6, 182, 212, ',
        'rgba(168, 85, 247, ',
        'rgba(251, 146, 60, ',
        'rgba(236, 72, 153, ',
        'rgba(52, 211, 153, ',
        'rgba(129, 140, 248, ',
        'rgba(250, 204, 21, ',
    ];

    function rpick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ========== 蠕虫 ==========
    var Worm = (function () {
        function W() { this.init(true); }
        W.prototype.init = function (pre) {
            this.x = Math.random() * (W / GS);
            this.y = Math.random() * (H / GS);
            this.angle = Math.random() * Math.PI * 2;
            this.speed = Math.random() * 0.1 + 0.03;
            this.history = [];
            this.maxLen = Math.floor(Math.random() * 65 + 20);
            this.turn = (Math.random() - 0.5) * 0.035;
            this.color = rpick(PALETTE);
            this.glowColor = this.color.replace(')', '').replace('rgba', 'rgba');
            if (pre) { var n = Math.floor(Math.random() * this.maxLen); for (var i = 0; i < n; i++) this.update(true); }
        };
        W.prototype.update = function (isInit) {
            var fa = Math.sin(this.x * 0.035) * Math.cos(this.y * 0.035) * Math.PI * 2;
            var dx = mouseX / GS - this.x, dy = mouseY / GS - this.y;
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d < 35 && d > 0) fa += Math.atan2(dy, dx) * (1 - d / 35) * 0.025;
            this.angle += (fa - this.angle) * 0.018 + this.turn;
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
            var gx = Math.floor(this.x), gy = Math.floor(this.y);
            if (this.history.length === 0 || this.history[this.history.length - 1].x !== gx || this.history[this.history.length - 1].y !== gy) {
                this.history.push({ x: gx, y: gy });
                if (this.history.length > this.maxLen) this.history.shift();
            }
            if (!isInit && (this.x < -15 || this.x > (W / GS) + 15 || this.y < -15 || this.y > (H / GS) + 15)) this.init();
        };
        W.prototype.draw = function (ctx) {
            if (this.history.length < 2) return;
            for (var i = 0; i < this.history.length; i++) {
                var pos = this.history[i], px = pos.x * GS, py = pos.y * GS;
                var alpha = 1, prog = i / this.history.length;
                if (prog > 0.8) alpha = (1 - prog) * 5;
                else if (prog < 0.2) alpha = prog * 5;
                if (i === this.history.length - 1) { ctx.shadowColor = this.glowColor + '0.5)'; ctx.shadowBlur = 5; }
                if (Math.random() > 0.96) alpha *= 0.15;
                ctx.fillStyle = this.color + alpha + ')';
                ctx.fillRect(px, py, PS, PS);
                ctx.shadowBlur = 0;
            }
        };
        return W;
    })();

    // ========== 浮尘粒子 ==========
    var Dust = (function () {
        function D() {
            this.x = Math.random() * W;
            this.y = Math.random() * H;
            this.r = Math.random() * 2.2 + 0.8;
            this.vx = (Math.random() - 0.5) * 0.25;
            this.vy = (Math.random() - 0.5) * 0.25;
            this.alpha = Math.random() * 0.45 + 0.15;
            this.da = (Math.random() - 0.5) * 0.004;
            this.color = rpick(PALETTE);
        }
        D.prototype.update = function () {
            this.x += this.vx; this.y += this.vy;
            this.alpha += this.da;
            if (this.alpha > 0.65 || this.alpha < 0.04) this.da *= -1;
            if (this.x < -10) this.x = W + 10; if (this.x > W + 10) this.x = -10;
            if (this.y < -10) this.y = H + 10; if (this.y > H + 10) this.y = -10;
            var dx = this.x - mouseX, dy = this.y - mouseY;
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d < 70 && d > 0) { this.x += (dx / d) * 0.35; this.y += (dy / d) * 0.35; }
        };
        D.prototype.draw = function (ctx) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = this.color + this.alpha + ')';
            ctx.fill();
        };
        return D;
    })();

    var worms = Array.from({ length: WORM_COUNT }, function () { return new Worm(); });
    var dusts = Array.from({ length: DUST_COUNT }, function () { return new Dust(); });

    window.addEventListener('resize', function () {
        var nc = Math.floor((window.innerWidth * window.innerHeight) / 15000);
        var nd = Math.floor((window.innerWidth * window.innerHeight) / 7000);
        while (worms.length < nc) worms.push(new Worm());
        if (nc < worms.length) worms = worms.slice(0, nc);
        while (dusts.length < nd) dusts.push(new Dust());
        if (nd < dusts.length) dusts = dusts.slice(0, nd);
    });

    function drawConnections() {
        var heads = [];
        for (var i = 0; i < worms.length; i++) {
            if (worms[i].history.length === 0) continue;
            heads.push(worms[i].history[worms[i].history.length - 1]);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.025)';
        ctx.lineWidth = 0.5;
        for (var i = 0; i < heads.length; i++) {
            var hx = heads[i].x * GS + PS / 2, hy = heads[i].y * GS + PS / 2;
            for (var j = i + 1; j < heads.length; j++) {
                var hx2 = heads[j].x * GS + PS / 2, hy2 = heads[j].y * GS + PS / 2;
                var dist = Math.sqrt((hx - hx2) * (hx - hx2) + (hy - hy2) * (hy - hy2));
                if (dist < 90) {
                    ctx.globalAlpha = (1 - dist / 90) * 0.25;
                    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx2, hy2); ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    // 性能优化：提供暂停/恢复接口
    var running = true;
    window._bgAnimPause = function () { running = false; };
    window._bgAnimResume = function () { running = true; };

    function animate() {
        if (!running) { requestAnimationFrame(animate); return; }
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < dusts.length; i++) { dusts[i].update(); dusts[i].draw(ctx); }
        for (var i = 0; i < worms.length; i++) { worms[i].update(); worms[i].draw(ctx); }
        drawConnections();
        requestAnimationFrame(animate);
    }
    animate();
})();


// ========== 工具函数 ==========

/** 格式化文件大小 */
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

/** 下载 Blob/URL */
function downloadFile(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

/** 设置拖拽上传 */
function setupDragDrop(element, onFiles) {
    var events = ['dragenter', 'dragover', 'dragleave', 'drop'];
    events.forEach(function (evt) {
        element.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
        element.addEventListener(evt, function () {
            element.style.background = 'rgba(129, 140, 248, 0.1)';
        });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
        element.addEventListener(evt, function () {
            element.style.background = '';
        });
    });
    element.addEventListener('drop', function (e) {
        var files = e.dataTransfer.files;
        if (files && files.length > 0) onFiles(files);
    });
}

/** 显示 Toast 提示 */
function showToast(message, duration) {
    duration = duration || 2000;
    var toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);padding:10px 22px;background:rgba(0,0,0,0.8);color:#fff;border-radius:8px;font-size:14px;z-index:9999;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);pointer-events:none;opacity:0;transition:opacity 0.3s;';
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.style.opacity = '1'; });
    setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { document.body.removeChild(toast); }, 300);
    }, duration);
}

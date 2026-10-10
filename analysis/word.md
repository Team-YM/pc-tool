# 服务管理说明

## 项目目录

```powershell
cd "C:\Users\cuteFish\Music\ceshi\111\analysis"
```

## 使用 npm 启动服务

### 前台启动

```powershell
npm start
```

启动后访问：

```text
http://localhost:3000/
```

### 停止服务

在运行 `npm start` 的终端中按下：

```text
Ctrl + C
```

### 检查服务

```powershell
Invoke-WebRequest http://localhost:3000/ -UseBasicParsing
```

返回 `StatusCode : 200` 表示服务正常。

## 使用 PM2 管理服务

项目已配置 `ecosystem.config.js`，应用名称为 `media-parser-site`。

### 首次启动

```powershell
pm2 start ecosystem.config.js
```

### 查看运行状态

```powershell
pm2 status
```

### 查看实时日志

```powershell
pm2 logs media-parser-site
```

### 停止服务

```powershell
pm2 stop media-parser-site
```

### 重启服务

```powershell
pm2 restart media-parser-site
```

### 删除 PM2 进程

```powershell
pm2 delete media-parser-site
```

### 保存进程列表

```powershell
pm2 save
```

### 设置开机自启动

```powershell
pm2 startup
```

执行 `pm2 startup` 后，复制并执行命令行输出的注册命令，然后运行：

```powershell
pm2 save
```

### 更新代码后重启

```powershell
cd "C:\Users\cuteFish\Music\ceshi\111\analysis"
pm2 restart media-parser-site --update-env
```

## npm 和 PM2 的区别

| 对比项 | npm | PM2 |
| --- | --- | --- |
| 定位 | Node.js 的包管理器和脚本运行工具 | Node.js 应用进程管理器 |
| 主要用途 | 安装依赖、运行 `package.json` 中的脚本 | 后台运行、守护和管理 Node.js 服务 |
| 启动方式 | `npm start` | `pm2 start ecosystem.config.js` |
| 终端关闭后是否继续运行 | 通常会停止 | 通常会继续运行 |
| 崩溃自动重启 | 默认不提供 | 支持自动重启 |
| 日志管理 | 主要显示在当前终端 | 支持 `pm2 logs` 查看和管理 |
| 开机自启动 | 不负责 | 支持配置 |
| 适用场景 | 本地开发、调试、执行一次性脚本 | 生产环境长期运行服务 |

### 简单理解

- `npm` 负责执行项目命令，例如启动开发服务。
- `PM2` 负责长期管理已经启动的 Node.js 服务。
- 本地调试可以使用 `npm start`。
- 部署到服务器并长期运行时，建议使用 PM2。

### 常用选择

开发调试：

```powershell
npm start
```

生产运行：

```powershell
pm2 start ecosystem.config.js
pm2 save
```

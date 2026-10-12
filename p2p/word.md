1240 1244
# PM2 常用命令

以下命令在 PowerShell 中、项目目录 `C:\Users\cuteFish\Music\p2p传文件` 下执行。

## 配置管理密钥

在当前 PowerShell 窗口设置管理后台密钥：

```powershell
$env:ADMIN_TOKEN = "替换为你的强随机密钥"
```

首次启动和后续重启时，让 PM2 读取当前窗口的环境变量：

```powershell
pm2 start ecosystem.config.js --update-env
```

如果应用已经启动，修改密钥后重新加载环境变量：

```powershell
$env:ADMIN_TOKEN = "替换为你的强随机密钥"
pm2 restart p2p-file-room --update-env
```

注意：环境变量只在当前 PowerShell 窗口及其启动的进程中有效。关闭窗口后，之后启动 PM2 时需要重新设置密钥。也可以在 `ecosystem.config.js` 的 `env` 对象中配置 `ADMIN_TOKEN`，但不要将真实密钥提交到公开代码仓库。

## 启动

```powershell
pm2 start ecosystem.config.js --update-env
```

## 重启

```powershell
pm2 restart p2p-file-room --update-env
```

## 停止

```powershell
pm2 stop p2p-file-room
```

## 删除 PM2 进程

此命令会从 PM2 进程列表中移除应用，不会删除项目文件：

```powershell
pm2 delete p2p-file-room
```

## 查看状态和日志

```powershell
pm2 list
pm2 logs p2p-file-room
```

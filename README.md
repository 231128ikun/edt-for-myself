## ⚠️ 免责声明

本免责声明适用于 GitHub 项目 **“edt-for-myself”**[项目地址](https://github.com/231128ikun/edt-for-myself)。

### 📖 用途说明

本项目仅供**教育、研究和安全测试**目的使用，旨在帮助安全研究人员、学术界人士及技术爱好者探索和实践网络通信技术。

### ⚖️ 法律遵循

使用者在下载或部署本项目时，必须遵守其所在地的相关法律法规。使用者应自行确保其行为的合法性。

### 📄 免责声明内容

1. 作者**不认可、不支持、亦不鼓励**任何非法用途。
2. 如项目被用于违法行为，作者**强烈谴责**，且不承担任何责任。
3. 使用本项目产生的一切后果（包括但不限于法律责任、数据丢失），均由使用者自行承担。
4. 为规避风险，**请在使用后 24 小时内删除项目代码**。

> 使用本项目即视为同意本免责声明。若不同意，请立即停止使用。
> 作者保留对免责声明内容进行更新的权利，恕不另行通知，最新版本将发布于 GitHub 项目页面。


## 🚀 快速部署

### 1. 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/231128ikun/edt-for-myself)

### 2. 手动部署

1. 复制 [_worker.js](https://github.com/231128ikun/edt-for-myself/blob/main/_worker.js) 代码
2. 在 Cloudflare Workers 控制台创建新的 Worker
3. 粘贴代码并保存
4. 可选：配置环境变量（见下方配置说明）

（ps.也可以将_woker.js打包成zip文件，上传pages部署。pages部署分配的域名大多数地区都没被墙，但是pages部署每一次修改变量要重新上传部署才生效，这一点要记住。当然也可以fork本项目，连接github部署，同样的每一次修改变量也需要重试部署）

## ⚙️ 环境变量配置

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `USERID` | ❌ | `ikun` | 订阅路径的用户 ID |
| `UUID` | ❌ | `4ba0eec8-25e1-4ab3-b188-fd8a70b53984` | VLESS 用户 UUID |
| `NODE_NAME` | ❌ | `IKUN-vless` | 节点名称 |
| `URL` | ❌ | `example.com` | 非 WebSocket 请求的回退地址 |
| `BESTIPS` | ❌ | 见下方 | 优选 IP 列表 |
| `PROXYIP` | ❌ | - | 代理 IP，格式：`host:port` |
| `SOCKS5` | ❌ | - | SOCKS5 格式：socks5://user:pass@host:port |
| `GSOCKS5` | ❌ | `false` | 全局 SOCKS5 开关 |

（ps.当socks5与proxyip同时设置时，则优先使用socks5）

#### 默认 BESTIPS 列表
```
ip.sb
www.visa.com
developers.cloudflare.com
ikun.glimmer.cf.090227.xyz
```

## 📋 使用方法

### 获取订阅链接

访问以下 URL 获取节点订阅：

```
https://your-worker-domain.workers.dev/YOUR_USERID
```

支持URL修改参数

```
https://your-worker-domain.workers.dev/YOUR_USERID?proxyip=1.2.3.4:443&s5=...
```

支持的格式有

| 参数 | 说明 | 示例 |
|------|------|------|
| `proxyip` | 临时代理 IP | `?proxyip=1.1.1.1:443` |
|  `socks5` | SOCKS5 代理 | `?s5=user:pass@host:1080/?socks5=...` |
|  `gsocks5` | 全局 SOCKS5 | `?gs5=user:pass@host:1080/?gsocks5=...` |
|  `gsocks5` | 全局 SOCKS5 | `?s5=user:pass@host:1080&gsocks5=true` |

（返回格式为纯文本，每行一个 `vless://` 链接）

支持path修改参数
如：

SOCKS5 配置格式：

```bash
/user:pass@host:port
/socks5://user:pass@host:port  
/socks://user:pass@host:port
/socks://dXNlcjpwYXNzd29yZA==@host:port
/?s5=socks5://user:pass@host:port 或/?socks5=...

全局socks5
/?gs5=...或/?gsocks5=...或/?s5=...&gsocks5=true

```
proxyip

```
/?proxyip=1.2.3.4:443
```
组合
```
/?proxyip=1.2.3.4:443&s5=...
```
格式可参考URL参数修改


## 🔒 安全说明

- UUID 验证确保访问安全
- TLS 加密保证传输安全
- CF Workers 沙盒提供运行时安全
- 无日志记录，保护用户隐私

## 🐛 故障排除

### 连接失败
1. 检查 UUID 是否正确
2. 确认客户端 WebSocket 配置
3. 尝试不同的优选IP
4. 检查防火墙和网络环境

### 配置错误
1. 验证环境变量格式
2. 确认域名解析正常
3. 检查代理IP可用性

### 自定义域名

1. 在 Worker 页面点击 `Triggers`
2. 添加自定义域名
3. 在 DNS 设置中添加 CNAME 记录

## 🔒 安全建议

- ⚠️ 定期更换 UUID 和 USER_ID
- 🔑 使用强密码作为 USER_ID
- 📊 监控 Workers 分析面板
- 🚫 不要公开分享你的配置信息

**注意**: 请确保遵守 Cloudflare 服务条款，合理使用免费额度。

## 🙏 致谢

- [Cloudflare Workers](https://workers.cloudflare.com/) - 提供免费的边缘计算服务
- [CMLiussss](https://github.com/cmliu/edgetunnel) - 参考大佬的代码
- [kuangbao](https://github.com/Meibidi/kuangbao)- 以大佬的代码为模板ai修改出的本项目

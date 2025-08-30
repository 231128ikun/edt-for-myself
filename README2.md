


## 🚀 快速部署

### 1. 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/231128ikun/edt-for-myself)

### 2. 手动部署

1. 复制 [_worker.js](https://github.com/231128ikun/edt-for-myself/blob/main/_worker.js) 代码
2. 在 Cloudflare Workers 控制台创建新的 Worker
3. 粘贴代码并保存
4. 可选：配置环境变量（见下方配置说明）

## ⚙️ 环境变量配置

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `USER_ID` | 用户ID（访问路径） | `123456` | `abc123` |
| `UUID` | VLESS UUID | `aaa6b096-...` | 自定义UUID |
| `BEST_IPS` | CF优选IP列表 | `developers.cloudflare.com` | 多行IP列表 |
| `PROXY_IP` | 反代IP地址 | `sjc.o00o.ooo:443` | `proxy.com:443` |
| `ENABLE_NAT64` | 启用NAT64转换 | `false` | `true` |
| `NODE_NAME` | 节点名称 | `CF-vless` | `我的节点` |

### 多IP配置示例

```
BEST_IPS=
1.1.1.1
8.8.8.8
9.9.9.9
```

## 📖 使用方法

### 访问管理面板
```
https://your-worker.workers.dev/123456
```

### 获取订阅链接
```
https://your-worker.workers.dev/123456/vless
```

### 动态修改代理IP
```
https://your-worker.workers.dev/123456?proxyip=new.proxy.com:443
```

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



**注意**：本项目仅供学习和研究使用，请遵守当地法律法规。

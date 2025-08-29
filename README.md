# VLESS Proxy for Cloudflare Workers

一个部署在 Cloudflare Workers 上的轻量级 VLESS 代理服务，带有美观的 Web 管理界面。

## 🚀 快速开始

### 1. 部署到 Cloudflare Workers

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 `Workers & Pages` → `Create Application` → `Create Worker`
3. 复制 [_worker.js](https://github.com/231128ikun/edt-for-myself/blob/main/_worker.js) 代码到编辑器
4. 点击 `Save and Deploy`

### 2. 配置环境变量

在 Worker 设置页面，添加以下环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `USER_ID` | 访问密钥 | `my-secret-key` |
| `UUID` | VLESS UUID | `5aba5b77-48eb-4ae2-b60d-5bfee7ac169e` |
| `NODE_NAME` | 节点名称 | `CF-Worker` |
| `PROXY_IPS` | 代理IP列表 | `1.1.1.1` |
| `FALLBACK_PROXY` | 备用代理 | `sjc.o00o.ooo:443` |
| `ENABLE_FALLBACK` | 启用备用代理 | `true` |
| `ENABLE_NAT64` | 启用NAT64 | `false` |

### 3. 获取订阅链接

访问管理界面：
```
https://your-worker.workers.dev/[USER_ID]
```

订阅地址：
```
https://your-worker.workers.dev/[USER_ID]/vless
```

### 自定义域名

1. 在 Worker 页面点击 `Triggers`
2. 添加自定义域名
3. 在 DNS 设置中添加 CNAME 记录

## 🔒 安全建议

- ⚠️ 定期更换 UUID 和 USER_ID
- 🔑 使用强密码作为 USER_ID
- 📊 监控 Workers 分析面板
- 🚫 不要公开分享你的配置信息

## ⚖️ 免责声明

本项目仅供学习交流使用，请遵守当地法律法规。使用本项目所产生的任何后果由使用者自行承担。

## 📄 许可证

MIT License

---

**注意**: 请确保遵守 Cloudflare 服务条款，合理使用免费额度。

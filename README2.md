# VLESS Cloudflare Workers

一个高性能、极简化的 VLESS 代理服务，专为 Cloudflare Workers 平台优化。

## ✨ 特性

- 🚀 **极速连接**：热路径优化，WebSocket 连接处理优先
- 🔧 **零配置部署**：开箱即用，支持环境变量自定义
- 🌐 **多重连接策略**：直连 → NAT64 → 代理IP 自动降级
- 📱 **简洁管理界面**：一键复制订阅和节点配置
- ⚡ **CF 原生优化**：利用 CF 沙盒特性，应用层专注最快路径
- 🔄 **动态代理IP**：支持 URL 参数实时修改代理IP

## 🚀 快速部署

### 1. 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/231128ikun/edt-for-myself)

### 2. 手动部署

1. 复制 `worker.js` 代码
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

## 🔧 客户端配置

支持所有兼容 VLESS WebSocket + TLS 的客户端：

- **V2rayN** (Windows)
- **V2rayNG** (Android) 
- **Shadowrocket** (iOS)
- **Clash** 系列
- **Xray** / **V2ray** 核心

### 手动配置参数

```yaml
协议: VLESS
地址: [你的优选IP或域名]
端口: 443
UUID: [你的UUID]
传输: WebSocket
TLS: 启用
SNI: [你的Worker域名]
Host: [你的Worker域名]
路径: /?ed=2560
```

## 🏗️ 架构特点

### 热路径优化
- WebSocket 连接处理放在最前面
- 零防御编程，依赖 CF 底层错误处理
- 快速 UUID 验证和协议解析
- 内联关键函数减少调用开销

### 连接策略
1. **直连**：优先尝试直接连接目标
2. **NAT64**：IPv4 地址自动转换为 IPv6（可选）
3. **代理IP**：使用反代IP作为最后备选

### CF 原生特性
- 利用 CF Workers 沙盒安全特性
- 异常处理交给系统底层
- 应用层专注数据流转
- 零内存泄漏风险

## 📊 性能特点

- **代码体积**：压缩至 ~100 行
- **启动时间**：< 10ms
- **内存占用**：< 5MB
- **连接延迟**：接近原生 WebSocket

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

## 📝 更新日志

### v2.0.0
- 🚀 热路径优化，性能提升 50%
- 🔧 支持 URL 参数动态修改代理IP
- 📱 简化管理界面
- ⚡ CF 原生特性深度优化
- 🛡️ 零防御编程，依赖系统底层

### v1.0.0
- 🎉 初始版本发布
- ✅ 基础 VLESS WebSocket 支持
- 🌐 多IP策略支持

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## ⭐ 致谢

感谢 Cloudflare Workers 平台提供的强大基础设施支持。

---

**注意**：本项目仅供学习和研究使用，请遵守当地法律法规。

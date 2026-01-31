# VLESS over WebSocket Cloudflare Worker

## 主要功能

- ✅ VLESS over WebSocket 协议支持
- ✅ 支持直连、SOCKS5 代理、HTTP 代理多种连接方式
- ✅ 智能 fallback 机制：直连失败时自动切换到备用代理
- ✅ 支持全局 SOCKS5 模式（强制所有流量走代理）
- ✅ DNS-over-HTTPS 支持
- ✅ 订阅服务支持（可通过参数切换订阅器）
- ✅ TXT 记录解析支持动态代理列表

## 部署说明

1. 将 `_worker.js` 复制到 Cloudflare Workers/同样支持`snippets`(自行找教程)
2. 根据需求修改配置区参数（UUID、代理地址等）
3. 部署并设置自定义域名
4. 配置客户端使用 WebSocket 连接

## 1. 使用说明

### 1.1 订阅链接
```
https://<部署的域名>/<uid的值>
```

可通过 `?sub=sub.cmliussss.net` 快速切换订阅器，例如：
```
https://your-worker.domain/ikun?sub=sub.cmliussss.net
```

### 1.2 手动配置节点格式
```
vless://@<优选域名或ip>:<端口>?encryption=none&security=tls&sni=<部署的域名>&type=ws&host=<部署的域名>&path=<路径>#<备注>
```

### 1.3 连接逻辑
- **普通模式**：直连 → SOCKS5代理（如果有） → Fallback代理
- **全局模式**：所有流量强制通过指定的SOCKS5代理

## 2. 配置参数说明

| 参数     | 说明                           | 示例 |
| ------ | ---------------------------- | ------ |
| `U`    | UUID（必须为标准 VLESS UUID） | `aaa6b096-1165-4bbe-935c-99f4ec902d02` |
| `P`    | fallback 代理 IP:Port（直连失败时使用） | `example.com:443` |
| `S5`   | SOCKS5/HTTP 代理地址 | `socks5://user:pass@host:port` 或 `http://user:pass@host:port`）|
| `GS5`  | 是否启用全局 SOCKS5 模式 | `false` |
| `sub`  | 默认订阅器地址 | `sub.glimmer.hidns.vip` |
| `uid`  | 订阅路径标识 | `ikun` |

**说明**：
- `P` 参数支持 `txt@domain` 格式，自动解析TXT记录中的代理列表
- `S5` 参数同时支持 SOCKS5 和 HTTP CONNECT 代理
- TXT记录缓存时间为5分钟（300,000毫秒）

## 3. 路径参数使用示例

你可以在客户端（V2Ray / Clash 等）里配置 WebSocket 的 path 参数，支持以下格式：

### 3.1 只使用默认配置
```
/ 或 /?ed=2560
```
表示完全使用 Worker 文件顶部定义的 P, S5, GS5 参数。

### 3.2 自定义 fallback 代理 IP
```
/?p=fra.o00o.ooo:443
```
会临时覆盖顶部 const P，直连失败后走该新代理。

### 3.3 指定 SOCKS5 代理
```
/?s5=user:pass@1.2.3.4:1080
```
表示仅启用指定 SOCKS5 作为备用代理。

### 3.4 全局 SOCKS5 模式
```
/?s5=1.2.3.4:1080&gs5=1
```
即使直连可用，也会强制通过 SOCKS5（gs5=1 或 gs5=true）。

### 3.5 多参数组合
```
/?p=fra.o00o.ooo:443&s5=user:pass@1.2.3.4:1080&gs5=false
```

低调使用

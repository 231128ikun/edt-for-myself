1.简要的使用说明

 a、订阅链接：https://<部署的域名>/<uid的值>(也可以通过?sub=sub.cmliussss.net快速切换订阅器）
 
 b、手搓节点格式：
 
   vless://@<优选域名或ip>:<端口>?encryption=none&security=tls&sni=<部署的域名>&type=ws&host=<部署的域名>&path=<路径>#<备注>
 
  c、连接逻辑
  
   (1)直连--> s5(如果有） --> p
   
   (2)全局：所有流量转发s5（也就是固定节点）

2.代码中的参数说明

| 参数     | 说明                           |
| ------ | ---------------------------- |
| `U`    | UUID（必须为标准 VLESS UUID）       |
| `P`    | fallback 代理 IP:Port（直连失败时使用） |
| `S5`   | SOCKS5 地址，可留空,兼容http                |
| `GS5`  | 是否启用全局 SOCKS5 模式             |
| `VER`  | 仅作版本区分，无实际逻辑影响               |

3.你可以在客户端（V2Ray / Clash 等）里配置 WebSocket 的 path，像这样：

🔹 示例 1：只使用默认配置
/或/?ed=2560


表示完全使用 Worker 文件顶部定义的 P, S5, GS5 参数。

🔹 示例 2：自定义 fallback 代理 IP
/?p=fra.o00o.ooo:443


会临时覆盖顶部 const P，直连失败后走该新代理。

🔹 示例 3：指定 SOCKS5 代理
/?s5=user:pass@1.2.3.4:1080


表示仅启用指定 SOCKS5 作为备用代理。

🔹 示例 4：全局 SOCKS5 模式（强制所有连接走 SOCKS5）
/?s5=1.2.3.4:1080&gs5=1


即使直连可用，也会强制通过 SOCKS5。

🔹 示例 5：多参数组合
/?p=fra.o00o.ooo:443&s5=user:pass@1.2.3.4:1080&gs5=false


可同时指定多个参数，系统自动解析优先级。

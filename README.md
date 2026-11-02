# 标准辊密封生成 Web

**服务器计算正式版：1.0.0** · Linux amd64 / arm64

通过网页参数表或 CSV 批量管理尺寸，由服务器调用随包提供的 SolidCraft CLI 完成建模和工程出图。浏览器无需下载 WASM 计算引擎。

[下载 Web 1.0.0](https://github.com/EventHorizon-13/solidcraft-roller-seal/releases/tag/web-1.0.0) · [页面使用说明](docs/web-ui.md) · [全部发行版](https://github.com/EventHorizon-13/solidcraft-roller-seal/releases)

## 功能

- 快速输出 DXF、PDF，或选择 DXF、STEP、PDF、列表 CSV 打包项目 ZIP。
- 手机、桌面按可用高度显示参数表；浅深色主题跟随系统。
- 标题旁显示前端构建号与当前后端版本。
- API Key 弹窗与浏览器记忆，独立参数检查、实际阶段进度、取消与结果下载。
- 包含自包含 .NET 程序、官方 SolidCraft 0.28.0 CLI、Node.js/PDF 渲染器和开源字体。

## 部署

下载对应 CPU 架构的压缩包，解压到持久数据盘，进入解压目录：

```bash
export ROLLERSEAL_WEB_TOKEN='替换为你生成的足够长的随机密钥'
export ASPNETCORE_URLS='http://127.0.0.1:18120'
./standard-roller-seal-web
```

通过 HTTPS 反向代理访问上述回环端口，在网页弹窗中输入同一个密钥。所有 API 沿用 `X-RollerSeal-Token` 鉴权；不配置密钥时仅允许回环访问。反向代理不要向匿名请求自动注入密钥，API 应禁用缓存。需要上传资源时，请求体限制至少设为 24 MiB。

程序在运行目录的 `WebData` 保存任务与资源。升级前备份并保留该目录，再更换程序和配套文件。字体和图框只使用你有权使用的文件。

## 版本与许可

Web 正式版使用 `web-*` 标签；Windows 桌面版使用 `win-*` 标签。内置第三方组件的许可随部署包提供，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

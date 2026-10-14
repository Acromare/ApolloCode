# 发布版本更新通知

公开更新源：https://github.com/Acromare/ApolloCode 。

Apollo Code 0.6.1 起采用更新通知和手动下载安装：启动约 10 秒后检查，运行期间每 6 小时检查。有稳定新版时显示版本和更新说明，提供下载更新与稍后提醒。自动提醒等待当前 Agent 或工作流结束；稍后提醒暂停当前版本通知 24 小时，发布更高版本则重新提示。

用户点击下载更新，会在默认浏览器打开对应 GitHub Release，从附件下载安装包后自行安装。软件不会后台下载安装包，不会自动安装或退出重启。设置中的更新页面保留手动检查和下载入口。

发布步骤：

1. 更新 package.json 与 lock 文件的版本，运行构建和测试。
2. 运行 node scripts/build-release.cjs。有真实签名配置时使用 --signed（见 SIGNING.md）。
3. 发布同版本的源码、标签与公开稳定 Release，填写面向用户的更新说明。
4. 上传安装包、构建生成的 .exe.blockmap 和 latest.yml。通知检查读取版本信息，用户实际下载通过 Release 页面完成。

0.7.1 起使用 GitHub 稳定 Release API 获取版本和说明，无需先下载 Atom 或 latest.yml；请求最多等待 12 秒，使用 Chromium 系统代理与 Node 备用连接。检查失败时仍可打开下载页。关闭软件或两个通道均无法联网时无法收到通知，下次启动或手动检查会重试。

旧版 0.6.1 / 0.7.0 的更新检查可能受 GitHub 发布页连接超时影响，需要手动安装 0.7.1 一次才能获得修复。版本号不同的公开安装包不得覆盖复用。

当前没有签名证书或服务，安装包仍未签名。不要把 GitHub Token 或用户模型密钥打入安装包。

## 0.8.2 源码构建

安装 Node 依赖后运行 `npm test` 和 `npm run build`。Windows x64 打包需要 Python 3.14。
先执行 `python scripts/prepare-hermes-environment.py work/hermes-build-venv`，
再执行 `work/hermes-build-venv/Scripts/python.exe scripts/stage-hermes-python.py work/hermes-python-0.8.0`。
环境和依赖由随源码提供的 Hermes PM 按锁文件准备。
随后运行 `node scripts/build-release.cjs`，默认输出到 `release/`；
也可设置 `APOLLO_RELEASE_DIR=release-0.8.2`。
安装包不包含用户数据或密钥。源码包应与发布标签一致，并包含许可证与构建脚本。

# GitHub Releases 更新

公开源：https://github.com/Acromare/ApolloCode 。0.5.0 已发布。

1. 修改 package.json 版本并同步 lock 文件，运行构建和测试。
2. 运行 node scripts/build-release.cjs；有真实签名配置时使用 --signed（见 SIGNING.md）。
3. 发布对应版本源码和标签；标签 CI 可构建发布，本地构建不会自动上传。
4. 同时上传本次构建的安装包、.exe.blockmap 和 latest.yml；不得修改安装包后复用旧哈希。
5. 0.5.0 及以上可检查更新，用户批准下载，再批准退出安装。0.4.0 需手动安装一次。

scripts/update-download-smoke.cjs 使用真实 NsisUpdater 和隔离的 0.5.0 版本适配器验证检测、下载和 SHA512；--public 检查真实 GitHub 源。不调用安装、不修改已有应用或注册表，此检查不能替代完整安装与重启验证。

当前没有签名证书或服务，安装包未签名；下载哈希不等于发布者签名。不得将 GitHub Token 或用户模型密钥打入安装包。

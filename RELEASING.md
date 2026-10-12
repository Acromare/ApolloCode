# GitHub Releases 更新

更新源固定为 https://github.com/Acromare/ApolloCode 。

1. 将本源码推送到仓库，包括 `.github/workflows/release.yml`。
2. 修改 `package.json` 版本并运行 `npm install --package-lock-only`。
3. 推送对应版本标签，例如 `v0.5.0`。标签必须与 package.json 一致。
4. Windows Actions 构建后发布安装包、`.exe.blockmap`、`latest.yml`。
5. 用户安装 0.5.0 后，启动检查稳定版更新；设置 > 更新可手动检查、确认下载、确认重启安装。

本地构建不会自动上传。手动发布时，必须一起上传构建生成的三个文件，不要手写 SHA512 或修改安装包后复用旧 latest.yml。
仓库和 Releases 必须公开，否则客户端需要另行设计私有分发认证，不能把 GitHub Token 内置进 EXE。

下载校验由 electron-updater 处理。当前安装包未签名，哈希不是发布者数字签名；请保护 GitHub 账户并在正式公开分发前配置代码签名。
旧 0.4.0 没有更新器，不能自动升级到 0.5.0，需要安装新版一次。
尚未向此仓库推送源码或发布；真实跨版本更新需要两个公开版本才能验证。

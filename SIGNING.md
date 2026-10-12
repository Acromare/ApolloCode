# 正式 Windows 签名

未取得证书或云签名服务时，普通构建会生成未签名安装包。`npm run make:signed` 在缺少签名配置时会失败，不会生成自签名或伪装已签名的文件。

配置一种方式后执行 `npm run make:signed`：

- PFX：在本机环境或 CI Secrets 设置 `CSC_LINK`（PFX 路径或 base64）和 `CSC_KEY_PASSWORD`。不要写入仓库。
- Azure Trusted Signing：设置 `APOLLO_AZURE_SIGNING_JSON`，包含 `publisherName`、`endpoint`、`certificateProfileName`、`codeSigningAccountName`；Microsoft Entra 认证使用 Azure 环境凭证。
- 其他云签名：设置 `APOLLO_SIGN_HOOK` 为本机 electron-builder 签名 Hook 路径，并设置证书的 `APOLLO_PUBLISHER_NAME`。Hook 负责调用签名服务，认证由本机环境或 CI Secrets 提供。

签名构建会启用 SHA256 和可信时间戳，打包后验证主程序与安装包的 Authenticode 签名。更新包同时检查发布者签名与下载哈希。签名失败会终止构建；签名后生成的 `latest.yml` 和 `.blockmap` 必须与安装包一起发布。

目前用户没有证书或签名服务，因此本次发布保持未签名，真实签名过程尚未执行。

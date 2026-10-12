param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
$resolved=(Resolve-Path -LiteralPath $Target).Path
$signature=Get-AuthenticodeSignature -LiteralPath $resolved
if($signature.Status -ne 'Valid'){throw ('签名校验失败：'+$signature.Status)}
if(!$signature.TimeStamperCertificate){throw '签名缺少可信时间戳'}
if($env:APOLLO_PUBLISHER_NAME -and $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -ne $env:APOLLO_PUBLISHER_NAME){throw '签名发布者不匹配'}
Write-Output ('PASS: 有效发布者签名与时间戳 '+[IO.Path]::GetFileName($resolved))

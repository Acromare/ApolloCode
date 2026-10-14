param([Parameter(Mandatory=$true)][long]$Handle)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ApolloWindowMetadata {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder text,int length);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT rect);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$windowHandle = [ApolloWindowMetadata]::GetWindow([IntPtr]::new($Handle),2)
for ($i = 0; $i -lt 100 -and $windowHandle -ne [IntPtr]::Zero; $i++) {
 if ([ApolloWindowMetadata]::IsWindowVisible($windowHandle)) {
  $title = [System.Text.StringBuilder]::new(1024)
  [void][ApolloWindowMetadata]::GetWindowText($windowHandle,$title,1024)
  if ($title.Length -gt 0) {
   [uint32]$windowProcessId = 0
   [void][ApolloWindowMetadata]::GetWindowThreadProcessId($windowHandle,[ref]$windowProcessId)
   $rect = [ApolloWindowMetadata+RECT]::new()
   [void][ApolloWindowMetadata]::GetWindowRect($windowHandle,[ref]$rect)
   $processName = (Get-Process -Id $windowProcessId -ErrorAction SilentlyContinue).ProcessName
   @{window=@{app=$processName;title=$title.ToString();id=$windowHandle.ToInt64().ToString();bounds=@{x=$rect.Left;y=$rect.Top;width=$rect.Right-$rect.Left;height=$rect.Bottom-$rect.Top}};frontmost=([ApolloWindowMetadata]::GetForegroundWindow() -eq $windowHandle);platform='win32'} | ConvertTo-Json -Depth 4 -Compress
   exit 0
  }
 }
 $windowHandle = [ApolloWindowMetadata]::GetWindow($windowHandle,2)
}
@{window=$null;platform='win32';note='No visible window below Apollo.'} | ConvertTo-Json -Compress

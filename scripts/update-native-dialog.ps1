param([int]$TargetPid, [string]$Screenshot, [string]$Button)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ApolloDialogCapture {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
'@
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $TargetPid)
$deadline = [DateTime]::UtcNow.AddSeconds(40)
$observed = @()
while ([DateTime]::UtcNow -lt $deadline) {
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
  foreach ($window in $windows) {
    $controls = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @($controls | ForEach-Object { $_.Current.Name })
    $observed += @{ window=$window.Current.Name; class=$window.Current.ClassName; names=$names }
    if (-not ($names -match '^Apollo Code 0\.7\.1')) { continue }
    $target = $null
    for ($index=0; $index -lt $controls.Count; $index++) {
      $element = $controls[$index]
      if ($element.Current.Name -eq $Button -and $element.Current.ControlType.Id -eq 50000) { $target=$element; break }
    }
    if (-not $target) { continue }
    $nativeDialog = $window
    for ($index=0; $index -lt $controls.Count; $index++) {
      $element=$controls[$index]
      if ($element.Current.Name -like 'Apollo Code *' -and $element.Current.ControlType.Id -eq 50032) { $nativeDialog=$element; break }
    }
    $bounds = $nativeDialog.Current.BoundingRectangle
    if ($bounds.Width -lt 1 -or $bounds.Height -lt 1) { continue }
    $bitmap = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $hdc=$graphics.GetHdc()
      try { if (-not [ApolloDialogCapture]::PrintWindow([IntPtr]$nativeDialog.Current.NativeWindowHandle,$hdc,2)) { throw 'Dialog screenshot failed' } }
      finally { $graphics.ReleaseHdc($hdc) }
      $bitmap.Save($Screenshot, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    $invoke = $null
    if ($target.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invoke)) { $invoke.Invoke() }
    else { throw ('Native button does not support InvokePattern: '+$target.Current.ControlType.ProgrammaticName) }
    @{ ok=$true; button=$Button; names=$names; screenshot=$Screenshot } | ConvertTo-Json -Compress
    exit 0
  }
  Start-Sleep -Milliseconds 200
}
$observed | Select-Object -Last 6 | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 ($Screenshot+'.diagnostics.json')
throw ('Native update dialog button was not found within 40 seconds: '+$Button)

param([int]$TargetPid, [string]$Screenshot, [string]$Button)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Drawing
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $TargetPid)
$deadline = [DateTime]::UtcNow.AddSeconds(40)
while ([DateTime]::UtcNow -lt $deadline) {
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
  foreach ($window in $windows) {
    $controls = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @($controls | ForEach-Object { $_.Current.Name })
    if (-not ($names -contains 'Apollo Code 0.7.1 已发布')) { continue }
    $target = $controls | Where-Object { $_.Current.Name -eq $Button -and $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button } | Select-Object -First 1
    if (-not $target) { continue }
    $bounds = $window.Current.BoundingRectangle
    if ($bounds.Width -lt 1 -or $bounds.Height -lt 1) { continue }
    $bitmap = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $bitmap.Size)
      $bitmap.Save($Screenshot, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    @{ ok=$true; button=$Button; names=$names; screenshot=$Screenshot } | ConvertTo-Json -Compress
    exit 0
  }
  Start-Sleep -Milliseconds 200
}
throw 'Native update dialog was not found within 40 seconds.'

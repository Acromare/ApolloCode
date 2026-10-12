$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [Windows.Automation.AutomationElement]::RootElement
Add-Type -AssemblyName UIAutomationClientsideProviders
[Windows.Automation.ClientSettings]::RegisterClientSideProviderAssembly([Reflection.AssemblyName]::new('UIAutomationClientsideProviders, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35'))
$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
function Window-Element {
    $element = [Windows.Automation.AutomationElement]::FromHandle([IntPtr]([long]$request.handle))
    if (!$element -or $element.Current.ProcessId -ne [int]$request.pid) { throw 'Window identity changed' }
    return $element
}
function Controls($window) {
    $walker = [Windows.Automation.TreeWalker]::ControlViewWalker
    $queue = [Collections.Generic.Queue[Windows.Automation.AutomationElement]]::new()
    $queue.Enqueue($window)
    $result = [Collections.Generic.List[object]]::new()
    $visited = 0
    while ($queue.Count -gt 0 -and $visited -lt 160) {
        $item = $queue.Dequeue(); $visited++
        if (!$item.Current.IsPassword) { $result.Add($item) }
        $child = $walker.GetFirstChild($item)
        $siblings = 0
        while ($child -and $siblings -lt 160 -and $queue.Count -lt 160) {
            $queue.Enqueue($child); $child = $walker.GetNextSibling($child); $siblings++
        }
    }
    return $result
}
try {
    if ($request.action -eq 'windows') {
        $items = $root.FindAll([Windows.Automation.TreeScope]::Children,[Windows.Automation.Condition]::TrueCondition)
        $output = @($items | Select-Object -First 60 | ForEach-Object {
            if ($_.Current.NativeWindowHandle -ne 0 -and ![string]::IsNullOrWhiteSpace($_.Current.Name)) {
                @{handle=[string]$_.Current.NativeWindowHandle;pid=$_.Current.ProcessId;name=$_.Current.Name}
            }
        })
    } else {
        $window = Window-Element
        $controls = @(Controls $window)
        if ($request.action -eq 'snapshot') {
            $output = @($controls | ForEach-Object {
                @{id=($_.GetRuntimeId() -join '-');name=$_.Current.Name;role=$_.Current.ControlType.ProgrammaticName;enabled=$_.Current.IsEnabled}
            })
        } else {
            $target = $controls | Where-Object { ($_.GetRuntimeId() -join '-') -eq $request.id } | Select-Object -First 1
            if (!$target -or $target.Current.IsPassword -or !$target.Current.IsEnabled -or $target.Current.IsOffscreen) { throw 'Control unavailable or protected' }
            if ($request.action -eq 'click') {
                $pattern = $target.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
                $pattern.Invoke()
            } elseif ($request.action -eq 'type') {
                $pattern = $target.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
                if ($pattern.Current.IsReadOnly) { throw 'Control is read-only' }
                $pattern.SetValue([string]$request.text)
            } else { throw 'Unknown action' }
            $output = @{ok=$true}
        }
    }
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    ConvertTo-Json -InputObject $output -Depth 5 -Compress
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}

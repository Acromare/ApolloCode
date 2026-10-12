Add-Type -AssemblyName System.Windows.Forms
$form = [Windows.Forms.Form]::new()
$form.Text = 'Apollo Native Test'
$form.Width = 400
$form.Height = 220
$form.Opacity = 0
$form.ShowInTaskbar = $false
$textbox = [Windows.Forms.TextBox]::new()
$textbox.AccessibleName = 'ApolloInput'
$textbox.Location = [Drawing.Point]::new(20,20)
$button = [Windows.Forms.Button]::new()
$button.Text = 'ApolloApply'
$button.Location = [Drawing.Point]::new(20,60)
$label = [Windows.Forms.Label]::new()
$label.Text = 'ready'
$label.Width = 300
$label.Location = [Drawing.Point]::new(20,100)
$button.Add_Click({$label.Text = 'clicked ' + $textbox.Text})
$form.Controls.AddRange(@($textbox,$button,$label))
$form.Add_Shown({[Console]::WriteLine((@{handle=[string]$form.Handle.ToInt64();pid=$PID}|ConvertTo-Json -Compress))})
$timer = [Windows.Forms.Timer]::new()
$timer.Interval = 30000
$timer.Add_Tick({$form.Close()})
$timer.Start()
[Windows.Forms.Application]::Run($form)

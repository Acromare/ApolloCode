$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
public static class ApolloVisual {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int left,top,right,bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int x,y;}
 [StructLayout(LayoutKind.Sequential)] struct Mouse {public int dx,dy;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct Key {public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Explicit)] struct Union {[FieldOffset(0)]public Mouse mouse;[FieldOffset(0)]public Key key;}
 [StructLayout(LayoutKind.Sequential)] struct Input {public uint type;public Union u;}
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from,uint to,bool attach);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flag);
 [DllImport("user32.dll")] static extern int GetSystemMetrics(int n);
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n,Input[] values,int size);
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 static IntPtr authorized;
 public static void Focus(long handle){
   IntPtr target=new IntPtr(handle);uint pid;uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out pid),current=GetCurrentThreadId();bool attached=false;
   try{if(foreground!=0&&foreground!=current)attached=AttachThreadInput(current,foreground,true);BringWindowToTop(target);SetForegroundWindow(target);}finally{if(attached)AttachThreadInput(current,foreground,false);}
   Thread.Sleep(150);if(GetForegroundWindow()!=target)throw new Exception("Could not focus authorized window; foreground="+GetForegroundWindow().ToInt64()+", target="+handle+". Activate manually or check desktop/elevation");authorized=target;
 }
 public static Rect Bounds(long handle,int pid){
   SetProcessDpiAwarenessContext(new IntPtr(-4));IntPtr h=new IntPtr(handle);uint owner;
   GetWindowThreadProcessId(h,out owner);Rect r;
   if(!IsWindow(h)||owner!=(uint)pid||!GetWindowRect(h,out r)||r.right<=r.left||r.bottom<=r.top)throw new Exception("Window identity or bounds changed");return r;
 }
 public static string Capture(long handle,int pid){
   Rect r=Bounds(handle,pid);int w=r.right-r.left,h=r.bottom-r.top;
   if(w>6000||h>4000)throw new Exception("Window screenshot too large");
   if(!IsWindowVisible(new IntPtr(handle))||IsIconic(new IntPtr(handle)))throw new Exception("Show the authorized window before capturing");Focus(handle);
   using(Bitmap image=new Bitmap(w,h)){using(Graphics g=Graphics.FromImage(image)){g.CopyFromScreen(r.left,r.top,0,0,new Size(w,h));}
     using(MemoryStream stream=new MemoryStream()){image.Save(stream,ImageFormat.Png);return Convert.ToBase64String(stream.ToArray());}}
 }
 static void Send(Input value){if(GetForegroundWindow()!=authorized)throw new Exception("Focus left authorized window; input stopped");if(SendInput(1,new Input[]{value},Marshal.SizeOf(typeof(Input)))!=1)throw new Exception("Windows input blocked, possibly by elevation or secure desktop");}
 static void KeyEvent(ushort vk,bool up){Input i=new Input();i.type=1;i.u.key.vk=vk;i.u.key.flags=up?2u:0u;Send(i);}
 static void Unicode(char c,bool up){Input i=new Input();i.type=1;i.u.key.scan=c;i.u.key.flags=4u|(up?2u:0u);Send(i);}
 static void MouseEvent(uint flags,int x,int y,uint data=0){Input i=new Input();i.u.mouse.flags=flags;i.u.mouse.data=data;
   if((flags&0x8000)!=0){int l=GetSystemMetrics(76),t=GetSystemMetrics(77),w=GetSystemMetrics(78),h=GetSystemMetrics(79);i.u.mouse.dx=(int)((long)(x-l)*65535/Math.Max(1,w-1));i.u.mouse.dy=(int)((long)(y-t)*65535/Math.Max(1,h-1));}Send(i);}
 public static void Act(long handle,int pid,int left,int top,int width,int height,string operation,int x,int y,int toX,int toY,string text,string chord,int delta){
   Rect r=Bounds(handle,pid);if(r.left!=left||r.top!=top||r.right-r.left!=width||r.bottom-r.top!=height)throw new Exception("Window moved or resized; capture again");
   IntPtr target=new IntPtr(handle);if(!IsWindowVisible(target)||IsIconic(target))throw new Exception("Window is not visible");
   Focus(handle);
   int ax=r.left+x,ay=r.top+y;
   if(operation=="click"||operation=="double_click"||operation=="drag"||operation=="scroll"){
     Point p=new Point();p.x=ax;p.y=ay;IntPtr hit=WindowFromPoint(p);if(hit!=target&&GetAncestor(hit,2)!=target)throw new Exception("Point is covered by another window");
   }
   if(operation=="type"){foreach(char c in text){Unicode(c,false);Unicode(c,true);}return;}
   if(operation=="key"){
     string[] parts=chord.ToUpperInvariant().Split('+');ushort[] mods=new ushort[parts.Length-1];
     for(int j=0;j<mods.Length;j++){string m=parts[j];mods[j]=(ushort)(m=="CTRL"?17:m=="SHIFT"?16:m=="ALT"?18:0);if(mods[j]==0)throw new Exception("Invalid modifier");}
     string k=parts[parts.Length-1];ushort vk;
     switch(k){case "ENTER":vk=13;break;case "TAB":vk=9;break;case "ESCAPE":vk=27;break;case "BACKSPACE":vk=8;break;case "DELETE":vk=46;break;case "ARROWLEFT":vk=37;break;case "ARROWUP":vk=38;break;case "ARROWRIGHT":vk=39;break;case "ARROWDOWN":vk=40;break;case "HOME":vk=36;break;case "END":vk=35;break;case "PAGEUP":vk=33;break;case "PAGEDOWN":vk=34;break;case "SPACE":vk=32;break;default:if(k.Length!=1||!char.IsLetterOrDigit(k[0]))throw new Exception("Invalid key");vk=(ushort)k[0];break;}
     try{foreach(ushort mod in mods)KeyEvent(mod,false);KeyEvent(vk,false);KeyEvent(vk,true);}finally{for(int j=mods.Length-1;j>=0;j--)KeyEvent(mods[j],true);}return;
   }
   MouseEvent(0xC001,ax,ay);
   if(operation=="scroll"){MouseEvent(0x0800,0,0,unchecked((uint)delta));return;}
   if(operation!="click"&&operation!="double_click"&&operation!="drag")throw new Exception("Unknown action");
   int count=operation=="double_click"?2:1;
   for(int click=0;click<count;click++){MouseEvent(2,0,0);try{if(operation=="drag")for(int step=1;step<=20;step++){MouseEvent(0xC001,ax+(toX-x)*step/20,ay+(toY-y)*step/20);Thread.Sleep(12);}}finally{MouseEvent(4,0,0);}Thread.Sleep(40);}
 }
}
'@ -ReferencedAssemblies System.Drawing
$request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload))|ConvertFrom-Json
try {
    $bounds=[ApolloVisual]::Bounds([long]$request.handle,[int]$request.pid)
    if($request.action -eq 'screenshot') {
        $image=[ApolloVisual]::Capture([long]$request.handle,[int]$request.pid)
        $output=@{image=('data:image/png;base64,'+$image);left=$bounds.left;top=$bounds.top;width=($bounds.right-$bounds.left);height=($bounds.bottom-$bounds.top)}
    } elseif($request.action -eq 'visual') {
        if($request.operation -eq 'type' -or $request.operation -eq 'key') {
            [ApolloVisual]::Focus([long]$request.handle)
            Add-Type -AssemblyName UIAutomationClient
            $focused=[Windows.Automation.AutomationElement]::FocusedElement
            if($focused -and $focused.Current.IsPassword){throw 'Password field is protected'}
        }
        [ApolloVisual]::Act([long]$request.handle,[int]$request.pid,[int]$request.left,[int]$request.top,[int]$request.width,[int]$request.height,[string]$request.operation,[int]$request.x,[int]$request.y,[int]$request.toX,[int]$request.toY,[string]$request.text,[string]$request.key,[int]$request.deltaY)
        $output=@{ok=$true;note='Input sent; capture again to verify'}
    } else {throw 'Unknown visual action'}
    ConvertTo-Json -InputObject $output -Depth 5 -Compress
} catch {[Console]::Error.WriteLine($_.Exception.Message);exit 1}

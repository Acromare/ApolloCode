const {app, BrowserWindow, ipcMain, dialog} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {execFile} = require('node:child_process');
const connection = require('./connection.cjs');

let mainWindow;
let runtime;
const {registerRuntime}=require('./runtime-ipc.cjs');
const configPath = path.join(app.getPath('userData'), 'config.json');
const defaults = {provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', apiKey: '', projectRoot: '', trust: 'confirm'};
function readConfig() { try { return {...defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8'))}; } catch { return {...defaults}; } }
function saveConfig(next) { fs.mkdirSync(path.dirname(configPath), {recursive: true}); fs.writeFileSync(configPath, JSON.stringify(next, null, 2), {encoding: 'utf8', mode: 0o600}); }
function endpoint(base, suffix) { return new URL(base.replace(/\/+$/, '') + suffix).toString(); }
function redact(value) { return String(value || '').replace(/(sk-[A-Za-z0-9_-]{8,}|(?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s'"\x60]+/gi, '$1[REDACTED]'); }
function project() { const root = readConfig().projectRoot; if (!root || !fs.existsSync(root)) throw new Error('请先选择项目文件夹。'); return path.resolve(root); }
function safePath(root, target) { const resolved = path.resolve(root, target || '.'); if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('操作被安全策略拦截：路径不在当前项目内。'); return resolved; }
function audit(root, action, detail) { const dir = path.join(root, '.apollocode'); fs.mkdirSync(dir, {recursive: true}); fs.appendFileSync(path.join(dir, 'audit.log'), JSON.stringify({time: new Date().toISOString(), action, detail: redact(detail)}) + '\n', 'utf8'); }
function run(file, args, cwd, timeout = 120000) { return new Promise(resolve => execFile(file, args, {cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024}, (error, stdout, stderr) => resolve({ok: !error, code: error?.code ?? 0, output: redact((stdout + '\n' + stderr).slice(0, 60000))}))); }
function cli(prompt, model) { return new Promise(resolve => { const args = ['-p', prompt, '--output-format', 'json']; if (model) args.push('--model', model); const cliPath = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'); execFile(fs.existsSync(cliPath) ? cliPath : 'claude', args, {timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true}, (error, stdout, stderr) => { if (error) return resolve({ok: false, error: 'Claude Code 启动失败：' + (String(stderr).trim() || error.message)}); try { const data = JSON.parse(stdout); resolve(data.is_error ? {ok: false, error: data.result || 'Claude Code 请求失败'} : {ok: true, content: data.result || ''}); } catch { resolve({ok: true, content: stdout.trim()}); } }); }); }
function createWindow() { mainWindow = new BrowserWindow({icon: path.join(__dirname, 'icon.png'), width: 1440, height: 860, minWidth: 900, minHeight: 600, backgroundColor: '#090e18', frame: false, show: false, autoHideMenuBar: true, webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true}}); mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html')); mainWindow.once('ready-to-show', () => mainWindow.show()); mainWindow.on('closed', () => { mainWindow = undefined; }); }

app.whenReady().then(() => {
  runtime=registerRuntime({app,ipcMain,dialog,getWindow:()=>mainWindow,readConfig,saveConfig});
  require('./updates.cjs').registerUpdates({app,ipcMain,dialog,getWindow:()=>mainWindow,isBusy:()=>Boolean(runtime.running||runtime.workflowBusy),updater:require('electron-updater').autoUpdater});
  ipcMain.handle('app:info',()=>({project:readConfig().projectRoot,version:app.getVersion()}));
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.handle('config:get', () => readConfig());
  ipcMain.handle('connection:models', (_, config) => connection.models(config));
  ipcMain.handle('connection:test', (_, config) => connection.test(config));
  ipcMain.handle('config:save', (_, input) => { if(runtime.running||runtime.workflowBusy)throw new Error('请先停止当前任务。'); const previous = readConfig(); const next = {...previous, provider: ['openai', 'anthropic', 'claude', 'ollama'].includes(input?.provider) ? input.provider : 'openai', baseUrl: String(input?.baseUrl || '').trim(), model: String(input?.model || '').trim(), apiKey: String(input?.apiKey || '').trim(), trust: ['confirm', 'session', 'yolo'].includes(input?.trust) ? input.trust : previous.trust}; if (next.provider !== 'claude') next.baseUrl = connection.normalize(next).baseUrl; saveConfig(next); runtime.rememberProvider(next); return {ok: true}; });
  ipcMain.handle('project:get', () => { const root = readConfig().projectRoot; return {root, selected: Boolean(root && fs.existsSync(root))}; });
  ipcMain.handle('project:choose', async () => { if(runtime.running||runtime.workflowBusy)throw new Error('请先停止当前任务。'); const result = await dialog.showOpenDialog(mainWindow, {properties: ['openDirectory', 'createDirectory']}); if (result.canceled || !result.filePaths[0]) return {ok: false}; const config = readConfig(); config.projectRoot = path.resolve(result.filePaths[0]); saveConfig(config); runtime.tools.audit('project-selected',config.projectRoot); return {ok: true, root: config.projectRoot}; });
  ipcMain.handle('project:files', (_,relative='.')=>runtime.tools.list(relative).map(item=>({...item,path:path.join(relative,item.name)})));
  ipcMain.handle('project:read',(_,relative)=>runtime.tools.read(relative));
  ipcMain.handle('git:status',()=>runtime.tools.command('git',["status","--short","--branch"]));
  ipcMain.handle('git:diff',()=>runtime.tools.command('git',["diff","--no-ext-diff","--no-textconv","--unified=3"]));
  ipcMain.handle('patch:apply',(_,patch)=>{if(runtime.running||runtime.workflowBusy)throw new Error('请先停止当前任务。');return runtime.tools.patch(patch);});
  ipcMain.handle('test:run',async()=>{if(runtime.running||runtime.workflowBusy)throw new Error('请先停止当前任务。');if(!await runtime.approve('run-tests','运行项目测试脚本'))return {ok:false,output:'用户取消'};return runtime.tools.tests();});
  ipcMain.handle('skills:list',()=>({builtIn:runtime.skills.list().filter(s=>s.source==='built-in').map(s=>s.name),externalPath:runtime.skills.external,sources:{rtk:'not-installed',stacklitNavigator:'unavailable-404'}}));
  ipcMain.handle('chat:send',async(_,payload)=>{
    if(runtime.workflowBusy)return {ok:false,error:'工作流正在运行'};
    const config=readConfig();
    if(config.provider==='claude'){
      const economy=require('./economy.cjs');
      const limited=economy.context(payload.messages||[],runtime.settings().contextTokens-runtime.settings().maxOutputTokens);
      return cli([payload.instruction||'',...limited.messages.map(m=>m.role+': '+economy.redact(m.content,[config.apiKey]))].join('\n\n'),config.model);
    }
    return runtime.chat(payload);
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let shuttingDown=false;
app.on('before-quit',event=>{if(runtime&&!shuttingDown){event.preventDefault();shuttingDown=true;runtime.close().finally(()=>app.quit());}});

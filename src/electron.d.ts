export {};
import type {RuntimeState,RuntimeSettings,RuntimeEvent,McpServer,AgentTask,Failure} from './runtime-types';
import type {WorkflowRun,WorkflowState,WorkflowTemplate,Snapshot,DesktopWindow} from './operation-types';
import type {ScheduleInput,ScheduleState} from './schedule-types';
import type {TerminalConfig} from './ExecutionSettings';
import type {HermesCatalog,HermesState,HermesEvent,HermesQuestion} from './hermes-types';

declare global {
  interface Window {
    apollo: {
      hermes:{openUrl(value:string):Promise<{ok:boolean}>;state():Promise<HermesState>;catalog():Promise<HermesCatalog>;start():Promise<HermesState>;stop():Promise<HermesState>;prepare():Promise<HermesState>;session():Promise<{sessionId:string;state:HermesState}>;use(enabled:boolean):Promise<{ok:boolean}>;choosePython():Promise<HermesState>;rpc(method:string,params:Record<string,unknown>):Promise<unknown>;answer(id:string,result:Record<string,unknown>):Promise<{ok:boolean}>;onState(callback:(state:HermesState)=>void):()=>void;onEvent(callback:(event:HermesEvent)=>void):()=>void;onRequest(callback:(question:HermesQuestion)=>void):()=>void;onRequestCancelled(callback:(id:string)=>void):()=>void;};
      worktrees:{list():Promise<{id:string;task:string;branch:string;directory:string;status:string;created:number}[]>;open(id:string):Promise<{ok:boolean}>;diff(id:string):Promise<{output:string}>};
      terminal:{state():Promise<TerminalConfig>;save(input:TerminalConfig):Promise<{ok:boolean}>};
      schedules:{state():Promise<ScheduleState>;save(input:ScheduleInput):Promise<string>;enable(id:string,enabled:boolean):Promise<{ok:boolean}>;remove(id:string):Promise<{ok:boolean}>;run(id:string):Promise<{ok:boolean}>};
      workflows:{state():Promise<WorkflowState>;create(input:{templateId:string;task:string;prompts:string[]}):Promise<WorkflowRun>;saveTemplate(input:WorkflowTemplate):Promise<WorkflowTemplate>;advance(id:string,approved?:boolean):Promise<WorkflowRun>;cancel(requestId?:string):Promise<{ok:boolean}>};
      browser:{open(url:string):Promise<Snapshot>;snapshot():Promise<Snapshot>;action(kind:'click'|'type',id:string,text?:string):Promise<{ok:boolean}>;preview():Promise<{image:string;url:string}>;show():Promise<{ok:boolean}>;close():Promise<void>};
      updates:{state():Promise<{status:string;version:string;available?:string;releaseNotes?:string;releaseUrl?:string;error?:string;errorCode?:string}>;check():Promise<unknown>;download():Promise<unknown>};
      computer:{windows():Promise<DesktopWindow[]>;select(handle:string,pid:number):Promise<Snapshot>;snapshot():Promise<Snapshot>;action(kind:'click'|'type',id:string,text?:string):Promise<{ok:boolean}>;revoke():Promise<{ok:boolean}>};
      close(): Promise<void>;
      minimize(): Promise<void>;
      maximize(): Promise<void>;
      getInfo(): Promise<{project: string; version: string}>;
      getConfig(): Promise<{provider?: 'openai' | 'anthropic' | 'claude' | 'ollama'; apiKey?: string; model?: string; baseUrl?: string; apiMode?:'auto'|'chat'|'responses'; reasoningEffort?:'auto'|'low'|'medium'|'high'|'xhigh'; trust?: 'confirm' | 'session' | 'yolo'}>;
      saveConfig(config: {provider: 'openai' | 'anthropic' | 'claude' | 'ollama'; apiKey: string; model: string; baseUrl: string; apiMode?:'auto'|'chat'|'responses'; reasoningEffort?:'auto'|'low'|'medium'|'high'|'xhigh'; trust?: 'confirm' | 'session' | 'yolo'}): Promise<{ok: boolean}>;
      pathForFile(file:File):string;
      storeAttachment(file:{name:string;data:ArrayBuffer}):Promise<{name:string;path:string;size:number}>;
      chat(payload: {messages: Array<{role: string; content: string}>; instruction?: string; skillId?:string; requestId?:string;chatId?:string;resumeId?:string;attachments?:{path:string;name:string}[]}): Promise<{ok: boolean; content?: string; error?: string;partial?:string;failure?:Failure;outcome?:string}>;
      runtime:{
        syncHistory(chats:{id:string;title:string;updated:number;project?:string;messages:{role:string;content:string}[]}[]):Promise<{count:number}>;
        clearHistory():Promise<{ok:boolean}>;
        journal():Promise<{historyCount:number;tasks:AgentTask[]}>;
        skillVersions(id:string):Promise<{revision:string;created:number;body:string;description:string}[]>;
        restoreSkill(id:string,revision:string):Promise<{ok:boolean;id?:string}>;
        state():Promise<RuntimeState>;
        saveSettings(settings:Partial<RuntimeSettings>):Promise<RuntimeSettings>;
        saveSkill(skill:{name:string;description:string;body:string}):Promise<{id:string}>;
        readSkill(id:string):Promise<{body:string}>;
        importSkill():Promise<{ok:boolean;id?:string}>;
        saveMcp(server:McpServer):Promise<McpServer>;
        connectMcp(id:string):Promise<{name:string;alias:string}[]>;
        disconnectMcp(id:string):Promise<void>;
        saveMemory(text:string):Promise<{text:string}>;
        cancel(requestId?:string):Promise<{ok:boolean}>;
        control(action:'pause'|'resume'|'steer',requestId:string,text?:string):Promise<{ok:boolean;status?:string}>;
        rollback(id:string):Promise<{ok:boolean}>;
        switchProvider(id:string):Promise<{provider:'openai'|'anthropic'|'claude'|'ollama';baseUrl:string;model:string;apiKey:string}>;
        onEvent(callback:(event:RuntimeEvent)=>void):()=>void;
      };
      getProject(): Promise<{root: string; selected: boolean}>;
      getModels(config: {provider: string; baseUrl: string; apiKey: string; model: string}): Promise<{ok: boolean; models?: string[]; error?: string}>;
      testConnection(config: {provider: string; baseUrl: string; apiKey: string; model: string}): Promise<{ok: boolean; content?: string; error?: string}>;
      chooseProject(): Promise<{ok: boolean; root?: string}>;
      listFiles(relative?: string): Promise<Array<{name: string; path: string; directory: boolean}>>;
      readFile(relative: string): Promise<{path: string; content: string}>;
      gitStatus(): Promise<{ok: boolean; output: string}>;
      gitDiff(): Promise<{ok: boolean; output: string}>;
      applyPatch(patch: string): Promise<{ok: boolean; output?: string; rollbackId?: string}>;
      runTests(): Promise<{ok: boolean; output: string}>;
      listSkills(): Promise<{builtIn: string[]; externalPath: string; sources: Record<string, string>}>;
    };
  }
}

export {};
import type {RuntimeState,RuntimeSettings,RuntimeEvent,McpServer} from './runtime-types';
import type {WorkflowRun,WorkflowState,Snapshot,DesktopWindow} from './operation-types';

declare global {
  interface Window {
    apollo: {
      workflows:{state():Promise<WorkflowState>;create(input:{templateId:string;task:string;prompts:string[]}):Promise<WorkflowRun>;advance(id:string,approved?:boolean):Promise<WorkflowRun>;cancel():Promise<{ok:boolean}>};
      browser:{open(url:string):Promise<Snapshot>;snapshot():Promise<Snapshot>;action(kind:'click'|'type',id:string,text?:string):Promise<{ok:boolean}>;preview():Promise<{image:string;url:string}>;show():Promise<{ok:boolean}>;close():Promise<void>};
      updates:{state():Promise<{status:string;version:string;available?:string;percent?:number;error?:string}>;check():Promise<unknown>;download():Promise<unknown>;install():Promise<unknown>};
      computer:{windows():Promise<DesktopWindow[]>;select(handle:string,pid:number):Promise<Snapshot>;snapshot():Promise<Snapshot>;action(kind:'click'|'type',id:string,text?:string):Promise<{ok:boolean}>;revoke():Promise<{ok:boolean}>};
      close(): Promise<void>;
      minimize(): Promise<void>;
      maximize(): Promise<void>;
      getInfo(): Promise<{project: string; version: string}>;
      getConfig(): Promise<{provider?: 'openai' | 'anthropic' | 'claude' | 'ollama'; apiKey?: string; model?: string; baseUrl?: string; trust?: 'confirm' | 'session' | 'yolo'}>;
      saveConfig(config: {provider: 'openai' | 'anthropic' | 'claude' | 'ollama'; apiKey: string; model: string; baseUrl: string; trust?: 'confirm' | 'session' | 'yolo'}): Promise<{ok: boolean}>;
      chat(payload: {messages: Array<{role: string; content: string}>; instruction?: string; skillId?:string; requestId?:string}): Promise<{ok: boolean; content?: string; error?: string}>;
      runtime:{
        state():Promise<RuntimeState>;
        saveSettings(settings:Partial<RuntimeSettings>):Promise<RuntimeSettings>;
        saveSkill(skill:{name:string;description:string;body:string}):Promise<{id:string}>;
        readSkill(id:string):Promise<{body:string}>;
        importSkill():Promise<{ok:boolean;id?:string}>;
        saveMcp(server:McpServer):Promise<McpServer>;
        connectMcp(id:string):Promise<{name:string;alias:string}[]>;
        disconnectMcp(id:string):Promise<void>;
        saveMemory(text:string):Promise<{text:string}>;
        cancel():Promise<{ok:boolean}>;
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

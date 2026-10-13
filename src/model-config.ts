export type Provider = 'openai' | 'anthropic' | 'claude' | 'ollama';
export type Config = {provider: Provider; baseUrl: string; model: string; apiKey: string;apiMode?:'auto'|'chat'|'responses';reasoningEffort?:'auto'|'low'|'medium'|'high'|'xhigh'};
const modelCacheKey=(config:Config)=>'apollo-models:'+config.provider+':'+config.baseUrl;
export function cachedModels(config:Config){try{const value=JSON.parse(localStorage.getItem(modelCacheKey(config))||'{}');return Array.isArray(value.models)&&value.models.every((item:unknown)=>typeof item==='string')?value.models as string[]:[];}catch{return [];}}
export function cacheModels(config:Config,models:string[]){localStorage.setItem(modelCacheKey(config),JSON.stringify({models,time:Date.now()}));}
export function modelsFresh(config:Config){try{const value=JSON.parse(localStorage.getItem(modelCacheKey(config))||'{}');return Array.isArray(value.models)&&Date.now()-Number(value.time)<5*60*1000;}catch{return false;}}

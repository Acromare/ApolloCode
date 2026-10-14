export type Schema={type?:string;$ref?:string;title?:string;description?:string;enum?:unknown[];default?:unknown;properties?:Record<string,Schema>;required?:string[];anyOf?:Schema[];items?:Schema;additionalProperties?:boolean|Schema;minimum?:number;maximum?:number;minLength?:number;maxLength?:number};
export type HermesMethod={name:string;summary?:string;params:{name:string;schema:Schema}[];result:{name:string;schema:Schema}};
export type HermesCatalog={methods:HermesMethod[];components:{schemas:Record<string,Schema>};'x-server-requests':HermesMethod[];'x-notifications':{name:string;summary?:string}[]};
export type HermesState={status:string;source:string;python:string;home:string;commit?:string;methodCount:number;sessionCount:number;error?:string;progress?:string;liveSessions?:{chatId:string;sessionId:string;storedId:string;title:string;model?:string;approvalMode?:string;yolo?:boolean}[]};
export type HermesQuestion={id:string;method:string;params:Record<string,unknown>};
export type HermesEvent={type:string;session_id?:string;payload?:Record<string,unknown>};

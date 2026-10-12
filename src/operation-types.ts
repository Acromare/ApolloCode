export type WorkflowStep={id?:string;name:string;kind:string;mode?:string;approval?:boolean;prompt:string;status:string;output:string;dependsOn?:string[];when?:'success'|'failure'|'always';continueOnError?:boolean};
export type WorkflowRun={id:string;name:string;task:string;projectRoot:string;steps:WorkflowStep[];index:number;status:string;error?:string;created:number;rollbackIds?:string[]};
export type WorkflowTemplate={id:string;name:string;steps:WorkflowStep[];custom?:boolean};
export type WorkflowState={templates:WorkflowTemplate[];runs:WorkflowRun[]};
export type Control={id:string;role:string;name:string;enabled?:boolean};
export type Snapshot={controls:Control[];url?:string;title?:string;target?:{handle:string;pid:number}};
export type DesktopWindow={handle:string;pid:number;name:string};

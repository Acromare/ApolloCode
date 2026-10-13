export type ScheduleInput={id?:string;name:string;prompt:string;kind:'once'|'interval'|'cron';at?:string;minutes?:number;cron?:string;timezone:string;mode:'plan'|'agent'};
export type ScheduleJob=ScheduleInput&{id:string;enabled:boolean;next:number;projectRoot:string;model:string};
export type ScheduleRun={id:string;jobId:string;name:string;status:string;started?:number;ended?:number;scheduled:number;result:string};
export type ScheduleState={jobs:ScheduleJob[];runs:ScheduleRun[]};

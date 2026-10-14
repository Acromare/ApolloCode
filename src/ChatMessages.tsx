import React,{memo} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {WorkDetails} from './WorkDetails';
import type {WorkTrace,Failure} from './runtime-types';
import {FailureCard} from './FailureCard';

export type Message={role:'user'|'assistant';content:string;trace?:WorkTrace;failure?:Failure};
const plugins=[remarkGfm];
const ChatMessage=memo(function ChatMessage({message,you,assistant,onBrowser,onRecover,onConnection}:{message:Message;you:string;assistant:string;onBrowser:()=>void;onRecover?:(id:string)=>void;onConnection?:()=>void}){
  return <div className={`message ${message.role}`}><span>{message.role==='user'?you:`✶ ${assistant}`}</span>{message.trace&&<WorkDetails trace={message.trace} openBrowser={onBrowser}/>}<div className={message.role==='assistant'?'markdown-body':''}>{message.role==='assistant'?<Markdown remarkPlugins={plugins}>{message.content}</Markdown>:<p>{message.content}</p>}</div>{message.failure&&<FailureCard failure={message.failure} trace={message.trace} onRecover={onRecover&&message.failure.recoveryId?()=>onRecover(message.failure!.recoveryId!):undefined} onConnection={onConnection}/>}</div>;
});
// Completed answers do not change while the composer or live answer updates.
export const ChatMessages=memo(function ChatMessages({messages,you,assistant,onBrowser,onRecover,onConnection}:{messages:Message[];you:string;assistant:string;onBrowser:()=>void;onRecover?:(id:string)=>void;onConnection?:()=>void}){
  return <>{messages.map((message,index)=><ChatMessage key={index} message={message} you={you} assistant={assistant} onBrowser={onBrowser} onRecover={onRecover} onConnection={onConnection}/>)}</>;
});

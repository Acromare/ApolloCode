import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from 'lucide-react';

type Option={value:string;label:string;description?:string};
export function ComposerSelect({className,label,value,display,icon,options,disabled,onChange}:{className:string;label:string;value:string;display:string;icon:React.ReactNode;options:Option[];disabled:boolean;onChange:(value:string)=>Promise<void>}){
  const [open,setOpen]=useState(false),[saving,setSaving]=useState(false);
  const [position,setPosition]=useState({top:0,left:0,maxHeight:320,above:false});
  const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  const id=useId();
  function close(restore=false){setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});}
  useLayoutEffect(()=>{
    if(!open)return;
    const rect=trigger.current!.getBoundingClientRect(),width=Math.min(280,innerWidth-24);
    const aboveSpace=rect.top-16,belowSpace=innerHeight-rect.bottom-16;
    const above=aboveSpace>belowSpace;
    setPosition({top:above?rect.top-8:rect.bottom+8,left:Math.max(12,Math.min(rect.left,innerWidth-width-12)),maxHeight:Math.min(320,above?aboveSpace:belowSpace),above});
    panel.current?.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus({preventScroll:true});
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:Event)=>{if(panel.current?.contains(event.target as Node)||trigger.current?.contains(event.target as Node))return;close();};
    const resize=()=>close();
    document.addEventListener('pointerdown',dismiss,true);document.addEventListener('focusin',dismiss);
    window.addEventListener('resize',resize);document.addEventListener('scroll',dismiss,true);
    return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('focusin',dismiss);window.removeEventListener('resize',resize);document.removeEventListener('scroll',dismiss,true);};
  },[open]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  async function choose(next:string){close(true);if(next===value)return;setSaving(true);try{await onChange(next);}finally{setSaving(false);}}
  function key(event:React.KeyboardEvent){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close(true);return;}
    const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')||[]);
    if(!buttons.length)return;
    const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(at>=0&&(event.key==='Enter'||event.key===' ')){event.preventDefault();void choose(options[at].value);return;}
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(at+1)%buttons.length:event.key==='ArrowUp'?(at-1+buttons.length)%buttons.length:-1;
    if(next>=0){event.preventDefault();buttons[next].focus({preventScroll:true});buttons[next].scrollIntoView({block:'nearest'});}
  }
  return <>
    <button ref={trigger} type="button" className={className+' composer-choice'} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} aria-busy={saving} disabled={disabled} onClick={()=>{if(!saving)setOpen(!open);}} onKeyDown={e=>{if(!saving&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();setOpen(true);}}}>{icon}<span>{display}</span><ChevronDown className="choice-chevron" aria-hidden="true"/></button>
    {open&&createPortal(<div className="choice-popover-anchor" style={{top:position.top,left:position.left,transform:position.above?'translateY(-100%)':undefined}}><div ref={panel} id={id} role="menu" aria-label={label} className="choice-popover" data-above={position.above} onKeyDown={key} style={{maxHeight:position.maxHeight}}>{options.map(option=><button type="button" key={option.value} role="menuitemradio" aria-checked={option.value===value} onClick={()=>void choose(option.value)}><span className="choice-option-text"><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</span><Check aria-hidden="true" className="choice-check"/></button>)}</div></div>,document.body)}
  </>;
}

import {useEffect,useState} from 'react';

export type WorkDisplay='auto'|'expanded'|'hidden';
const key='apollo-work-display';
const changed='apollo-work-display-changed';
function read():WorkDisplay{
  try{const value=localStorage.getItem(key);return value==='expanded'||value==='hidden'?value:'auto';}catch{return 'auto';}
}
export function useWorkDisplay(){
  const [display,setDisplay]=useState<WorkDisplay>(read);
  useEffect(()=>{const sync=()=>setDisplay(read());window.addEventListener(changed,sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener(changed,sync);window.removeEventListener('storage',sync);};},[]);
  const update=(next:WorkDisplay)=>{localStorage.setItem(key,next);setDisplay(next);window.dispatchEvent(new Event(changed));};
  return {display,setDisplay:update};
}

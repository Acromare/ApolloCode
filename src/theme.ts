import {useRef,useState} from 'react';
import {flushSync} from 'react-dom';

export type Theme='dark'|'light'|'eclipse';
const key='apollo-code-theme';
export function savedTheme():Theme {
  try{const saved=localStorage.getItem(key);return saved==='light'||saved==='eclipse'?saved:'dark';}catch{return 'dark';}
}
function apply(theme:Theme){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme==='light'?'light':'dark';}
apply(savedTheme());

export function useTheme(){
  const [theme,setTheme]=useState<Theme>(savedTheme),[switching,setSwitching]=useState(false);
  const locked=useRef(false);
  async function toggle(button:HTMLButtonElement){
    if(locked.current)return;
    locked.current=true;setSwitching(true);
    const next:Theme=theme==='dark'?'light':theme==='light'?'eclipse':'dark';
    const commit=()=>{apply(next);setTheme(next);try{localStorage.setItem(key,next);}catch{/* Theme remains usable when storage is unavailable. */}};
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    try{
      if(!document.startViewTransition||reduced){commit();return;}
      const transition=document.startViewTransition(()=>flushSync(commit));
      await transition.ready;
      const animation=document.documentElement.animate({opacity:[0,1]},
        {duration:190,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both',pseudoElement:'::view-transition-new(root)'});
      await animation.finished;
      await transition.finished;
    }catch{commit();}
    finally{locked.current=false;setSwitching(false);}
  }
  return {theme,switching,toggle};
}

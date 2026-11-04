(function(){
 'use strict';
 const system=matchMedia('(prefers-color-scheme: dark)');let choice='system';
 try{choice=localStorage.getItem('mb-theme')||choice}catch{}
 function apply(value){choice=['light','dark','sepia','system'].includes(value)?value:'system';const theme=choice==='system'?(system.matches?'dark':'light'):choice;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme==='dark'?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111a2b':theme==='sepia'?'#f4efdf':'#f5f7fb');try{localStorage.setItem('mb-theme',choice)}catch{}return choice}
 system.addEventListener('change',()=>{if(choice==='system')apply(choice)});window.StudyTheme={apply,get:()=>choice};apply(choice);
})();

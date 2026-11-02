const CACHE='mathbank-20261102b';
const SHELL=['./','index.html','app.js','app.css','meta.js','qmap.js','fav_seed.js','home.js','data-tools.js','ch.html','fav.html','exam.html','review.html','manifest.json','vendor/supabase.js','vendor/mathjax/tex-chtml.js','icons/icon-192.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mathbank-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
function canonical(url){const u=new URL(url);if(/\.(js|css|png|jpg|jpeg|gif|webp|woff|woff2|json)$/.test(u.pathname))u.search='';return u.href;}
async function network(req,cache,key){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{const res=await fetch(req,{signal:controller.signal});if(!res.ok)throw Error('HTTP '+res.status);await cache.put(key,res.clone());return res;}finally{clearTimeout(timer);}
}
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/version.json'))return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE),key=canonical(req.url),hit=await cache.match(key);
    if(req.mode==='navigate'){
      try{return await network(req,cache,key);}catch(err){
        const page=await cache.match(url.origin+url.pathname);if(hit||page)return hit||page;
        return new Response('<meta charset="utf-8"><p>此页面尚未缓存，请联网后重试。</p>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
    }
    if(hit)return hit;
    try{return await network(req,cache,key);}catch(err){return new Response('Resource unavailable offline',{status:503});}
  })());
});

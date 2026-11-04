const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'meta.js'),'utf8'),ctx);
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name])}
// GitHub Pages serves Git's LF text blobs; keep estimates reproducible on Windows checkouts.
const bytes=files=>files.reduce((n,f)=>{f=f==='./'?'index.html':f;return n+(/\.(html|css|js|json|svg|txt)$/.test(f)?Buffer.byteLength(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n')):fs.statSync(path.join(root,f)).size)},0);
const manifest={version:JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).v,schema:2,subjects:{}};
for(const tk of Object.keys(ctx.window.META)){
 const files=fs.readdirSync(root).filter(f=>f.startsWith('q_'+tk+'_')&&f.endsWith('.js')),refs=new Set(files);
 for(const f of files){const c={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),c);for(const q of Object.values(c.window.QDATA||{}))for(const match of JSON.stringify(q).matchAll(/img\/[\w./-]+/g))refs.add(match[0])}
 const list=[...refs].sort();for(const f of list)if(!fs.existsSync(path.join(root,f)))throw Error('Missing referenced resource: '+f);
 manifest.subjects[tk]={files:list,bytes:bytes(list)};
}
const shell=['./','index.html','study.css','platform.css','theme.js','image-viewer.js','learning-core.js','learning-ui.js','offline.js','app.js','study.js','meta.js','question-index.js','qmap.js','fav_seed.js','data-tools.js','official-rules.json','manifest.json','ch.html','review.html','fav.html','exam.html'];
const shared=[...new Set([...shell,...walk('vendor'),...walk('icons')])].sort();manifest.shared={files:shared,bytes:bytes(shared)};
fs.writeFileSync(path.join(root,'offline-manifest.json'),JSON.stringify(manifest));
console.log(JSON.stringify({version:manifest.version,subjects:Object.fromEntries(Object.entries(manifest.subjects).map(([k,s])=>[k,{files:s.files.length,bytes:s.bytes}])),shared:shared.length}));

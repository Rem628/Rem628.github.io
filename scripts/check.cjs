const fs=require('fs'),path=require('path'),cp=require('child_process');const root=path.resolve(__dirname,'..');
for(const file of ['app.js','study.js','learning-core.js','learning-ui.js','offline.js','theme.js','image-viewer.js','data-tools.js','sw.js']){const r=cp.spawnSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit',windowsHide:true});if(r.status)process.exit(r.status)}
for(const file of ['offline-manifest.json','official-rules.json','manifest.json','version.json'])JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
console.log('Application syntax and JSON checks passed');

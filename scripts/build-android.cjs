/* Usage: node scripts/build-android.cjs <toolchain-directory> <signing-directory> <output.apk> */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const [toolchain,signing,output]=process.argv.slice(2).map(v=>path.resolve(v));if(!toolchain||!signing||!output)throw Error('Toolchain, existing signing directory and output path required');
const root=path.resolve(__dirname,'..'),build=path.resolve(root,'../android-build'),java=path.join(toolchain,'java/jdk-17.0.20.1+1/bin'),sdk=path.join(toolchain,'android/android-35/android.jar'),bt=path.join(toolchain,'build-tools/android-15');
for(const dir of [build,path.join(build,'classes'),path.join(build,'apk'),path.join(build,'framework')])fs.mkdirSync(dir,{recursive:true});
function run(exe,args){const r=cp.spawnSync(exe,args,{encoding:'utf8',windowsHide:true,env:{...process.env,TEMP:path.resolve(build,'tmp'),TMP:path.resolve(build,'tmp')},maxBuffer:5000000});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stdout.write(r.stderr);if(r.error)throw r.error;if(r.status!==0)throw Error('Build tool failed: '+path.basename(exe));}
fs.mkdirSync(path.join(build,'tmp'),{recursive:true});
const apk=path.join(build,'apk');for(const file of ['AndroidManifest.xml','apktool.yml'])fs.copyFileSync(path.join(root,'android',file),path.join(apk,file));fs.cpSync(path.join(root,'android/res'),path.join(apk,'res'),{recursive:true});
run(path.join(java,'javac.exe'),['-encoding','UTF-8','-source','8','-target','8','-classpath',sdk,'-d',path.join(build,'classes'),path.join(root,'android/src/io/github/rem628/mathbank/MainActivity.java')]);
run(path.join(java,'jar.exe'),['cf',path.join(build,'classes.jar'),'-C',path.join(build,'classes'),'.']);
run(path.join(java,'java.exe'),['-cp',path.join(toolchain,'r8.jar'),'com.android.tools.r8.D8','--min-api','21','--lib',sdk,'--output',apk,path.join(build,'classes.jar')]);
const assets=path.join(apk,'assets/site');fs.mkdirSync(assets,{recursive:true});for(const f of fs.readdirSync(root).filter(f=>/\.(html|js|css|json)$/.test(f)&&!/(\.bak\.|^test_|^render_test)/.test(f)))fs.copyFileSync(path.join(root,f),path.join(assets,f));for(const dir of ['img','icons','vendor'])fs.cpSync(path.join(root,dir),path.join(assets,dir),{recursive:true});
run(path.join(java,'java.exe'),['-jar',path.join(toolchain,'apktool.jar'),'b',apk,'-o',path.join(build,'unsigned.apk'),'-p',path.join(build,'framework')]);
run(path.join(bt,'zipalign.exe'),['-f','-p','4',path.join(build,'unsigned.apk'),path.join(build,'aligned.apk')]);
run(path.join(java,'java.exe'),['-jar',path.join(bt,'lib/apksigner.jar'),'sign','--ks',path.join(signing,'mathbank-release.p12'),'--ks-key-alias','mathbank','--ks-pass','file:'+path.join(signing,'password.txt'),'--out',output,path.join(build,'aligned.apk')]);
run(path.join(java,'java.exe'),['-jar',path.join(bt,'lib/apksigner.jar'),'verify','--verbose','--print-certs',output]);run(path.join(bt,'zipalign.exe'),['-c','4',output]);
console.log('APK built, aligned and signature verified: '+output);

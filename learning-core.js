/* Pure, versioned learning model. No question text or answer is modified here. */
(function(root){
 'use strict';
 const DAY=86400000, safe=k=>typeof k==='string'&&/^[\w-]{1,160}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k);
 const obj=x=>x&&typeof x==='object'&&!Array.isArray(x), clock=x=>Number.isFinite(x)&&x>=0;
 function map(x,check){const out={};if(obj(x))for(const[k,v]of Object.entries(x))if(safe(k)&&check(v,k))out[k]=v;return out}
 function validEvent(v){return obj(v)&&clock(v.t)&&['answer','master','strengthen','time'].includes(v.kind)&&(v.review===undefined||typeof v.review==='boolean')&&(v.kind==='time'?Number.isFinite(v.seconds)&&v.seconds>0&&v.seconds<=60:safe(v.qid)&&(v.kind!=='answer'||typeof v.correct==='boolean'))}
 function validDraft(v){return obj(v)&&safe(v.id)&&clock(v.ts)&&clock(v.updatedAt||0)&&clock(v.minutes||0)&&clock(v.deadline||0)&&clock(v.elapsedMs||0)&&Array.isArray(v.qids)&&v.qids.length>0&&new Set(v.qids).size===v.qids.length&&v.qids.every(safe)&&obj(v.ans)&&Object.entries(v.ans).every(([k,a])=>safe(k)&&typeof a==='string')&&['GS','XD','CY','GL'].includes(v.tk)&&(v.answerTimes===undefined||obj(v.answerTimes)&&Object.entries(v.answerTimes).every(([k,t])=>safe(k)&&clock(t)))}
 function validPref(v,key){if(!obj(v)||!clock(v.t)||!('value'in v))return false;const x=v.value;if(key==='theme')return ['system','light','dark','sepia'].includes(x);if(key==='searchHistory')return Array.isArray(x)&&x.length<=10&&x.every(t=>typeof t==='string'&&t.length<=200);if(key==='goals')return obj(x)&&['practice','review','minutes'].every(k=>Number.isInteger(x[k])&&x[k]>=1&&x[k]<={practice:500,review:200,minutes:480}[k]);return true}
 function clean(p={}){return {events:map(p.events,validEvent),drafts:map(p.drafts,validDraft),prefs:map(p.prefs,validPref),feedback:map(p.feedback,v=>obj(v)&&safe(v.qid)&&clock(v.t)&&typeof v.text==='string'&&v.text.length<=3000&&typeof v.category==='string'&&v.category.length<=100&&['local','resolved'].includes(v.status))}}
 function choose(a,b){if(!a)return b;if(!b)return a;return (a.t||0)>(b.t||0)?a:(a.t||0)<(b.t||0)?b:JSON.stringify(a)>JSON.stringify(b)?a:b}
 function merge(a,b){a=clean(a);b=clean(b);const out=clean(a);
  for(const key of ['events','prefs','feedback'])for(const[id,v]of Object.entries(b[key]))out[key][id]=choose(out[key][id],v);
  for(const[id,v]of Object.entries(b.drafts)){
   const prev=out.drafts[id];if(!prev){out.drafts[id]=v;continue}
   const newer=(prev.updatedAt||prev.ts)>(v.updatedAt||v.ts)?prev:v,merged={...newer,ans:{...prev.ans},notes:{...prev.notes},answerTimes:{...prev.answerTimes},closed:!!(prev.closed||v.closed),timedOut:!!(prev.timedOut||v.timedOut),timeNotified:!!(prev.timeNotified||v.timeNotified)};
   for(const[qid,ans]of Object.entries(v.ans))if((v.answerTimes?.[qid]||v.updatedAt||v.ts)>=(prev.answerTimes?.[qid]||prev.updatedAt||prev.ts)){merged.ans[qid]=ans;merged.answerTimes[qid]=v.answerTimes?.[qid]||v.updatedAt||v.ts;if(v.notes?.[qid]!==undefined)merged.notes[qid]=v.notes[qid]}
   out.drafts[id]=merged;
  }return out;
 }
 function day(t=Date.now()){const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
 function activeEvents(data,recdel={}){return Object.entries(data.events||{}).filter(([,e])=>e.kind==='time'||e.t>(recdel[e.qid]??-1)).sort(([a,x],[b,y])=>x.t-y.t||a.localeCompare(b)).map(([id,e])=>({...e,id}))}
 function review(events){const out={};for(const e of events){if(e.kind==='time')continue;let r=out[e.qid];if(e.kind==='answer'&&e.correct&&!r)continue;
   r=out[e.qid]||{qid:e.qid,streak:0,wrongStreak:0,lapses:0,mastered:false,history:[]};
   if(e.kind==='answer'){if(e.correct){r.streak++;r.wrongStreak=0;r.interval=[3,7,14,30][Math.min(r.streak-1,3)]*DAY;r.mastered=r.streak>=3}else{r.streak=0;r.wrongStreak++;r.lapses++;r.interval=r.lapses===1?600000:DAY;r.mastered=false}}
   else if(e.kind==='master'){r.interval=14*DAY;r.mastered=true;r.manual=true}
   else{r.streak=0;r.mastered=false;r.interval=600000}
   r.last=e.t;r.due=e.t+r.interval;r.history.push(e);out[e.qid]=r;
  }return out;
 }
 function metrics(events,byId){const days={},courses={},kps={},latest={},questions=new Set();let correct=0,count=0;
  for(const e of events){const key=day(e.t),d=e.t>0?(days[key]??={answers:0,correct:0,reviews:0,seconds:0}):null;if(e.kind==='time'){if(d)d.seconds+=e.seconds;continue}if(e.kind!=='answer'||!byId.has(e.qid))continue;
   const q=byId.get(e.qid),c=courses[q.tk]??={count:0,correct:0,ids:new Set()},k=kps[q.kpid]??={id:q.kpid,tk:q.tk,key:q._key,name:q.kp,count:0,correct:0,last:0,wrongStreak:0};
   count++;correct+=+e.correct;if(d){d.answers++;d.correct+=+e.correct;d.reviews+=e.review?1:0}c.count++;c.correct+=+e.correct;c.ids.add(e.qid);k.count++;k.correct+=+e.correct;k.last=e.t;k.wrongStreak=e.correct?0:k.wrongStreak+1;questions.add(e.qid);latest[e.qid]={tk:q.tk,correct:e.correct,t:e.t};
  }return {count,correct,days,courses,kps,questions,latest};
 }
 function timer(d,now=Date.now()){const start=d.start??d.ts,deadline=d.deadline||start+(d.minutes||0)*60000;return {elapsed:Math.max(0,now-start),deadline,remaining:d.minutes?Math.max(0,deadline-now):null,timedOut:!!(d.timedOut||(d.minutes&&now>=deadline))}}
 function recommend(list,n,lastSeen={},now=Date.now(),random=Math.random){const fresh=list.filter(q=>now-(lastSeen[q.q]||0)>DAY),recent=list.filter(q=>!fresh.includes(q));function draw(pool){const bins=new Map();for(const q of pool){const key=(q.t||'single')+':'+(q.tag||'');if(!bins.has(key))bins.set(key,[]);bins.get(key).push(q)}for(const bin of bins.values())for(let i=bin.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[bin[i],bin[j]]=[bin[j],bin[i]]}const out=[];while([...bins.values()].some(x=>x.length))for(const bin of bins.values())if(bin.length)out.push(bin.pop());return out}return [...draw(fresh),...draw(recent)].slice(0,Math.min(n,list.length))}
 const api={DAY,safe,clean,merge,day,activeEvents,review,metrics,timer,recommend,validDraft};
 if(typeof module==='object')module.exports=api;root.LearningCore=api;
})(typeof window==='undefined'?globalThis:window);

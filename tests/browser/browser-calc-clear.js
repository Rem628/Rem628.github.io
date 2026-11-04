async page=>{
 if(!['127.0.0.1','localhost'].includes(new URL(page.url()).hostname))throw Error('These fixtures are restricted to a local disposable test site');
 const row=await page.evaluate(()=>Object.values(QUESTION_INDEX).flat().find(q=>q[3]==='calc'&&q[4]==='计算'));
 const ctx=await page.context().browser().newContext(),p=await ctx.newPage();await p.addInitScript(q=>{const d={id:'Eclear',tk:'XD',ts:Date.now(),updatedAt:Date.now(),qids:[q[0]],ans:{},notes:{},weights:{[q[0]]:12},total:12,minutes:0,mode:'custom'};localStorage.setItem('NEU-STATE:2109519881526317056',JSON.stringify({schema:4,drafts:{Eclear:d}}))},row);
 await p.goto('http://127.0.0.1:4173/Rem628.github.io/#exam-run');await p.locator('.calc-entry').waitFor();await p.locator('.calc-entry').fill('先写一段草稿');await p.locator('.calc-entry').fill('');await p.locator('[data-act=layout][data-value=list]').click();const header=await p.locator('.practice-heading').innerText();if(!header.includes('已答 0 / 1'))throw Error('Cleared calculation note counted as answered: '+header);await ctx.close();return {clearedNotesRemainUnanswered:true};
}

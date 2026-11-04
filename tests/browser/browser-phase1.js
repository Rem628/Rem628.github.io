async page=>{
 if(!['127.0.0.1','localhost'].includes(new URL(page.url()).hostname))throw Error('These fixtures are restricted to a local disposable test site');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{for(const k of await caches.keys())await caches.delete(k);for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister()});
 await page.goto('http://127.0.0.1:4173/Rem628.github.io/#home');await page.reload();await page.getByRole('heading',{name:'今天，从这里继续'}).waitFor();
 await page.goto('http://127.0.0.1:4173/Rem628.github.io/#practice/GS_0');await page.locator('.question-card').waitFor();
 const id=(await page.locator('.question-card').first().getAttribute('id')).slice(2);
 await page.locator('.option').first().click();await page.locator('.answer-result').waitFor();
 await page.locator('.q-top [data-act=favorite]').click();
 await page.getByRole('button',{name:'再练一次',exact:true}).click();await page.locator('.question-card').waitFor();
 if(await page.locator('.answer-result').count())throw Error('Retry exposes answer');
 await page.locator('.option').nth(1).click();await page.locator('.answer-result').waitFor();
 await page.getByRole('button',{name:'题目纠错',exact:true}).click();await page.getByLabel('补充说明').fill('浏览器回归测试：本地保存，不发送');await page.getByRole('button',{name:'保存到本地待提交'}).click();
 await page.goto('http://127.0.0.1:4173/Rem628.github.io/#analytics');await page.getByRole('heading',{name:'学习分析',exact:true}).waitFor();
 const metrics=await page.locator('.metric-grid').innerText();if(!metrics.includes('累计作答'))throw Error('Analytics unavailable');
 await page.goto('http://127.0.0.1:4173/Rem628.github.io/#smart-review');await page.getByRole('heading',{name:'智能复习',exact:true}).waitFor();
 await page.goto('http://127.0.0.1:4173/Rem628.github.io/#me');await page.getByLabel('主题设置').selectOption('dark');
 if(await page.locator('html').getAttribute('data-theme')!=='dark')throw Error('Theme failed');
 await page.getByRole('button',{name:'导出学习记录',exact:true}).click();await page.getByRole('heading',{name:'导出当前账号学习记录'}).waitFor();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'确认导出',exact:true}).click();const download=await downloadPromise;await download.saveAs('work/browser-backup.json');
 await page.goto('http://127.0.0.1:4173/Rem628.github.io/#search');await page.getByRole('heading',{name:'题库搜索',exact:true}).waitFor();await page.getByLabel('搜索题干、章节和知识点').fill('函数');await page.locator('#learning-search').getByRole('button',{name:'搜索',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#learning-results')?.textContent.includes('找到'));const search=await page.locator('#learning-results').innerText();
 if(errors.length)throw Error(errors.join(';'));return {id,metrics,search:search.slice(0,120),errors};
}

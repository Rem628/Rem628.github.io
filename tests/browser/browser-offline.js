async page=>{
 if(!['127.0.0.1','localhost'].includes(new URL(page.url()).hostname))throw Error('These fixtures are restricted to a local disposable test site');
 const base='http://127.0.0.1:4173/Rem628.github.io/';await page.goto(base+'#me');await page.getByRole('heading',{name:'我的学习空间'}).waitFor();await page.locator('[data-act=offline]').click();await page.getByRole('heading',{name:'离线资源',exact:true}).waitFor();
 await page.evaluate(async()=>{const c=await caches.open('mathbank-'+MB_VER);await c.delete(new URL('q_CY_0.js',location.href).href)});
 await page.context().route('**/q_CY_0.js',r=>r.fulfill({status:503,body:'intentional offline regression failure'}));
 await page.evaluate(()=>OfflineResources.download('CY'));const incomplete=await page.evaluate(()=>OfflineResources.inspect('CY'));if(!incomplete.missing.includes('q_CY_0.js'))throw Error('failed resource marked complete');const failureText=await page.locator('#offline-progress').innerText();
 await page.context().unroute('**/q_CY_0.js');await page.locator('[data-offline=retry]').click();await page.waitForFunction(()=>document.querySelector('#offline-progress').textContent.includes('全部资源校验通过'));const complete=await page.evaluate(()=>OfflineResources.inspect('CY'));if(complete.missing.length)throw Error('retry did not repair missing resources');
 let requests=0;const onRequest=()=>requests++;page.on('request',onRequest);await page.evaluate(()=>OfflineResources.download('CY'));page.off('request',onRequest);if(requests)throw Error('re-downloaded cached subject');
 await page.locator('[data-offline=download][data-subject=GS]').click();await page.locator('[data-offline-cancel]').click();await page.waitForFunction(()=>document.querySelector('#offline-progress').textContent.includes('已取消'));
 await page.locator('[data-act=close]').click();await page.context().setOffline(true);await page.goto(base+'#practice/CY_0');await page.reload();await page.locator('.question-card').waitFor();const offlineStem=await page.locator('.stem').first().innerText();if(!offlineStem)throw Error('offline text question missing');await page.context().setOffline(false);
 return {failureText,incomplete:incomplete.missing.length,repaired:complete.missing.length,cachedRerunRequests:requests,cancel:true,offlineReload:true};
}

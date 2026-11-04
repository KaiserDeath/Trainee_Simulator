import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../frontend/node_modules/playwright/index.mjs';
import AxeBuilder from '../../frontend/node_modules/@axe-core/playwright/dist/index.mjs';

const browser=await chromium.launch({headless:true});
const report={scope:'Standalone design preview with fictional data; no product or hosted verification',checks:[],screenshots:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const outgoing=[];page.on('request',request=>{if(/^https?:/.test(request.url()))outgoing.push(request.url());});
 for(const locale of ['en','es']){
  for(const view of ['home','catalog','module','trainer']){
   await page.goto(new URL(`./index.html#${view}`,import.meta.url).href);
   if(locale==='es')await page.getByRole('button',{name:'Español',exact:true}).click();
   assert.equal(await page.locator('html').getAttribute('lang'),locale);
   assert.equal(await page.locator('h1').count(),1);
   for(const width of [1440,320]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view}/${locale}/${width} overflow`);
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    assert.deepEqual(scan.violations.map(({id,nodes})=>({id,targets:nodes.map(node=>node.target)})),[],`${view}/${locale}/${width} accessibility`);
    const filename=`${view}-${locale}-${width}.png`;
    await page.screenshot({path:fileURLToPath(new URL(filename,import.meta.url)),fullPage:true});report.screenshots.push(filename);
   }
   report.checks.push(`${view}/${locale}: heading, 1440/320px reflow and automated accessibility scan`);
  }
 }
 await page.goto(new URL('./index.html#catalog',import.meta.url).href);
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByLabel('Search modules',{exact:true}).fill('nonexistent');
 assert.equal(await page.getByRole('heading',{name:'No matching modules',exact:true}).count(),1);
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 assert.equal(await page.locator('.catalog-card').count(),4);
 await page.getByLabel('Availability',{exact:true}).selectOption('available');
 assert.equal(await page.locator('.catalog-card').count(),1);
 await page.getByLabel('Search modules',{exact:true}).fill('customer');
 await page.getByRole('button',{name:'Español',exact:true}).click();
 assert.equal(await page.getByLabel('Buscar módulos',{exact:true}).inputValue(),'customer');
 assert.equal(await page.getByLabel('Disponibilidad',{exact:true}).inputValue(),'available');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByRole('link',{name:'Module workspace',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement===document.querySelector('h1'));
 assert.equal(await page.locator('h1').evaluate(element=>document.activeElement===element),true);
 await page.goBack();assert.ok(page.url().endsWith('#catalog'));
 await page.goForward();assert.ok(page.url().endsWith('#module'));
 await page.getByRole('button',{name:'Preview completion feedback',exact:true}).click();
 assert.match(await page.locator('#completion-notice').textContent(),/No progress was saved/);
 await page.getByRole('link',{name:'Capacitador overview',exact:true}).click();
 await page.getByRole('button',{name:'Update preview',exact:true}).click();
 assert.match(await page.locator('#snapshot').textContent(),/no server request/);
 assert.deepEqual(errors,[]);assert.deepEqual(outgoing,[]);
 report.checks.push('Search, availability filter, empty/reset state, language switch preserves filter inputs');
 report.checks.push('Navigation heading focus, browser Back/Forward, sample-only feedback and manual update');
 report.checks.push('No JavaScript errors or external HTTP requests');report.passed=true;
}catch(error){report.passed=false;report.failure=error.message;process.exitCode=1;console.error(error);}
finally{await browser.close();fs.writeFileSync(new URL('./verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}

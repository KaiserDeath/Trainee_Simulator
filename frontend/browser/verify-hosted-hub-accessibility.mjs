import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
// Read-only public deployed sign-in surface. No credentials, cookies or fixtures.
const origin='https://trainee-simulator.vercel.app';
const report={origin,generatedAt:new Date().toISOString(),scope:'public deployed Hub sign-in; no authenticated staff/assessment coverage',checks:[]};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();
 await page.goto(`${origin}/hub`);await page.getByLabel('Username',{exact:true}).waitFor({timeout:60000});
 if(process.argv.includes('--expect-accessibility-update')){
  const source=await page.locator('script[type="module"][src]').first().getAttribute('src');
  const bundle=await context.request.get(new URL(source,origin).href);assert.ok(bundle.ok());
  assert.ok((await bundle.text()).includes('hub-assessment-time-notice'),'The deployed bundle does not yet contain the assessment accessibility update');
  report.checks.push('Live production bundle contains the new assessment accessibility implementation');
 }
 for(const width of [1280,320]){
  await page.setViewportSize({width,height:900});
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(item=>item.id),[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  report.checks.push(`Live sign-in axe scan and horizontal-reflow check passed at ${width}px`);
 }
 await page.getByLabel('Username',{exact:true}).focus();await page.keyboard.press('Tab');
 assert.ok(await page.getByLabel('Password',{exact:true}).evaluate(element=>element===document.activeElement));
 report.checks.push('Keyboard moves from username to password');report.passed=true;
}catch(error){report.passed=false;report.failure=error.message.slice(0,300);process.exitCode=1;}
finally{
 await browser.close();const output=new URL('../../outputs/hub-release-acceptance-2026-11-04/hosted-public-accessibility.json',import.meta.url);
 fs.mkdirSync(new URL('.',output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}

import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.QA_URL||'http://127.0.0.1:8002';
const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Los_Angeles'});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await fs.mkdir('.qa',{recursive:true});
try{
  const auth=await context.request.post(base+'/api/auth',{data:{}});
  const token=(await auth.json()).token;
  const authHeaders={Authorization:`Bearer ${token}`};
  const summary=await (await context.request.get(base+'/api/summary',{headers:authHeaders})).json();
  assert(summary.dev_bypass&&summary.semesters.every(s=>s.name.startsWith('QA ·')),'Only the isolated QA fixture may be reset');
  const source=summary.components.flatMap(c=>c.sessions).sort((a,b)=>a.start.localeCompare(b.start));
  const dayKey=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
  const monthLabel=m=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Warsaw',month:'long',year:'numeric'}).format(new Date(m+'-01T12:00:00Z'));
  const shiftMonth=(m,n)=>{const d=new Date(m+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7)};
  let shownMonth=summary.today_date.slice(0,7);
  const pendingDays=new Map();for(const s of source.slice(2))if(s.finished){const d=dayKey(s.start);pendingDays.set(d,(pendingDays.get(d)||0)+1);}
  const chosenDay=[...pendingDays].filter(([d])=>d.slice(0,7)===shownMonth).sort((a,b)=>b[1]-a[1]||b[0].localeCompare(a[0]))[0][0];
  async function calendarDay(d){
    while(shownMonth<d.slice(0,7)){await page.getByRole('button',{name:'Следующий месяц'}).click();shownMonth=shiftMonth(shownMonth,1);}
    while(shownMonth>d.slice(0,7)){await page.getByRole('button',{name:'Предыдущий месяц'}).click();shownMonth=shiftMonth(shownMonth,-1);}
    const label=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Warsaw',day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00:00Z'));
    await page.getByRole('button',{name:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
  }
  const reset=await context.request.post(base+'/api/attendance',{headers:authHeaders,data:{request_id:crypto.randomUUID(),items:source.map((s,i)=>({session_id:s.id,version:s.attendance.version,status:i===0?'present':i===1?'absent':'unmarked',note:i<2?'Synthetic QA mark; not owner attendance':''}))}});
  assert(reset.ok(),'QA reset failed');
  await page.goto(base);
  await page.getByRole('heading',{name:'Обзор',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Посещения и пропуски'}).waitFor();
  await page.screenshot({path:'.qa/dashboard-desktop.png',fullPage:true});
  await page.setViewportSize({width:360,height:800});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overview overflow');
  await page.screenshot({path:'.qa/dashboard-mobile.png',fullPage:true});
  const initial=Number(await page.locator('.counters button').first().locator('strong').textContent());assert(initial>3);
  await page.locator('.counters button').first().click();
  await expect(page.getByRole('button',{name:'Список',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.unmarked-toggle')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial);
  await page.screenshot({path:'.qa/unmarked-mobile.png',fullPage:true});
  const first=page.locator('.schedule-lesson').first();
  const firstID=await first.getAttribute('data-session-id');
  await first.getByRole('button',{name:'Был',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Отметки сохранены');
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial-1);
  await expect(page.locator('.unmarked-toggle')).toContainText(String(initial-1));
  await page.locator('.save-status').getByRole('button',{name:'Отменить',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Последняя отметка отменена');
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial);
  // Batch across unrelated components, one atomic save and one group undo.
  const checkboxes=page.locator('.lesson-select input');
  for(let i=0;i<3;i++)await checkboxes.nth(i).check();
  await expect(page.locator('.batch-mark-bar')).toContainText('3');
  await page.locator('.batch-mark-bar').getByRole('button',{name:'Был',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Отметки сохранены');
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial-3);
  await page.locator('.save-status').getByRole('button',{name:'Отменить',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Последняя отметка отменена');
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial);
  // A rejected batch leaves all original rows and can be retried.
  await checkboxes.nth(0).check();await checkboxes.nth(1).check();
  await page.route('**/api/attendance',route=>route.abort());
  await page.locator('.batch-mark-bar').getByRole('button',{name:'Пропустил',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Нет связи'}).waitFor();
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial);
  await page.unroute('**/api/attendance');
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Отметки сохранены');
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial-2);
  await page.locator('.save-status').getByRole('button',{name:'Отменить',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Последняя отметка отменена');
  await expect(page.locator('.schedule-lesson')).toHaveCount(initial);
  // Calendar: exact day, unmarked filter, details close back to calendar.
  await page.getByRole('button',{name:'Календарь',exact:true}).click();
  await calendarDay(chosenDay);
  await expect(page.locator('.schedule-lesson')).toHaveCount(pendingDays.get(chosenDay));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'calendar overflow');
  await page.screenshot({path:'.qa/calendar-mobile.png',fullPage:true});
  await page.locator('.schedule-subject').first().click();
  await page.getByRole('heading',{name:'Детали занятия',exact:true}).waitFor();
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await expect(page.getByRole('button',{name:'Календарь',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Предыдущий месяц'}).click();
  await expect(page.locator('.calendar-heading')).toContainText(monthLabel(shiftMonth(shownMonth,-1)));
  await page.getByRole('button',{name:'Следующий месяц'}).click();
  await expect(page.locator('.calendar-heading')).toContainText(monthLabel(shownMonth));
  await calendarDay(chosenDay);
  await page.locator('.unmarked-toggle').click();
  await calendarDay(dayKey(source[0].start));
  await page.locator(`[data-session-id="${source[0].id}"]`).getByRole('button',{name:'Пропустил',exact:true}).click();
  await expect(page.locator('.save-status')).toContainText('Отметки сохранены');
  await expect(page.locator(`[data-session-id="${source[0].id}"]`)).toHaveClass(/absent/);
  // Future sessions are visible without actual attendance controls.
  await calendarDay(dayKey(source.find(s=>!s.finished&&!s.cancelled).start));
  assert(await page.locator('.schedule-lesson').count()>0);
  await expect(page.locator('.mark-button')).toHaveCount(0);
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.getByRole('button',{name:'Тёмная',exact:true}).click();
  await page.getByRole('button',{name:'Сегодня',exact:true}).last().click();
  await page.getByRole('button',{name:'Календарь',exact:true}).click();
  await page.getByRole('button',{name:'К сегодняшнему дню'}).click();
  await page.screenshot({path:'.qa/calendar-mobile-dark.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'.qa/calendar-desktop-dark.png',fullPage:true});
  await page.getByRole('button',{name:'Обзор',exact:true}).click();
  await page.screenshot({path:'.qa/dashboard-desktop-dark.png',fullPage:true});
  // Confirm dashboard counts agree with the marked history after reload.
  await page.reload();await page.getByRole('heading',{name:'Посещения и пропуски'}).waitFor();
  await expect(page.locator('.history-metric').nth(0).locator('strong')).toHaveText('0');
  await expect(page.locator('.history-metric').nth(1).locator('strong')).toHaveText('2');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: dashboard, 360px/desktop, both themes, backlog across courses, single and atomic batch marks/undo, network rollback/retry, month navigation/day selection, context-preserving details, future protection and persisted analytics.');
}catch(error){await page.screenshot({path:'.qa/calendar-failure.png',fullPage:true});throw error}finally{await browser.close()}

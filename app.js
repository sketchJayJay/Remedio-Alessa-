const SETTINGS='alessa-fixed-med-settings-v3';
const TAKEN='alessa-fixed-med-taken-v3';
const NOTIFIED='alessa-fixed-med-notified-v3';
const DRAFT='alessa-config-draft-v12';
const PUSH_ENABLED='alessa-ios-push-enabled-v12';
const DEVICE_KEY='alessa-ios-device-id-v12';

const meds={
  tetra:{name:'Tetraciclina 500 mg',dose:'1 comprimido/cápsula'},
  metro:{name:'Metronidazol 250 mg',dose:'2 comprimidos'},
  bismuto:{name:'Subcitrato de bismuto 120 mg',dose:'1 comprimido'},
  esio:{name:'ESIO 20 mg',dose:'1 comprimido'}
};

const $=id=>document.getElementById(id);
const els={
  six:$('sixHourStart'),eight:$('eightHourStart'),breakfast:$('breakfastTime'),dinner:$('dinnerTime'),
  start:$('startDateInput'),days:$('daysInput'),save:$('saveBtn'),reminder:$('reminderBtn'),list:$('scheduleList'),
  nextCard:$('nextCard'),nextLabel:$('nextLabel'),nextTime:$('nextTime'),nextMedicine:$('nextMedicine'),
  countdown:$('countdown'),pendingCount:$('pendingCount'),takeCurrent:$('takeCurrentBtn'),afterNext:$('afterNext'),
  lastTakenTime:$('lastTakenTime'),lastTakenMedicine:$('lastTakenMedicine'),pushBtn:$('pushBtn'),pushStatus:$('pushStatus')
};

let settings=load(SETTINGS,{sixHourStart:'',eightHourStart:'',breakfastTime:'',dinnerTime:'',startDate:todayISO(),days:14});
let taken=load(TAKEN,{});
let notified=load(NOTIFIED,{});
let currentActionSlots=[];
let pushEnabled=localStorage.getItem(PUSH_ENABLED)==='1';
let deviceId=localStorage.getItem(DEVICE_KEY)||'';
if(!deviceId){deviceId=(crypto.randomUUID?crypto.randomUUID():'dev-'+Date.now()+'-'+Math.random().toString(16).slice(2));localStorage.setItem(DEVICE_KEY,deviceId);}

function clone(v){return JSON.parse(JSON.stringify(v))}
function load(k,f){try{const v=localStorage.getItem(k);return v?JSON.parse(v):clone(f)}catch{return clone(f)}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
function pad(n){return String(n).padStart(2,'0')}
function todayISO(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function localDateTime(dateISO,time){const [y,m,d]=dateISO.split('-').map(Number);const [hh,mm]=time.split(':').map(Number);return new Date(y,m-1,d,hh,mm,0,0)}
function addDays(dateISO,days){const [y,m,d]=dateISO.split('-').map(Number);const x=new Date(y,m-1,d+days);return todayISO(x)}
function formatTime(d){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function medText(slot){return slot.list.map(x=>`${x.name} · ${x.dose}`).join(' + ')}
function configured(){return !!(settings.sixHourStart&&settings.eightHourStart&&settings.breakfastTime&&settings.dinnerTime&&settings.startDate)}

function buildAllOccurrences(){
  if(!configured()) return [];
  const days=Math.max(1,Number(settings.days)||14);
  const out=[];
  const treatmentStart=localDateTime(settings.startDate,settings.sixHourStart);
  const treatmentEnd=new Date(treatmentStart.getTime()+days*24*60*60*1000);

  function addInterval(startTime,hours,list,group,title){
    let dt=localDateTime(settings.startDate,startTime);
    while(dt<treatmentEnd){
      const stamp=dt.getTime();
      out.push({id:`${group}-${stamp}`,stamp,dt:new Date(stamp),time:formatTime(dt),dateISO:todayISO(dt),list,group,title});
      dt=new Date(dt.getTime()+hours*60*60*1000);
    }
  }

  addInterval(settings.sixHourStart,6,[meds.tetra,meds.bismuto],'six','A cada 6 horas');
  addInterval(settings.eightHourStart,8,[meds.metro],'eight','A cada 8 horas');

  for(let i=0;i<days;i++){
    const dateISO=addDays(settings.startDate,i);
    const mealSlots=[
      {meal:'Antes do café da manhã',base:settings.breakfastTime,key:'breakfast'},
      {meal:'Antes do jantar',base:settings.dinnerTime,key:'dinner'}
    ];
    for(const item of mealSlots){
      const base=localDateTime(dateISO,item.base);
      const dt=new Date(base.getTime()-20*60*1000);
      const stamp=dt.getTime();
      out.push({id:`meal-${item.key}-${stamp}`,stamp,dt,time:formatTime(dt),dateISO:todayISO(dt),list:[meds.esio],group:'meals',title:'Antes das refeições',meal:item.meal});
    }
  }
  return out.sort((a,b)=>a.stamp-b.stamp);
}

function todayGroups(all=buildAllOccurrences()){
  const iso=todayISO();
  const todays=all.filter(x=>x.dateISO===iso);
  return {
    six:todays.filter(x=>x.group==='six'),
    eight:todays.filter(x=>x.group==='eight'),
    meals:todays.filter(x=>x.group==='meals')
  };
}

function isTaken(slot){return !!taken[slot.id]}
function markTaken(slots){
  const now=Date.now();
  slots.forEach(slot=>{taken[slot.id]={takenAt:now,scheduledAt:slot.stamp};});
  save(TAKEN,taken);
  renderSchedule();
  refreshLive();
  if(pushEnabled) syncPushSchedule(false);
}
function unmarkTaken(slot){
  delete taken[slot.id];
  save(TAKEN,taken);
  renderSchedule();
  refreshLive();
  if(pushEnabled) syncPushSchedule(false);
}

function combineSameTime(slots){
  const byStamp=new Map();
  slots.forEach(slot=>{
    if(!byStamp.has(slot.stamp))byStamp.set(slot.stamp,{stamp:slot.stamp,dt:slot.dt,time:slot.time,slots:[],list:[]});
    const g=byStamp.get(slot.stamp);g.slots.push(slot);g.list.push(...slot.list);
  });
  return [...byStamp.values()].sort((a,b)=>a.stamp-b.stamp);
}

function appendGroup(title,subtitle,slots){
  if(!slots.length)return;
  const wrap=document.createElement('section');wrap.className='schedule-group';
  const head=document.createElement('div');head.className='schedule-group-head';
  head.innerHTML=`<div><strong>${title}</strong>${subtitle?`<span>${subtitle}</span>`:''}</div>`;wrap.appendChild(head);
  slots.forEach(slot=>{
    const node=$('itemTemplate').content.cloneNode(true);
    const row=node.querySelector('.schedule-item');
    node.querySelector('.time').textContent=slot.time;
    node.querySelector('.medicine').textContent=slot.list.map(x=>x.name).join(' + ');
    const doseText=slot.list.map(x=>x.dose).join(' • ');
    node.querySelector('.dose').textContent=slot.meal?`${doseText} • ${slot.meal}`:doseText;
    const status=node.querySelector('.item-status');
    const btn=node.querySelector('.take-btn');
    if(isTaken(slot)){
      row.classList.add('done');status.textContent='✓ Tomado';btn.textContent='Desmarcar';btn.classList.add('done-btn');
      btn.addEventListener('click',()=>unmarkTaken(slot));
    }else{
      if(slot.stamp<=Date.now()){row.classList.add('pending');status.textContent='⚠️ Ainda não marcado';}
      else status.textContent='Programado';
      btn.addEventListener('click',()=>markTaken([slot]));
    }
    wrap.appendChild(node);
  });
  els.list.appendChild(wrap);
}

function renderSchedule(){
  const all=buildAllOccurrences();
  const groups=todayGroups(all);
  els.list.innerHTML='';
  if(!configured()){
    els.list.innerHTML='<div class="empty">Os remédios já estão cadastrados.<br>Configure os horários abaixo e toque em “Salvar horários”.</div>';
    return;
  }
  if(!groups.six.length&&!groups.eight.length&&!groups.meals.length){
    els.list.innerHTML='<div class="empty">Não há horários deste tratamento programados para hoje.</div>';
    return;
  }
  appendGroup('A cada 6 horas','Tetraciclina + Subcitrato de bismuto',groups.six);
  appendGroup('A cada 8 horas','Metronidazol',groups.eight);
  appendGroup('Antes das refeições','ESIO 20 mg',groups.meals);
}

function getLastTaken(all){
  return all.filter(s=>taken[s.id]).sort((a,b)=>(taken[b.id]?.takenAt||0)-(taken[a.id]?.takenAt||0))[0]||null;
}

function getStatus(all){
  const now=Date.now();
  const today=all.filter(s=>s.dateISO===todayISO());
  const overdue=today.filter(s=>s.stamp<=now&&!isTaken(s));
  const future=all.filter(s=>s.stamp>now&&!isTaken(s));
  if(overdue.length){
    const firstStamp=Math.min(...overdue.map(s=>s.stamp));
    const due=overdue.filter(s=>s.stamp===firstStamp);
    return {mode:'pending',primary:combineSameTime(due)[0],pendingCount:combineSameTime(overdue).length,future:combineSameTime(future)[0]||null};
  }
  return {mode:'next',primary:combineSameTime(future)[0]||null,pendingCount:0,future:null};
}

function renderLastTaken(all){
  const last=getLastTaken(all);
  if(!last){
    els.lastTakenTime.textContent='Nada marcado ainda';
    els.lastTakenMedicine.textContent='Toque em “Tomei” depois de cada horário.';
    return;
  }
  const same=all.filter(s=>s.stamp===last.stamp&&isTaken(s));
  els.lastTakenTime.textContent=`${last.dateISO===todayISO()?'Hoje':'Dia '+last.dateISO.split('-').reverse().join('/')} • ${last.time}`;
  els.lastTakenMedicine.textContent=same.flatMap(s=>s.list).map(m=>m.name).join(' + ');
}

function renderStatus(all){
  const status=getStatus(all);
  currentActionSlots=[];
  els.nextCard.classList.remove('overdue');
  els.takeCurrent.classList.add('hidden');
  els.afterNext.textContent='';
  els.pendingCount.textContent='';

  if(!status.primary){
    els.nextLabel.textContent='TRATAMENTO';
    els.nextTime.textContent='✓';
    els.nextMedicine.textContent=configured()?'Nenhum horário pendente no cronograma.':'Configure os horários uma vez';
    els.countdown.textContent='';
    return;
  }

  const p=status.primary;
  if(status.mode==='pending'){
    els.nextCard.classList.add('overdue');
    els.nextLabel.textContent='⚠️ PENDENTE';
    els.nextTime.textContent=p.time;
    els.nextMedicine.textContent=medText(p);
    const mins=Math.max(0,Math.floor((Date.now()-p.stamp)/60000));
    els.countdown.textContent=mins<1?'É o horário agora':`Esse horário passou há ${Math.floor(mins/60)?Math.floor(mins/60)+'h ':''}${mins%60}min`;
    if(status.pendingCount>1)els.pendingCount.textContent=`${status.pendingCount} horários sem marcar`;
    currentActionSlots=p.slots;
    els.takeCurrent.classList.remove('hidden');
    if(status.future)els.afterNext.textContent=`Depois: ${status.future.time} • ${medText(status.future)}`;
  }else{
    els.nextLabel.textContent='PRÓXIMO REMÉDIO';
    els.nextTime.textContent=p.time;
    els.nextMedicine.textContent=medText(p);
    const mins=Math.max(0,Math.ceil((p.stamp-Date.now())/60000));
    els.countdown.textContent=mins===0?'É agora 💊':`em ${Math.floor(mins/60)?Math.floor(mins/60)+'h ':''}${mins%60}min`;
  }
}

function refreshLive(){
  const all=buildAllOccurrences();
  renderLastTaken(all);
  renderStatus(all);
}

function getDraft(){
  try{return JSON.parse(sessionStorage.getItem(DRAFT)||'null')}catch{return null}
}
function setDraft(){
  const draft={
    sixHourStart:els.six.value,
    eightHourStart:els.eight.value,
    breakfastTime:els.breakfast.value,
    dinnerTime:els.dinner.value,
    startDate:els.start.value,
    days:els.days.value
  };
  try{sessionStorage.setItem(DRAFT,JSON.stringify(draft))}catch{}
}
function clearDraft(){try{sessionStorage.removeItem(DRAFT)}catch{}}

function fillSettingsFormOnce(){
  const draft=getDraft();
  const src=draft||settings;
  els.six.value=src.sixHourStart||'';
  els.eight.value=src.eightHourStart||'';
  els.breakfast.value=src.breakfastTime||'';
  els.dinner.value=src.dinnerTime||'';
  els.start.value=src.startDate||todayISO();
  els.days.value=src.days||14;
}

function saveSettings(showMessage=true){
  if(!els.six.value||!els.eight.value||!els.breakfast.value||!els.dinner.value){
    alert('Preencha os quatro horários-base.');
    return false;
  }
  settings={
    sixHourStart:els.six.value,
    eightHourStart:els.eight.value,
    breakfastTime:els.breakfast.value,
    dinnerTime:els.dinner.value,
    startDate:els.start.value||todayISO(),
    days:Math.max(1,Number(els.days.value)||14)
  };
  save(SETTINGS,settings);
  clearDraft();
  renderSchedule();
  refreshLive();
  if(pushEnabled) syncPushSchedule(false);
  if(showMessage) alert('Horários salvos certinho.');
  return true;
}

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=atob(base64);
  return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
}

function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}

function getPushSchedule(){
  if(!configured())return [];
  const pending=buildAllOccurrences().filter(slot=>!isTaken(slot));
  return combineSameTime(pending).map(group=>({
    id:String(group.stamp),
    stamp:group.stamp,
    title:`💊 ${group.time} • Hora do remédio`,
    body:medText(group)
  }));
}

async function getRegistration(){
  if(!('serviceWorker' in navigator))throw new Error('service-worker');
  const reg=await navigator.serviceWorker.register('sw.js?v=12',{updateViaCache:'none'});
  await reg.update().catch(()=>{});
  return navigator.serviceWorker.ready;
}

async function syncPushSchedule(showMessage=false){
  if(!pushEnabled||!configured())return false;
  try{
    const res=await fetch('/api/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,schedule:getPushSchedule()})});
    if(!res.ok){
      if(res.status===404){pushEnabled=false;localStorage.removeItem(PUSH_ENABLED);updatePushStatus('As notificações precisam ser ativadas novamente.');}
      return false;
    }
    if(showMessage)alert('Cronograma dos avisos atualizado no iPhone.');
    return true;
  }catch{return false}
}

function updatePushStatus(custom=''){
  if(!els.pushStatus||!els.pushBtn)return;
  if(custom){els.pushStatus.textContent=custom;return}
  if(pushEnabled){
    els.pushStatus.textContent='Avisos ativos. O iPhone pode notificar mesmo bloqueado e com o app fechado.';
    els.pushBtn.textContent='✓ Avisos ativos';
    els.pushBtn.classList.add('active');
  }else{
    els.pushStatus.textContent=isIOS()&&!isStandalone()?'No Safari: Compartilhar → Adicionar à Tela de Início. Depois abra pelo ícone.':'Toque para permitir notificações e enviar um teste.';
    els.pushBtn.textContent='🔔 Ativar avisos';
    els.pushBtn.classList.remove('active');
  }
}

async function enableIphonePush(){
  if(isIOS()&&!isStandalone()){
    alert('No iPhone, primeiro abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois abra o app pelo novo ícone e toque em “Ativar avisos”.');
    updatePushStatus();
    return;
  }
  if(!('Notification' in window)||!('PushManager' in window)){
    alert('Este navegador não oferece notificações push para este app. No iPhone, abra pelo ícone adicionado à Tela de Início.');
    return;
  }
  try{
    const reg=await getRegistration();
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      updatePushStatus('Permissão de notificações não foi liberada no iPhone.');
      return;
    }
    const keyRes=await fetch('/api/vapid-public-key',{cache:'no-store'});
    if(!keyRes.ok)throw new Error('vapid');
    const {publicKey}=await keyRes.json();
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription){
      subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)});
    }
    const res=await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,subscription,schedule:getPushSchedule()})});
    if(!res.ok)throw new Error('subscribe');
    pushEnabled=true;localStorage.setItem(PUSH_ENABLED,'1');updatePushStatus();
    await fetch('/api/test-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId})}).catch(()=>{});
    alert('Pronto! Enviei uma notificação de teste. Deixe “Sons” ativado em Ajustes → Notificações para ouvir o aviso com a tela bloqueada.');
  }catch(err){
    console.error(err);
    updatePushStatus('Não consegui ativar agora. Confira se abriu o app pelo ícone da Tela de Início e tente novamente.');
  }
}

async function restorePushState(){
  updatePushStatus();
  if(!pushEnabled)return;
  try{
    const reg=await getRegistration();
    const sub=await reg.pushManager.getSubscription();
    if(!sub){pushEnabled=false;localStorage.removeItem(PUSH_ENABLED);updatePushStatus();return;}
    const res=await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,subscription:sub,schedule:getPushSchedule()})});
    if(!res.ok)throw new Error('restore');
    updatePushStatus();
  }catch{updatePushStatus('Avisos salvos no iPhone, mas o servidor não respondeu agora.');}
}

function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n')}
function icsDate(dt){return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`}
function createReminders(){
  if(!saveSettings(false))return;
  const combined=combineSameTime(buildAllOccurrences());
  if(!combined.length){alert('Salve os horários primeiro.');return}
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
  let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Remedios da Alessa//PT-BR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
  combined.forEach((slot,i)=>{
    const title='🔔 REMÉDIO '+slot.time+' • '+medText(slot);
    ics+='BEGIN:VEVENT\r\n';
    ics+=`UID:alessa-v12-${i}-${slot.stamp}@lembretes\r\nDTSTAMP:${stamp}\r\n`;
    ics+=`DTSTART:${icsDate(slot.dt)}\r\n`;
    ics+=`SUMMARY:${icsEscape(title)}\r\nDESCRIPTION:${icsEscape('Hora do remédio: '+medText(slot))}\r\n`;
    ics+='BEGIN:VALARM\r\nTRIGGER:PT0M\r\nACTION:DISPLAY\r\nDESCRIPTION:🔔 Hora do remédio\r\nEND:VALARM\r\nEND:VEVENT\r\n';
  });
  ics+='END:VCALENDAR\r\n';
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='lembretes-remedios-alessa.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
  alert('Lembretes criados. Ao adicionar ao calendário, o celular usa o som/aviso configurado para o Calendário.');
}

// Guarda o que a pessoa está digitando, mas NUNCA reescreve os campos durante a atualização automática.
[els.six,els.eight,els.breakfast,els.dinner,els.start,els.days].forEach(input=>{
  input.addEventListener('input',setDraft);
  input.addEventListener('change',setDraft);
});

els.save.addEventListener('click',()=>saveSettings(true));
els.reminder.addEventListener('click',createReminders);
els.pushBtn.addEventListener('click',enableIphonePush);
els.takeCurrent.addEventListener('click',()=>{if(currentActionSlots.length)markTaken(currentActionSlots)});

fillSettingsFormOnce();
renderSchedule();
refreshLive();
restorePushState();

// A atualização automática mexe SOMENTE no status do tratamento e no alarme.
// Os inputs de configuração ficam completamente fora deste ciclo.
setInterval(()=>{refreshLive();},15000);

// Atualiza o service worker e evita que uma versão antiga continue presa no celular.
if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('sw.js?v=12',{updateViaCache:'none'});
      await reg.update();
    }catch{}
  });
}

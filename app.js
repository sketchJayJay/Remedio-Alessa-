const SETTINGS='alessa-fixed-med-settings-v3';
const TAKEN='alessa-fixed-med-taken-v3';
const NOTIFIED='alessa-fixed-med-notified-v3';

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
  lastTakenTime:$('lastTakenTime'),lastTakenMedicine:$('lastTakenMedicine'),soundBtn:$('soundBtn'),alarmStatus:$('alarmStatus')
};

let settings=load(SETTINGS,{sixHourStart:'',eightHourStart:'',breakfastTime:'',dinnerTime:'',startDate:todayISO(),days:14});
let taken=load(TAKEN,{});
let notified=load(NOTIFIED,{});
let currentActionSlots=[];
let audioCtx=null;
let soundArmed=false;
let lastAlarmAt=0;

function load(k,f){try{const v=localStorage.getItem(k);return v?JSON.parse(v):structuredCloneSafe(f)}catch{return structuredCloneSafe(f)}}
function structuredCloneSafe(v){return JSON.parse(JSON.stringify(v))}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
function pad(n){return String(n).padStart(2,'0')}
function todayISO(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function localDateTime(dateISO,time){const [y,m,d]=dateISO.split('-').map(Number);const [hh,mm]=time.split(':').map(Number);return new Date(y,m-1,d,hh,mm,0,0)}
function addDays(dateISO,days){const [y,m,d]=dateISO.split('-').map(Number);const x=new Date(y,m-1,d+days);return todayISO(x)}
function formatTime(d){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function medText(slot){return slot.list.map(x=>`${x.name} · ${x.dose}`).join(' + ')}
function sameMinute(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()&&a.getHours()===b.getHours()&&a.getMinutes()===b.getMinutes()}

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
      {meal:'Antes do café da manhã',base:settings.breakfastTime},
      {meal:'Antes do jantar',base:settings.dinnerTime}
    ];
    for(const item of mealSlots){
      const base=localDateTime(dateISO,item.base);
      const dt=new Date(base.getTime()-20*60*1000);
      const stamp=dt.getTime();
      out.push({id:`meal-${item.meal.includes('café')?'breakfast':'dinner'}-${stamp}`,stamp,dt,time:formatTime(dt),dateISO:todayISO(dt),list:[meds.esio],group:'meals',title:'Antes das refeições',meal:item.meal});
    }
  }
  return out.sort((a,b)=>a.stamp-b.stamp);
}

function todayGroups(){
  const iso=todayISO();
  const all=buildAllOccurrences().filter(x=>x.dateISO===iso);
  return {
    six:all.filter(x=>x.group==='six'),
    eight:all.filter(x=>x.group==='eight'),
    meals:all.filter(x=>x.group==='meals')
  };
}

function isTaken(slot){return !!taken[slot.id]}
function markTaken(slots){
  const now=Date.now();
  slots.forEach(slot=>{taken[slot.id]={takenAt:now,scheduledAt:slot.stamp};});
  save(TAKEN,taken);
  render();
}
function unmarkTaken(slot){delete taken[slot.id];save(TAKEN,taken);render()}

function combineSameTime(slots){
  if(!slots.length)return [];
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
    const done=isTaken(slot);
    const now=Date.now();
    if(done){
      row.classList.add('done');status.textContent='✓ Tomado';btn.textContent='Desmarcar';btn.classList.add('done-btn');
      btn.addEventListener('click',()=>unmarkTaken(slot));
    }else{
      if(slot.stamp<=now){row.classList.add('pending');status.textContent='⚠️ Ainda não marcado';}
      else status.textContent='Próximo horário';
      btn.addEventListener('click',()=>markTaken([slot]));
    }
    wrap.appendChild(node);
  });
  els.list.appendChild(wrap);
}

function getLastTaken(all){
  const marked=all.filter(s=>taken[s.id]).sort((a,b)=>(taken[b.id]?.takenAt||0)-(taken[a.id]?.takenAt||0));
  return marked[0]||null;
}

function getStatus(all){
  const now=Date.now();
  const today=all.filter(s=>s.dateISO===todayISO());
  const overdue=today.filter(s=>s.stamp<=now&&!isTaken(s));
  const future=all.filter(s=>s.stamp>now&&!isTaken(s));

  // Mantém um horário já passado como pendente. Assim o app não pula direto para um horário futuro.
  if(overdue.length){
    const firstStamp=Math.min(...overdue.map(s=>s.stamp));
    const due=overdue.filter(s=>s.stamp===firstStamp);
    return {mode:'pending',primary:combineSameTime(due)[0],pendingCount:combineSameTime(overdue).length,future:combineSameTime(future)[0]||null};
  }
  return {mode:'next',primary:combineSameTime(future)[0]||null,pendingCount:0,future:null};
}

function renderLastTaken(all){
  const last=getLastTaken(all);
  if(!last){els.lastTakenTime.textContent='Nada marcado ainda';els.lastTakenMedicine.textContent='Toque em “Tomei” depois de cada horário.';return}
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
    els.nextLabel.textContent='TRATAMENTO';els.nextTime.textContent='✓';els.nextMedicine.textContent=configured()?'Nenhum horário pendente no cronograma.':'Configure os horários uma vez';els.countdown.textContent='';return;
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

function fillSettingsForm(){
  els.six.value=settings.sixHourStart||'';
  els.eight.value=settings.eightHourStart||'';
  els.breakfast.value=settings.breakfastTime||'';
  els.dinner.value=settings.dinnerTime||'';
  els.start.value=settings.startDate||todayISO();
  els.days.value=settings.days||14;
}

function render(){
  // Não mexe nos campos de configuração durante as atualizações automáticas.
  // No iPhone, reatribuir o valor do <input type="time"> enquanto o seletor está
  // aberto pode fechar/trocar o horário e dá a impressão de que a tela está bugando.
  const all=buildAllOccurrences();
  const groups=todayGroups();
  els.list.innerHTML='';
  if(!configured()){
    els.list.innerHTML='<div class="empty">Os remédios já estão cadastrados.<br>Configure os horários abaixo e o cronograma aparece aqui automaticamente.</div>';
  }else if(!groups.six.length&&!groups.eight.length&&!groups.meals.length){
    els.list.innerHTML='<div class="empty">Não há horários deste tratamento programados para hoje.</div>';
  }else{
    appendGroup('A cada 6 horas','Tetraciclina + Subcitrato de bismuto',groups.six);
    appendGroup('A cada 8 horas','Metronidazol',groups.eight);
    appendGroup('Antes das refeições','ESIO 20 mg',groups.meals);
  }
  renderLastTaken(all);renderStatus(all);
}

function saveSettings(){
  if(!els.six.value||!els.eight.value||!els.breakfast.value||!els.dinner.value){alert('Preencha os quatro horários-base.');return false}
  settings={sixHourStart:els.six.value,eightHourStart:els.eight.value,breakfastTime:els.breakfast.value,dinnerTime:els.dinner.value,startDate:els.start.value||todayISO(),days:Math.max(1,Number(els.days.value)||14)};
  save(SETTINGS,settings);render();return true;
}

async function armSound(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){els.alarmStatus.textContent='Este navegador não libera alarme sonoro do app.';return}
    if(!audioCtx)audioCtx=new AC();
    if(audioCtx.state==='suspended')await audioCtx.resume();
    soundArmed=true;
    els.soundBtn.textContent='🔊 Som ativado';els.soundBtn.classList.add('active');
    els.alarmStatus.textContent='Alarme armado. Enquanto o app estiver aberto, ele toca no horário.';
    playAlarm(false);
    if('Notification'in window&&Notification.permission==='default'){try{await Notification.requestPermission()}catch{}}
  }catch{els.alarmStatus.textContent='Não foi possível liberar o som neste navegador.';}
}

function tone(freq,start,duration,volume=.12){
  if(!audioCtx)return;
  const osc=audioCtx.createOscillator();const gain=audioCtx.createGain();
  osc.type='square';osc.frequency.setValueAtTime(freq,start);gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.02);gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
  osc.connect(gain);gain.connect(audioCtx.destination);osc.start(start);osc.stop(start+duration+.03);
}
function playAlarm(full=true){
  if(!soundArmed||!audioCtx)return;
  const base=audioCtx.currentTime+.03;const repeats=full?8:2;
  for(let i=0;i<repeats;i++)tone(i%2?740:980,base+i*.32,.20,full?.16:.07);
  if(navigator.vibrate&&full)navigator.vibrate([250,120,250,120,400]);
}

async function showOpenNotification(group){
  if(!('Notification'in window)||Notification.permission!=='granted')return;
  const body=medText(group);
  try{
    if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.ready;await reg.showNotification('🔔 Hora do remédio',{body,icon:'icon.svg',tag:`alessa-${group.stamp}`,renotify:true});}
    else new Notification('🔔 Hora do remédio',{body,icon:'icon.svg'});
  }catch{}
}

function checkAlarm(){
  if(!configured())return;
  const all=buildAllOccurrences();const now=new Date();
  const dueGroups=combineSameTime(all.filter(s=>!isTaken(s)&&s.dateISO===todayISO()&&s.stamp<=now.getTime()));
  if(!dueGroups.length)return;
  // Para o som, usa o horário pendente MAIS RECENTE. Assim um horário antigo não impede o alarme do horário atual.
  const due=dueGroups[dueGroups.length-1];
  // Só dispara som automaticamente até 60 min depois do horário. Depois continua aparecendo como pendente, sem sirene infinita.
  const lateMs=now.getTime()-due.stamp;
  if(lateMs>60*60*1000)return;
  const key=`${todayISO()}_${due.stamp}`;
  if(!notified[key]){notified[key]=Date.now();save(NOTIFIED,notified);showOpenNotification(due);}
  if(soundArmed&&Date.now()-lastAlarmAt>=60000){lastAlarmAt=Date.now();playAlarm(true);}
}

function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n')}
function icsDate(dt){return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`}
function createReminders(){
  if(!saveSettings())return;
  const combined=combineSameTime(buildAllOccurrences());if(!combined.length){alert('Salve os horários primeiro.');return}
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Remedios da Alessa//PT-BR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
  combined.forEach((slot,i)=>{const title='🔔 REMÉDIO '+slot.time+' • '+medText(slot);ics+='BEGIN:VEVENT\r\n';ics+=`UID:alessa-v9-${i}-${slot.stamp}@lembretes\r\nDTSTAMP:${stamp}\r\n`;ics+=`DTSTART:${icsDate(slot.dt)}\r\n`;ics+=`SUMMARY:${icsEscape(title)}\r\nDESCRIPTION:${icsEscape('Hora do remédio: '+medText(slot))}\r\n`;ics+='BEGIN:VALARM\r\nTRIGGER:PT0M\r\nACTION:DISPLAY\r\nDESCRIPTION:🔔 Hora do remédio\r\nEND:VALARM\r\nEND:VEVENT\r\n';});ics+='END:VCALENDAR\r\n';
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lembretes-remedios-alessa.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);alert('Lembretes criados. Ao adicionar ao calendário, o celular usa o som/aviso configurado para o Calendário.');
}

els.save.addEventListener('click',async()=>{if(saveSettings()){alert('Horários salvos. Agora marque “Tomei” depois de cada dose para o app não pular um horário pendente.');}});
els.reminder.addEventListener('click',createReminders);
els.soundBtn.addEventListener('click',armSound);
els.takeCurrent.addEventListener('click',()=>{if(currentActionSlots.length)markTaken(currentActionSlots)});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
fillSettingsForm();
render();
setInterval(()=>{render();checkAlarm();},15000);

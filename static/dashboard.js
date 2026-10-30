'use strict';
function dashboardRooms(items,filter='all'){
 return items.filter(r=>filter==='all'||(filter==='direct'?r.private:!r.private)).slice().sort((a,b)=>(b.last_activity||0)-(a.last_activity||0)||a.name.localeCompare(b.name));
}
function projectTitle(idea){return idea.trim().split('\n')[0].slice(0,80);}
// UI bindings
let dashboardFilter='all',dashboardRecognition=null;
function renderDashboard(){
 const list=dashboardRooms(rooms,dashboardFilter),recent=dashboardRooms(rooms).slice(0,6);
 const card=r=>`<button class="dash-recent-card" data-dash-room="${esc(r.id)}"><span class="dash-avatar">${esc(initials(r.name))}</span><strong>${esc(r.name)}</strong><p>${esc(r.last_message?`${r.last_message.author}: ${r.last_message.content.slice(0,110)}`:'Your next conversation starts here.')}</p><small>${r.last_activity?date(r.last_activity):'New room'} · ${r.member_count||1} people</small></button>`;
 $('#dashboard-recent').innerHTML=recent.length?recent.map(card).join(''):'<p class="dash-empty">Create your first project and bring your people together.</p>';
 $('#dashboard-conversations').innerHTML=list.length?list.map(r=>`<button class="dash-conversation" data-dash-room="${esc(r.id)}"><span class="dash-avatar">${r.private?'✳':esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.last_message?`${r.last_message.author}: ${r.last_message.content.slice(0,140)}`:'No messages yet')}</small></span><time>${r.last_activity?timestamp(r.last_activity):''}</time></button>`).join(''):'<p class="dash-empty">No conversations in this view yet.</p>';
 $('#dashboard-avatar').textContent=initials(me.name);$('#dashboard-avatar').title=me.name;
 document.querySelectorAll('[data-dash-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dashFilter===dashboardFilter)));
}
async function showDashboard(){
 if(meeting&&await closeMeeting()===false)return;
 if(canvasDirty()&&!confirm('Leave your unsaved document edits?'))return;
 endLive();soloActive=false;$('#solo-view').hidden=true;closeCanvas(true);closeGenerationPreview();cancelVoice();clearVoiceNote();closeMobileNavigation();
 $('#dashboard').hidden=false;$('#workspace').hidden=true;
 await loadRooms();renderDashboard();
}
function hideDashboard(){stopDashboardDictation();$('#dashboard').hidden=true;$('#workspace').hidden=false;}
function stopDashboardDictation(){dashboardRecognition?.stop();dashboardRecognition=null;$('#dashboard-dictate').setAttribute('aria-pressed','false');}
function setDashboardTheme(value){const theme=value==='dark'?'dark':'light';document.documentElement.dataset.dashboardTheme=theme;document.querySelectorAll('[data-theme-toggle]').forEach(b=>{b.textContent=theme==='dark'?'☀ Light mode':'☾ Dark mode';b.setAttribute('aria-label',theme==='dark'?'Switch to light mode':'Switch to dark mode');});try{localStorage.setItem('workmates-dashboard-theme',theme);}catch{}document.querySelectorAll('[data-dash-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dashTheme===theme)));}
(()=>{const $=s=>document.querySelector(s);
$('#dashboard').addEventListener('click',event=>{
 const target=event.target.closest('[data-dash-room]');if(target)selectRoom(target.dataset.dashRoom).catch(e=>toast(e.message));
 const filter=event.target.closest('[data-dash-filter]');if(filter){dashboardFilter=filter.dataset.dashFilter;renderDashboard();}
 const theme=event.target.closest('[data-dash-theme]');if(theme)setDashboardTheme(theme.dataset.dashTheme);
});
$('#dashboard-form').onsubmit=async event=>{
 event.preventDefault();const idea=$('#dashboard-idea').value.trim();if(!idea)return;
 const button=$('#dashboard-create');button.disabled=true;$('#dashboard-error').textContent='';let created;
 try{
  created=await api('/rooms','POST',{name:projectTitle(idea),description:idea.slice(0,500)});
  $('#dashboard-idea').value='';await selectRoom(created.id);await loadRooms();
  if($('#dashboard-reign').checked)await updateSettings({enabled:true});
  if(idea.length>500)await api(`/rooms/${created.id}/documents`,'POST',{title:'Project brief',body:idea});
  if($('#dashboard-invite').checked)invitePeople();else toast('Project created. Invite your team whenever you’re ready.');
 }catch(e){if(created){toast('Project created. Some setup remains: '+e.message);}else $('#dashboard-error').textContent=e.message;}
 finally{button.disabled=false;}
};
$('#dashboard-dictate').onclick=()=>{
 if(dashboardRecognition){stopDashboardDictation();return;}
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){toast('Voice dictation is not supported in this browser. You can type your idea.');return;}
 const recognition=new Recognition();dashboardRecognition=recognition;recognition.continuous=true;recognition.interimResults=false;
 recognition.onresult=event=>{for(let n=event.resultIndex;n<event.results.length;n++)if(event.results[n].isFinal)$('#dashboard-idea').value=($('#dashboard-idea').value+' '+event.results[n][0].transcript).trim().slice(0,8000);};
 recognition.onend=()=>{dashboardRecognition=null;$('#dashboard-dictate').setAttribute('aria-pressed','false');};recognition.onerror=()=>{stopDashboardDictation();toast('Dictation stopped. Check microphone permission.');};
 try{recognition.start();$('#dashboard-dictate').setAttribute('aria-pressed','true');}catch(e){stopDashboardDictation();toast(e.message);}
};
$('#dashboard-all').onclick=()=>{$('#dashboard-conversations').scrollIntoView({behavior:'smooth'});};
$('#dashboard-avatar').onclick=()=>$('#password-button').click();
$('#dashboard-home').onclick=()=>showDashboard().catch(e=>toast(e.message));
$('#dashboard-signout').onclick=()=>$('#logout').click();
$('#dashboard-notifications').onclick=()=>$('#notification-button').click();
document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.onclick=()=>setDashboardTheme(document.documentElement.dataset.dashboardTheme==='dark'?'light':'dark'));
try{setDashboardTheme(localStorage.getItem('workmates-dashboard-theme'));}catch{setDashboardTheme('light');}

})();

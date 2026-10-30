'use strict';
function shouldShowJoinAlert(n,shown,now){return !n.seen&&['member_joined','call_joined','reminder'].includes(n.kind)&&!shown.has(n.id)&&now-n.created<600&&now>=n.created-10;}
// UI bindings
let joinAlertCurrent=null,joinAlertAudio=null,joinAlertShown=new Set(),joinAlertOwner=null,joinAlertTimer=null;
function alertPreference(){try{return JSON.parse(localStorage.getItem('workmates-alerts-'+me.id)||'{}');}catch{return{};}}
function saveAlertPreference(value){try{localStorage.setItem('workmates-alerts-'+me.id,JSON.stringify(value));}catch{}}
function processJoinAlerts(items){
 if(!me)return;
 if(joinAlertOwner!==me.id){joinAlertOwner=me.id;try{joinAlertShown=new Set(JSON.parse(localStorage.getItem('workmates-seen-alerts-'+me.id)||'[]'));}catch{joinAlertShown=new Set();}}
 const now=Date.now()/1000,fresh=items.filter(n=>shouldShowJoinAlert(n,joinAlertShown,now));if(!fresh.length)return;
 for(const n of fresh)joinAlertShown.add(n.id);
 try{localStorage.setItem('workmates-seen-alerts-'+me.id,JSON.stringify([...joinAlertShown].slice(-300)));}catch{}
 const n=fresh[0];joinAlertCurrent=n;document.querySelector('#join-alert-title').textContent=n.title;document.querySelector('#join-alert-action').textContent=n.kind==='call_joined'?'Join call':'Open group';document.querySelector('#join-alert').hidden=false;
 clearTimeout(joinAlertTimer);joinAlertTimer=setTimeout(()=>{document.querySelector('#join-alert').hidden=true;},30000);
 const pref=alertPreference();if(pref.sound)playJoinChime();if(pref.popup)showPhoneAlert(n,pref.sound).catch(()=>{});
}
function playJoinChime(){
 try{if(!joinAlertAudio||joinAlertAudio.state!=='running')return;const at=joinAlertAudio.currentTime,gain=joinAlertAudio.createGain();gain.connect(joinAlertAudio.destination);gain.gain.setValueAtTime(.04,at);gain.gain.exponentialRampToValueAtTime(.001,at+.85);for(const [frequency,offset]of [[660,0],[880,.2]]){const osc=joinAlertAudio.createOscillator();osc.frequency.value=frequency;osc.connect(gain);osc.start(at+offset);osc.stop(at+offset+.3);}}catch{}
}
async function showPhoneAlert(n,sound){
 if(!('Notification'in window)||Notification.permission!=='granted')return;
 const options={body:n.kind==='call_joined'?'Tap to open the group and join the call.':'Tap to open the shared group.',tag:'workmates-'+n.id,data:{room_id:n.room_id},silent:!sound};
 if(navigator.serviceWorker){const registration=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;await registration.showNotification(n.title,options);}
 else{const notification=new Notification(n.title,options);notification.onclick=()=>{window.focus();openJoinAlert(n,false);notification.close();};}
}
async function openJoinAlert(n,join=true){
 if(!n||!me)return;document.querySelector('#join-alert').hidden=true;
 try{await api('/notifications/'+n.id+'/read','POST',{});await loadRooms();await selectRoom(n.room_id);
  if(selected!==n.room_id)return;
  if(join&&n.kind==='call_joined'){await api(`/rooms/${n.room_id}/calls/${n.call_id}`);await openMeeting();}
  await refreshNotifications();
 }catch(e){toast(e.message);}
}
function configureJoinAlerts(){
 const pref=alertPreference();modal('Join alerts',`<p>See a pop-up when someone joins your group or a live call.</p><label class="check"><input name="sound" type="checkbox" ${pref.sound?'checked':''}> Play a short join sound</label><label class="check"><input name="popup" type="checkbox" ${pref.popup?'checked':''}> Also show phone/browser notifications</label><p class="hint">Workmates must stay open for these alerts. Delivery while the app is closed, SMS and phone calls are not enabled. Your phone’s browser and sound settings may limit alerts.</p>`,async f=>{
  const sound=f.has('sound'),popup=f.has('popup');
  if(sound){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){joinAlertAudio=joinAlertAudio||new Audio();await joinAlertAudio.resume();}}
  let allowed=false;if(popup){if(!('Notification'in window))throw new Error('This browser does not support phone notifications. In-app alerts still work.');const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;allowed=permission==='granted';if(!allowed)toast('Phone notifications are blocked. In-app join alerts remain available.');}
  saveAlertPreference({sound,popup:allowed});if(sound)playJoinChime();toast('Join alert settings saved.');
 },'Save alerts');
}
document.querySelector('#join-alert-action').onclick=()=>openJoinAlert(joinAlertCurrent,true);
document.querySelector('#join-alert-dismiss').onclick=()=>{document.querySelector('#join-alert').hidden=true;};
document.querySelector('#dashboard-alerts').onclick=configureJoinAlerts;
document.querySelector('#workspace-alerts').onclick=configureJoinAlerts;
if(navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type!=='workmates-open-room')return;const rid=String(event.data.room_id||'');if(!rid)return;if(me)selectRoom(rid).catch(e=>toast(e.message));else location.hash='room='+encodeURIComponent(rid);});
// Browser audio requires a gesture again after a reload; unlock only for opted-in users.
document.addEventListener('pointerdown',()=>{if(!me||!alertPreference().sound)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){joinAlertAudio=joinAlertAudio||new Audio();joinAlertAudio.resume().catch(()=>{});}}catch{}},{passive:true});

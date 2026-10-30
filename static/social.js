'use strict';
let socialNotifications=[],socialPoll=null,noteRecorder=null,noteStream=null,noteBlob=null,noteUrl=null,noteRoom=null,noteNonce=null,noteStarted=0,noteDuration=0,noteTimer=null,noteEpoch=0,noteStarting=false;
function renderVoiceNotes(message) {
 return (message.attachments||[]).filter(a=>a.type==='voice').map(a=>`<figure class="voice-note"><figcaption>🎙 Voice message · ${Math.round(a.duration||0)} sec</figcaption><audio controls preload="none" src="/api/rooms/${esc(room.id)}/voice/${esc(a.id)}"></audio><a href="/api/rooms/${esc(room.id)}/voice/${esc(a.id)}" download>Save audio ↓</a></figure>`).join('');
}
function clearVoiceNote() {
 noteEpoch++;clearInterval(noteTimer);noteTimer=null;
 if(noteRecorder?.state!=='inactive')noteRecorder?.stop();noteRecorder=null;
 noteStream?.getTracks().forEach(t=>t.stop());noteStream=null;
 if(noteUrl)URL.revokeObjectURL(noteUrl);noteUrl=null;noteBlob=null;noteRoom=null;noteNonce=null;
 const preview=document.querySelector('#voice-note-draft');preview.hidden=true;preview.querySelector('audio').removeAttribute('src');
 document.querySelector('#record-note-button').textContent='◉ Voice note';document.querySelector('#record-note-button').setAttribute('aria-pressed','false');
 document.querySelector('#voice-note-status').textContent='';
}
async function recordVoiceNote() {
 if(noteRecorder?.state==='recording'){noteRecorder.stop();return;}
 if(noteStarting||!me||!selected)return;
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Voice recording is unavailable in this browser.');return;}
 if(noteBlob&&!confirm('Discard the unsent voice note and record another?'))return;
 clearVoiceNote();cancelVoice();const epoch=noteEpoch,rid=selected;noteStarting=true;
 try {
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(epoch!==noteEpoch||selected!==rid||!me){stream.getTracks().forEach(t=>t.stop());return;}
  noteStream=stream;const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime)throw new Error('Unsupported recording format.');
  const chunks=[];let size=0;const recorder=new MediaRecorder(stream,{mimeType:mime});noteRecorder=recorder;noteRoom=rid;noteNonce=crypto.randomUUID();noteStarted=Date.now();
  recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);size+=event.data.size;if(size>=6*1024*1024&&recorder.state==='recording')recorder.stop();}};
  recorder.onerror=()=>{clearVoiceNote();toast('Recording failed. Please record again.');};
  recorder.onstop=()=>{
   clearInterval(noteTimer);noteTimer=null;stream.getTracks().forEach(t=>t.stop());noteStream=null;noteRecorder=null;
   if(epoch!==noteEpoch||selected!==rid||!me)return;
   noteDuration=Math.min(180,Math.max(1,(Date.now()-noteStarted)/1000));
   noteBlob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});
   if(!noteBlob.size||noteBlob.size>6*1024*1024){clearVoiceNote();toast('Recording is empty or exceeds 6 MB. Please try a shorter note.');return;}
   noteUrl=URL.createObjectURL(noteBlob);document.querySelector('#voice-note-draft audio').src=noteUrl;document.querySelector('#voice-note-draft').hidden=false;
   document.querySelector('#record-note-button').textContent='◉ Voice note';document.querySelector('#record-note-button').setAttribute('aria-pressed','false');document.querySelector('#voice-note-status').textContent='Listen, then send your voice note to everyone in this group.';
  };
  recorder.start(1000);document.querySelector('#record-note-button').setAttribute('aria-pressed','true');
  const tick=()=>{const seconds=Math.floor((Date.now()-noteStarted)/1000);document.querySelector('#record-note-button').textContent='■ Stop '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');document.querySelector('#voice-note-status').textContent='Recording a voice message · maximum 3 minutes';if(seconds>=180&&recorder.state==='recording')recorder.stop();};tick();noteTimer=setInterval(tick,1000);
 } catch(e){clearVoiceNote();toast(e.name==='NotAllowedError'?'Microphone permission was denied. Enable it to record voice messages.':'Could not start voice recording.');}
 finally{noteStarting=false;}
}
async function sendVoiceNote(){
 if(!noteBlob||noteRoom!==selected)return;
 const button=document.querySelector('#send-voice-note'),epoch=noteEpoch;button.disabled=true;
 try {
  const response=await fetch(`/api/rooms/${noteRoom}/voice`,{method:'POST',headers:{'Content-Type':noteBlob.type,'X-CSRF-Token':me.csrf,'X-Request-ID':noteNonce,'X-Audio-Duration':String(noteDuration)},body:noteBlob});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not send voice note.');
  if(epoch===noteEpoch){clearVoiceNote();await refresh();document.querySelector('#messages').scrollTop=document.querySelector('#messages').scrollHeight;toast('Voice message saved in the group.');}
 }catch(e){toast(e.message+' Your recording is retained for retry.');}finally{button.disabled=false;}
}
async function refreshNotifications(prompt=false){
 if(!me)return;
 try{socialNotifications=await api('/notifications');if(typeof processJoinAlerts==='function')processJoinAlerts(socialNotifications);const count=socialNotifications.filter(n=>!n.seen).length;document.querySelector('#notification-count').textContent=count||'';document.querySelector('#notification-button').setAttribute('aria-label',`Notifications${count?', '+count+' unread':''}`);if(prompt&&count)showNotifications();}catch(e){if(me&&prompt)toast('Notifications are temporarily unavailable.');}
}
function showNotifications(){
 modal('Your notifications',socialNotifications.length?socialNotifications.map(n=>`<div class="notification-item"><strong>${esc(n.title)}</strong><small>${esc(date(n.created))}${n.seen?'':' · New'}</small>${n.can_accept?`<button type="button" class="primary" data-accept-notification="${esc(n.id)}">Join group</button>`:`<button type="button" class="secondary" data-open-notification="${esc(n.id)}">Open group</button>`}<button type="button" class="text-button" data-read-notification="${esc(n.id)}">Mark read</button></div>`).join(''):'<p>No notifications yet. Group invitations appear here.</p>',null);
 document.querySelector('#modal-body').onclick=async event=>{const accept=event.target.closest('[data-accept-notification]'),read=event.target.closest('[data-read-notification]'),open=event.target.closest('[data-open-notification]');if(!accept&&!read&&!open)return;const id=accept?.dataset.acceptNotification||read?.dataset.readNotification||open?.dataset.openNotification;const notification=socialNotifications.find(n=>n.id===id);try{if(accept){const result=await api('/notifications/'+id+'/accept','POST',{});document.querySelector('#modal').close();await loadRooms();await selectRoom(result.room_id);await refreshNotifications();}else{await api('/notifications/'+id+'/read','POST',{});await refreshNotifications();if(open){document.querySelector('#modal').close();await loadRooms();if(rooms.some(r=>r.id===notification.room_id))await selectRoom(notification.room_id);else toast('This invitation is no longer active.');}else showNotifications();}}catch(e){document.querySelector('#modal-error').textContent=e.message;}};
}
function invitePeople(){
 closeMobileNavigation();
 if(!room)return;const rid=room.id;
 modal('Invite to '+room.name,`<p>Invite by email, or create a single-use link to send to someone's phone. Links expire in seven days.</p><label>Invite using<select name="channel" id="invite-channel"><option value="email">Email notification</option><option value="phone">Phone / share link</option></select></label><label id="invite-email-label">Email<input name="email" type="email" required maxlength="254"></label><label id="invite-phone-label" hidden>Phone number<input name="phone" type="tel" autocomplete="tel" placeholder="+1…"></label><button type="button" id="pick-invite-contact" class="secondary">Choose a contact</button><p class="hint">Contact access is requested only when you choose. Your address book isn't uploaded or synchronized. Phone sharing opens your messaging app; Workmates doesn't send SMS automatically.</p>`,async f=>{
  const channel=f.get('channel'),result=await api(`/rooms/${rid}/invites`,'POST',{channel,email:f.get('email')});
  const link=result.url,phone=String(f.get('phone')||'').replace(/[^+0-9]/g,'');
  const status=result.email_status==='submitted'?'Invitation email submitted for delivery.':result.email_status==='failed'?'The email could not be sent. Share the link below or try again.':channel==='phone'?'Share this link with the person you want to invite.':'Email delivery is not connected. Share this link directly.';
  document.querySelector('#modal-body').onclick=null;document.querySelector('#modal-body').innerHTML=`<p>${esc(status)}${result.in_app?' An invitation is also waiting in their notification bell.':''}</p><label>Private invitation link<textarea readonly rows="3" id="invite-link">${esc(link)}</textarea></label><div class="invite-share-actions"><button type="button" id="copy-invite" class="secondary">Copy link</button><button type="button" id="share-invite" class="secondary">Share…</button>${channel==='phone'?`<a class="secondary" href="sms:${esc(phone)}?body=${encodeURIComponent('Join our Workmates group: '+link)}">Send text message ↗</a>`:''}</div><p class="hint">Anyone holding a phone invite link can use it once. Only share it with your intended recipient. New users choose their own password.</p>`;
  document.querySelector('#copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(link);toast('Invitation copied.');}catch{document.querySelector('#invite-link').select();toast('Select and copy the invitation link.');}};
  document.querySelector('#share-invite').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Join Workmates',text:'Join our group in Workmates',url:link});else document.querySelector('#copy-invite').click();}catch(e){if(e.name!=='AbortError')toast('Use Copy link to share this invitation.');}};
  document.querySelector('#save-modal').hidden=true;document.querySelector('#cancel-modal').textContent='Done';saveAction=null;return false;
 },'Create invitation');
 document.querySelector('#invite-channel').onchange=event=>{const phone=event.target.value==='phone';document.querySelector('#invite-email-label').hidden=phone;document.querySelector('#invite-email-label input').required=!phone;document.querySelector('#invite-phone-label').hidden=!phone;};
 document.querySelector('#pick-invite-contact').onclick=async()=>{
  if(!navigator.contacts?.select){toast('Contact picking is unavailable here. Enter an email or phone number, or use Share after creating the link.');return;}
  try{const contacts=await navigator.contacts.select(['name','email','tel'],{multiple:false});const contact=contacts[0];if(!contact)return;const email=contact.email?.[0],phone=contact.tel?.[0];document.querySelector('[name=email]').value=email||'';document.querySelector('[name=phone]').value=phone||'';document.querySelector('#invite-channel').value=email?'email':'phone';document.querySelector('#invite-channel').dispatchEvent(new Event('change'));}catch(e){if(e.name!=='AbortError')toast('Contact access was not available. You can enter the details yourself.');}
 };
}
async function applyBackground(){
 if(!me)return;try{const theme=await api('/preferences/background');const conversation=document.querySelector('.conversation');conversation.dataset.background=theme.preset;conversation.style.setProperty('--background-opacity',theme.opacity);conversation.style.setProperty('--background-image',theme.preset==='upload'?`url("/api/preferences/background/image?v=${theme.updated}")`:'none');}catch{}
}
async function chooseBackground(){
 closeMobileNavigation();
 const theme=await api('/preferences/background');
 modal('Your chat background',`<p>Choose a background for your conversations. This preference belongs to you; everyone keeps their own view.</p><label>Style<select name="preset" id="background-preset">${[['none','Clean'],['cosmic','Cosmic glow'],['aurora','Aurora waves'],['sunset','Neon sunset'],...(theme.has_image?[['upload','Your uploaded image']]:[])].map(([v,n])=>`<option value="${v}" ${theme.preset===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Background strength <output id="background-strength">${Math.round(theme.opacity*100)}%</output><input name="opacity" type="range" min="0" max="45" value="${Math.round(theme.opacity*100)}"></label><div id="background-swatch" class="background-swatch" data-background="${esc(theme.preset)}"></div><label>Upload a background<input id="background-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="hint">PNG, JPEG or WebP · up to 6 MB. Images are resized and metadata is removed. Only you can access your upload.</p>${theme.has_image?'<button type="button" id="remove-background" class="text-button">Delete uploaded background</button>':''}`,async f=>{await api('/preferences/background','POST',{preset:f.get('preset'),opacity:Number(f.get('opacity'))/100});await applyBackground();},'Save background');
 const swatch=document.querySelector('#background-swatch');
 const preview=()=>{swatch.dataset.background=document.querySelector('#background-preset').value;swatch.style.setProperty('--background-opacity',Number(document.querySelector('[name=opacity]').value)/100);swatch.style.setProperty('--background-image',`url("/api/preferences/background/image?v=${theme.updated}")`);document.querySelector('#background-strength').textContent=document.querySelector('[name=opacity]').value+'%';};
 document.querySelector('#background-preset').onchange=preview;document.querySelector('[name=opacity]').oninput=preview;preview();
 document.querySelector('#background-upload').onchange=async event=>{const file=event.target.files[0];if(!file)return;if(file.size>6*1024*1024){document.querySelector('#modal-error').textContent='Choose an image under 6 MB.';return;}const button=document.querySelector('#save-modal');button.disabled=true;try{const response=await fetch('/api/preferences/background/image',{method:'PUT',headers:{'Content-Type':file.type,'X-CSRF-Token':me.csrf},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);await applyBackground();document.querySelector('#modal').close();await chooseBackground();}catch(e){document.querySelector('#modal-error').textContent=e.message;}finally{button.disabled=false;}};
 document.querySelector('#remove-background')?.addEventListener('click',async()=>{await api('/preferences/background/image','DELETE',{});await applyBackground();document.querySelector('#modal').close();await chooseBackground();});
}
function agentDrive(filter='all'){
 closeMobileNavigation();
 if(!room)return;const rid=room.id;
 const files=(room.files||[]).filter(f=>filter==='all'||(filter==='images'?isGenerationImage(f):!isGenerationImage(f)));
 const docs=filter==='images'?[]:room.documents;
 modal('Agent Drive',`<p>Shared with everyone in <strong>${esc(room.name)}</strong>. Local files stay saved here; connected folders are available below.</p><div class="agent-drive-filters">${['all','images','documents'].map(v=>`<button type="button" class="secondary" data-drive-filter="${v}" aria-pressed="${v===filter}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}<button type="button" id="agent-add-drive" class="secondary admin-only">＋ Add Drive</button></div><h3>Saved in this group</h3><div class="agent-drive-grid">${docs.map(d=>`<button type="button" class="drive-asset" data-open-canvas="${esc(d.id)}"><span class="drive-document-icon">▤</span><strong>${esc(d.title)}</strong><small>Shared Canvas · version ${d.version}</small></button>`).join('')}${files.map(f=>`<button type="button" class="drive-asset" data-drive-preview="${esc(f.id)}">${isGenerationImage(f)?`<img loading="lazy" src="/api/rooms/${esc(rid)}/files/${esc(f.id)}/preview" alt="">`:'<span class="drive-document-icon">▦</span>'}<strong>${esc(f.filename)}</strong><small>Saved file · ${Math.ceil(f.size/1024)} KB</small></button>`).join('')||(!docs.length?'<p>No saved files match this filter yet.</p>':'')}</div><h3>Connected drives</h3>${(room.drive_mounts||[]).map(m=>`<button type="button" class="file-download" data-agent-mount="${esc(m.id)}">☁ ${esc(m.name)} ↗</button>`).join('')||'<p>No external drive folders connected yet. An administrator can add Google Drive folders for everyone in this group.</p>'}`,null);
 adminVisibility();document.querySelector('#modal-body').onclick=async event=>{try{const filterButton=event.target.closest('[data-drive-filter]'),file=event.target.closest('[data-drive-preview]'),doc=event.target.closest('[data-open-canvas]'),mount=event.target.closest('[data-agent-mount]');if(filterButton){agentDrive(filterButton.dataset.driveFilter);return;}if(event.target.closest('#agent-add-drive')){document.querySelector('#modal').close();await manageDrive();return;}if(file||doc||mount){document.querySelector('#modal').close();if(file)await openGenerationPreview('file',file.dataset.drivePreview);else if(doc)await openCanvas(doc.dataset.openCanvas);else await browseDrive(mount.dataset.agentMount);}}catch(e){toast(e.message);}};
}
async function initSocial(){
 clearInterval(socialPoll);await applyBackground();await refreshNotifications(true);socialPoll=setInterval(()=>refreshNotifications(),5000);
}
document.querySelector('#record-note-button').onclick=recordVoiceNote;
document.querySelector('#send-voice-note').onclick=sendVoiceNote;
document.querySelector('#discard-voice-note').onclick=clearVoiceNote;
document.querySelector('#notification-button').onclick=async()=>{await refreshNotifications();showNotifications();};
document.querySelector('#background-button').onclick=()=>chooseBackground().catch(e=>toast(e.message));
document.querySelector('#agent-drive-button').onclick=()=>agentDrive();

'use strict';
let meeting=null,meetingEpoch=0,meetingTimer=null,meetingPolling=false,meetingPeers=new Map(),meetingAudio=new Map(),meetingHumanSources=new Map(),meetingStream=null,meetingContext=null,meetingMix=null,meetingRecordMix=null,meetingAgentPeer=null,meetingAgentChannel=null,meetingAgentStream=null,meetingAgentForward=null,meetingVersion='',meetingItem=null,meetingItemKey='',meetingSeenEvents=new Set(),meetingMuted=false,meetingRecorder=null,meetingClip=null,meetingCaption='',meetingCleanupAudio=null,meetingCleanupMeter=null,meetingConnecting=null,meetingAgentSource=null,meetingScreen=null,meetingScreenBusy=false,meetingScreenStreams=new Map();
function meetingViewKey(value){return `${value.version}:${value.stage.asset_id||''}:${value.stage.page||0}:${value.stage.highlight||''}`;}
function meetingPageHTML(page,rid){
 const image=page.image_id?`<img data-walk-field="image" src="/api/rooms/${esc(rid)}/files/${esc(page.image_id)}/preview" alt="${esc(page.title||'Shared image')}">`:'';
 return `<article class="meeting-page ${page.type==='slide'?'meeting-slide':''} ${page.layout==='background'?'meeting-background-slide':''}">${image}<div class="meeting-page-copy"><h2 data-walk-field="title">${esc(page.title||'')}</h2>${(page.blocks||[]).map((block,index)=>`<div class="formatted" data-walk-field="block:${index}">${markdown(block)}</div>`).join('')}</div></article>`;
}
function meetingStatus(text){document.querySelector('#meeting-status').textContent=text;}
function meetingPath(suffix=''){return `/rooms/${meeting.room_id}/calls/${meeting.id}${suffix}`;}
function meetingIsHost(){return meeting?.host_user===me?.id;}
async function meetingRequest(suffix,body={},method='POST'){return api(meetingPath(suffix),method,{participant_id:meeting.participant_id,...body});}
async function openMeeting(){
 if(!room||meeting)return;closeMobileNavigation();endLive();clearVoiceNote();cancelVoice();
 if(room.private){toast('Share the private context into a group first; private room contents are not exposed to other members.');return;}
 const rid=selected,epoch=++meetingEpoch;document.querySelector('#meeting-view').hidden=false;meetingStatus('Joining shared call…');
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(epoch!==meetingEpoch){stream.getTracks().forEach(t=>t.stop());return;}
  meetingStream=stream;const result=await api(`/rooms/${rid}/calls`,'POST',{});if(epoch!==meetingEpoch){stream.getTracks().forEach(t=>t.stop());return;}
  meeting=result;meetingSeenEvents=new Set(result.events.map(e=>e.id));meetingVersion='';meetingItem=null;meetingItemKey='';
  const Audio=window.AudioContext||window.webkitAudioContext;meetingContext=new Audio();await meetingContext.resume();meetingMix=meetingContext.createMediaStreamDestination();meetingRecordMix=meetingContext.createMediaStreamDestination();
  const mic=meetingContext.createMediaStreamSource(stream);mic.connect(meetingMix);mic.connect(meetingRecordMix);meetingHumanSources.set('self',mic);
  meetingStatus(meetingIsHost()?'Shared call open · start REIGN when ready.':'Joining participants…');
  document.querySelector('#meeting-start-reign').hidden=!meetingIsHost();document.querySelector('#meeting-record').hidden=!meetingIsHost();document.querySelector('#meeting-select').disabled=!meetingIsHost();
  await renderMeeting(result);meetingTimer=setInterval(pollMeeting,1200);await pollMeeting();
 }catch(e){if(epoch===meetingEpoch){await closeMeeting(true);toast(e.name==='NotAllowedError'?'Microphone access was denied. Allow it to join the voice call.':e.message);}}
}
async function closeMeeting(force=false){
 if(!force&&(meetingClip||meetingRecorder?.state==='recording')&&!confirm('Discard the unsaved call clip and leave?'))return false;
 const old=meeting;await stopMeetingScreen(false);meetingScreenStreams.clear();meetingEpoch++;clearInterval(meetingTimer);meetingTimer=null;clearTimeout(meetingConnecting);meetingConnecting=null;
 if(meetingRecorder?.state==='recording')meetingRecorder.stop();meetingRecorder=null;meetingClip=null;
 meetingCleanupAudio?.();meetingCleanupMeter?.();meetingCleanupAudio=null;meetingCleanupMeter=null;
 stopMeetingReign();
 for(const item of meetingPeers.values())item.peer.close();meetingPeers.clear();
 for(const audio of meetingAudio.values()){audio.pause();audio.srcObject=null;audio.remove();}meetingAudio.clear();
 meetingStream?.getTracks().forEach(t=>t.stop());meetingStream=null;meetingContext?.close().catch(()=>{});meetingContext=null;meetingHumanSources.clear();meetingMix=null;meetingRecordMix=null;meetingAgentStream=null;meetingAgentForward=null;meeting=null;meetingMuted=false;meetingVersion='';
 document.querySelector('#meeting-reign-audio').pause();document.querySelector('#meeting-reign-audio').srcObject=null;document.querySelector('#meeting-view').hidden=true;document.querySelector('#meeting-clip-draft').hidden=true;document.querySelector('#meeting-consent').checked=false;document.querySelector('#meeting-mute').textContent='Mute';document.querySelector('#meeting-mute').setAttribute('aria-pressed','false');document.querySelector('#meeting-start-reign').textContent='Start REIGN';
 if(old){try{await api(`/rooms/${old.room_id}/calls/${old.id}/leave`,'POST',{participant_id:old.participant_id});}catch{}}
}
async function sendMeetingSignal(target,payload){if(!meeting)return;await meetingRequest('/signals',{target,payload});}
function addMeetingPeer(person){
 if(meetingPeers.has(person.id)||person.id===meeting.participant_id)return meetingPeers.get(person.id);
 const peer=new RTCPeerConnection({iceServers:meeting.ice_servers||[{urls:'stun:stun.l.google.com:19302'}]});const item={peer,makingOffer:false,ignoreOffer:false,polite:meeting.participant_id>person.id,candidates:[],agentStreamId:null,forwarded:false};meetingPeers.set(person.id,item);
 for(const track of meetingStream.getAudioTracks())peer.addTrack(track,meetingStream);
 if(meetingScreen)for(const track of meetingScreen.getVideoTracks())peer.addTrack(track,meetingScreen);
 if(meetingIsHost()&&meetingAgentForward){peer.addTrack(meetingAgentForward.getAudioTracks()[0],meetingAgentForward);item.forwarded=true;}
 peer.onicecandidate=event=>{if(event.candidate)sendMeetingSignal(person.id,{candidate:event.candidate.toJSON()}).catch(()=>{});};
 peer.onnegotiationneeded=async()=>{try{item.makingOffer=true;await peer.setLocalDescription();await sendMeetingSignal(person.id,{description:peer.localDescription,agent_stream_id:meetingAgentForward?.id||null});}catch(e){meetingStatus('A participant could not connect: '+e.message);}finally{item.makingOffer=false;}};
 peer.onconnectionstatechange=()=>{if(peer.connectionState==='failed')meetingStatus('A participant audio connection failed. Restrictive networks may require a configured TURN relay. Rejoin to retry.');};
 peer.ontrack=event=>{
  const stream=event.streams[0]||new MediaStream([event.track]);
  if(event.track.kind==='video'){meetingScreenStreams.set(person.id,{stream,track:event.track});event.track.onended=()=>{meetingScreenStreams.delete(person.id);renderMeetingScreen();};renderMeetingScreen();return;}
  const key=person.id+':'+stream.id;if(meetingAudio.has(key))return;
  const audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.srcObject=stream;audio.dataset.peer=person.id;document.querySelector('#meeting-audio-sinks').append(audio);meetingAudio.set(key,audio);audio.play().catch(()=>{document.querySelector('#meeting-enable-audio').hidden=false;});
  const isAgent=stream.id===item.agentStreamId;
  if(!isAgent&&meetingIsHost()&&meetingContext){const source=meetingContext.createMediaStreamSource(stream);source.connect(meetingMix);source.connect(meetingRecordMix);meetingHumanSources.set(key,source);}
 };
 return item;
}
async function receiveMeetingSignal(signal){
 const person=meeting.participants.find(p=>p.id===signal.source);if(!person)return;
 const item=addMeetingPeer(person),peer=item.peer,payload=signal.payload;
 if(payload.description){
  const description=payload.description,collision=description.type==='offer'&&(item.makingOffer||peer.signalingState!=='stable');item.ignoreOffer=!item.polite&&collision;if(item.ignoreOffer)return;
  item.agentStreamId=payload.agent_stream_id||null;
  if(collision&&item.polite&&peer.signalingState!=='stable')await peer.setLocalDescription({type:'rollback'});
  await peer.setRemoteDescription(description);for(const candidate of item.candidates.splice(0))await peer.addIceCandidate(candidate);
  if(description.type==='offer'){await peer.setLocalDescription();await sendMeetingSignal(person.id,{description:peer.localDescription,agent_stream_id:meetingAgentForward?.id||null});}
 }else if(payload.candidate&&!item.ignoreOffer){if(peer.remoteDescription)await peer.addIceCandidate(payload.candidate);else item.candidates.push(payload.candidate);}
}
async function pollMeeting(){
 if(!meeting||meetingPolling)return;meetingPolling=true;const epoch=meetingEpoch;
 try{
  const result=await meetingRequest('/poll',{after:meeting.signalCursor||0});if(epoch!==meetingEpoch)return;
  meeting={...result,participant_id:meeting.participant_id,signalCursor:meeting.signalCursor||0};
  if(!result.recording&&meetingRecorder?.state==='recording')stopMeetingClip();
  for(const person of result.participants)addMeetingPeer(person);
  for(const [id,item]of meetingPeers){if(!result.participants.some(p=>p.id===id)){item.peer.close();meetingPeers.delete(id);for(const [key,audio]of meetingAudio){if(key.startsWith(id+':')){audio.pause();audio.remove();meetingAudio.delete(key);meetingHumanSources.get(key)?.disconnect();meetingHumanSources.delete(key);}}}}
  for(const signal of result.signals||[]){try{await receiveMeetingSignal(signal);}catch(e){meetingStatus('Participant connection issue: '+e.message);}meeting.signalCursor=Math.max(meeting.signalCursor,signal.id);}
  await renderMeeting(result);renderMeetingScreen();
  for(const event of result.events){if(meetingSeenEvents.has(event.id))continue;if(event.kind==='question'&&meetingIsHost()&&meetingAgentChannel?.readyState!=='open')continue;meetingSeenEvents.add(event.id);
   if(event.kind==='question'&&meetingIsHost()&&meetingAgentChannel?.readyState==='open'){meetingSendAgent({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:event.payload.author+': '+event.payload.text}]}});meetingSendAgent({type:'response.create'});}
   if(event.kind==='invitation_requested'&&meetingIsHost()){document.querySelector('#meeting-invite-request').hidden=false;document.querySelector('#meeting-invite-request-text').textContent='REIGN asked to bring '+event.payload.name+' in. Choose and confirm the recipient before sending an invite.';}
  }
 }catch(e){if(epoch===meetingEpoch){if(/ended|not found|Rejoin/i.test(e.message)){await closeMeeting();toast(e.message);}else meetingStatus('Connection interrupted. Retrying…');}}finally{meetingPolling=false;}
}
async function renderMeeting(value){
 if(!meeting)return;
 document.querySelector('#meeting-participants').innerHTML=value.participants.map(p=>`<span>${esc(p.name)}${p.user_id===value.host_user?' · host':''}${p.consent?' · clips allowed':''}</span>`).join('');
 document.querySelector('#meeting-recording-status').textContent=value.recording?'● Recording a useful clip · everyone consented':'';
 const options='<option value="">Choose shared work…</option>'+room.documents.map(d=>`<option value="document:${esc(d.id)}">${esc(d.title)}</option>`).join('')+(room.files||[]).map(f=>`<option value="file:${esc(f.id)}">${esc(f.filename)}</option>`).join('');
 const select=document.querySelector('#meeting-select');if(select.innerHTML!==options){select.innerHTML=options;select.value=value.stage.asset_id?value.stage.kind+':'+value.stage.asset_id:'';}
 const key=meetingViewKey(value);if(key!==meetingVersion){meetingVersion=key;
  if(value.stage.asset_id){const itemKey=value.stage.kind+':'+value.stage.asset_id;if(itemKey!==meetingItemKey){const active=meeting,loaded=await api(meetingPath('/item'));if(meeting!==active)return;meetingItem=loaded;meetingItemKey=itemKey;}const page=meetingItem.pages[value.stage.page];document.querySelector('#meeting-stage').innerHTML=meetingPageHTML(page,meeting.room_id);document.querySelector('#meeting-page-label').textContent=`${page.type==='slide'?'Slide':page.type==='image'?'Image':'Section / page'} ${value.stage.page+1} of ${meetingItem.pages.length}${value.stage.paused?' · paused':''}`;
   const field=value.stage.highlight;if(field&&/^(title|image|block:\d+)$/.test(field)){const node=document.querySelector('#meeting-stage').querySelector(`[data-walk-field="${field}"]`);node?.classList.add('walk-highlight');node?.scrollIntoView({block:'nearest',behavior:'smooth'});}
  }else{document.querySelector('#meeting-stage').innerHTML='<div class="meeting-empty"><h2>One shared view.</h2><p>The host can open a document, slide deck or image. Ask REIGN to walk everyone through it.</p></div>';}
 }
 const captions=value.events.filter(e=>e.kind==='caption').slice(-4);document.querySelector('#meeting-transcript').innerHTML=captions.map(e=>`<p><small>${e.payload.role==='assistant'?'REIGN':'Call participant'}</small>${esc(e.payload.text)}</p>`).join('');
 document.querySelector('#meeting-prev').disabled=!meetingIsHost()||!value.stage.asset_id||value.stage.page<=0;document.querySelector('#meeting-next').disabled=!meetingIsHost()||!value.stage.asset_id||value.stage.page>=((meetingItem?.pages.length||1)-1);document.querySelector('#meeting-pause').disabled=!meetingIsHost();document.querySelector('#meeting-pause').textContent=value.stage.paused?'Resume walkthrough':'Pause walkthrough';
}
async function meetingNavigate(change){if(!meetingIsHost())return;await api(meetingPath('/stage'),'PATCH',{version:meeting.version,...change});await pollMeeting();}
function meetingSendAgent(event){if(meetingAgentChannel?.readyState!=='open')throw new Error('REIGN is not connected yet.');meetingAgentChannel.send(JSON.stringify(event));}
function stopMeetingReign(){
 clearTimeout(meetingConnecting);meetingConnecting=null;
 meetingAgentChannel?.close();meetingAgentPeer?.close();meetingAgentChannel=null;meetingAgentPeer=null;
 meetingCleanupAudio?.();meetingCleanupMeter?.();meetingCleanupAudio=null;meetingCleanupMeter=null;
 meetingAgentSource?.disconnect();meetingAgentSource=null;
 const forwarded=meetingAgentForward?.getAudioTracks()[0];
 for(const item of meetingPeers.values()){if(forwarded)for(const sender of item.peer.getSenders())if(sender.track===forwarded)item.peer.removeTrack(sender);item.forwarded=false;}
 meetingAgentStream=null;meetingAgentForward=null;
 const audio=document.querySelector('#meeting-reign-audio');audio.pause();audio.srcObject=null;
 document.querySelector('#meeting-orb').classList.remove('ringing','thinking','speaking','listening');
 document.querySelector('#meeting-start-reign').textContent='Start REIGN';
}
async function startMeetingReign(){
 if(!meeting||!meetingIsHost())return;
 if(meetingAgentPeer){stopMeetingReign();meetingStatus('REIGN voice stopped. Participant call and shared work remain open.');return;}
 const epoch=meetingEpoch,peer=new RTCPeerConnection();meetingAgentPeer=peer;const channel=peer.createDataChannel('oai-events');meetingAgentChannel=channel;peer.addTrack(meetingMix.stream.getAudioTracks()[0],meetingMix.stream);let greeted=false;
 document.querySelector('#meeting-start-reign').textContent='Cancel REIGN connection';document.querySelector('#meeting-orb').classList.add('ringing');meetingStatus('Connecting REIGN live voice…');
 const fail=message=>{clearTimeout(meetingConnecting);peer.close();if(meetingAgentPeer===peer){stopMeetingReign();document.querySelector('#meeting-start-reign').textContent='Retry REIGN';document.querySelector('#meeting-orb').classList.remove('ringing','thinking','speaking');meetingStatus(message);}};
 meetingConnecting=setTimeout(()=>fail('REIGN did not connect within 45 seconds. Participant audio and the shared view remain available.'),45000);
 peer.ontrack=event=>{const stream=event.streams[0]||new MediaStream([event.track]);meetingAgentStream=stream;meetingAgentForward=new MediaStream([event.track]);const audio=document.querySelector('#meeting-reign-audio');audio.srcObject=stream;audio.volume=1;audio.muted=false;audio.play().catch(()=>{document.querySelector('#meeting-enable-audio').hidden=false;});meetingCleanupAudio?.();meetingCleanupAudio=monitorCallAudio(peer,audio,document.querySelector('#meeting-audio-status'));meetingCleanupMeter?.();meetingCleanupMeter=meterCallOrb(stream,document.querySelector('#meeting-orb'));meetingAgentSource=meetingContext.createMediaStreamSource(stream);meetingAgentSource.connect(meetingRecordMix);
  for(const item of meetingPeers.values())if(!item.forwarded){item.peer.addTrack(event.track,meetingAgentForward);item.forwarded=true;}
 };
 peer.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(peer.connectionState))fail('REIGN voice disconnected. Retry when ready.');};
 channel.onopen=()=>{if(epoch!==meetingEpoch)return;clearTimeout(meetingConnecting);document.querySelector('#meeting-orb').classList.remove('ringing');document.querySelector('#meeting-orb').classList.add('listening');document.querySelector('#meeting-start-reign').textContent='Stop REIGN';meetingStatus('REIGN connected · everyone may speak or ask a question.');};
 channel.onmessage=async event=>{
  if(epoch!==meetingEpoch)return;let v;try{v=JSON.parse(event.data);}catch{return;}
  if(v.type==='session.created'&&!greeted){greeted=true;meetingSendAgent({type:'response.create',response:{output_modalities:['audio'],instructions:'Briefly greet the group, say you are an AI voice, and ask which saved document or presentation to walk through.'}});}
  if(v.type==='input_audio_buffer.speech_started'){document.querySelector('#meeting-orb').classList.remove('speaking','thinking');document.querySelector('#meeting-orb').classList.add('listening');}
  if(v.type==='input_audio_buffer.speech_stopped'||v.type==='response.created'){document.querySelector('#meeting-orb').classList.add('thinking');meetingCaption='';}
  if(v.type==='response.output_audio_transcript.delta'){meetingCaption+=v.delta||'';document.querySelector('#meeting-live-caption').textContent=meetingCaption;document.querySelector('#meeting-orb').classList.remove('thinking');document.querySelector('#meeting-orb').classList.add('speaking');}
  if(v.type==='response.output_audio_transcript.done'||v.type==='conversation.item.input_audio_transcription.completed'){try{await meetingRequest('/caption',{role:v.type.startsWith('response')?'assistant':'user',text:v.transcript||meetingCaption,event_id:(v.item_id||v.event_id||crypto.randomUUID()).slice(0,100)});}catch(e){meetingStatus('Transcript save failed: '+e.message);}}
  if(v.type==='response.function_call_arguments.done'){let output;try{const args=JSON.parse(v.arguments||'{}');output=await meetingRequest('/agent-action',{call_id:v.call_id,name:v.name,arguments:args});await pollMeeting();}catch(e){output={error:e.message};}meetingSendAgent({type:'conversation.item.create',item:{type:'function_call_output',call_id:v.call_id,output:JSON.stringify(output)}});meetingSendAgent({type:'response.create'});}
  if(v.type==='response.done'){document.querySelector('#meeting-orb').classList.remove('thinking','speaking');}
  if(v.type==='error')fail(v.error?.message||'REIGN reported a voice error.');
 };
 try{const offer=await peer.createOffer();await peer.setLocalDescription(offer);const answer=await meetingRequest('/live',{sdp:offer.sdp});if(epoch!==meetingEpoch||meetingAgentPeer!==peer){peer.close();return;}await peer.setRemoteDescription({type:'answer',sdp:answer.sdp});}catch(e){fail(e.message);}
}
async function startMeetingClip(){
 if(!meetingIsHost())return;if(meetingRecorder?.state==='recording'){await meetingRequest('/recording',{recording:false});stopMeetingClip();return;}
 try{const permission=await meetingRequest('/recording',{recording:true});const mime=['audio/webm;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('This browser cannot record call clips.');const chunks=[];let size=0;const started=Date.now(),recorder=new MediaRecorder(meetingRecordMix.stream,{mimeType:mime});meetingRecorder=recorder;
  recorder.ondataavailable=event=>{chunks.push(event.data);size+=event.data.size;if(size>5*1024*1024||Date.now()-started>=170000)stopMeetingClip();};
  recorder.onstop=()=>{if(!meeting)return;meetingClip={blob:new Blob(chunks,{type:mime.split(';')[0]}),duration:Math.min(180,(Date.now()-started)/1000),id:permission.recording_id,nonce:crypto.randomUUID()};document.querySelector('#meeting-clip-draft').hidden=false;document.querySelector('#meeting-record').textContent='Record useful clip';};recorder.start(1000);document.querySelector('#meeting-record').textContent='Stop clip';meetingStatus('Recording a useful clip with everyone’s permission.');await pollMeeting();
 }catch(e){try{await meetingRequest('/recording',{recording:false});}catch{}toast(e.message);}
}
function stopMeetingClip(){if(meetingRecorder?.state==='recording')meetingRecorder.stop();if(meeting&&meetingIsHost())meetingRequest('/recording',{recording:false}).catch(()=>{});}
async function saveMeetingClip(){if(!meetingClip||!meeting)return;try{const r=await fetch('/api'+meetingPath('/clip/'+meetingClip.id),{method:'POST',headers:{'Content-Type':meetingClip.blob.type,'X-CSRF-Token':me.csrf,'X-Request-ID':meetingClip.nonce,'X-Audio-Duration':String(meetingClip.duration)},body:meetingClip.blob});const value=await r.json();if(!r.ok)throw new Error(value.error);meetingClip=null;document.querySelector('#meeting-clip-draft').hidden=true;toast('Call clip saved in this group.');}catch(e){toast(e.message);}}


function meetingScreenOwner(value,pid,sid){return !!value?.presentation&&value.presentation.participant_id===pid&&value.presentation.stream_id===sid;}
function renderMeetingScreen(){
 const video=document.querySelector('#meeting-screen-video'),panel=document.querySelector('#meeting-screen-panel'),shared=meeting?.presentation;
 const local=shared?.participant_id===meeting?.participant_id;
 const remote=shared?meetingScreenStreams.get(shared.participant_id):null;
 const stream=local?meetingScreen:remote?.stream;
 const authorized=shared&&stream&&meetingScreenOwner(meeting,shared.participant_id,stream.id);
 panel.hidden=!shared;document.querySelector('#meeting-shared-document').hidden=!!shared;
 document.querySelector('#meeting-presenter').textContent=shared?shared.name+' is presenting'+(authorized?'':' · connecting screen…'):'';
 if(authorized&&video.srcObject!==stream){video.srcObject=stream;video.muted=true;video.play().catch(()=>{});}
 if(!authorized&&video.srcObject){video.pause();video.srcObject=null;}
 document.querySelector('#meeting-screen-placeholder').hidden=!!authorized;
 document.querySelector('#meeting-share-screen').textContent=meetingScreen?'Stop sharing':'Share screen';
 document.querySelector('#meeting-share-screen').setAttribute('aria-pressed',String(!!meetingScreen));
 document.querySelector('#meeting-share-screen').disabled=meetingScreenBusy||!!(shared&&!local);
}
async function stopMeetingScreen(notify=true){
 const stream=meetingScreen;meetingScreen=null;
 if(stream){for(const track of stream.getTracks()){track.onended=null;track.stop();for(const item of meetingPeers.values())for(const sender of item.peer.getSenders())if(sender.track===track)item.peer.removeTrack(sender);}}
 if(notify&&meeting&&stream){try{const result=await meetingRequest('/presentation',{sharing:false});meeting.presentation=result.presentation;}catch(e){meetingStatus('Screen stopped. Shared status will clear when your participant leaves.');}}
 renderMeetingScreen();
}
async function toggleMeetingScreen(){
 if(!meeting||meetingScreenBusy)return;
 if(meetingScreen){await stopMeetingScreen();return;}
 if(!navigator.mediaDevices?.getDisplayMedia){toast('Screen sharing is unavailable in this browser. Join from a supported desktop browser to present. You can still view shared work here.');return;}
 const active=meeting,epoch=meetingEpoch;meetingScreenBusy=true;renderMeetingScreen();let stream;
 try{
  stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30}},audio:false});
  if(epoch!==meetingEpoch||!meeting||meeting.id!==active.id){stream.getTracks().forEach(t=>t.stop());return;}
  const result=await meetingRequest('/presentation',{sharing:true,stream_id:stream.id});
  if(epoch!==meetingEpoch){stream.getTracks().forEach(t=>t.stop());return;}
  meeting.presentation=result.presentation;meetingScreen=stream;
  for(const item of meetingPeers.values())for(const track of stream.getVideoTracks())item.peer.addTrack(track,stream);
  stream.getVideoTracks()[0].onended=()=>stopMeetingScreen();meetingStatus('You are presenting. Use Stop sharing when finished.');
 }catch(e){stream?.getTracks().forEach(t=>t.stop());if(e.name!=='NotAllowedError'&&e.name!=='AbortError')toast(e.message);}
 finally{meetingScreenBusy=false;renderMeetingScreen();}
}

document.querySelector('#group-call-button').onclick=openMeeting;
document.querySelector('#meeting-close').onclick=()=>closeMeeting();
document.querySelector('#meeting-start-reign').onclick=startMeetingReign;
document.querySelector('#meeting-mute').onclick=()=>{meetingMuted=!meetingMuted;meetingStream?.getAudioTracks().forEach(t=>t.enabled=!meetingMuted);document.querySelector('#meeting-mute').textContent=meetingMuted?'Unmute':'Mute';document.querySelector('#meeting-mute').setAttribute('aria-pressed',String(meetingMuted));};
document.querySelector('#meeting-enable-audio').onclick=async()=>{try{await meetingContext?.resume();await document.querySelector('#meeting-reign-audio').play();for(const audio of meetingAudio.values())await audio.play();document.querySelector('#meeting-enable-audio').hidden=true;}catch{meetingStatus('Speaker playback is blocked. Check browser audio permissions.');}};
document.querySelector('#meeting-select').onchange=event=>{const [kind,id]=event.target.value.split(':');if(id){meetingItemKey='';meetingNavigate({kind,asset_id:id,page:0,highlight:'',paused:true}).catch(e=>toast(e.message));}};
document.querySelector('#meeting-prev').onclick=()=>meetingNavigate({page:meeting.stage.page-1,highlight:''}).catch(e=>toast(e.message));
document.querySelector('#meeting-next').onclick=()=>meetingNavigate({page:meeting.stage.page+1,highlight:''}).catch(e=>toast(e.message));
document.querySelector('#meeting-pause').onclick=()=>meetingNavigate({paused:!meeting.stage.paused}).catch(e=>toast(e.message));
document.querySelector('#meeting-stage').onclick=event=>{const field=event.target.closest('[data-walk-field]');if(field&&meetingIsHost())meetingNavigate({highlight:field.dataset.walkField}).catch(e=>toast(e.message));};
document.querySelector('#meeting-question-form').onsubmit=async event=>{event.preventDefault();const input=document.querySelector('#meeting-question'),text=input.value.trim();if(!text)return;try{await meetingRequest('/question',{text,request_id:crypto.randomUUID()});input.value='';await pollMeeting();}catch(e){toast(e.message);}};
document.querySelector('#meeting-consent').onchange=event=>meetingRequest('/consent',{allow:event.target.checked}).then(pollMeeting).catch(e=>toast(e.message));
document.querySelector('#meeting-record').onclick=startMeetingClip;
document.querySelector('#meeting-save-clip').onclick=saveMeetingClip;
document.querySelector('#meeting-discard-clip').onclick=()=>{meetingClip=null;document.querySelector('#meeting-clip-draft').hidden=true;};
document.querySelector('#meeting-confirm-invite').onclick=()=>{document.querySelector('#meeting-invite-request').hidden=true;invitePeople();};
document.querySelector('#meeting-dismiss-invite').onclick=()=>{document.querySelector('#meeting-invite-request').hidden=true;};
// Screen/tab switching keeps group calls connected; explicit Leave or page exit cleans up.
window.addEventListener('pagehide',()=>{if(meeting)closeMeeting(true);});

document.querySelector('#meeting-share-screen').onclick=toggleMeetingScreen;
document.querySelector('#meeting-invite-people').onclick=invitePeople;
document.querySelector('#meeting-present-mode').onclick=()=>{const node=document.querySelector('.meeting-shared-work');if(document.fullscreenElement)document.exitFullscreen?.();else node.requestFullscreen?.().catch(()=>toast('Full screen is unavailable here.'));};

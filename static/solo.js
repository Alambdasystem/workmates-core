'use strict';
let soloReturnRoom=null,soloActive=false,livePeer=null,liveChannel=null,liveStream=null,liveStarting=false,liveEpoch=0,liveMuted=false,liveTimer=null,soloSignature='',liveCaption='',liveTurns=new Set();
function liveState(text){document.querySelector('#solo-status').textContent=text;}
let liveConnectTimer=null,liveAudioMonitor=null,liveOrbMeter=null;
function callStage(stage){document.querySelector('#solo-view').dataset.callStage=stage;document.querySelector('#call-stage-label').textContent=({ringing:'Ringing',connecting:'Connecting',connected:'Connected',failed:'Call failed',ended:'Call ended',microphone:'Allow microphone access'})[stage]||stage;}
let soloOpening=false,ringContext=null,ringTimer=null,ringTones=[];
function stopRingtone(){clearInterval(ringTimer);ringTimer=null;ringTones.forEach(t=>{try{t.stop();}catch{}});ringTones=[];ringContext?.close().catch(()=>{});ringContext=null;document.querySelector('#reign-eye').classList.remove('ringing');}
function startRingtone(){
 stopRingtone();document.querySelector('#reign-eye').classList.add('ringing');
 const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
 try{ringContext=new AudioContext();const ring=()=>{if(!ringContext||ringContext.state==='closed')return;const gain=ringContext.createGain();gain.gain.value=.025;gain.connect(ringContext.destination);for(const frequency of [440,480]){const oscillator=ringContext.createOscillator();oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.start();oscillator.stop(ringContext.currentTime+.75);ringTones.push(oscillator);}};ring();ringTimer=setInterval(ring,2500);}catch{stopRingtone();}
}
async function openSolo(){
 if(!room||soloOpening)return;closeMobileNavigation();endLive();soloOpening=true;const previous=room.id,epoch=liveEpoch;
 if(!room.private)soloReturnRoom=previous;
 document.querySelector('#solo-view').hidden=false;document.querySelector('#solo-name').textContent=room.agent_name;
 document.querySelector('#solo-messages').innerHTML='<div class="solo-welcome"><h1>Calling '+esc(room.agent_name)+'…</h1><p>Your private conversation is opening.</p></div>';
 liveState('Ringing…');callStage('ringing');startRingtone();liveConnectTimer=setTimeout(()=>endLive('The call did not connect. Please try again.',true),45000);
 try{const result=await api(`/rooms/${previous}/solo`,'POST',{});if(epoch!==liveEpoch)return;await loadRooms();if(epoch!==liveEpoch)return;await selectRoom(result.id);if(epoch!==liveEpoch)return;soloActive=true;soloSignature='';renderSolo();await startLive();}
 catch(e){if(epoch===liveEpoch){endLive(e.message,true);}}
 finally{soloOpening=false;}
}
async function closeSolo(){
 endLive();soloActive=false;document.querySelector('#solo-view').hidden=true;const returnRoom=soloReturnRoom;soloReturnRoom=null;
 if(returnRoom&&rooms.some(r=>r.id===returnRoom))await selectRoom(returnRoom);
}
function renderSolo(){
 if(!soloActive||!room?.private)return;
 const signature=JSON.stringify([room.messages,room.files,room.documents.map(d=>[d.id,d.version]),room.jobs]);if(signature===soloSignature)return;soloSignature=signature;
 const root=document.querySelector('#solo-messages'),near=root.scrollHeight-root.scrollTop-root.clientHeight<100;
 root.innerHTML=room.messages.length?room.messages.map(m=>`<article class="solo-bubble ${m.kind==='agent'?'solo-agent':'solo-human'}"><small>${esc(m.kind==='agent'?room.agent_name:'You')}</small><div class="formatted">${markdown(m.content)}</div>${generationAttachmentCards(m)}${generationCardsFor(m)}</article>`).join(''):`<div class="solo-welcome"><h1>A little space<br>for your next thought.</h1><p>Type below or start live voice. Your one-on-one conversation stays here.</p></div>`;
 if(near||!room.messages.length)root.scrollTop=root.scrollHeight;
}
function sendLiveEvent(event){if(liveChannel?.readyState!=='open')throw new Error('The live voice session is not ready.');liveChannel.send(JSON.stringify(event));}
async function saveLiveTurn(role,text,eventId,rid){
 if(!text?.trim()||liveTurns.has(eventId))return;liveTurns.add(eventId);
 try{await api(`/rooms/${rid}/live/transcript`,'POST',{role,text:text.slice(0,8000),event_id:eventId.slice(0,100)});if(selected===rid)await refresh();}catch{liveTurns.delete(eventId);liveState('This transcript could not be saved. Copy it before leaving.');}
}
function endLive(message='Voice ended. Your saved conversation is still here.',failed=false){
 liveAudioMonitor?.();liveOrbMeter?.();liveAudioMonitor=null;liveOrbMeter=null;
 callStage(failed?'failed':'ended');stopRingtone();liveEpoch++;clearTimeout(liveConnectTimer);liveConnectTimer=null;clearTimeout(liveTimer);liveTimer=null;
 liveStream?.getTracks().forEach(track=>track.stop());liveStream=null;
 if(liveChannel){liveChannel.onmessage=null;liveChannel.onclose=null;liveChannel.close();}liveChannel=null;
 if(livePeer){livePeer.onconnectionstatechange=null;livePeer.close();}livePeer=null;
 const audio=document.querySelector('#solo-audio');audio.pause();audio.srcObject=null;
 document.querySelector('#call-audio-state').textContent='';liveStarting=false;liveMuted=false;document.querySelector('#live-start').textContent='☎ Call again';document.querySelector('#live-mute').hidden=true;document.querySelector('#live-mute').textContent='Mute microphone';document.querySelector('#live-mute').setAttribute('aria-pressed','false');document.querySelector('#live-speaker').hidden=true;document.querySelector('#reign-eye').classList.remove('listening','speaking','thinking');liveState(message);
}
async function startLive(){
 if(livePeer||liveStarting){endLive();return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){liveState('Live voice needs a browser with microphone and WebRTC support. You can still type below.');return;}
 clearVoiceNote();cancelVoice();callStage('microphone');clearTimeout(liveConnectTimer);liveConnectTimer=setTimeout(()=>endLive('Connection timed out. Check microphone permissions and try again.',true),45000);liveStarting=true;const epoch=++liveEpoch,rid=selected;liveCaption='';liveState('Connecting live voice…');document.querySelector('#reign-eye').classList.add('ringing');document.querySelector('#live-start').textContent='Cancel connection';
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(epoch!==liveEpoch||rid!==selected||!soloActive){stream.getTracks().forEach(t=>t.stop());return;}liveStream=stream;liveOrbMeter=meterCallOrb(stream,document.querySelector('#reign-eye'));
  const peer=new RTCPeerConnection();livePeer=peer;peer.addTrack(stream.getAudioTracks()[0],stream);
  const audio=document.querySelector('#solo-audio');document.querySelector('#call-audio-state').textContent='Waiting for REIGN audio';audio.onplaying=()=>{if(epoch===liveEpoch)document.querySelector('#call-audio-state').textContent='Speaker active · REIGN audio is playing';};audio.onwaiting=()=>{if(epoch===liveEpoch)document.querySelector('#call-audio-state').textContent='Buffering audio…';};peer.ontrack=event=>{audio.srcObject=event.streams[0]||new MediaStream([event.track]);audio.muted=false;audio.volume=1;liveAudioMonitor?.();liveAudioMonitor=monitorCallAudio(peer,audio,document.querySelector('#call-audio-state'));liveOrbMeter?.();liveOrbMeter=meterCallOrb(audio.srcObject,document.querySelector('#reign-eye'));audio.play().catch(()=>{document.querySelector('#call-audio-state').textContent='Speaker blocked · tap Enable speaker';document.querySelector('#live-speaker').hidden=false;liveState('Connected, but sound is blocked. Tap Enable speaker to hear REIGN.');});};
  peer.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(peer.connectionState)&&epoch===liveEpoch)endLive('Voice connection ended. Start again when ready.');};
  const channel=peer.createDataChannel('oai-events');liveChannel=channel;
  channel.onopen=()=>{if(epoch!==liveEpoch)return;clearTimeout(liveConnectTimer);liveConnectTimer=null;stopRingtone();callStage('connected');liveStarting=false;liveState('Connected · REIGN will greet you. Speak naturally or type below.');document.querySelector('#live-start').textContent='End voice';document.querySelector('#live-mute').hidden=false;document.querySelector('#reign-eye').classList.add('listening');liveTimer=setTimeout(()=>endLive('Voice ended after 15 minutes. Start again to continue.'),15*60*1000);};
  channel.onclose=()=>{if(epoch===liveEpoch)endLive('Voice connection ended.');};
  let greeted=false;
  channel.onmessage=event=>{
   if(epoch!==liveEpoch)return;let value;try{value=JSON.parse(event.data);}catch{return;}
   if(value.type==='session.created'&&!greeted){greeted=true;sendLiveEvent({type:'response.create',response:{output_modalities:['audio'],instructions:'Greet the user briefly as REIGN, say you are connected, and ask how you can help. Speak aloud.'}});}
   if(value.type==='input_audio_buffer.speech_started'){document.querySelector('#reign-eye').classList.remove('speaking','thinking');liveState(liveMuted?'Microphone muted':'Listening…');}
   if(value.type==='input_audio_buffer.speech_stopped')document.querySelector('#reign-eye').classList.add('thinking');
   if(value.type==='response.created'){document.querySelector('#reign-eye').classList.add('thinking');liveCaption='';document.querySelector('#solo-caption').textContent='';}
   if(value.type==='response.output_audio_transcript.delta'||value.type==='response.output_text.delta'){liveCaption+=value.delta||'';document.querySelector('#solo-caption').textContent=liveCaption;document.querySelector('#reign-eye').classList.remove('thinking');document.querySelector('#reign-eye').classList.add('speaking');liveState(room.agent_name+' is speaking…');}
   if(value.type==='response.output_audio_transcript.done'||value.type==='response.output_text.done'){saveLiveTurn('assistant',value.transcript||value.text||liveCaption,'assistant-'+(value.item_id||value.response_id||crypto.randomUUID()),rid);}
   if(value.type==='conversation.item.input_audio_transcription.completed'){saveLiveTurn('user',value.transcript,'user-'+value.item_id,rid);}
   if(value.type==='response.done'){document.querySelector('#reign-eye').classList.remove('speaking','thinking');liveState(liveMuted?'Microphone muted · you can type below.':'Listening · speak naturally.');}
   if(value.type==='error'){endLive(value.error?.message||'The voice service reported an error. Please try again.',true);}
  };
  callStage('connecting');
  const offer=await peer.createOffer();await peer.setLocalDescription(offer);
  const answer=await api(`/rooms/${rid}/live`,'POST',{sdp:offer.sdp});
  if(epoch!==liveEpoch||rid!==selected||!soloActive){peer.close();stream.getTracks().forEach(t=>t.stop());return;}
  await peer.setRemoteDescription({type:'answer',sdp:answer.sdp});
 }catch(e){if(epoch===liveEpoch)endLive(e.name==='NotAllowedError'?'Microphone access was denied. You can still type.':e.message||'Could not connect live voice.',true);}
}
document.querySelector('#solo-button').onclick=openSolo;
document.querySelector('#solo-close').onclick=closeSolo;
document.querySelector('#live-start').onclick=()=>{if(soloOpening){endLive('Call canceled.');soloOpening=false;return;}startLive();};
document.querySelector('#live-speaker').onclick=async()=>{try{await document.querySelector('#solo-audio').play();document.querySelector('#live-speaker').hidden=true;}catch{liveState('Audio playback is blocked by this browser.');}};
document.querySelector('#live-mute').onclick=()=>{liveMuted=!liveMuted;liveStream?.getAudioTracks().forEach(t=>t.enabled=!liveMuted);document.querySelector('#live-mute').textContent=liveMuted?'Unmute microphone':'Mute microphone';document.querySelector('#live-mute').setAttribute('aria-pressed',String(liveMuted));if(liveMuted){try{sendLiveEvent({type:'input_audio_buffer.clear'});}catch{}}liveState(liveMuted?'Microphone muted · you can type below.':'Listening · speak naturally.');};
document.querySelector('#solo-form').onsubmit=async event=>{
 event.preventDefault();const input=document.querySelector('#solo-input'),text=input.value.trim();if(!text)return;const button=document.querySelector('#solo-send');button.disabled=true;
 try{if(liveChannel?.readyState==='open'){sendLiveEvent({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});sendLiveEvent({type:'response.create'});await saveLiveTurn('user',text,'typed-'+crypto.randomUUID(),selected);}else{await api(`/rooms/${selected}/messages`,'POST',{content:text,request_id:crypto.randomUUID()});await refresh();liveState('Your workmate is responding…');}input.value='';document.querySelector('#solo-messages').scrollTop=document.querySelector('#solo-messages').scrollHeight;}catch(e){liveState(e.message);}finally{button.disabled=false;}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(livePeer||liveStarting))endLive('Voice paused while the app is in the background. Start again when ready.');});
window.addEventListener('pagehide',()=>endLive());

document.querySelector('#solo-emoji-button').onclick=()=>{const picker=document.querySelector('#solo-emoji-picker');picker.hidden=!picker.hidden;};
document.querySelector('#solo-emoji-picker').onclick=event=>{const button=event.target.closest('[data-emoji]');if(!button)return;const input=document.querySelector('#solo-input');input.value+=button.dataset.emoji;input.focus();document.querySelector('#solo-emoji-picker').hidden=true;};

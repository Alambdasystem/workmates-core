'use strict';
function callMicrophone(acquire,timeout=20000){
 let expired=false,timer;const pending=Promise.resolve().then(acquire).then(stream=>{if(expired){stream.getTracks().forEach(t=>t.stop());throw new Error('Microphone request expired.');}return stream;});
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Microphone did not become ready. Allow microphone access, then retry.'));},timeout);});
 return Promise.race([pending,deadline]).finally(()=>clearTimeout(timer));
}
async function callReadyOffer(peer){
 await peer.setLocalDescription(await peer.createOffer());
 if(peer.iceGatheringState!=='complete')await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);resolve();};const changed=()=>{if(peer.iceGatheringState==='complete')done();};peer.addEventListener('icegatheringstatechange',changed);timer=setTimeout(done,8000);changed();});
 if(!peer.localDescription?.sdp)throw new Error('Could not prepare the voice connection.');return peer.localDescription.sdp;
}
function reportCallState(kind,state,rid){if(typeof api==='function')api('/diagnostics','POST',{kind,state,room_id:rid||null}).catch(()=>{});}

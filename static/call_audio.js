'use strict';
function callAudioLevel(samples){let sum=0;for(const value of samples){const x=(value-128)/128;sum+=x*x;}return samples.length?Math.min(1,Math.sqrt(sum/samples.length)):0;}
function callAudioHealth({bytes=0,energy=0,playing=false}){if(!bytes)return 'waiting';return playing?'playing':'speaker-blocked';}
function monitorCallAudio(peer,audio,label){
 let stopped=false;const timer=setInterval(async()=>{if(stopped)return;try{const stats=await peer.getStats();let bytes=0,energy=0;stats.forEach(report=>{if(report.type==='inbound-rtp'&&(report.kind==='audio'||report.mediaType==='audio')){bytes+=report.bytesReceived||0;energy+=report.totalAudioEnergy||0;}});const state=callAudioHealth({bytes,energy,playing:!audio.paused&&audio.currentTime>0});label.textContent=({waiting:'Connected · waiting for incoming audio',playing:'Receiving audio · speaker playback active','speaker-blocked':'Audio received · tap Enable audio if you cannot hear REIGN'})[state];label.dataset.audioState=state;}catch{}},1000);
 return()=>{stopped=true;clearInterval(timer);};
}
function meterCallOrb(stream,orb){
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return()=>{};
 let context,frame;try{context=new Audio();context.resume().catch(()=>{});const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=256;source.connect(analyser);const data=new Uint8Array(analyser.fftSize);const tick=()=>{analyser.getByteTimeDomainData(data);orb.style.setProperty('--voice-level',callAudioLevel(data));frame=requestAnimationFrame(tick);};tick();return()=>{cancelAnimationFrame(frame);source.disconnect();context.close().catch(()=>{});orb.style.removeProperty('--voice-level');};}catch{context?.close().catch(()=>{});return()=>{};}
}

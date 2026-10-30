const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,value:'',innerHTML:'',attrs:{},style:{setProperty(){}},classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v},querySelector(){return el('audio')},removeAttribute(){},close(){},addEventListener(){},focus(){}});return elements.get(id);}
let modalBody='';const context={console,date:()=>"today",document:{querySelector:el},window:{},navigator:{},esc:s=>String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])),room:{id:'r',name:'Shared',files:[{id:'img',filename:'Image.png',mime:'image/png',size:300},{id:'sheet',filename:'Budget.xlsx',mime:'application/octet-stream',size:100}],documents:[{id:'doc',title:'Plan',version:2}],drive_mounts:[{id:'mount',name:'Team Drive'}]},isGenerationImage:f=>f.mime.startsWith('image/'),modal(t,b){modalBody=b},closeMobileNavigation(){},adminVisibility(){},setInterval(){return 1},clearInterval(){},api:async()=>[{id:'notice',title:'Invitation',seen:0}],me:{csrf:'csrf'},toast(){},URL:{revokeObjectURL(){}},cancelVoice(){}};
vm.createContext(context);vm.runInContext(fs.readFileSync('static/social.js','utf8'),context);
assert(context.renderVoiceNotes({attachments:[{type:'voice',id:'note',duration:12}]}).includes('/api/rooms/r/voice/note'));assert(!context.renderVoiceNotes({attachments:[{type:'image'}]}));
context.agentDrive();assert(modalBody.includes('Image.png'));assert(modalBody.includes('Budget.xlsx'));assert(modalBody.includes('Plan'));assert(modalBody.includes('Team Drive'));
context.agentDrive('images');assert(modalBody.includes('Image.png'));assert(!modalBody.includes('Budget.xlsx'));assert(!modalBody.includes('Shared Canvas'));
context.agentDrive('documents');assert(!modalBody.includes('Image.png'));assert(modalBody.includes('Budget.xlsx'));
context.clearVoiceNote();assert(el('#voice-note-draft').hidden);assert.equal(el('#record-note-button').attrs['aria-pressed'],'false');
(async()=>{
 await context.refreshNotifications();assert.equal(el('#notification-count').textContent,1);
 modalBody='existing workspace tools';el('#modal').open=true;
 await context.refreshNotifications(true);assert.equal(modalBody,'existing workspace tools','arrival must not replace an open workspace dialog');
 el('#modal').open=false;await context.refreshNotifications(true);
 assert.notEqual(modalBody,'existing workspace tools','unread arrival should still prompt when no dialog is open');
 console.log('Social UI passed: shared files, notification count, and open-dialog protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});

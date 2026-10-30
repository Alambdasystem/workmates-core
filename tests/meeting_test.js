const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
assert(fs.existsSync('static/meeting.js'),'Shared meeting UI must exist');
const source=fs.readFileSync('static/meeting.js','utf8'),cut=source.indexOf("document.querySelector('#group-call-button').onclick");
const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',dataset:{},hidden:false,classList:{add(){},remove(){}},querySelectorAll(){return[];},querySelector(){return null;}});return elements.get(id);}
const c={document:{querySelector:el},esc:s=>String(s??'').replace(/[<>&"]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[x])),markdown:s=>String(s),console};vm.createContext(c);vm.runInContext(source.slice(0,cut),c);
const html=c.meetingPageHTML({type:'slide',title:'<script>',blocks:['Budget'],image_id:'img',layout:'background'},'r');
assert(html.includes('&lt;script&gt;'));assert(html.includes('data-walk-field="title"'));assert(html.includes('data-walk-field="block:0"'));assert(html.includes('/api/rooms/r/files/img/preview'));
assert.equal(c.meetingViewKey({version:2,stage:{asset_id:'a',page:1,highlight:'title'}}),'2:a:1:title');
assert.notEqual(c.meetingViewKey({version:2,stage:{asset_id:'a',page:1,highlight:'title'}}),c.meetingViewKey({version:3,stage:{asset_id:'a',page:1,highlight:'block:0'}}));
console.log('Meeting UI passed: safe shared pages, source images, stable field IDs and synchronized highlight revisions.');

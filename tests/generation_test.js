// Dependency-free behavior checks for the actual generation UI code.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('static/app.js','utf8');
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{hidden:false,innerHTML:'',textContent:'',value:'docx',scrollTop:0,open:false,replaceChildren(){this.innerHTML='';},showModal(){this.open=true;},close(){this.open=false;},focus(){}});return elements.get(id);}
const context={console,document:{addEventListener(){},querySelectorAll(){return[];}},$:element,selected:'room',me:{role:'admin'},toast(){},api:async()=>({kind:'text',body:'safe text'})};
vm.createContext(context);
vm.runInContext(app.slice(app.indexOf('const esc ='),app.indexOf('\nlet me,'))+'\n'+app.slice(app.indexOf('function markdown(source)'),app.indexOf('\nlet canvasDoc')),context);
vm.runInContext(fs.readFileSync('static/assets.js','utf8'),context);
vm.runInContext(fs.readFileSync('static/generation.js','utf8'),context);
context.room={id:'room',agent_name:'REIGN',mode:'mention',enabled:true,messages:[{id:1,kind:'human',content:'REIGN make a Word document'}],documents:[],files:[],jobs:[{id:'job',message_id:1,status:'running'}],generated_documents:[]};
async function run(){
 assert.equal(context.generationKind('REIGN make a picture of a forest'),'image');
 assert.equal(context.generationKind('Create an architecture diagram'),'diagram');
 assert.equal(context.generationKind('Make a Word document'),'document');
 assert.equal(context.generationKind('The picture looks good'),null);
 assert(context.generationCardsFor(context.room.messages[0]).includes('generation-loading'));
 await context.openGenerationPreview('job','job');assert(element('#generation-preview').open);
 assert(element('#generation-preview-content').innerHTML.includes('manifest-sheet'));
 assert(element('#generation-preview-download').hidden);
 context.room.documents=[{id:'doc',title:'Launch plan',body:'## Goal\nShip **together**.',version:1}];
 context.room.generated_documents=[{job_id:'job',message_id:1,document_id:'doc'}];
 await context.syncGenerationPreview();assert.equal(element('#generation-preview-title').textContent,'Launch plan');
 assert(element('#generation-preview-content').innerHTML.includes('<strong>together</strong>'));
 assert(!element('#generation-preview-download').hidden);assert(element('#generation-preview-download').href.endsWith('/doc/download/docx'));
 element('#generation-preview-format').value='pdf';context.updateGenerationDownload();assert(element('#generation-preview-download').href.endsWith('/doc/download/pdf'));
 assert(context.generationCardsFor(context.room.messages[0]).includes('generation-ready'));
 context.closeGenerationPreview();assert(!element('#generation-preview').open);assert.equal(element('#generation-preview-content').innerHTML,'');
 const failed=context.generationLoading('image','failed','Provider <error>');assert(!failed.includes('manifest-dots'));assert(failed.includes('Provider &lt;error&gt;'));
 context.room.files=[{id:'image',job_id:'job',message_id:1,filename:'Diagram.svg',mime:'application/octet-stream'}];
 assert(context.generationOutputCard('file','image').includes('/files/image/preview'));
 assert(context.generationAttachmentCards({attachments:[{id:'image'}]}).includes('generation-ready'));
 await context.openGenerationPreview('file','image');assert(element('#generation-preview-content').innerHTML.includes('full-image-preview'));
 assert(element('#generation-preview-download').href.endsWith('/files/image'));
 context.closeGenerationPreview();
 console.log('Generation UI passed: intent, pending, automatic completion, document formatting, image/diagram cards, downloads, failure, close and deduplication.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

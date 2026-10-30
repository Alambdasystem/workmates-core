'use strict';
let generationPreview = null, generationPreviewRevision = '', generationPreviewRequest = 0;

function generationKind(content) {
  if (!/\b(make|create|generate|draw|design|build|produce|draft|write|render|edit|revise)\b/i.test(content || '')) return null;
  if (/\b(diagram|flowchart|architecture|schematic|mind ?map)\b/i.test(content)) return 'diagram';
  if (/\b(pictures?|images?|photos?|illustrations?|logos?|artwork|posters?)\b/i.test(content)) return 'image';
  if (/\b(word|documents?|docx|reports?|proposals?|briefs?|memos?|pdf)\b/i.test(content)) return 'document';
  if (/\b(files?|csv|spreadsheets?|charts?|presentations?|slides?|videos?|mp4|slideshow)\b/i.test(content)) return 'file';
  return null;
}
function isGenerationImage(file) {
  return /^image\//.test(file.mime || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.filename || '');
}
function generationArt(kind) {
  if (kind === 'image') return '<span class="manifest-picture"><i class="manifest-sun"></i><i class="manifest-mountain"></i><i class="manifest-glow"></i></span>';
  if (kind === 'diagram') return '<span class="manifest-diagram"><i></i><i></i><i></i><b></b><b></b></span>';
  return '<span class="manifest-sheet"><i></i><i></i><i></i><i></i><i></i><b>✦</b></span>';
}
function generationLoading(kind, status='running', error='', progress='') {
  const stopped = !['queued','running'].includes(status);
  const title = stopped ? (status === 'completed' ? 'No preview was produced' : 'Generation stopped') : ({image:'Bringing your image to life',diagram:'Connecting your ideas',document:'Your document is taking shape',file:'Building your file'}[kind] || 'Creating your work');
  return `<div class="manifest-stage ${stopped?'manifest-stopped':''}"><div class="manifest-object" aria-hidden="true">${generationArt(kind)}</div><strong>${esc(title)}</strong><span>${esc(stopped ? (error || 'Your conversation and saved work are still here.') : progress || (status==='queued'?'Queued · waiting for REIGN':'Generating · the preview appears when content is saved'))}</span>${stopped?'':'<span class="manifest-dots" aria-hidden="true"><i></i><i></i><i></i></span>'}</div>`;
}
function generationOutputCard(kind, id) {
  const doc = kind === 'document' ? room.documents.find(d=>d.id===id) : null;
  const file = kind === 'file' ? (room.files || []).find(f=>f.id===id) : null;
  if (!doc && !file) return '';
  const title = doc?.title || file.filename;
  let art;
  if (doc) art = `<div class="document-miniature formatted" aria-hidden="true" inert><strong>${esc(doc.title)}</strong>${markdown(doc.body.slice(0,1800))}</div>`;
  else if (isGenerationImage(file)) art = `<img class="generation-image" src="/api/rooms/${esc(room.id)}/files/${esc(file.id)}/preview" alt="${esc(title)}" loading="lazy" decoding="async">`;
  else art = `<div class="generation-file-symbol" aria-hidden="true">${/\.csv$/i.test(title)?'▦':'▤'}<span>${esc(title.split('.').pop().toUpperCase())}</span></div>`;
  return `<div class="generation-asset"><button type="button" class="generation-card generation-ready ${doc?'generation-document':''}" data-open-generation="${kind}:${esc(id)}" aria-label="Open full screen preview of ${esc(title)}"><div class="generation-card-art">${art}<span class="generation-expand" aria-hidden="true">⤢</span></div><div class="generation-card-caption"><span><strong>${esc(title)}</strong><small>${doc?'DOCUMENT · WORD / PDF':isGenerationImage(file)?'IMAGE / DIAGRAM':'GENERATED FILE'} · Preview & download</small></span><b aria-hidden="true">↗</b></div></button>${file?assetActionBar(file):''}</div>`;
}
function generationCardsFor(message) {
  let cards = '';
  if (message.kind === 'human') {
    const docs = (room.generated_documents || []).filter(o=>o.message_id===message.id);
    const files = (room.files || []).filter(f=>f.message_id===message.id);
    cards = docs.map(o=>generationOutputCard('document',o.document_id)).join('') + files.map(f=>generationOutputCard('file',f.id)).join('');
    const job = room.jobs.find(j=>j.message_id===message.id && j.status!=='chat_only');
    const kind = generationKind(message.content);
    if (job && kind && cards && ['queued','running'].includes(job.status) && job.progress) cards += `<div class="generation-card generation-loading">${generationLoading(kind,job.status,job.error,job.progress)}</div>`;
    if (job && kind && !cards) cards = `<button type="button" class="generation-card generation-loading" data-open-generation="job:${esc(job.id)}" aria-label="Open generation preview">${generationLoading(kind,job.status,job.error,job.progress)}</button>`;
  } else {
    // Older documents predate explicit output tracking; their real links identify them.
    cards = room.documents.filter(d=>message.content.includes(d.id) && !(room.generated_documents || []).some(o=>o.document_id===d.id)).map(d=>generationOutputCard('document',d.id)).join('');
  }
  return cards ? '<div class="generation-cards">'+cards+'</div>' : '';
}
function generationAttachmentCards(message) {
  if (message.kind==='human') return renderMessageAssets(message);
  return (message.attachments || []).filter(a=>{
    const file = (room.files || []).find(f=>f.id===a.id);
    return !file || !room.messages.some(m=>m.id===file.message_id);
  }).map(a=>generationOutputCard('file',a.id)).join('');
}
function startGenerationFeedback(content) {
  const kind = generationKind(content);
  if (!kind || !room?.enabled) return;
  const named = new RegExp('(?<!\\w)@?(?:workmate|'+room.agent_name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')(?!\\w)','i').test(content);
  if (room.mode!=='all' && !named) return;
  clearGenerationFeedback();
  const element = document.createElement('div'); element.className='generation-transient generation-cards'; element.setAttribute('role','status'); element.innerHTML='<div class="generation-card generation-loading">'+generationLoading(kind,'queued')+'</div>';
  $('#messages').append(element); $('#messages').scrollTop=$('#messages').scrollHeight;
}
function clearGenerationFeedback() { document.querySelectorAll('.generation-transient').forEach(el=>el.remove()); }
function closeGenerationPreview() {
  generationPreviewRequest++; generationPreview=null; generationPreviewRevision='';
  const dialog=$('#generation-preview'); if (dialog?.open) dialog.close();
  if ($('#generation-preview-content')) $('#generation-preview-content').replaceChildren();
}
async function openGenerationPreview(kind,id) {
  generationPreview={kind,id,roomId:selected}; generationPreviewRevision='';
  $('#generation-preview-content').replaceChildren(); $('#generation-preview-format').value='docx';
  if (!$('#generation-preview').open) $('#generation-preview').showModal();
  $('#generation-preview-close').focus();
  await syncGenerationPreview();
}
async function syncGenerationPreview() {
  if (!generationPreview || !room || generationPreview.roomId!==selected) return;
  let {kind,id}=generationPreview;
  const job=kind==='job'?room.jobs.find(j=>j.id===id):null;
  if (job) {
    const doc=(room.generated_documents || []).find(o=>o.job_id===id);
    const file=(room.files || []).find(f=>f.job_id===id);
    if (doc || file) { generationPreview={...generationPreview,kind:doc?'document':'file',id:doc?doc.document_id:file.id}; return syncGenerationPreview(); }
  }
  const doc=kind==='document'?room.documents.find(d=>d.id===id):null;
  const file=kind==='file'?(room.files || []).find(f=>f.id===id):null;
  const signature=JSON.stringify([kind,id,doc?.version,job?.status,job?.error,job?.progress]);
  if (signature===generationPreviewRevision) return;
  generationPreviewRevision=signature; const request=++generationPreviewRequest;
  const content=$('#generation-preview-content'), download=$('#generation-preview-download');
  $('#generation-preview-use').hidden=!file || !isReusableImage(file); $('#generation-preview-drive').hidden=!file;
  $('#generation-preview-format').hidden=!doc; $('#generation-preview-edit').hidden=!doc; download.hidden=!doc&&!file;
  $('#generation-preview-kind').textContent=doc?'DOCUMENT PREVIEW':file?'GENERATED FILE':'GENERATION PREVIEW';
  $('#generation-preview-title').textContent=doc?.title || file?.filename || 'Creating your work';
  $('#generation-preview-status').textContent=doc?'Saved document · version '+doc.version:file?'Ready to preview and download':'Updates automatically as REIGN works';
  if (doc) {
    const scroll=content.scrollTop;
    content.innerHTML=`<article class="full-document-preview"><h1>${esc(doc.title)}</h1><div class="formatted">${markdown(doc.body)}</div></article>`; content.scrollTop=scroll;
    updateGenerationDownload();
  } else if (file) {
    download.href=`/api/rooms/${selected}/files/${file.id}`; download.download=file.filename;
    if (file.mime==='video/mp4' || /\.mp4$/i.test(file.filename)) {
      content.innerHTML=`<div class="full-image-preview"><video controls playsinline preload="metadata" src="/api/rooms/${selected}/files/${file.id}/preview"></video></div>`;
    } else if (isGenerationImage(file)) {
      content.innerHTML=`<div class="full-image-preview"><img src="/api/rooms/${selected}/files/${file.id}/preview" alt="${esc(file.filename)}"></div>`;
    } else {
      content.innerHTML='<p class="preview-note" role="status">Opening your file preview…</p>';
      try {
        const value=await api(`/rooms/${selected}/files/${file.id}/preview`);
        if (request!==generationPreviewRequest || !generationPreview) return;
        if (['presentation','image_document'].includes(value.kind)) { content.innerHTML=renderCompositionPreview(value); return; }
        content.innerHTML=`<article class="full-document-preview"><h1>${esc(file.filename)}</h1>${value.kind==='document'?`<p class="preview-note">Text preview · download the original for its full layout.</p><div class="formatted">${markdown(value.body)}</div>`:`<pre class="full-text-preview">${esc(value.body)}</pre>`}</article>`;
      } catch(e) { if (request===generationPreviewRequest) content.innerHTML=`<p class="preview-note">${esc(e.message)} You can still download the original.</p>`; }
    }
  } else {
    const message=room.messages.find(m=>m.id===job?.message_id);
    content.innerHTML='<div class="full-generation-loading">'+generationLoading(generationKind(message?.content) || 'document',job?.status || 'interrupted',job?.error,job?.progress)+'</div>';
    if (job && !['queued','running'].includes(job.status)) $('#generation-preview-status').textContent='Generation finished without a preview';
  }
}
function updateGenerationDownload() {
  if (generationPreview?.kind!=='document') return;
  const format=$('#generation-preview-format').value;
  $('#generation-preview-download').href=`/api/rooms/${generationPreview.roomId}/documents/${generationPreview.id}/download/${format}`;
  $('#generation-preview-download').download='';
}
document.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-open-generation]');
    if (!button || !me || !room) return;
    const [kind,id]=button.dataset.openGeneration.split(':');
    openGenerationPreview(kind,id).catch(e=>toast(e.message));
  });
  $('#generation-preview-close').onclick=closeGenerationPreview;
  $('#generation-preview').addEventListener('close',()=>{ generationPreview=null; generationPreviewRevision=''; generationPreviewRequest++; $('#generation-preview-content').replaceChildren(); });
  $('#generation-preview-format').onchange=updateGenerationDownload;
  $('#generation-preview-edit').onclick=async()=>{ const doc=generationPreview; closeGenerationPreview(); if (doc?.kind==='document') { try { await openCanvas(doc.id); } catch(e) { toast(e.message); } } };
  // Images can fail independently; leave a useful fallback and the original download.
  document.addEventListener('error',event=>{
    if (event.target.matches?.('.generation-image,.full-image-preview img')) {
      const note=document.createElement('span'); note.className='preview-note'; note.textContent='Image preview unavailable. Open the preview to download the original.'; event.target.replaceWith(note);
    }
  },true);
});

'use strict';
let selectedAssetIds=[];
function isReusableImage(file) { return /\.(png|jpe?g|webp|gif)$/i.test(file.filename || '') || ['image/png','image/jpeg','image/webp','image/gif'].includes(file.mime); }
function assetActionBar(file) {
  const copies=(room.drive_copies || []).filter(c=>c.artifact_id===file.id);
  return `<div class="asset-action-bar"><span class="asset-saved">✓ Saved in this chat${copies.length?' · Drive copy saved':''}</span><div>${isReusableImage(file)?`<button type="button" data-use-asset="${esc(file.id)}" class="text-button">▧ Use in chat</button>`:''}<button type="button" data-drive-asset="${esc(file.id)}" class="text-button">↥ Upload to Drive</button></div></div>`;
}
function renderMessageAssets(message) {
  return (message.attachments || []).map(a=>`<button type="button" class="referenced-asset" data-open-generation="file:${esc(a.id)}">▧ Using saved image · ${esc(a.filename)}</button>`).join('');
}
function clearAssetSelection() { selectedAssetIds=[]; if ($('#selected-assets')) renderAssetSelection(); }
function renderAssetSelection() {
  const root=$('#selected-assets');root.hidden=!selectedAssetIds.length;
  root.innerHTML=`<div class="selected-asset-list">${selectedAssetIds.map((id,index)=>{const f=(room?.files || []).find(f=>f.id===id);return f?`<div class="selected-asset"><img src="/api/rooms/${selected}/files/${esc(id)}/preview" alt="${esc(f.filename)}"><span>${index+1}. ${esc(f.filename)}</span><button type="button" data-move-asset="${esc(id)}" data-direction="-1" aria-label="Move image earlier">←</button><button type="button" data-move-asset="${esc(id)}" data-direction="1" aria-label="Move image later">→</button><button type="button" data-remove-asset="${esc(id)}" aria-label="Remove ${esc(f.filename)}">×</button></div>`:'';}).join('')}</div><div class="compose-asset-actions"><small>${selectedAssetIds.length}/10 images · sent with your next message</small><button type="button" data-compose-assets="word">Word</button><button type="button" data-compose-assets="slides">Slides</button><button type="button" data-compose-assets="video">Video</button></div>`;
}
function useAsset(id) {
  const file=(room?.files || []).find(f=>f.id===id);
  if (!file || !isReusableImage(file)) return toast('Choose a saved PNG, JPEG, WebP or GIF image.');
  if (!selectedAssetIds.includes(id)) {
    if (selectedAssetIds.length===10) return toast('Choose up to ten images.');
    selectedAssetIds.push(id);
  }
  renderAssetSelection();
  if (!$('#message-input').value.trim()) $('#message-input').value=room.agent_name+', ';
  $('#message-input').focus();toast('Image selected. Your next message will include it.');
}
function pickAssets() {
  const rid=selected, images=(room.files || []).filter(isReusableImage);let picked=[...selectedAssetIds];
  modal('Use images saved in this chat.',`<p>Choose up to ten images. The order you choose is the order REIGN receives.</p><div class="asset-picker-grid">${images.map(f=>`<label class="asset-picker-item"><img loading="lazy" src="/api/rooms/${rid}/files/${esc(f.id)}/preview" alt="${esc(f.filename)}"><span><input type="checkbox" data-pick-asset="${esc(f.id)}" ${picked.includes(f.id)?'checked':''}>${esc(f.filename)}</span><small>${esc((f.meta?.prompt || '').slice(0,130))}</small></label>`).join('') || '<p>No reusable images are saved here yet. Ask REIGN to generate an image first.</p>'}</div>`,async()=>{if (selected!==rid) throw new Error('The chat changed. Choose images again.');selectedAssetIds=picked;renderAssetSelection();$('#message-input').focus();},'Use selected images');
  $('#modal-body').onchange=event=>{const box=event.target.closest('[data-pick-asset]');if(!box)return;if(box.checked){if(picked.length===10){box.checked=false;return toast('Choose up to ten images.');}picked.push(box.dataset.pickAsset);}else picked=picked.filter(id=>id!==box.dataset.pickAsset);};
}
async function uploadAssetToDrive(id) {
  const file=(room.files || []).find(f=>f.id===id),mounts=room.drive_mounts || [],rid=selected;
  if (!file) return;
  if (!mounts.length) { if(me.role==='admin') { await manageDrive(); } else toast('Ask your administrator to link a Drive folder to this chat.');return; }
  modal('Upload a copy to Drive.',`<p><strong>${esc(file.filename)}</strong> stays saved in this chat. This creates a copy in your selected Drive folder.</p><label>Drive folder<select name="mount_id">${mounts.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label><label>Subfolder ID (optional)<input name="folder_id" placeholder="Leave blank for the linked folder"></label>`,async f=>{
    const result=await api(`/rooms/${rid}/drive/save-file`,'POST',{file_id:id,mount_id:f.get('mount_id'),folder_id:f.get('folder_id')});
    await refresh();$('#modal-body').innerHTML='<p>✓ Your original stays in this chat. The Drive copy was saved.</p>'+(result.url?`<a href="${esc(result.url)}" target="_blank" rel="noopener noreferrer">Open Drive copy ↗</a>`:'');
    $('#save-modal').hidden=true;saveAction=null;return false;
  },'Upload copy to Drive');
}
function renderCompositionPreview(value) {
  const meta=value.meta || {};
  if(value.kind==='image_document')return `<article class="full-document-preview"><h1>${esc(value.title)}</h1><p>${esc(meta.introduction || '')}</p>${meta.optimized_images?'<p class="preview-note">The export uses optimized image copies. Originals remain saved in this chat.</p>':''}${(meta.images || []).map(image=>`<figure class="composed-word-image"><img src="/api/rooms/${selected}/files/${esc(image.file_id)}/preview" alt="${esc(image.caption || 'Document image')}"><figcaption>${esc(image.caption)}</figcaption></figure>`).join('')}</article>`;
  return `<div class="presentation-preview">${(meta.slides || []).map((slide,index)=>`<article class="slide-preview ${slide.layout==='background'?'background-slide':''}">${slide.image_id?`<img src="/api/rooms/${selected}/files/${esc(slide.image_id)}/preview" alt="Slide image">`:''}<div class="slide-preview-text"><small>SLIDE ${index+1}</small><h2>${esc(slide.title)}</h2><p>${esc(slide.body)}</p></div></article>`).join('')}</div>`;
}
document.addEventListener('DOMContentLoaded',()=>{
  $('#asset-picker-button').onclick=pickAssets;
  $('#link-drive-button').onclick=()=>manageDrive().catch(e=>toast(e.message));
  $('#generation-preview-use').onclick=()=>{const value=generationPreview;closeGenerationPreview();if(value?.kind==='file')useAsset(value.id);};
  $('#generation-preview-drive').onclick=()=>{const value=generationPreview;closeGenerationPreview();if(value?.kind==='file')uploadAssetToDrive(value.id).catch(e=>toast(e.message));};
  document.addEventListener('click',event=>{
    const use=event.target.closest('[data-use-asset]');if(use)useAsset(use.dataset.useAsset);
    const drive=event.target.closest('[data-drive-asset]');if(drive)uploadAssetToDrive(drive.dataset.driveAsset).catch(e=>toast(e.message));
    const remove=event.target.closest('[data-remove-asset]');if(remove){selectedAssetIds=selectedAssetIds.filter(id=>id!==remove.dataset.removeAsset);renderAssetSelection();}
    const move=event.target.closest('[data-move-asset]');if(move){const i=selectedAssetIds.indexOf(move.dataset.moveAsset),j=i+Number(move.dataset.direction);if(i>=0&&j>=0&&j<selectedAssetIds.length){[selectedAssetIds[i],selectedAssetIds[j]]=[selectedAssetIds[j],selectedAssetIds[i]];renderAssetSelection();}}
    const compose=event.target.closest('[data-compose-assets]');if(compose){const prompts={word:'Make a Word document with these selected images in this order, with captions.',slides:'Make a PowerPoint presentation using these selected images as slide backgrounds.',video:'Make an MP4 slideshow from these selected images in this order, with smooth fade transitions.'};$('#message-input').value=room.agent_name+', '+prompts[compose.dataset.composeAssets];$('#message-input').focus();}
  });
});

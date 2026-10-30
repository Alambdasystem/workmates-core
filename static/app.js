'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let me, rooms = [], room, selected, tab = 'work', lastMessages = '', refreshing = false, saveAction;
const TOOL_LABELS = {drive_save_file:'Copy images & files to Drive',list_saved_files:'Find saved images & files',read_saved_image:'Look at saved images',create_image_document:'Word documents with images',create_presentation:'PowerPoint with image backgrounds',create_slideshow:'MP4 slideshows & transitions',generate_images:'Generate image batches',web_search:'Web research',create_task:'Create tasks',update_task:'Update tasks',search_documents:'Search group documents',save_document:'Create Word / PDF / Canvas',read_document:'Read group documents',update_document:'Edit Canvas documents',branch_document:'Branch documents',code_interpreter:'Code execution & data files',image_generation:'Generate images',drive_list:'Browse connected Drive folders',drive_read:'Read Drive documents',drive_save:'Save Google Docs',drive_branch:'Create Drive subfolders'};
const invitation = new URLSearchParams(location.hash.slice(1));
const inviteToken = invitation.get('invite');
if (inviteToken) {
  history.replaceState(null, '', '/');
  $('#auth-title').textContent = 'Join your team.';
  $('#auth-description').textContent = 'Your invitation is tied to your email address.';
  $('#name-label').hidden = false;
  $('#name-label input').required = true;
  $('#join-note').hidden = false;
  $('#login-form [name=email]').value = invitation.get('email') || '';
  $('#sign-in').textContent = 'Join workspace ↗';
}
async function api(path, method = 'GET', body) {
  const response = await fetch('/api' + path, {method, headers: {'Content-Type':'application/json','X-CSRF-Token':me?.csrf || ''}, body:body === undefined ? undefined : JSON.stringify(body)});
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && me) { closeGenerationPreview(); clearAssetSelection(); clearVoiceNote(); endLive();soloActive=false;$('#solo-view').hidden=true;clearInterval(socialPoll); me = null; $('#workspace').hidden = true; $('#login').hidden = false; }
    throw new Error(value.error || 'Request failed.');
  }
  return value;
}
function messageBody(message) {
  const sources = (message.sources || []).filter(s => /^https?:\/\//i.test(s.url));
  return `<div class="formatted">${markdown(message.content)}</div>` + generationAttachmentCards(message) + (sources.length ? '<div class="source-links">Sources: ' + sources.map((s,i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">[${i+1}] ${esc(s.title)}</a>`).join(' ') + '</div>' : '');
}
function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; setTimeout(() => $('#toast').hidden = true, 4500); }
function timestamp(t) { return new Date(t * 1000).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }
function date(t) { return new Date(t * 1000).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function initials(name) { return name.split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase(); }
function adminVisibility() { document.querySelectorAll('.admin-only').forEach(el => el.hidden = me?.role !== 'admin'); }
async function boot() {
  me = await api('/me');
  $('#login').hidden = true; $('#workspace').hidden = false;
  $('#my-name').textContent = me.name; $('#my-avatar').textContent = initials(me.name);
  $('#workspace-model').textContent = me.model || 'OpenAI';
  $('#role-label').textContent = me.role === 'admin' ? 'Workspace administrator' : 'Team member';
  $('#empty-description').textContent = me.role === 'admin' ? 'Create your first group, invite your people, and give your workmate a job.' : 'Your groups will appear here when your admin invites you.';
  adminVisibility(); await loadRooms();
  const destination = new URLSearchParams(location.hash.slice(1));
  if (destination.has('canvas') && destination.has('room') && rooms.some(r=>r.id===destination.get('room'))) {
    await selectRoom(destination.get('room')); await openCanvas(destination.get('canvas')); history.replaceState(null,'','/');
  }
  await initSocial();
}
async function loadRooms() {
  rooms = await api('/rooms'); renderRooms();
  if (!selected && rooms.length) await selectRoom(rooms[0].id);
}
function renderRooms() {
  $('#room-list').innerHTML = rooms.map(r => `<button data-room="${esc(r.id)}" class="${selected === r.id ? 'active' : ''}"><span class="room-icon">#</span>${esc(r.name)}${r.enabled ? '<span class="dot"></span>' : ''}</button>`).join('') + (me.role === 'admin' ? '<button id="create-in-nav">＋ New group</button>' : '');
  $('#create-in-nav')?.addEventListener('click', createGroup);
}
async function selectRoom(id) {
  if (canvasDirty() && !confirm('Leave your unsaved document edits?')) return;
  closeGenerationPreview(); clearAssetSelection(); closeCanvas(true); cancelVoice(); clearVoiceNote();
  if (soloActive && selected!==id) {endLive();soloActive=false;$('#solo-view').hidden=true;}
  closeMobileNavigation();
  selected = id; lastMessages = ''; room = null;
  $('#empty-workspace').hidden = true; $('#room-view').hidden = false;
  renderRooms(); await refresh();
}
async function refresh() {
  if (!me || !selected || refreshing) return;
  refreshing = true;
  const id = selected;
  try {
    const next = await api('/rooms/' + id);
    if (selected !== id) return;
    room = next; renderRoom();
    if (canvasDoc && canvasRoom === selected) { const changed = room.documents.find(d => d.id === canvasDoc.id); if (changed && changed.version !== canvasDoc.version) $('#canvas-state').textContent = 'A newer version is available. Reload saved to review it. Your draft is retained.'; }
  } catch (error) {
    if (error.message === 'Group not found.') { selected = null; room = null; $('#room-view').hidden = true; $('#empty-workspace').hidden = false; await loadRooms(); }
    else if (me) $('#run-state').textContent = 'Connection interrupted. Retrying…';
  } finally { refreshing = false; }
}
function renderRoom() {
  $('#mobile-room-title').textContent = room.name;
  $('#room-name').textContent = room.name; $('#room-description').textContent = room.description;
  $('#invite-button').hidden=!!room.private;
  $('#solo-button').textContent='☎ Call '+room.agent_name;
  $('#member-count').textContent = `${room.members.length} ${room.members.length === 1 ? 'person' : 'people'}`;
  $('#agent-name').textContent = room.agent_name;
  $('#agent-state').textContent = `${room.agent_name} ${room.enabled ? 'on' : 'off'}`;
  $('#agent-state').classList.toggle('on', room.enabled);
  $('#agent-description').textContent = room.autopilot_limit_reached && room.mode === 'all' ? 'Autopilot reached its 30-request hourly limit. You can still call your workmate by name.' : room.enabled ? (room.mode === 'all' ? 'Autopilot follows the conversation, researches when useful, and helps the group move forward.' : `Say ${room.agent_name} naturally in your message. No @ needed.`) : 'Paused. Your team can keep chatting, and all your work stays here.';
  $('#tool-chips').innerHTML = '<span>Chat & summaries</span>' + room.tools.map(t => `<span>${esc(TOOL_LABELS[t] || t)}</span>`).join('');
  $('#toggle-label').textContent = `Workmate ${room.enabled ? 'on' : 'off'}`;
  $('#switch').classList.toggle('on', room.enabled);
  $('#api-status').textContent = me.ai_connected ? `AI: ${me.model} · Voice: ${me.transcription_model}` : 'OpenAI key not configured yet';
  $('#autopilot-toggle').checked = room.mode === 'all';
  $('#goal-summary').textContent = room.goal || 'No goal set yet. Add a resolution for your workmate to aim for.';
  $('#tool-toggles').innerHTML = (me.available_tools || Object.keys(TOOL_LABELS)).map(t => `<label class="control-line"><span>${esc(TOOL_LABELS[t] || t)}</span><input type="checkbox" role="switch" data-tool="${esc(t)}" ${room.tools.includes(t) ? 'checked' : ''}></label>`).join('');
  $('#composer-hint').textContent = room.enabled ? (room.mode === 'all' ? 'Autopilot is following this group' : `Say ${room.agent_name} to bring in your workmate`) : 'Workmate off · Team chat stays open';
  const signature = JSON.stringify([room.messages,room.jobs,room.generated_documents,room.documents.map(d=>[d.id,d.version]),room.files,room.drive_copies]);
  if (signature !== lastMessages) {
    const messages = $('#messages');
    const nearBottom = !lastMessages || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
    messages.innerHTML = room.messages.length ? room.messages.map(m => `<article class="message ${m.kind === 'agent' ? 'agent' : ''}"><span class="${m.kind === 'agent' ? 'agent-avatar' : 'avatar'}">${m.kind === 'agent' ? '✳' : esc(initials(m.author))}</span><div class="content"><div class="message-header"><strong>${esc(m.author)}</strong>${m.kind === 'agent' ? '<span class="ai-label">WORKMATE</span>' : ''}<time>${esc(timestamp(m.created))}</time></div><div class="body">${messageBody(m)}</div>${generationCardsFor(m)}</div></article>`).join('') : `<div class="chat-welcome"><span class="agent-avatar">✳</span><h2>This is where it starts.</h2><p>Share an idea, ask a question, or bring your team up to speed. Your conversation and your work live here.</p></div>`;
    lastMessages = signature;
    if (nearBottom) messages.scrollTop = messages.scrollHeight;
  }
  const active = room.jobs.filter(j => ['queued','running'].includes(j.status));
  const failure = room.jobs.find(j => ['failed','interrupted'].includes(j.status));
  $('#run-state').textContent = active.length ? `${room.agent_name} · ${active.find(j=>j.progress)?.progress || `${active.length} request${active.length === 1 ? '' : 's'} in progress`}` : failure && room.jobs[0]?.id === failure.id ? failure.error : '';
  renderWork(); adminVisibility(); syncGenerationPreview(); updateChatViewport(); renderSolo();
}
function renderWork() {
  const root = $('#work-content');
  if (tab === 'drive') {
    renderDrive(root);
  } else if (tab === 'people') {
    root.innerHTML = room.members.map(u => `<div class="person"><span class="avatar">${esc(initials(u.name))}</span><div><strong>${esc(u.name)}</strong><small>${esc(u.email)} · ${esc(u.role)}</small></div>${me.role === 'admin' && u.role !== 'admin' ? `<button class="text-button" data-remove="${esc(u.id)}">Remove</button>` : ''}</div>`).join('');
  } else if (tab === 'activity') {
    root.innerHTML = room.actions.length ? room.actions.map(a => `<div class="activity"><strong>${esc(a.actor)} · ${esc(a.action.replaceAll('_',' '))}</strong><p>${esc(a.detail)}</p><time>${esc(date(a.created))}</time></div>`).join('') : '<p class="empty-note">Workmate actions and admin changes will appear here.</p>';
  } else {
    root.innerHTML = `<div class="work-actions"><button class="secondary" id="new-document">＋ Document</button><button class="secondary" id="import-document">Upload ↑</button></div>` + `<h3 class="section-title">TASKS · ${room.tasks.length}</h3>` + (room.tasks.length ? room.tasks.map(t => `<label class="task ${t.status === 'done' ? 'done' : ''}"><input type="checkbox" data-task="${esc(t.id)}" ${t.status === 'done' ? 'checked' : ''}><div><strong>${esc(t.title)}</strong><small>${esc(t.assignee || 'Unassigned')}</small></div></label>`).join('') : '<p class="empty-note">Ask your workmate to turn the conversation into a task list.</p>') + `<h3 class="section-title">DOCUMENTS · ${room.documents.length}</h3>` + (room.documents.length ? room.documents.map(d => `<button class="document" data-document="${esc(d.id)}">▤ &nbsp; ${esc(d.title)}</button>`).join('') : '<p class="empty-note">Briefs, plans, and drafts saved by your workmate will appear here.</p>') + `<h3 class="section-title">GENERATED FILES · ${(room.files || []).length}</h3>` + (room.files || []).map(f => `<button class="file-download" data-open-generation="file:${esc(f.id)}">Preview ${esc(f.filename)} <small>${Math.ceil(f.size/1024)} KB</small></button>`).join('');
  }
}
function modal(title, body, action, saveLabel = 'Save changes') {
  $('#modal-body').onclick = null;
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = body; $('#modal-error').textContent = '';
  $('#save-modal').textContent = saveLabel; $('#save-modal').hidden = !action; $('#cancel-modal').textContent = action ? 'Cancel' : 'Close';
  saveAction = action;
  $('#modal').showModal();
}
function createGroup() {
  modal('A new place to work.', '<label>Group name<input name="name" placeholder="e.g. Product launch" maxlength="80" required></label><label>What is this group for?<textarea name="description" rows="3" maxlength="500" placeholder="A shared purpose gives everyone a good place to start."></textarea></label><p class="hint">Only you can create groups. Each group starts with a paused REIGN workmate that you can customize.</p>', async f => {
    const result = await api('/rooms','POST',{name:f.get('name'),description:f.get('description')});
    selected = result.id; await loadRooms(); await selectRoom(result.id); toast('Group created. Make it yours.');
  }, 'Create group ↗');
}
function configure() {
  const r = room, id = r.id;
  modal('Make your workmate yours.', `<label>Workmate name<input name="agent_name" value="${esc(r.agent_name)}" maxlength="40" required></label><label>System prompt<textarea name="prompt" rows="8" maxlength="12000" required>${esc(r.prompt)}</textarea></label><label>When should it respond?<select name="mode"><option value="mention" ${r.mode === 'mention' ? 'selected' : ''}>When named (REIGN, @name, or workmate)</option><option value="all" ${r.mode === 'all' ? 'selected' : ''}>Autopilot · Follow the discussion</option></select></label><label>Group goal<textarea name="goal" rows="3" maxlength="2000" placeholder="What resolution should your workmate help the group reach?">${esc(r.goal || '')}</textarea></label><label class="check"><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''}>Workmate on</label><h3 class="section-title">ALLOWED TOOLS</h3>${(me.available_tools || []).map(t => `<label class="check"><input type="checkbox" name="${esc(t)}" ${r.tools.includes(t) ? 'checked' : ''}>${esc(TOOL_LABELS[t] || t)}</label>`).join('')}<p class="hint">Members can't change these settings. Saving settings cancels pending requests. Previously saved work stays available.</p>`, async f => {
    await api(`/rooms/${id}/workmate`, 'PATCH', {agent_name:f.get('agent_name'),prompt:f.get('prompt'),mode:f.get('mode'),enabled:f.has('enabled'),goal:f.get('goal'),tools:Object.keys(TOOL_LABELS).filter(t => f.has(t))});
    await loadRooms(); await refresh(); toast('Workmate settings saved.');
  });
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#auth-error').textContent = ''; $('#sign-in').disabled = true;
  try {
    const f = new FormData(event.target);
    await api(inviteToken ? '/join' : '/login', 'POST', {email:f.get('email'),password:f.get('password'),name:f.get('name'),token:inviteToken});
    event.target.reset(); await boot();
  } catch(error) { $('#auth-error').textContent = error.message; }
  finally { $('#sign-in').disabled = false; }
});
$('#modal-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!saveAction) return;
  $('#modal-error').textContent = ''; $('#save-modal').disabled = true;
  try { const result = await saveAction(new FormData(event.target)); if (result !== false) $('#modal').close(); }
  catch(error) { $('#modal-error').textContent = error.message; }
  finally { $('#save-modal').disabled = false; }
});
$('#close-modal').onclick = $('#cancel-modal').onclick = () => $('#modal').close();
$('#new-group').onclick = $('#first-group').onclick = createGroup;
$('#configure-button').onclick = configure; $('#invite-button').onclick = invitePeople;
$('#room-list').addEventListener('click', event => { const b = event.target.closest('[data-room]'); if (b) selectRoom(b.dataset.room); });
$('#logout').onclick = async () => { closeGenerationPreview(); clearAssetSelection(); cancelVoice(); clearVoiceNote(); endLive(); clearInterval(socialPoll); try { await api('/logout','POST',{}); location.href = '/'; } catch(e) { toast(e.message); } };
$('#password-button').onclick = () => modal('Change your password.', '<label>Current password<input name="current" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="14" maxlength="256" required></label><p class="hint">Use at least 14 characters. Other sessions will be signed out.</p>', async f => { await api('/password','POST',{current:f.get('current'),password:f.get('password')}); me = await api('/me'); toast('Password updated.'); });
let settingsSaving = false;
async function updateSettings(changes) {
  if (settingsSaving) return;
  settingsSaving = true;
  document.querySelectorAll('.admin-controls input, .admin-controls button').forEach(el => el.disabled = true);
  const r = room;
  try {
  await api(`/rooms/${r.id}/workmate`,'PATCH',{agent_name:r.agent_name,prompt:r.prompt,mode:r.mode,enabled:r.enabled,tools:r.tools,goal:r.goal || '',...changes});
  await loadRooms(); await refresh();
  } finally { settingsSaving = false; document.querySelectorAll('.admin-controls input, .admin-controls button').forEach(el => el.disabled = false); }
}
$('#autopilot-toggle').onchange = async event => {
  const enabled = event.target.checked;
  try { await updateSettings({mode:enabled ? 'all' : 'mention',enabled:enabled || room.enabled}); toast(enabled ? 'Autopilot on. Following new group messages.' : 'Autopilot paused. Call your workmate by name.'); }
  catch(e) { toast(e.message); await refresh(); }
};
$('#tool-toggles').onchange = async event => {
  const tool = event.target.dataset.tool; if (!tool) return;
  let tools = event.target.checked ? [...new Set([...room.tools,tool])] : room.tools.filter(t => t !== tool);
  if (tool==='image_generation') tools=event.target.checked?[...new Set([...tools,'generate_images'])]:tools.filter(t=>t!=='generate_images');
  try { await updateSettings({tools}); toast('Tool settings saved.'); } catch(e) { toast(e.message); await refresh(); }
};
$('#goal-button').onclick = () => {
  const r = room;
  modal('Where should this group get to?', `<label>Group goal<textarea name="goal" rows="5" maxlength="2000" placeholder="e.g. Agree on a launch plan, research the open questions, and assign the next steps.">${esc(r.goal || '')}</textarea></label><p class="hint">Autopilot uses this goal and the conversation to decide when to research or contribute.</p>`, async f => { await updateSettings({goal:f.get('goal')}); toast('Group goal saved.'); });
};
$('#toggle-agent').onclick = async () => {
  const r = room;
  $('#toggle-agent').disabled = true;
  try {
    await api(`/rooms/${r.id}/workmate`,'PATCH',{agent_name:r.agent_name,prompt:r.prompt,mode:r.mode,enabled:!r.enabled,tools:r.tools});
    await loadRooms(); await refresh(); toast(r.enabled ? 'Workmate paused. Group chat stays open.' : 'Workmate turned on.');
  } catch(e) { toast(e.message); } finally { $('#toggle-agent').disabled = false; }
};
let pendingSend;
$('#message-form').addEventListener('submit', async event => {
  event.preventDefault(); const content = $('#message-input').value.trim(); if (!content || !selected) return;
  if (!pendingSend || pendingSend.content !== content || pendingSend.room !== selected || JSON.stringify(pendingSend.attachment_ids || []) !== JSON.stringify(selectedAssetIds)) pendingSend = {content,room:selected,attachment_ids:[...selectedAssetIds],request_id:crypto.randomUUID()};
  $('#send-button').disabled = true; startGenerationFeedback(content);
  try { await api(`/rooms/${pendingSend.room}/messages`,'POST',pendingSend); $('#message-input').value = ''; selectedAssetIds=selectedAssetIds.filter(id=>!pendingSend.attachment_ids.includes(id)); renderAssetSelection(); pendingSend = null; clearGenerationFeedback(); await refresh(); $('#messages').scrollTop = $('#messages').scrollHeight; }
  catch(error) { clearGenerationFeedback(); toast(error.message); } finally { $('#send-button').disabled = false; }
});
$('#message-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!$('#send-button').disabled) $('#message-form').requestSubmit(); } });
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active',x === b)); renderWork(); });
$('#work-content').addEventListener('click', async event => {
  const documentButton = event.target.closest('[data-document]');
  if (documentButton) { try { await openCanvas(documentButton.dataset.document); } catch(e) { toast(e.message); } }
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    const id = room.id, member = room.members.find(m => m.id === remove.dataset.remove);
    modal('Remove group access?', `<p>${esc(member.name)} will lose access to this group. Their previous messages will stay in the conversation.</p>`, async () => { await api(`/rooms/${id}/members/${member.id}`,'DELETE',{}); await refresh(); toast('Member removed.'); },'Remove member');
  }
});
$('#work-content').addEventListener('change', async event => {
  const task = event.target.closest('[data-task]'); if (!task) return;
  try { await api(`/rooms/${room.id}/tasks/${task.dataset.task}`,'PATCH',{status:task.checked ? 'done' : 'open'}); await refresh(); }
  catch(e) { toast(e.message); await refresh(); }
});
if (!inviteToken) boot().catch(error => { if (error.message !== 'Please sign in.') $('#auth-error').textContent = error.message; });
setInterval(() => { if (!document.hidden) refresh(); }, 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

// Microphone access is opt-in and stops on navigation, timeout, or tab hiding.
let voiceRecorder = null, voiceStream = null, voiceTimer = null, voiceGeneration = 0, transcribing = false, voiceStarting = false;
function stopTracks() { voiceStream?.getTracks().forEach(t => t.stop()); voiceStream = null; clearTimeout(voiceTimer); }
function voiceUI(recording, status = '') {
  $('#voice-button').textContent = recording ? '■ Stop' : '🎙 Talk';
  $('#voice-button').setAttribute('aria-pressed',String(recording));
  $('#voice-button').setAttribute('aria-label',recording ? 'Stop voice dictation' : 'Start voice dictation');
  $('#voice-status').textContent = status;
}
function cancelVoice() {
  voiceGeneration++;
  if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
  voiceRecorder = null; stopTracks(); voiceUI(false);
}
$('#voice-button').onclick = async () => {
  if (voiceRecorder?.state === 'recording') { voiceRecorder.stop(); return; }
  if (transcribing || voiceStarting || !selected) return;
  clearVoiceNote();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Voice recording is unavailable in this browser. You can use your keyboard microphone.'); return; }
  const generation = ++voiceGeneration, roomId = selected, chunks = [];
  voiceStarting = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    if (generation !== voiceGeneration) { stream.getTracks().forEach(t => t.stop()); return; }
    voiceStream = stream;
    const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) { stopTracks(); toast('Use a browser that records WebM or MP4 audio, or your keyboard microphone.'); return; }
    const recorder = new MediaRecorder(voiceStream,{mimeType}); voiceRecorder = recorder;
    let size = 0;
    recorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size > 7 * 1024 * 1024 && recorder.state === 'recording') recorder.stop(); } };
    recorder.onerror = () => { cancelVoice(); toast('Recording stopped. Check your microphone and try again.'); };
    recorder.onstop = async () => {
      stopTracks(); voiceRecorder = null;
      if (generation !== voiceGeneration || selected !== roomId || !me) return;
      const audio = new Blob(chunks,{type:mimeType});
      if (!audio.size || audio.size > 8 * 1024 * 1024) { voiceUI(false,'Recording is empty or too large. Try again.'); return; }
      transcribing = true; $('#voice-button').disabled = true; voiceUI(false,'Transcribing your recording…');
      try {
        const response = await fetch(`/api/rooms/${roomId}/transcribe`,{method:'POST',headers:{'Content-Type':mimeType,'X-CSRF-Token':me.csrf},body:audio});
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'Transcription failed.');
        if (generation !== voiceGeneration || selected !== roomId || !me) return;
        const spokenName = room?.agent_name === 'REIGN' ? value.text.replace(/^rain(?=[,\s])/i,'REIGN') : value.text;
        const draft = $('#message-input').value;
        if (draft.length + spokenName.length + 1 > 8000) throw new Error('The transcript is too long for this message. Try a shorter recording.');
        $('#message-input').value = draft + (draft && !/\s$/.test(draft) ? ' ' : '') + spokenName;
        voiceUI(false,'Transcript added. Review it, then press Send.'); $('#message-input').focus();
      } catch(e) { if (generation === voiceGeneration) voiceUI(false,e.message); }
      finally { transcribing = false; $('#voice-button').disabled = false; }
    };
    recorder.start(1000); voiceUI(true,'Recording… Tap Stop when done. Maximum 90 seconds.');
    voiceTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); },90000);
  } catch(e) { stopTracks(); voiceUI(false,e.name === 'NotAllowedError' ? 'Microphone permission was denied. Enable it in your browser, or use your keyboard microphone.' : 'Could not start your microphone. Try again.'); }
  finally { voiceStarting = false; }
};
document.addEventListener('visibilitychange',() => { if (document.hidden) cancelVoice(); });
window.addEventListener('pagehide',cancelVoice);

// Formatting always escapes source text before adding the supported markup.
function markdown(source) {
  const inline = text => esc(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,label,url) => { url=url.trim(); return /^(https?:\/\/|\/api\/rooms\/|\/#canvas=)/i.test(url) ? `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>` : label; });
  const lines = String(source || '').split('\n'), out = [];
  for (let i=0; i<lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) { const code=[]; while (++i<lines.length && !lines[i].startsWith('```')) code.push(lines[i]); out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>'); }
    else if (line.includes('|') && /^[\s|:\-]+$/.test(lines[i+1] || '') && (lines[i+1] || '').includes('-')) { const rows=[line]; i++; while (i+1<lines.length && lines[i+1].includes('|')) rows.push(lines[++i]); out.push('<div class="table-scroll"><table>'+rows.map((r,n)=>'<tr>'+r.replace(/^\||\|$/g,'').split('|').map(c=>`<${n?'td':'th'}>${inline(c.trim())}</${n?'td':'th'}>`).join('')+'</tr>').join('')+'</table></div>'); }
    else if (/^#{1,3}\s/.test(line)) { const level=line.indexOf(' '); out.push(`<h${level}>${inline(line.slice(level+1))}</h${level}>`); }
    else if (/^\s*[-*]\s/.test(line)) out.push('<p class="list-line">• '+inline(line.replace(/^\s*[-*]\s+/,''))+'</p>');
    else if (line.trim()) out.push('<p>'+inline(line)+'</p>');
  }
  return out.join('');
}
let canvasDoc = null, canvasRoom = null, canvasSaving = false;
function canvasDirty() { return canvasDoc && ($('#canvas-title').value !== canvasDoc.title || $('#canvas-body').value !== canvasDoc.body); }
function canvasPreview() { $('#canvas-preview-title').textContent = $('#canvas-title').value; $('#canvas-preview-body').innerHTML = markdown($('#canvas-body').value); $('#canvas-state').textContent = canvasDirty() ? 'Unsaved changes' : `Saved · version ${canvasDoc?.version || 1}`; }
function closeCanvas(force=false) { if (!force && canvasDirty() && !confirm('Close without saving your edits?')) return false; $('#canvas').hidden=true; canvasDoc=null; canvasRoom=null; document.body.classList.remove('canvas-open'); return true; }
async function openCanvas(id, force=false) {
  if (!force && canvasDirty() && !confirm('Leave your unsaved document edits?')) return;
  const rid=selected, doc=await api(`/rooms/${rid}/documents/${id}`); if (rid!==selected) return;
  canvasDoc=doc; canvasRoom=rid;
  $('#canvas-title').value=doc.title; $('#canvas-body').value=doc.body; $('#canvas-error').textContent=''; $('#canvas-instruction').value='';
  $('#canvas-history').innerHTML=(doc.history || []).map(v=>`<button class="text-button" data-version="${v.version}">Version ${v.version} · ${esc(v.actor)} · ${esc(date(v.created))} — load as draft</button>`).join('') || '<p class="hint">Previous saved versions appear here.</p>';
  $('#canvas').hidden=false; document.body.classList.add('canvas-open'); canvasPreview();
}
async function saveCanvas() {
  if (!canvasDoc || canvasSaving) return;
  if (!canvasDirty()) return;
  canvasSaving=true; $('#canvas-save').disabled=true;
  const doc=canvasDoc, title=$('#canvas-title').value, body=$('#canvas-body').value;
  try { const result=await api(`/rooms/${canvasRoom}/documents/${doc.id}`,'PATCH',{title,body,version:doc.version}); if (canvasDoc?.id===doc.id) { canvasDoc={...doc,title,body,version:result.version}; canvasPreview(); } await refresh(); }
  finally { canvasSaving=false; $('#canvas-save').disabled=false; }
}
async function canvasAction(action) { $('#canvas-error').textContent=''; try { await action(); } catch(e) { $('#canvas-error').textContent=e.message; } }
$('#canvas-close').onclick=()=>closeCanvas();
$('#canvas-title').oninput=$('#canvas-body').oninput=canvasPreview;
$('#canvas-save').onclick=()=>canvasAction(saveCanvas);
$('#canvas-reload').onclick=()=>canvasAction(async()=>{ if (!canvasDirty() || confirm('Replace your draft with the latest saved version?')) await openCanvas(canvasDoc.id,true); });
$('#canvas-branch').onclick=()=>canvasAction(async()=>{ const title=prompt('Name this document branch', $('#canvas-title').value+' — branch'); if (!title) return; const result=await api(`/rooms/${canvasRoom}/documents/${canvasDoc.id}/branch`,'POST',{title,body:$('#canvas-body').value}); await refresh(); await openCanvas(result.id,true); });
$('#canvas-download').onclick=()=>canvasAction(async()=>{ await saveCanvas(); const link=document.createElement('a'); link.href=`/api/rooms/${canvasRoom}/documents/${canvasDoc.id}/download/${$('#canvas-format').value}`; link.download=''; link.click(); });
$('#canvas-ask').onclick=()=>canvasAction(async()=>{ const instruction=$('#canvas-instruction').value.trim(); if (!instruction) return; if (!room.enabled || !room.tools.includes('read_document') || !room.tools.includes('update_document')) throw new Error('Turn on the workmate and enable Read group documents and Edit Canvas documents first.'); await saveCanvas(); await api(`/rooms/${canvasRoom}/messages`,'POST',{content:`${room.agent_name}, revise Canvas document ${canvasDoc.id}. Read the current version first and use update_document. ${instruction}`,request_id:crypto.randomUUID()}); $('#canvas-instruction').value=''; $('#canvas-state').textContent=`${room.agent_name} is working. Reload saved when the new version is ready.`; await refresh(); });
$('#canvas-history').onclick=event=>{ const button=event.target.closest('[data-version]'); if (!button || !canvasDoc) return; if (canvasDirty() && !confirm('Replace your unsaved draft with this earlier version?')) return; const version=canvasDoc.history.find(v=>v.version===Number(button.dataset.version)); $('#canvas-title').value=version.title; $('#canvas-body').value=version.body; canvasPreview(); };
document.querySelectorAll('[data-format]').forEach(button=>button.onclick=()=>{ const area=$('#canvas-body'), start=area.selectionStart, end=area.selectionEnd, selectedText=area.value.slice(start,end); const formats={bold:`**${selectedText || 'bold text'}**`,heading:`\n## ${selectedText || 'Section heading'}\n`,list:`\n- ${selectedText || 'List item'}\n`,table:'\n| Item | Details |\n| --- | --- |\n| First | Description |\n',code:'\n```\n'+(selectedText || 'code here')+'\n```\n'}; area.setRangeText(formats[button.dataset.format],start,end,'end'); area.focus(); canvasPreview(); });
window.addEventListener('beforeunload',event=>{ if (canvasDirty()) { event.preventDefault(); event.returnValue=''; } });
$('#enable-tools').onclick=async()=>{ try { await updateSettings({tools:me.available_tools}); toast('All tools enabled. Drive tools need a connected folder.'); } catch(e) { toast(e.message); } };
$('#work-content').addEventListener('click',async event=>{
  try {
    if (event.target.closest('#new-document')) { const title=prompt('Document title'); if (!title) return; const d=await api(`/rooms/${selected}/documents`,'POST',{title,body:'Start writing here, or ask REIGN to draft this document.'}); await refresh(); await openCanvas(d.id); }
    if (event.target.closest('#import-document')) $('#document-upload').click();
    if (event.target.closest('#manage-drive')) await manageDrive();
    const browse=event.target.closest('[data-browse-drive]'); if (browse) await browseDrive(browse.dataset.browseDrive);
    const unmount=event.target.closest('[data-unmount-drive]'); if (unmount && confirm('Disconnect this folder from the group? Files in Google Drive will stay in place.')) { await api(`/rooms/${selected}/drive/mounts/${unmount.dataset.unmountDrive}`,'DELETE',{}); await refresh(); }
  } catch(e) { toast(e.message); }
});
$('#document-upload').onchange=async event=>{
  const file=event.target.files[0], rid=selected; event.target.value=''; if (!file) return;
  if (file.size>8*1024*1024) return toast('Choose a file smaller than 8 MB.');
  try { toast('Importing document…'); const response=await fetch(`/api/rooms/${rid}/documents/import`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-CSRF-Token':me.csrf},body:file}); const result=await response.json(); if (!response.ok) throw new Error(result.error); if (rid===selected) { await refresh(); await openCanvas(result.id); } } catch(e) { toast(e.message); }
};
function renderDrive(root) {
  root.innerHTML='<h3 class="section-title">CONNECTED DRIVE FOLDERS</h3><p class="hint">Work across multiple folders or accounts. Each folder connected here is available to this group. Save creates a new Google Doc; originals stay in place.</p>'+(me.role==='admin'?'<button class="secondary" id="manage-drive">Manage Drive connections +</button>':'')+(room.drive_mounts || []).map(m=>`<div class="drive-mount"><strong>${esc(m.name)}</strong><small>${esc(m.folder_id)}</small><button class="secondary" data-browse-drive="${esc(m.id)}">Browse ↗</button>${me.role==='admin'?`<button class="text-button" data-unmount-drive="${esc(m.id)}">Disconnect folder</button>`:''}</div>`).join('');
}
async function manageDrive() {
  const status=await api('/integrations/google');
  if (!status.configured) {
    modal('Connect Google Drive.',`<p>Set up the Workmates Google OAuth application once, then connect as many Google accounts and folders as you need.</p><p class="hint">In Google Cloud, enable Google Drive API and create an OAuth client of type Web application. Add the callback below as an authorized redirect URI. Configure the consent screen and add your account as a test user if the app is in testing.</p><label>Callback URL<input readonly value="${esc(status.callback)}"></label><label>Google OAuth client ID<input name="client_id" required autocomplete="off" placeholder="….apps.googleusercontent.com"></label><label>Google OAuth client secret<input name="client_secret" type="password" required autocomplete="off"></label><p class="hint">Credentials are encrypted on the server. Connecting Google opens its consent screen for read/write Drive access; group members only access folders you explicitly connect.</p>`,async f=>{ await api('/integrations/google/configure','POST',{client_id:f.get('client_id'),client_secret:f.get('client_secret'),origin:location.origin}); toast('Google app configured. Open Drive connections to connect an account.'); },'Save Google setup');
    return;
  }
  modal('Your Drive connections.',`<p>Connect multiple Google accounts, then attach selected folders to this group.</p><div id="google-accounts">${status.connections.map(c=>`<p>${esc(c.label)} <button type="button" class="text-button" data-disconnect-google="${esc(c.id)}">Disconnect account</button></p>`).join('')}</div><button type="button" id="connect-google" class="secondary">Connect another Google account ↗</button>${status.connections.length?`<label>Google account<select name="connection_id">${status.connections.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select></label><label>Folder link or ID<input name="folder_id" required placeholder="https://drive.google.com/drive/folders/…"></label><label>Name in this group<input name="name" maxlength="200" placeholder="e.g. Research, Client work, Product"></label><p class="hint">Everyone in this group can browse, import and save files in this folder and its subfolders using your connection. Shared Drive folders work too.</p>`:''}`,status.connections.length?async f=>{ const raw=String(f.get('folder_id')).trim(), match=raw.match(/\/folders\/([\w-]+)/); await api(`/rooms/${selected}/drive/mounts`,'POST',{connection_id:f.get('connection_id'),folder_id:match?match[1]:raw,name:f.get('name') || ''}); await refresh(); toast('Drive folder connected to this group.'); }:null,'Connect folder');
  $('#connect-google').onclick=async()=>{ try { const result=await api('/integrations/google/connect','POST',{}); location.assign(result.url); } catch(e) { $('#modal-error').textContent=e.message; } };
  $('#google-accounts').onclick=async event=>{ const b=event.target.closest('[data-disconnect-google]'); if (!b || !confirm('Remove this Google connection and its folders from all Workmates groups? Your Google files remain.')) return; try { await api('/integrations/google/'+b.dataset.disconnectGoogle,'DELETE',{}); $('#modal').close(); await refresh(); toast('Google connection removed.'); } catch(e) { $('#modal-error').textContent=e.message; } };
}
async function browseDrive(mountId, folderId='', trail=[], pageToken='') {
  const rid=selected, result=await api(`/rooms/${rid}/drive/browse`,'POST',{mount_id:mountId,folder_id:folderId,page_token:pageToken});
  const mount=room.drive_mounts.find(m=>m.id===mountId);
  modal(mount.name,`<div class="drive-browser-actions"><button type="button" id="drive-up" class="secondary">${trail.length?'↑ Parent folder':'↻ Refresh'}</button><button type="button" id="drive-new-folder" class="secondary">＋ Branch folder</button></div><p class="hint">${trail.map(t=>esc(t.name)).join(' / ') || 'Connected folder'}</p>${result.files.map(f=>`<div class="drive-entry"><strong>${esc(f.name)}</strong><button type="button" class="secondary" data-drive-file="${esc(f.id)}">${f.mimeType==='application/vnd.google-apps.folder'?'Open':'Import to Canvas'}</button></div>`).join('') || '<p>This folder is empty.</p>'}${result.nextPageToken?'<button type="button" id="drive-next" class="secondary">Next page →</button>':''}`,null);
  $('#drive-up').onclick=()=>browseDrive(mountId,trail.length?trail[trail.length-1].id:'',trail.slice(0,-1)).catch(e=>$('#modal-error').textContent=e.message);
  $('#drive-new-folder').onclick=async()=>{ const name=prompt('New subfolder name'); if (!name) return; try { await api(`/rooms/${rid}/drive/branch`,'POST',{mount_id:mountId,parent_id:folderId,name}); await browseDrive(mountId,folderId,trail); } catch(e) { $('#modal-error').textContent=e.message; } };
  $('#drive-next')?.addEventListener('click',()=>browseDrive(mountId,folderId,trail,result.nextPageToken).catch(e=>$('#modal-error').textContent=e.message));
  $('#modal-body').onclick=async event=>{ const button=event.target.closest('[data-drive-file]'); if (!button) return; const file=result.files.find(f=>f.id===button.dataset.driveFile); try { if (file.mimeType==='application/vnd.google-apps.folder') await browseDrive(mountId,file.id,[...trail,{id:folderId,name:file.name}]); else { const doc=await api(`/rooms/${rid}/drive/import`,'POST',{mount_id:mountId,file_id:file.id}); $('#modal').close(); await refresh(); await openCanvas(doc.id); } } catch(e) { $('#modal-error').textContent=e.message; } };
}
$('#canvas-drive').onclick=()=>canvasAction(async()=>{
  await saveCanvas(); const mounts=room.drive_mounts || [];
  if (!mounts.length) throw new Error('Open the Drive tab and connect a folder first.');
  const rid=canvasRoom, did=canvasDoc.id;
  modal('Save a Google Doc.',`<p>Save the latest Canvas version as a new Google Doc.</p><label>Connected folder<select name="mount_id">${mounts.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label><label>Subfolder ID (optional)<input name="folder_id" placeholder="Leave blank to use the connected folder"></label>`,async f=>{ const result=await api(`/rooms/${rid}/drive/save`,'POST',{mount_id:f.get('mount_id'),folder_id:f.get('folder_id'),document_id:did}); toast('Google Doc saved.'); if (result.webViewLink && /^https:\/\/docs\.google\.com\//.test(result.webViewLink)) { $('#modal-body').innerHTML=`<p>Saved to Google Drive.</p><a href="${esc(result.webViewLink)}" rel="noopener noreferrer" target="_blank">Open Google Doc ↗</a>`; $('#save-modal').hidden=true; saveAction=null; return false; } },'Save to Drive');
});
const launchParams=new URLSearchParams(location.hash.slice(1));
if (launchParams.has('drive')) { history.replaceState(null,'','/'); toast(launchParams.get('drive')==='connected'?'Google Drive connected. Open the Drive tab to attach a folder.':'Google connection was not completed. Check setup and reconnect.'); }

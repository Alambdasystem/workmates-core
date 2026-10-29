'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let me, rooms = [], room, selected, tab = 'work', lastMessages = '', refreshing = false, saveAction;
const TOOL_LABELS = {web_search:'Web research',create_task:'Create tasks',save_document:'Save documents'};
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
    if (response.status === 401 && me) { me = null; $('#workspace').hidden = true; $('#login').hidden = false; }
    throw new Error(value.error || 'Request failed.');
  }
  return value;
}
function messageBody(message) {
  const sources = (message.sources || []).filter(s => /^https?:\/\//i.test(s.url));
  return esc(message.content) + (sources.length ? '<div class="source-links">Sources: ' + sources.map((s,i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">[${i+1}] ${esc(s.title)}</a>`).join(' ') + '</div>' : '');
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
  cancelVoice();
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
  } catch (error) {
    if (error.message === 'Group not found.') { selected = null; room = null; $('#room-view').hidden = true; $('#empty-workspace').hidden = false; await loadRooms(); }
    else if (me) $('#run-state').textContent = 'Connection interrupted. Retrying…';
  } finally { refreshing = false; }
}
function renderRoom() {
  $('#room-name').textContent = room.name; $('#room-description').textContent = room.description;
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
  const signature = JSON.stringify(room.messages);
  if (signature !== lastMessages) {
    const messages = $('#messages');
    const nearBottom = !lastMessages || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
    messages.innerHTML = room.messages.length ? room.messages.map(m => `<article class="message ${m.kind === 'agent' ? 'agent' : ''}"><span class="${m.kind === 'agent' ? 'agent-avatar' : 'avatar'}">${m.kind === 'agent' ? '✳' : esc(initials(m.author))}</span><div class="content"><div class="message-header"><strong>${esc(m.author)}</strong>${m.kind === 'agent' ? '<span class="ai-label">WORKMATE</span>' : ''}<time>${esc(timestamp(m.created))}</time></div><div class="body">${messageBody(m)}</div></div></article>`).join('') : `<div class="chat-welcome"><span class="agent-avatar">✳</span><h2>This is where it starts.</h2><p>Share an idea, ask a question, or bring your team up to speed. Your conversation and your work live here.</p></div>`;
    lastMessages = signature;
    if (nearBottom) messages.scrollTop = messages.scrollHeight;
  }
  const active = room.jobs.filter(j => ['queued','running'].includes(j.status));
  const failure = room.jobs.find(j => ['failed','interrupted'].includes(j.status));
  $('#run-state').textContent = active.length ? `${room.agent_name} is working · ${active.length} request${active.length === 1 ? '' : 's'}` : failure && room.jobs[0]?.id === failure.id ? failure.error : '';
  renderWork(); adminVisibility();
}
function renderWork() {
  const root = $('#work-content');
  if (tab === 'people') {
    root.innerHTML = room.members.map(u => `<div class="person"><span class="avatar">${esc(initials(u.name))}</span><div><strong>${esc(u.name)}</strong><small>${esc(u.email)} · ${esc(u.role)}</small></div>${me.role === 'admin' && u.role !== 'admin' ? `<button class="text-button" data-remove="${esc(u.id)}">Remove</button>` : ''}</div>`).join('');
  } else if (tab === 'activity') {
    root.innerHTML = room.actions.length ? room.actions.map(a => `<div class="activity"><strong>${esc(a.actor)} · ${esc(a.action.replaceAll('_',' '))}</strong><p>${esc(a.detail)}</p><time>${esc(date(a.created))}</time></div>`).join('') : '<p class="empty-note">Workmate actions and admin changes will appear here.</p>';
  } else {
    root.innerHTML = `<h3 class="section-title">TASKS · ${room.tasks.length}</h3>` + (room.tasks.length ? room.tasks.map(t => `<label class="task ${t.status === 'done' ? 'done' : ''}"><input type="checkbox" data-task="${esc(t.id)}" ${t.status === 'done' ? 'checked' : ''}><div><strong>${esc(t.title)}</strong><small>${esc(t.assignee || 'Unassigned')}</small></div></label>`).join('') : '<p class="empty-note">Ask your workmate to turn the conversation into a task list.</p>') + `<h3 class="section-title">DOCUMENTS · ${room.documents.length}</h3>` + (room.documents.length ? room.documents.map(d => `<button class="document" data-document="${esc(d.id)}">▤ &nbsp; ${esc(d.title)}</button>`).join('') : '<p class="empty-note">Briefs, plans, and drafts saved by your workmate will appear here.</p>');
  }
}
function modal(title, body, action, saveLabel = 'Save changes') {
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
  modal('Make your workmate yours.', `<label>Workmate name<input name="agent_name" value="${esc(r.agent_name)}" maxlength="40" required></label><label>System prompt<textarea name="prompt" rows="8" maxlength="12000" required>${esc(r.prompt)}</textarea></label><label>When should it respond?<select name="mode"><option value="mention" ${r.mode === 'mention' ? 'selected' : ''}>When named (REIGN, @name, or workmate)</option><option value="all" ${r.mode === 'all' ? 'selected' : ''}>Autopilot · Follow the discussion</option></select></label><label>Group goal<textarea name="goal" rows="3" maxlength="2000" placeholder="What resolution should your workmate help the group reach?">${esc(r.goal || '')}</textarea></label><label class="check"><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''}>Workmate on</label><h3 class="section-title">ALLOWED TOOLS</h3><label class="check"><input type="checkbox" name="create_task" ${r.tools.includes('create_task') ? 'checked' : ''}>Create tasks in this group</label><label class="check"><input type="checkbox" name="save_document" ${r.tools.includes('save_document') ? 'checked' : ''}>Save shared documents in this group</label><label class="check"><input type="checkbox" name="web_search" ${r.tools.includes('web_search') ? 'checked' : ''}>Research current information on the web</label><p class="hint">Members can't change these settings. Saving settings cancels pending requests. Previously saved work stays available.</p>`, async f => {
    await api(`/rooms/${id}/workmate`, 'PATCH', {agent_name:f.get('agent_name'),prompt:f.get('prompt'),mode:f.get('mode'),enabled:f.has('enabled'),goal:f.get('goal'),tools:Object.keys(TOOL_LABELS).filter(t => f.has(t))});
    await loadRooms(); await refresh(); toast('Workmate settings saved.');
  });
}
function invitePeople() {
  const id = room.id;
  modal('Bring someone into the room.', '<label>Their email<input name="email" type="email" required placeholder="teammate@company.com"></label><p class="hint">Create a private, single-use invitation for this group. You can copy the link and share it yourself. It expires in seven days.</p>', async f => {
    const result = await api(`/rooms/${id}/invites`,'POST',{email:f.get('email')});
    const link = location.origin + '/#invite=' + encodeURIComponent(result.token) + '&email=' + encodeURIComponent(result.email);
    $('#modal-body').innerHTML = `<p>Your invitation for <strong>${esc(result.email)}</strong> is ready. No email has been sent.</p><label>Private invitation link<textarea readonly rows="4" id="invite-link">${esc(link)}</textarea></label><button type="button" id="copy-invite" class="secondary">Copy link</button><p class="hint">Only the intended recipient should receive this link.</p>`;
    $('#copy-invite').addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast('Invitation copied.'); } catch { $('#invite-link').select(); toast('Select and copy the invitation link.'); } });
    $('#save-modal').hidden = true; $('#cancel-modal').textContent = 'Done'; saveAction = null;
    return false;
  }, 'Create invitation ↗');
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
$('#logout').onclick = async () => { cancelVoice(); try { await api('/logout','POST',{}); location.href = '/'; } catch(e) { toast(e.message); } };
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
  const tools = event.target.checked ? [...new Set([...room.tools,tool])] : room.tools.filter(t => t !== tool);
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
  if (!pendingSend || pendingSend.content !== content || pendingSend.room !== selected) pendingSend = {content,room:selected,request_id:crypto.randomUUID()};
  $('#send-button').disabled = true;
  try { await api(`/rooms/${pendingSend.room}/messages`,'POST',pendingSend); $('#message-input').value = ''; pendingSend = null; await refresh(); $('#messages').scrollTop = $('#messages').scrollHeight; }
  catch(error) { toast(error.message); } finally { $('#send-button').disabled = false; }
});
$('#message-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!$('#send-button').disabled) $('#message-form').requestSubmit(); } });
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active',x === b)); renderWork(); });
$('#work-content').addEventListener('click', async event => {
  const documentButton = event.target.closest('[data-document]');
  if (documentButton) { const d = room.documents.find(d => d.id === documentButton.dataset.document); modal(d.title, `<div class="doc-body">${esc(d.body)}</div>`,null); }
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

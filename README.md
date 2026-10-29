# Workmates Core — Frontend

The Workmates browser app: group chat, administrator controls, invitations, workmate customization, tasks, documents, and activity. The real backend is in [workmates-api](https://github.com/Alambdasystem/workmates-api).

## How the two services connect

The frontend serves the interface and forwards `/api/*` requests to `WORKMATES_API_URL`. The browser stays on one origin, which keeps cookie login and CSRF protection working. The frontend validates the browser origin, forwards session cookies and CSRF tokens, and passes backend response cookies back to the browser. It does not hold an OpenAI key or store chat data.

The backend owns accounts, group permissions, prompts, agent execution, OpenAI calls, and durable storage. These two repositories are two real deployable services; neither service runs a mock.

## Run locally

Python 3.12+:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export WORKMATES_API_URL=http://127.0.0.1:8001
python frontend.py
```

Open http://127.0.0.1:8000. Start the backend on port 8001 using the instructions in its repository. Local backend cookies must use `COOKIE_SECURE=false`. Production requires HTTPS and secure cookies.

## Deploy on Render

Deploy `workmates-api` first, with its persistent disk and required secrets. Then deploy this repository with `render.yaml`, setting `WORKMATES_API_URL` to the backend's actual HTTPS origin, without `/api` or any path.

Start command:

```bash
gunicorn 'frontend:create_app()' --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 60 --access-logfile -
```

`/healthz` checks the frontend process; it does not check the backend or OpenAI. A backend outage is shown as an API error to the user. The frontend Blueprint uses the free compute plan; confirm the plan's runtime/sleep behavior meets your needs before production use.

## Admin controls

The backend creates the initial admin account from its secure configuration. Only the admin can create groups, create invitations, remove members, and change workmate settings. Each workmate has a name, system prompt, allowed tools, reply mode, and on/off switch. New workmates start off.

Members can chat, invoke enabled workmates, read saved work, and mark group tasks done. Turning a workmate off preserves chat and saved work while canceling pending replies/actions.

## Checks

```bash
python -m unittest discover -s tests -v
node --check static/app.js
python -m py_compile frontend.py
```

Ten frontend/proxy tests cover UI serving, cookies/CSRF forwarding, origin rejection, path rejection, upstream errors, redirect blocking, and HTTPS configuration. The corresponding backend has its own authorization and agent tests.

Browser visual testing and live OpenAI tests remain required after deployment. Chat updates by polling every two seconds; token streaming is not implemented. Document uploads, hosted image/code outputs, Canvas and scoped Google Drive are available in v0.3.


## Voice and admin controls

The composer includes opt-in microphone dictation using MediaRecorder (WebM or MP4). Stop recording to transcribe, review the draft, then Send. Browser microphone permissions are required; unsupported browsers can use their keyboard microphone. Recordings stop on group navigation, tab hiding, or after 90 seconds.

The right panel exposes admin-only tool switches (web research, task creation, saved documents), autopilot, and a shared resolution goal. Calling the workmate by its name no longer requires `@`. Models displayed by the UI come from backend configuration, not a hardcoded product label. Web research source links are escaped and open with `noopener noreferrer`.


## Document workspace and Drive

The Work panel provides New document, Upload and generated file downloads. Selecting a document opens Canvas: Markdown editing with toolbar and preview, explicit Save, Word/PDF/Markdown/text/HTML downloads, version history, branching, and Ask REIGN to revise. Stale edits return a conflict and retain the draft; unsaved changes prompt before navigation. Save to Drive exports a new native Google Doc in a connected folder.

The Drive tab supports multiple Google account/folder mounts per group, nested browsing and pagination, imports into Canvas and subfolder branches. Admins configure the OAuth client once and authorize accounts through Google. Folder mounting explicitly grants that group's members access to the chosen folder subtree through the connected account. Drive cannot work until that setup and consent are completed.

The admin tool list comes from the backend registry, and Enable all available tools turns on every implemented tool for that group. Additional OpenAI code and image generation charges apply when used. The proxy preserves binary uploads and Content-Disposition downloads. Only Google's callback accepts query parameters and its redirect is limited to known local results.


## Generation cards and full screen previews

Picture, diagram and document requests show animated loading cards in the conversation while a real AI job is queued or running. A sending indicator appears immediately for a named generation request; confirmed server state replaces it. The illustration is a loading animation, not simulated partial model output or percentage progress. Saved document/file metadata turns it into an inline preview. Failed, canceled and interrupted jobs stop animating and explain the outcome. Reduced motion settings disable movement.

Click a card for a full screen dialog with X/Escape close and downloads. Documents offer Word/PDF/Markdown/text/HTML choices and Edit in Canvas. Images and sanitized SVG diagrams fit the screen. Supported files have bounded text previews; other files retain downloads. Pending full screen previews automatically switch to the saved output. Closing, navigation and logout clear private preview content and ignore stale asynchronous responses.

Run `node tests/generation_test.js` for dependency-free UI lifecycle checks, alongside Python proxy tests.

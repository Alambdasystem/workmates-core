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

Seven frontend/proxy tests cover UI serving, cookies/CSRF forwarding, origin rejection, path rejection, upstream errors, redirect blocking, and HTTPS configuration. The corresponding backend has its own authorization and agent tests.

Browser visual testing and live OpenAI tests remain required after deployment. Chat updates by polling every two seconds; token streaming, uploads, image generation, and external work tools are not implemented in this version.

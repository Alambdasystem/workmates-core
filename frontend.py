"""Workmates UI and same-origin API proxy. No OpenAI key or database here."""
import os
import urllib.error
import urllib.parse
import urllib.request
from flask import Flask, request, jsonify, send_from_directory, Response, abort
from werkzeug.exceptions import HTTPException

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def create_app(config=None, opener=None):
    app=Flask(__name__,static_folder='static')
    app.config.update(WORKMATES_API_URL=os.environ.get('WORKMATES_API_URL',''),MAX_CONTENT_LENGTH=8*1024*1024)
    if config: app.config.update(config)
    base=app.config['WORKMATES_API_URL'].rstrip('/')
    parsed=urllib.parse.urlparse(base)
    if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
        raise RuntimeError('WORKMATES_API_URL must be the backend origin without credentials, path, or query.')
    if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1')):
        raise RuntimeError('Use an HTTPS backend origin. HTTP is allowed only for local development.')
    http=opener or urllib.request.build_opener(NoRedirect())

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['X-Frame-Options']='DENY'
        response.headers['Referrer-Policy']='no-referrer'
        response.headers.setdefault('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if request.path.startswith('/api/'):
            response.headers['Cache-Control']='no-store'
        return response

    @app.errorhandler(HTTPException)
    def error(exc): return jsonify(error=exc.description),exc.code

    @app.get('/')
    def index(): return send_from_directory(app.static_folder,'index.html')

    @app.get('/healthz')
    def health(): return jsonify(status='ok')

    @app.route('/api/<path:path>',methods=['GET','POST','PUT','PATCH','DELETE'])
    def proxy(path):
        callback = path == 'integrations/google/callback' and request.method == 'GET'
        if '..' in path.split('/') or '\\' in path or '//' in path or (request.query_string and not callback):
            abort(400,'Invalid API path.')
        if request.method!='GET':
            origin=request.headers.get('Origin')
            if origin and urllib.parse.urlparse(origin).netloc!=request.host:
                abort(403,'Cross-origin request rejected.')
            if request.headers.get('Sec-Fetch-Site')=='cross-site':
                abort(403,'Cross-site request rejected.')
            voice = request.method == 'POST' and path.startswith('rooms/') and (path.endswith('/transcribe') or path.endswith('/voice')) and len(path.split('/')) == 3
            upload = request.method == 'POST' and path.startswith('rooms/') and path.endswith('/documents/import') and len(path.split('/')) == 4
            clip = request.method == 'POST' and len(path.split('/')) == 6 and path.split('/')[0] == 'rooms' and path.split('/')[2] == 'calls' and path.split('/')[4] == 'clip' and request.mimetype.startswith('audio/')
            background = request.method == 'PUT' and path == 'preferences/background/image' and request.mimetype in ('image/png','image/jpeg','image/webp')
            if not request.is_json and not clip and not background and not (voice and request.mimetype.startswith('audio/')) and not (upload and request.mimetype == 'application/octet-stream'):
                abort(415,'Send application/json.')
        # Validate the browser origin above, then make a server-to-server call.
        # Do not forward the frontend Host/Origin to Render's backend router.
        forwarded={name:request.headers[name] for name in ('Cookie','Content-Type','X-CSRF-Token','X-File-Name','X-Request-ID','X-Audio-Duration','Range') if name in request.headers}
        target = base+'/api/'+urllib.parse.quote(path,safe='/')
        if callback:
            target += '?' + request.query_string.decode('ascii')
        req=urllib.request.Request(target,method=request.method,headers=forwarded,data=request.get_data() if request.method!='GET' else None)
        try:
            upstream=http.open(req,timeout=100 if path.endswith('/transcribe') or '/drive/' in path else 45)
        except urllib.error.HTTPError as exc:
            upstream=exc
        except (urllib.error.URLError,TimeoutError,OSError):
            return jsonify(error='The Workmates backend is unavailable. Please try again.'),502
        with upstream:
            status=upstream.code
            if 300<=status<400:
                location = upstream.headers.get('Location', '')
                if callback and location in ('/#drive=connected', '/#drive=failed'):
                    return Response(status=302, headers={'Location': location})
                return jsonify(error='Unexpected backend redirect.'),502
            body=upstream.read(34*1024*1024+1)
            if len(body)>34*1024*1024:
                return jsonify(error='Backend response too large.'),502
            result=Response(body,status=status,content_type=upstream.headers.get('Content-Type','application/json'))
            if upstream.headers.get('Content-Disposition'):
                result.headers['Content-Disposition'] = upstream.headers['Content-Disposition']
            for header in ('Content-Range','Accept-Ranges'):
                if upstream.headers.get(header):result.headers[header]=upstream.headers[header]
            if path.endswith('/preview') and upstream.headers.get('Content-Security-Policy'):
                result.headers['Content-Security-Policy'] = upstream.headers['Content-Security-Policy']
            for cookie in upstream.headers.get_all('Set-Cookie',[]):
                result.headers.add('Set-Cookie',cookie)
            return result
    return app

if __name__=='__main__':
    create_app().run(host='127.0.0.1',port=int(os.getenv('PORT','8000')),threaded=True)

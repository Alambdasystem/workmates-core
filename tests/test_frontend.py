import io
import json
import unittest
from email.message import Message
from urllib.error import URLError
from frontend import create_app

class Upstream(io.BytesIO):
    def __init__(self,body=b'{"ok":true}',code=200):
        super().__init__(body);self.code=code;self.headers=Message()
        self.headers['Content-Type']='application/json'
        self.headers['Set-Cookie']='wm_session=test; Secure; HttpOnly; SameSite=Strict; Path=/'
class FakeHTTP:
    def open(self,req,timeout): self.req=req;return Upstream()

class FrontendTests(unittest.TestCase):
    def setUp(self):
        self.http=FakeHTTP();self.app=create_app({'WORKMATES_API_URL':'https://api.example.test'},self.http);self.c=self.app.test_client()
    def test_ui_served(self):
        with self.c.get('/') as r:
            self.assertEqual(r.status_code,200);self.assertIn(b'workmates',r.data.lower())
        self.assertEqual(self.c.get('/static/app.js').status_code,200)
    def test_proxy_forwards_session_and_csrf_and_sets_cookie(self):
        self.c.set_cookie('wm_session','session')
        r=self.c.post('/api/login',json={'email':'a@example.test','password':'test'},headers={'X-CSRF-Token':'csrf','Origin':'http://localhost'})
        self.assertEqual(r.status_code,200)
        self.assertEqual(self.http.req.full_url,'https://api.example.test/api/login')
        self.assertEqual(self.http.req.get_header('Cookie'),'wm_session=session')
        self.assertEqual(self.http.req.get_header('X-csrf-token'),'csrf')
        self.assertIsNone(self.http.req.get_header('Origin'))
        self.assertIn('HttpOnly',r.headers['Set-Cookie'])
    def test_voice_notes_backgrounds_and_range_are_proxied(self):
        result=self.c.post('/api/rooms/room/voice',data=b'voice',content_type='audio/webm',headers={'X-CSRF-Token':'csrf','X-Request-ID':'one','X-Audio-Duration':'12'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(self.http.req.get_header('X-request-id'),'one')
        self.assertEqual(self.http.req.get_header('X-audio-duration'),'12')
        result=self.c.put('/api/preferences/background/image',data=b'image',content_type='image/png',headers={'X-CSRF-Token':'csrf'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(self.c.put('/api/me',data=b'image',content_type='image/png').status_code,415)
        def part(*a,**k):
            self.http.req=a[0];r=Upstream(b'part',206);r.headers['Content-Range']='bytes 0-3/12';r.headers['Accept-Ranges']='bytes';return r
        self.http.open=part
        response=self.c.get('/api/rooms/room/voice/id',headers={'Range':'bytes=0-3'})
        self.assertEqual(response.status_code,206);self.assertEqual(response.headers['Content-Range'],'bytes 0-3/12')
        self.assertEqual(self.http.req.get_header('Range'),'bytes=0-3')
        self.assertIn("media-src 'self' blob:",self.c.get('/').headers['Content-Security-Policy'])

    def test_cross_origin_denied(self):
        self.assertEqual(self.c.post('/api/login',json={},headers={'Origin':'https://evil.test'}).status_code,403)
    def test_traversal_denied(self):
        self.assertEqual(self.c.get('/api/../secret').status_code,400)
    def test_upstream_failure(self):
        def fail(*a,**k): raise URLError('private upstream detail')
        self.http.open=fail
        r=self.c.get('/api/me');self.assertEqual(r.status_code,502);self.assertNotIn(b'private upstream',r.data)
    def test_redirect_not_forwarded(self):
        self.http.open=lambda *a,**k:Upstream(code=302)
        self.assertEqual(self.c.get('/api/me').status_code,502)
    def test_remote_http_rejected(self):
        with self.assertRaises(RuntimeError):create_app({'WORKMATES_API_URL':'http://api.example.test'})

    def test_voice_proxy_preserves_audio_and_csrf(self):
        response=self.c.post('/api/rooms/room/transcribe',data=b'audio-bytes',content_type='audio/webm;codecs=opus',headers={'X-CSRF-Token':'csrf'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.http.req.data,b'audio-bytes')
        self.assertEqual(self.http.req.get_header('X-csrf-token'),'csrf')
        self.assertEqual(self.c.post('/api/login',data=b'audio',content_type='audio/webm').status_code,415)

    def test_document_binary_proxy_and_download_headers(self):
        response=self.c.post('/api/rooms/room/documents/import',data=b'word-bytes',content_type='application/octet-stream',headers={'X-CSRF-Token':'csrf','X-File-Name':'Brief.docx'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.http.req.get_header('X-file-name'),'Brief.docx')
        self.assertEqual(self.c.post('/api/login',data=b'word',content_type='application/octet-stream').status_code,415)
        def download(*a,**k):
            r=Upstream(b'PK-word-bytes');r.headers['Content-Disposition']='attachment; filename=Brief.docx';return r
        self.http.open=download
        response=self.c.get('/api/rooms/room/documents/document/download/docx')
        self.assertEqual(response.data,b'PK-word-bytes');self.assertIn('Brief.docx',response.headers['Content-Disposition'])

    def test_oauth_callback_only_allows_known_relative_redirects(self):
        def callback(*a,**k):
            self.http.req=a[0]
            r=Upstream(code=302);r.headers['Location']='/#drive=connected';return r
        self.http.open=callback
        response=self.c.get('/api/integrations/google/callback?state=test&code=code')
        self.assertEqual(response.status_code,302);self.assertEqual(response.headers['Location'],'/#drive=connected')
        self.assertIn('?state=test&code=code',self.http.req.full_url)
        self.assertEqual(self.c.get('/api/me?unexpected=yes').status_code,400)
        def evil(*a,**k):
            r=Upstream(code=302);r.headers['Location']='https://evil.test';return r
        self.http.open=evil
        self.assertEqual(self.c.get('/api/integrations/google/callback?state=test').status_code,502)

    def test_inline_preview_preserves_sandbox_and_image_content_type(self):
        def preview(*a,**k):
            r=Upstream(b'<svg xmlns="http://www.w3.org/2000/svg"/>')
            r.headers.replace_header('Content-Type','image/svg+xml')
            r.headers['Content-Disposition']='inline; filename=preview.svg'
            r.headers['Content-Security-Policy']="sandbox; default-src 'none'"
            return r
        self.http.open=preview
        response=self.c.get('/api/rooms/room/files/file/preview')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.mimetype,'image/svg+xml')
        self.assertEqual(response.headers['Content-Security-Policy'],"sandbox; default-src 'none'")
        self.assertIn('inline;',response.headers['Content-Disposition'])

    def test_call_file_queries_are_allowlisted_and_forwarded(self):
        self.assertEqual(self.c.get('/api/call-files?q=launch').status_code,200)
        self.assertTrue(self.http.req.full_url.endswith('/api/call-files?q=launch'))
        self.assertEqual(self.c.get('/api/rooms/r/call-item?kind=document&asset_id=d').status_code,200)
        self.assertIn('asset_id=d',self.http.req.full_url)
        self.assertEqual(self.c.get('/api/call-files?redirect=https://example.com').status_code,400)
        self.assertEqual(self.c.get('/api/rooms/r/call-item?kind=document&asset_id=d&extra=1').status_code,400)
    def test_notification_worker_has_root_scope_without_cache(self):
        response=self.c.get('/sw.js');self.assertEqual(response.status_code,200)
        self.assertIn(b'notificationclick',response.data)
        self.assertIn('no-cache',response.headers['Cache-Control'])
    def test_public_waitlist_and_member_app_are_separate(self):
        home=self.c.get('/');self.assertIn(b'Join the waiting list',home.data)
        self.assertIn(b'login-form',self.c.get('/app').data)
        self.assertEqual(self.c.get('/signup').status_code,302)

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
            self.assertEqual(r.status_code,200);self.assertIn(b'workmates',r.data)
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

if __name__=='__main__':unittest.main()

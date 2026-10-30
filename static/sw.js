'use strict';
// Displays notifications requested by an open Workmates page; no offline push subscription.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();const room=event.notification.data?.room_id;if(!room)return;
 event.waitUntil((async()=>{const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});const page=pages.find(p=>new URL(p.url).origin===self.location.origin);if(page){await page.focus();page.postMessage({type:'workmates-open-room',room_id:room});}else await self.clients.openWindow('/#room='+encodeURIComponent(room));})());
});

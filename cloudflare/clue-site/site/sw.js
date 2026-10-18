// 네트워크 우선, 실패하면 저장본 (게임 중 와이파이가 끊겨도 열린다)
const CACHE='boardgames-18c21baa';
const FILES=["/","/clue-onepiece/","/manifest.webmanifest","/icon-192.png","/icon-512.png","/icon-maskable-512.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));}return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('/'))));
});

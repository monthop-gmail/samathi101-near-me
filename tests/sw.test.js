// จำลอง environment ของ Service Worker เพื่อทดสอบพฤติกรรมออฟไลน์ของ sw.js
const fs = require('fs');
const vm = require('vm');

const SW = process.env.SW_PATH || require('path').join(__dirname, '..', 'sw.js');
const ORIGIN = 'https://samathi101-near-me.pages.dev';

function makeEnv({ cdnDown = false } = {}) {
  const store = new Map();               // cacheName -> Map(url -> body)
  const caches = {
    open: async name => {
      if (!store.has(name)) store.set(name, new Map());
      const c = store.get(name);
      return {
        addAll: async urls => {
          for (const u of urls) {
            const abs = new URL(u, ORIGIN + '/').href;
            if (cdnDown && !abs.startsWith(ORIGIN)) throw new Error('network error: ' + abs);
            c.set(abs, 'body:' + abs);
          }
        },
        add: async u => {
          const abs = new URL(u, ORIGIN + '/').href;
          if (cdnDown && !abs.startsWith(ORIGIN)) throw new Error('network error: ' + abs);
          c.set(abs, 'body:' + abs);
        },
        put: async (req, res) => c.set(typeof req === 'string' ? req : req.url, res),
      };
    },
    keys: async () => [...store.keys()],
    delete: async n => store.delete(n),
    match: async (req, opts = {}) => {
      const url = typeof req === 'string' ? new URL(req, ORIGIN + '/').href : req.url;
      for (const c of store.values()) {
        if (c.has(url)) return c.get(url);
        if (opts.ignoreSearch) {
          const bare = url.split('?')[0];
          for (const [k, v] of c) if (k.split('?')[0] === bare) return v;
        }
      }
      return undefined;
    },
  };

  const listeners = {};
  const sandbox = {
    self: {
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches,
    console,
    URL,
    Promise,
    Response: { error: () => 'NETWORK_ERROR' },
    fetch: async () => { throw new Error('offline'); },
  };
  sandbox.self.caches = caches;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SW, 'utf8'), sandbox);
  return { listeners, sandbox, store };
}

async function install(env) {
  let p;
  await env.listeners.install({ waitUntil: x => { p = x; } });
  await p;
}

async function requestOffline(env, url, mode = 'no-cors') {
  let result;
  await env.listeners.fetch({
    request: { url: new URL(url, ORIGIN + '/').href, method: 'GET', mode },
    respondWith: r => { result = r; },
  });
  return result;
}

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  ได้ ${JSON.stringify(actual)} คาดว่า ${JSON.stringify(expected)}`}`);
};

(async () => {
  console.log('[1] ติดตั้งปกติ');
  let env = makeEnv();
  await install(env);
  const cached = [...env.store.values()][0];
  check('แคชไฟล์หลักครบ (รวม config.json ที่เดิมตกหล่น)',
    ['index.html', 'app.js', 'index.css', 'branches.json', 'config.json'].every(f => cached.has(`${ORIGIN}/${f}`)), true);
  check('แคช Leaflet + fonts จาก CDN ด้วย',
    [...cached.keys()].filter(u => !u.startsWith(ORIGIN)).length, 3);

  console.log('\n[2] ติดตั้งตอน CDN ล่ม (บั๊กเดิม: addAll ล้มทั้งชุด)');
  env = makeEnv({ cdnDown: true });
  let installError = null;
  await install(env).catch(e => { installError = e.message; });
  check('ติดตั้งสำเร็จ ไม่ throw', installError, null);
  const cached2 = [...env.store.values()][0];
  check('ไฟล์หลักยังแคชครบ', cached2.has(`${ORIGIN}/branches.json`), true);
  check('ข้ามไฟล์ CDN ที่ล่มไป', [...cached2.keys()].filter(u => !u.startsWith(ORIGIN)).length, 0);

  console.log('\n[3] ออฟไลน์ (บั๊กเดิม: ?v=timestamp ทำให้หาในแคชไม่เจอ)');
  env = makeEnv();
  await install(env);
  check('branches.json แบบไม่มี query', await requestOffline(env, '/branches.json'), `body:${ORIGIN}/branches.json`);
  check('branches.json?v=1755000000 (cachebuster)',
    await requestOffline(env, '/branches.json?v=1755000000'), `body:${ORIGIN}/branches.json`);
  check('config.json?v=...', await requestOffline(env, '/config.json?v=999'), `body:${ORIGIN}/config.json`);
  check('เปิดหน้าเว็บตอนออฟไลน์', await requestOffline(env, '/index.html', 'navigate'), `body:${ORIGIN}/index.html`);
  check('ไฟล์ที่ไม่เคยแคช คืน error ไม่ใช่ HTML ปลอม',
    await requestOffline(env, '/ไม่มีไฟล์นี้.json'), 'NETWORK_ERROR');

  console.log('\n[4] แคชไม่บวมจาก cachebuster');
  env = makeEnv();
  await install(env);
  const before = [...env.store.values()][0].size;
  env.sandbox.fetch = async () => ({ status: 200, type: 'basic', clone: () => 'fresh' });
  for (const t of [1, 2, 3]) {
    await env.listeners.fetch({
      request: { url: `${ORIGIN}/branches.json?v=${t}`, method: 'GET', mode: 'cors' },
      respondWith: () => {},
    });
  }
  await new Promise(r => setImmediate(r));
  const after = [...env.store.values()][0].size;
  check('โหลด 3 รอบด้วย timestamp ต่างกัน ไม่เพิ่ม entry ใหม่', after, before);

  console.log(`\nผลรวม: ผ่าน ${pass} / ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();

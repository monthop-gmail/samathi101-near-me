// ทดสอบ logic ของ app.js ใน jsdom โดย stub Leaflet ไว้ (เครื่องนี้รัน Chrome ไม่ได้)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO = path.join(__dirname, '..');
const branchesJson = fs.readFileSync(path.join(REPO, 'branches.json'), 'utf8');

const dom = new JSDOM(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), {
  runScripts: 'outside-only',
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;

// --- stub สิ่งที่ jsdom ไม่มี ---
const mapEvents = {};
let flyToCalls = 0;
const layers = new Set();
const latLng = (lat, lng) => ({ lat: +lat, lng: +lng, toBounds: () => ({}) });
window.L = {
  map: () => ({
    setView() { return this; },
    on: (ev, fn) => { mapEvents[ev] = fn; },
    removeLayer: l => layers.delete(l),
    hasLayer: l => layers.has(l),
    invalidateSize() {},
    flyTo() { flyToCalls++; },
    flyToBounds() { flyToCalls++; },
    getCenter: () => latLng(13, 100),
    getZoom: () => 6,
  }),
  tileLayer: () => ({ addTo() { return this; } }),
  control: { zoom: () => ({ addTo() {} }) },
  divIcon: o => o,
  latLng,
  latLngBounds: coords => ({ coords }),
  marker() {
    const m = { addTo() { layers.add(m); return m; }, bindPopup() { return m; }, openPopup() { return m; } };
    return m;
  },
};
window.fetch = (url) => {
  if (String(url).startsWith('branches.json')) {
    return Promise.resolve({ json: () => Promise.resolve(JSON.parse(branchesJson)) });
  }
  return Promise.resolve({ json: () => Promise.resolve({ thailandView: { lat: 11.9, lng: 102.3, zoom: 4.9 } }) });
};
let geoCallback = null;
window.navigator.geolocation = { getCurrentPosition: cb => { geoCallback = cb; } };

const errors = [];
window.addEventListener('error', e => errors.push(e.message));

// let/const ใน eval ไม่หลุดออกมาข้างนอก จึงต้อง export ตัวแปรผ่าน window ในการ eval เดียวกัน
window.eval(fs.readFileSync(path.join(REPO, 'app.js'), 'utf8') +
  '\n;window.__peek = expr => eval(expr);');
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

const ev = expr => window.__peek(expr);
const $ = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  ได้ ${JSON.stringify(actual)} คาดว่า ${JSON.stringify(expected)}`}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

setTimeout(async () => {
  console.log('\n[1] แยกสาขาที่ไม่มีพิกัดออกจากแผนที่');
  check('แสดงทั้งหมด 324 สาขา (ซ่อนสาขาสาธิต 999)', ev('allBranches.length'), 324);
  check('ซ่อนสาขาสาธิตแล้ว', ev('allBranches.some(b => b.number === 999)'), false);
  check('ปักหมุด 295 สาขา', ev('branches.length'), 295);
  check('หมุดบนแผนที่ 295 อัน', layers.size, 295);
  check('รอปรับพิกัด 29 สาขา', ev('branchesNoCoords.length'), 29);
  check('ไม่มีหมุดที่พิกัด 0,0', ev('branches.filter(b => Math.abs(+b.latitude) < 0.5).length'), 0);

  console.log('\n[2] ลิสต์และ section ใหม่');
  check('การ์ดในลิสต์หลัก', $$('#all-branches-list .branch-card').length, 295);
  check('การ์ดในลิสต์รอปรับพิกัด', $$('#pending-branches-list .branch-card').length, 29);
  check('section รอปรับพิกัดแสดงอยู่', $('#pending-coords-section').hidden, false);
  check('badge นับจำนวนถูกต้อง', $('#pending-count').textContent, '29');
  check('การ์ดรอปรับพิกัดมี class no-coords', $$('#pending-branches-list .branch-card.no-coords').length, 29);

  console.log('\n[3] ค้นหา');
  const search = $('#branch-search');
  const type = v => { search.value = v; search.oninput({ target: search }); };

  type('ก.10');
  const g10 = $$('#all-branches-list .branch-card').length + $$('#pending-branches-list .branch-card').length;
  check('ค้น "ก.10" เจอ 10 สาขา (ตรงกับข้อมูลกลุ่ม 10)', g10, 10);

  type('วัดพระยืน');
  check('สาขาไม่มีพิกัด ไม่โผล่ในลิสต์หลัก', $$('#all-branches-list .branch-card').length, 0);
  check('สาขาไม่มีพิกัด โผล่ในลิสต์รอปรับพิกัด', $$('#pending-branches-list .branch-card').length, 1);

  type('0');
  const hq = $$('#all-branches-list .branch-name').some(e => e.textContent.includes('สาขาที่ 0:'));
  check('ค้นเลข "0" เจอสำนักงานใหญ่ (บั๊ก falsy เดิม)', hq, true);

  type('');
  check('ล้างช่องค้นหาแล้วกลับมาครบ', $$('#all-branches-list .branch-card').length, 295);

  console.log('\n[4] กดการ์ดสาขาที่ไม่มีพิกัด');
  const before = flyToCalls;
  $('#pending-branches-list .branch-card').click();
  check('แผนที่ไม่บินไปพิกัด 0,0', flyToCalls, before);
  check('modal เปิด', $('#branch-modal').style.display, 'flex');
  check('มีคำเตือนว่ายังไม่มีพิกัด', !!$('.coords-warning'), true);
  check('ปุ่มเปลี่ยนเป็นค้นหาแทนนำทาง',
    $('#branch-detail a.popup-btn').textContent.trim(), 'ค้นหาชื่อสาขาใน Google Maps');
  check('ลิงก์ใช้ maps/search ไม่ใช่ maps/dir',
    $('#branch-detail a.popup-btn').href.includes('/maps/search/'), true);

  console.log('\n[5] กดการ์ดสาขาปกติ');
  const before2 = flyToCalls;
  $('#all-branches-list .branch-card').click();
  check('แผนที่บินไปหาสาขา', flyToCalls > before2, true);
  check('ปุ่มเป็นนำทาง', $('#branch-detail a.popup-btn').textContent.trim(), 'นำทางด้วย Google Maps');

  console.log('\n[6] กดปุ่มระบุตำแหน่งซ้ำ 3 ครั้ง');
  for (let i = 0; i < 3; i++) {
    $('#locate-me-btn').onclick();
    geoCallback({ coords: { latitude: 13.7563, longitude: 100.5018 } });
  }
  check('หมุดผู้ใช้เหลืออันเดียว (ไม่ซ้อน)', layers.size, 296);
  check('แสดงสาขาใกล้ฉัน 5 อันดับ', $$('#nearest-branches-list .branch-card').length, 5);
  const dists = $$('#nearest-branches-list .branch-distance').map(e => parseFloat(e.textContent.replace(/[^\d.]/g, '')));
  check('ระยะทางเรียงจากใกล้ไปไกล', dists.every((d, i) => i === 0 || d >= dists[i - 1]), true);
  check('ไม่มีสาขาที่ระยะทางเพี้ยน (>2000 กม.)', dists.some(d => d > 2000), false);
  console.log('    สาขาใกล้สุดจากสยาม:', $$('#nearest-branches-list .branch-name')[0].textContent.trim(), '—', dists[0], 'กม.');

  console.log('\n[7] ค้นหาครอบคลุมภาค / อำเภอ / ตำบล');
  type('ภาคใต้');
  check('ค้น "ภาคใต้" เจอจาก custom_region',
    $$('#all-branches-list .branch-card').length > 20, true);
  type('หาดใหญ่');
  check('ค้นชื่ออำเภอเจอ', $$('#all-branches-list .branch-card').length > 0, true);
  type('bangkok');
  check('ค้นชื่อจังหวัดภาษาอังกฤษเจอ', $$('#all-branches-list .branch-card').length > 0, true);
  type('  เชียงใหม่  ');
  check('ตัดช่องว่างหน้า-หลังคำค้น', $$('#all-branches-list .branch-card').length > 0, true);

  console.log('\n[8] หมุดบนแผนที่ตามผลค้นหา (debounce 250ms)');
  type('ก.10');
  const listCount = $$('#all-branches-list .branch-card').length;
  check('ลิสต์อัปเดตทันที ไม่ต้องรอ debounce', listCount, 10);
  check('หมุดยังไม่เปลี่ยนก่อนครบเวลา debounce', layers.size, 296);
  await sleep(400);
  check('หลัง debounce เหลือเฉพาะหมุดที่ค้นเจอ (+หมุดผู้ใช้)', layers.size, listCount + 1);
  const flyBefore = flyToCalls;
  type('วัดใหม่อมตรส');
  await sleep(400);
  check('ค้นเจอสาขาเดียวแล้วแผนที่ซูมไปหา', flyToCalls > flyBefore, true);
  check('เหลือหมุดเดียว (+หมุดผู้ใช้)', layers.size, 2);
  type('');
  await sleep(400);
  check('ล้างคำค้นแล้วหมุดกลับมาครบ', layers.size, 296);

  console.log('\n[9] escape HTML กัน XSS');
  const evil = ev(`(() => {
    const b = JSON.parse(JSON.stringify(branches[0]));
    b.id = 999999; b.name = '<img src=x onerror=alert(1)>';
    b.owner = "</p><script>alert(2)<\\/script>";
    allBranches.push(b); branches.push(b);
    openBranchDetails(999999);
    return document.getElementById('branch-detail').innerHTML;
  })()`);
  check('ชื่อสาขาถูก escape ไม่กลายเป็น tag', evil.includes('<img src=x'), false);
  check('มี &lt; แทน', evil.includes('&lt;img'), true);
  check('ไม่มี script tag หลุดเข้า DOM',
    window.document.querySelectorAll('#branch-detail script, #branch-detail img').length, 0);

  console.log(`\nJS errors: ${errors.length ? errors.join('; ') : 'ไม่มี'}`);
  console.log(`\nผลรวม: ผ่าน ${pass} / ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
}, 500);

// เปิดแอปด้วยลิงก์ ?branch=35 และปิดปลั๊กอิน cluster เพื่อทดสอบทางสำรอง
const { createApp, createChecker, sleep } = require('./helpers');

const app = createApp({ url: 'http://localhost/?branch=35', withCluster: false });
const { check, counts } = createChecker();
const { ev, $, $$, window } = app;

setTimeout(async () => {
  console.log('\n[1] fallback เมื่อโหลด leaflet.markercluster ไม่ได้');
  check('ใช้ LayerGroup ธรรมดาแทน ไม่ error', app.errors.length, 0);
  check('หมุดยังขึ้นครบ 295', app.groupLayers.size, 295);
  $('#branch-search').value = 'ก.10';
  $('#branch-search').oninput({ target: $('#branch-search') });
  await sleep(400);
  check('กรองหมุดได้เหมือนกันแม้ไม่มี cluster', app.groupLayers.size, 10);
  $('#branch-search').value = '';
  $('#branch-search').oninput({ target: $('#branch-search') });
  await sleep(400);

  console.log('\n[2] เปิดจากลิงก์ ?branch=35');
  check('เปิด modal ให้อัตโนมัติ', $('#branch-modal').style.display, 'flex');
  check('เป็นสาขาที่ถูกต้อง',
    $('#branch-detail-title').textContent.includes('พระจอมเกล้าพระนครเหนือ'), true);
  check('แผนที่บินไปหาสาขา', app.flyToCalls > 0, true);
  check('ไม่ซูมทั้งประเทศทับ (ไม่เรียก fitThailand)',
    ev('mapConfig !== null'), true);

  console.log('\n[3] คัดลอกลิงก์สาขา');
  check('มีปุ่มแชร์', !!$('#share-branch-btn'), true);
  $('#share-branch-btn').click();
  await sleep(50);
  check('คัดลอกลิงก์พร้อมเลขสาขา', app.copied[0].includes('branch=35'), true);
  check('ขึ้น toast ยืนยัน', $('#toast').textContent, 'คัดลอกลิงก์แล้ว');

  console.log('\n[4] ปิด modal ด้วยปุ่ม Escape');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  check('modal ปิด', $('#branch-modal').style.display, 'none');
  check('ลบ ?branch ออกจาก URL แล้ว', window.location.search.includes('branch'), false);

  console.log('\n[5] ลิงก์ที่ชี้ไปสาขาที่ไม่มีอยู่');
  ev('openBranchFromUrl()');
  check('ไม่ error เมื่อไม่มีพารามิเตอร์', app.errors.length, 0);

  console.log('\n[6] รูปสาขาในหน้ารายละเอียด');
  ev('openBranchDetails(allBranches.find(b => b.number === 35).id)');
  const img = $('#branch-detail .branch-photo');
  check('มีรูปสาขา', !!img, true);
  check('โหลดแบบ lazy', img.getAttribute('loading'), 'lazy');
  check('มี alt บอกชื่อสาขา', img.getAttribute('alt').includes('รูปสาขา'), true);

  console.log(`\nJS errors: ${app.errors.length ? app.errors.join('; ') : 'ไม่มี'}`);
  console.log(`\nผลรวม: ผ่าน ${counts.pass} / ไม่ผ่าน ${counts.fail}`);
  process.exit(counts.fail ? 1 : 0);
}, 500);

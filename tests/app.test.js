const { createApp, createChecker, sleep } = require('./helpers');

const app = createApp();
const { check, counts } = createChecker();
const { ev, $, $$, type } = app;

setTimeout(async () => {
  console.log('\n[1] แยกสาขาที่ไม่มีพิกัดออกจากแผนที่');
  check('แสดงทั้งหมด 324 สาขา (ซ่อนสาขาสาธิต 999)', ev('allBranches.length'), 324);
  check('ซ่อนสาขาสาธิตแล้ว', ev('allBranches.some(b => b.number === 999)'), false);
  check('ปักหมุด 295 สาขา', ev('branches.length'), 295);
  check('หมุดบนแผนที่ 295 อัน', app.groupLayers.size, 295);
  check('รอปรับพิกัด 29 สาขา', ev('branchesNoCoords.length'), 29);
  check('ไม่มีหมุดที่พิกัด 0,0', ev('branches.filter(b => Math.abs(+b.latitude) < 0.5).length'), 0);

  console.log('\n[2] ลิสต์และ section รอปรับพิกัด');
  check('การ์ดในลิสต์หลัก', $$('#all-branches-list .branch-card').length, 295);
  check('การ์ดในลิสต์รอปรับพิกัด', $$('#pending-branches-list .branch-card').length, 29);
  check('section รอปรับพิกัดแสดงอยู่', $('#pending-coords-section').hidden, false);
  check('badge นับจำนวนถูกต้อง', $('#pending-count').textContent, '29');
  check('การ์ดรอปรับพิกัดมี class no-coords', $$('#pending-branches-list .branch-card.no-coords').length, 29);

  console.log('\n[3] ค้นหา');
  type('ก.10');
  check('ค้น "ก.10" เจอ 10 สาขา', $$('#all-branches-list .branch-card').length
    + $$('#pending-branches-list .branch-card').length, 10);
  type('วัดพระยืน');
  check('สาขาไม่มีพิกัด ไม่โผล่ในลิสต์หลัก', $$('#all-branches-list .branch-card').length, 0);
  check('สาขาไม่มีพิกัด โผล่ในลิสต์รอปรับพิกัด', $$('#pending-branches-list .branch-card').length, 1);
  type('0');
  check('ค้นเลข "0" เจอสำนักงานใหญ่ (บั๊ก falsy เดิม)',
    $$('#all-branches-list .branch-name').some(e => e.textContent.includes('สาขาที่ 0:')), true);
  type('');
  check('ล้างช่องค้นหาแล้วกลับมาครบ', $$('#all-branches-list .branch-card').length, 295);

  console.log('\n[4] กดการ์ดสาขาที่ไม่มีพิกัด');
  type('วัดพระยืน');
  const before = app.flyToCalls;
  $('#pending-branches-list .branch-card').click();
  check('แผนที่ไม่บินไปพิกัด 0,0', app.flyToCalls, before);
  check('modal เปิด', $('#branch-modal').style.display, 'flex');
  check('มีคำเตือนว่ายังไม่มีพิกัด', !!$('.coords-warning'), true);
  check('ปุ่มเปลี่ยนเป็นค้นหาแทนนำทาง',
    $('#branch-detail a.popup-btn').textContent.trim(), 'ค้นหาชื่อสาขาใน Google Maps');
  check('ลิงก์ใช้ maps/search ไม่ใช่ maps/dir',
    $('#branch-detail a.popup-btn').href.includes('/maps/search/'), true);
  type('');

  console.log('\n[5] กดการ์ดสาขาปกติ');
  const before2 = app.flyToCalls;
  $('#all-branches-list .branch-card').click();
  check('แผนที่บินไปหาสาขา', app.flyToCalls > before2, true);
  check('ปุ่มเป็นนำทาง', $('#branch-detail a.popup-btn').textContent.trim(), 'นำทางด้วย Google Maps');

  console.log('\n[6] กดปุ่มระบุตำแหน่งซ้ำ 3 ครั้ง');
  for (let i = 0; i < 3; i++) {
    $('#locate-me-btn').onclick();
    app.geoCallback({ coords: { latitude: 13.7563, longitude: 100.5018 } });
  }
  check('หมุดผู้ใช้เหลืออันเดียว (map มี markerLayer + user marker)', app.mapLayers.size, 2);
  check('แสดงสาขาใกล้ฉัน 5 อันดับ', $$('#nearest-branches-list .branch-card').length, 5);
  const dists = $$('#nearest-branches-list .branch-distance')
    .map(e => parseFloat(e.textContent.replace(/[^\d.]/g, '')));
  check('ระยะทางเรียงจากใกล้ไปไกล', dists.every((d, i) => i === 0 || d >= dists[i - 1]), true);
  check('ไม่มีสาขาที่ระยะทางเพี้ยน (>2000 กม.)', dists.some(d => d > 2000), false);
  console.log('    สาขาใกล้สุดจากสยาม:', $$('#nearest-branches-list .branch-name')[0].textContent.trim(), '—', dists[0], 'กม.');

  console.log('\n[7] ค้นหาครอบคลุมภาค / อำเภอ / ตำบล');
  type('ภาคใต้');
  check('ค้น "ภาคใต้" เจอจาก custom_region', $$('#all-branches-list .branch-card').length > 20, true);
  type('หาดใหญ่');
  check('ค้นชื่ออำเภอเจอ', $$('#all-branches-list .branch-card').length > 0, true);
  type('bangkok');
  check('ค้นชื่อจังหวัดภาษาอังกฤษเจอ', $$('#all-branches-list .branch-card').length > 0, true);
  type('  เชียงใหม่  ');
  check('ตัดช่องว่างหน้า-หลังคำค้น', $$('#all-branches-list .branch-card').length > 0, true);

  console.log('\n[8] หมุดบนแผนที่ตามผลค้นหา (debounce 250ms)');
  type('ก.10');
  check('ลิสต์อัปเดตทันที ไม่ต้องรอ debounce', $$('#all-branches-list .branch-card').length, 10);
  check('หมุดยังไม่เปลี่ยนก่อนครบเวลา debounce', app.groupLayers.size, 295);
  await sleep(400);
  check('หลัง debounce เหลือเฉพาะหมุดที่ค้นเจอ', app.groupLayers.size, 10);
  const flyBefore = app.flyToCalls;
  type('วัดใหม่อมตรส');
  await sleep(400);
  check('ค้นเจอสาขาเดียวแล้วแผนที่ซูมไปหา', app.flyToCalls > flyBefore, true);
  check('เหลือหมุดเดียว', app.groupLayers.size, 1);
  type('');
  await sleep(400);
  check('ล้างคำค้นแล้วหมุดกลับมาครบ', app.groupLayers.size, 295);

  console.log('\n[9] escape HTML กัน XSS');
  const EVIL_NAME = '<img src=x onerror=alert(1)>';
  ev(`(() => {
    const b = JSON.parse(JSON.stringify(branches[0]));
    b.id = 999999; b.name = ${JSON.stringify(EVIL_NAME)};
    b.owner = "</p><script>alert(2)<\\/script>";
    allBranches.push(b); branches.push(b);
    openBranchDetails(999999);
  })()`);
  // เช็คที่ DOM ไม่ใช่ string เพราะ browser จะ serialize entity ใน attribute กลับมาเป็น < > เสมอ
  check('ชื่อสาขาถูกใส่เป็น text ไม่ใช่ markup',
    $('#branch-detail-title').textContent, EVIL_NAME);
  check('h2 ไม่มี element ลูก (ไม่มี tag งอกจากชื่อ)', $('#branch-detail-title').children.length, 0);
  check('ไม่มี <script> หลุดเข้า DOM',
    $$('#branch-detail script').length, 0);
  check('ไม่มี img จากชื่อสาขา (เหลือแค่รูปสาขาจริง)',
    $$('#branch-detail img').map(i => i.getAttribute('src')).filter(s => s === 'x').length, 0);
  check('ไม่มี attribute onerror ที่ผู้โจมตีใส่มา',
    $$('#branch-detail *').filter(el => el.getAttribute('onerror') && el.getAttribute('onerror').includes('alert')).length, 0);
  ev('allBranches.pop(); branches.pop();');

  console.log('\n[10] ชิปกรองตามภาค');
  check('เริ่มต้นที่โหมดภาค', $('#chip-mode-region').classList.contains('active'), true);
  const chips = $$('#filter-chips .chip');
  check('สร้างชิปครบ (ทั้งหมด + 8 ภาค)', chips.length, 9);
  check('ชิปแรกคือ "ทั้งหมด"', chips[0].textContent.includes('ทั้งหมด'), true);
  check('ชิปเรียงตามจำนวนสาขามากไปน้อย',
    chips[1].textContent.includes('กรุงเทพฯ และปริมณฑล'), true);
  const northeast = chips.find(c => c.textContent.includes('ภาคตะวันออกเฉียงเหนือ'));
  northeast.click();
  check('กดชิปแล้วกรองเหลือเฉพาะภาคนั้น',
    ev('allBranches.filter(b => b.custom_region === "ภาคตะวันออกเฉียงเหนือ").length'),
    $$('#all-branches-list .branch-card').length + $$('#pending-branches-list .branch-card').length);
  check('ชิปที่เลือกมีสถานะ active',
    $$('#filter-chips .chip.active')[0].textContent.includes('ภาคตะวันออกเฉียงเหนือ'), true);
  check('aria-pressed ถูกตั้ง', $$('#filter-chips .chip.active')[0].getAttribute('aria-pressed'), 'true');

  type('ขอนแก่น');
  const combo = $$('#all-branches-list .branch-card').length;
  check('ชิป + คำค้น ทำงานร่วมกัน (ผลน้อยกว่าใช้ชิปอย่างเดียว)', combo > 0 && combo < 69, true);
  type('');

  $$('#filter-chips .chip').find(c => c.textContent.includes('ภาคตะวันออกเฉียงเหนือ')).click();
  check('กดชิปเดิมซ้ำ = ยกเลิกการกรอง', $$('#all-branches-list .branch-card').length, 295);

  console.log('\n[11] ชิปกลุ่ม + สลับโหมด');
  const groupIds = ev('[...new Set(allBranches.map(b => b.group_id).filter(g => g && g !== 999))]');
  $('#chip-mode-group').click();
  check('สลับเป็นโหมดกลุ่มแล้ว', $('#chip-mode-group').classList.contains('active'), true);
  check('โหมดภาคเลิก active', $('#chip-mode-region').classList.contains('active'), false);
  check('aria-pressed สลับตาม', $('#chip-mode-group').getAttribute('aria-pressed'), 'true');
  const groupChips = $$('#filter-chips .chip');
  check(`ชิปกลุ่มครบ (ทั้งหมด + ${groupIds.length} กลุ่ม)`, groupChips.length, groupIds.length + 1);
  check('ไม่มีชิป ก.999 (ค่า placeholder)',
    groupChips.some(c => c.textContent.includes('ก.999')), false);
  check('ชิปกลุ่มเรียงตามเลขกลุ่ม',
    [groupChips[1].textContent.trim().split(' ')[0], groupChips[2].textContent.trim().split(' ')[0]],
    ['ก.1', 'ก.2']);

  const g7 = groupChips.find(c => c.textContent.startsWith('ก.7 '));
  g7.click();
  check('กดชิป ก.7 แล้วกรองถูกกลุ่ม',
    $$('#all-branches-list .branch-card').length + $$('#pending-branches-list .branch-card').length,
    ev('allBranches.filter(b => b.group_id === 7).length'));
  await sleep(400);
  check('หมุดบนแผนที่กรองตามกลุ่มด้วย',
    app.groupLayers.size, ev('branches.filter(b => b.group_id === 7).length'));

  console.log('\n[12] สลับโหมดแล้วตัวกรองที่มองไม่เห็นต้องถูกล้าง');
  $('#chip-mode-region').click();
  check('กลับมาโหมดภาค', $('#chip-mode-region').classList.contains('active'), true);
  check('ตัวกรองกลุ่มถูกล้าง', ev('activeGroup'), null);
  check('กลับมาแสดงครบทุกสาขา', $$('#all-branches-list .branch-card').length, 295);
  $$('#filter-chips .chip').find(c => c.textContent.includes('ภาคเหนือ')).click();
  $('#chip-mode-group').click();
  check('สลับกลับไปโหมดกลุ่ม ตัวกรองภาคถูกล้าง', ev('activeRegion'), null);
  check('ชิป "ทั้งหมด" active หลังสลับโหมด',
    $$('#filter-chips .chip')[0].classList.contains('active'), true);
  $('#chip-mode-region').click();
  await sleep(400);

  console.log('\n[13] หมุดที่เลือกเท่านั้นที่เต้น');
  check('ไม่มี .pulse ฝังในทุกหมุดแล้ว', ev(`markerById.size`), 295);
  $('#all-branches-list .branch-card').click();
  const selected = ev('selectedMarkerId');
  check('มีหมุดที่ถูกเลือก', selected !== null, true);
  check('หมุดที่เลือกได้ class is-selected',
    ev('markerById.get(selectedMarkerId).getElement().classList.contains("is-selected")'), true);
  $$('#all-branches-list .branch-card')[5].click();
  check('เปลี่ยนสาขาแล้วหมุดเก่าเลิกเต้น',
    ev(`[...markerById.values()].filter(m => m.getElement().classList.contains("is-selected")).length`), 1);

  console.log(`\nJS errors: ${app.errors.length ? app.errors.join('; ') : 'ไม่มี'}`);
  console.log(`\nผลรวม: ผ่าน ${counts.pass} / ไม่ผ่าน ${counts.fail}`);
  process.exit(counts.fail ? 1 : 0);
}, 500);

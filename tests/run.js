// รันเทสทุกไฟล์แล้วสรุปผลรวม — ใช้ `npm test`
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
    { name: 'app.js (jsdom)', file: 'app.test.js' },
    { name: 'deep link + fallback ไม่มี cluster', file: 'deeplink.test.js' },
    { name: 'sw.js (service worker)', file: 'sw.test.js' },
];

let failed = 0;

for (const suite of SUITES) {
    console.log(`\n${'='.repeat(60)}\n  ${suite.name}\n${'='.repeat(60)}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, suite.file)], {
        stdio: 'inherit',
    });
    if (result.status !== 0) failed++;
}

console.log(`\n${'='.repeat(60)}`);
if (failed) {
    console.log(`❌ มีชุดเทสที่ไม่ผ่าน ${failed} ชุด`);
    process.exit(1);
}
console.log('✅ ผ่านทุกชุด');

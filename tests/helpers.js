// สร้าง environment จำลองสำหรับรัน app.js ใน jsdom
// (เครื่อง CI/dev ไม่จำเป็นต้องมี Chrome — เรา stub Leaflet เอง)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO = path.join(__dirname, '..');

function createApp({ url = 'http://localhost/', withCluster = true } = {}) {
    const branchesJson = fs.readFileSync(path.join(REPO, 'branches.json'), 'utf8');
    const dom = new JSDOM(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), {
        runScripts: 'outside-only',
        url,
        pretendToBeVisual: true,
    });
    const { window } = dom;

    const state = {
        window,
        dom,
        flyToCalls: 0,
        mapLayers: new Set(),    // layer ที่อยู่บน map โดยตรง (markerLayer + หมุดผู้ใช้)
        groupLayers: new Set(),  // หมุดสาขาที่อยู่ใน markerLayer
        toasts: [],
        copied: [],
        usedCluster: withCluster,
    };

    const latLng = (lat, lng) => ({ lat: +lat, lng: +lng, toBounds: () => ({}) });
    const mapStub = {
        setView() { return this; },
        on() {},
        removeLayer(l) { state.mapLayers.delete(l); },
        hasLayer: l => state.mapLayers.has(l),
        invalidateSize() {},
        flyTo() { state.flyToCalls++; },
        flyToBounds() { state.flyToCalls++; },
        getCenter: () => latLng(13, 100),
        getZoom: () => 6,
    };

    const makeGroup = () => {
        const g = {
            addTo() { state.mapLayers.add(g); return g; },
            addLayer(l) { state.groupLayers.add(l); return g; },
            removeLayer(l) { state.groupLayers.delete(l); return g; },
            hasLayer: l => state.groupLayers.has(l),
            clearLayers() { state.groupLayers.clear(); return g; },
        };
        return g;
    };

    window.L = {
        map: () => mapStub,
        tileLayer: () => ({ addTo() { return this; } }),
        control: { zoom: () => ({ addTo() {} }) },
        divIcon: o => o,
        latLng,
        latLngBounds: coords => ({ coords }),
        layerGroup: makeGroup,
        marker(latlng, options) {
            const el = window.document.createElement('div');
            // Leaflet จริงจะเอา className ของ divIcon มาใส่ที่ element ของหมุด
            el.className = (options && options.icon && options.icon.className) || '';
            const m = {
                addTo(target) { if (target === mapStub) state.mapLayers.add(m); return m; },
                bindPopup() { return m; },
                openPopup() { return m; },
                getElement: () => el,
            };
            return m;
        },
    };

    if (withCluster) {
        window.L.markerClusterGroup = () => {
            const g = makeGroup();
            g.addLayers = ls => { ls.forEach(l => state.groupLayers.add(l)); return g; };
            g.removeLayers = ls => { ls.forEach(l => state.groupLayers.delete(l)); return g; };
            return g;
        };
    }

    window.fetch = (url) => {
        if (String(url).startsWith('branches.json')) {
            return Promise.resolve({ json: () => Promise.resolve(JSON.parse(branchesJson)) });
        }
        return Promise.resolve({
            json: () => Promise.resolve({ thailandView: { lat: 11.9, lng: 102.3, zoom: 4.9 } }),
        });
    };

    window.navigator.geolocation = { getCurrentPosition: cb => { state.geoCallback = cb; } };
    Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: async text => { state.copied.push(text); } },
        configurable: true,
    });

    state.errors = [];
    window.addEventListener('error', e => state.errors.push(e.message));

    // let/const ใน eval ไม่หลุดออกมาข้างนอก จึงต้อง export ตัวช่วยไว้ใน eval เดียวกัน
    window.eval(fs.readFileSync(path.join(REPO, 'app.js'), 'utf8') +
        '\n;window.__peek = expr => eval(expr);');
    // ถ้า jsdom ยังไม่ได้ยิง DOMContentLoaded มันจะยิงเองในรอบถัดไป
    // ยิงซ้ำเองจะทำให้แอป init สองรอบ
    if (window.document.readyState !== 'loading') {
        window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    }

    // คำนวณจำนวนที่คาดหวังจากข้อมูลจริง เพื่อไม่ต้องแก้เทสทุกครั้งที่ข้อมูลสาขาเปลี่ยน
    const data = JSON.parse(branchesJson);
    const usable = b => {
        const lat = parseFloat(b.latitude);
        const lng = parseFloat(b.longitude);
        return isFinite(lat) && isFinite(lng) && (Math.abs(lat) > 0.5 || Math.abs(lng) > 0.5);
    };
    const visible = data.filter(b => b.number !== 999);
    state.expected = {
        total: visible.length,
        mapped: visible.filter(usable).length,
        pending: visible.filter(b => !usable(b)).length,
        needsReview: visible.filter(b => b.coords_needs_review).length,
        // ชื่อสาขาที่ยังไม่มีพิกัด ใช้ทดสอบการ์ดในหมวด "รอปรับพิกัด"
        pendingSample: visible.filter(b => !usable(b))[0],
    };

    state.ev = expr => window.__peek(expr);
    state.$ = s => window.document.querySelector(s);
    state.$$ = s => [...window.document.querySelectorAll(s)];
    state.type = v => {
        const input = state.$('#branch-search');
        input.value = v;
        input.oninput({ target: input });
    };
    return state;
}

function createChecker() {
    const counts = { pass: 0, fail: 0 };
    const check = (name, actual, expected) => {
        const ok = JSON.stringify(actual) === JSON.stringify(expected);
        ok ? counts.pass++ : counts.fail++;
        console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  ได้ ${JSON.stringify(actual)} คาดว่า ${JSON.stringify(expected)}`}`);
    };
    return { check, counts };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { createApp, createChecker, sleep, REPO };

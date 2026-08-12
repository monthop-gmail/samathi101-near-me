# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PWA ภาษาไทยสำหรับค้นหาสาขาสถาบันพลังจิตตานุภาพที่ใกล้ผู้ใช้ที่สุด — vanilla HTML/CSS/JS ไม่มี build step
deploy อัตโนมัติขึ้น Cloudflare Pages ทุกครั้งที่ push เข้า `main`

## Commands

```bash
# รันเว็บในเครื่อง (ต้องผ่าน HTTP server ไม่ใช่เปิดไฟล์ตรงๆ เพราะมี fetch + service worker)
python3 -m http.server 8000

# เทส
npm install          # ครั้งแรกครั้งเดียว (devDependency มีแค่ jsdom)
npm test             # รันทุกชุด
node tests/app.test.js        # รันชุดเดียว
SW_PATH=/path/to/sw.js node tests/sw.test.js   # ทดสอบ sw.js เวอร์ชันอื่น (ใช้ยืนยัน regression)

# อัปเดตข้อมูลสาขา — ต้องรันตามลำดับนี้เสมอ ดูหัวข้อ Data pipeline
python3 scripts/fetch_and_process.py
python3 scripts/update_branches.py    # ต้องมี pandas + openpyxl
```

สคริปต์ที่ใช้ pandas ต้องรันใน venv: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`

## Data pipeline

`branches.json` คือ output ที่ถูก generate ไม่ใช่ไฟล์ที่แก้ด้วยมือ ประกอบจาก 3 แหล่ง:

1. **API** (`api.samathi101.com/branch/all/front`) — public endpoint ไม่ต้องใช้ token แล้ว
   สคริปต์ยังรองรับ `SAMATHI_API_TOKEN` เผื่อ API กลับมาบังคับ auth (เป็น Firebase ID token อายุ 1 ชม. — วิธีเอามาอยู่ใน README)
2. **Excel ใน `data/`** — `group_id` และ `custom_region` (API ไม่มีสองฟิลด์นี้)
3. **`data/manual_coordinates.json`** — พิกัดที่ทีมงานค้นมาเติมให้สาขาที่ระบบหลักยังไม่มีข้อมูล

**`fetch_and_process.py` เขียนทับ `branches.json` ทั้งไฟล์ จึงล้างข้อมูลจากแหล่ง 2 และ 3 ทิ้ง**
`update_branches.py` เป็นตัวเติมกลับ — รันคำสั่งแรกแล้ว commit เลยจะทำให้ข้อมูลกลุ่มสาขาและพิกัดหายทั้งไฟล์

`scripts/geocode_missing.py` ค้นพิกัดจาก Nominatim ให้สาขาที่ยังไม่มี — **ผลลัพธ์ต้องคัดกรองด้วยมือก่อนใช้เสมอ**
geocoder เคยคืนวัดชื่อคล้ายกันแต่คนละอำเภอ พิกัดผิดอันตรายกว่าไม่มีพิกัด เพราะผู้ใช้จะขับรถไปผิดที่โดยไม่รู้ตัว

### `branches.json` เป็น data contract สาธารณะ

ไฟล์นี้ (และ `data/*.xlsx`) ถูกโปรเจกต์อื่นดึงไปใช้ข้ามโดเมน — เป็นความตั้งใจ ไม่ใช่ข้อมูลรั่ว
**ห้ามตัดหรือเปลี่ยนชื่อฟิลด์เดิม** เพิ่มฟิลด์ใหม่ได้ (เช่น `group_id`, `custom_region`, `coords_*` ที่เพิ่มมาทีหลัง)
ถ้าแอปต้องการโครงสร้างที่ต่างออกไป ให้ generate เป็นไฟล์ derived แยก อย่าไปแก้สัญญาที่คนอื่นใช้อยู่

### ข้อตกลงเรื่องข้อมูล

- **พิกัด `0,0` = "ยังไม่ได้กรอก"** ไม่ใช่พิกัดจริง ค่าในข้อมูลมีทั้ง `"00.00000"`, `"0"` และเลขติดลบใกล้ศูนย์
  ทุกที่ที่เช็คต้อง parse เป็นตัวเลขแล้วดูขนาด — `if (b.latitude)` ใช้ไม่ได้เพราะ `"00.00000"` เป็น truthy string
- **สาขาเลข 999** เป็นสาขาทดสอบ ไม่แสดงต่อผู้ใช้ (`INTERNAL_BRANCH_NUMBERS`)
- **`group_id` 999** เป็น placeholder ของสาขาที่ยังไม่ถูกจัดกลุ่ม ไม่ขึ้นเป็นชิปกรอง
- **`coords_needs_review: true`** = พิกัดที่ทีมงานเติมให้ ยังไม่ได้รับการยืนยันจากสาขา
  UI ต้องสื่อสารเรื่องนี้ให้ชัดเสมอ (หมุดสีทอง + ป้าย + คำเตือนในหน้ารายละเอียด)
  รายชื่อที่รอตรวจอยู่ใน `docs/coordinates-review.md`

## Frontend architecture

`app.js` เป็น global-scope script ไม่มี module system แบ่ง state หลักเป็น:

- `allBranches` — ทุกสาขาที่แสดงต่อผู้ใช้ (ใช้ค้นหาด้วย id ตอนเปิดรายละเอียด)
- `branches` — เฉพาะที่มีพิกัดใช้งานได้ ใช้กับแผนที่และ "ใกล้ฉัน"
- `branchesNoCoords` — แสดงในลิสต์หมวด "รอปรับพิกัด" แต่ไม่ปักหมุด กดแล้วแผนที่ต้องไม่ขยับ

`markerLayer` เป็น `L.markerClusterGroup()` ถ้าโหลดปลั๊กอินจาก CDN ได้ ไม่งั้น fallback เป็น `L.layerGroup()`
โค้ดที่แตะ layer ต้องทำงานได้กับทั้งสองแบบ (ใช้ `addLayers`/`removeLayers` แบบ bulk เมื่อมี)

**ห้ามใส่ `.pulse` animation ในทุกหมุด** — เคยมี animation แบบ infinite เกือบ 300 ตัวพร้อมกัน กิน CPU/แบตหนักบนมือถือ
ตอนนี้เต้นเฉพาะหมุดที่เลือกผ่าน class `is-selected`

การค้นหาแบ่งจังหวะ: ลิสต์อัปเดตทันทีทุกคีย์ ส่วนงานฝั่งแผนที่ (ซ่อน/แสดงหมุด + `flyToBounds`) หน่วง 250 ms

ข้อมูลจาก API ถูกยัดลง `innerHTML` หลายจุด — ต้องผ่าน `esc()` เสมอ

## Service worker

Network-first: ออนไลน์ได้ของใหม่เสมอ ออฟไลน์ค่อย fallback ไปแคช

- **ห้ามใส่ cachebuster แบบ `?v=Date.now()` ใน fetch** — จะทำให้ `caches.match` หาไฟล์ไม่เจอตอนออฟไลน์
  ใช้ `cache: 'no-cache'` แทน (`_headers` ตั้ง no-cache + ETag ไว้ให้แล้ว)
- `CORE_ASSETS` ล้มแล้วติดตั้งไม่สำเร็จ ส่วน `OPTIONAL_ASSETS` (CDN) ต้องแคชแบบ best-effort
  ห้ามรวมกลับเป็น `cache.addAll` ชุดเดียว ไม่งั้น CDN ล่มแล้ว SW พังทั้งตัว
- แก้ `sw.js` ทีไรให้ bump `CACHE_NAME`

## Testing

ไม่มี test framework — เป็น script ธรรมดาที่ print ✓/✗ แล้ว exit code บอกผลรวม

- `tests/helpers.js` — `createApp()` โหลด `app.js` เข้า jsdom พร้อม stub Leaflet, `fetch`, geolocation, clipboard
  (เครื่องที่ไม่มี Chrome รันได้) รับ `{ url, withCluster }` เพื่อทดสอบ deep link และทาง fallback
- **จำนวนที่คาดหวังคำนวณจาก `branches.json` จริงผ่าน `state.expected`** ไม่ hardcode
  เวลาข้อมูลสาขาเปลี่ยน เทสจะไม่พังเอง
- `let`/`const` ใน `eval` ไม่หลุดออกมาข้างนอก จึงต้องอ่านตัวแปรใน `app.js` ผ่าน `ev('...')`

## Deploy

`.github/workflows/deploy.yml` รัน `wrangler pages deploy .` — **อัปทั้งโฟลเดอร์** รวม `data/`, `docs/`, `scripts/`, `tests/`
ซึ่งเป็นความตั้งใจ (ดูหัวข้อ data contract) `node_modules/` ถูก ignore ไว้แล้ว

## กฎจาก .cursorrules

- ห้าม hardcode API key / JWT / token ลงในไฟล์ใดๆ ให้ใช้ environment variable และอัปเดต `.env.example` แทน
- อย่าเปลี่ยน service worker เป็น cache-first โดยไม่ได้รับคำสั่ง
- UI ใช้ `100dvh` ไม่ใช่ `100vh` (กัน bottom sheet หายใต้แถบเบราว์เซอร์บนมือถือ) — ห้าม revert
- เจ้าของโปรเจกต์ทำงานบน Windows: ให้รันคำสั่ง git/gh ผ่าน WSL ไม่ใช่ PowerShell (เลี่ยงปัญหา encoding UTF-8)

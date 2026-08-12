"""
ค้นหาพิกัดให้สาขาที่ยังไม่มีข้อมูลพิกัด (latitude/longitude เป็น 0)
โดยใช้ Nominatim (OpenStreetMap) แล้วบันทึกลง data/manual_coordinates.json

ผลลัพธ์ทุกรายการถูกตั้ง needs_review = true เสมอ เพราะพิกัดจาก geocoder
อาจคลาดเคลื่อนได้ ต้องให้สาขายืนยันก่อนถือว่าถูกต้อง

การใช้งาน:
    python3 scripts/geocode_missing.py            # ค้นเฉพาะสาขาที่ยังไม่มีในไฟล์
    python3 scripts/geocode_missing.py --refresh  # ค้นใหม่ทั้งหมด ทับของเดิม
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
BRANCHES_JSON = os.path.join(ROOT_DIR, 'branches.json')
OUTPUT_FILE = os.path.join(ROOT_DIR, 'data', 'manual_coordinates.json')

NOMINATIM = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'samathi101-near-me/1.0 (https://github.com/monthop-gmail/samathi101-near-me)'
DELAY_SECONDS = 1.2  # Nominatim usage policy: อย่างมาก 1 request/วินาที

# ขอบเขตประเทศไทยแบบหยาบ ใช้กันผลลัพธ์ที่หลุดออกนอกประเทศ
TH_BOUNDS = (5.5, 20.5, 97.0, 105.7)

INTERNAL_BRANCH_NUMBERS = {999}


def has_usable_coords(branch):
    try:
        lat = float(branch.get('latitude'))
        lng = float(branch.get('longitude'))
    except (TypeError, ValueError):
        return False
    return abs(lat) > 0.5 or abs(lng) > 0.5


def parse_place_from_name(name):
    """ดึงชื่ออำเภอ/จังหวัดที่ฝังอยู่ในชื่อสาขา เช่น 'วัดตาอี อ.บ้านกรวด จ.บุรีรัมย์'"""
    province = None
    district = None
    m = re.search(r'จ\.\s*([^\s]+)', name)
    if m:
        province = m.group(1)
    m = re.search(r'อ\.\s*([^\s]+)', name)
    if m:
        district = m.group(1)
    return district, province


def clean_place_name(name):
    """ตัดส่วนที่เป็นที่อยู่/อำเภอ/จังหวัดออก เหลือเฉพาะชื่อสถานที่"""
    cleaned = re.split(r'\s+(?:อ\.|จ\.|ต\.|เขต|ริมคลอง)', name)[0]
    cleaned = re.sub(r'\d+[/\-\d]*', '', cleaned)  # ตัดเลขที่บ้าน
    return cleaned.strip()


def branch_place_info(branch):
    """รวมข้อมูลสถานที่จากทั้ง field ในฐานข้อมูลและชื่อสาขา"""
    province_obj = branch.get('province') or {}
    district_obj = branch.get('district') or {}
    sub_district_obj = branch.get('sub_district') or {}

    name_district, name_province = parse_place_from_name(branch['name'])

    return {
        'place': clean_place_name(branch['name']),
        'province': province_obj.get('name_th') or name_province,
        'district': district_obj.get('name_th') or name_district,
        'sub_district': sub_district_obj.get('name_th'),
    }


def build_queries(info):
    """สร้างคำค้นจากละเอียดที่สุดไปหยาบที่สุด"""
    parts = [info['place']]
    queries = []
    if info['sub_district'] and info['district'] and info['province']:
        queries.append(' '.join(parts + [info['sub_district'], info['district'], info['province']]))
    if info['district'] and info['province']:
        queries.append(' '.join(parts + [info['district'], info['province']]))
    if info['province']:
        queries.append(' '.join(parts + [info['province']]))
    queries.append(info['place'])
    # ตัดคำค้นซ้ำโดยคงลำดับเดิม
    return list(dict.fromkeys(queries))


def nominatim_search(query):
    params = urllib.parse.urlencode({
        'format': 'jsonv2',
        'q': query,
        'countrycodes': 'th',
        'limit': 5,
        'addressdetails': 1,
        'accept-language': 'th',
    })
    req = urllib.request.Request(f'{NOMINATIM}?{params}', headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def score_result(result, info):
    """ให้คะแนนความมั่นใจ: ยิ่งตรงจังหวัด/อำเภอและเป็นสถานที่จริง ยิ่งน่าเชื่อถือ"""
    lat, lon = float(result['lat']), float(result['lon'])
    if not (TH_BOUNDS[0] <= lat <= TH_BOUNDS[1] and TH_BOUNDS[2] <= lon <= TH_BOUNDS[3]):
        return 0, 'อยู่นอกประเทศไทย'

    display = result.get('display_name', '')
    address = result.get('address', {})
    score = 1
    reasons = []

    if info['province'] and info['province'] in display:
        score += 3
        reasons.append('ตรงจังหวัด')
    elif info['province']:
        return 0, f"ไม่ตรงจังหวัด (ได้ {address.get('province') or address.get('state') or '?'})"

    if info['district'] and info['district'] in display:
        score += 2
        reasons.append('ตรงอำเภอ')

    if result.get('type') in ('place_of_worship', 'university', 'college', 'school', 'monastery'):
        score += 2
        reasons.append(f"เป็น{result.get('type')}")

    if info['place'] and info['place'] in result.get('name', ''):
        score += 2
        reasons.append('ชื่อตรง')

    return score, ', '.join(reasons) or 'ตรงเงื่อนไขขั้นต่ำ'


def geocode(branch):
    info = branch_place_info(branch)
    best = None

    for query in build_queries(info):
        try:
            results = nominatim_search(query)
        except Exception as exc:
            print(f'    ! คำค้น "{query}" ล้มเหลว: {exc}')
            time.sleep(DELAY_SECONDS)
            continue
        time.sleep(DELAY_SECONDS)

        for result in results:
            score, reason = score_result(result, info)
            if score and (best is None or score > best['score']):
                best = {
                    'score': score,
                    'reason': reason,
                    'query': query,
                    'result': result,
                }
        if best and best['score'] >= 6:
            break  # มั่นใจพอแล้ว ไม่ต้องค้นแบบหยาบต่อ

    return info, best


def main():
    refresh = '--refresh' in sys.argv

    with open(BRANCHES_JSON, encoding='utf-8') as f:
        branches = json.load(f)

    existing = {}
    if os.path.exists(OUTPUT_FILE) and not refresh:
        with open(OUTPUT_FILE, encoding='utf-8') as f:
            existing = json.load(f).get('branches', {})

    missing = [b for b in branches
               if not has_usable_coords(b) and b['number'] not in INTERNAL_BRANCH_NUMBERS]
    print(f'พบ {len(missing)} สาขาที่ยังไม่มีพิกัด\n')

    found = dict(existing)
    unresolved = []

    for branch in missing:
        key = str(branch['number'])
        if key in found and not refresh:
            print(f"[{key}] ข้าม (มีในไฟล์แล้ว): {branch['name'][:40]}")
            continue

        print(f"[{key}] {branch['name'][:55]}")
        info, best = geocode(branch)

        if not best:
            print('    ✗ ไม่พบพิกัดที่เชื่อถือได้')
            unresolved.append({'number': branch['number'], 'name': branch['name']})
            continue

        result = best['result']
        print(f"    ✓ {result.get('name') or result['display_name'][:40]} "
              f"({result['lat']}, {result['lon']}) score={best['score']} [{best['reason']}]")

        found[key] = {
            'name': branch['name'],
            'latitude': result['lat'],
            'longitude': result['lon'],
            'source': 'openstreetmap',
            'osm_type': result.get('osm_type'),
            'osm_id': result.get('osm_id'),
            'matched_name': result.get('name'),
            'display_name': result.get('display_name'),
            'query': best['query'],
            'confidence': 'high' if best['score'] >= 6 else 'medium',
            'match_reason': best['reason'],
            'needs_review': True,
        }

    payload = {
        '_readme': (
            'พิกัดที่ทีมงานเติมให้สาขาที่ระบบหลักยังไม่มีข้อมูล ค้นจาก OpenStreetMap '
            'ทุกรายการต้องให้สาขายืนยันก่อน จึงตั้ง needs_review = true ไว้ '
            'ไฟล์นี้ถูกนำไปรวมกับ branches.json โดย scripts/update_branches.py '
            'เพื่อให้ข้อมูลไม่หายเวลาดึงข้อมูลใหม่จาก API'
        ),
        'unresolved': unresolved,
        'branches': dict(sorted(found.items(), key=lambda kv: int(kv[0]))),
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f'\nได้พิกัด {len(found)}/{len(missing)} สาขา')
    if unresolved:
        print(f'ยังหาไม่ได้ {len(unresolved)} สาขา:')
        for item in unresolved:
            print(f"  - {item['number']} {item['name']}")
    print(f'บันทึกที่ {OUTPUT_FILE}')


if __name__ == '__main__':
    main()

import json
import http.client
import urllib.parse
import os

# --- การตั้งค่า (Configuration) ---
# ความปลอดภัย: ห้ามฮาร์ดโค้ด Token ลงในไฟล์เด็ดขาด ให้ดึงผ่าน Environment Variable แทน
TOKEN = os.environ.get('SAMATHI_API_TOKEN')

# Get root directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

API_HOST = 'api.samathi101.com'
API_PATH = '/branch/all/front?limit=500&page=1&order=ASC'
OUTPUT_FILE = os.path.join(ROOT_DIR, 'branches.json')

REGION_MAP = {
    1: {"name6_th": "ภาคเหนือ", "name6_en": "Northern", "name4_th": "ภาคเหนือ", "name4_en": "Northern"},
    2: {"name6_th": "ภาคกลาง", "name6_en": "Central", "name4_th": "ภาคกลาง", "name4_en": "Central"},
    3: {"name6_th": "ภาคตะวันออกเฉียงเหนือ", "name6_en": "Northeastern", "name4_th": "ภาคตะวันออกเฉียงเหนือ", "name4_en": "Northeastern"},
    4: {"name6_th": "ภาคตะวันออก", "name6_en": "Eastern", "name4_th": "ภาคกลาง", "name4_en": "Central"},
    5: {"name6_th": "ภาคตะวันตก", "name6_en": "Western", "name4_th": "ภาคกลาง", "name4_en": "Central"},
    6: {"name6_th": "ภาคใต้", "name6_en": "Southern", "name4_th": "ภาคใต้", "name4_en": "Southern"},
}

def fetch_data():
    if not TOKEN:
        print("ERROR: ไม่พบ SAMATHI_API_TOKEN ใน Environment Variables")
        print("กรุณารันคำสั่ง: export SAMATHI_API_TOKEN='Bearer your-token'")
        return None

    print(f"Fetching data from {API_HOST}...")
    headers = {'Authorization': TOKEN}
    conn = http.client.HTTPSConnection(API_HOST)
    conn.request("GET", API_PATH, headers=headers)
    response = conn.getresponse()
    
    if response.status != 200:
        print(f"เกิดข้อผิดพลาดในการดึงข้อมูล: {response.status} {response.reason}")
        return None
        
    data = response.read()
    conn.close()
    return json.loads(data.decode('utf-8'))

def process_and_save(raw_data):
    if not raw_data or 'data' not in raw_data or 'branches' not in raw_data['data']:
        print("โครงสร้างข้อมูลไม่ถูกต้อง")
        return

    branches = raw_data['data']['branches']
    print(f"Found {len(branches)} branches. Processing regional information...")

    for branch in branches:
        province = branch.get('province')
        if province and 'region_id' in province:
            try:
                rid = int(province['region_id'])
                if rid in REGION_MAP:
                    m = REGION_MAP[rid]
                    province['region_name_6_th'] = m['name6_th']
                    province['region_name_6_en'] = m['name6_en']
                    province['region_name_4_th'] = m['name4_th']
                    province['region_name_4_en'] = m['name4_en']
            except (TypeError, ValueError):
                pass

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(branches, f, ensure_ascii=False, indent=2)
    
    print(f"Successfully saved data to: {OUTPUT_FILE}")

if __name__ == "__main__":
    raw_data = fetch_data()
    if raw_data:
        process_and_save(raw_data)

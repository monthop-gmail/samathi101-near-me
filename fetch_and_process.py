import json
import http.client
import urllib.parse
import os

# --- การตั้งค่า (Configuration) ---
# หมายเหตุ: โทเค็น Bearer มีอายุจำกัด หากหมดอายุให้ทำตามขั้นตอนใน walkthrough.md เพื่อรับโทเค็นใหม่
TOKEN = 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjM3MzAwNzY5YTA3ZTA1MTE2ZjdlNTEzOGZhOTA5MzY4NWVlYmMyNDAiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiTW9udGhvcCBTdW1hbmEiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EtL0FPaDE0R2d5am9mU1FfelVSLUtGRU5VSFJWQW0zMnV0bjBORmw0OUJXdVF5NkE9czk2LWMiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vd2lsbC1wb3dlci1wcm9kIiwiYXVkIjoid2lsbC1wb3dlci1wcm9kIiwiYXV0aF90aW1lIjoxNzcwNDAwOTgzLCJ1c2VyX2lkIjoiZGFmWHhmWERBS1NzaG9wQ3lrUlJpZzRyNVM3MyIsInN1YiI6ImRhZlh4ZlhEQUtTc2hvcEN5a1JSaWc0cjVTNzMiLCJpYXQiOjE3NzQ2Njg1NjIsImV4cCI6MTc3NDY3MjE2MiwiZW1haWwiOiJtb250aG9wQHN1bWFuYS5vcmciLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjExNzIyMTc2NjI1MTYyODY5NTczMiJdLCJlbWFpbCI6WyJtb250aG9wQHN1bWFuYS5vcmciXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.GcEtyV2Nvg-HqZD5CsEsMWIhRxBVP6k1SlkWynoardp9zKrdNxltxLT5umlD9jCqXbEZTpZUG1mtQV-4wRVNShgl3xpptyEBrZ05Xb5wmHM_4fLoNIJRbNC3jib_0ZRwP_I6lPxxjbCpVPZDjAKi1q-GZMbvRueKrSS4xw8KJv2YNNI3kCnLJATsWCzVXkuCMCikO483qR47vMXS5iUhS1WYz9PDwlBBf2HI4471j4mCsu4UBWjsHrjrgGX2lCTcnKUDhz6MkxgqionwQ8tOdyrK7aGOgRiIodKs1FUTgPhBKDCsQFMjC367uetplsFfabbbFr7jFfBWv1n2KhlxIA'
API_HOST = 'api.samathi101.com'
API_PATH = '/branch/all/front?limit=500&page=1&order=ASC'
OUTPUT_FILE = 'branches.json'

REGION_MAP = {
    1: {"name6_th": "ภาคเหนือ", "name6_en": "Northern", "name4_th": "ภาคเหนือ", "name4_en": "Northern"},
    2: {"name6_th": "ภาคกลาง", "name6_en": "Central", "name4_th": "ภาคกลาง", "name4_en": "Central"},
    3: {"name6_th": "ภาคตะวันออกเฉียงเหนือ", "name6_en": "Northeastern", "name4_th": "ภาคตะวันออกเฉียงเหนือ", "name4_en": "Northeastern"},
    4: {"name6_th": "ภาคตะวันออก", "name6_en": "Eastern", "name4_th": "ภาคกลาง", "name4_en": "Central"},
    5: {"name6_th": "ภาคตะวันตก", "name6_en": "Western", "name4_th": "ภาคกลาง", "name4_en": "Central"},
    6: {"name6_th": "ภาคใต้", "name6_en": "Southern", "name4_th": "ภาคใต้", "name4_en": "Southern"},
}

def fetch_data():
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

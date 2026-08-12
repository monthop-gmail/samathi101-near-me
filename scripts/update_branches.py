import pandas as pd
import json
import os
import re

# --- Configuration ---
# Get the directory where the script is located (scripts/)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Get the project root (one level up)
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

BRANCHES_JSON = os.path.join(ROOT_DIR, 'branches.json')
EXCEL_LOOKUP = os.path.join(ROOT_DIR, 'data', 'LookupBranch_H2_2568_20251121.xlsx')
EXCEL_KSP = os.path.join(ROOT_DIR, 'data', 'KSP_Branch.xlsx')
MANUAL_COORDS = os.path.join(ROOT_DIR, 'data', 'manual_coordinates.json')
OUTPUT_JSON = os.path.join(ROOT_DIR, 'branches.json')

def normalize_branch_number(val):
    """Convert string branch number (like '001', '034') to int."""
    if pd.isna(val):
        return None
    try:
        # Extract numbers from string like '034' or '1'
        match = re.search(r'\d+', str(val))
        if match:
            return int(match.group())
    except Exception:
        pass
    return None

def has_usable_coords(branch):
    """พิกัด 0,0 ในระบบหลักหมายถึง 'ยังไม่ได้กรอก' ไม่ใช่พิกัดจริง"""
    try:
        lat = float(branch.get('latitude'))
        lng = float(branch.get('longitude'))
    except (TypeError, ValueError):
        return False
    return abs(lat) > 0.5 or abs(lng) > 0.5


def apply_manual_coordinates(branches):
    """
    เติมพิกัดที่ทีมงานหามาเองให้สาขาที่ระบบหลักยังไม่มีข้อมูล
    ทำหลังดึงข้อมูลใหม่ทุกครั้ง ไม่งั้นพิกัดจะหายไปพร้อมกับ group_id
    ถ้าระบบหลักเริ่มมีพิกัดจริงแล้ว จะใช้ของระบบหลักเป็นหลักเสมอ
    """
    if not os.path.exists(MANUAL_COORDS):
        print("ไม่พบ data/manual_coordinates.json ข้ามขั้นตอนเติมพิกัด")
        return

    with open(MANUAL_COORDS, 'r', encoding='utf-8') as f:
        manual = json.load(f).get('branches', {})

    applied = 0
    superseded = []

    for branch in branches:
        entry = manual.get(str(branch.get('number')))
        if not entry:
            continue

        if has_usable_coords(branch):
            # ระบบหลักมีพิกัดจริงแล้ว ให้ลบรายการนี้ออกจากไฟล์ manual ได้
            superseded.append(branch['number'])
            continue

        branch['latitude'] = entry['latitude']
        branch['longitude'] = entry['longitude']
        branch['coords_source'] = entry.get('source', 'manual')
        branch['coords_needs_review'] = bool(entry.get('needs_review', True))
        branch['coords_note'] = entry.get('note', '')
        applied += 1

    print(f"Applied manual coordinates to {applied} branches.")
    if superseded:
        print("ระบบหลักมีพิกัดของสาขาเหล่านี้แล้ว ลบออกจาก manual_coordinates.json ได้: "
              + ', '.join(str(n) for n in superseded))


def main():
    print("Loading existing branches.json...")
    if not os.path.exists(BRANCHES_JSON):
        print(f"Error: {BRANCHES_JSON} not found.")
        return

    with open(BRANCHES_JSON, 'r', encoding='utf-8') as f:
        branches = json.load(f)

    print(f"Loaded {len(branches)} branches.")

    # Load Excel Files
    print(f"Loading {EXCEL_LOOKUP}...")
    df_lookup = pd.read_excel(EXCEL_LOOKUP)
    
    print(f"Loading {EXCEL_KSP}...")
    df_ksp = pd.read_excel(EXCEL_KSP)

    # Normalize Excel data for lookup
    # df_lookup: ['กลุ่มสาขา', 'เลขสาขา', 'ชื่อสาขา', 'BranchName', 'Region', 'Province']
    df_lookup['branch_num'] = df_lookup['เลขสาขา'].apply(normalize_branch_number)
    
    # Create lookup dictionaries for faster access
    group_map = {}
    region_map = {}
    
    for _, row in df_lookup.iterrows():
        b_num = row['branch_num']
        if b_num is not None:
            # We use .get() or handle NaN to prevent issues
            group_val = row['กลุ่มสาขา']
            region_val = row['Region']
            
            group_map[b_num] = int(group_val) if not pd.isna(group_val) else None
            region_map[b_num] = str(region_val) if not pd.isna(region_val) else None

    print("Enriching branch data...")
    enriched_count = 0
    
    for branch in branches:
        b_num = branch.get('number')
        if b_num in group_map:
            branch['group_id'] = group_map[b_num]
            branch['custom_region'] = region_map[b_num]
            enriched_count += 1
        else:
            branch['group_id'] = None
            branch['custom_region'] = None

    print(f"Enriched {enriched_count} branches with group and region data.")

    apply_manual_coordinates(branches)

    # Sort branches by number for consistency
    branches.sort(key=lambda x: x.get('number', 999))
    
    # Save output
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(branches, f, ensure_ascii=False, indent=2)
    
    print(f"Successfully saved enriched data to {OUTPUT_JSON}")

if __name__ == "__main__":
    main()

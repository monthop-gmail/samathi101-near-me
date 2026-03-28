import pandas as pd
import re
import os

def normalize(val):
    if pd.isna(val): return None
    match = re.search(r'\d+', str(val))
    return int(match.group()) if match else None

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

df1 = pd.read_excel(os.path.join(ROOT_DIR, 'data', 'KSP_Branch.xlsx'))
df2 = pd.read_excel(os.path.join(ROOT_DIR, 'data', 'LookupBranch_H2_2568_20251121.xlsx'))

# KSP_Branch: ['ลำดับที่', 'หน่วยงาน', 'กลุ่ม', 'ศูนย์ที่ดูแล']
# LookupBranch: ['กลุ่มสาขา', 'เลขสาขา', 'ชื่อสาขา', 'Region', 'Province']

# KSP_Branch columns: ['BranchNo.', 'GroupBranchNo.', 'BranchName', 'Region']
# LookupBranch columns: ['กลุ่มสาขา', 'เลขสาขา', 'ชื่อสาขา', 'BranchName', 'Region', 'Province']

df1.columns = df1.columns.str.strip()
df2.columns = df2.columns.str.strip()

df1['branch_num'] = df1['BranchNo.'].apply(normalize)
df2['branch_num'] = df2['เลขสาขา'].apply(normalize)

# Compare branch numbers
s1 = set(df1['branch_num'].dropna())
s2 = set(df2['branch_num'].dropna())

print(f"KSP_Branch unique branches: {len(s1)}")
print(f"LookupBranch unique branches: {len(s2)}")
print(f"Overlap: {len(s1.intersection(s2))}")
print(f"Branches in KSP but NOT in Lookup: {sorted(list(s1.difference(s2)))}")
print(f"Branches in Lookup but NOT in KSP: {sorted(list(s2.difference(s1)))}")

# Check for group mismatches in overlap
# df1 uses 'GroupBranchNo.', df2 uses 'กลุ่มสาขา'
merged = pd.merge(df1[['branch_num', 'GroupBranchNo.']], df2[['branch_num', 'กลุ่มสาขา']], on='branch_num')
mismatches = merged[merged['GroupBranchNo.'].astype(float) != merged['กลุ่มสาขา'].astype(float)]
print(f"\nGroup mismatches in overlapped branches: {len(mismatches)}")
if len(mismatches) > 0:
    print(mismatches.head(10).to_string())

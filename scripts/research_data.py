import pandas as pd
import os

def inspect_file(path):
    print(f"\n--- {path} ---")
    df = pd.read_excel(path)
    print("Columns:", df.columns.tolist())
    print("Sample Data:")
    print(df.head(2).to_dict(orient='records'))

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

inspect_file(os.path.join(ROOT_DIR, 'data', 'KSP_Branch.xlsx'))
inspect_file(os.path.join(ROOT_DIR, 'data', 'LookupBranch_H2_2568_20251121.xlsx'))

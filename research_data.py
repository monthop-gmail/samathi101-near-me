import pandas as pd

def inspect_file(path):
    print(f"\n--- {path} ---")
    df = pd.read_excel(path)
    print("Columns:", df.columns.tolist())
    print("Sample Data:")
    print(df.head(2).to_dict(orient='records'))

inspect_file('data/KSP_Branch.xlsx')
inspect_file('data/LookupBranch_H2_2568_20251121.xlsx')

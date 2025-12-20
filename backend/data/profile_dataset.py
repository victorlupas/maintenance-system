from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent

def profile_csv(filename: str):
    path = BASE_DIR / filename
    df = pd.read_csv(path)

    print("\n==============================")
    print(f"FILE: {filename}")
    print("==============================")
    print("Rows, Cols:", df.shape)
    print("\nColumns:")
    print(list(df.columns))

    print("\nDtypes:")
    print(df.dtypes)

    print("\nMissing values per column:")
    print(df.isna().sum())

    print("\nFirst 5 rows:")
    print(df.head())

    # numeric summary (quick)
    numeric = df.select_dtypes(include="number")
    if not numeric.empty:
        print("\nNumeric describe:")
        print(numeric.describe().T)

if __name__ == "__main__":
    # change these names to the exact filenames you saved in backend/data/
    profile_csv("air_compressor.csv")
    profile_csv("ai4i2020.csv")

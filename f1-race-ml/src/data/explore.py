import pandas as pd

df = pd.read_csv("data/raw/race_results.csv")

print("Shape:")
print(df.shape)

print("\nColumns:")
print(df.columns.tolist())

print("\nFirst 5 rows:")
print(df.head())

print("\nMissing values:")
print(df.isnull().sum())

print("\nStatus distribution:")
print(df["status"].value_counts())

print("\nSeasons:")
print(df["season"].value_counts().sort_index())
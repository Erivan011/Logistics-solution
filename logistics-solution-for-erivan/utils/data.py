
import pandas as pd

def load_csv(file):
    return pd.read_csv(file)

def to_dummies(df):
    return pd.get_dummies(df, drop_first=True)

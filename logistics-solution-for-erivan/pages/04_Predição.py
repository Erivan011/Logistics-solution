
import streamlit as st
import pandas as pd
import pickle
from utils.data import load_csv, to_dummies

st.title("Predição com Modelo Treinado")

model_file = st.file_uploader("Envie o arquivo do modelo (artefatos_modelo.pkl)", type=["pkl"]) 
data_file = st.file_uploader("Envie um CSV com novos dados", type=["csv"]) 

if model_file and data_file:
    payload = pickle.load(model_file)
    model = payload['model']
    scaler = payload['scaler']
    features = payload['features']

    df_new = load_csv(data_file)
    X = df_new[features].copy()
    X = to_dummies(X)

    # Alinhar colunas
    for col in features:
        if col not in X.columns:
            X[col] = 0
    X = X[features]

    if scaler:
        X = scaler.transform(X)

    preds = model.predict(X)
    out = df_new.copy()
    out['predicao'] = preds
    st.dataframe(out.head())
    st.download_button("Baixar CSV com predições", out.to_csv(index=False).encode('utf-8'), file_name='predicoes.csv', mime='text/csv')
else:
    st.info("Envie o modelo e o CSV para gerar predições.")

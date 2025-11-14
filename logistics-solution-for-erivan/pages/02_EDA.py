
import streamlit as st
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
from utils.data import load_csv

st.title("Exploração de Dados (EDA)")

uploaded = st.file_uploader("Envie um CSV (UTF-8)", type=["csv"], key="eda_csv")
if uploaded:
    df = load_csv(uploaded)
    st.subheader("Amostra")
    st.dataframe(df.head())

    st.subheader("Informações Gerais")
    col1, col2 = st.columns(2)
    with col1:
        st.write(df.describe(include='all'))
    with col2:
        st.write("Dimensões:", df.shape)
        st.write("Colunas:", list(df.columns))

    st.subheader("Correlação (numéricas)")
    num = df.select_dtypes(include='number')
    if not num.empty:
        fig, ax = plt.subplots(figsize=(7,5))
        sns.heatmap(num.corr(), annot=False, cmap='Blues', ax=ax)
        st.pyplot(fig)
    else:
        st.info("Não há colunas numéricas para correlacionar.")
else:
    st.info("Envie um CSV para começar a EDA.")

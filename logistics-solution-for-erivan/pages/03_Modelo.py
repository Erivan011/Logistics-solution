
import streamlit as st
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix
)
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
import seaborn as sns
import matplotlib.pyplot as plt
import pickle
from utils.data import load_csv, to_dummies

st.title("Treinamento do Modelo")

uploaded = st.file_uploader("Envie um CSV (UTF-8)", type=["csv"], key="train_csv")

if uploaded:
    df = load_csv(uploaded)
    st.write("Amostra dos dados:")
    st.dataframe(df.head())

    target = st.selectbox("Coluna alvo (classificação)", options=df.columns)
    features = st.multiselect("Features", options=[c for c in df.columns if c != target])
    if not features:
        features = [c for c in df.columns if c != target]

    X = df[features].copy()
    y = df[target].copy()
    X = to_dummies(X)

    test_size = st.slider("Tamanho do teste", 0.1, 0.4, 0.2, 0.05)
    scale = st.checkbox("Padronizar numéricas", value=True)

    model_name = st.selectbox("Modelo", ["Logistic Regression", "Random Forest"])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42,
        stratify=y if y.nunique() < 20 else None
    )

    if scale:
        scaler = StandardScaler()
        X_train = scaler.fit_transform(X_train)
        X_test = scaler.transform(X_test)
    else:
        scaler = None

    if model_name == "Logistic Regression":
        model = LogisticRegression(max_iter=500)
    else:
        model = RandomForestClassifier(n_estimators=300, random_state=42)

    if st.button("Treinar"):
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Accuracy", f"{accuracy_score(y_test, preds):.3f}")
        c2.metric("Precision", f"{precision_score(y_test, preds, average='weighted', zero_division=0):.3f}")
        c3.metric("Recall", f"{recall_score(y_test, preds, average='weighted', zero_division=0):.3f}")
        c4.metric("F1-score", f"{f1_score(y_test, preds, average='weighted', zero_division=0):.3f}")

        st.subheader("Matriz de Confusão")
        fig, ax = plt.subplots(figsize=(6,4))
        sns.heatmap(confusion_matrix(y_test, preds), annot=True, fmt='d', cmap='Blues', ax=ax)
        st.pyplot(fig)

        # Salvar artefatos
        payload = {
            'model': model,
            'scaler': scaler,
            'features': features,
            'target': target
        }
        with open('artefatos_modelo.pkl', 'wb') as f:
            pickle.dump(payload, f)
        with open('artefatos_modelo.pkl', 'rb') as f:
            st.download_button("Baixar modelo treinado", f, file_name='artefatos_modelo.pkl')
else:
    st.info("Envie um CSV para treinar o modelo.")


import streamlit as st
from utils.links import LINKS

st.set_page_config(page_title="Logistics Solution", page_icon="🚚", layout="wide")

st.title("🚚 Logistics Solution — Sistema WEB")
st.markdown(
    """
    Bem-vindo ao **Logistics Solution**, um *template* pronto para publicar o seu
    projeto de Ciência de Dados/Logística como um **Sistema WEB**.

    Use o menu **Pages** para navegar por **Visão Geral**, **EDA**, **Modelo** e **Predição**.
    """
)

st.subheader("Links do Projeto")
st.write(f"**Repositório GitHub**: {LINKS['repo']}")
st.write(f"**Deploy (produção)**: {LINKS['deploy']}")
st.write(f"**Vídeo (YouTube)**: {LINKS['video']}")

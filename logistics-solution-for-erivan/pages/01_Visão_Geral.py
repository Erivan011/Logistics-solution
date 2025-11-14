
import streamlit as st
from utils.links import LINKS

st.title("Visão Geral")
st.markdown(
    """
    ### Objetivo
    Descreva o **propósito** do sistema e a **demanda real** atendida (ONG, Projeto Cultural, Extensão ou Profissional).

    ### Público-alvo
    Quem usa? Quais dores resolvemos?

    ### Arquitetura (alto nível)
    - Frontend: **Streamlit**
    - Modelagem: **scikit-learn**
    - Deploy: **Streamlit Community Cloud** ou similar

    ### Equipe (exemplo)
    - Nome (RA) — função
    - Nome (RA) — função
    """
)

st.divider()
st.subheader("Links")
st.write(f"**Repositório**: {LINKS['repo']}")
st.write(f"**Deploy**: {LINKS['deploy']}")
st.write(f"**Vídeo**: {LINKS['video']}")

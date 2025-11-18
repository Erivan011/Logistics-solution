const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const entregas = [
  { 
    id: 1, 
    destino: "Hospital São Lucas", 
    status: "ENTREGUE", 
    medicamentos: ["Dipirona 500mg", "Ibuprofeno 400mg"],
    data: "2025-11-19",
    tempoEntrega: "2 horas"
  },
  { 
    id: 2, 
    destino: "UBS Santana", 
    status: "EM_TRANSITO", 
    medicamentos: ["Paracetamol 750mg"],
    data: "2025-11-19",
    tempoEntrega: "1 hora"
  }
];

const estoque = [
  { id: 1, medicamento: "Dipirona 500mg", quantidade: 150, categoria: "Analgésico" },
  { id: 2, medicamento: "Ibuprofeno 400mg", quantidade: 80, categoria: "Anti-inflamatório" }
];

app.get('/api/entregas', (req, res) => {
  res.json({
    success: true,
    data: entregas,
    total: entregas.length
  });
});

app.get('/api/estoque', (req, res) => {
  res.json({
    success: true,
    data: estoque,
    total: estoque.length
  });
});

app.get('/', (req, res) => {
  res.json({
    sistema: "Logistics Solution API",
    desenvolvedor: "Erivan Santos Marques - RA: 2223201673",
    status: "Online"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

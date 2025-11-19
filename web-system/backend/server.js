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
    data: "2025-11-19"
  },
  { 
    id: 2, 
    destino: "UBS Santana", 
    status: "EM_TRANSITO", 
    medicamentos: ["Paracetamol 750mg"],
    data: "2025-11-19"
  }
];

app.get('/api/entregas', (req, res) => {
  res.json({success: true, data: entregas, total: entregas.length});
});

app.get('/', (req, res) => {
  res.json({
    sistema: "Logistics Solution API",
    desenvolvedor: "Erivan Santos Marques - RA: 2223201673"
  });
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});

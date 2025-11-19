const express = require('express');
const app = express();

app.get('/api/entregas', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, destino: "Hospital Teste", status: "ENTREGUE" },
      { id: 2, destino: "UBS Teste", status: "EM_TRANSITO" }
    ],
    total: 2
  });
});

app.get('/', (req, res) => {
  res.json({
    sistema: "Logistics Solution API",
    desenvolvedor: "Erivan Santos Marques - RA: 2223201673",
    status: "Online"
  });
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});

const express = require('express');
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

app.get('/api/entregas', (req, res) => {
    res.json([
        {id: 1, destino: "Hospital São Lucas", status: "Entregue"},
        {id: 2, destino: "UBS Santana", status: "Em trânsito"}
    ]);
});

app.get('/', (req, res) => {
    res.json({mensagem: "API Logistics Solution funcionando!"});
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando: http://localhost:${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}/api/entregas`);
});

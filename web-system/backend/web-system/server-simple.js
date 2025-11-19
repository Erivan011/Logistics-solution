const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json'});
  
  if (req.url === '/api/entregas') {
    res.end(JSON.stringify({
      success: true,
      data: [{id: 1, destino: "Hospital", status: "Entregue"}],
      total: 1
    }));
  } else {
    res.end(JSON.stringify({
      sistema: "Logistics Solution",
      desenvolvedor: "Erivan Santos Marques - RA: 2223201673"
    }));
  }
});

server.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});

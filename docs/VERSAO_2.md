# Logistics Solution

**Central de operações de logística farmacêutica** · Projeto de portfólio de **Erivan Santos Marques**.

A versão 2 transforma a demonstração inicial em uma aplicação executável para cadastrar remessas, acompanhar etapas e consultar indicadores de transporte. O objetivo é demonstrar integração entre **desenvolvimento web, SQL, análise de dados e processos operacionais**.

> Ambiente de estudo, com dados fictícios. Não possui autenticação nem controles necessários para operar dados reais de saúde. Não é um sistema de rastreabilidade regulatória, prescrição ou monitoramento de cadeia fria.

## Executar em dois passos

Requer **Node.js 24 LTS** (inclui SQLite nativo). Nenhuma dependência de produção precisa ser instalada.

```bash
git clone https://github.com/Erivan011/Logistics-solution.git
cd Logistics-solution
npm start
```

Abra **http://127.0.0.1:3000**. Na primeira execução, o sistema cria o banco em `web-system/data/logistics.sqlite` e 18 remessas fictícias. Os dados permanecem após reiniciar. Nenhuma conta, chave de API ou serviço pago é necessário.

## Experimente

1. Explore o panorama, as entregas e os indicadores por transportadora.
2. Clique em **Nova entrega**, preencha os campos e cadastre uma remessa.
3. Abra os detalhes e use **Iniciar transporte**, depois **Confirmar recebimento**.
4. Consulte o histórico para conferir os eventos persistidos.
5. Combine busca, status, prioridade e filtro de atrasadas; exporte o resultado em CSV.

O CSV utiliza ponto e vírgula e BOM UTF-8 para facilitar a abertura no Excel. Textos que poderiam ser interpretados como fórmulas são neutralizados.

## Funcionalidades

- Interface em português, adaptada para computador e celular, com navegação por teclado, rótulos acessíveis e estados de erro e ausência de dados.
- Cadastro de destino, produto, lote, transportadora, quantidade, prioridade, prazo e custo.
- Busca por destino, produto, lote, parceiro ou ID, filtros combinados e paginação.
- Fluxo validado: `Pendente → Em trânsito → Entregue`; pendências e remessas em trânsito podem ser canceladas. Estados finais não são reabertos.
- Histórico de eventos e controle de versão para impedir que uma atualização antiga sobrescreva outra.
- SQLite com transações, consultas parametrizadas, integridade referencial e valores monetários armazenados em centavos inteiros.
- Indicadores calculados pelo servidor e exportação filtrada.
- Testes automatizados e verificação no GitHub Actions.

### Como os indicadores são calculados

| Indicador           | Definição                                                                        |
| ------------------- | -------------------------------------------------------------------------------- |
| Total               | Todas as remessas, inclusive canceladas                                          |
| Em trânsito         | Remessas com esse status                                                         |
| Entregas no prazo   | Concluídas até o dia do prazo / todas as concluídas; sem amostra, mostra `—`     |
| Atrasadas           | Pendentes ou em trânsito cujo prazo seja anterior ao dia atual em São Paulo      |
| Custo de transporte | Soma dos custos de todas as remessas não canceladas; não representa despesa paga |
| Unidades            | Quantidade de itens de remessas não canceladas                                   |

Os cartões e o panorama consideram **toda a base**. Os filtros alteram apenas a tabela e o CSV. O prazo é uma data, não um horário: vence ao fim do dia de `America/Sao_Paulo`. Os dados são atualizados ao abrir a página, consultar filtros ou clicar em Atualizar; não há rastreamento GPS nem atualização automática por transportadora.

## Arquitetura

```text
Navegador → Servidor HTTP Node.js → Regras de negócio → SQLite
```

O frontend e a API são servidos pela mesma aplicação. Não há URL de localhost embutida no JavaScript, CDN ou dependência de fonte externa.

```text
web-system/
  backend/
    server.js       Rotas HTTP, arquivos estáticos, segurança e CSV
    store.js        Validação, regras, transações, consultas e seed
  frontend/
    index.html      Estrutura e formulários acessíveis
    styles.css      Layout responsivo
    app.js          Estado da interface e integração com API
  tests/
    operations.test.js
  data/             Banco local ignorado pelo Git
.github/workflows/ci.yml
```

Os notebooks e documentos acadêmicos originais foram preservados na raiz. São a origem histórica do projeto; alguns utilizam arquivos gerados por células anteriores ou Google Colab. **Não são executados pela aplicação web.** Não há modelo de machine learning em produção: os experimentos acadêmicos com poucos registros não demonstram capacidade preditiva confiável.

## API

As respostas de sucesso utilizam `{ "data": ... }`. Listagem também retorna `meta.total`. Erros usam `{ "error": "mensagem" }`.

| Método | Rota                       | Uso                                                       |
| ------ | -------------------------- | --------------------------------------------------------- |
| GET    | `/api/health`              | Verificação básica do processo                            |
| GET    | `/api/indicadores`         | Indicadores de toda a base                                |
| GET    | `/api/entregas`            | Listagem; filtros `q`, `status`, `prioridade`, `atraso=1` |
| POST   | `/api/entregas`            | Cadastro                                                  |
| GET    | `/api/entregas/:id`        | Detalhes e histórico                                      |
| PATCH  | `/api/entregas/:id/status` | Alteração com `{status, versao}`                          |
| GET    | `/api/entregas/exportar`   | CSV; mesmos filtros da listagem                           |

Exemplo de cadastro (`Content-Type: application/json`):

```json
{
  "destino": "Hospital de Demonstração",
  "medicamento": "Gaze estéril",
  "lote": "LT-001",
  "transportadora": "Parceiro Exemplo",
  "quantidade": 100,
  "custo": 150.5,
  "prioridade": "Alta",
  "prazo": "2026-11-01"
}
```

Respostas relevantes: `201` cadastro, `400` entrada inválida, `404` não encontrado, `409` conflito de versão ou transição inválida, `413` corpo grande e `415` tipo de conteúdo incorreto.

**Mudança da versão inicial:** `/api/entregas` passou de array solto para o contrato acima; frontend e backend foram atualizados juntos. A resposta incompatível (`data.data` sobre um array) da página antiga foi corrigida.

## Configuração

| Variável    | Padrão                             | Uso                                    |
| ----------- | ---------------------------------- | -------------------------------------- |
| `HOST`      | `127.0.0.1`                        | Interface de rede                      |
| `PORT`      | `3000`                             | Porta HTTP                             |
| `DB_PATH`   | `web-system/data/logistics.sqlite` | Caminho do SQLite                      |
| `SEED_DEMO` | `1`                                | Use `0` para criar uma base nova vazia |

O seed é decidido **somente na criação do banco**. Para começar uma operação vazia sem apagar sua demonstração, escolha outro `DB_PATH` e `SEED_DEMO=0`.

PowerShell:

```powershell
$env:DB_PATH = "./web-system/data/operacao.sqlite"
$env:SEED_DEMO = "0"
npm start
```

Linux/macOS:

```bash
DB_PATH=./web-system/data/operacao.sqlite SEED_DEMO=0 npm start
```

## Validação

Instale as dependências de desenvolvimento antes de executar os testes:

```bash
npm ci
npm run check
npm test
```

Os testes cobrem persistência, cálculos, fuso horário, validação, transições, conflitos de atualização, auditoria, contratos HTTP, exportação e proteção contra fórmulas em CSV. Para desenvolver e usar o formatador e os testes da interface, instale as dependências de desenvolvimento com `npm ci`.

## Limites e próximos passos

A versão é adequada para **demonstração local de portfólio**. Não publique a API mutável na internet com dados reais: antes disso, implemente autenticação, autorização, rate limiting, backups e revisão de privacidade. As verificações de origem e CSP são proteções complementares, não autenticação.

Próximos incrementos possíveis: inventário por lote e validade, integração com uma transportadora real, permissões por usuário e análise histórica baseada em um conjunto de dados adequado. Nenhum desses recursos é anunciado como implementado nesta versão.

### Apresentação em entrevista

“Evoluí um protótipo acadêmico para uma aplicação de operações logísticas com API Node.js, persistência SQLite, validação de dados, indicadores e testes automatizados. O projeto demonstra como conecto tecnologia à conferência de informações e ao acompanhamento de processos.”

A evolução da versão 2 foi realizada com auxílio de IA. Revise o código, execute os testes e compreenda as decisões antes de apresentá-las como domínio técnico próprio.

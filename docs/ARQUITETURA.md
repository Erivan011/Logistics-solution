# Arquitetura e limites operacionais

## Camadas

- **Interface React/TypeScript:** mantém seleção, filtros e edições ainda não salvas. Consome a API na mesma origem. Dados do usuário são renderizados como texto pelo React; não há `dangerouslySetInnerHTML`.
- **Contratos Pydantic:** validam limites, tipos, IDs exclusivos, janelas, turnos e referências de produtos.
- **Motor de planejamento:** funções sem acesso ao banco; entrada validada e resultado verificável. Facilita testes e execução independente.
- **Persistência SQLAlchemy:** cenários, snapshots de execuções e eventos. Custos calculados em centavos; pesos em gramas e distâncias em metros.
- **HTTP FastAPI:** endpoints síncronos de cálculo executados no pool de threads, com tempo limitado e no máximo dois cálculos simultâneos por processo.

## Concorrência

A atualização do cenário usa `UPDATE ... WHERE id = ? AND version = ?`. Se nenhuma linha for alterada, a API retorna 409. O incremento de versão e o evento de auditoria são confirmados na mesma transação.

Antes de iniciar o solver, a API captura o payload e a versão, e libera a transação de leitura. Edições posteriores não alteram esse snapshot. A execução registra sua versão de origem, mesmo que o cenário já tenha avançado para outra versão.

A interface remove o plano atual após salvar novos dados. Resultados históricos são exibidos com o snapshot correspondente, evitando interpretar um plano antigo sobre dados editados.

## Confirmação de expedição

`POST /api/runs/{id}/dispatch` exige a versão esperada e uma chave UUID de idempotência. A API recusa planos de outra versão ou data e verifica novamente as restrições e a separação FEFO. Um `UPDATE` condicional incrementa a versão e grava os saldos e a fila atualizados. O registro de expedição, com saldos antes/depois e snapshot dos pedidos, e a auditoria são confirmados na mesma transação. Uma falha reverte todas essas alterações.

As restrições únicas em `run_id` e `idempotency_key` complementam o controle de versão. Uma repetição da mesma chave e dos mesmos argumentos recupera a confirmação anterior; uma chave reutilizada para outra requisição retorna 409. Duas confirmações concorrentes não podem consumir o mesmo estoque da versão de origem. A interface exige conferência explícita, limpa o plano após confirmar e exibe os registros em Expedições.

O registro é administrativo e local ao cenário, sem integração com transportadora. Cenários copiados para simulação têm estoques independentes. Não existe reserva prévia, cancelamento ou devolução de expedição.

## Persistência

SQLite é usado no ambiente local. PostgreSQL é compatível com o esquema SQLAlchemy e o driver psycopg. A inicialização cria tabelas ausentes; evolução de esquema requer uma estratégia de migração adicional. O Compose é um ambiente local de demonstração, não um deployment de produção.

## Segurança implementada

- Bearer token opcional em todos os endpoints de dados, com comparação em tempo constante.
- Validação de origem em operações de escrita; sem CORS aberto.
- Limites de entrada e limite anunciado de corpo HTTP; requisições com Content-Length acima de 256 KiB são recusadas. O limite de corpo não deve ser tratado como defesa completa de transporte para streaming/chunked; configure limites no proxy antes de exposição pública.
- Campos extras recusados nos contratos.
- Exportação CSV neutraliza células iniciadas por fórmulas.
- Arquivos estáticos limitados às pastas compiladas, sem servir o diretório do projeto ou o banco.
- Documentação Swagger com assets locais e política de conteúdo específica para sua inicialização.

## Não implementado

Não há identidade individual, RBAC, multi-tenant, audit log inviolável, fila distribuída, tarefas assíncronas duráveis, backups automatizados ou processo de migração versionado. O token compartilhado protege o acesso básico; não atende necessidades de segregação por usuário ou empresa.

## Verificação

Testes Python exercitam o modelo e a API com banco isolado. Os testes React utilizam JSDOM e API Python real. O build TypeScript produz a interface distribuível. Testes DOM não verificam layout, cores, responsividade visual ou comportamento específico de cada navegador.

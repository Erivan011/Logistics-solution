# Modelo de planejamento e decisões

## Problema

É uma variante do problema de roteamento de veículos com capacidade e janelas de tempo (CVRPTW), com seleção opcional de pedidos e restrições agregadas de estoque.

Cada pedido possui um produto, quantidade inteira, destino, prioridade, janela de chegada e tempo de serviço. Veículos possuem capacidade em peso, compatibilidade térmica, custo fixo, custo por quilômetro e turno. Uma execução representa um dia e uma viagem por veículo.

## Distância e tempo

A distância geográfica vem de Haversine, multiplicada por um fator viário explícito. Metros e gramas são inteiros. O tempo de viagem é arredondado para cima em minutos a partir da velocidade média do cenário. A matriz é simétrica; não modela sentidos de vias, pedágios ou congestionamentos.

O modelo temporal acumula viagem e serviço no ponto de origem de cada arco. Espera é permitida. Há limite de chegada por pedido e limite de retorno por veículo. Um verificador recalcula os horários mais cedo possíveis para a sequência selecionada.

## Restrições

1. Um pedido aparece no máximo uma vez e é atendido por inteiro.
2. Cada rota começa e termina no depósito.
3. Peso agregado por rota não excede a capacidade do veículo.
4. Pedidos refrigerados só usam veículos declarados compatíveis.
5. Chegadas ficam dentro das janelas e o retorno ocorre dentro do turno.
6. A soma das quantidades dos pedidos ativos por produto não excede seu estoque válido.
7. Lotes vencidos são excluídos antes de calcular a disponibilidade.

OR-Tools utiliza uma dimensão de peso, uma dimensão temporal, compatibilidade de veículos e uma restrição linear sobre variáveis de atividade para cada produto. Pedidos podem ser descartados com penalidades explícitas.

## Objetivo e método

O objetivo é custo operacional + penalidades por não atendimento. O custo operacional inclui ativação do veículo e cada arco percorrido. As penalidades priorizam pedidos; não são previsões de prejuízo. Não existe prioridade lexicográfica absoluta entre classes.

A busca usa `PARALLEL_CHEAPEST_INSERTION` e `GUIDED_LOCAL_SEARCH`, limitada por tempo. Também é calculada uma referência determinística: ordenar por prioridade, prazo e ID e incluir cada pedido no final da rota com menor custo incremental viável.

O menor objetivo entre os dois candidatos é selecionado. Se o solver não entregar solução melhor, a referência permanece disponível. Isso garante comparação honesta com a referência usada, sem afirmar optimalidade global. Com outro limite de busca ou outra versão do solver, o resultado pode mudar.

## Alocação FEFO

O solver seleciona pedidos respeitando o estoque agregado por produto. Depois, o separador considera pedidos selecionados em ordem de prioridade, prazo e ID. Para cada um, utiliza lotes válidos por validade e ID. Um pedido pode receber unidades de mais de um lote.

A seleção de lotes não é parte do objetivo de roteamento: qualquer lote válido do mesmo produto tem o mesmo peso por unidade. Essa separação é válida sob essa hipótese. Se lotes tiverem requisitos diferentes de armazenamento, origem ou peso, será preciso ampliar o modelo.

O cálculo não modifica o saldo. A confirmação explícita de expedição usa um fluxo transacional separado: verifica novamente o plano e as alocações, exige a versão atual e a data de hoje, baixa os lotes e retira os pedidos da fila. Chave de idempotência e unicidade por plano impedem repetir a baixa. Não reserva estoque nem aciona transportadoras. Veja o fluxo em [ARQUITETURA.md](ARQUITETURA.md).

## Explicações

Há razões específicas quando um pedido, isoladamente, não possui estoque suficiente, veículo refrigerado, capacidade compatível ou viagem direta dentro de seus horários. Essas são condições verificáveis.

Quando essas condições isoladas são satisfeitas e o pedido continua fora, a mensagem é “competição por estoque, capacidade ou tempo”. O sistema não inventa uma causa única nem apresenta isso como certificado de inviabilidade global.

## Verificação independente

Antes de persistir, o verificador recalcula rotas e rejeita duplicidades, estoque excedido, custos incoerentes, peso fora do limite e horários incompatíveis. Os testes também adulteram resultados propositalmente para comprovar a rejeição.

Um teste pequeno enumera todas as permutações de quatro pedidos em um veículo e compara o custo com o resultado encontrado. Essa prova vale apenas para esse caso de teste, não para o caso geral.

## Referências primárias

- https://developers.google.com/optimization/routing/vrptw
- https://developers.google.com/optimization/routing/cvrp
- https://developers.google.com/optimization/routing/

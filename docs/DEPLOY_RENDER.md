# Hospedagem da aplicação completa no Render

Este repositório inclui um Blueprint `render.yaml` para executar a interface React, a API FastAPI e o solver OR-Tools em um serviço Docker, com PostgreSQL externo ao contêiner. A existência deste arquivo não significa que o serviço já foi publicado.

## Publicar

1. Conecte sua conta Render e autorize o acesso a `Erivan011/Logistics-solution`.
2. Crie um Blueprint a partir da branch `main` e do arquivo `render.yaml`.
3. Confira os dois recursos no plano **Free** antes de concluir. Não é necessário selecionar planos pagos para esta configuração.
4. Aguarde o build Docker e o health check `/api/health`. Use a URL real fornecida pelo Render quando o deploy estiver `live`; o nome do serviço não garante a disponibilidade de um endereço específico.
5. No painel do serviço, consulte o valor gerado para `PLANNER_API_TOKEN`. Na interface da aplicação, use **Token de acesso** para informá-lo. Não publique esse valor no GitHub nem o envie em conversas.

O Render fornece `PORT`; o processo escuta em `0.0.0.0` nessa porta. As URLs `postgres://` e `postgresql://` fornecidas pelo provedor usam automaticamente o driver psycopg v3. Não substitua o banco por SQLite local em um serviço gratuito: esse sistema de arquivos é efêmero.

A demonstração é pública e somente leitura, sem token. O resultado vem de um arquivo fictício fixo; não lê o banco da operação. Consultar e alterar os dados administrativos exige o token compartilhado. Este modelo é apropriado apenas para uma demonstração controlada. Compartilhar o token também concede acesso de escrita; ainda não há conta por visitante nem modo público com isolamento individual. Os dados semeados são fictícios.

## Limites da opção gratuita

- O serviço pode adormecer após 15 minutos sem tráfego e levar cerca de um minuto para voltar.
- O PostgreSQL gratuito expira em 30 dias e não é uma solução de portfólio permanente. Exporte e migre os dados antes do vencimento ou escolha outro banco; um plano pago exige decisão separada.
- Há limites mensais de uso e build. Consulte o painel antes de adicionar uma forma de pagamento ou mudar de plano.
- Reinícios do serviço não apagam os registros no PostgreSQL enquanto o banco permanecer ativo. O sistema de arquivos do contêiner não deve receber dados que precisem persistir.

Referências oficiais: [Web services](https://render.com/docs/web-services), [Blueprint](https://render.com/docs/blueprint-spec) e [limites Free](https://render.com/docs/free).

## Verificação após publicar

- Acessar a URL HTTPS e carregar os assets da interface.
- Sem token, confirmar que `/api/scenarios` responde 401 e `/api/health` responde 200.
- Informar o token na interface; otimizar o cenário demonstrativo, editar uma cópia e registrar uma expedição da data atual.
- Recarregar para conferir a persistência do histórico e dos saldos.

O Dockerfile e o Blueprint devem ser validados pelo provedor no primeiro deploy. Testes locais do Python e da interface não substituem essa verificação. A configuração automática publica futuros commits de `main` quando os checks do GitHub passam.

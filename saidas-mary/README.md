# Saídas Mary — configuração gratuita

Aplicativo separado do Aloha, com clientes, vendas de R$ 10, leitura de folhas pelo Gemini e OCR de reserva, pagamentos e cobranças. Mantém o layout rosa.

## Publicação

[Configurar no Render](https://render.com/deploy?repo=https://github.com/alicefrancolisboa-arch/sistema/tree/saidas-mary)

O Blueprint da raiz cria somente o novo serviço `saidas-mary`, na branch `saidas-mary`, com plano **free**, sem disco pago. O serviço Aloha e a branch main permanecem intactos.

1. Crie um banco no plano Free do Turso e um token com leitura e escrita.
2. Abra o link acima, usando um NOVO Blueprint.
3. TURSO_DATABASE_URL já contém o endereço do banco informado pela proprietária. TURSO_AUTH_TOKEN recebe o token criado no Turso.
4. GEMINI_API_KEY recebe a chave Gemini da proprietária. Ela fica somente no Render; nunca no GitHub ou APK. A gratuidade da hospedagem não altera as cotas e cobranças da conta Gemini.
5. O Render gera APP_PASSWORD; consulte essa variável em Environment para obter a senha do aplicativo.
6. Confirme que o serviço está no plano Free e sem disco antes de publicar. Após ficar Live, abra o endereço HTTPS do NOVO serviço.

O Render gratuito pode suspender o serviço enquanto não é usado; a primeira abertura pode demorar. Os dados ficam no Turso, respeitando as cotas do plano gratuito. Se o banco estiver indisponível, o app informa erro, em vez de fingir que salvou ou mostrar uma loja vazia.

## Armazenamento

STORAGE_DRIVER=turso usa o banco remoto como fonte oficial. Cada operação lê a versão atual, aplica as regras em SQLite isolado na memória e salva com comparação de versão. Isso evita perda de dados entre dois aparelhos. Vendas e pagamentos preservam identificadores de repetição; os totais das folhas e os hashes de fotos também são preservados. Uma restauração mantém no banco a versão anterior em previous_payload.

Nenhum dado depende dos arquivos temporários do Render. Sem as credenciais do Turso, o servidor não inicia nesse modo. Fotos, tokens e chaves Gemini não são armazenados no registro das vendas.

Esta versão atende uma pequena loja e limita o registro de dados a 8 MB. Ao atingir o limite, novos lançamentos são bloqueados com aviso; os dados existentes continuam disponíveis para exportação. Faça backups periódicos em Ajustes.

O banco do computador não é enviado automaticamente. Para migrar dados existentes, exporte o backup no app local e importe no novo servidor vazio.

## Android

Baixe `dist/Saidas-Mary.apk` ou `/baixar-apk` no novo servidor. Na primeira abertura, informe uma vez o endereço HTTPS atribuído ao Saídas Mary pelo Render. Depois ele fica salvo. Com o serviço publicado, o computador pode ficar desligado. O APK não contém chaves; o app Aloha é separado.

## Verificações

Node 24: `npm ci --ignore-scripts` e `npm test`. A suíte cobre as regras financeiras, revisão e repetição de fotos, autenticação e armazenamento remoto com falhas e concorrência simuladas. A conexão real com Turso deve ser validada após cadastrar o token no Render.

Sem STORAGE_DRIVER=turso, o desenvolvimento local continua usando SQLite. Configure .env a partir de .env.example. Não publique .env, tokens, senhas, bancos ou backups.

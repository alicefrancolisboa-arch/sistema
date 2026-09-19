# Saídas Mary

Controle separado do Aloha: clientes, vendas de R$ 10, leitura de folhas pelo Gemini com OCR de reserva, pagamentos e cobranças. Layout rosa, inspirado na organização do painel de referência.

## Publicar sem alterar o Aloha

Este aplicativo está em `saidas-mary/`, na branch `saidas-mary`. O Aloha e sua configuração permanecem intactos. Não altere o serviço `sistema-5huz` e não troque a branch dele.

No Render, crie um **novo Blueprint**, selecione este repositório e a branch `saidas-mary`. O arquivo `render.yaml` da raiz cria somente o novo serviço Saídas Mary, com seu próprio disco. Confira o custo do plano de 0,5 CPU / 512 MB e do disco de 1 GB antes de confirmar a criação; essa configuração não é gratuita.

Informe a chave Gemini no campo GEMINI_API_KEY do Render. A chave não está no repositório nem no APK. O Render gera APP_PASSWORD; consulte essa variável em Environment para obter a senha de entrada. Use o endereço HTTPS atribuído ao NOVO serviço, e não o endereço do Aloha.

O novo serviço usa Node 24, `npm ci --ignore-scripts`, `npm start`, HOST=0.0.0.0, a porta PORT fornecida pelo Render e DATA_DIR=/var/data/saidas-mary. O disco persistente é montado em /var/data. `/healthz` é a verificação de saúde, sem informações de clientes. Cookies de login usam HTTPS.

O banco local do computador não é enviado automaticamente. Se houver dados, use Ajustes → Exportar backup no app local. No novo servidor vazio, importe esse arquivo em Ajustes. Guarde uma cópia antes de qualquer restauração.

## Android

Baixe `dist/Saidas-Mary.apk` ou abra `/baixar-apk` no novo servidor. O APK usa o mesmo identificador e assinatura da versão Mary anterior para permitir atualização. Na primeira abertura desta atualização, informe uma vez o endereço HTTPS do novo serviço. Isso remove a dependência do IP antigo. Depois, o endereço fica salvo. O aplicativo Aloha é separado.

O endereço definitivo só existe após o Render criar o novo serviço. Nenhum endereço hipotético foi gravado no APK. Com o serviço online, o PC pode ficar desligado. É necessária conexão à internet.

## Regras e leitura

Cada traço vale R$ 10; quadrado fechado vale 4; quadrado com diagonal vale 5. Compras até dia 19 vencem dia 20; a partir de dia 20, no quinto dia útil do mês seguinte. Considera segunda a sexta e os feriados cadastrados para Piracicaba. Fotos passam por revisão antes de salvar e somente o aumento de contagem é somado.

O OCR não garante contagem de manuscritos: se Gemini estiver indisponível, confira nomes e preencha quantidades. Dados não são inventados nem gravados sem confirmação. Clientes recebem mensagens pelo WhatsApp somente quando você abre/envia.

## Verificação local

`npm ci --ignore-scripts`, depois `npm test`. `npm start` abre em http://127.0.0.1:3210; configure .env a partir de .env.example. Não publique .env, chaves, bancos ou backups.

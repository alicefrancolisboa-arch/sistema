# Aloha Casa do Açaí

Sistema local de compras, receitas, precificação, vendas e estoque.

## Como iniciar

1. Instale Python 3.11+.
2. No terminal dentro desta pasta: `pip install -r requirements.txt`
3. Crie um arquivo `.env` com `GEMINI_API_KEY=sua_chave` (a chave fornecida já foi guardada localmente e não é versionada).
4. Execute: `python app.py`
5. Abra `http://localhost:5000`.

O Gemini é usado para ler fotos das notas fiscais. Se estiver indisponível, o sistema tenta o OCR local quando Tesseract estiver instalado.

## Dados permanentes em producao

Os dois servicos Render devem usar o mesmo banco Turso, com `STORAGE_DRIVER=turso`,
`TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` nas variaveis protegidas do provedor.
Nunca versionar a chave. O aplicativo recusa iniciar no Render sem Turso.

Cada requisicao carrega uma copia consistente do banco remoto. Uma gravacao so
retorna sucesso depois da confirmacao remota; revisoes impedem que duas janelas
sobrescrevam alteracoes concorrentes. Falhas de rede retornam erro, sem recorrer
ao disco temporario. `casa_state.previous_payload` preserva a versao imediatamente
anterior. O limite atual de cada snapshot SQLite e 8 MiB; ao atingir esse limite,
novas gravacoes sao recusadas com uma mensagem, preservando os dados existentes.

`GET /api/storage-status` confirma o armazenamento e a revisao acessivel.
A inicializacao aplica somente migracoes aditivas. A limpeza historica de
`maintenance.py` nao e mais executada na inicializacao.

Validacao: `python -m unittest discover -s tests -q`. Antes de publicar, guardar
uma copia do estado remoto e dos registros dos dois enderecos; depois verificar
um lancamento de teste entre os enderecos e apos reiniciar o servico.

## Contingência Cloudflare

`worker.py`, `wrangler.jsonc` e `pyproject.toml` permitem publicar o Flask no
Cloudflare Workers com o mesmo banco Turso do Render. Cadastre `APP_PASSWORD`,
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` e `GEMINI_API_KEY` como secrets no
Cloudflare. Não copie essas chaves para o GitHub.

O Worker serve as telas estáticas no Cloudflare e executa todas as APIs pelo
Flask. Como os dois servidores usam o mesmo snapshot Turso, lista de compras,
estoque, notas, vendas e financeiro permanecem iguais no computador e no app.

# Aloha Casa do Açaí

Sistema local de compras, receitas, precificação, vendas e estoque.

## Como iniciar

1. Instale Python 3.11+.
2. No terminal dentro desta pasta: `pip install -r requirements.txt`
3. Crie um arquivo `.env` com `GEMINI_API_KEY=sua_chave` (a chave fornecida já foi guardada localmente e não é versionada).
4. Execute: `python app.py`
5. Abra `http://localhost:5000`.

O Gemini é usado para ler fotos das notas fiscais. Se estiver indisponível, o sistema tenta o OCR local quando Tesseract estiver instalado.

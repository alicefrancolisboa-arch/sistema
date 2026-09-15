# Implantação segura no GitHub e Render

## Render

1. Crie um novo Web Service a partir deste repositório com diretório raiz `aloha-casa-do-acai/concurso-saltinho/server` quando o projeto estiver dentro do repositório existente. Em repositório próprio, o diretório raiz é `server`.
2. No Render, inclua `GEMINI_API_KEY` como variável secreta. Nunca cole a chave no código, APK ou GitHub.
3. Após implantar, teste `https://SEU-SERVICO.onrender.com/health`.
4. Atualize `APP_URL` em `app/build.gradle.kts` com a URL final HTTPS e gere novo APK.

## GitHub

1. Crie um repositório privado e envie esta pasta sem mudar o `.gitignore`.
2. O GitHub Actions produz o APK de teste a cada envio para `main`.
3. Para APK de distribuição, crie keystore e guarde seus dados exclusivamente como GitHub Secrets.

## Atualizações

Mudanças no servidor e nos simulados aparecem no Android assim que o Render atualiza. APK novo só é necessário ao modificar código nativo, ícone, permissões ou URL do servidor.

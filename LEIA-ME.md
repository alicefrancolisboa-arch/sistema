# Tempo de Crescer — 1.1.0

APK Android e painel de responsáveis para a família Borges Franco.

- APK: https://tempo-de-crescer.onrender.com/Tempo-de-Crescer.apk
- Computador: https://tempo-de-crescer.onrender.com/painel
- Download e instruções: https://tempo-de-crescer.onrender.com

## Como usar

1. Instale o mesmo APK nos celulares dos adultos e das crianças. Quem já instalou a 1.0 deve instalar esta 1.1 por cima, sem desinstalar.
2. No aparelho da criança, escolha Criança. Entre em Responsável usando o PIN definido pelo usuário. Selecione os aplicativos, configure limite e descanso e ative acesso ao uso e acessibilidade.
3. Gere o código em Conectar à distância. No celular do adulto, escolha Responsável, entre com o PIN e use Adicionar criança e aparelho. Repita para as cinco crianças.
4. No PC, abra o painel e informe um código do aparelho da criança ou um convite gerado por um responsável já vinculado, junto com o PIN. O código é de uso único e vale dez minutos.
5. Para outro adulto administrar a mesma família, no painel do primeiro responsável use Ajustes → Convidar outro responsável. No outro celular, use Entrar em família existente.

## Funções

Cada criança tem regras, tarefas e bônus separados. Mais de um aparelho pode compartilhar um perfil; a soma do uso entre aparelhos depende de internet.

As tarefas têm nome e bônus configuráveis. A criança solicita a conclusão; o adulto aprova usando o PIN. Uma tarefa rende uma vez por dia. Os bônus expiram à meia-noite, no fuso de São Paulo.

Em Ajustes, o adulto pode bloquear agora, liberar o bloqueio manual ou abrir Liberação especial. A liberação especial pode abranger todos os aplicativos ou apenas os escolhidos, por um período de até 1440 minutos ou até o adulto encerrar. Ela ignora limite, descanso e bloqueio manual somente nos aplicativos escolhidos. Quando expira ou é encerrada, voltam as regras anteriores. Bloquear agora cancela qualquer liberação especial existente.

## Atualizações pelo servidor

A versão 1.1 inclui um painel HTML/JS assinado digitalmente. Ao abrir o painel, o aplicativo busca uma versão mais nova em /mobile-bundle.json. Só aceita assinatura válida, versão mais nova e compatibilidade com sua parte nativa. Mantém a última versão válida no armazenamento privado. Uma atualização encontrada fica pronta para a próxima abertura; Buscar atualização do painel aplica imediatamente.

Telas, visual, tarefas e lógica do servidor podem ser atualizados sem reinstalar o APK. Mudanças em permissões, no serviço de acessibilidade ou em funções nativas novas continuam exigindo uma atualização do APK. Não há promessa de atualização silenciosa do código nativo do Android.

Para publicar nova interface: editar server/mobile.html, executar tools/build-bundle.mjs com número de versão maior e o executável Java, testar e publicar server/mobile-bundle.json junto com os arquivos do servidor. Nunca disponibilizar a chave privada de assinatura.

## Infraestrutura

Render gratuito: serviço tempo-de-crescer, id srv-daur26h42hec73fhp1gg. Branch exclusiva tempo-de-crescer no repositório alicefrancolisboa-arch/sistema, raiz server. A branch principal do sistema financeiro não foi alterada.

Banco Turso exclusivo tempo-de-crescer. Persistência por revisão otimista, com serialização das atualizações do servidor. Produção exige as variáveis TURSO_DATABASE_URL e TURSO_AUTH_TOKEN. FAMILY_PIN_VERIFIER guarda somente o verificador derivado do PIN para o painel web. Nenhuma dessas credenciais é publicada no código ou no APK.

A página web usa cookie HttpOnly/Secure/SameSite, pareamento de uso único e validação do PIN nos comandos. O APK conserva os tokens no armazenamento privado, sem exportá-los para o JavaScript. O brasão foi reaproveitado da referência autorizada pelo usuário, Finanças Família Borges Franco.

## Verificações e limites

- 27 testes de domínio, autenticação web, perfis, tarefas, convites, liberações e assinatura do painel.
- 22 verificações Java de limites, descanso, uso e expiração das liberações.
- APK release assinado; compilação e lint aprovados, sem erros.
- Painel web testado no navegador com cinco perfis fictícios, login por convite e PIN e liberação individual por prazo.
- Não houve teste do bloqueio em aparelho físico: nenhum dispositivo estava conectado por ADB.
- O aplicativo não impede desinstalação ou revogação das permissões do Android. Telefone, configurações do sistema e apps não selecionados continuam disponíveis.
- Sem internet, valem as últimas regras recebidas; comandos remotos novos e o total de outros aparelhos aguardam sincronização.
- No plano gratuito do Render, o serviço pode demorar para iniciar após inatividade e está sujeito à franquia compartilhada da conta.
- Alterar o relógio do aparelho pode afetar a contagem local. Use data e fuso automáticos de São Paulo.
- Limpar os dados do aplicativo remove vínculos; não há recuperação automática da conta de responsável. Cadastre outro adulto como alternativa.

## Arquivos privados

Nunca publicar tempo-de-crescer.jks, signing.properties, app/src/main/assets/bootstrap-pin.json ou arquivos de ambiente. O PIN não aparece em texto no projeto publicado. Preserve a chave de assinatura para futuras versões do APK e do painel.

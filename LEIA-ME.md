# Tempo de Crescer — 1.4.0

APK Android e painel de responsáveis para a família Borges Franco.

- APK: https://tempo-de-crescer.onrender.com/Tempo-de-Crescer.apk
- Computador: https://tempo-de-crescer.onrender.com/painel
- Download e instruções: https://tempo-de-crescer.onrender.com

## Como usar

1. Instale o mesmo APK nos celulares dos adultos e das crianças. Quem já instalou a 1.0 deve instalar esta 1.1 por cima, sem desinstalar.
2. No aparelho da criança, escolha Criança. Entre em Responsável usando o PIN definido pelo usuário. Selecione os aplicativos, configure limite e descanso e ative acesso ao uso e acessibilidade.
3. Gere o código em Conectar à distância. No celular do adulto, escolha Responsável, entre com o PIN e use Adicionar criança e aparelho. Repita para as cinco crianças.
4. No PC, abra o painel e entre somente com o PIN. Os menus ficam disponíveis mesmo sem crianças cadastradas. Em Aparelhos, adicione cada criança com o código gerado no celular dela (uso único, dez minutos). Selecione o perfil para configurar horas, tarefas e bônus. A família do painel é preservada entre acessos.
5. Para outro adulto administrar a mesma família, no painel do primeiro responsável use Ajustes → Convidar outro responsável. No outro celular, use Entrar em família existente.

## Funções

Cada criança tem regras, tarefas e bônus separados. Mais de um aparelho pode compartilhar um perfil; a soma do uso entre aparelhos depende de internet.

As tarefas têm nome e bônus configuráveis. A criança solicita a conclusão; o adulto aprova usando o PIN. Uma tarefa rende uma vez por dia. Os bônus expiram à meia-noite, no fuso de São Paulo.

Em Ajustes, o adulto pode bloquear agora, liberar o bloqueio manual ou abrir Liberação especial. A liberação especial pode abranger todos os aplicativos ou apenas os escolhidos, por um período de até 1440 minutos ou até o adulto encerrar. Ela ignora limite, descanso e bloqueio manual somente nos aplicativos escolhidos. Quando expira ou é encerrada, voltam as regras anteriores. Bloquear agora cancela qualquer liberação especial existente.

## Relatórios

O menu Relatórios mostra o uso, limite, bônus e tarefas aprovadas de cada criança. Guarda até 30 dias registrados a partir desta atualização, sem inventar uso para dias sem sincronização.

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
- Em instalação comum, o aplicativo não impede desinstalação ou revogação das permissões do Android. A versão 1.3 inclui preparação para proteção em aparelho gerenciado; a instalação sozinha não ativa essa proteção. Telefone, configurações do sistema e apps não selecionados continuam disponíveis.
- Sem internet, valem as últimas regras recebidas; comandos remotos novos e o total de outros aparelhos aguardam sincronização.
- No plano gratuito do Render, o serviço pode demorar para iniciar após inatividade e está sujeito à franquia compartilhada da conta.
- Alterar o relógio do aparelho pode afetar a contagem local. Use data e fuso automáticos de São Paulo.
- Limpar os dados do aplicativo remove vínculos; não há recuperação automática da conta de responsável. Cadastre outro adulto como alternativa.

## Arquivos privados

Nunca publicar tempo-de-crescer.jks, signing.properties, app/src/main/assets/bootstrap-pin.json ou arquivos de ambiente. O PIN não aparece em texto no projeto publicado. Preserve a chave de assinatura para futuras versões do APK e do painel.

## Atualização 1.2

Instale a versão 1.2 por cima nos aparelhos das crianças e dos responsáveis, sem desinstalar. A lista de apps usa os ícones reais do Android e permite Selecionar tudo/Desmarcar tudo, no aparelho e no painel. A lista enviada tem até 300 apps com tela inicial; apps essenciais ficam excluídos.

O app em primeiro plano é enviado a cada aproximadamente 15 segundos quando a acessibilidade está ativa. O painel web atualiza as telas de acompanhamento a cada 15 segundos. Rede, Android e hospedagem podem atrasar esse intervalo. Após 90 segundos sem dado de atividade, o painel indica informação desatualizada. Não captura imagens da tela, mensagens ou conteúdo dos apps.

Excluir criança pede confirmação, remove o perfil da lista e desativa suas regras na próxima sincronização dos aparelhos. Perfis excluídos podem ser restaurados; o controle fica pausado até o responsável revisar e reativar as regras. Um aparelho removido também pode gerar novo código e ser vinculado novamente.

No menu Aplicativos, escolha o perfil e marque a lista. Bloquear seleção e Aplicar limite substituem a lista controlada (desmarcados ficam livres). Liberar seleção cria uma liberação sem prazo apenas nos apps selecionados já controlados. As permissões são mantidas no Android.

## Correção 1.2.1
A lista local mostra apps livres e controlados. O servidor mantém os apps já conhecidos mesmo antes da chegada do catálogo. Liberar seleção permite 15, 30, 60, 120 minutos ou até encerrar; após o prazo voltam as regras anteriores. O app permanece na lista para ser bloqueado novamente.

## Proteção contra desinstalação (1.3)

Consulte PROTECAO-DESINSTALACAO.md. A área nativa do responsável indica se o aparelho foi configurado como device owner, confirma a política de bloqueio e permite encerrar o gerenciamento com PIN novamente e confirmação. Não há ativação ou redefinição automática. Requer configuração assistida do celular da criança; nenhum dispositivo estava conectado para testar.

## Apps livres — versão 1.4.0

No menu Aplicativos, selecione os apps e use Livre sem descontar tempo. Eles permanecem no catálogo, separados dos apps com controle de tempo. A alteração vale quando o aparelho recebe a configuração.

A liberação temporária também não consome a cota enquanto estiver válida. O Android mantém um histórico local das regras do dia: encerrar a liberação não cobra novamente os intervalos que foram livres. O tempo anterior à liberação continua contado. A migração não reconstrói liberações históricas anteriores à versão 1.4.

Instale o APK 1.4.0 por cima do anterior em todos os aparelhos das crianças. A interface continua atualizando pelo servidor; este ajuste exige atualização nativa da contagem. Não desinstale para atualizar.

Validação: 38 testes do servidor, 22 verificações Java existentes, 13 verificações de contagem histórica, assembleRelease e lintRelease aprovados. Fluxo visual validado com perfil fictício. Sem teste em aparelho físico.


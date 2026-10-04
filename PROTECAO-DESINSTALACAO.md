# Proteção contra desinstalação — versão 1.3

Apenas instalar o APK não ativa a proteção. O Android precisa reconhecer Tempo de Crescer como proprietário do dispositivo (device owner), no celular da criança. Não configure o celular pessoal do responsável nesse modo.

## Antes de ativar

- Instalar a versão 1.3 por cima da versão anterior.
- Conectar o celular por USB e autorizar depuração USB no próprio aparelho.
- Avaliar modelo, versão do Android, contas, outros administradores e possibilidade de configuração sem apagar dados. Não remover contas nem redefinir o aparelho sem uma decisão explícita do responsável e backup.
- Nenhuma proteção foi ativada automaticamente; nenhum aparelho estava visível por ADB durante a preparação.

## Configuração assistida pelo computador

A documentação Android oferece o comando abaixo para desenvolvimento de aparelhos totalmente gerenciados sem contas. Ele pode ser recusado em um aparelho já configurado. Use somente após verificar o dispositivo e ter autorização do responsável:

```text
adb -s SERIAL_DO_CELULAR shell dpm set-device-owner br.com.tempodecrescer/.FamilyAdminReceiver
```

Nunca use um serial genérico com vários aparelhos conectados. Não executar redefinição de fábrica como tentativa automática. Se o Android recusar, guardar o erro e avaliar o aparelho; não contornar proteções.

Depois da configuração, abrir Ajustes do aparelho → Responsável → Proteção contra desinstalação e confirmar a proteção com o PIN. O app verifica isDeviceOwnerApp e usa setUninstallBlocked apenas para seu próprio pacote. Não bloqueia a desinstalação dos outros apps, não esconde seu ícone e não intercepta as configurações do Android.

## Remoção autorizada

No próprio celular, entrar na mesma área e escolher Autorizar remoção com meu PIN. Um PIN novo é exigido mesmo quando o responsável já desbloqueou a tela. Depois da confirmação, o app retira sua política e encerra o gerenciamento; então a desinstalação é feita pelo Android. Reativar exige nova configuração assistida.

O encerramento sem apagar dados usa clearDeviceOwnerApp, API descontinuada que a documentação Android recomenda apenas para testes. A compatibilidade precisa ser validada no modelo antes do uso diário. Este projeto não aplica outras políticas de proprietário, e nunca chama wipeData. Se houver falha ao encerrar e o app continuar proprietário, o bloqueio é reaplicado. Não prometa proteção absoluta contra root, ferramentas técnicas ou redefinição externa.

## Validação ainda necessária no aparelho

Confirmar: tentativa de desinstalação negada nas configurações; reinicialização preserva proteção; PIN errado não permite remoção; PIN correto e confirmação permitem encerrar; atualização assinada por cima continua funcionando. Compilação e lint não substituem esses testes.

Fontes oficiais:
- https://developer.android.com/work/dpc/dedicated-devices/cookbook
- https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setUninstallBlocked(android.content.ComponentName,java.lang.String,boolean)
- https://developer.android.com/reference/android/app/admin/DevicePolicyManager#clearDeviceOwnerApp(java.lang.String)

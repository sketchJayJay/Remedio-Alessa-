# Remédios da Alessa

Versão simples e mobile-first.

## Como usar
1. Informe o horário.
2. Digite o nome do remédio e, se quiser, a dose.
3. Toque em **Adicionar horário**.
4. Escolha a data de início e a duração do tratamento.
5. Toque em **Ativar lembretes** e adicione o arquivo gerado ao calendário do celular.

O calendário é a forma usada para avisar no horário mesmo com o app fechado. Se o navegador permitir notificações, o app também pode avisar enquanto estiver aberto.

## Coolify
O `Dockerfile` já está pronto. Faça deploy como Dockerfile e exponha a porta 80.


## v10 - correção da configuração no celular
Os campos de horário não são mais reescritos a cada atualização automática do app. Isso evita o seletor de horário fechar, voltar ou trocar sozinho durante a configuração no iPhone/Android.

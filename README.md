# Remédios da Alessa v12 - iPhone com app fechado

Esta versão usa Web Push no iPhone. Depois de instalada na Tela de Início e autorizada, a notificação pode aparecer na Tela Bloqueada mesmo com o app fechado.

## Como subir no Coolify

- Build Pack: Dockerfile
- Porta: 3000
- Base Directory: /
- Volume persistente: monte um volume em `/data`
- HTTPS: obrigatório para service worker e push
- Não precisa configurar VAPID manualmente. O servidor gera as chaves na primeira execução e guarda em `/data/state.json`.

IMPORTANTE: o volume `/data` precisa persistir entre redeploys. Se ele for apagado, as chaves de push mudam e será necessário ativar os avisos novamente no iPhone.

## Como ativar no iPhone

1. Abra o endereço HTTPS do app no Safari.
2. Toque em Compartilhar e depois em Adicionar à Tela de Início.
3. Abra o app pelo ícone criado na Tela de Início.
4. Configure os horários e toque em Salvar horários.
5. Toque em Ativar avisos e permita notificações.
6. Uma notificação de teste será enviada.
7. Em Ajustes > Notificações, deixe Sons habilitado para o app.

## Limite do iPhone

Web Push usa a notificação padrão do iPhone. Ela pode aparecer na tela bloqueada com o app fechado. Porém não é um Critical Alert: modo Silencioso ou alguns modos de Foco podem impedir o som. Critical Alerts exigem um app nativo e uma autorização especial da Apple.

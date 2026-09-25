# Remédios da Alessa v11

Correção definitiva da configuração de horários:
- os campos de horário não são mais reescritos por nenhuma atualização automática;
- o que estiver sendo digitado fica protegido em sessionStorage até salvar;
- o ciclo de 15 segundos atualiza somente o status/alarme;
- service worker atualizado para v11 com estratégia network-first e limpeza dos caches antigos;
- CSS e JS usam versão na URL para evitar arquivos antigos presos no navegador/PWA.

## Coolify
Build Pack: Dockerfile
Porta: 80
Base Directory: /
Sem variáveis de ambiente e sem volume.

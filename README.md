# Command Center · Fazer e Cobrar

App local de tarefas (Regra 1-3-5) sincronizado com o Google Tasks, com o visual do **Scorza Design**.

## Arquivos

| Caminho | O que é |
|---|---|
| `command-center.html` | O app pronto. Abra no navegador ou hospede como página estática. |
| `Code.gs` | A ponte no Google Apps Script: sincroniza o Google Tasks e faz a triagem com o Gemini. |
| `src/app.src.html` | Fonte do app (layout, lógica). Edite aqui. |
| `design/` | Scorza Design: `tokens.json`, `bundle.css` e ícones Lucide. |
| `tools/build.py` | Junta fonte + design em `command-center.html`. |

Depois de editar `src/` ou `design/`, rode:

```bash
python3 tools/build.py
```

## Instalar o Apps Script

1. Em `script.google.com`, crie um **Novo projeto**, cole o `Code.gs` e salve.
2. Em **Serviços (+)**, adicione **Google Tasks API**.
3. Rode a função `setup` e autorize. O token aparece no **Registro de execução** e em **Configurações do projeto → Propriedades do script → `CC_TOKEN`**.
4. (IA) Em **Propriedades do script**, adicione `GEMINI_API_KEY` com a chave do Google AI Studio. Opcional: `GEMINI_MODEL` (padrão `gemini-3.8-flash`).
5. **Implantar → Nova implantação → App da Web**. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**.
6. No app, em **Configurações**, cole a URL `/exec` e o token.

Para atualizar o script: **Implantar → Gerenciar implantações → ✏️ → Nova versão** (a URL não muda).
Para testar a IA no editor: rode a função `testarIA`.

## Segurança

- **Nunca** coloque no repositório o token (`CC_TOKEN`) nem a chave do Gemini. Eles ficam nas Propriedades do script e no navegador de cada aparelho.
- O HTML não tem segredos: quem abrir a página sem URL e token vê um app vazio.
- No plano gratuito da API do Gemini, o Google pode usar o conteúdo enviado para melhorar produtos.

## Como funciona a triagem

1. **IA no Apps Script** (se `GEMINI_API_KEY` existir): Gemini 3.8 Flash, com o 3.5 Flash-Lite como reserva.
2. **IA no navegador** (se houver chave nas Configurações e nenhum Apps Script).
3. **Motor local**: palavras-chave, sem internet.

Nos três casos o app aplica a sua memória: cada correção de categoria na prévia (ou ao mover uma tarefa) vira regra, e os últimos 30 exemplos vão para a IA como referência.

## Offline

Tudo fica salvo no navegador. Sem internet, o app continua funcionando e mostra quantas mudanças faltam enviar; quando a conexão volta, ele sincroniza sozinho. Use **Configurações → Backup → Exportar JSON** para guardar uma cópia.

/**
 * COMMAND CENTER ⇄ GOOGLE TASKS — Ponte via Google Apps Script (v3)
 *
 * Novidades da v3:
 *  - setup() mostra o TOKEN antes de qualquer outra coisa (antes ele sumia se o Tasks desse erro).
 *  - Triagem com IA no servidor: a chave do Gemini fica guardada aqui, nunca no navegador.
 *  - Modelo padrão gemini-3.8-flash, com modelo reserva se o principal falhar.
 *  - A triagem recebe exemplos das suas correções, para classificar do seu jeito.
 *
 * COMO INSTALAR (logado na conta do trabalho):
 *  1. script.google.com → Novo projeto → apague o código padrão e cole este arquivo. Salve (Ctrl+S).
 *  2. Menu lateral "Serviços" (+) → Google Tasks API → Adicionar.
 *  3. No topo, escolha a função "setup" → ▶ Executar → autorize.
 *     O token aparece no "Registro de execução" (painel que abre embaixo).
 *     Também fica visível em ⚙️ Configurações do projeto → Propriedades do script → CC_TOKEN.
 *  4. (Opcional, para a IA) Em ⚙️ Configurações do projeto → Propriedades do script → Adicionar:
 *       GEMINI_API_KEY = sua chave do Google AI Studio
 *       GEMINI_MODEL   = gemini-3.8-flash   (opcional; esse já é o padrão)
 *  5. Implantar → Nova implantação → tipo "App da Web":
 *       Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *     Copie a URL que termina em /exec.
 *  6. No app: Configurações → cole a URL e o TOKEN → Testar conexão.
 *
 * Ao alterar este código depois: Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão.
 * (Assim a URL continua a mesma.)
 */

var LIST_NAME = 'Command Center';
var DEFAULT_MODEL = 'gemini-3.8-flash';
var FALLBACK_MODEL = 'gemini-3.5-flash-lite';

/** Rode uma vez: gera o token, mostra e depois prepara a lista. */
function setup() {
  var token = getOrCreateToken_();
  Logger.log('TOKEN (cole no app): ' + token);
  try {
    var listId = getListId_();
    Logger.log('Lista do Google Tasks pronta: "' + LIST_NAME + '" (' + listId + ')');
  } catch (err) {
    Logger.log('O token foi criado, mas a lista não: ' + err.message);
    Logger.log('Confira se o serviço "Google Tasks API" foi adicionado em Serviços (+) e rode setup de novo.');
  }
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  Logger.log(key ? 'IA: chave do Gemini encontrada (' + modelName_() + ').'
                 : 'IA: sem chave do Gemini. A triagem vai usar o motor local do app.');
}

/** Só mostra o token atual. */
function mostrarToken() {
  Logger.log('TOKEN (cole no app): ' + getOrCreateToken_());
}

/** Se o token vazar, rode esta função e cole o novo token no app. */
function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('CC_TOKEN');
  mostrarToken();
}

/** Testa a IA direto no editor: escolha "testarIA" e ▶ Executar. */
function testarIA() {
  var r = triage_('Aprovar peça da AMO; cobrar Juliana sobre o roteiro de quinta; montar proposta Educbank', []);
  Logger.log(JSON.stringify(r, null, 2));
}

/** Abrir a URL no navegador só mostra que a ponte está no ar (sem dados). */
function doGet() {
  return json_({ ok: true, service: 'command-center-bridge', version: 3 });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var token = PropertiesService.getScriptProperties().getProperty('CC_TOKEN');
    if (!token || req.token !== token) return json_({ ok: false, error: 'unauthorized' });

    if (req.action === 'triage') {
      return json_(triage_(String(req.text || ''), req.examples || []));
    }

    var listId = getListId_();

    switch (req.action) {
      case 'ping':
        return json_({
          ok: true, list: LIST_NAME, version: 3,
          user: Session.getEffectiveUser().getEmail(),
          ai: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'),
          model: modelName_()
        });

      case 'list':
        return json_({ ok: true, tasks: listAll_(listId) });

      case 'batch':
        var ops = (req.ops || []).slice(0, 100);
        return json_({ ok: true, results: ops.map(function (o) { return op_(listId, o); }) });

      case 'clearCompleted':
        Tasks.Tasks.clear(listId); // oculta as concluídas da lista (fica no histórico do Google)
        return json_({ ok: true });

      default:
        return json_({ ok: false, error: 'Ação desconhecida: ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ---------- triagem com Gemini ---------- */

var CATEGORIES = ['mit', 'quick', 'medium', 'followup', 'backlog'];

function triage_(text, examples) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'no_ai_key' };
  text = text.slice(0, 12000);
  if (!text.trim()) return { ok: false, error: 'Texto vazio' };

  var ex = (examples || []).slice(-30).filter(function (x) {
    return x && x.text && CATEGORIES.indexOf(x.category) >= 0;
  }).map(function (x) {
    return '- "' + String(x.text).slice(0, 140) + '" → ' + x.category + (x.owner ? ' (owner: ' + x.owner + ')' : '');
  }).join('\n');

  var prompt =
    'Você organiza demandas de um gerente de projetos de uma agência de publicidade.\n' +
    'Divida o texto em tarefas independentes e acionáveis (verbo no infinitivo, curtas, em português) e classifique cada uma:\n' +
    '- "mit": entrega estratégica de alto impacto (no máximo 1)\n' +
    '- "quick": resolve em menos de 5 minutos (aprovar, responder, dar ok, encaminhar)\n' +
    '- "medium": execução ou revisão de 30 a 45 minutos\n' +
    '- "followup": depende de outra pessoa (cobrar, aguardar, pedir para alguém). Preencha "owner" com o primeiro nome da pessoa.\n' +
    '- "backlog": ideia ou demanda sem urgência para hoje\n' +
    'Ignore saudações, carimbos de horário e nomes de remetentes do WhatsApp.\n' +
    (ex ? '\nExemplos de como ele classifica (siga este critério):\n' + ex + '\n' : '') +
    '\nTexto:\n"""' + text + '"""';

  var body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          tasks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                text: { type: 'STRING' },
                category: { type: 'STRING', enum: CATEGORIES },
                owner: { type: 'STRING' }
              },
              required: ['text', 'category']
            }
          }
        },
        required: ['tasks']
      }
    }
  };

  var models = [modelName_()];
  if (models[0] !== FALLBACK_MODEL) models.push(FALLBACK_MODEL);
  var lastErr = '';
  for (var i = 0; i < models.length; i++) {
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(models[i]) + ':generateContent',
      {
        method: 'post', contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        payload: JSON.stringify(body), muteHttpExceptions: true
      });
    var code = res.getResponseCode();
    if (code === 200) {
      try {
        var data = JSON.parse(res.getContentText());
        var txt = data.candidates[0].content.parts[0].text;
        var parsed = JSON.parse(txt);
        var arr = (parsed.tasks || []).map(function (x) {
          return {
            text: String(x.text || '').trim(),
            category: CATEGORIES.indexOf(x.category) >= 0 ? x.category : 'medium',
            owner: String(x.owner || '').trim()
          };
        }).filter(function (x) { return x.text; });
        return { ok: true, model: models[i], tasks: arr };
      } catch (err) {
        lastErr = 'resposta ilegível de ' + models[i];
      }
    } else {
      lastErr = models[i] + ' respondeu ' + code;
      if (code === 400 || code === 401 || code === 403) break; // chave ou pedido inválido: o reserva não resolve
    }
  }
  return { ok: false, error: lastErr };
}

function modelName_() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || DEFAULT_MODEL;
}

/* ---------- operações ---------- */

function op_(listId, o) {
  try {
    if (o.op === 'create') {
      var res = { title: o.title, notes: o.notes || '' };
      if (o.status === 'completed') res.status = 'completed';
      return { ref: o.ref, ok: true, task: slim_(Tasks.Tasks.insert(res, listId)) };
    }
    if (o.op === 'update') {
      var patch = {};
      if (o.title != null) patch.title = o.title;
      if (o.status === 'completed') patch.status = 'completed';
      if (o.status === 'needsAction') { patch.status = 'needsAction'; patch.completed = null; }
      return { ref: o.ref, ok: true, task: slim_(Tasks.Tasks.patch(patch, listId, o.id)) };
    }
    if (o.op === 'delete') {
      Tasks.Tasks.remove(listId, o.id);
      return { ref: o.ref, ok: true };
    }
    return { ref: o.ref, ok: false, error: 'Operação desconhecida' };
  } catch (err) {
    var msg = String((err && err.message) || err);
    var notFound = /not ?found|404/i.test(msg);
    if (o.op === 'delete' && notFound) return { ref: o.ref, ok: true }; // já não existia
    return { ref: o.ref, ok: false, notFound: notFound, error: msg };
  }
}

function listAll_(listId) {
  var out = [];
  var pageToken;
  do {
    var r = Tasks.Tasks.list(listId, {
      maxResults: 100,
      showCompleted: true,
      showHidden: false,
      pageToken: pageToken
    });
    (r.items || []).forEach(function (t) {
      if (!t.deleted && (t.title || '').trim()) out.push(slim_(t));
    });
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

function getOrCreateToken_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('CC_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('CC_TOKEN', token);
  }
  return token;
}

function getListId_() {
  if (typeof Tasks === 'undefined') {
    throw new Error('Serviço "Google Tasks API" não adicionado. Menu lateral Serviços (+) → Google Tasks API → Adicionar.');
  }
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CC_LIST_ID');
  if (id) {
    try { Tasks.Tasklists.get(id); return id; } catch (e) { /* lista apagada: recria abaixo */ }
  }
  var pageToken;
  do {
    var r = Tasks.Tasklists.list({ maxResults: 100, pageToken: pageToken });
    var hit = (r.items || []).filter(function (l) { return l.title === LIST_NAME; })[0];
    if (hit) { props.setProperty('CC_LIST_ID', hit.id); return hit.id; }
    pageToken = r.nextPageToken;
  } while (pageToken);
  var created = Tasks.Tasklists.insert({ title: LIST_NAME });
  props.setProperty('CC_LIST_ID', created.id);
  return created.id;
}

function slim_(t) {
  return {
    id: t.id,
    title: t.title || '',
    notes: t.notes || '',
    status: t.status,
    completed: t.completed || null,
    updated: t.updated || null,
    due: t.due || null
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Toutes les fonctions IA (Claude) de ReviseIA
const Anthropic = require('@anthropic-ai/sdk');

const MODELS = {
  opus: 'claude-opus-5-5',   // meilleure qualité (par défaut)
  haiku: 'claude-haiku-5-5', // très économique
};

const SUBJECT_HINTS = {
  'français': "Cours de français : grammaire, conjugaison, orthographe, analyse de textes, littérature, figures de style. Les exercices peuvent être des phrases à corriger, à conjuguer, à analyser.",
  'math': "Cours de mathématiques : donne des exercices de calcul avec des nombres précis et une correction détaillée étape par étape. N'utilise PAS de LaTeX : écris les formules en texte simple avec des symboles Unicode (x², √, π, ≤, ≥, ×, ÷, ½).",
  'latin': "Cours de latin : vocabulaire, déclinaisons, conjugaisons, traduction latin → français, analyse grammaticale (cas, fonction). Donne des tableaux de déclinaisons quand c'est utile.",
  'anglais': "Cours d'anglais : vocabulaire (anglais ↔ français), grammaire, temps, verbes irréguliers, compréhension. Les consignes sont en français, le contenu en anglais.",
  'ndls': "Cours de NDLS (néerlandais) : vocabulaire (néerlandais ↔ français), grammaire, conjugaison, phrases. Les consignes sont en français, le contenu en néerlandais.",
  'sciences': "Cours de sciences : définitions, schémas expliqués en texte, phénomènes, expériences, calculs simples avec unités.",
  'géo': "Cours de géographie : localisations, définitions, cartes décrites en texte, causes et conséquences, chiffres clés.",
  'histoire': "Cours d'histoire : dates, personnages, causes et conséquences, chronologie, documents historiques, vocabulaire spécifique.",
};

function subjectHint(name) {
  const n = (name || '').toLowerCase();
  for (const k of Object.keys(SUBJECT_HINTS)) if (n.includes(k)) return SUBJECT_HINTS[k];
  return `Cours de ${name}.`;
}

const BASE_SYSTEM = `Tu es ReviseIA, un professeur particulier bienveillant et très efficace pour un élève du secondaire francophone.
Tu réponds toujours en français (sauf le contenu en langue étrangère d'un cours de langue).
Tu es clair, structuré, concret, et tu restes fidèle au contenu des cours fournis par l'élève : n'invente pas de matière hors programme, mais tu peux ajouter de courtes explications pour aider à comprendre.
Formatage : Markdown simple (titres ##, listes -, **gras**, tableaux). Pas de LaTeX.`;

class AI {
  constructor(getSettings) {
    this.getSettings = getSettings;
  }

  client() {
    const s = this.getSettings();
    if (!s.apiKey) {
      const e = new Error("Clé API Claude manquante. Va dans ⚙️ Réglages sur le PC pour la coller.");
      e.status = 400;
      throw e;
    }
    return new Anthropic({ apiKey: s.apiKey });
  }

  model() {
    return MODELS[this.getSettings().model] || MODELS.opus;
  }

  async ask({ system, content, effort = 'medium', maxTokens = 32000 }) {
    const client = this.client();
    const model = this.model();
    const params = {
      model,
      max_tokens: maxTokens,
      system: BASE_SYSTEM + '\n\n' + (system || ''),
      output_config: { effort },
      messages: [{ role: 'user', content }],
    };
    let msg;
    try {
      if (model === MODELS.opus) {
        // Opus : repli automatique côté serveur si une demande est refusée
        const stream = client.beta.messages.stream({
          ...params,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
        msg = await stream.finalMessage();
      } else {
        const stream = client.messages.stream(params);
        msg = await stream.finalMessage();
      }
    } catch (err) {
      throw friendlyError(err);
    }
    if (msg.stop_reason === 'refusal') {
      const e = new Error("L'IA a refusé cette demande. Essaie de reformuler.");
      e.status = 422;
      throw e;
    }
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return text;
  }

  async askJSON(opts) {
    const text = await this.ask({
      ...opts,
      system: (opts.system || '') + '\n\nRéponds UNIQUEMENT avec du JSON valide, sans texte avant ou après, sans bloc ```.',
    });
    return parseJSON(text);
  }

  // 1) Scanner : photos -> texte du cours
  async transcribe({ images, subject, kind }) {
    const content = images.map((dataUrl) => {
      const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(dataUrl);
      if (!m) throw Object.assign(new Error('Image invalide'), { status: 400 });
      return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
    });
    content.push({
      type: 'text',
      text: `Voici ${images.length} photo(s) d'un document de l'élève (type : ${kind}, matière : ${subject}).
Retranscris FIDÈLEMENT tout le contenu (y compris l'écriture manuscrite), dans l'ordre des pages, en Markdown propre et bien structuré (titres, listes, tableaux).
Si c'est une interro, retranscris les questions ET, si visibles, les réponses de l'élève et les corrections du prof (indique-les par "✏️ Réponse élève :" et "✅ Correction :").
Décris brièvement en texte les schémas/dessins importants entre crochets [Schéma : ...].
Si un mot est illisible, écris [illisible].

Réponds en JSON : {"title": "titre court du document", "text": "le contenu en Markdown"}`,
    });
    const out = await this.askJSON({ system: subjectHint(subject), content, effort: 'medium', maxTokens: 64000 });
    return { title: String(out.title || 'Document').slice(0, 120), text: String(out.text || '') };
  }

  // 2) Synthèse
  async summary({ subject, docs, style }) {
    const styleTxt = {
      complete: 'une synthèse complète et structurée, prête à étudier',
      courte: "une fiche de révision TRÈS courte (1 page max) avec l'essentiel à retenir",
      plan: "un plan détaillé + les définitions et dates/formules clés à connaître par cœur",
    }[style] || 'une synthèse complète et structurée, prête à étudier';
    return this.ask({
      system: subjectHint(subject),
      effort: 'medium',
      content: `${docsBlock(docs)}

À partir de ces documents, fais ${styleTxt}.
Structure : un titre, puis des sections ## avec l'essentiel, les **mots-clés en gras**, les définitions, exemples, et à la fin une section "## 🎯 À retenir absolument" (5 à 10 points) et "## ⚠️ Pièges fréquents".
S'il y a des interros, insiste sur ce qui y est demandé.`,
    });
  }

  // 3) Exercices interactifs
  async exercises({ subject, docs, count = 10, difficulty = 'moyen' }) {
    const out = await this.askJSON({
      system: subjectHint(subject),
      effort: 'medium',
      content: `${docsBlock(docs)}

Crée ${count} exercices de difficulté "${difficulty}" pour réviser ces documents, variés et prêts à l'emploi.
Si des interros sont fournies, crée des exercices du MÊME STYLE que les interros du prof (c'est ce qui tombera).
Mélange les types :
- "qcm" : 4 choix, un seul correct
- "vrai_faux"
- "trou" : phrase avec ___ à compléter (réponse courte)
- "ouvert" : question à réponse rédigée ou calcul

JSON attendu :
{"title": "titre de la série", "exercises": [
 {"type": "qcm", "question": "...", "choices": ["A","B","C","D"], "answer": 0, "explanation": "..."},
 {"type": "vrai_faux", "question": "...", "answer": true, "explanation": "..."},
 {"type": "trou", "question": "Le ___ est ...", "answer": "mot attendu", "explanation": "..."},
 {"type": "ouvert", "question": "...", "answer": "réponse modèle complète", "explanation": "méthode / barème"}
]}
Pour "qcm", "answer" est l'index (0 à 3) du bon choix.`,
    });
    if (!Array.isArray(out.exercises)) throw new Error("L'IA n'a pas renvoyé d'exercices, réessaie.");
    return { title: out.title || 'Exercices', exercises: out.exercises };
  }

  // 4) Flashcards
  async flashcards({ subject, docs, count = 20 }) {
    const out = await this.askJSON({
      system: subjectHint(subject),
      effort: 'low',
      content: `${docsBlock(docs)}

Crée ${count} flashcards (recto = question / mot / date / notion, verso = réponse courte et précise) pour mémoriser ces documents.
Pour les langues : recto = mot en français, verso = traduction (et inversement pour certaines).
JSON : {"title": "...", "cards": [{"front": "...", "back": "..."}]}`,
    });
    if (!Array.isArray(out.cards)) throw new Error("L'IA n'a pas renvoyé de flashcards, réessaie.");
    return { title: out.title || 'Flashcards', cards: out.cards };
  }

  // 5) Réciter son cours (à l'oral ou à l'écrit)
  async reciteCheck({ subject, docs, recitation }) {
    return this.askJSON({
      system: subjectHint(subject),
      effort: 'medium',
      content: `${docsBlock(docs)}

L'élève récite ce cours de mémoire (texte souvent issu d'une dictée vocale, donc ignore les petites fautes de transcription et la ponctuation) :
<recitation>
${recitation}
</recitation>

Compare sa récitation au cours. Sois juste et encourageant.
JSON : {"score": nombre de 0 à 20,
 "acquis": ["ce qu'il a bien dit", ...],
 "oublis": ["notions importantes du cours qu'il n'a pas dites", ...],
 "erreurs": ["ce qu'il a dit de faux + la correction", ...],
 "conseil": "un conseil court pour la prochaine récitation"}`,
    });
  }

  // 6) Corriger une réponse ouverte
  async checkAnswer({ subject, question, expected, answer }) {
    return this.askJSON({
      system: subjectHint(subject),
      effort: 'low',
      maxTokens: 8000,
      content: `Question : ${question}
Réponse modèle : ${expected}
Réponse de l'élève : ${answer}

Corrige la réponse de l'élève (accepte les formulations différentes si le sens est juste).
JSON : {"correct": true/false, "note": "x/10", "feedback": "explication courte de ce qui est bien / à corriger"}`,
    });
  }

  // 7) Poser une question sur le cours
  async question({ subject, docs, question }) {
    return this.ask({
      system: subjectHint(subject),
      effort: 'medium',
      content: `${docsBlock(docs)}

Question de l'élève sur ce cours : ${question}

Explique simplement, avec un exemple si utile.`,
    });
  }
}

function docsBlock(docs) {
  if (!docs || !docs.length) throw Object.assign(new Error('Choisis au moins un document.'), { status: 400 });
  const label = { cours: 'COURS', synthese: 'SYNTHÈSE', interro: 'INTERRO' };
  return docs
    .map((d, i) => `<document n="${i + 1}" type="${label[d.kind] || d.kind}" titre="${(d.title || '').replace(/"/g, "'")}">\n${d.text}\n</document>`)
    .join('\n\n');
}

function parseJSON(text) {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch {}
  }
  throw new Error("Réponse de l'IA illisible, réessaie.");
}

function friendlyError(err) {
  let msg = err.message || String(err);
  let status = 500;
  if (err instanceof Anthropic.AuthenticationError) { msg = 'Clé API invalide. Vérifie-la dans ⚙️ Réglages.'; status = 401; }
  else if (err instanceof Anthropic.PermissionDeniedError) { msg = "Ta clé API n'a pas accès à ce modèle."; status = 403; }
  else if (err instanceof Anthropic.RateLimitError) { msg = 'Trop de demandes, attends une minute et réessaie.'; status = 429; }
  else if (err instanceof Anthropic.BadRequestError) { msg = 'Demande refusée par l\'API : ' + msg + ' (vérifie aussi ton crédit sur console.anthropic.com)'; status = 400; }
  else if (err instanceof Anthropic.APIConnectionError) { msg = "Pas de connexion à Internet ou à l'API Claude."; status = 503; }
  else if (err instanceof Anthropic.APIError) { msg = `Erreur de l'API Claude (${err.status}) : ${msg}`; status = 502; }
  const e = new Error(msg);
  e.status = status;
  return e;
}

module.exports = { AI, MODELS };

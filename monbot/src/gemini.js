// IA Google Gemini (offre gratuite) : il faut GEMINI_API_KEY (https://aistudio.google.com/apikey).
// Essaie le modèle Flash, puis Flash-Lite si Google est surchargé.
const MODELES = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const URL = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

export const geminiActif = () => !!process.env.GEMINI_API_KEY;

export async function gemini(system, texte) {
  let derniere = null;
  for (const modele of MODELES) {
    for (let essai = 0; essai < 2; essai++) {
      const r = await fetch(URL(modele), {
        method: 'POST', signal: AbortSignal.timeout(90e3),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: texte }] }],
        }),
      }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
      if (r.ok) {
        const d = await r.json();
        const txt = d?.candidates?.[0]?.content?.parts?.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
        if (txt) return txt;
        derniere = `réponse vide (${d?.candidates?.[0]?.finishReason || d?.promptFeedback?.blockReason || '?'})`;
        break;
      }
      derniere = `${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`;
      if (![429, 500, 502, 503, 504, 0].includes(r.status)) break; // erreur non passagère : modèle suivant
      await new Promise(res => setTimeout(res, 2000));
    }
  }
  throw new Error(`Gemini : ${derniere}`);
}

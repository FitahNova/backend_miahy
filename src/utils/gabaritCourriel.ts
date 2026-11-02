// Gabarit HTML des courriels : tableaux et styles en ligne, seule mise en page fiable dans les messageries.
// Le logo est chargé depuis le front ; une messagerie peut le bloquer : le nom reste écrit à côté.
// Couleurs reprises des jetons du front.
const BLEU = "#006cd7";
const BLEU_DOUX = "#e8f1fc";
const FOND = "#f4f6f9";
const BORDURE = "#e1e6ee";
const TEXTE = "#1f2933";
const TEXTE_SECONDAIRE = "#52606d";
const POLICE = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Le nom vient de la base : il ne doit jamais pouvoir ajouter du HTML au courriel. */
export function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const paragraphe = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXTE};">${html}</p>`;
const note = (html: string) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${TEXTE_SECONDAIRE};">${html}</p>`;

/** Bouton « à l'épreuve » des messageries : un lien dans une cellule colorée. */
function bouton(libelle: string, url: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>` +
    `<td style="border-radius:10px;background:${BLEU};">` +
    `<a href="${echapperHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:${POLICE};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${echapperHtml(libelle)}</a>` +
    `</td></tr></table>`
  );
}

function page(titre: string, corps: string, urlLogo: string): string {
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${echapperHtml(titre)}</title></head>` +
    `<body style="margin:0;padding:0;background:${FOND};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FOND};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDURE};border-radius:14px;font-family:${POLICE};">` +
    `<tr><td style="padding:20px 28px;background:${BLEU};border-radius:14px 14px 0 0;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding-right:14px;"><img src="${echapperHtml(urlLogo)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:12px;background:#ffffff;"></td>` +
    `<td><div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#ffffff;">CENTRE MÉDICAL</div>` +
    `<div style="margin-top:2px;font-size:26px;font-weight:800;color:#ffffff;">MIAHY</div></td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="padding:28px;">` +
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${TEXTE};">${echapperHtml(titre)}</h1>` +
    corps +
    `</td></tr></table>` +
    `<p style="margin:16px 0 0;font-family:${POLICE};font-size:12px;color:${TEXTE_SECONDAIRE};">Message automatique du centre médical MIAHY. Merci de ne pas y répondre.</p>` +
    `</td></tr></table></body></html>`
  );
}

interface DonneesLien {
  titre: string;
  nom: string;
  introduction: string;
  libelleBouton: string;
  url: string;
  dureeHeures: number;
  urlLogo: string;
}

/** Courriel d'activation ou de réinitialisation : le bouton, et le lien en clair si le bouton ne s'affiche pas. */
export function gabaritLien({ titre, nom, introduction, libelleBouton, url, dureeHeures, urlLogo }: DonneesLien): string {
  return page(
    titre,
    paragraphe(`Bonjour ${echapperHtml(nom)},`) +
      paragraphe(echapperHtml(introduction)) +
      bouton(libelleBouton, url) +
      note(`Ce lien est valable <strong>${dureeHeures} heures</strong> et ne sert qu'une fois. Ne le transmettez à personne.`) +
      note(`Si vous n'êtes pas à l'origine de cette demande, prévenez immédiatement la Direction.`) +
      note(`Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :`) +
      `<p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${echapperHtml(url)}" style="color:${BLEU};">${echapperHtml(url)}</a></p>`,
    urlLogo,
  );
}

/** Courriel du code de connexion à 6 chiffres. */
export function gabaritCode(nom: string, code: string, dureeMinutes: number, urlLogo: string): string {
  return page(
    "Votre code de connexion",
    paragraphe(`Bonjour ${echapperHtml(nom)},`) +
      paragraphe("Saisissez ce code pour terminer votre connexion à MIAHY :") +
      `<div style="margin:0 0 24px;padding:16px;border-radius:10px;background:${BLEU_DOUX};text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:${BLEU};">${echapperHtml(code)}</div>` +
      note(`Il est valable <strong>${dureeMinutes} minutes</strong> et ne sert qu'une fois. Ne le communiquez à personne.`) +
      note(`Si vous n'essayez pas de vous connecter, votre mot de passe est peut-être connu : prévenez la Direction.`),
    urlLogo,
  );
}

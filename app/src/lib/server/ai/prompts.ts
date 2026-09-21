// Domain glossary and prompts for the knitting/sewing/crochet assistant.

export const KNITTING_GLOSSARY = `
Glossaire de référence (anglais → français) à respecter strictement :
- k = maille endroit (m. end.) ; p = maille envers (m. env.)
- k2tog = 2 mailles ensemble à l'endroit ; p2tog = 2 mailles ensemble à l'envers
- ssk = surjet simple ; yo = jeté ; sl = glisser une maille
- CO = monter les mailles ; BO = rabattre ; st(s) = maille(s) ; rep = répéter
- RS = endroit du travail ; WS = envers du travail ; rnd = tour ; rep = répéter
- inc = augmentation ; dec = diminution ; m1 = augmentation intercalaire
Crochet (US → FR) :
- sc (US) = maille serrée ; dc (US) = bride ; hdc (US) = demi-bride ; tr (US) = double bride
- ch = maille en l'air ; sl st = maille coulée ; sk = sauter
Attention : terminologie crochet US ≠ UK (UK "dc" = US "sc"). Préciser si ambigu.
`;

export const TRANSLATE_SYSTEM = `Tu es traducteur·rice expert·e en patrons de tricot, crochet et couture.
Traduis fidèlement vers le français en utilisant la terminologie technique française correcte.
Conserve la structure (numéros de rangs, abréviations standard FR, tailles).
${KNITTING_GLOSSARY}
Réponds uniquement avec la traduction, sans commentaire.`;

export const COPILOT_SYSTEM = `Tu es un·e assistant·e de tricot/crochet/couture bienveillant·e et précis·e.
Tu réponds aux questions sur un patron à partir du CONTEXTE fourni.
Explique les abréviations, recalcule les jauges/tailles si demandé, donne des étapes claires.
Si l'information n'est pas dans le contexte, dis-le honnêtement.
${KNITTING_GLOSSARY}`;

export const GENERATE_SYSTEM = `Tu es créateur·rice de patrons de tricot/crochet.
À partir de la description, de la jauge et des mensurations, génère un patron complet et réalisable :
- matériel (laine, métrage estimé, aiguilles/crochet)
- échantillon/jauge
- instructions rang par rang avec nombres de mailles calculés pour la taille demandée
- finitions
Utilise la terminologie française et les abréviations standard. Sois précis sur les calculs de mailles.`;

export const PIECES_SYSTEM = `Tu es assistant·e de tricot/crochet/couture, expert·e en lecture de patrons.
À partir du texte d'un patron, identifie la liste des PIÈCES distinctes à réaliser
(ex. "Dos", "Devant", "Manche gauche", "Manche droite", "Col", "Poche"...).
Pour chaque pièce, ajoute en plus, UNIQUEMENT si le texte le précise explicitement :
- "rows" : le nombre total de rangs (ou tours) à tricoter/crocheter pour cette pièce
  (tricot/crochet seulement -- n'ajoute jamais ce champ pour de la couture)
- "quantity" : le nombre d'exemplaires à couper/réaliser, seulement si > 1
  (ex. "Manche x2" -> 2 ; couture surtout -- n'ajoute jamais ce champ pour du tricot/crochet)
N'invente et ne devine JAMAIS un nombre : omets le champ plutôt que d'approximer.
Réponds STRICTEMENT avec un objet JSON de la forme
{"pieces": [{"name": "Dos", "rows": 84}, {"name": "Manche", "rows": 52, "quantity": 2}]},
sans aucun texte autour, sans balises markdown.
Liste courte et concrète (généralement 2 à 15 pièces). Si le patron ne décrit qu'une
seule pièce continue (ex. écharpe simple, bonnet), renvoie une seule entrée.
${KNITTING_GLOSSARY}`;

export function piecesPrompt(context: string, craft?: string): string {
	const hint =
		craft === 'couture'
			? ' Patron de couture : cherche le nombre de pièces à couper ("quantity"), pas de rangs.'
			: craft === 'tricot' || craft === 'crochet'
				? ' Patron de tricot/crochet : cherche le nombre de rangs total par pièce ("rows").'
				: '';
	return `PATRON:\n${context.slice(0, 12000)}\n\nListe les pièces à réaliser pour ce patron, avec leurs rangs/quantités si précisés, au format JSON demandé.${hint}`;
}

// Output language for the free-text fields a suggestion generates (tags,
// garmentType, sizes) -- NOT the same thing as the "language" field itself,
// which reports what language the SOURCE pattern is written in (a fact about
// the document, detected from its text) and must never be translated to fit
// this setting. Keyed by the app's own locale codes (see $lib/i18n).
const PATTERN_INFO_LANGUAGE_NAMES: Record<string, string> = { fr: 'français', en: 'anglais' };

export function patternInfoSystem(language: string): string {
	const langName = PATTERN_INFO_LANGUAGE_NAMES[language] ?? PATTERN_INFO_LANGUAGE_NAMES.fr;
	return `Tu es assistant·e de tricot/crochet/couture, expert·e en lecture de patrons.
À partir du texte d'un patron (titre, notes, contenu), extrais les informations
suivantes, UNIQUEMENT quand le texte les précise explicitement. N'invente et ne
devine JAMAIS une valeur : omets le champ plutôt que d'approximer.
- "tags" : 2 à 6 étiquettes courtes (minuscules) pour classer le patron -- PAS le
  type de vêtement ni la difficulté (déjà couverts ci-dessous), plutôt le public
  visé ("homme", "femme", "enfant", "bébé", "unisexe"), la saison ("hiver", "été",
  "mi-saison"), l'occasion/style ("quotidien", "fête", "sport", "grossesse"), une
  technique ou matière notable ("sans couture", "dentelle", "jacquard")
- "garmentType" : le type d'objet réalisé, un ou deux mots (ex. "pull", "chaussettes",
  "jupe", "bonnet")
- "designer" : le nom du·de la créateur·rice ou de la marque du patron, si indiqué --
  un nom propre, ne le traduis jamais
- "language" : la langue DANS LAQUELLE LE PATRON SOURCE EST ÉCRIT, en code court
  ("fr", "en", "de"...) -- ceci décrit le document, ignore la consigne de langue
  de sortie ci-dessous pour ce champ précis
- "difficulty" : un entier de 1 (très facile) à 5 (expert), UNIQUEMENT si le patron
  indique explicitement un niveau (débutant/confirmé/expert ou équivalent)
- "sizes" : les tailles disponibles telles qu'écrites dans le patron (ex. "36-44"
  ou "S/M/L")
- "gaugeStitches" : le nombre de mailles pour 10 cm à l'échantillon (tricot/crochet
  seulement, nombre)
- "gaugeRows" : le nombre de rangs pour 10 cm à l'échantillon (tricot/crochet
  seulement, nombre)
- "yardageRequired" : le métrage de laine nécessaire, en mètres, arrondi à l'entier
  (tricot/crochet seulement -- convertis les yards en mètres si besoin : 1 yard ≈ 0.91 m)
Rédige "tags", "garmentType" et "sizes" en ${langName}, quelle que soit la langue
du texte source du patron ("designer" reste tel quel, un nom propre ; "language"
reste le code de la langue source, voir ci-dessus).
Réponds STRICTEMENT avec un objet JSON contenant uniquement les champs déterminés
avec certitude, sans aucun texte autour, sans balises markdown. Exemple :
{"tags": ["homme", "hiver"], "garmentType": "pull", "difficulty": 3, "gaugeStitches": 20, "gaugeRows": 28}`;
}

export function patternInfoPrompt(context: string): string {
	return `PATRON:\n${context.slice(0, 12000)}\n\nExtrais les informations pour ce patron, au format JSON demandé.`;
}

export function copilotPrompt(context: string, question: string): string {
	const ctx = context.slice(0, 12000);
	return `CONTEXTE DU PATRON:\n${ctx}\n\nQUESTION: ${question}`;
}

export function generatePrompt(opts: {
	description: string;
	craft: string;
	gauge?: string;
	size?: string;
}): string {
	return [
		`Type: ${opts.craft}`,
		`Description: ${opts.description}`,
		opts.gauge ? `Jauge: ${opts.gauge}` : '',
		opts.size ? `Taille / mensurations: ${opts.size}` : ''
	]
		.filter(Boolean)
		.join('\n');
}

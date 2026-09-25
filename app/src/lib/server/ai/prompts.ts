// Domain glossary and prompts for the knitting/sewing/crochet assistant.

import type { PatternVocabulary } from '$lib/server/patternVocabulary';

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
- "title" : le titre/nom réel du patron tel qu'il apparaît dans le document (page
  de couverture, gros titre...) -- UNIQUEMENT s'il est clairement identifiable
  comme LE titre du patron, jamais une phrase de description ou un résumé
- "tags" : 0 à 6 étiquettes courtes, chacune JUSTIFIÉE par le texte -- mieux vaut
  aucun tag qu'un tag deviné. PAS le type de vêtement ni la difficulté (champs
  dédiés ci-dessous). Catégories possibles :
  * public visé ("homme", "femme", "enfant", "bébé", "unisexe") : seulement si le
    texte le dit (ou le montre par ses tailles, ex. "6 mois" → bébé)
  * saison ("hiver", "été", "mi-saison") : seulement si le texte la nomme OU si
    le vêtement l'impose sans ambiguïté (débardeur, short, top à bretelles → été ;
    moufles, bonnet épais → hiver). JAMAIS une saison qui contredit le vêtement
    (pas "hiver" pour un débardeur, pas "été" pour des moufles). Dans le doute,
    pas de saison.
  * technique ou matière notable citée dans le texte ("sans couture", "dentelle",
    "jacquard", "top-down", "coton", "mohair")
  * occasion/style seulement si le texte l'indique ("cérémonie", "grossesse")
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
Rédige "title", "tags", "garmentType" et "sizes" en ${langName}, quelle que soit
la langue du texte source du patron ("designer" reste tel quel, un nom propre ;
"language" reste le code de la langue source, voir ci-dessus).
Casse : utilise la casse la plus naturelle pour chaque champ texte (majuscule en
début de nom propre ou de type d'objet, tags en minuscules sauf s'il s'agit
eux-mêmes d'un nom propre) -- SAUF si un bloc "VOCABULAIRE DÉJÀ UTILISÉ" est
fourni : dans ce cas, si une valeur de ce vocabulaire correspond, reprends-la
À L'IDENTIQUE, lettre pour lettre et casse comprise, plutôt que de la
réécrire différemment.
Si un bloc "VOCABULAIRE DÉJÀ UTILISÉ" est fourni avec le patron, il liste les
tags / types d'objet / créateur·rice·s déjà utilisés par cette personne pour ses
AUTRES patrons. Il sert UNIQUEMENT à l'orthographe : décide d'abord des tags
justifiés pour CE patron, puis, si l'un d'eux existe déjà dans la liste sous une
autre forme ("Hiver" vs "hiver" vs "d'hiver"), reprends la forme existante. Ne
choisis JAMAIS un tag parce qu'il figure dans la liste.
Réponds STRICTEMENT avec un objet JSON contenant uniquement les champs déterminés
avec certitude, sans aucun texte autour, sans balises markdown. Forme attendue
(valeurs à remplacer, champs incertains à omettre) :
{"title": "…", "tags": ["…"], "garmentType": "…", "designer": "…", "language": "…", "difficulty": 0, "sizes": "…", "gaugeStitches": 0, "gaugeRows": 0, "yardageRequired": 0}`;
}

function vocabularyBlock(vocabulary?: PatternVocabulary): string {
	const lines: string[] = [];
	if (vocabulary?.tags.length) lines.push(`Tags déjà utilisés : ${vocabulary.tags.join(', ')}`);
	if (vocabulary?.garmentTypes.length) lines.push(`Types d'objet déjà utilisés : ${vocabulary.garmentTypes.join(', ')}`);
	if (vocabulary?.designers.length) lines.push(`Créateur·rice·s déjà enregistré·e·s : ${vocabulary.designers.join(', ')}`);
	return lines.length ? `\n\nVOCABULAIRE DÉJÀ UTILISÉ :\n${lines.join('\n')}` : '';
}

// What the person already told us about the pattern: the model can't see the
// form, and without it guesses the craft/garment from a title alone.
export type PatternInfoHints = { craft?: string; garmentType?: string | null };

const CRAFT_NAMES: Record<string, string> = { couture: 'couture', tricot: 'tricot', crochet: 'crochet' };

function hintsBlock(hints?: PatternInfoHints): string {
	const lines: string[] = [];
	if (hints?.craft && CRAFT_NAMES[hints.craft]) lines.push(`Type d'ouvrage : ${CRAFT_NAMES[hints.craft]}`);
	if (hints?.garmentType) lines.push(`Objet réalisé : ${hints.garmentType}`);
	return lines.length ? `${lines.join('\n')}\n\n` : '';
}

export function patternInfoPrompt(context: string, vocabulary?: PatternVocabulary, hints?: PatternInfoHints): string {
	return `${hintsBlock(hints)}PATRON:\n${context.slice(0, 12000)}${vocabularyBlock(vocabulary)}\n\nExtrais les informations pour ce patron, au format JSON demandé.`;
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

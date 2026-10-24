// Drops AI-suggested tags the pattern text doesn't back up. A local 7B model
// happily tags a tank top "hiver" or a sock "homme" because the prompt listed
// those categories; the prompt now forbids it, and this enforces it.
//
// Season and audience tags get dedicated rules (a garment can prove them);
// every other tag (technique, material, style) must be found in the text,
// in French or English, or it is dropped. tagKey/sameTag also decide when
// two spellings are the same tag ("d'hiver" / "hiver", "torsades" /
// "torsade", "top-down" / "de haut en bas").

function norm(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[’`]/g, "'")
		.toLowerCase()
		.trim();
}

// Comparison form of a tag or a text: no accents, no case, "d'"/"l'" and
// hyphens dropped, simple plurals folded ("torsades" -> "torsade").
export function tagKey(s: string): string {
	return norm(s)
		.replace(/\b[dl]'/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map((w) => (w.length > 4 && /[sx]$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w))
		.join(' ');
}

// Same tag under another name, French and English: a French tag on an
// English pattern ("dentelle" for "lace") is grounded, and a suggestion
// never duplicates a tag the library already spells another way.
const TAG_SYNONYMS: string[][] = [
	['top-down', 'top down', 'de haut en bas', 'tricoté de haut en bas'],
	['bottom-up', 'bottom up', 'de bas en haut'],
	['sans couture', 'seamless', 'sans coutures'],
	['dentelle', 'lace', 'ajouré', 'ajours'],
	['torsade', 'cable', 'cabled'],
	['jacquard', 'fair isle', 'fairisle', 'stranded', 'colorwork'],
	['point mousse', 'garter stitch'],
	['jersey', 'stockinette', 'stocking stitch'],
	['empiècement rond', 'round yoke', 'circular yoke'],
	['côtes anglaises', 'brioche'],
	['oversize', 'oversized'],
	['coton', 'cotton'],
	['laine', 'wool'],
	['mérinos', 'merino'],
	['alpaga', 'alpaca'],
	['lin', 'linen'],
	['soie', 'silk'],
	['cachemire', 'cashmere'],
	['tricot', 'knit', 'knitting', 'knitted', 'tricoté'],
	['couture', 'sewing'],
	['granny', 'granny square', 'carré granny']
];
const SYNONYM_KEYS = TAG_SYNONYMS.map((g) => g.map(tagKey));

function synonymGroup(key: string): string[] | undefined {
	return SYNONYM_KEYS.find((g) => g.includes(key));
}

// Identity of a tag for deduplication: its synonym group, else its key.
export function tagIdentity(tag: string): string {
	const key = tagKey(tag);
	const group = synonymGroup(key);
	return group ? `#${group[0]}` : key;
}

export function sameTag(a: string, b: string): boolean {
	return tagIdentity(a) === tagIdentity(b);
}

// The tag (or a synonym) appears in the text as whole words; a single word
// of 5+ letters may also be the start of a text word ("tricot" in
// "tricoter", "torsade" in "torsadé").
function inText(tag: string, textKey: string): boolean {
	const key = tagKey(tag);
	if (!key) return false;
	const variants = synonymGroup(key) ?? [key];
	return variants.some((v) => {
		if (` ${textKey} `.includes(` ${v} `)) return true;
		return !v.includes(' ') && v.length >= 5 && new RegExp(`(^| )${v}[a-z]*( |$)`).test(textKey);
	});
}

type Rule = {
	// Normalized tag forms that belong to this category.
	tags: string[];
	// What in the pattern text proves the category applies.
	evidence: RegExp;
};

const SEASONS = {
	winter: {
		tags: ['hiver', "d'hiver", 'hivernal', 'winter', 'chaud', 'grand froid'],
		evidence: /\b(hiver|hivernale?s?|winter|grand froid)\b/
	},
	// Bare "ete" is not evidence: in French it is also "been" ("a été conçu").
	summer: {
		tags: ['ete', "d'ete", 'estival', 'summer'],
		evidence: /(\bsummer\b|\bestivale?s?\b|(?:\bd'|\bl'|\bcet |\ben |\bpour l')ete\b)/
	},
	mid: {
		tags: ['mi-saison', 'mi saison', 'demi-saison', 'intersaison', 'printemps', 'automne', 'spring', 'autumn', 'fall'],
		evidence: /\b(mi-?saison|demi-saison|intersaison|printemps|automne|spring|autumn)\b/
	}
} satisfies Record<string, Rule>;

const AUDIENCES: Rule[] = [
	{ tags: ['homme', 'hommes', 'men', 'man', 'masculin'], evidence: /\b(hommes?|men|mens|man|masculin|monsieur|pour lui)\b/ },
	{ tags: ['femme', 'femmes', 'women', 'woman', 'feminin'], evidence: /\b(femmes?|women|womens|woman|ladies|feminine?|madame|pour elle)\b/ },
	{
		tags: ['enfant', 'enfants', 'kids', 'kid', 'child', 'children', 'junior'],
		evidence: /\b(enfants?|kids?|child|children|junior|fillette|fille|garcon|\d+\s?(?:ans|years?|yrs))\b/
	},
	{ tags: ['bebe', 'bebes', 'baby', 'naissance'], evidence: /\b(bebes?|baby|babies|naissance|newborn|nourrisson|\d+\s?(?:mois|months?))\b/ },
	{ tags: ['unisexe', 'unisex', 'mixte'], evidence: /\b(unisexe|unisex|mixte)\b/ }
];

// Garments whose season is not up for debate.
const SUMMER_GARMENT =
	/\b(debardeurs?|tank|crop ?top|top a bretelles|t-?shirts?|tee|shorts?|maillots?|bikini|dos nu|camisole|bralette|sandales?|robe d'ete|sun ?hat|chapeau de soleil)\b/;
const WINTER_GARMENT =
	/\b(moufles?|mitaines?|mittens?|gants?|gloves?|bonnet|beanie|cagoule|balaclava|snood|cache-?cou|tour de cou|echarpe|scarf|manteau|coat|chauffe-?(?:jambes|oreilles)|leg ?warmers?)\b/;

// Belong in the dedicated difficulty field, not in tags.
const DIFFICULTY_TAGS = ['debutant', 'debutante', 'facile', 'intermediaire', 'confirme', 'expert', 'beginner', 'easy', 'advanced'];

export function groundTags(
	tags: string[],
	ctx: { text: string; garmentType?: string | null }
): string[] {
	const text = norm(ctx.text);
	const textKey = tagKey(ctx.text);
	const garment = norm(ctx.garmentType ?? '');
	// The title opens the context, so it also counts for the garment check
	// ("Débardeur Lina" with no garmentType filled in yet).
	const garmentSource = `${garment} ${text.slice(0, 200)}`;
	const summerGarment = SUMMER_GARMENT.test(garmentSource);
	const winterGarment = WINTER_GARMENT.test(garmentSource);

	return tags.filter((tag) => {
		const key = norm(tag);
		if (garment && key === garment) return false;
		if (DIFFICULTY_TAGS.includes(key)) return false;

		if (SEASONS.winter.tags.includes(key)) {
			if (summerGarment) return false;
			return winterGarment || SEASONS.winter.evidence.test(text);
		}
		if (SEASONS.summer.tags.includes(key)) {
			if (winterGarment) return false;
			return summerGarment || SEASONS.summer.evidence.test(text);
		}
		if (SEASONS.mid.tags.includes(key)) return SEASONS.mid.evidence.test(text);

		const audience = AUDIENCES.find((a) => a.tags.includes(key));
		if (audience) return audience.evidence.test(text);

		return inText(tag, textKey);
	});
}

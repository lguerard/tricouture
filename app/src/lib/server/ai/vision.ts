// Image understanding through the chat model itself (Gemma 4 reads images):
// yarn label scanning and motif classification. Replaces the former EasyOCR
// + CLIP "vision" sidecar -- one model on the GPU instead of three, and the
// label is read by something that understands it rather than regexes over
// raw OCR text.

import sharp from 'sharp';
import { generate, type GenerateOptions } from './ollama';
import { MOTIF_VALUES, YARN_WEIGHTS } from '$lib/labels';
import { parseJsonReply } from './output';

const LABEL_TIMEOUT_MS = 120_000;
const MOTIF_TIMEOUT_MS = 60_000;
// Vision models see a fixed-size tiling of the image anyway; sending a 12 MP
// phone photo only costs upload and decode time.
const MAX_IMAGE_SIDE = 1024;
const YARD_TO_METER = 0.9144;

// Downscaled JPEG, base64 without the data: prefix (what Ollama expects).
export async function imageForModel(input: Buffer): Promise<string> {
	const jpeg = await sharp(input)
		.rotate()
		.resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, { fit: 'inside', withoutEnlargement: true })
		.flatten({ background: '#ffffff' })
		.jpeg({ quality: 85 })
		.toBuffer();
	return jpeg.toString('base64');
}

export const LABEL_SCHEMA = {
	type: 'object',
	properties: {
		brand: { type: 'string' },
		name: { type: 'string' },
		colorway: { type: 'string' },
		fiber: { type: 'string' },
		weightCategory: { type: 'string', enum: YARN_WEIGHTS },
		metersPerSkein: { type: 'integer' },
		yardsPerSkein: { type: 'integer' },
		gramsPerSkein: { type: 'integer' },
		needleSizeMm: { type: 'number' },
		hookSizeMm: { type: 'number' }
	}
} as const;

export const LABEL_SYSTEM = `Tu lis des étiquettes de pelotes de laine / fil à tricoter ou crocheter.
À partir de la PHOTO de l'étiquette, extrais UNIQUEMENT ce qui y est écrit lisiblement.
N'invente et ne devine JAMAIS une valeur : omets le champ plutôt que d'approximer.
- "brand" : la marque (fabricant), un nom propre tel qu'écrit
- "name" : le nom de la qualité de fil (ex. "Merino Soft", "Alpaga Royal")
- "colorway" : le nom et/ou le numéro du coloris tel qu'écrit (ex. "Rouille 052")
- "fiber" : la composition, en français, pourcentages compris (ex. "75 % laine, 25 % polyamide")
- "weightCategory" : la catégorie de grosseur parmi les valeurs autorisées, seulement si
  l'étiquette l'indique (mot "DK", "worsted", "aran"..., ou symbole de pelote numéroté du
  Craft Yarn Council : 0 lace, 1 fingering, 2 sport, 3 dk, 4 worsted, 5 bulky, 6 super-bulky)
- "metersPerSkein" : le métrage d'une pelote en mètres ; "yardsPerSkein" : le métrage en yards
  s'il est écrit en yards (remplis ceux qui figurent sur l'étiquette)
- "gramsPerSkein" : le poids d'une pelote en grammes
- "needleSizeMm" : la taille d'aiguilles conseillée en mm (ex. 4 ou 4.5 ; une plage "4-4,5" → la
  plus petite valeur)
- "hookSizeMm" : la taille de crochet conseillée en mm, si indiquée
Réponds uniquement avec l'objet JSON demandé.`;

// Fields shaped like the stash form (see stash/+page.svelte FIELD_IDS):
// `yardsPerSkein` is the app's historical name for the METERS-per-skein
// column (yarns.yards_per_skein), hence the conversion.
export type LabelFields = {
	brand?: string;
	name?: string;
	colorway?: string;
	fiber?: string;
	weightCategory?: string;
	yardsPerSkein?: number;
	gramsPerSkein?: number;
	needleSizeMm?: number;
	hookSizeMm?: number;
};

function text(v: unknown, max = 160): string | undefined {
	const s = String(v ?? '').trim();
	return s && !/^[\s.…\-_?]*$/.test(s) ? s.slice(0, max) : undefined;
}

function num(v: unknown, min: number, max: number): number | undefined {
	const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
	return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

// Never throws: an unreadable reply just means nothing to pre-fill.
export function parseLabelFields(raw: string): LabelFields {
	const d = parseJsonReply(raw) as Record<string, unknown> | undefined;
	if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
	const weight = String(d.weightCategory ?? '').trim().toLowerCase().replace(/\s+/g, '-');
	const meters = num(d.metersPerSkein, 1, 10_000);
	const yards = num(d.yardsPerSkein, 1, 10_000);
	const fields: LabelFields = {
		brand: text(d.brand),
		name: text(d.name),
		colorway: text(d.colorway),
		fiber: text(d.fiber),
		weightCategory: YARN_WEIGHTS.includes(weight) ? weight : undefined,
		yardsPerSkein: meters != null ? Math.round(meters) : yards != null ? Math.round(yards * YARD_TO_METER) : undefined,
		gramsPerSkein: (() => {
			const g = num(d.gramsPerSkein, 1, 5_000);
			return g != null ? Math.round(g) : undefined;
		})(),
		needleSizeMm: num(d.needleSizeMm, 0.5, 30),
		hookSizeMm: num(d.hookSizeMm, 0.5, 30)
	};
	return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as LabelFields;
}

export const LABEL_PROMPT = "Lis cette étiquette de pelote et remplis l'objet JSON.";

// The generate() options of a label scan, shared with the model evaluation
// ($lib/server/ai/model-eval) so it sends exactly the production request.
export function labelGenerateOptions(imageB64: string): GenerateOptions {
	return {
		images: [imageB64],
		schema: LABEL_SCHEMA,
		temperature: 0,
		think: false,
		maxTokens: 400,
		timeoutMs: LABEL_TIMEOUT_MS
	};
}

// Reads a yarn label photo. Lets AiUnavailable and Ollama errors propagate
// (e.g. a text-only OLLAMA_CHAT_MODEL rejecting the image).
export async function scanYarnLabel(image: Buffer): Promise<LabelFields> {
	const raw = await generate(LABEL_PROMPT, LABEL_SYSTEM, undefined, labelGenerateOptions(await imageForModel(image)));
	return parseLabelFields(raw);
}

const MOTIF_SCHEMA = {
	type: 'object',
	properties: { motif: { type: 'string', enum: MOTIF_VALUES } },
	required: ['motif']
} as const;

const MOTIF_SYSTEM = `Tu classes l'aspect d'un fil ou d'un tissu sur une photo.
Choisis le motif dominant parmi : solid (uni), stripes (rayures), floral (fleurs),
dots (pois), chevron, plaid (carreaux/tartan), jacquard, animal (imprimé animal),
geometric (géométrique), print (autre imprimé graphique), other (autre).
Une pelote d'une seule couleur, même chinée, est "solid".
Réponds uniquement avec l'objet JSON demandé.`;

// Motif code (lib/labels.ts MOTIF_VALUES) of a stash photo, or null.
export async function classifyMotif(image: Buffer): Promise<string | null> {
	const raw = await generate('Quel est le motif de ce fil ou tissu ?', MOTIF_SYSTEM, undefined, {
		images: [await imageForModel(image)],
		schema: MOTIF_SCHEMA,
		temperature: 0,
		think: false,
		maxTokens: 30,
		timeoutMs: MOTIF_TIMEOUT_MS
	});
	const motif = String((parseJsonReply(raw) as { motif?: unknown } | undefined)?.motif ?? '');
	return MOTIF_VALUES.includes(motif) ? motif : null;
}

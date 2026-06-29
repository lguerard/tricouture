import { extractText, getDocumentProxy } from 'unpdf';

// Extrait le texte d'un PDF (pour la recherche plein-texte). Best-effort.
export async function extractPdfText(buf: Buffer): Promise<string | null> {
	try {
		const pdf = await getDocumentProxy(new Uint8Array(buf));
		const { text } = await extractText(pdf, { mergePages: true });
		const clean = (Array.isArray(text) ? text.join('\n') : text).trim();
		return clean.length ? clean.slice(0, 200_000) : null;
	} catch {
		return null;
	}
}

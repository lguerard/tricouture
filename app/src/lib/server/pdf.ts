import { extractText, getDocumentProxy } from 'unpdf';

// Extracts text from a PDF (for full-text search). Best-effort.
//
// pdf.js (which unpdf wraps) keeps a document's parsed fonts, images and
// rendering caches alive until `.destroy()` is called -- GC alone doesn't
// reliably reclaim them. Skipping that call is harmless for one PDF, but a
// batch import runs this in a loop across dozens of files in the same
// process: the caches pile up and can OOM-kill the container partway
// through, so every PDFDocumentProxy is destroyed as soon as it's read.
export async function extractPdfText(buf: Buffer): Promise<string | null> {
	let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
	try {
		pdf = await getDocumentProxy(new Uint8Array(buf));
		const { text } = await extractText(pdf, { mergePages: true });
		const clean = (Array.isArray(text) ? text.join('\n') : text).trim();
		return clean.length ? clean.slice(0, 200_000) : null;
	} catch {
		return null;
	} finally {
		// Cleanup failing must not turn a successful (or already-failed)
		// extraction into a thrown error for the caller.
		await pdf?.destroy().catch(() => {});
	}
}

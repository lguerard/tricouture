// Minimal Markdown -> HTML for the assistant's answers, safe by construction:
// the text is HTML-escaped FIRST, then a small set of constructs is turned
// into tags we write ourselves (paragraphs, headings, lists, code, bold,
// italics, links to http(s) or in-app paths). Nothing the model writes can
// become a tag or an attribute of its own. Tolerant of half-written input,
// since it re-renders on every streamed chunk.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

// Input is already escaped here.
function inline(s: string): string {
	const codes: string[] = [];
	let out = s.replace(/`([^`\n]+)`/g, (_m, c: string) => {
		codes.push(`<code>${c}</code>`);
		return `\u0000${codes.length - 1}\u0000`;
	});
	out = out
		.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
			if (/^https?:\/\//i.test(url)) return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
			if (/^\/(?!\/)/.test(url)) return `<a href="${url}">${text}</a>`;
			return m; // javascript:, data:, //host... stay plain text
		})
		.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
		.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
		.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
	return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

export function renderMarkdown(src: string): string {
	const lines = escapeHtml(src.replace(/\r\n?/g, '\n')).split('\n');
	const html: string[] = [];
	let para: string[] = [];
	let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

	const flushPara = () => {
		if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`);
		para = [];
	};
	const flushList = () => {
		if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
		list = null;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\s*```/.test(line)) {
			flushPara();
			flushList();
			const code: string[] = [];
			while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
			html.push(`<pre><code>${code.join('\n')}</code></pre>`);
			continue;
		}
		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		if (heading) {
			flushPara();
			flushList();
			const level = Math.min(heading[1].length + 2, 6); // inside a chat bubble: h3..h6
			html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
			continue;
		}
		const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
		const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
		if (bullet || numbered) {
			flushPara();
			const tag = bullet ? 'ul' : 'ol';
			if (list && list.tag !== tag) flushList();
			list ??= { tag, items: [] };
			list.items.push((bullet ?? numbered)![1]);
			continue;
		}
		if (!line.trim()) {
			flushPara();
			flushList();
			continue;
		}
		// A continuation line of a list item (indented) stays in the item.
		if (list && /^\s{2,}\S/.test(line)) {
			list.items[list.items.length - 1] += ` ${line.trim()}`;
			continue;
		}
		flushList();
		para.push(line);
	}
	flushPara();
	flushList();
	return html.join('');
}

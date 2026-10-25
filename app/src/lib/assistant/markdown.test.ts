import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders the usual constructs', () => {
		expect(renderMarkdown('## Étapes\n\n1. Monter **80 m**\n2. Tricoter *10 cm*\n\n- `k2tog`\n- jeté')).toBe(
			'<h4>Étapes</h4><ol><li>Monter <strong>80 m</strong></li><li>Tricoter <em>10 cm</em></li></ol><ul><li><code>k2tog</code></li><li>jeté</li></ul>'
		);
		expect(renderMarkdown('ligne 1\nligne 2')).toBe('<p>ligne 1<br>ligne 2</p>');
		expect(renderMarkdown('```\n<b>x</b>\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
	});

	it('never lets HTML or script URLs through', () => {
		const out = renderMarkdown('<img src=x onerror=alert(1)> <script>alert(1)</script>');
		expect(out).not.toMatch(/<img|<script/);
		expect(out).toContain('&lt;script&gt;');
		expect(renderMarkdown('[clic](javascript:alert(1))')).not.toContain('<a');
		expect(renderMarkdown('[x](//evil.example)')).not.toContain('<a');
		expect(renderMarkdown('[x](https://a.b/"onmouseover="y)')).not.toMatch(/"onmouseover/);
	});

	it('links to http(s) and in-app paths', () => {
		expect(renderMarkdown('[Aran](/patterns/1)')).toBe('<p><a href="/patterns/1">Aran</a></p>');
		expect(renderMarkdown('[doc](https://ex.org/a?b=1&c=2)')).toContain('href="https://ex.org/a?b=1&amp;c=2" target="_blank"');
	});

	it('copes with half-streamed input', () => {
		expect(renderMarkdown('Voici **le d')).toBe('<p>Voici **le d</p>');
		expect(renderMarkdown('```\ncode en cours')).toBe('<pre><code>code en cours</code></pre>');
	});
});

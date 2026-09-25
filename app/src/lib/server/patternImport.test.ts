import { describe, expect, it } from 'vitest';
import { titleFromFilename } from './patternImport';

describe('titleFromFilename', () => {
	it.each([
		['Pull_Aiguilles-No12_v2.pdf', 'Pull Aiguilles No12 v2'],
		['Chaussettes  de   Noël (1).pdf', 'Chaussettes de Noël'],
		['bonnet+cotes.PDF', 'bonnet cotes'],
		['___.pdf', '___']
	])('%s -> %s', (name, title) => {
		expect(titleFromFilename(name)).toBe(title);
	});

	it('caps the title at the column length', () => {
		expect(titleFromFilename(`${'a'.repeat(400)}.pdf`)).toHaveLength(255);
	});
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALPACA_LABEL, COTON_LABEL, MERINOS_LABEL } from './labelImages';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))).toString('base64');

describe('bundled label photos', () => {
	it('match the JPEG files kept in fixtures/', () => {
		expect(MERINOS_LABEL).toBe(fixture('label-merinos.jpg'));
		expect(COTON_LABEL).toBe(fixture('label-coton.jpg'));
		expect(ALPACA_LABEL).toBe(fixture('label-alpaca.jpg'));
	});
});

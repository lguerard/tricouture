import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

const generate = vi.fn<(...args: unknown[]) => Promise<string>>();
vi.mock('./ollama', () => ({ generate: (...args: unknown[]) => generate(...args) }));

const { parseLabelFields, scanYarnLabel, classifyMotif } = await import('./vision');

const png = () =>
	sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#884422' } }).png().toBuffer();

describe('parseLabelFields', () => {
	it('maps the model reply onto the stash form fields (meters)', () => {
		const raw = JSON.stringify({
			brand: 'Phildar',
			name: 'Partner 6',
			colorway: 'Rouille 052',
			fiber: '50 % laine, 50 % acrylique',
			weightCategory: 'Bulky',
			metersPerSkein: 72,
			gramsPerSkein: 50,
			needleSizeMm: 6
		});
		expect(parseLabelFields(raw)).toEqual({
			brand: 'Phildar',
			name: 'Partner 6',
			colorway: 'Rouille 052',
			fiber: '50 % laine, 50 % acrylique',
			weightCategory: 'bulky',
			yardsPerSkein: 72,
			gramsPerSkein: 50,
			needleSizeMm: 6
		});
	});

	it('converts yards when no meters are given, and drops unknown weights', () => {
		expect(parseLabelFields('{"yardsPerSkein": 220, "weightCategory": "chunky-ish"}')).toEqual({ yardsPerSkein: 201 });
	});

	it('returns nothing for an unreadable reply', () => {
		expect(parseLabelFields('<think>blurry</think> Je ne lis rien.')).toEqual({});
	});
});

describe('vision requests', () => {
	beforeEach(() => generate.mockReset());

	it('sends a downscaled image with a schema, deterministically', async () => {
		generate.mockResolvedValue('{"brand": "Drops"}');
		await expect(scanYarnLabel(await png())).resolves.toEqual({ brand: 'Drops' });
		const opts = generate.mock.calls[0][3] as { images: string[]; schema: unknown; temperature: number; think: boolean };
		expect(opts).toMatchObject({ temperature: 0, think: false });
		expect(opts.schema).toMatchObject({ type: 'object' });
		const meta = await sharp(Buffer.from(opts.images[0], 'base64')).metadata();
		expect(meta.format).toBe('jpeg');
		expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1024);
	});

	it('keeps a motif only when it is a known code', async () => {
		generate.mockResolvedValueOnce('{"motif": "stripes"}').mockResolvedValueOnce('{"motif": "tie-dye"}');
		await expect(classifyMotif(await png())).resolves.toBe('stripes');
		await expect(classifyMotif(await png())).resolves.toBeNull();
	});
});

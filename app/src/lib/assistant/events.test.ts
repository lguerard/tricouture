import { describe, expect, it } from 'vitest';
import { createSseParser, sseFrame, type AssistantEvent } from './events';

describe('SSE framing', () => {
	it('round-trips events split anywhere, skipping comments', () => {
		const got: AssistantEvent[] = [];
		const push = createSseParser((e) => got.push(e));
		const wire = `: ping\n\n${sseFrame({ t: 'delta', text: 'Bon\njour' })}${sseFrame({ t: 'tool', name: 'chercher_laines' })}${sseFrame({ t: 'done' })}`;
		for (let i = 0; i < wire.length; i += 7) push(wire.slice(i, i + 7));
		expect(got).toEqual([{ t: 'delta', text: 'Bon\njour' }, { t: 'tool', name: 'chercher_laines' }, { t: 'done' }]);
	});

	it('ignores a malformed frame', () => {
		const got: AssistantEvent[] = [];
		const push = createSseParser((e) => got.push(e));
		push('data: {oops\n\ndata: {"t":"done"}\n\n');
		expect(got).toEqual([{ t: 'done' }]);
	});
});

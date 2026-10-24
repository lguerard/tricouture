// Runs the evaluation cases against a GIVEN model, with the production
// prompts, request options (think off, the shared num_ctx, JSON schema,
// temperature 0) and parsers. Called by POST /api/cron/model-eval, which the
// server's model watch (server_setup/model-watch) uses to compare models;
// the app itself never pulls, deletes or switches models.
//
// Each case runs once at temperature 0 -- deterministic, so a score
// difference between two models is the models, not sampling noise. An
// unreadable reply scores 0 for that case.

import { generate, LONG_GENERATE_TIMEOUT_MS, type GenerateStats } from '../ollama';
import { parseJsonReply } from '../output';
import { PIECES_GENERATE_OPTIONS, parsePiecesResult } from '../pieces';
import { PATTERN_INFO_GENERATE_OPTIONS, readPatternInfoReply } from '../patternInfo';
import { MAX_TRANSLATE_CHARS, PIECES_SYSTEM, TRANSLATE_SYSTEM, patternInfoPrompt, patternInfoSystem, piecesPrompt } from '../prompts';
import { LABEL_PROMPT, LABEL_SYSTEM, imageForModel, labelGenerateOptions, parseLabelFields } from '../vision';
import { casesHash, sourceNote, TASKS, type EvalCases, type Task } from './cases';
import { scoreLabel, scorePatternInfo, scorePieces, scoreTranslation, type Scored } from './scoring';

export type TaskSummary = { score: number; n: number; failed: number; avg_seconds: number; notes: string[] };
export type EvalOutput = {
	app: 'tricouture';
	model: string;
	tasks: Partial<Record<Task, TaskSummary>>;
	eval_tokens_per_s: number | null;
	cases_hash: string;
	warnings?: string[];
};
export type CasesOnlyOutput = {
	app: 'tricouture';
	model: string;
	cases_only: true;
	tasks: Record<Task, { n: number; source: string }>;
	cases_hash: string;
	warnings?: string[];
};

const MAX_NOTES = 6;
type CaseResult = Scored & { id: string; failed: boolean; seconds: number };
type Stats = (s: GenerateStats) => void;

// One case of a task -> its score. `failed`: no usable answer at all.
async function runCase(task: Task, c: EvalCases[Task][number], model: string, onStats: Stats): Promise<Scored & { failed: boolean }> {
	// Same request as production, plus a longer timeout: the first case pays
	// for loading the model.
	const run = { timeoutMs: LONG_GENERATE_TIMEOUT_MS, onStats };
	if (task === 'label') {
		const lc = c as EvalCases['label'][number];
		const image = await imageForModel(Buffer.from(lc.image, 'base64'));
		const raw = await generate(LABEL_PROMPT, LABEL_SYSTEM, model, { ...labelGenerateOptions(image), ...run });
		if (parseJsonReply(raw) === undefined) return { score: 0, notes: ['JSON illisible'], failed: true };
		return { ...scoreLabel(parseLabelFields(raw), lc.expected), failed: false };
	}
	if (task === 'pieces') {
		const pc = c as EvalCases['pieces'][number];
		const raw = await generate(piecesPrompt(pc.context, pc.craft), PIECES_SYSTEM, model, { ...PIECES_GENERATE_OPTIONS, ...run });
		const parsed = parsePiecesResult(raw);
		if (parsed.source === 'none') return { score: 0, notes: ['aucune pièce lisible'], failed: true };
		return { ...scorePieces(parsed.pieces, pc.expected), failed: false };
	}
	if (task === 'pattern_info') {
		const ic = c as EvalCases['pattern_info'][number];
		// Only the craft is passed as a hint (the garment type is one of the
		// fields being checked). The vocabulary is the one production sends,
		// built from the person's other patterns (cases.ts vocabularyFor).
		const hints = { craft: ic.craft };
		const raw = await generate(patternInfoPrompt(ic.context, ic.vocabulary, hints), patternInfoSystem('fr'), model, {
			...PATTERN_INFO_GENERATE_OPTIONS,
			...run
		});
		const valid = typeof parseJsonReply(raw) === 'object';
		return { ...scorePatternInfo(readPatternInfoReply(raw, ic.context, hints), ic.expected, valid), failed: !valid };
	}
	const tc = c as EvalCases['translation'][number];
	const text = tc.text.slice(0, MAX_TRANSLATE_CHARS);
	const out = await generate(text, TRANSLATE_SYSTEM, model, { temperature: 0, ...run });
	return { ...scoreTranslation(text, out), failed: !out.trim() };
}

function summarize(results: CaseResult[], note: string): TaskSummary {
	const n = results.length;
	const worst = [...results].sort((a, b) => a.score - b.score).filter((r) => r.score < 100).slice(0, MAX_NOTES - 1);
	return {
		score: n ? Math.round((results.reduce((s, r) => s + r.score, 0) / n) * 10) / 10 : 0,
		n,
		failed: results.filter((r) => r.failed).length,
		avg_seconds: n ? Math.round((results.reduce((s, r) => s + r.seconds, 0) / n) * 100) / 100 : 0,
		notes: [note, ...worst.map((r) => `${r.id} : ${Math.round(r.score)}${r.notes.length ? ` — ${r.notes.slice(0, 3).join('; ')}` : ''}`)]
	};
}

export function casesOnly(model: string, cases: EvalCases, warnings: string[] = []): CasesOnlyOutput {
	const tasks = Object.fromEntries(TASKS.map((t) => [t, { n: cases[t].length, source: sourceNote(cases[t]) }])) as CasesOnlyOutput['tasks'];
	return { app: 'tricouture', model, cases_only: true, tasks, cases_hash: casesHash(cases), ...(warnings.length ? { warnings } : {}) };
}

export async function evaluateModel(model: string, cases: EvalCases, warnings: string[] = []): Promise<EvalOutput> {
	let tokens = 0;
	let ns = 0;
	const onStats: Stats = (s) => {
		tokens += s.evalCount;
		ns += s.evalDurationNs;
	};
	const tasks: EvalOutput['tasks'] = {};
	for (const task of TASKS) {
		if (!cases[task].length) continue;
		const results: CaseResult[] = [];
		for (const c of cases[task]) {
			const started = Date.now();
			let r: Scored & { failed: boolean };
			try {
				r = await runCase(task, c, model, onStats);
			} catch (e) {
				r = { score: 0, notes: [`erreur : ${String((e as Error).message).slice(0, 160)}`], failed: true };
			}
			results.push({ ...r, id: c.id, seconds: (Date.now() - started) / 1000 });
		}
		tasks[task] = summarize(results, sourceNote(cases[task]));
	}
	return {
		app: 'tricouture',
		model,
		tasks,
		eval_tokens_per_s: ns ? Math.round((tokens / (ns / 1e9)) * 10) / 10 : null,
		cases_hash: casesHash(cases),
		...(warnings.length ? { warnings } : {})
	};
}

// Orchestrates one monthly model-watch run: evaluate the current chat model
// plus a handful of GPU-affordable candidates on the exact same extraction
// task the app actually performs (pattern-pieces analysis), and decide
// whether any candidate is a clear enough improvement to switch to.
//
// Runs inside the app process (called from the admin API route below), so it
// reuses the real `generate`/`piecesPrompt`/`parsePieces` production code
// path — never a separate re-implementation that could drift out of sync.

import { generate, pullModel, deleteModel, listLocalModels, numCtx, LONG_GENERATE_TIMEOUT_MS } from '../ollama';
import { PIECES_SYSTEM, piecesPrompt } from '../prompts';
import { parsePieces, PIECES_GENERATE_OPTIONS, type ParsedPiece } from '../pieces';
import { MODEL_WATCH_CASES } from './cases';
import { scoreExtraction } from './scoring';
import { buildCandidateList, type Candidate } from './candidates';

export type CaseResult = { case: string; score: number; notes: string[]; latencyS: number };
export type EvalResult = { model: string; avgScore: number; avgLatencyS: number; cases: CaseResult[] };
export type CandidateEvalResult = EvalResult & { diskSizeGb: number };

export type ModelWatchResult =
	| { ok: false; error: string }
	| {
			ok: true;
			vramTotalGb: number;
			vramBudgetGb: number;
			baseline: EvalResult;
			candidates: CandidateEvalResult[];
			winner: string | null;
			warnings: string[];
	  };

// Same options as the production route (JSON schema, temperature 0,
// thinking off): deterministic, so a score difference between two models is
// the models, not sampling noise. Only the timeout is longer -- the first
// case pays for loading a freshly pulled model.
async function extractWithModel(model: string, text: string, craft: string): Promise<ParsedPiece[]> {
	const raw = await generate(piecesPrompt(text, craft), PIECES_SYSTEM, model, {
		...PIECES_GENERATE_OPTIONS,
		timeoutMs: LONG_GENERATE_TIMEOUT_MS
	});
	return parsePieces(raw);
}

export async function evaluateModel(model: string): Promise<EvalResult> {
	const cases: CaseResult[] = [];
	let totalScore = 0;
	let totalLatency = 0;
	for (const c of MODEL_WATCH_CASES) {
		const start = Date.now();
		let score = 0;
		let notes: string[];
		try {
			const pieces = await extractWithModel(model, c.input, c.craft);
			({ score, notes } = scoreExtraction(pieces, c.expected));
		} catch (e) {
			notes = [`Erreur : ${(e as Error).message}`];
		}
		const latencyS = Math.round(((Date.now() - start) / 1000) * 10) / 10;
		totalScore += score;
		totalLatency += latencyS;
		cases.push({ case: c.id, score, notes, latencyS });
	}
	const n = MODEL_WATCH_CASES.length;
	return {
		model,
		avgScore: Math.round((totalScore / n) * 10) / 10,
		avgLatencyS: Math.round((totalLatency / n) * 10) / 10,
		cases
	};
}

// "gemma4" and "gemma4:latest" name the same model in Ollama's store.
function normalizeTag(model: string): string {
	return model.includes(':') ? model : `${model}:latest`;
}

export async function runModelWatch(opts: {
	baselineModel: string;
	vramTotalGb: number;
	vramBudgetGb: number;
	maxCandidates: number;
	minImprovement: number;
}): Promise<ModelWatchResult> {
	const warnings: string[] = [];

	let candidateList: Candidate[];
	try {
		candidateList = await buildCandidateList(opts.vramBudgetGb, opts.maxCandidates, warnings, numCtx());
	} catch (e) {
		candidateList = [];
		warnings.push(`Découverte des candidats échouée : ${(e as Error).message}`);
	}
	// The current model has no business re-proposing itself as a "candidate".
	candidateList = candidateList.filter((c) => c.model !== opts.baselineModel);

	// Models already in the store before this run -- possibly used by another
	// app sharing the same Ollama -- are never deleted by the cleanup below.
	let preexisting: Set<string>;
	try {
		preexisting = new Set((await listLocalModels()).map(normalizeTag));
	} catch (e) {
		return { ok: false, error: `Liste des modèles Ollama indisponible : ${(e as Error).message}` };
	}

	let baseline: EvalResult;
	try {
		await pullModel(opts.baselineModel);
		baseline = await evaluateModel(opts.baselineModel);
	} catch (e) {
		return { ok: false, error: `Échec de l'évaluation du modèle actuel ${opts.baselineModel} : ${(e as Error).message}` };
	}

	const candidateResults: CandidateEvalResult[] = [];
	for (const c of candidateList) {
		try {
			await pullModel(c.model);
			const result = await evaluateModel(c.model);
			candidateResults.push({ ...result, diskSizeGb: c.diskSizeGb });
		} catch (e) {
			warnings.push(`${c.model} : échec de l'évaluation (${(e as Error).message})`);
		}
	}

	let winner: string | null = null;
	let bestScore = baseline.avgScore;
	for (const r of candidateResults) {
		if (r.avgScore > bestScore && r.avgScore >= bestScore + opts.minImprovement) {
			bestScore = r.avgScore;
			winner = r.model;
		}
	}

	// Cleanup: keep only the current model and, if there is one, the winner.
	// Other tested candidates are removed so they don't pile up disk usage --
	// but only those this run downloaded itself.
	for (const r of candidateResults) {
		if (r.model !== winner && !preexisting.has(normalizeTag(r.model))) await deleteModel(r.model);
	}

	return {
		ok: true,
		vramTotalGb: opts.vramTotalGb,
		vramBudgetGb: opts.vramBudgetGb,
		baseline,
		candidates: candidateResults,
		winner,
		warnings
	};
}

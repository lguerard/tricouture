<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { statusLabel, STATUS_ORDER } from '$lib/labels';
	import { scheduleDeadlineReminder } from '$lib/capacitor';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const p = $derived(data.project);
	const locale = $derived(data.locale);
	// 'owner' | 'edit' | 'view' — a shared project is someone else's: only its
	// owner sees the sharing panel and the delete button.
	const access = $derived(data.access);
	const isOwner = $derived(access === 'owner');
	const readOnly = $derived(access === 'view');

	onMount(() => {
		if (p.deadline && p.status !== 'fini') {
			scheduleDeadlineReminder(p.id, p.title, new Date(p.deadline));
		}
	});

	const savings = $derived(
		p.retailPriceCents != null ? (p.retailPriceCents - p.costCents) / 100 : null
	);

	function fmtHours(h: number | null): string {
		if (h == null) return '—';
		if (h < 1) return t(locale, 'projects.detail.minutesShort', { n: Math.round(h * 60) });
		return t(locale, 'projects.detail.hoursShort', { n: h.toFixed(1) });
	}

	// Hands-free voice command: records ~3 s, transcribes, +1 if a keyword is recognized.
	let listening = $state(false);
	let voiceMsg = $state('');
	let incForm = $state<HTMLFormElement | null>(null);

	async function voiceCount() {
		voiceMsg = '';
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			voiceMsg = t(locale, 'projects.detail.micDenied');
			return;
		}
		const rec = new MediaRecorder(stream);
		const chunks: Blob[] = [];
		rec.ondataavailable = (e) => chunks.push(e.data);
		rec.onstop = async () => {
			stream.getTracks().forEach((tr) => tr.stop());
			const blob = new Blob(chunks, { type: 'audio/webm' });
			const fd = new FormData();
			fd.append('file', blob, 'cmd.webm');
			try {
				const res = await fetch('/api/ai/transcribe', { method: 'POST', body: fd });
				const data = await res.json();
				if (!res.ok) {
					voiceMsg = data.error ?? t(locale, 'projects.detail.transcribeUnavailable');
					return;
				}
				const heard = (data.text ?? '').toLowerCase();
				voiceMsg = heard
					? t(locale, 'projects.detail.heardQuote', { text: heard })
					: t(locale, 'projects.detail.heardNothing');
				if (/suivant|plus un|rang|incr|\bun\b|\+/.test(heard)) incForm?.requestSubmit();
			} catch {
				voiceMsg = t(locale, 'projects.detail.networkError');
			}
		};
		listening = true;
		rec.start();
		setTimeout(() => {
			rec.stop();
			listening = false;
		}, 3000);
	}
</script>

<div class="container">
	<a href="/projects/board" class="muted">{t(locale, 'projects.detail.back')}</a>

	<header class="head">
		<h1>{p.title}</h1>
		{#if isOwner}
			<form
				method="POST"
				action="?/delete"
				onsubmit={(e) => {
					if (!confirm(t(locale, 'projects.detail.confirmDelete'))) e.preventDefault();
				}}
			>
				<button type="submit">{t(locale, 'projects.detail.delete')}</button>
			</form>
		{/if}
	</header>

	{#if !isOwner}
		<p class="shared-banner">
			{t(locale, 'projects.share.sharedWithMe')}{readOnly
				? ` — ${t(locale, 'projects.share.readOnly')}`
				: ''}
		</p>
	{/if}

	{#if data.pattern}
		<p class="muted">
			{t(locale, 'projects.detail.patternLabel')}
			<a href={`/patterns/${data.pattern.id}`}>{data.pattern.title}</a>
		</p>
	{/if}

	<div class="cols">
		<!-- Row counter -->
		<section class="card counter">
			<h2>{t(locale, 'projects.detail.counterTitle')}</h2>
			<div class="count-display">{p.currentRow}{p.totalRows ? ` / ${p.totalRows}` : ''}</div>
			<div class="bar"><div class="fill" style={`width:${p.progressPct}%`}></div></div>
			<div class="count-btns">
				<form method="POST" action="?/row" use:enhance>
					<input type="hidden" name="delta" value="-1" />
					<button type="submit" class="big">−</button>
				</form>
				<form method="POST" action="?/row" use:enhance bind:this={incForm}>
					<input type="hidden" name="delta" value="1" />
					<button type="submit" class="big btn-primary">{t(locale, 'projects.detail.addRow')}</button>
				</form>
			</div>
			<button class="voice" class:on={listening} onclick={voiceCount} disabled={listening}>
				{listening ? t(locale, 'projects.detail.micListening') : t(locale, 'projects.detail.micStart')}
			</button>
			{#if voiceMsg}<div class="muted small">{voiceMsg}</div>{/if}
			<span class="muted small">{t(locale, 'projects.detail.percentDone', { n: p.progressPct })}</span>
		</section>

		<!-- Pace & deadline prediction -->
		<section class="card">
			<h2>{t(locale, 'projects.detail.paceTitle')}</h2>
			<dl>
				<dt>{t(locale, 'projects.detail.speed')}</dt>
				<dd>
					{data.rowsPerHour
						? t(locale, 'projects.detail.rowsPerHour', { n: data.rowsPerHour.toFixed(1) })
						: t(locale, 'projects.detail.noDataYet')}
				</dd>
				<dt>{t(locale, 'projects.detail.rowsRemaining')}</dt><dd>{data.remaining ?? '—'}</dd>
				<dt>{t(locale, 'projects.detail.timeRemaining')}</dt><dd>{fmtHours(data.hoursLeft)}</dd>
				<dt>{t(locale, 'projects.detail.timeSpent')}</dt>
				<dd>
					{t(locale, 'projects.detail.timeSpentValue', {
						h: Math.floor(p.timeSpentMinutes / 60),
						m: p.timeSpentMinutes % 60
					})}
				</dd>
				{#if p.deadline}<dt>{t(locale, 'projects.detail.deadline')}</dt><dd>{p.deadline}</dd>{/if}
			</dl>
			<form
				method="POST"
				action="?/logPace"
				use:enhance={() => async ({ update }) => update({ reset: true })}
				class="pace"
			>
				<input
					name="rowsDone"
					type="number"
					placeholder={t(locale, 'projects.detail.rowsDonePlaceholder')}
					min="1"
					required
				/>
				<input
					name="minutes"
					type="number"
					placeholder={t(locale, 'projects.detail.minutesPlaceholder')}
					min="1"
					required
				/>
				<button type="submit">{t(locale, 'projects.detail.logSession')}</button>
			</form>
		</section>

		<!-- Details / editing -->
		<section class="card detail">
			<h2>{t(locale, 'projects.detail.detailsTitle')}</h2>
			<form method="POST" action="?/update" use:enhance>
				<div class="two">
					<div class="field">
						<label for="status">{t(locale, 'projects.detail.column')}</label>
						<select id="status" name="status">
							{#each STATUS_ORDER as s}<option value={s} selected={p.status === s}>{statusLabel(locale, s)}</option>{/each}
						</select>
					</div>
					<div class="field">
						<label for="progressPct">{t(locale, 'projects.detail.progress')}</label>
						<input id="progressPct" name="progressPct" type="number" min="0" max="100" value={p.progressPct} />
					</div>
				</div>
				<div class="two">
					<div class="field">
						<label for="totalRows">{t(locale, 'projects.detail.totalRows')}</label>
						<input id="totalRows" name="totalRows" type="number" min="0" value={p.totalRows ?? ''} />
					</div>
					<div class="field">
						<label for="deadline">{t(locale, 'projects.detail.deadline')}</label>
						<input id="deadline" name="deadline" type="date" value={p.deadline ?? ''} />
					</div>
				</div>
				<div class="two">
					<div class="field">
						<label for="cost">{t(locale, 'projects.detail.cost')}</label>
						<input id="cost" name="cost" type="number" step="0.01" value={(p.costCents / 100).toFixed(2)} />
					</div>
					<div class="field">
						<label for="retail">{t(locale, 'projects.detail.retail')}</label>
						<input
							id="retail"
							name="retail"
							type="number"
							step="0.01"
							value={p.retailPriceCents != null ? (p.retailPriceCents / 100).toFixed(2) : ''}
						/>
					</div>
				</div>
				{#if savings != null}
					<p class="savings">{t(locale, 'projects.detail.savingsLabel')} <strong>{savings.toFixed(2)} €</strong></p>
				{/if}
				<div class="field">
					<label for="location">{t(locale, 'projects.detail.location')}</label>
					<input id="location" name="location" value={p.location ?? ''} />
				</div>
				<div class="field">
					<label for="notes">{t(locale, 'projects.detail.notes')}</label>
					<textarea id="notes" name="notes" rows="3">{p.notes ?? ''}</textarea>
				</div>
				<input type="hidden" name="timeSpentMinutes" value={p.timeSpentMinutes} />
				<button class="btn-primary" type="submit">{t(locale, 'projects.detail.save')}</button>
			</form>
		</section>

		<!-- Materials used: logging consumption here deducts from the real stash. -->
		<section class="card detail materials">
			<h2>{t(locale, 'projects.detail.materialsTitle')}</h2>
			<p class="muted small">{t(locale, 'projects.detail.materialsHint')}</p>
			<div class="mat-cols">
				<div class="mat-col">
					<h3>{t(locale, 'projects.detail.yarnSectionTitle')}</h3>
					{#if data.usedYarns.length === 0}
						<p class="muted small">{t(locale, 'projects.detail.noYarnUsed')}</p>
					{:else}
						<ul class="used-list">
							{#each data.usedYarns as u}
								<li>
									<span>
										{[u.brand, u.name, u.colorway].filter(Boolean).join(' ') || t(locale, 'projects.detail.deletedYarn')}
										— {t(locale, 'projects.detail.skeinsAmount', { n: u.skeinsUsed })}
									</span>
									<form method="POST" action="?/undoYarnUse" use:enhance>
										<input type="hidden" name="id" value={u.id} />
										<button type="submit" class="undo" title={t(locale, 'projects.detail.undoUse')}>↩</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
					{#if data.yarnStash.length === 0}
						<p class="muted small">
							{t(locale, 'projects.detail.noYarnsInStash')} <a href="/stash">{t(locale, 'projects.detail.goToStash')}</a>
						</p>
					{:else}
						<form method="POST" action="?/useYarn" use:enhance={() => async ({ update }) => update({ reset: true })} class="use-form">
							<select name="yarnId" required>
								<option value="">{t(locale, 'projects.detail.selectYarn')}</option>
								{#each data.yarnStash as y}
									<option value={y.id}>
										{[y.brand, y.name, y.colorway].filter(Boolean).join(' ')} ({t(locale, 'projects.detail.stashRemainingSkeins', { n: y.skeins })})
									</option>
								{/each}
							</select>
							<input name="skeinsUsed" type="number" min="0" step="0.1" placeholder={t(locale, 'projects.detail.skeinsUsedPlaceholder')} required />
							<button type="submit">{t(locale, 'projects.detail.useMaterial')}</button>
						</form>
					{/if}
				</div>

				<div class="mat-col">
					<h3>{t(locale, 'projects.detail.fabricSectionTitle')}</h3>
					{#if data.usedFabrics.length === 0}
						<p class="muted small">{t(locale, 'projects.detail.noFabricUsed')}</p>
					{:else}
						<ul class="used-list">
							{#each data.usedFabrics as u}
								<li>
									<span>
										{[u.name, u.fabricType].filter(Boolean).join(' ') || t(locale, 'projects.detail.deletedFabric')}
										— {t(locale, 'projects.detail.lengthAmount', { n: u.lengthUsedCm })}
									</span>
									<form method="POST" action="?/undoFabricUse" use:enhance>
										<input type="hidden" name="id" value={u.id} />
										<button type="submit" class="undo" title={t(locale, 'projects.detail.undoUse')}>↩</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
					{#if data.fabricStash.length === 0}
						<p class="muted small">
							{t(locale, 'projects.detail.noFabricsInStash')} <a href="/stash">{t(locale, 'projects.detail.goToStash')}</a>
						</p>
					{:else}
						<form method="POST" action="?/useFabric" use:enhance={() => async ({ update }) => update({ reset: true })} class="use-form">
							<select name="fabricId" required>
								<option value="">{t(locale, 'projects.detail.selectFabric')}</option>
								{#each data.fabricStash as f}
									<option value={f.id}>
										{[f.name, f.fabricType].filter(Boolean).join(' ')} ({t(locale, 'projects.detail.stashRemainingCm', { n: f.lengthCm ?? 0 })})
									</option>
								{/each}
							</select>
							<input name="lengthUsedCm" type="number" min="0" step="1" placeholder={t(locale, 'projects.detail.lengthUsedPlaceholder')} required />
							<button type="submit">{t(locale, 'projects.detail.useMaterial')}</button>
						</form>
					{/if}
				</div>
			</div>
		</section>

	{#if isOwner}
		<section class="card detail share">
			<h2>{t(locale, 'projects.share.title')}</h2>

			{#if data.sharedWith.length === 0}
				<p class="muted">{t(locale, 'projects.share.none')}</p>
			{:else}
				<ul class="share-list">
					{#each data.sharedWith as s (s.userId)}
						<li>
							<span>
								{s.displayName}
								<span class="muted small">{s.email}</span>
							</span>
							<span class="small">
								{s.role === 'edit'
									? t(locale, 'projects.share.roleEdit')
									: t(locale, 'projects.share.roleView')}
							</span>
							<form method="POST" action="?/unshare" use:enhance>
								<input type="hidden" name="userId" value={s.userId} />
								<button type="submit">{t(locale, 'projects.share.revoke')}</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.people.length === 0}
				<p class="muted small">{t(locale, 'projects.share.noAccounts')}</p>
			{:else}
				<form
					method="POST"
					action="?/share"
					use:enhance={() => async ({ update }) => update({ reset: true })}
					class="share-form"
				>
					<label>
						{t(locale, 'projects.share.with')}
						<select name="userId" required>
							{#each data.people as u (u.id)}
								<option value={u.id}>{u.displayName} — {u.email}</option>
							{/each}
						</select>
					</label>
					<label>
						{t(locale, 'projects.share.role')}
						<select name="role">
							<option value="view">{t(locale, 'projects.share.roleView')}</option>
							<option value="edit">{t(locale, 'projects.share.roleEdit')}</option>
						</select>
					</label>
					<button type="submit">{t(locale, 'projects.share.submit')}</button>
				</form>
			{/if}
		</section>
	{/if}
	</div>
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.2rem;
		margin-top: 1rem;
	}
	.detail {
		grid-column: 1 / -1;
	}
	.counter {
		text-align: center;
	}
	.count-display {
		font-size: 3rem;
		font-weight: 700;
		color: var(--accent);
		margin: 0.4rem 0;
	}
	.count-btns {
		display: flex;
		gap: 0.6rem;
		justify-content: center;
		margin: 0.6rem 0;
	}
	.big {
		font-size: 1.3rem;
		padding: 0.6rem 1.4rem;
	}
	.voice {
		margin: 0.4rem auto;
		display: block;
	}
	.voice.on {
		background: var(--danger);
		color: #fff;
		border-color: var(--danger);
	}
	.bar {
		height: 8px;
		background: var(--accent-soft);
		border-radius: 999px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--accent);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 0.8rem;
	}
	dt {
		color: var(--muted);
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
	}
	.pace {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.8rem;
		flex-wrap: wrap;
	}
	.pace input {
		width: auto;
		flex: 1;
		min-width: 100px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
	.materials {
		margin-top: 1.2rem;
	}
	.mat-cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.2rem;
		margin-top: 0.6rem;
	}
	.mat-col h3 {
		font-size: 0.95rem;
		margin: 0 0 0.4rem;
	}
	.used-list {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.used-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 0.35rem 0.6rem;
		font-size: 0.85rem;
	}
	.used-list .undo {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		padding: 0 0.2rem;
	}
	.use-form {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.use-form select {
		flex: 2;
		min-width: 160px;
	}
	.use-form input {
		flex: 1;
		min-width: 90px;
		width: auto;
	}
	@media (max-width: 720px) {
		.mat-cols {
			grid-template-columns: 1fr;
		}
	}
	.savings {
		background: #e7f4ec;
		color: var(--ok);
		padding: 0.5rem 0.7rem;
		border-radius: var(--radius);
	}
	.small {
		font-size: 0.82rem;
	}
	@media (max-width: 720px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}

	.shared-banner {
		background: #eef3fb;
		border-radius: var(--radius);
		padding: 0.5rem 0.7rem;
		font-size: 0.9rem;
	}
	.share-list {
		list-style: none;
		padding: 0;
		margin: 0 0 0.8rem;
		display: grid;
		gap: 0.4rem;
	}
	.share-list li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.share-form {
		display: flex;
		gap: 0.6rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}
</style>

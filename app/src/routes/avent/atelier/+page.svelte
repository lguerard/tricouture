<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { t } from '$lib/i18n';
	import { mediaUrl } from '$lib/media';
	import { ADVENT_TODO, ADVENT_TODO_AUTO, NOTIFY_MODES, groupTodos, normalizeCode, type AdventYarn } from '$lib/advent';

	let { data } = $props();
	const locale = $derived(data.locale);
	const YARN_ROWS = 4; // kept in sync with +page.server.ts

	type Day = (typeof data.days)[number];
	const patternById = $derived(new Map(data.myPatterns.map((p) => [p.id, p])));

	// What is missing or risky for a day, shown on its chip and in its form.
	function issues(d: Day): string[] {
		const out: string[] = [];
		if (!d.hint) out.push(t(locale, 'advent.ws.noHint'));
		if (!d.code) out.push(t(locale, 'advent.ws.noCode'));
		if (!d.patternId) out.push(t(locale, 'advent.ws.noPattern'));
		if (d.patternId && patternById.get(d.patternId)?.isShared) out.push(t(locale, 'advent.ws.sharedPattern'));
		if (!d.yarns.length) out.push(t(locale, 'advent.ws.noYarn'));
		const c = d.code ? normalizeCode(d.code) : '';
		if (c && data.days.some((o) => o.day !== d.day && o.code && normalizeCode(o.code) === c)) out.push(t(locale, 'advent.ws.dupCode'));
		return out;
	}
	const readyCount = $derived(data.days.filter((d) => !issues(d).length).length);
	const openedCount = $derived(data.days.filter((d) => d.openedAt).length);

	function yarnRow(d: Day, i: number): Partial<AdventYarn> {
		return d.yarns[i] ?? {};
	}
	function fmt(iso: Date | string | null) {
		return iso ? new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
	}
	let previewDate = $state('');
	$effect(() => {
		if (!previewDate && data.calendar) previewDate = `${data.calendar.year}-12-01`;
	});
	let openDay = $state<number | null>(null);

	// Preparation checklist: ticked ids are stored on the calendar; "fill" ticks
	// itself once the 24 days are complete.
	function isDone(id: string): boolean {
		if (id === 'fill') return readyCount === data.days.length && data.days.length > 0;
		return !!data.calendar?.todoDone.includes(id);
	}
	const custom = $derived(data.calendar?.todoCustom ?? []);
	const customGroups = $derived(groupTodos(custom));
	const allTodoIds = $derived([...ADVENT_TODO.flatMap((g) => g.ids), ...custom.map((c) => c.id)]);
	const todoTotal = $derived(allTodoIds.length);
	const todoDoneCount = $derived(allTodoIds.filter(isDone).length);
	let todoText = $state('');
</script>

<div class="container">
	<header class="head">
		<div>
			<h1>✨ {t(locale, 'advent.workshop.title')}</h1>
			<p class="muted">{t(locale, 'advent.workshop.subtitle')}</p>
		</div>
		{#if data.calendars.length > 1}
			<nav class="cals">
				{#each data.calendars as c}
					<a class:on={c.id === data.calendar?.id} href="?c={c.id}">{c.title} · {c.recipientName} · {c.year}</a>
				{/each}
			</nav>
		{/if}
	</header>

	{#if data.canCreate}
		<details class="card create" open={!data.calendar}>
			<summary>{t(locale, 'advent.ws.new')}</summary>
			<form method="POST" action="?/create" use:enhance={withFeedback()}>
				<div class="row">
					<div class="field">
						<label for="rcp">{t(locale, 'advent.ws.recipient')}</label>
						<select id="rcp" name="recipientId" required>
							<option value="">—</option>
							{#each data.people as p}<option value={p.id}>{p.displayName}</option>{/each}
						</select>
					</div>
					<div class="field">
						<label for="yr">{t(locale, 'advent.ws.year')}</label>
						<input id="yr" name="year" type="number" min="2020" max="2100" value={data.thisYear} required />
					</div>
					<div class="field grow">
						<label for="ttl">{t(locale, 'advent.ws.calTitle')}</label>
						<input id="ttl" name="title" placeholder={t(locale, 'advent.ws.calTitlePh')} />
					</div>
				</div>
				<button class="btn-primary" type="submit">{t(locale, 'advent.ws.create')}</button>
			</form>
		</details>
	{/if}

	{#if data.calendar}
		<section class="card">
			<form method="POST" action="?/saveCalendar" use:enhance={withFeedback({ success: 'toast.saved' })} class="calform">
				<input type="hidden" name="calendarId" value={data.calendar.id} />
				<div class="field">
					<label for="ct">{t(locale, 'advent.ws.calTitle')}</label>
					<input id="ct" name="title" value={data.calendar.title} />
				</div>
				<div class="field">
					<label for="cm">{t(locale, 'advent.ws.calMessage')}</label>
					<textarea id="cm" name="message" rows="2">{data.calendar.message ?? ''}</textarea>
				</div>
				<label class="check"><input id="reveal" type="checkbox" name="revealEarly" checked={data.calendar.revealEarly} /> {t(locale, 'advent.ws.revealEarly')}</label>
				<div class="field">
					<label for="notify">{t(locale, 'advent.ws.notify')}</label>
					<select id="notify" name="notify" value={data.calendar.notify}>
						{#each NOTIFY_MODES as m}<option value={m}>{t(locale, `advent.ws.notify.${m}`)}</option>{/each}
					</select>
					<span class="muted small">{t(locale, 'advent.ws.notifyHelp')}</span>
				</div>
				<div class="row">
					<div class="field">
						<label for="ntw">{t(locale, 'advent.ws.notifyTimeWeek')}</label>
						<input id="ntw" name="notifyTimeWeek" type="time" value={data.calendar.notifyTimeWeek} />
					</div>
					<div class="field">
						<label for="ntwe">{t(locale, 'advent.ws.notifyTimeWeekend')}</label>
						<input id="ntwe" name="notifyTimeWeekend" type="time" value={data.calendar.notifyTimeWeekend} />
					</div>
				</div>
				<p class="muted small">{data.calendar.revealEarly ? t(locale, 'advent.ws.revealedNow') : t(locale, 'advent.ws.hiddenUntil', { year: data.calendar.year })}</p>
				<button type="submit">{t(locale, 'advent.ws.save')}</button>
			</form>
			<div class="summary">
				<span>{t(locale, 'advent.ws.ready', { n: readyCount })}</span>
				<span>{t(locale, 'advent.ws.openedCount', { n: openedCount })}</span>
				<form method="GET" action="/avent" class="prev">
					<input type="hidden" name="preview" value={data.calendar.id} />
					<label for="pd">{t(locale, 'advent.preview.date')}</label>
					<input id="pd" type="date" name="date" bind:value={previewDate} />
					<button type="submit" class="btn-primary">👁️ {t(locale, 'advent.ws.preview')}</button>
				</form>
			</div>
			<div class="chips">
				{#each data.days as d}
					{@const iss = issues(d)}
					<a
						href="#day-{d.day}"
						class="chip"
						class:ok={!iss.length}
						class:opened={!!d.openedAt}
						class:main={d.isMain}
						title={d.openedAt ? t(locale, 'advent.ws.openedOn', { date: fmt(d.openedAt) }) : iss.join(' · ') || t(locale, 'advent.ws.complete')}
						onclick={() => (openDay = d.day)}>{d.day}</a
					>
				{/each}
			</div>
			<p class="muted small">{t(locale, 'advent.ws.legend')}</p>
		</section>

		<section class="card todo">
			<h2>{t(locale, 'advent.todo.title')} <small class="muted">{t(locale, 'advent.todo.progress', { n: todoDoneCount, total: todoTotal })}</small></h2>
			{#each ADVENT_TODO as g}
				<h3>{t(locale, `advent.todo.phase.${g.phase}`)}</h3>
				<ul>
					{#each g.ids as id}
						{@const auto = ADVENT_TODO_AUTO.has(id)}
						{@const done = isDone(id)}
						<li class:done>
							<form method="POST" action="?/toggleTodo" use:enhance={() => async ({ update }) => update({ reset: false, invalidateAll: true })}>
								<input type="hidden" name="calendarId" value={data.calendar.id} />
								<input type="hidden" name="id" value={id} />
								<label class="item">
									<input
										id="todo-{id}"
										type="checkbox"
										name="done"
										checked={done}
										disabled={auto}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									/>
									<span>
										<b>{t(locale, `advent.todo.${id}`)}</b>
										<span class="muted small">{t(locale, `advent.todo.${id}.note`)}{auto ? ' ' + t(locale, 'advent.todo.auto') : ''}</span>
									</span>
								</label>
							</form>
						</li>
					{/each}
				</ul>
			{/each}
			{#each customGroups as g}
				<h3>{g.group || t(locale, 'advent.todo.mine')}</h3>
				<ul>
					{#each g.items as item (item.id)}
						{@const done = isDone(item.id)}
						<li class:done class="custom">
							<form method="POST" action="?/toggleTodo" use:enhance={() => async ({ update }) => update({ reset: false, invalidateAll: true })}>
								<input type="hidden" name="calendarId" value={data.calendar.id} />
								<input type="hidden" name="id" value={item.id} />
								<label class="item">
									<input id="todo-{item.id}" type="checkbox" name="done" checked={done} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
									<span>
										<b>{item.title}</b>
										{#if item.note}<span class="muted small">{item.note}</span>{/if}
									</span>
								</label>
							</form>
							<form method="POST" action="?/deleteTodo" use:enhance={() => async ({ update }) => update({ reset: false, invalidateAll: true })}>
								<input type="hidden" name="calendarId" value={data.calendar.id} />
								<input type="hidden" name="id" value={item.id} />
								<button type="submit" class="del" aria-label={t(locale, 'advent.todo.delete', { title: item.title })} title={t(locale, 'advent.todo.delete', { title: item.title })}>×</button>
							</form>
						</li>
					{/each}
				</ul>
			{/each}
			<details class="add-todo">
				<summary>{t(locale, 'advent.todo.add')}</summary>
				<form method="POST" action="?/addTodos" use:enhance={withFeedback({ success: 'toast.saved', inner: () => async ({ update }) => { await update({ reset: false, invalidateAll: true }); todoText = ''; } })}>
					<input type="hidden" name="calendarId" value={data.calendar.id} />
					<label for="todo-text">{t(locale, 'advent.todo.addLabel')}</label>
					<textarea id="todo-text" name="text" rows="6" bind:value={todoText} placeholder={t(locale, 'advent.todo.addPh')}></textarea>
					<p class="muted small">{t(locale, 'advent.todo.addHelp')}</p>
					<button type="submit" class="btn-primary" disabled={!todoText.trim()}>{t(locale, 'advent.todo.addBtn')}</button>
				</form>
			</details>
		</section>

		{#each data.days as d (d.day)}
			{@const iss = issues(d)}
			<details class="card day" id="day-{d.day}" open={openDay === d.day}>
				<summary>
					<span class="dn">{d.day}</span>
					<span class="dt">{d.title || t(locale, 'advent.ws.untitled')}</span>
					{#if d.isMain}<span class="badge gold">✦ {t(locale, 'advent.main')}</span>{/if}
					{#if d.openedAt}<span class="badge open">🔓 {fmt(d.openedAt)}</span>
					{:else if iss.length}<span class="badge warn">{iss.length} ⚠</span>
					{:else}<span class="badge ok">✓</span>{/if}
				</summary>
				{#if iss.length}<ul class="issues">{#each iss as i}<li>{i}</li>{/each}</ul>{/if}
				<form method="POST" action="?/saveDay" enctype="multipart/form-data" use:enhance={withFeedback({ success: 'toast.saved', inner: () => async ({ update }) => update({ reset: false }) })}>
					<input type="hidden" name="calendarId" value={data.calendar.id} />
					<input type="hidden" name="day" value={d.day} />
					<div class="row">
						<div class="field grow">
							<label for="t{d.day}">{t(locale, 'advent.ws.dayTitle')}</label>
							<input id="t{d.day}" name="title" value={d.title ?? ''} placeholder={t(locale, 'advent.ws.dayTitlePh')} />
						</div>
						<label class="check"><input type="checkbox" name="isMain" checked={d.isMain} /> ✦ {t(locale, 'advent.main')}</label>
					</div>
					<div class="row">
						<div class="field grow">
							<label for="p{d.day}">{t(locale, 'advent.ws.pattern')}</label>
							<select id="p{d.day}" name="patternId" value={d.patternId ?? ''}>
								<option value="">—</option>
								{#each data.myPatterns as p}<option value={p.id}>{p.title}{p.isShared ? t(locale, 'advent.ws.sharedMark') : ''}</option>{/each}
							</select>
						</div>
						<div class="field">
							<label for="c{d.day}">{t(locale, 'advent.ws.code')}</label>
							<input id="c{d.day}" name="code" value={d.code ?? ''} autocomplete="off" />
						</div>
					</div>
					<div class="field">
						<label for="h{d.day}">{t(locale, 'advent.ws.hint')}</label>
						<textarea id="h{d.day}" name="hint" rows="3" placeholder={t(locale, 'advent.ws.hintPh')}>{d.hint ?? ''}</textarea>
					</div>
					<div class="row">
						<div class="field grow">
							<label for="ph{d.day}">{t(locale, 'advent.ws.hintPhoto')}</label>
							<input id="ph{d.day}" type="file" name="hintPhoto" accept="image/jpeg,image/png,image/webp" />
						</div>
						{#if d.hintPhotoPath}
							<img class="thumb" src={mediaUrl(d.hintPhotoPath, 200)} alt="" />
							<label class="check"><input type="checkbox" name="removePhoto" /> {t(locale, 'advent.ws.removePhoto')}</label>
						{/if}
					</div>
					<fieldset>
						<legend>{t(locale, 'advent.ws.yarns')}</legend>
						<div class="yarn-head">
							<span>{t(locale, 'advent.ws.y.brand')}</span><span>{t(locale, 'advent.ws.y.name')}</span><span>{t(locale, 'advent.ws.y.colorway')}</span><span>{t(locale, 'advent.ws.y.color')}</span><span>{t(locale, 'advent.ws.y.skeins')}</span><span>{t(locale, 'advent.ws.y.grams')}</span><span>{t(locale, 'advent.ws.y.meters')}</span><span>{t(locale, 'advent.ws.y.weight')}</span><span>{t(locale, 'advent.ws.y.fiber')}</span>
						</div>
						{#each Array(YARN_ROWS) as _, i}
							{@const y = yarnRow(d, i)}
							<div class="yarn">
								<input name="y{i}_brand" value={y.brand ?? ''} placeholder="DROPS" aria-label={t(locale, 'advent.ws.y.brand')} />
								<input name="y{i}_name" value={y.name ?? ''} placeholder="Lima" aria-label={t(locale, 'advent.ws.y.name')} />
								<input name="y{i}_colorway" value={y.colorway ?? ''} aria-label={t(locale, 'advent.ws.y.colorway')} />
								<span class="color">
									<input
										type="color"
										value={y.colorHex || '#d9c7a7'}
										aria-label={t(locale, 'advent.ws.y.color')}
										oninput={(e) => {
											const text = e.currentTarget.nextElementSibling as HTMLInputElement;
											text.value = e.currentTarget.value;
										}}
									/>
									<input
										name="y{i}_colorHex"
										value={y.colorHex ?? ''}
										placeholder="#d9c7a7"
										maxlength="7"
										spellcheck="false"
										autocomplete="off"
										aria-label={t(locale, 'advent.ws.y.colorCode')}
										oninput={(e) => {
											const v = e.currentTarget.value.trim();
											const hex = /^#?[0-9a-f]{6}$/i.test(v) ? (v.startsWith('#') ? v : '#' + v) : null;
											if (hex) (e.currentTarget.previousElementSibling as HTMLInputElement).value = hex.toLowerCase();
										}}
									/>
								</span>
								<input name="y{i}_skeins" inputmode="decimal" value={y.skeins ?? ''} aria-label={t(locale, 'advent.ws.y.skeins')} />
								<input name="y{i}_grams" inputmode="numeric" value={y.gramsPerSkein ?? ''} aria-label={t(locale, 'advent.ws.y.grams')} />
								<input name="y{i}_meters" inputmode="numeric" value={y.metersPerSkein ?? ''} aria-label={t(locale, 'advent.ws.y.meters')} />
								<input name="y{i}_weight" value={y.weightCategory ?? ''} placeholder="DK" aria-label={t(locale, 'advent.ws.y.weight')} />
								<input name="y{i}_fiber" value={y.fiber ?? ''} aria-label={t(locale, 'advent.ws.y.fiber')} />
							</div>
						{/each}
					</fieldset>
					<div class="field">
						<label for="m{d.day}">{t(locale, 'advent.ws.message')}</label>
						<textarea id="m{d.day}" name="message" rows="2" placeholder={t(locale, 'advent.ws.messagePh')}>{d.message ?? ''}</textarea>
					</div>
					<button class="btn-primary" type="submit">{t(locale, 'advent.ws.save')}</button>
				</form>
			</details>
		{/each}
	{/if}
</div>

<style>
	.container { display: grid; gap: 1rem; }
	.head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: end; }
	.head h1 { margin: 0; }
	.cals { display: flex; gap: 0.4rem; flex-wrap: wrap; }
	.cals a { padding: 0.3rem 0.7rem; border-radius: 99px; border: 1px solid var(--border); font-size: 0.85rem; }
	.cals a.on { background: var(--accent-soft); border-color: var(--accent); }
	.row { display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: end; }
	.field { display: grid; gap: 0.25rem; min-width: 0; }
	.grow { flex: 1 1 220px; }
	.check { display: flex; gap: 0.4rem; align-items: center; white-space: nowrap; padding-bottom: 0.5rem; }
	.check input { width: auto; }
	form { display: grid; gap: 0.8rem; }
	.create summary, .day summary { cursor: pointer; font-weight: 600; }
	.calform { margin-bottom: 0.8rem; }
	.summary { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
	.prev { display: flex; gap: 0.5rem; align-items: center; margin-left: auto; flex-wrap: wrap; }
	.prev input { width: auto; }
	.chips { display: grid; grid-template-columns: repeat(12, 1fr); gap: 6px; margin-top: 0.8rem; }
	@media (max-width: 640px) { .chips { grid-template-columns: repeat(6, 1fr); } }
	.chip {
		text-align: center;
		padding: 0.45rem 0;
		border-radius: 8px;
		background: var(--warn-soft);
		color: var(--text);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-decoration: none;
		border: 2px solid transparent;
	}
	.chip.ok { background: var(--ok-soft); }
	.chip.main { border-color: #c8973a; }
	.chip.opened { background: var(--accent-soft); }
	.small { font-size: 0.85rem; }
	.day summary { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
	.dn { font-weight: 800; min-width: 2ch; font-variant-numeric: tabular-nums; color: var(--accent); }
	.dt { flex: 1; min-width: 0; }
	.badge { font-size: 0.75rem; border-radius: 99px; padding: 0.1rem 0.55rem; font-weight: 600; }
	.badge.gold { background: #f6e5bd; color: #6b4a12; }
	.badge.warn { background: var(--warn-soft); }
	.badge.ok { background: var(--ok-soft); }
	.badge.open { background: var(--accent-soft); }
	.day[open] summary { margin-bottom: 0.8rem; }
	.issues { margin: 0 0 0.8rem; padding-left: 1.2rem; color: var(--warn); font-size: 0.9rem; }
	.thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; }
	fieldset { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.6rem 0.8rem; display: grid; gap: 0.4rem; min-width: 0; overflow-x: auto; }
	.yarn, .yarn-head {
		display: grid;
		grid-template-columns: 1fr 1fr 1.2fr 118px 64px 64px 64px 72px 1.2fr;
		gap: 0.35rem;
		min-width: 760px;
	}
	.yarn-head span { font-size: 0.75rem; color: var(--muted); }
	.color { display: flex; gap: 4px; align-items: center; min-width: 0; }
	.color input[type='color'] { padding: 2px; height: 2.2rem; width: 36px; flex: none; }
	.color input:not([type='color']) { min-width: 0; font-family: ui-monospace, monospace; font-size: 0.85rem; }
	.todo h2 { margin: 0 0 0.4rem; font-size: 1.1rem; display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
	.todo h3 { margin: 0.8rem 0 0.2rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
	.todo ul { list-style: none; margin: 0; padding: 0; }
	.todo li { border-top: 1px solid var(--border); }
	.todo li:first-child { border-top: 0; }
	.todo form { display: block; }
	.item { display: grid; grid-template-columns: 22px 1fr; gap: 0.6rem; padding: 0.45rem 0; cursor: pointer; align-items: start; }
	.item input { width: 18px; height: 18px; margin-top: 3px; }
	.item > span { display: grid; min-width: 0; }
	.todo li.done b { text-decoration: line-through; color: var(--muted); }
	.todo li.custom { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 0.4rem; }
	.del { border: 0; background: transparent; color: var(--muted); font-size: 1.2rem; line-height: 1; padding: 0.45rem 0.4rem; cursor: pointer; }
	.del:hover { color: var(--danger); }
	.add-todo { margin-top: 0.8rem; }
	.add-todo summary { cursor: pointer; font-weight: 600; color: var(--accent); }
	.add-todo form { margin-top: 0.6rem; }
	.add-todo textarea { font-family: ui-monospace, monospace; font-size: 0.85rem; }
</style>

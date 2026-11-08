// Wire protocol of POST /api/ai/assistant, shared by the server and the chat
// panel. The answer is a stream of Server-Sent-Events frames over the POST
// response ("data: {json}\n\n", plus ": ping" comments while the request waits
// for the GPU): SSE framing is what reverse proxies and tunnels (Cloudflare,
// nginx) pass through unbuffered, and a fetch() body reader works the same in
// a browser and in the Android WebView.

export type RefKind = 'pattern' | 'project' | 'yarn';

// Something a tool found: shown as a card under the answer.
export type AssistantRef = {
	kind: RefKind;
	id: string;
	title: string;
	subtitle?: string;
	href: string;
	image?: string | null;
};

// Something a tool changed, shown as a link under the answer: what was done
// (`kind`) to what kind of object (`what`), named `title`.
export type AssistantActionKind = 'created' | 'updated' | 'deleted' | 'note_added' | 'cover_found';
export type AssistantWhat =
	| 'pattern'
	| 'project'
	| 'yarn'
	| 'fabric'
	| 'notion'
	| 'tool'
	| 'goal'
	| 'bin'
	| 'recipient'
	| 'moodboard'
	| 'patch'
	| 'tag';
export type AssistantAction = { kind: AssistantActionKind; what: AssistantWhat; title: string; href: string };

export type AssistantErrorCode = 'timeout' | 'unavailable' | 'failed';

export type AssistantEvent =
	| { t: 'delta'; text: string }
	| { t: 'tool'; name: string }
	| { t: 'refs'; items: AssistantRef[] }
	| { t: 'action'; action: AssistantAction }
	| { t: 'error'; code: AssistantErrorCode; message: string }
	| { t: 'done' };

// What the panel may attach to a question: the object open on screen.
export type AssistantContext = { kind: RefKind; id: string; title?: string; row?: number };

export type WireMessage = { role: 'user' | 'assistant'; content: string };

export function sseFrame(event: AssistantEvent): string {
	return `data: ${JSON.stringify(event)}\n\n`;
}

// Incremental parser for the frames above: feed it decoded text chunks in any
// split, it calls onEvent once per complete frame. Comments and unknown
// fields are ignored.
export function createSseParser(onEvent: (e: AssistantEvent) => void): (chunk: string) => void {
	let buffer = '';
	return (chunk) => {
		buffer += chunk.replace(/\r\n/g, '\n');
		let end: number;
		while ((end = buffer.indexOf('\n\n')) !== -1) {
			const frame = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			const data = frame
				.split('\n')
				.filter((l) => l.startsWith('data:'))
				.map((l) => l.slice(5).replace(/^ /, ''))
				.join('\n');
			if (!data) continue;
			try {
				onEvent(JSON.parse(data) as AssistantEvent);
			} catch {
				// a malformed frame is skipped, the stream goes on
			}
		}
	};
}

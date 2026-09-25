const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres rejects a malformed uuid with an error (a 500), so ids coming from
// a URL or a form are checked first and answered with a plain 404.
export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}

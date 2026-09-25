// URL of a stored file; `width` asks /media for a cached WebP thumbnail.
export function mediaUrl(path: string, width?: 200 | 400 | 800): string {
	return width ? `/media/${path}?w=${width}` : `/media/${path}`;
}

// Access Capacitor plugins from the WebView.
// Uses the global bridge injected by the native shell — no Node imports.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isCapacitor(): boolean {
	return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

function plugin(name: string): any {
	return (window as any)?.Capacitor?.Plugins?.[name];
}

// Barcode scanner (ML Kit). Returns the first scanned code, or null.
export async function scanBarcode(): Promise<string | null> {
	if (!isCapacitor()) return null;
	const BarcodeScanner = plugin('BarcodeScanner');
	if (!BarcodeScanner) return null;
	try {
		await BarcodeScanner.requestPermissions();
		const { barcodes } = await BarcodeScanner.scan({
			formats: ['QR_CODE', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39']
		});
		return barcodes?.[0]?.rawValue ?? null;
	} catch {
		return null;
	}
}

// Local notifications — schedules a reminder for a project deadline.
export async function scheduleDeadlineReminder(
	projectId: string,
	projectTitle: string,
	deadlineDate: Date,
	daysBeforeAlert = 3
): Promise<void> {
	if (!isCapacitor()) return;
	const LocalNotifications = plugin('LocalNotifications');
	if (!LocalNotifications) return;

	const perms = await LocalNotifications.requestPermissions().catch(() => ({ display: 'denied' }));
	if (perms.display !== 'granted') return;

	const alertAt = new Date(deadlineDate.getTime() - daysBeforeAlert * 86_400_000);
	if (alertAt <= new Date()) return; // alert time already passed

	const id = Math.abs(projectId.split('').reduce((acc, c) => acc ^ c.charCodeAt(0), 0)) % 2_147_483_647;

	await LocalNotifications.schedule({
		notifications: [
			{
				id,
				title: `⏰ Deadline in ${daysBeforeAlert} days`,
				body: projectTitle,
				schedule: { at: alertAt },
				extra: { projectId }
			}
		]
	}).catch(() => {});
}

// Cancel all scheduled notifications for a project.
export async function cancelDeadlineReminder(projectId: string): Promise<void> {
	if (!isCapacitor()) return;
	const LocalNotifications = plugin('LocalNotifications');
	if (!LocalNotifications) return;
	const id = Math.abs(projectId.split('').reduce((acc, c) => acc ^ c.charCodeAt(0), 0)) % 2_147_483_647;
	await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
}

// Advent calendar: (re)schedules the recipient's notifications on the phone.
// Idempotent: the 24 possible ids are cancelled first, then the plan is
// scheduled again, so changing the mode in the workshop is picked up on the
// next app start. Tapping a notification opens /avent.
export async function scheduleAdventNotifications(
	plan: { id: number; title: string; body: string; at: Date }[],
	allIds: number[]
): Promise<void> {
	if (!isCapacitor()) return;
	const LocalNotifications = plugin('LocalNotifications');
	if (!LocalNotifications) return;
	await LocalNotifications.cancel({ notifications: allIds.map((id) => ({ id })) }).catch(() => {});
	if (!plan.length) return;
	const perms = await LocalNotifications.requestPermissions().catch(() => ({ display: 'denied' }));
	if (perms.display !== 'granted') return;
	await LocalNotifications.schedule({
		notifications: plan.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, extra: { href: '/avent' } }))
	}).catch(() => {});
}

let tapListener = false;
// Opens the page a notification points to when it is tapped.
export function listenNotificationTaps(go: (href: string) => void): void {
	if (!isCapacitor() || tapListener) return;
	const LocalNotifications = plugin('LocalNotifications');
	if (!LocalNotifications?.addListener) return;
	tapListener = true;
	LocalNotifications.addListener('localNotificationActionPerformed', (e: any) => {
		const href = e?.notification?.extra?.href;
		if (typeof href === 'string' && href.startsWith('/')) go(href);
	});
}

// Material You : couleur principale du fond d'écran (Android 12 et plus),
// donnée par le plugin SystemColors de l'app (mobile/native). Sinon, la
// raison : site ouvert dans un navigateur, app trop ancienne (sans le
// plugin) ou Android d'avant la 12.
export type SystemColors = { accent: string } | { accent: null; missing: 'web' | 'app' | 'android' };

export async function systemColors(): Promise<SystemColors> {
	if (!isCapacitor()) return { accent: null, missing: 'web' };
	const SystemColors = plugin('SystemColors');
	if (!SystemColors) return { accent: null, missing: 'app' };
	try {
		const { accent } = await SystemColors.get();
		if (typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent)) return { accent };
	} catch {
		// plugin en erreur : comme un Android trop ancien
	}
	return { accent: null, missing: 'android' };
}

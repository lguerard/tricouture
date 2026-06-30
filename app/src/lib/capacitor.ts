// Accès aux plugins Capacitor depuis le WebView.
// Utilise le bridge global injecté par la coque native — aucun import Node.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isCapacitor(): boolean {
	return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

function plugin(name: string): any {
	return (window as any)?.Capacitor?.Plugins?.[name];
}

// Barcode scanner (ML Kit). Retourne le premier code scanné, ou null.
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

// Notifications locales — planifie un rappel pour une deadline de projet.
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
	if (alertAt <= new Date()) return; // délai déjà passé

	const id = Math.abs(projectId.split('').reduce((acc, c) => acc ^ c.charCodeAt(0), 0)) % 2_147_483_647;

	await LocalNotifications.schedule({
		notifications: [
			{
				id,
				title: `⏰ Deadline dans ${daysBeforeAlert} jours`,
				body: projectTitle,
				schedule: { at: alertAt },
				extra: { projectId }
			}
		]
	}).catch(() => {});
}

// Annule toutes les notifications planifiées pour un projet.
export async function cancelDeadlineReminder(projectId: string): Promise<void> {
	if (!isCapacitor()) return;
	const LocalNotifications = plugin('LocalNotifications');
	if (!LocalNotifications) return;
	const id = Math.abs(projectId.split('').reduce((acc, c) => acc ^ c.charCodeAt(0), 0)) % 2_147_483_647;
	await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
}

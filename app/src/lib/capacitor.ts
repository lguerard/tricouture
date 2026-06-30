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

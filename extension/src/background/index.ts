export default defineBackground(() => {
	chrome.alarms.create("keepalive", { periodInMinutes: 0.4 });
	chrome.alarms.onAlarm.addListener(() => {
		// Step 0 keepalive wakeup for MV3 lifecycle stability.
	});
});


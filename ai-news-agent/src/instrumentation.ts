// Start de ingebouwde dagelijkse planner zodra de Node.js-server opstart.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { config } = await import("./lib/config");
  if (!config.schedulerEnabled) return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}

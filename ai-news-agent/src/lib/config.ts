// Serverconfiguratie uit environment variables. Alleen server-side importeren.

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const config = {
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || null;
  },
  get model() {
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
  },
  get effort(): Effort {
    const e = process.env.AI_EFFORT?.trim();
    return e === "low" || e === "medium" || e === "high" || e === "xhigh" || e === "max" ? e : "medium";
  },
  get databasePath() {
    return process.env.DATABASE_PATH?.trim() || "./data/news.db";
  },
  get schedulerEnabled() {
    return process.env.SCHEDULER_ENABLED?.trim() !== "false";
  },
  get cronSecret() {
    return process.env.CRON_SECRET?.trim() || null;
  },
  get resendKey() {
    return process.env.RESEND_API_KEY?.trim() || null;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM?.trim() || "AI News Agent <onboarding@resend.dev>";
  },
  get dashboardPassword() {
    return process.env.DASHBOARD_PASSWORD?.trim() || null;
  },
};

export function aiAvailable(): boolean {
  return config.anthropicKey !== null;
}

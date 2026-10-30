// Handmatig (of via systeem-cron) een nieuwsbrief genereren vanaf de command line:
//   npm run digest          → alleen als er vandaag nog geen is
//   npm run digest:force    → altijd een nieuwe versie
import { defaultDeps, runPipeline } from "../src/lib/pipeline";

const force = process.argv.includes("--force");
const result = await runPipeline({ trigger: "cli", force }, await defaultDeps());
console.log(`\n${result.status.toUpperCase()}: ${result.message}`);
process.exit(result.status === "failed" ? 1 : 0);

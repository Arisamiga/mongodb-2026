// Loads the repo-root .env, wherever a script is started from. Import this first.
// quiet: dotenv prints nothing. Variables already set in the real environment win, which is
// how tests and deployments override .env without editing it.
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

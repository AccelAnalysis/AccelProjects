import "dotenv/config";
import { lifecycleDiagnostics } from "../server/lifecycleAdminService.js";

const result = await lifecycleDiagnostics();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

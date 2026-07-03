export { Requirement, RequirementCategory, RequirementSeverity, SpecFile } from "./schema.js";
export { parseSpec, getRequirementIds, SpecParseError } from "./parser.js";
export { recordCoverage, readCoverage, resetCoverage, getCoveragePath } from "./coverage.js";
export type { CoverageEntry } from "./coverage.js";
export { buildReport, renderMarkdown } from "./report.js";
export type { CoverageReport } from "./report.js";
export { plugin as eslintPlugin, requireExpectInSpecTest } from "./eslint-rule.js";

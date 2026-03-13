export {
  createEntry,
  getEntry,
  listEntries,
  updateEntry,
  searchEntries,
  getEntriesByTicket,
  getPromotionCandidates,
  recordValidation,
} from "./knowledge-store";
export type {
  CreateKnowledgeEntryInput,
  KnowledgeFilter,
} from "./knowledge-store";
export { extractPatterns } from "./pattern-extractor";
export type { TaskResult } from "./pattern-extractor";
export { evaluateForPromotion } from "./promotion.service";
export type { PromotionEvaluation } from "./promotion.service";

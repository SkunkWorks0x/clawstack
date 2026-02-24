/**
 * ClawMemory — Unified Intelligent Memory Layer
 * "Your agent never forgets. Your tokens never bloat."
 *
 * Smart Capture: identify what's worth remembering (entities + relations)
 * Knowledge Graph: structured storage with N-hop traversal
 * Token-Budgeted Recall: capped memory injection within hard token limits
 * Graceful Compaction: pre-compaction extraction, post-compaction injection
 * Cross-Product Integration: ClawGuard threats, ClawBudget costs, ClawPipe results
 *
 * All memories stored in Agent Session Graph (memory_entities, memory_relations).
 * No separate graph DB — SQLite is the graph store. Local-first.
 */
export { SmartCapture } from './smart-capture.js';
export { KnowledgeGraph } from './knowledge-graph.js';
export { TokenRecall } from './token-recall.js';
export { GracefulCompaction } from './graceful-compaction.js';
export { CrossProductIntegration } from './cross-product.js';
export type { ExtractionResult, ExtractedEntity, ExtractedRelation, CaptureOptions, GraphNode, GraphEdge, TraversalResult, GraphQueryOptions, RecallOptions, RecallResult, CompactionInput, CompactionResult, InjectionOptions, ThreatMemory, CostContext, PipelineMemory, } from './types.js';
export declare const VERSION = "0.1.0";
//# sourceMappingURL=index.d.ts.map
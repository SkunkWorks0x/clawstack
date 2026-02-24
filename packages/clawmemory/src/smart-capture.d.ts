/**
 * Smart Capture — Identify What's Worth Remembering
 *
 * Extracts entities and relationships from text deterministically.
 * No LLM-as-memory-router: extraction rules are infrastructure, not prompts.
 *
 * Pattern matching extracts (subject, relation, object) triplets.
 * Confidence scoring filters noise. Duplicate detection prevents bloat.
 * Active curation: same name + type + workspace = update, don't duplicate.
 */
import { SessionGraph, EventBus } from '@clawstack/shared';
import type { ExtractionResult, ExtractedEntity, ExtractedRelation, CaptureOptions } from './types.js';
export declare class SmartCapture {
    private graph;
    private bus;
    constructor(graph: SessionGraph, bus: EventBus);
    /**
     * Extract entities and relationships from text, then store to Session Graph.
     * Active curation: duplicates are merged (confidence updated), not appended.
     */
    extract(text: string, options: CaptureOptions): Promise<ExtractionResult>;
    /**
     * Extract entities from text using pattern matching.
     */
    extractEntities(text: string, source: string): ExtractedEntity[];
    /**
     * Extract relations from text using pattern matching.
     */
    extractRelations(text: string): ExtractedRelation[];
    /**
     * Upsert entity: if same name+type+workspace exists for this agent, merge.
     * Merge strategy: update content if new confidence is higher, bump confidence.
     */
    private upsertEntity;
    /**
     * Upsert relation: if same source+target+type exists, update weight.
     */
    private upsertRelation;
    /**
     * Extract surrounding context for an entity mention.
     */
    private extractContext;
}
//# sourceMappingURL=smart-capture.d.ts.map
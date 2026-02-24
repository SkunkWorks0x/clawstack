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

import { SessionGraph, EventBus, createEvent } from '@clawstack/shared';
import type { MemoryEntity, MemoryRelation, EntityType, RelationType } from '@clawstack/shared';
import type {
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelation,
  CaptureOptions,
} from './types.js';

// ─── Entity Extraction Patterns ──────────────────────────────────

interface EntityPattern {
  type: EntityType;
  patterns: RegExp[];
  confidenceBase: number;
}

const ENTITY_PATTERNS: EntityPattern[] = [
  {
    type: 'person',
    patterns: [
      /(?:(?:user|person|developer|engineer|manager|admin|owner|author|maintainer|lead)\s+(?:named?\s+)?|@)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|was|works|manages|leads|maintains|owns|created|wrote|built)/g,
    ],
    confidenceBase: 0.7,
  },
  {
    type: 'tool',
    patterns: [
      /(?:using|uses?|tool|framework|library|package|module|sdk|api)\s+(?:called?\s+)?["`']?([A-Za-z][\w.-]+)["`']?/gi,
      /(?:install|npm|pip|brew|apt)\s+(?:install\s+)?([a-z][\w.-]+)/gi,
    ],
    confidenceBase: 0.6,
  },
  {
    type: 'skill',
    patterns: [
      /(?:skill|capability|ability|function|command)\s+(?:called?\s+)?["`']?([A-Za-z][\w.-]+)["`']?/gi,
      /(?:can|able\s+to|capable\s+of)\s+([\w\s]+?)(?:\.|,|;|$)/gi,
    ],
    confidenceBase: 0.5,
  },
  {
    type: 'concept',
    patterns: [
      /(?:concept|pattern|principle|approach|strategy|method|technique|architecture)\s+(?:of\s+|called?\s+)?["`']?([A-Za-z][\w\s-]+?)["`']?(?:\s+(?:is|means|refers)|\.|,)/gi,
    ],
    confidenceBase: 0.5,
  },
  {
    type: 'decision',
    patterns: [
      /(?:decided|decision|chose|chosen|agreed|confirmed|approved|selected)\s+(?:to\s+|that\s+)?(.+?)(?:\.|;|$)/gim,
      /(?:we(?:'ll| will| should)|must|shall)\s+(?:use|adopt|implement|switch to|go with)\s+(.+?)(?:\.|;|$)/gim,
    ],
    confidenceBase: 0.8,
  },
  {
    type: 'preference',
    patterns: [
      /(?:prefer|always|never|like|dislike|want|don't want)\s+(?:to\s+|using?\s+)?(.+?)(?:\.|;|$)/gim,
      /(?:favorite|preferred|default)\s+(?:\w+\s+)?(?:is|are|should be)\s+(.+?)(?:\.|;|$)/gim,
    ],
    confidenceBase: 0.7,
  },
  {
    type: 'fact',
    patterns: [
      /(?:note|remember|important|key fact|fyi|heads up)[:\s]+(.+?)(?:\.|;|$)/gim,
      /(?:the\s+)?(?:api|endpoint|url|port|host|server|database|db)\s+(?:is|runs?\s+(?:on|at))\s+(.+?)(?:\.|;|$)/gim,
    ],
    confidenceBase: 0.6,
  },
];

// ─── Relation Extraction Patterns ────────────────────────────────

interface RelationPattern {
  type: RelationType;
  pattern: RegExp;
  weightBase: number;
}

const RELATION_PATTERNS: RelationPattern[] = [
  { type: 'manages', pattern: /([A-Z]\w+)\s+(?:manages?|leads?|oversees?|is\s+(?:manager|lead)\s+of)\s+([A-Z][\w\s]+)/gi, weightBase: 0.8 },
  { type: 'uses', pattern: /([A-Z]\w+)\s+(?:uses?|utilizes?|relies?\s+on|depends?\s+on|requires?)\s+([A-Za-z][\w.-]+)/gi, weightBase: 0.6 },
  { type: 'depends_on', pattern: /([A-Za-z][\w.-]+)\s+(?:depends?\s+on|requires?|needs?)\s+([A-Za-z][\w.-]+)/gi, weightBase: 0.7 },
  { type: 'contradicts', pattern: /([A-Za-z][\w\s]+?)\s+(?:contradicts?|conflicts?\s+with|incompatible\s+with|opposes?)\s+([A-Za-z][\w\s]+)/gi, weightBase: 0.9 },
  { type: 'related_to', pattern: /([A-Za-z][\w.-]+)\s+(?:(?:is\s+)?related\s+to|similar\s+to|like|connects?\s+(?:to|with))\s+([A-Za-z][\w.-]+)/gi, weightBase: 0.4 },
  { type: 'learned_from', pattern: /(?:learned|discovered|found out|realized)\s+(?:from\s+)?([A-Za-z][\w\s]+?)\s+(?:that|about)\s+([A-Za-z][\w\s]+)/gi, weightBase: 0.6 },
  { type: 'trusts', pattern: /([A-Za-z][\w.-]+)\s+(?:trusts?|is\s+trusted|verified|certified)\s*(?:by\s+)?([A-Za-z][\w.-]+)?/gi, weightBase: 0.7 },
  { type: 'distrusts', pattern: /([A-Za-z][\w.-]+)\s+(?:(?:is\s+)?untrusted|distrusts?|blocked|flagged|suspicious)\s*(?:by\s+)?([A-Za-z][\w.-]+)?/gi, weightBase: 0.8 },
];

// ─── Noise Filtering ─────────────────────────────────────────────

const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'it', 'this', 'that',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'something', 'anything',
  'nothing', 'everything', 'here', 'there', 'now', 'then', 'today',
  'true', 'false', 'yes', 'no', 'ok', 'okay', 'null', 'undefined',
]);

function isNoise(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  if (cleaned.length < 2 || cleaned.length > 200) return true;
  if (NOISE_WORDS.has(cleaned)) return true;
  if (/^\d+$/.test(cleaned)) return true;
  if (/^[^a-zA-Z]*$/.test(cleaned)) return true;
  return false;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

// ─── Smart Capture Class ─────────────────────────────────────────

export class SmartCapture {
  private graph: SessionGraph;
  private bus: EventBus;

  constructor(graph: SessionGraph, bus: EventBus) {
    this.graph = graph;
    this.bus = bus;
  }

  /**
   * Extract entities and relationships from text, then store to Session Graph.
   * Active curation: duplicates are merged (confidence updated), not appended.
   */
  async extract(text: string, options: CaptureOptions): Promise<ExtractionResult> {
    const minConfidence = options.minConfidence ?? 0.3;
    const workspace = options.workspace ?? 'default';
    const source = options.source ?? 'text';

    // Phase 1: Extract raw entities
    const rawEntities = this.extractEntities(text, source);

    // Phase 2: Extract raw relations
    const rawRelations = this.extractRelations(text);

    // Phase 3: Filter noise and low-confidence
    const filteredEntities = rawEntities.filter(e => {
      if (isNoise(e.name)) return false;
      if (e.confidence < minConfidence) return false;
      return true;
    });

    const belowThreshold = rawEntities.length - filteredEntities.length;

    // Phase 4: Store to Session Graph with dedup/merge
    let storedCount = 0;
    let mergedCount = 0;
    const entityNameToId = new Map<string, string>();

    for (const extracted of filteredEntities) {
      const result = this.upsertEntity(extracted, options.agentId, workspace);
      entityNameToId.set(extracted.name.toLowerCase(), result.entityId);

      if (result.merged) {
        mergedCount++;
      } else {
        storedCount++;

        // Emit event for new entities only
        await this.bus.emit(createEvent(
          'memory.entity_created',
          'clawmemory',
          {
            entityId: result.entityId,
            entityType: extracted.entityType,
            name: extracted.name,
            confidence: extracted.confidence,
          },
          { sessionId: options.sessionId, agentId: options.agentId }
        ));
      }
    }

    // Phase 5: Store relations (only if both endpoints exist)
    const storedRelations: ExtractedRelation[] = [];
    for (const rel of rawRelations) {
      const sourceId = entityNameToId.get(rel.sourceName.toLowerCase());
      const targetId = entityNameToId.get(rel.targetName.toLowerCase());

      if (sourceId && targetId && sourceId !== targetId) {
        this.upsertRelation(sourceId, targetId, rel);
        storedRelations.push(rel);
      }
    }

    return {
      entities: filteredEntities,
      relations: storedRelations,
      stats: {
        inputLength: text.length,
        entitiesFound: rawEntities.length,
        relationsFound: rawRelations.length,
        entitiesStored: storedCount,
        duplicatesMerged: mergedCount,
        belowThreshold,
      },
    };
  }

  /**
   * Extract entities from text using pattern matching.
   */
  extractEntities(text: string, source: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    for (const pattern of ENTITY_PATTERNS) {
      for (const regex of pattern.patterns) {
        // Reset lastIndex for global regexes
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          const name = match[1]?.trim();
          if (!name || isNoise(name)) continue;

          const key = `${pattern.type}:${name.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // Boost confidence if name appears multiple times
          const occurrences = text.toLowerCase().split(name.toLowerCase()).length - 1;
          const frequencyBoost = Math.min(occurrences * 0.05, 0.2);

          entities.push({
            name,
            entityType: pattern.type,
            content: this.extractContext(text, match.index, name),
            confidence: Math.min(pattern.confidenceBase + frequencyBoost, 1.0),
            source,
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract relations from text using pattern matching.
   */
  extractRelations(text: string): ExtractedRelation[] {
    const relations: ExtractedRelation[] = [];
    const seen = new Set<string>();

    for (const rp of RELATION_PATTERNS) {
      rp.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rp.pattern.exec(text)) !== null) {
        const sourceName = match[1]?.trim();
        const targetName = match[2]?.trim();
        if (!sourceName || !targetName) continue;
        if (isNoise(sourceName) || isNoise(targetName)) continue;

        const key = `${rp.type}:${sourceName.toLowerCase()}:${targetName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        relations.push({
          sourceName,
          targetName,
          relationType: rp.type,
          weight: rp.weightBase,
          evidence: match[0].trim().substring(0, 200),
        });
      }
    }

    return relations;
  }

  /**
   * Upsert entity: if same name+type+workspace exists for this agent, merge.
   * Merge strategy: update content if new confidence is higher, bump confidence.
   */
  private upsertEntity(
    extracted: ExtractedEntity,
    agentId: string,
    workspace: string,
  ): { entityId: string; merged: boolean } {
    const db = this.graph.getDb();

    // Check for existing entity
    const existing = db.prepare(`
      SELECT entity_id, confidence, content FROM memory_entities
      WHERE agent_id = ? AND LOWER(name) = LOWER(?) AND entity_type = ? AND workspace = ?
    `).get(agentId, extracted.name, extracted.entityType, workspace) as any;

    if (existing) {
      // Merge: update confidence (average weighted toward higher), update content if newer is more confident
      const newConfidence = Math.min(
        (existing.confidence + extracted.confidence) / 2 + 0.05,
        1.0
      );

      if (extracted.confidence >= existing.confidence) {
        db.prepare(`
          UPDATE memory_entities SET confidence = ?, content = ?, last_accessed_at = datetime('now')
          WHERE entity_id = ?
        `).run(newConfidence, extracted.content, existing.entity_id);
      } else {
        db.prepare(`
          UPDATE memory_entities SET confidence = ?, last_accessed_at = datetime('now')
          WHERE entity_id = ?
        `).run(newConfidence, existing.entity_id);
      }

      return { entityId: existing.entity_id, merged: true };
    }

    // Create new entity
    const entity = this.graph.createEntity({
      agentId,
      entityType: extracted.entityType,
      name: extracted.name,
      content: extracted.content,
      workspace,
      confidence: extracted.confidence,
      tokenCost: estimateTokens(extracted.content),
    });

    return { entityId: entity.entityId, merged: false };
  }

  /**
   * Upsert relation: if same source+target+type exists, update weight.
   */
  private upsertRelation(
    sourceEntityId: string,
    targetEntityId: string,
    rel: ExtractedRelation,
  ): void {
    const db = this.graph.getDb();

    const existing = db.prepare(`
      SELECT relation_id, weight FROM memory_relations
      WHERE source_entity_id = ? AND target_entity_id = ? AND relation_type = ?
    `).get(sourceEntityId, targetEntityId, rel.relationType) as any;

    if (existing) {
      // Strengthen existing relation
      const newWeight = Math.min(existing.weight + 0.1, 1.0);
      db.prepare('UPDATE memory_relations SET weight = ? WHERE relation_id = ?')
        .run(newWeight, existing.relation_id);
    } else {
      this.graph.createRelation({
        sourceEntityId,
        targetEntityId,
        relationType: rel.relationType,
        weight: rel.weight,
        evidence: rel.evidence,
      });
    }
  }

  /**
   * Extract surrounding context for an entity mention.
   */
  private extractContext(text: string, matchIndex: number, name: string): string {
    const contextRadius = 100;
    const start = Math.max(0, matchIndex - contextRadius);
    const end = Math.min(text.length, matchIndex + name.length + contextRadius);

    let context = text.substring(start, end).trim();
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context;
  }
}

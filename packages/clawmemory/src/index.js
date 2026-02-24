"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.CrossProductIntegration = exports.GracefulCompaction = exports.TokenRecall = exports.KnowledgeGraph = exports.SmartCapture = void 0;
var smart_capture_js_1 = require("./smart-capture.js");
Object.defineProperty(exports, "SmartCapture", { enumerable: true, get: function () { return smart_capture_js_1.SmartCapture; } });
var knowledge_graph_js_1 = require("./knowledge-graph.js");
Object.defineProperty(exports, "KnowledgeGraph", { enumerable: true, get: function () { return knowledge_graph_js_1.KnowledgeGraph; } });
var token_recall_js_1 = require("./token-recall.js");
Object.defineProperty(exports, "TokenRecall", { enumerable: true, get: function () { return token_recall_js_1.TokenRecall; } });
var graceful_compaction_js_1 = require("./graceful-compaction.js");
Object.defineProperty(exports, "GracefulCompaction", { enumerable: true, get: function () { return graceful_compaction_js_1.GracefulCompaction; } });
var cross_product_js_1 = require("./cross-product.js");
Object.defineProperty(exports, "CrossProductIntegration", { enumerable: true, get: function () { return cross_product_js_1.CrossProductIntegration; } });
exports.VERSION = '0.1.0';
//# sourceMappingURL=index.js.map
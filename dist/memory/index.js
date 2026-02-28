"use strict";
/**
 * Durable Memory System
 *
 * Entry point for the durable memory system that provides persistent knowledge
 * storage for bass-agents using Beads as the underlying storage layer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNoSecrets = exports.detectSecrets = exports.isValidScope = exports.isValidISO8601 = exports.validateMemoryEntry = exports.MemoryAdapter = void 0;
// Export MemoryAdapter
var memory_adapter_1 = require("./memory-adapter");
Object.defineProperty(exports, "MemoryAdapter", { enumerable: true, get: function () { return memory_adapter_1.MemoryAdapter; } });
// Export validation functions
var validation_1 = require("./validation");
Object.defineProperty(exports, "validateMemoryEntry", { enumerable: true, get: function () { return validation_1.validateMemoryEntry; } });
Object.defineProperty(exports, "isValidISO8601", { enumerable: true, get: function () { return validation_1.isValidISO8601; } });
Object.defineProperty(exports, "isValidScope", { enumerable: true, get: function () { return validation_1.isValidScope; } });
// Export secret detection
var secret_detection_1 = require("./secret-detection");
Object.defineProperty(exports, "detectSecrets", { enumerable: true, get: function () { return secret_detection_1.detectSecrets; } });
Object.defineProperty(exports, "validateNoSecrets", { enumerable: true, get: function () { return secret_detection_1.validateNoSecrets; } });
//# sourceMappingURL=index.js.map
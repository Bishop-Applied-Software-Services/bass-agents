"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Mock the CLI module to avoid process.chdir issues in workers
(0, vitest_1.describe)('Memory CLI Commands', () => {
    const testWorkspace = path.join(__dirname, '../../test-workspace-cli');
    const testProject = 'test-cli-project';
    const originalCwd = process.cwd();
    (0, vitest_1.beforeEach)(() => {
        // Create test workspace
        if (fs.existsSync(testWorkspace)) {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        }
        fs.mkdirSync(testWorkspace, { recursive: true });
    });
    (0, vitest_1.afterEach)(() => {
        // Cleanup
        if (fs.existsSync(testWorkspace)) {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        }
    });
    // Basic smoke tests - CLI commands are tested manually or via E2E tests
    (0, vitest_1.describe)('module structure', () => {
        (0, vitest_1.it)('should have CLI commands file', () => {
            const fs = require('fs');
            const path = require('path');
            const cliPath = path.join(__dirname, 'memory-commands.ts');
            (0, vitest_1.expect)(fs.existsSync(cliPath)).toBe(true);
        });
        (0, vitest_1.it)('should have compiled CLI commands', () => {
            const fs = require('fs');
            const path = require('path');
            const distPath = path.join(__dirname, '../../dist/cli/memory-commands.js');
            (0, vitest_1.expect)(fs.existsSync(distPath)).toBe(true);
        });
    });
});
//# sourceMappingURL=memory-commands.test.js.map
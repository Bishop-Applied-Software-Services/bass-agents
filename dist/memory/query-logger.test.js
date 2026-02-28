"use strict";
/**
 * Unit tests for query logger module
 */
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
const query_logger_1 = require("./query-logger");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
(0, vitest_1.describe)('Query Logger', () => {
    let testDir;
    let workspaceRoot;
    (0, vitest_1.beforeEach)(async () => {
        // Create temporary test directory
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'query-logger-test-'));
        workspaceRoot = testDir;
    });
    (0, vitest_1.afterEach)(async () => {
        // Clean up test directory
        await fs.rm(testDir, { recursive: true, force: true });
    });
    (0, vitest_1.describe)('logQuery', () => {
        (0, vitest_1.it)('should log a query to JSONL file', async () => {
            const project = 'test-project';
            const filters = {
                section: ['decisions'],
                subject: ['test-subject'],
            };
            await (0, query_logger_1.logQuery)(project, filters, 5, workspaceRoot);
            const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
            const content = await fs.readFile(logPath, 'utf-8');
            const lines = content.trim().split('\n');
            (0, vitest_1.expect)(lines.length).toBe(1);
            const logEntry = JSON.parse(lines[0]);
            (0, vitest_1.expect)(logEntry.project).toBe(project);
            (0, vitest_1.expect)(logEntry.result_count).toBe(5);
            (0, vitest_1.expect)(logEntry.subjects).toEqual(['test-subject']);
        });
        (0, vitest_1.it)('should append multiple queries', async () => {
            const project = 'test-project';
            await (0, query_logger_1.logQuery)(project, { section: ['decisions'] }, 3, workspaceRoot);
            await (0, query_logger_1.logQuery)(project, { section: ['state'] }, 2, workspaceRoot);
            const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
            const content = await fs.readFile(logPath, 'utf-8');
            const lines = content.trim().split('\n');
            (0, vitest_1.expect)(lines.length).toBe(2);
        });
    });
    (0, vitest_1.describe)('analyzeQueryPatterns', () => {
        (0, vitest_1.it)('should return empty stats for non-existent log', async () => {
            const stats = await (0, query_logger_1.analyzeQueryPatterns)('non-existent', workspaceRoot);
            (0, vitest_1.expect)(stats.total_queries).toBe(0);
            (0, vitest_1.expect)(stats.most_queried_subjects).toEqual([]);
            (0, vitest_1.expect)(stats.most_queried_scopes).toEqual([]);
        });
        (0, vitest_1.it)('should analyze query patterns', async () => {
            const project = 'test-project';
            // Log some queries
            await (0, query_logger_1.logQuery)(project, { subject: ['subject-1'] }, 5, workspaceRoot);
            await (0, query_logger_1.logQuery)(project, { subject: ['subject-1'] }, 3, workspaceRoot);
            await (0, query_logger_1.logQuery)(project, { subject: ['subject-2'] }, 2, workspaceRoot);
            await (0, query_logger_1.logQuery)(project, { scope: ['repo'] }, 1, workspaceRoot);
            const stats = await (0, query_logger_1.analyzeQueryPatterns)(project, workspaceRoot);
            (0, vitest_1.expect)(stats.total_queries).toBe(4);
            (0, vitest_1.expect)(stats.most_queried_subjects).toEqual([
                { subject: 'subject-1', count: 2 },
                { subject: 'subject-2', count: 1 },
            ]);
            (0, vitest_1.expect)(stats.most_queried_scopes).toEqual([
                { scope: 'repo', count: 1 },
            ]);
        });
        (0, vitest_1.it)('should filter by date range', async () => {
            const project = 'test-project';
            // Create log file with entries at different times
            const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
            await fs.mkdir(path.dirname(logPath), { recursive: true });
            const entries = [
                { timestamp: '2024-01-01T00:00:00Z', project, filters: {}, result_count: 1 },
                { timestamp: '2024-01-15T00:00:00Z', project, filters: {}, result_count: 1 },
                { timestamp: '2024-02-01T00:00:00Z', project, filters: {}, result_count: 1 },
            ];
            await fs.writeFile(logPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
            const stats = await (0, query_logger_1.analyzeQueryPatterns)(project, workspaceRoot, {
                start_date: '2024-01-10T00:00:00Z',
                end_date: '2024-01-20T00:00:00Z',
            });
            (0, vitest_1.expect)(stats.total_queries).toBe(1);
        });
        (0, vitest_1.it)('should compute query frequency over time', async () => {
            const project = 'test-project';
            // Log queries on different days
            const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
            await fs.mkdir(path.dirname(logPath), { recursive: true });
            const entries = [
                { timestamp: '2024-01-01T10:00:00Z', project, filters: {}, result_count: 1 },
                { timestamp: '2024-01-01T11:00:00Z', project, filters: {}, result_count: 1 },
                { timestamp: '2024-01-02T10:00:00Z', project, filters: {}, result_count: 1 },
            ];
            await fs.writeFile(logPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
            const stats = await (0, query_logger_1.analyzeQueryPatterns)(project, workspaceRoot);
            (0, vitest_1.expect)(stats.query_frequency_over_time).toEqual([
                { date: '2024-01-01', count: 2 },
                { date: '2024-01-02', count: 1 },
            ]);
        });
    });
});
//# sourceMappingURL=query-logger.test.js.map
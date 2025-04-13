"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var calculator_1 = require("@graperank/calculator");
var child_process_1 = require("child_process");
var neo4j_driver_1 = require("neo4j-driver");
var fs = require('fs');
var path = require('path');
var readline = require('readline');
// const { Calculator } = require('/usr/local/lib/node_modules/graperank/src/Calculator/index.js');
var TEMP_DIR = '/var/lib/hasenpfeffr/algos/importedGrapeRankEngine/tmp';
var CONTEXT = 'verifiedUsers';
var CONFIG_FILES = {
    graperank: '/etc/graperank.conf',
    hasenpfeffr: '/etc/hasenpfeffr.conf'
};
var observer = getPubkey();
var ratings = parseRatings();
var params = getCalculatorParams();
var calculator = new calculator_1.Calculator(observer, ratings, params);
calculator.calculate().then(function (scorecards) {
    console.log("scorecards.length: ".concat(scorecards.length));
    updateNeo4j(scorecards);
});
function getCalculatorParams() {
    var params = (0, child_process_1.execSync)("source ".concat(CONFIG_FILES.graperank, " && echo $RIGOR,$ATTENUATION_FACTOR"), {
        shell: '/bin/bash',
        encoding: 'utf8'
    }).trim().split(',');
    return {
        rigor: parseFloat(params[0]),
        attenuation: parseFloat(params[1]),
    };
}
function getPubkey() {
    // Load Hasenpfeffr config
    return (0, child_process_1.execSync)("source ".concat(CONFIG_FILES.hasenpfeffr, " && echo $HASENPFEFFR_OWNER_PUBKEY"), {
        shell: '/bin/bash',
        encoding: 'utf8'
    }).trim();
}
function getConfig() {
    try {
        // Load GrapeRank config
        var graperankConfig = (0, child_process_1.execSync)("source ".concat(CONFIG_FILES.graperank, " && echo $FOLLOW_RATING,$FOLLOW_CONFIDENCE,$MUTE_RATING,$MUTE_CONFIDENCE,$REPORT_RATING,$REPORT_CONFIDENCE,$FOLLOW_CONFIDENCE_OF_OBSERVER"), {
            shell: '/bin/bash',
            encoding: 'utf8'
        }).trim().split(',');
        return new Map([
            ['nostr-follows', {
                    score: parseFloat(graperankConfig[0]),
                    confidence: parseFloat(graperankConfig[1]),
                    path: path.join(TEMP_DIR, 'follows.csv'),
                }],
            ['nostr-mutes', {
                    score: parseFloat(graperankConfig[2]),
                    confidence: parseFloat(graperankConfig[3]),
                    path: path.join(TEMP_DIR, 'mutes.csv'),
                }],
            ['nostr-reports', {
                    score: parseFloat(graperankConfig[4]),
                    confidence: parseFloat(graperankConfig[5]),
                    path: path.join(TEMP_DIR, 'reports.csv'),
                }]
        ]);
    }
    catch (error) {
        console.error("Error loading configuration: ".concat(error.message));
        process.exit(1);
    }
}
function parseRatings() {
    var ratings = [];
    var protocols = getConfig();
    protocols.forEach(function (params, protocol) {
        var fileStream = fs.createReadStream(params.path);
        var rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        // Skip header line
        var isFirstLine = true;
        // Process each line
        rl.on('line', function (line) {
            if (isFirstLine) {
                isFirstLine = false;
                return;
            }
            // Skip empty lines
            if (!line.trim())
                return;
            // Parse line (format: "pk_rater","pk_ratee")
            var parts = line.split(',');
            if (parts.length < 2)
                return;
            var pk_rater = parts[0].replace(/"/g, '').trim();
            var pk_ratee = parts[1].replace(/"/g, '').trim();
            // Skip if either pubkey is empty
            if (!pk_rater || !pk_ratee)
                return;
            // Skip self-ratings (where pk_ratee equals pk_rater)
            if (pk_ratee === pk_rater) {
                return;
            }
            // Set the rating
            // ratings[CONTEXT][pk_ratee][pk_rater] = [rating, confidence];
            ratings.push({
                protocol: protocol,
                ratee: pk_ratee,
                rater: pk_rater,
                score: params.score,
                confidence: params.confidence,
            });
        });
    });
    return ratings;
}
// Update Neo4j with GrapeRank scores
function updateNeo4j(scorecards) {
    return __awaiter(this, void 0, void 0, function () {
        var BATCH_SIZE, neo4jConfig, driver, session, i, batch, params_1, result, updatedCount, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    BATCH_SIZE = 500;
                    neo4jConfig = getNeo4jConfig();
                    console.log("Using Neo4j URI: ".concat(neo4jConfig.uri));
                    console.log("Using Neo4j username: ".concat(neo4jConfig.username));
                    driver = neo4j_driver_1.default.driver(neo4jConfig.uri, neo4j_driver_1.default.auth.basic(neo4jConfig.username, neo4jConfig.password));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, 8, 10]);
                    console.log('Connected to Neo4j');
                    session = driver.session();
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < scorecards.length)) return [3 /*break*/, 5];
                    batch = scorecards.slice(i, i + BATCH_SIZE);
                    console.log("Processing batch ".concat(Math.floor(i / BATCH_SIZE) + 1, "/").concat(Math.ceil(scorecards.length / BATCH_SIZE), " (").concat(batch.length, " users)..."));
                    params_1 = {
                        updates: batch.map(function (entry) {
                            var weights = 0;
                            Object.keys(entry[1].interpretersums || {}).forEach(function (protocol) {
                                if (entry[1].interpretersums)
                                    weights += entry[1].interpretersums[protocol].weighted;
                            });
                            var average = entry[1].score && entry[1].confidence ? entry[1].score / entry[1].confidence : 0;
                            // const [influence, average, confidence, input] = scorecards[pubkey];
                            return {
                                pubkey: entry[0],
                                influence: entry[1].score,
                                average: average,
                                confidence: entry[1].confidence,
                                input: weights
                            };
                        })
                    };
                    return [4 /*yield*/, session.run("\n        UNWIND $updates AS update\n        MATCH (u:NostrUser {pubkey: update.pubkey})\n        SET u.influence_imported = update.influence,\n            u.average_imported = update.average,\n            u.confidence_imported = update.confidence,\n            u.input_imported = update.input\n        RETURN count(u) AS updatedCount\n      ", params_1)];
                case 3:
                    result = _a.sent();
                    updatedCount = result.records[0].get('updatedCount').toNumber();
                    console.log("Updated ".concat(updatedCount, " users in this batch"));
                    _a.label = 4;
                case 4:
                    i += BATCH_SIZE;
                    return [3 /*break*/, 2];
                case 5: return [4 /*yield*/, session.close()];
                case 6:
                    _a.sent();
                    console.log('Neo4j update completed successfully');
                    return [3 /*break*/, 10];
                case 7:
                    error_1 = _a.sent();
                    console.error("Error updating Neo4j: ".concat(error_1.message));
                    process.exit(1);
                    return [3 /*break*/, 10];
                case 8: return [4 /*yield*/, driver.close()];
                case 9:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// Get Neo4j configuration from hasenpfeffr.conf
function getNeo4jConfig() {
    try {
        // Load Neo4j connection details from hasenpfeffr.conf
        var neo4jUri = (0, child_process_1.execSync)("source ".concat(CONFIG_FILES.hasenpfeffr, " && echo $NEO4J_URI"), {
            shell: '/bin/bash',
            encoding: 'utf8'
        }).trim();
        var neo4jUsername = (0, child_process_1.execSync)("source ".concat(CONFIG_FILES.hasenpfeffr, " && echo $NEO4J_USER"), {
            shell: '/bin/bash',
            encoding: 'utf8'
        }).trim();
        var neo4jPassword = (0, child_process_1.execSync)("source ".concat(CONFIG_FILES.hasenpfeffr, " && echo $NEO4J_PASSWORD"), {
            shell: '/bin/bash',
            encoding: 'utf8'
        }).trim();
        if (!neo4jUri || !neo4jUsername || !neo4jPassword) {
            throw new Error('Missing Neo4j connection details in hasenpfeffr.conf. Please ensure NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are defined.');
        }
        return {
            uri: neo4jUri,
            username: neo4jUsername,
            password: neo4jPassword
        };
    }
    catch (error) {
        console.error("Error loading Neo4j configuration: ".concat(error.message));
        process.exit(1);
    }
}

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
exports.fileStorage = exports.FileStorage = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const config_1 = require("../core/config");
const BASE_DIR = path.resolve(process.cwd());
const SETTING_FILE_PATH = path.join(BASE_DIR, 'setting.json');
class FileStorage {
    constructor() {
        if (!fs.existsSync(BASE_DIR)) {
            fs.mkdirSync(BASE_DIR, { recursive: true });
        }
    }
    getStorageRoot() {
        return BASE_DIR;
    }
    getSettingFilePath() {
        return SETTING_FILE_PATH;
    }
    ensureSettingFile(defaultContent) {
        if (!fs.existsSync(SETTING_FILE_PATH)) {
            this.writeSettings(defaultContent);
            return true;
        }
        return false;
    }
    readSettings() {
        const content = fs.readFileSync(SETTING_FILE_PATH, 'utf-8');
        return JSON.parse(content);
    }
    writeSettings(data) {
        fs.writeFileSync(SETTING_FILE_PATH, JSON.stringify(data, null, 4), 'utf-8');
    }
    ensureWorkspaceDir(workspaceId) {
        const workspaceDir = path.join(BASE_DIR, config_1.appConfig.workspace.baseDir, workspaceId);
        if (!fs.existsSync(workspaceDir)) {
            fs.mkdirSync(workspaceDir, { recursive: true });
        }
        return workspaceDir;
    }
    readFile(filePath) {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        return fs.readFileSync(filePath, 'utf-8');
    }
    writeFile(filePath, content) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
    }
    deleteFile(filePath) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }
    listFiles(dirPath) {
        if (!fs.existsSync(dirPath)) {
            return [];
        }
        return fs.readdirSync(dirPath);
    }
    fileExists(filePath) {
        return fs.existsSync(filePath);
    }
}
exports.FileStorage = FileStorage;
exports.fileStorage = new FileStorage();
//# sourceMappingURL=file-storage.js.map
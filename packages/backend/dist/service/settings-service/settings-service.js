"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsService = exports.SettingsService = void 0;
const data_1 = require("../../data");
const DEFAULT_SETTINGS = {
    ui: {
        theme_mode: 'system',
        scale: 1.0,
        show_debug_overlay: false,
        show_workspace_hud: false,
        diagram_double_click_delay_ms: 300,
        message_send_shortcuts_reversed: false,
    },
    database: {
        path: 'workbranch.db',
    },
    llm: {
        api_key: '',
        base_url: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 4096,
    },
    workspace: {
        base_dir: 'workspaces',
    },
    mq: {
        max_size: 1000,
    },
    agent: {
        memory_mode: 'accumulate',
        memory_window_size: 3,
    },
    conversation: {
        single_message_per_node: true,
    },
    context: {
        max_tokens: 32000,
        warning_threshold: 0.5,
        include_parent_context_by_default: false,
    },
    logging: {
        enabled: true,
        level: 'INFO',
        base_dir: 'logs',
        max_file_size_mb: 10,
        frontend: {
            enabled: true,
        },
        conversation_content: {
            enabled: true,
        },
        sensitive_fields: ['api_key', 'token', 'password', 'secret', 'key'],
        api_log_enabled: true,
        retention: {
            enabled: false,
            max_runs: null,
            max_days: null,
        },
    },
    tool_permissions: {
        build_agent: {
            allowed: ['read_file', 'write_file', 'list_dir', 'create_dir', 'explore_code', 'thinking', 'call_explore_agent', 'call_review_agent'],
            forbidden: ['delete_file', 'explore_internet'],
        },
        plan_agent: {
            allowed: ['read_file', 'list_dir', 'explore_code', 'thinking', 'call_explore_agent', 'call_review_agent'],
            forbidden: ['write_file', 'delete_file', 'create_dir', 'explore_internet'],
        },
        review_agent: {
            allowed: ['read_file', 'list_dir', 'explore_code', 'thinking'],
            forbidden: ['write_file', 'delete_file', 'create_dir', 'explore_internet', 'call_explore_agent', 'call_review_agent'],
        },
        explore_agent: {
            allowed: ['read_file', 'list_dir', 'thinking', 'explore_internet'],
            forbidden: ['write_file', 'delete_file', 'create_dir', 'explore_code', 'call_explore_agent', 'call_review_agent'],
        },
        admin_agent: {
            allowed: ['read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir', 'explore_code', 'explore_internet', 'thinking', 'call_explore_agent', 'call_review_agent'],
            forbidden: [],
        },
    },
    debug: {
        consistency_check: false,
    },
};
const DEFAULT_SETTINGS_METADATA = {
    ui: {
        scale: {
            type: 'number',
            control: 'slider',
            min: 0.7,
            max: 1.3,
            step: 0.1,
        },
        diagram_double_click_delay_ms: {
            type: 'number',
            control: 'slider',
            min: 150,
            max: 600,
            step: 10,
        },
    },
};
function mergeMissingDefaults(defaults, current) {
    if (typeof defaults !== 'object' || defaults === null) {
        return [current, false];
    }
    if (typeof current !== 'object' || current === null) {
        return [defaults, true];
    }
    const merged = { ...current };
    let changed = false;
    for (const [key, defaultValue] of Object.entries(defaults)) {
        if (!(key in merged)) {
            merged[key] = defaultValue;
            changed = true;
            continue;
        }
        const currentValue = merged[key];
        if (typeof defaultValue === 'object' && defaultValue !== null) {
            const [nextValue, nestedChanged] = mergeMissingDefaults(defaultValue, currentValue);
            if (nestedChanged) {
                merged[key] = nextValue;
                changed = true;
            }
        }
    }
    return [merged, changed];
}
class SettingsService {
    data;
    constructor() {
        data_1.fileStorage.ensureSettingFile(DEFAULT_SETTINGS);
        this.reload();
    }
    reload() {
        const data = data_1.fileStorage.readSettings();
        const [merged, changed] = mergeMissingDefaults(DEFAULT_SETTINGS, data);
        this.data = merged;
        if (changed) {
            this.persist();
        }
    }
    persist() {
        data_1.fileStorage.writeSettings(this.data);
    }
    get(key) {
        const parts = key.split(':');
        let node = this.data;
        for (const part of parts) {
            if (typeof node !== 'object' || node === null || !(part in node)) {
                throw new Error(`Setting key not found: '${key}'`);
            }
            node = node[part];
        }
        return node;
    }
    getAll() {
        return { ...this.data };
    }
    getMetadata() {
        return { ...DEFAULT_SETTINGS_METADATA };
    }
    updateSetting(key, value) {
        this.data[key] = value;
        this.persist();
        return true;
    }
    updateSettings(updates) {
        Object.assign(this.data, updates);
        this.persist();
        return true;
    }
    forceReload() {
        this.reload();
    }
}
exports.SettingsService = SettingsService;
exports.settingsService = new SettingsService();
//# sourceMappingURL=settings-service.js.map
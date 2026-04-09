"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const logging_1 = require("./core/logging");
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
async function start() {
    try {
        const app = await (0, app_1.buildApp)();
        await app.listen({
            port: Number(PORT),
            host: HOST,
        });
        logging_1.logger.info(`Server listening on http://${HOST}:${PORT}`);
        logging_1.logger.info(`Health check available at http://${HOST}:${PORT}/health`);
    }
    catch (err) {
        logging_1.logger.error(err);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=server.js.map
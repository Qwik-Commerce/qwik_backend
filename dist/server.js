"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const http_1 = require("http");
const realtime_1 = require("./lib/realtime");
const server = (0, http_1.createServer)(app_1.app);
(0, realtime_1.initRealtime)(server);
server.listen(env_1.env.port, () => {
    console.log(`Qwik backend listening on http://localhost:${env_1.env.port}`);
});

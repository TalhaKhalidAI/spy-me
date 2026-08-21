import os

transport_path = '/home/talha/Documents/DEV/Python/spyme2/Spyme_V2/src/services/mediasoup/managers/TransportManager.js'
with open(transport_path, 'r') as f:
    content = f.read()

content = content.replace(
    "/** @type {import('mediasoup').Router} */\n    #router;",
    "/** @type {import('./RouterManager.js').RouterManager} */\n    #routerManager;"
)

content = content.replace(
    "constructor(router, config = {}) {\n        super();\n        \n        if (!router) {\n            throw new Error('Router is required for TransportManager');\n        }\n        \n        this.#router = router;",
    "constructor(routerManager, config = {}) {\n        super();\n        \n        if (!routerManager) {\n            throw new Error('RouterManager is required for TransportManager');\n        }\n        \n        this.#routerManager = routerManager;"
)

content = content.replace(
    "// Create the transport\n            const transport = await this.#router.createWebRtcTransport({",
    "// Get router for this room\n            const router = this.#routerManager.getRouter(roomId);\n            if (!router) {\n                throw new Error(`Router for room ${roomId} not found`);\n            }\n\n            // Create the transport\n            const transport = await router.createWebRtcTransport({"
)

with open(transport_path, 'w') as f:
    f.write(content)

index_path = '/home/talha/Documents/DEV/Python/spyme2/Spyme_V2/src/services/mediasoup/index.js'
with open(index_path, 'r') as f:
    content = f.read()

content = content.replace(
    "this.transportManager = new TransportManager(this.router, {",
    "this.transportManager = new TransportManager(this.routerManager, {"
)

with open(index_path, 'w') as f:
    f.write(content)

print("Backend fixed!")

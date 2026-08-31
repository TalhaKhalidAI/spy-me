import fs from 'fs';

const p = '/home/talha/Documents/DEV/Python/spyme2/Spyme_V2/server.js';
let content = fs.readFileSync(p, 'utf8');

const target = `    // ─── Toggle Microphone ──────────────────────────────────────────────
    socket.on('toggleMic', async (...args) => {`;

const insert = `    // ─── Toggle Screen ──────────────────────────────────────────────
    socket.on('toggleScreen', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.screen');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId, enabled } = data;

            const command = {
                command: 'toggleScreen',
                payload: { enabled: enabled !== undefined ? enabled : true }
            };

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', command);
                console.log(\`💻 Sent toggle screen to specific client: \${targetSocketId} (\${enabled ? 'ON' : 'OFF'})\`);
            } else {
                socket.to(roomId).emit('executeCommand', command);
                console.log(\`💻 Broadcasted toggle screen to room: \${roomId} (\${enabled ? 'ON' : 'OFF'})\`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(\`❌ toggleScreen error:\`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── Toggle Microphone ──────────────────────────────────────────────
    socket.on('toggleMic', async (...args) => {`;

if (!content.includes("socket.on('toggleScreen'")) {
    if (content.includes(target)) {
        content = content.replace(target, insert);
        fs.writeFileSync(p, content, 'utf8');
        console.log("Successfully inserted toggleScreen");
    } else {
        console.log("Could not find toggleMic target string to replace!");
    }
} else {
    console.log("toggleScreen already exists in server.js");
}

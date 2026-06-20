const { WebSocketServer } = require('ws');

// Railway asigna automáticamente un puerto en la variable de entorno PORT
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

let players = [];

wss.on('connection', (ws) => {
    console.log('¡Un usuario se ha conectado!');
    
    // Limitar a 2 jugadores para el prototipo sencillo
    if (players.length < 2) {
        players.push(ws);
        ws.send(JSON.stringify({ type: 'INIT', message: `Bienvenido. Eres el Jugador ${players.length}` }));
    } else {
        ws.send(JSON.stringify({ type: 'FULL', message: 'La sala está llena' }));
        ws.close();
        return;
    }

    // Escuchar los ataques/acciones de los jugadores
    ws.on('message', (data) => {
        const message = JSON.parse(data);
        console.log('Acción recibida:', message);

        // Reenviar la acción al OTRO jugador (o a ambos)
        players.forEach(player => {
            if (player !== ws && player.readyState === ws.OPEN) {
                player.send(JSON.stringify(message));
            }
        });
    });

    ws.on('close', () => {
        players = players.filter(p => p !== ws);
        console.log('Un jugador se ha desconectado.');
    });
});

console.log(`Servidor de Persona Showdown corriendo en el puerto ${PORT}`);
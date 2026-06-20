const { WebSocketServer } = require('ws');

// Railway asigna automáticamente un puerto en la variable de entorno PORT
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

let players = [];

// 1. EL SERVIDOR GUARDA EL ESTADO DEL JUEGO (Single Source of Truth)
let gameState = {
    p1: { id: 'p1', name: "Izanagi", hpMax: 150, hp: 150, weakness: "Wind" },
    p2: { id: 'opp', name: "Jiraiya", hpMax: 120, hp: 120, weakness: "Electric" },
    turnCount: 1
};

// Función auxiliar para enviar el estado a todos los jugadores conectados
function broadcastState() {
    const message = JSON.stringify({ type: 'UPDATE_STATE', state: gameState });
    players.forEach(player => {
        if (player.readyState === player.OPEN) {
            player.send(message);
        }
    });
}

// Función auxiliar para escribir en el chat/log de todos
function broadcastLog(htmlMessage) {
    const message = JSON.stringify({ type: 'BATTLE_LOG', message: htmlMessage });
    players.forEach(player => {
        if (player.readyState === player.OPEN) {
            player.send(message);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('¡Un usuario se ha conectado!');
    
    // Limitar a 2 jugadores para el prototipo
    if (players.length < 2) {
        players.push(ws);
        const playerNum = players.length;
        
        ws.send(JSON.stringify({ type: 'INIT', message: `Bienvenido. Eres el Jugador ${playerNum}` }));
        
        // Le enviamos el estado de las barras de vida nada más entrar
        ws.send(JSON.stringify({ type: 'UPDATE_STATE', state: gameState }));
        
        // Avisamos a todos que entró alguien
        broadcastLog(`<span style="color: #48c774;">El Jugador ${playerNum} se ha unido a la batalla.</span>`);
        
    } else {
        ws.send(JSON.stringify({ type: 'FULL', message: 'La sala está llena' }));
        ws.close();
        return;
    }

    // Escuchar los mensajes del HTML
    ws.on('message', (data) => {
        const message = JSON.parse(data);
        console.log('Acción recibida:', message);

        // Si es un ataque, el servidor hace las matemáticas
        if (message.type === 'ACTION') {
            const attacker = gameState.p1; // Asumimos P1 ataca a P2 por ahora
            const defender = gameState.p2;
            const skill = message.skill;
            const skillType = message.skillType;

            broadcastLog(`<b>${attacker.name}</b> used <b>${skill}</b>!`);

            // Daño aleatorio entre 15 y 25 (Temporal)
            let damage = Math.floor(Math.random() * (25 - 15 + 1)) + 15; 

            // Cálculo de debilidad
            if (skillType === defender.weakness) {
                damage = damage * 2;
                broadcastLog(`<span style="color:#ffee00; font-weight:bold;">It's super effective!</span> (Opposing ${defender.name} is weak to ${skillType})`);
            }

            // Restar vida
            defender.hp -= damage;
            if (defender.hp < 0) defender.hp = 0;

            let damagePercent = Math.floor((damage / defender.hpMax) * 100);
            broadcastLog(`<span class="log-damage">(The opposing ${defender.name} lost ${damagePercent}% of its health!)</span>`);

            // Avanzar turno
            gameState.turnCount++;
            broadcastLog(`<div class="log-turn">Turn ${gameState.turnCount}</div>`);

            // Actualizar la vida en las pantallas de ambos jugadores
            broadcastState();
        }
        
        // Si es un mensaje de chat, reenviarlo a todos
        if (message.type === 'CHAT') {
            broadcastLog(`<strong style="color: #ffaa99;">Player:</strong> ${message.text}`);
        }
    });

    ws.on('close', () => {
        players = players.filter(p => p !== ws);
        console.log('Un jugador se ha desconectado.');
        broadcastLog(`<span style="color: #ff4444;">Un jugador se ha desconectado.</span>`);
    });
});

console.log(`Servidor de Persona Showdown corriendo en el puerto ${PORT}`);
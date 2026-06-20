const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// El servidor ahora guarda los movimientos de cada personaje
let room = {
    status: 'WAITING',
    players: [],
    p1: { 
        ws: null, name: "Izanagi", hpMax: 150, hp: 150, weakness: "Wind", action: null,
        moves: [
            { name: "Zio", type: "Electric", sp: "4 SP" },
            { name: "Cleave", type: "Physical", sp: "10% HP" },
            { name: "Rakunda", type: "Support", sp: "8 SP" },
            { name: "Tarukaja", type: "Support", sp: "8 SP" }
        ]
    },
    p2: { 
        ws: null, name: "Jiraiya", hpMax: 120, hp: 120, weakness: "Electric", action: null,
        moves: [
            { name: "Garu", type: "Wind", sp: "3 SP" },
            { name: "Brave Blade", type: "Physical", sp: "20% HP" },
            { name: "Sukukaja", type: "Support", sp: "12 SP" },
            { name: "Dekunda", type: "Support", sp: "10 SP" }
        ]
    },
    turnCount: 1
};

function broadcastState() {
    // Enviamos los movimientos a los clientes para que dibujen sus botones
    const safeState = {
        status: room.status,
        turnCount: room.turnCount,
        p1: { name: room.p1.name, hpMax: room.p1.hpMax, hp: room.p1.hp, moves: room.p1.moves },
        p2: { name: room.p2.name, hpMax: room.p2.hpMax, hp: room.p2.hp, moves: room.p2.moves }
    };
    const message = JSON.stringify({ type: 'UPDATE_STATE', state: safeState });
    room.players.forEach(p => { if (p.readyState === p.OPEN) p.send(message); });
}

function broadcastLog(htmlMessage) {
    const message = JSON.stringify({ type: 'BATTLE_LOG', message: htmlMessage });
    room.players.forEach(p => { if (p.readyState === p.OPEN) p.send(message); });
}

function ejecutarAtaque(atacante, defensor, accion) {
    if (atacante.hp <= 0) return; 
    
    broadcastLog(`<b>${atacante.name}</b> used <b>${accion.skill}</b>!`);
    
    let damage = Math.floor(Math.random() * (25 - 15 + 1)) + 15; 
    if (accion.skillType === defensor.weakness) {
        damage = damage * 2;
        broadcastLog(`<span style="color:#ffee00; font-weight:bold;">It's super effective!</span> (Opposing ${defensor.name} is weak to ${accion.skillType})`);
    }

    defensor.hp -= damage;
    if (defensor.hp < 0) defensor.hp = 0;

    let damagePercent = Math.floor((damage / defensor.hpMax) * 100);
    broadcastLog(`<span class="log-damage">(The opposing ${defensor.name} lost ${damagePercent}% of its health!)</span>`);
}

function resolverTurno() {
    broadcastLog(`<div class="log-turn">Turn ${room.turnCount}</div>`);

    ejecutarAtaque(room.p1, room.p2, room.p1.action);
    ejecutarAtaque(room.p2, room.p1, room.p2.action);

    room.p1.action = null;
    room.p2.action = null;
    room.turnCount++;

    broadcastState();
}

wss.on('connection', (ws) => {
    if (room.players.length >= 2) {
        ws.send(JSON.stringify({ type: 'FULL', message: 'La sala está llena' }));
        ws.close();
        return;
    }

    room.players.push(ws);
    const isP1 = room.p1.ws === null;

    if (isP1) {
        room.p1.ws = ws;
        // NOTA: Ahora enviamos role: 'p1'
        ws.send(JSON.stringify({ type: 'INIT', message: 'Eres el Jugador 1 (Izanagi). Esperando a que se una el rival...', role: 'p1' }));
    } else {
        room.p2.ws = ws;
        room.status = 'PLAYING';
        // NOTA: Ahora enviamos role: 'p2'
        ws.send(JSON.stringify({ type: 'INIT', message: 'Eres el Jugador 2 (Jiraiya). ¡Batalla lista!', role: 'p2' }));
        broadcastLog(`<span style="color: #48c774;">¡Ambos jugadores conectados! Empieza la batalla.</span>`);
        broadcastState();
    }

    ws.on('message', (data) => {
        const message = JSON.parse(data);

        if (message.type === 'ACTION' && room.status === 'PLAYING') {
            if (ws === room.p1.ws) {
                room.p1.action = message;
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: `<span style="color: #aaa;">Has elegido ${message.skill}. Esperando al oponente...</span>` }));
            } else if (ws === room.p2.ws) {
                room.p2.action = message;
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: `<span style="color: #aaa;">Has elegido ${message.skill}. Esperando al oponente...</span>` }));
            }

            if (room.p1.action !== null && room.p2.action !== null) {
                resolverTurno();
            }
        }
        
        if (message.type === 'CHAT') {
            broadcastLog(`<strong style="color: #ffaa99;">Player:</strong> ${message.text}`);
        }
    });

    ws.on('close', () => {
        room.players = room.players.filter(p => p !== ws);
        if (ws === room.p1.ws) room.p1.ws = null;
        if (ws === room.p2.ws) room.p2.ws = null;
        
        room.status = 'WAITING';
        room.p1.action = null;
        room.p2.action = null;
        
        broadcastLog(`<span style="color: #ff4444;">El oponente se ha desconectado. Esperando un nuevo jugador...</span>`);
        broadcastState();
    });
});

console.log(`Servidor de Persona Showdown corriendo en el puerto ${PORT}`);
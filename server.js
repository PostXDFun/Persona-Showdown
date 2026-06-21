const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let allClients = [];
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
    const safeState = {
        status: room.status, turnCount: room.turnCount,
        p1: { name: room.p1.name, hpMax: room.p1.hpMax, hp: room.p1.hp, moves: room.p1.moves },
        p2: { name: room.p2.name, hpMax: room.p2.hpMax, hp: room.p2.hp, moves: room.p2.moves }
    };
    const message = JSON.stringify({ type: 'UPDATE_STATE', state: safeState });
    room.players.forEach(p => { if (p.readyState === p.OPEN) p.send(message); });
}

function broadcastBattleLog(htmlMessage) {
    const message = JSON.stringify({ type: 'BATTLE_LOG', message: htmlMessage });
    room.players.forEach(p => { if (p.readyState === p.OPEN) p.send(message); });
}

function broadcastLobbyLog(htmlMessage) {
    const message = JSON.stringify({ type: 'LOBBY_LOG', message: htmlMessage });
    allClients.forEach(c => { if (c.readyState === c.OPEN) c.send(message); });
}

// --- FUNCIÓN PARA ACTUALIZAR STATS AL CAMBIAR ---
function efectuarCambio(jugador, nuevaPersona) {
    broadcastBattleLog(`<b>¡Adelante, ${nuevaPersona}!</b>`);
    jugador.name = nuevaPersona;
    
    // El servidor necesita saber los stats de las Personas
    const SERVER_COMPENDIUM = {
        "Izanagi": { hpMax: 150, weakness: "Wind", moves: [{ name: "Zio", type: "Electric", sp: "4 SP" }, { name: "Cleave", type: "Physical", sp: "10% HP" }] },
        "Jiraiya": { hpMax: 120, weakness: "Electric", moves: [{ name: "Garu", type: "Wind", sp: "3 SP" }, { name: "Brave Blade", type: "Physical", sp: "20% HP" }] },
        "Jack Frost": { hpMax: 130, weakness: "Fire", moves: [{ name: "Bufu", type: "Ice", sp: "4 SP" }, { name: "Mabufu", type: "Ice", sp: "10 SP" }] },
        "Thanatos": { hpMax: 200, weakness: "Light", moves: [{ name: "Megidolaon", type: "Almighty", sp: "30 SP" }, { name: "Maeigaon", type: "Curse", sp: "22 SP" }] }
    };

    if (SERVER_COMPENDIUM[nuevaPersona]) {
        jugador.hpMax = SERVER_COMPENDIUM[nuevaPersona].hpMax;
        jugador.hp = SERVER_COMPENDIUM[nuevaPersona].hpMax; // Nota: Cura al cambiar (se puede mejorar después)
        jugador.weakness = SERVER_COMPENDIUM[nuevaPersona].weakness;
        jugador.moves = SERVER_COMPENDIUM[nuevaPersona].moves;
    }
}

function ejecutarAtaque(atacante, defensor, accion) {
    if (atacante.hp <= 0) return; 
    broadcastBattleLog(`<b>${atacante.name}</b> used <b>${accion.skill}</b>!`);
    
    let damage = Math.floor(Math.random() * (25 - 15 + 1)) + 15; 
    if (accion.skillType === defensor.weakness) {
        damage = damage * 2;
        broadcastBattleLog(`<span style="color:#ffee00; font-weight:bold;">It's super effective!</span> (Opposing ${defensor.name} is weak to ${accion.skillType})`);
    }

    defensor.hp -= damage;
    if (defensor.hp < 0) defensor.hp = 0;

    let damagePercent = Math.floor((damage / defensor.hpMax) * 100);
    broadcastBattleLog(`<span class="log-damage">(The opposing ${defensor.name} lost ${damagePercent}% of its health!)</span>`);
}

async function resolverTurno() {
    broadcastBattleLog(`<div class="log-turn">Turn ${room.turnCount}</div>`);
    await sleep(1000); 

    // Fase 1: Cambios (Tienen prioridad sobre los ataques)
    if (room.p1.action.type === 'SWITCH') {
        efectuarCambio(room.p1, room.p1.action.persona);
        broadcastState();
        await sleep(1500);
    }
    if (room.p2.action.type === 'SWITCH') {
        efectuarCambio(room.p2, room.p2.action.persona);
        broadcastState();
        await sleep(1500);
    }

    // Fase 2: Ataques
    if (room.p1.action.type === 'ACTION' && room.p1.hp > 0) {
        ejecutarAtaque(room.p1, room.p2, room.p1.action);
        broadcastState();
        await sleep(2000); 
    }
    if (room.p2.action.type === 'ACTION' && room.p2.hp > 0) {
        ejecutarAtaque(room.p2, room.p1, room.p2.action);
        broadcastState();
        await sleep(1000);
    }

    room.p1.action = null;
    room.p2.action = null;
    room.turnCount++;
}

function resetearSala() {
    room.p1.hp = room.p1.hpMax;
    room.p2.hp = room.p2.hpMax;
    room.turnCount = 1;
    room.p1.action = null;
    room.p2.action = null;
}

wss.on('connection', (ws) => {
    allClients.push(ws);
    ws.send(JSON.stringify({ type: 'LOBBY_LOG', message: '<span style="color: cyan;">Conectado al servidor central. Presiona "Battle!" para buscar partida.</span>' }));

    ws.on('message', (data) => {
        const message = JSON.parse(data);

        if (message.type === 'CHAT_LOBBY') {
            broadcastLobbyLog(`<strong>Usuario:</strong> ${message.text}`);
        }
        else if (message.type === 'CHAT_BATTLE') {
            broadcastBattleLog(`<strong style="color: #ffaa99;">Player:</strong> ${message.text}`);
        }
        else if (message.type === 'SEARCH_MATCH') {
            if (room.players.includes(ws)) return; 
            if (room.players.length >= 2) {
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: '<span style="color: red;">Las arenas están llenas actualmente. Intenta de nuevo más tarde.</span>' }));
                return;
            }
            room.players.push(ws);
            const isP1 = room.p1.ws === null;
            if (isP1) {
                room.p1.ws = ws;
                ws.send(JSON.stringify({ type: 'INIT', message: 'Buscando rival... (Jugarás como Izanagi)', role: 'p1' }));
                resetearSala();
                broadcastState();
            } else {
                room.p2.ws = ws;
                room.status = 'PLAYING';
                ws.send(JSON.stringify({ type: 'INIT', message: '¡Rival encontrado! (Jugarás como Jiraiya)', role: 'p2' }));
                broadcastBattleLog(`<span style="color: #48c774;">¡Ambos jugadores conectados! Empieza la batalla.</span>`);
                broadcastState();
            }
        }
        // Atrapamos tanto ACTION como SWITCH
        else if ((message.type === 'ACTION' || message.type === 'SWITCH') && room.status === 'PLAYING') {
            const accionTexto = message.type === 'SWITCH' ? `cambiar a ${message.persona}` : `usar ${message.skill}`;
            
            if (ws === room.p1.ws) {
                room.p1.action = message;
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: `<span style="color: #aaa;">Has decidido ${accionTexto}. Esperando al oponente...</span>` }));
            } else if (ws === room.p2.ws) {
                room.p2.action = message;
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: `<span style="color: #aaa;">Has decidido ${accionTexto}. Esperando al oponente...</span>` }));
            }

            // Si ambos jugadores enviaron su movimiento, resolvemos
            if (room.p1.action !== null && room.p2.action !== null) {
                resolverTurno();
            }
        }
    });

    ws.on('close', () => {
        allClients = allClients.filter(c => c !== ws);
        if (room.players.includes(ws)) {
            room.players = room.players.filter(p => p !== ws);
            if (ws === room.p1.ws) room.p1.ws = null;
            if (ws === room.p2.ws) room.p2.ws = null;
            room.status = 'WAITING';
            broadcastBattleLog(`<span style="color: #ff4444;">El oponente ha huido de la batalla. Victoria por abandono.</span>`);
            broadcastState();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor de Persona Showdown corriendo en el puerto ${PORT}`);
});
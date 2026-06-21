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

// --- COMPENDIO OFICIAL GLOBAL DEL SERVIDOR ---
const SERVER_COMPENDIUM = {
    "Izanagi": { hpMax: 150, weakness: "Wind", moves: [{ name: "Zio", type: "Electric", sp: "4 SP" }, { name: "Cleave", type: "Physical", sp: "10% HP" }, { name: "Rakunda", type: "Support", sp: "8 SP" }, { name: "Tarukaja", type: "Support", sp: "8 SP" }] },
    "Jiraiya": { hpMax: 120, weakness: "Electric", moves: [{ name: "Garu", type: "Wind", sp: "3 SP" }, { name: "Brave Blade", type: "Physical", sp: "20% HP" }, { name: "Sukukaja", type: "Support", sp: "12 SP" }, { name: "Dekunda", type: "Support", sp: "10 SP" }] },
    "Jack Frost": { hpMax: 130, weakness: "Fire", moves: [{ name: "Bufu", type: "Ice", sp: "4 SP" }, { name: "Mabufu", type: "Ice", sp: "10 SP" }, { name: "Rakukaja", type: "Support", sp: "8 SP" }, { name: "Lunge", type: "Physical", sp: "10% HP" }] },
    "Thanatos": { hpMax: 200, weakness: "Light", moves: [{ name: "Megidolaon", type: "Almighty", sp: "30 SP" }, { name: "Maeigaon", type: "Curse", sp: "22 SP" }, { name: "Brave Blade", type: "Physical", sp: "20% HP" }, { name: "Mind Charge", type: "Support", sp: "15 SP" }] },
    "Arsene": { hpMax: 110, weakness: "Ice", moves: [{ name: "Eiha", type: "Curse", sp: "4 SP" }, { name: "Cleave", type: "Physical", sp: "10% HP" }, { name: "Sukunda", type: "Support", sp: "8 SP" }, { name: "Dream Needle", type: "Physical", sp: "12% HP" }] },
    "Apollo": { hpMax: 160, weakness: "Ice", moves: [{ name: "Agi", type: "Fire", sp: "4 SP" }, { name: "Maragi", type: "Fire", sp: "10 SP" }, { name: "Tarukaja", type: "Support", sp: "8 SP" }, { name: "Nova Cygnus", type: "Almighty", sp: "50 SP" }] }
};

let allClients = [];
let room = {
    status: 'WAITING',
    players: [],
    p1: { ws: null, name: "", hpMax: 100, hp: 100, weakness: "", action: null, team: [], teamState: {}, moves: [] },
    p2: { ws: null, name: "", hpMax: 100, hp: 100, weakness: "", action: null, team: [], teamState: {}, moves: [] },
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

// Verifica si a un jugador le quedan Personas con vida en su mochila
function tienePersonasVivas(jugador) {
    return jugador.team.some(personaName => jugador.teamState[personaName] > 0);
}

function efectuarCambio(jugador, nuevaPersona) {
    broadcastBattleLog(`<b>¡Adelante, ${nuevaPersona}!</b>`);
    
    // Guardamos la vida del que se retira (si seguía vivo)
    jugador.teamState[jugador.name] = jugador.hp;
    jugador.name = nuevaPersona;
    
    if (SERVER_COMPENDIUM[nuevaPersona]) {
        jugador.hpMax = SERVER_COMPENDIUM[nuevaPersona].hpMax;
        jugador.weakness = SERVER_COMPENDIUM[nuevaPersona].weakness;
        jugador.moves = SERVER_COMPENDIUM[nuevaPersona].moves;
        jugador.hp = jugador.teamState[nuevaPersona]; // Carga sus HP reales
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

    // Sincronizamos inmediatamente el daño en su mochila de equipo
    defensor.teamState[defensor.name] = defensor.hp;

    let damagePercent = Math.floor((damage / defensor.hpMax) * 100);
    broadcastBattleLog(`<span class="log-damage">(The opposing ${defensor.name} lost ${damagePercent}% of its health!)</span>`);
}

async function resolverTurno() {
    room.status = 'RESOLVING'; 
    broadcastState();

    broadcastBattleLog(`<div class="log-turn">Turn ${room.turnCount}</div>`);
    await sleep(1000); 

    // Fase 1: Cambios manuales
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

    // Fase 2: Ataque de P1
    if (room.p1.action.type === 'ACTION' && room.p1.hp > 0) {
        ejecutarAtaque(room.p1, room.p2, room.p1.action);
        broadcastState();
        
        // Si P2 muere, revisamos si tiene más equipo o pierde definitivo
        if (room.p2.hp <= 0) {
            if (!tienePersonasVivas(room.p2)) {
                broadcastBattleLog(`<div class="log-turn" style="color: #ffd700;">¡Player 1 se lleva la victoria! El equipo rival ha sido eliminado por completo.</div>`);
                room.status = 'FINISHED';
                broadcastState();
                return;
            } else {
                // Auto-cambio al siguiente vivo
                const siguiente = room.p2.team.find(p => room.p2.teamState[p] > 0);
                broadcastBattleLog(`<span style="color:#ff4444; font-weight:bold;">¡El Persona de tu oponente cayó! Envía su reserva automáticamente...</span>`);
                efectuarCambio(room.p2, siguiente);
                room.p2.action = { type: 'NONE' }; // Cancela su acción si no se había movido
                broadcastState();
            }
        }
        await sleep(2000); 
    }

    // Fase 3: Ataque de P2
    if (room.p2.action.type === 'ACTION' && room.p2.hp > 0) {
        ejecutarAtaque(room.p2, room.p1, room.p2.action);
        broadcastState();
        
        // Si P1 muere, revisamos si tiene más equipo o pierde definitivo
        if (room.p1.hp <= 0) {
            if (!tienePersonasVivas(room.p1)) {
                broadcastBattleLog(`<div class="log-turn" style="color: #ffd700;">¡Player 2 se lleva la victoria! Tu equipo se ha quedado sin Personas.</div>`);
                room.status = 'FINISHED';
                broadcastState();
                return;
            } else {
                // Auto-cambio al siguiente vivo
                const siguiente = room.p1.team.find(p => room.p1.teamState[p] > 0);
                broadcastBattleLog(`<span style="color:#ff4444; font-weight:bold;">¡Tu Persona se ha debilitado! El sistema saca tu reserva automáticamente...</span>`);
                efectuarCambio(room.p1, siguiente);
                room.p1.action = { type: 'NONE' };
                broadcastState();
            }
        }
        await sleep(1000);
    }

    room.p1.action = null;
    room.p2.action = null;
    room.turnCount++;
    
    room.status = 'PLAYING'; 
    broadcastState();
}

function resetearSala() {
    room.turnCount = 1;
    room.p1.action = null;
    room.p2.action = null;
}

// --- CONEXIONES WEBSOCKET ---
wss.on('connection', (ws) => {
    allClients.push(ws);
    ws.send(JSON.stringify({ type: 'LOBBY_LOG', message: '<span style="color: cyan;">Conectado al servidor central. Arma tu equipo y presiona "Battle!" para buscar partida.</span>' }));

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
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: '<span style="color: red;">Las arenas están llenas actualmente.</span>' }));
                return;
            }
            
            room.players.push(ws);
            const isP1 = room.p1.ws === null;
            
            if (isP1) {
                room.p1.ws = ws;
                room.p1.team = message.team;
                room.p1.name = message.team[0];
                
                // Configurar stats iniciales
                const comp = SERVER_COMPENDIUM[room.p1.name];
                room.p1.hpMax = comp.hpMax;
                room.p1.hp = comp.hpMax;
                room.p1.weakness = comp.weakness;
                room.p1.moves = comp.moves;
                
                // Inicializar mochilas con vida máxima
                room.p1.teamState = {};
                message.team.forEach(p => { room.p1.teamState[p] = SERVER_COMPENDIUM[p].hpMax; });

                resetearSala();
                ws.send(JSON.stringify({ type: 'INIT', message: `Buscando rival... (Tu líder es ${room.p1.name})`, role: 'p1' }));
                broadcastState();
            } else {
                room.p2.ws = ws;
                room.p2.team = message.team;
                room.p2.name = message.team[0];
                
                const comp = SERVER_COMPENDIUM[room.p2.name];
                room.p2.hpMax = comp.hpMax;
                room.p2.hp = comp.hpMax;
                room.p2.weakness = comp.weakness;
                room.p2.moves = comp.moves;
                
                room.p2.teamState = {};
                message.team.forEach(p => { room.p2.teamState[p] = SERVER_COMPENDIUM[p].hpMax; });

                room.status = 'PLAYING';
                ws.send(JSON.stringify({ type: 'INIT', message: `¡Rival encontrado! (Tu líder es ${room.p2.name})`, role: 'p2' }));
                broadcastBattleLog(`<span style="color: #48c774;">¡Ambos jugadores conectados! Empieza la batalla.</span>`);
                broadcastState();
            }
        }
        else if ((message.type === 'ACTION' || message.type === 'SWITCH') && room.status === 'PLAYING') {
            const accionTexto = message.type === 'SWITCH' ? `cambiar a ${message.persona}` : `usar ${message.skill}`;
            
            if (ws === room.p1.ws) {
                room.p1.action = message;
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: `<span style="color: #aaa;">Has decidido ${accionTexto}. Esperando al oponente...</span>` }));
            } else if (ws === room.p2.ws) {
                room.p2.action = message;
                ws.send(JSON.stringify({ type: 'BATTLE_LOG', message: `<span style="color: #aaa;">Has decidido ${accionTexto}. Esperando al oponente...</span>` }));
            }

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
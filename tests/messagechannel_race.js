/**
 * TEST: MessageChannel Race Condition
 * Explora condições de corrida na transferência de mensagens
 * PS4 13.50: messageChannel=true, broadcastChannel=true
 */

export const testMessagechannelRace = {
    id: 'MESSAGECHANNEL_RACE',
    name: 'MessageChannel Race',
    risk: 'HIGH',
    category: 'WORKER',
    description: 'Condição de corrida no postMessage/MessageChannel com transferables',
    ps4Compatible: true,
    
    setup: function() {
        this.raceResults = [];
        this.channels = [];
        this.buffers = [];
        this.transferAttempts = 0;
        this.doubleTransferDetected = false;
        
        // Cria múltiplos canais para testes paralelos
        for (let i = 0; i < 10; i++) {
            try {
                const channel = new MessageChannel();
                const buffer = new ArrayBuffer(1024);
                const view = new Uint32Array(buffer);
                view.fill(0xDEAD0000 + i);
                
                this.channels.push({
                    channel: channel,
                    port1: channel.port1,
                    port2: channel.port2,
                    buffer: buffer,
                    view: view,
                    index: i,
                    transferred: false
                });
                
                this.buffers.push(buffer);
            } catch (e) {
                // Limite de canais no PS4
                break;
            }
        }
        
        // Configura listeners nos ports
        for (const entry of this.channels) {
            entry.port1.onmessage = (e) => {
                this.raceResults.push({
                    channel: entry.index,
                    type: 'message',
                    data: e.data,
                    timestamp: performance.now()
                });
            };
            
            entry.port1.onmessageerror = (e) => {
                this.raceResults.push({
                    channel: entry.index,
                    type: 'error',
                    timestamp: performance.now()
                });
            };
        }
    },
    
    probe: [
        // Probe 0: Número de canais ativos
        function(scenario) {
            return scenario.channels.length;
        },
        
        // Probe 1: Buffers ainda acessíveis?
        function(scenario) {
            try {
                return scenario.buffers[0]?.byteLength ?? 'NULL';
            } catch (e) {
                return 'DETACHED';
            }
        },
        
        // Probe 2: Resultados de race coletados
        function(scenario) {
            return scenario.raceResults.length;
        },
        
        // Probe 3: Views ainda válidas?
        function(scenario) {
            try {
                return '0x' + scenario.channels[0]?.view[0]?.toString(16);
            } catch (e) {
                return 'VIEW_ERROR';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Tenta transferir mesmo buffer por múltiplos canais
        for (let i = 0; i < this.channels.length; i++) {
            const entry = this.channels[i];
            
            try {
                // Tenta transferir buffer pelo port2
                entry.port2.postMessage(
                    { cmd: 'transfer', index: i },
                    [entry.buffer]  // Transfer list
                );
                entry.transferred = true;
                this.transferAttempts++;
            } catch (e) {
                // Buffer já pode ter sido transferido
                this.raceResults.push({
                    channel: i,
                    type: 'transfer_error',
                    error: e.message
                });
            }
        }
        
        // Ataque 2: Tenta usar buffer após transferência
        for (const entry of this.channels) {
            if (entry.transferred) {
                try {
                    // Acesso após transferência (UAF)
                    const val = entry.view[0];
                    this.raceResults.push({
                        channel: entry.index,
                        type: 'post_transfer_access',
                        value: val,
                        bufferLen: entry.buffer.byteLength
                    });
                } catch (e) {
                    // Esperado: detached buffer
                    this.raceResults.push({
                        channel: entry.index,
                        type: 'post_transfer_detached',
                        error: e.message
                    });
                }
            }
        }
        
        // Ataque 3: Fecha ports enquanto mensagens estão em trânsito
        for (const entry of this.channels) {
            try {
                entry.port2.postMessage({ cmd: 'fast', data: Math.random() });
                entry.port2.close(); // Fecha imediatamente após post
            } catch (e) {
                this.raceResults.push({
                    channel: entry.index,
                    type: 'close_race_error',
                    error: e.message
                });
            }
        }
        
        // Ataque 4: BroadcastChannel race
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                const bc = new BroadcastChannel('fuzzer-race');
                const raceBuffer = new ArrayBuffer(64);
                const raceView = new Uint32Array(raceBuffer);
                raceView.fill(0x13371337);
                
                bc.postMessage({ buffer: raceBuffer });
                
                bc.onmessage = (e) => {
                    this.raceResults.push({
                        type: 'broadcast_received',
                        data: e.data
                    });
                };
                
                // Fecha broadcast channel imediatamente
                setTimeout(() => {
                    bc.close();
                    // Tenta postMessage após close
                    try {
                        bc.postMessage({ afterClose: true });
                    } catch (e) {
                        this.raceResults.push({
                            type: 'broadcast_post_close',
                            error: e.message
                        });
                    }
                }, 10);
                
            } catch (e) {
                this.broadcastError = e.message;
            }
        }
        
        // Força GC durante transfers
        if (typeof gc === 'function') {
            gc();
        }
    },
    
    cleanup: function() {
        for (const entry of this.channels) {
            try { entry.port1.close(); } catch (e) {}
            try { entry.port2.close(); } catch (e) {}
        }
        this.channels = null;
        this.buffers = null;
        this.raceResults = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se conseguiu acessar buffer após transferência
        if (this.raceResults) {
            const postTransferAccesses = this.raceResults.filter(
                r => r.type === 'post_transfer_access'
            );
            
            if (postTransferAccesses.length > 0) {
                return {
                    anomaly: true,
                    reason: `💥 UAF VIA TRANSFER: ${postTransferAccesses.length} acessos a buffers transferidos! Valores: ${JSON.stringify(postTransferAccesses.slice(0, 3))}`
                };
            }
        }
        
        // Verifica se double transfer foi possível
        if (this.transferAttempts > this.channels.length) {
            return {
                anomaly: true,
                reason: `🏆 DOUBLE TRANSFER: Mais transferências que canais (${this.transferAttempts} > ${this.channels.length})`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};

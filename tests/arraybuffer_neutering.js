/**
 * TEST: ArrayBuffer Neutering/Detachment
 * Tenta usar buffer após transferência
 * PS4 13.50: SharedArrayBuffer=false, Atomics=true
 */

export const testArraybufferNeutering = {
    id: 'ARRAYBUFFER_NEUTER',
    name: 'ArrayBuffer Neutering',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Tenta acessar ArrayBuffer após detachment via transfer/postMessage',
    ps4Compatible: true,
    
    setup: function() {
        // Cria buffer com padrão conhecido
        this.buffer = new ArrayBuffer(1024);
        this.view32 = new Uint32Array(this.buffer);
        this.view8 = new Uint8Array(this.buffer);
        this.viewFloat = new Float64Array(this.buffer);
        
        // Preenche com padrão único (0xDEADBEEF em cada Uint32)
        for (let i = 0; i < this.view32.length; i++) {
            this.view32[i] = 0xDEADBEEF;
        }
        
        // Armazena referência fraca para detectar coleta
        this.weakBuffer = typeof WeakRef !== 'undefined' ? new WeakRef(this.buffer) : null;
        
        // Cria worker para transferência (se disponível)
        this.worker = null;
        if (typeof Worker !== 'undefined') {
            const workerCode = `
                self.onmessage = function(e) {
                    const buffer = e.data;
                    const view = new Uint8Array(buffer || []);
                    self.postMessage({ length: buffer ? buffer.byteLength : 0, firstByte: view[0] });
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob));
        }
    },
    
    probe: [
        // Probe 0: byteLength do buffer
        function(scenario) {
            try {
                return scenario.buffer?.byteLength ?? 'NULL';
            } catch (e) {
                return 'ERROR_BYTELENGTH';
            }
        },
        
        // Probe 1: Primeiro valor Uint32 (deveria ser 0xDEADBEEF)
        function(scenario) {
            try {
                return '0x' + (scenario.view32?.[0]?.toString(16) ?? 'ERROR');
            } catch (e) {
                return '💥 DETACHED_ACCESS_U32';
            }
        },
        
        // Probe 2: Primeiro byte
        function(scenario) {
            try {
                return scenario.view8?.[0] ?? 'ERROR';
            } catch (e) {
                return '💥 DETACHED_ACCESS_U8';
            }
        },
        
        // Probe 3: WeakRef status
        function(scenario) {
            if (!scenario.weakBuffer) return 'NO_WEAKREF';
            try {
                const deref = scenario.weakBuffer.deref();
                return deref ? 'ALIVE' : 'COLLECTED';
            } catch (e) {
                return 'WEAKREF_ERROR';
            }
        },
        
        // Probe 4: Float64 view access
        function(scenario) {
            try {
                return scenario.viewFloat?.[0] ?? 'ERROR';
            } catch (e) {
                return '💥 DETACHED_ACCESS_F64';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Transferir buffer para worker
        if (this.worker) {
            try {
                this.worker.postMessage(this.buffer, [this.buffer]);
                
                // Espera resposta (timeout curto)
                setTimeout(() => {
                    this.worker?.terminate();
                }, 500);
            } catch (e) {
                // Transfer pode não ser suportada
                this.transferError = e.message;
            }
        }
        
        // Ataque 2: Tentar neutering via slice(0,0)
        try {
            const sliced = this.buffer.slice(0, 0);
        } catch (e) {
            // slice pode falhar
        }
        
        // Ataque 3: Forçar GC e tentar acessar
        if (typeof gc === 'function') {
            gc();
        }
        
        // Ataque 4: Tentar crescer/encolher buffer
        try {
            // Cria novo buffer do mesmo tamanho (pode realocar na mesma região)
            const newBuffer = new ArrayBuffer(1024);
            const newView = new Uint32Array(newBuffer);
            newView[0] = 0xCAFEBABE;
            this.newBuffer = newBuffer;
        } catch (e) {
            this.newBuffer = null;
        }
        
        // Ataque 5: Tenta modificar via DataView
        try {
            const dataView = new DataView(this.buffer);
            dataView.setUint32(0, 0x12345678, true);
        } catch (e) {
            // Acesso a buffer detached deve lançar erro
            this.dataViewError = e.message;
        }
    },
    
    cleanup: function() {
        this.worker?.terminate();
        this.worker = null;
        this.buffer = null;
        this.view32 = null;
        this.view8 = null;
        this.viewFloat = null;
        this.weakBuffer = null;
        this.newBuffer = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Detecta uso após detachment
        const detachedKeywords = ['DETACHED_ACCESS', 'ERROR_BYTELENGTH', 'ERROR'];
        
        for (let i = 0; i < afterResults.length; i++) {
            const result = String(afterResults[i]);
            
            for (const keyword of detachedKeywords) {
                if (result.includes(keyword)) {
                    return {
                        anomaly: true,
                        reason: `💥 BUFFER DETACHED: probe[${i}] = ${result} (acesso após transferência detectado)`
                    };
                }
            }
        }
        
        // Verifica se byteLength diminuiu mas acesso ainda funciona
        if (typeof afterResults[0] === 'number' && afterResults[0] < 1024) {
            if (!String(afterResults[1]).includes('DETACHED')) {
                return {
                    anomaly: true,
                    reason: `🏆 PARTIAL DETACH: byteLength=${afterResults[0]} mas acesso ainda funciona: ${afterResults[1]}`
                };
            }
        }
        
        return { anomaly: false, reason: '' };
    }
};

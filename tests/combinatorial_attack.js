/**
 * TEST: Combinatorial Attack Engine
 * Combina MÚLTIPLAS técnicas aleatoriamente para criar cenários imprevisíveis
 * Usa: length corruption + prototype pollution + type confusion + timing
 */

export const testCombinatorialAttack = {
    id: 'COMBINATORIAL_ATTACK',
    name: '🧬 Combinatorial Attack',
    risk: 'CRITICAL',
    category: 'TYPES',
    description: 'Combina aleatoriamente múltiplas técnicas de ataque para criar cenários únicos',
    ps4Compatible: true,

    setup: function() {
        this.iterationSeed = Math.floor(Math.random() * 1000000);
        this.attackSequence = [];
        this.results = [];
        this.oobDetected = false;
        this.typeConfusions = 0;
        this.heapSprayPatterns = [];
        
        // Gera padrões de spray aleatórios
        for (let i = 0; i < 50; i++) {
            this.heapSprayPatterns.push({
                pattern: Math.floor(Math.random() * 0xFFFFFFFF),
                size: [16, 32, 64, 128, 256][Math.floor(Math.random() * 5)]
            });
        }
    },

    probe: [
        function(scenario) {
            return scenario.oobDetected ? 1 : 0;
        },
        function(scenario) {
            return scenario.typeConfusions;
        },
        function(scenario) {
            return scenario.attackSequence.length;
        },
        function(scenario) {
            return scenario.results.filter(r => r.severity === 'CRITICAL').length;
        }
    ],

    trigger: function() {
        this.attackSequence = [];
        this.results = [];
        this.oobDetected = false;
        this.typeConfusions = 0;
        
        // ==========================================
        // GERADOR DE SEQUÊNCIA DE ATAQUE
        // ==========================================
        const techniques = [
            'length_corruption',
            'prototype_pollution',
            'descriptor_bypass',
            'species_confusion',
            'iterator_poison',
            'heap_spray',
            'gc_pressure',
            'type_juggling',
            'proxy_trap',
            'callback_chain'
        ];
        
        // Seleciona 3-6 técnicas aleatórias
        const numTechniques = 3 + Math.floor(Math.random() * 4);
        const selected = [];
        const shuffled = [...techniques].sort(() => Math.random() - 0.5);
        for (let i = 0; i < numTechniques; i++) {
            selected.push(shuffled[i]);
        }
        
        this.attackSequence = selected;
        
        // ==========================================
        // EXECUTA CADA TÉCNICA EM SEQUÊNCIA
        // ==========================================
        let workingArray = null;
        let workingBuffer = null;
        let workingObject = {};
        
        for (const technique of selected) {
            const result = this.executeTechnique(technique, {
                array: workingArray,
                buffer: workingBuffer,
                object: workingObject,
                iteration: this.iterationSeed
            });
            
            this.results.push(result);
            
            // Atualiza objetos de trabalho
            if (result.newArray) workingArray = result.newArray;
            if (result.newBuffer) workingBuffer = result.newBuffer;
            if (result.newObject) workingObject = result.newObject;
            
            // Propaga detecções
            if (result.oobDetected) this.oobDetected = true;
            if (result.typeConfusion) this.typeConfusions++;
        }
        
        // ==========================================
        // FASE 2: Tenta explorar o estado final
        // ==========================================
        if (workingArray && workingArray.length > 1000) {
            this.exploitCorruptedArray(workingArray, workingBuffer);
        }
        
        if (typeof gc === 'function') gc();
    },

    executeTechnique: function(technique, context) {
        const result = {
            technique: technique,
            timestamp: performance.now(),
            oobDetected: false,
            typeConfusion: false,
            newArray: null,
            newBuffer: null,
            newObject: null,
            details: null
        };
        
        switch (technique) {
            // ==========================================
            // LENGTH CORRUPTION (aleatório)
            // ==========================================
            case 'length_corruption':
                const size = [16, 32, 64, 128][Math.floor(Math.random() * 4)];
                const arr = new Uint32Array(size);
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = 0xDEAD0000 + i;
                }
                
                const corruptLength = 100000 + Math.floor(Math.random() * 900000);
                
                try {
                    Object.defineProperty(arr, 'length', {
                        value: corruptLength,
                        writable: true,
                        configurable: true
                    });
                    
                    if (arr.length === corruptLength) {
                        // Verifica OOB em posições aleatórias
                        const testPositions = [];
                        for (let i = 0; i < 10; i++) {
                            testPositions.push(size + Math.floor(Math.random() * 100));
                        }
                        
                        for (const pos of testPositions) {
                            const val = arr[pos];
                            if (val !== undefined && val !== 0xDEAD0000 && val !== 0) {
                                result.oobDetected = true;
                                result.details = {
                                    corruptedLength: corruptLength,
                                    oobIndex: pos,
                                    leakedValue: '0x' + val.toString(16)
                                };
                                break;
                            }
                        }
                    }
                    
                    result.newArray = arr;
                    result.details = result.details || { corruptedLength: corruptLength, oobFailed: true };
                } catch (e) {
                    result.details = { error: e.message };
                }
                break;
            
            // ==========================================
            // PROTOTYPE POLLUTION (encadeado)
            // ==========================================
            case 'prototype_pollution':
                const pollutionKeys = ['__proto__', 'constructor', 'prototype'];
                const randomKey = pollutionKeys[Math.floor(Math.random() * pollutionKeys.length)];
                const pollutionValue = 'POLLUTED_' + Math.random().toString(36).slice(2);
                
                try {
                    const payload = JSON.parse(`{"${randomKey}":{"polluted":"${pollutionValue}"}}`);
                    
                    // Tenta múltiplos merge paths
                    const targets = [{}, [], new Uint32Array(4)];
                    for (const target of targets) {
                        try {
                            Object.assign(target, payload);
                        } catch (e) {}
                    }
                    
                    // Verifica se poluiu
                    const testObj = {};
                    if (testObj.polluted === pollutionValue) {
                        result.typeConfusion = true;
                        result.details = { pollutionSuccess: true, key: randomKey, value: pollutionValue };
                    }
                    
                    result.newObject = testObj;
                } catch (e) {
                    result.details = { error: e.message };
                }
                break;
            
            // ==========================================
            // HEAP SPRAY (padrões aleatórios)
            // ==========================================
            case 'heap_spray':
                const sprayCount = 50 + Math.floor(Math.random() * 100);
                const sprayed = [];
                
                for (let i = 0; i < sprayCount; i++) {
                    const pattern = this.heapSprayPatterns[i % this.heapSprayPatterns.length];
                    const buf = new ArrayBuffer(pattern.size);
                    const view = new Uint32Array(buf);
                    view.fill(pattern.pattern);
                    sprayed.push({ buffer: buf, view: view, pattern: pattern.pattern });
                }
                
                // Libera alguns aleatoriamente
                for (let i = 0; i < sprayed.length; i += (2 + Math.floor(Math.random() * 3))) {
                    sprayed[i] = null;
                }
                
                if (typeof gc === 'function') gc();
                
                result.details = { sprayCount: sprayCount, patternsUsed: this.heapSprayPatterns.length };
                result.newBuffer = sprayed.find(s => s !== null)?.buffer || null;
                break;
            
            // ==========================================
            // GC PRESSURE (com timing aleatório)
            // ==========================================
            case 'gc_pressure':
                if (typeof gc !== 'function') break;
                
                const pressureCycles = 3 + Math.floor(Math.random() * 7);
                const allocations = [];
                
                for (let i = 0; i < pressureCycles; i++) {
                    // Aloca objetos de tamanhos variados
                    const allocSize = 1024 * (1 + Math.floor(Math.random() * 1024));
                    try {
                        const big = new ArrayBuffer(allocSize);
                        allocations.push(big);
                    } catch (e) {
                        break;
                    }
                    
                    // GC entre alocações
                    if (i % 2 === 0) gc();
                    
                    // Libera alguns
                    if (i % 3 === 0) {
                        allocations[allocations.length - 1] = null;
                    }
                }
                
                gc();
                result.details = { pressureCycles: pressureCycles, totalAllocated: allocations.length };
                break;
            
            // ==========================================
            // TYPE JUGGLING (coerção maliciosa)
            // ==========================================
            case 'type_juggling':
                const values = [
                    0, -0, 1, -1, Infinity, -Infinity, NaN,
                    '', '0', '1', 'true', 'false', 'null', 'undefined',
                    [], {}, [0], {0:0}, null, undefined,
                    true, false, Symbol('test')
                ];
                
                const shuffledVals = [...values].sort(() => Math.random() - 0.5);
                const pair1 = shuffledVals[0];
                const pair2 = shuffledVals[1];
                
                const operations = [];
                
                // Testa TODAS as operações com o par aleatório
                try { operations.push({ op: '==', result: pair1 == pair2 }); } catch(e) {}
                try { operations.push({ op: '===', result: pair1 === pair2 }); } catch(e) {}
                try { operations.push({ op: '+', result: pair1 + pair2 }); } catch(e) {}
                try { operations.push({ op: '-', result: pair1 - pair2 }); } catch(e) {}
                try { operations.push({ op: '*', result: pair1 * pair2 }); } catch(e) {}
                try { operations.push({ op: '>', result: pair1 > pair2 }); } catch(e) {}
                try { operations.push({ op: 'typeof1', result: typeof pair1 }); } catch(e) {}
                try { operations.push({ op: 'typeof2', result: typeof pair2 }); } catch(e) {}
                
                // Detecta confusões
                const type1 = typeof pair1;
                const type2 = typeof pair2;
                const addResult = pair1 + pair2;
                const addType = typeof addResult;
                
                if (addType !== type1 && addType !== type2 && type1 !== type2) {
                    result.typeConfusion = true;
                    result.details = {
                        pair1: { value: String(pair1).slice(0,30), type: type1 },
                        pair2: { value: String(pair2).slice(0,30), type: type2 },
                        addResult: { value: String(addResult).slice(0,30), type: addType }
                    };
                }
                break;
            
            // ==========================================
            // PROXY TRAP (interceptação maliciosa)
            // ==========================================
            case 'proxy_trap':
                const trapTarget = context.array || new Uint32Array(16);
                let trapCount = 0;
                
                const handler = {
                    get(target, prop, receiver) {
                        trapCount++;
                        
                        // Comportamento malicioso após N acessos
                        if (trapCount > 5) {
                            if (prop === 'length') return 1000000;
                            if (typeof prop === 'string' && !isNaN(prop)) {
                                const idx = parseInt(prop);
                                // Retorna valores falsos para índices OOB
                                if (idx >= target.length) {
                                    return 0x13371337;
                                }
                            }
                        }
                        
                        return Reflect.get(target, prop, receiver);
                    },
                    set(target, prop, value, receiver) {
                        trapCount++;
                        
                        // Permite escrita em qualquer índice
                        if (typeof prop === 'string' && !isNaN(prop)) {
                            return Reflect.set(target, prop, value, receiver);
                        }
                        
                        return Reflect.set(target, prop, value, receiver);
                    }
                };
                
                const proxy = new Proxy(trapTarget, handler);
                result.newArray = proxy;
                result.details = { proxyCreated: true, targetLength: trapTarget.length };
                break;
            
            // ==========================================
            // CALLBACK CHAIN (encadeamento profundo)
            // ==========================================
            case 'callback_chain':
                const chainDepth = 5 + Math.floor(Math.random() * 10);
                let chainValue = 0xDEAD0000;
                const chainLog = [];
                
                try {
                    // Cria função recursiva que modifica typed arrays
                    const chainFunc = (depth, arr) => {
                        if (depth <= 0) return arr;
                        
                        chainLog.push(depth);
                        
                        // Operação aleatória
                        const op = Math.floor(Math.random() * 4);
                        switch (op) {
                            case 0: // Tenta mudar length
                                try {
                                    Object.defineProperty(arr, 'length', { value: arr.length * 2 });
                                } catch(e) {}
                                break;
                            case 1: // Tenta acessar OOB
                                try {
                                    const v = arr[arr.length + depth];
                                    if (v !== undefined) chainValue = v;
                                } catch(e) {}
                                break;
                            case 2: // Cria sub-array
                                try {
                                    const sub = arr.subarray(0, arr.length + depth);
                                    return chainFunc(depth - 1, sub);
                                } catch(e) {}
                                break;
                            case 3: // GC no meio
                                if (typeof gc === 'function') gc();
                                break;
                        }
                        
                        return chainFunc(depth - 1, arr);
                    };
                    
                    const baseArr = new Uint32Array(16);
                    baseArr.fill(chainValue);
                    const finalArr = chainFunc(chainDepth, baseArr);
                    
                    result.newArray = finalArr;
                    result.details = { chainDepth: chainDepth, finalLength: finalArr?.length };
                    
                } catch (e) {
                    result.details = { chainDepth: chainDepth, error: e.message };
                }
                break;
        }
        
        return result;
    },

    exploitCorruptedArray: function(arr, buffer) {
        // Se temos um array com length > 1000, tenta leaks agressivos
        const testIndices = [];
        for (let i = 0; i < 50; i++) {
            testIndices.push(arr.length + Math.floor(Math.random() * 1000));
        }
        
        for (const idx of testIndices) {
            try {
                const val = arr[idx];
                if (val !== undefined && val !== 0 && val !== 0xDEAD0000) {
                    this.results.push({
                        technique: 'final_exploit',
                        oobDetected: true,
                        details: {
                            index: idx,
                            value: '0x' + val.toString(16),
                            isPointer: val > 0x100000 && val < 0x7FFFFFFF
                        }
                    });
                    this.oobDetected = true;
                    break;
                }
            } catch (e) {
                break;
            }
        }
    },

    cleanup: function() {
        this.attackSequence = null;
        this.results = null;
        this.heapSprayPatterns = null;
    },

    customValidator: function(baseResults, afterResults) {
        // OOB detectado por qualquer técnica
        const oobResults = this.results?.filter(r => r.oobDetected) || [];
        if (oobResults.length > 0) {
            return {
                anomaly: true,
                reason: `💥💥💥 COMBINATORIAL OOB: ${oobResults.length} técnicas causaram OOB!\n` +
                       `Sequência: ${this.attackSequence?.join(' → ')}\n` +
                       `Detalhes: ${JSON.stringify(oobResults.map(r => r.details), null, 2)}`
            };
        }
        
        // Type confusions detectadas
        if (this.typeConfusions > 0) {
            const confResults = this.results?.filter(r => r.typeConfusion) || [];
            return {
                anomaly: true,
                reason: `🏆 TYPE CONFUSIONS: ${this.typeConfusions} confusões de tipo em ${this.attackSequence?.length} técnicas!\n` +
                       `Técnicas: ${confResults.map(r => r.technique).join(', ')}`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};

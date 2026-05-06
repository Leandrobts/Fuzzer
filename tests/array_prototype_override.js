/**
 * TEST: Array Prototype Override
 * Sobrescreve métodos do Array.prototype para causar comportamentos inesperados
 * PS4 13.50: Arrays padrão disponíveis
 */

export const testArrayPrototypeOverride = {
    id: 'ARRAY_PROTOTYPE_OVERRIDE',
    name: 'Array Prototype Override',
    risk: 'HIGH',
    category: 'PROTO',
    description: 'Sobrescreve métodos do Array.prototype para causar type confusion',
    ps4Compatible: true,

    setup: function() {
        // Salva originais
        this.originalPush = Array.prototype.push;
        this.originalSlice = Array.prototype.slice;
        this.originalSplice = Array.prototype.splice;
        this.originalMap = Array.prototype.map;
        this.originalIndexOf = Array.prototype.indexOf;

        // Arrays de teste
        this.normalArray = [1, 2, 3, 4, 5];
        this.targetArray = new Array(10).fill(0xAAAAAAAA);

        // Resultados
        this.overrideResults = [];
        this.typeConfusionResults = [];
    },

    probe: [
        function(scenario) {
            return scenario.targetArray?.length ?? -1;
        },
        function(scenario) {
            try { return scenario.targetArray[0]; } catch(e) { return -1; }
        },
        function(scenario) {
            return Array.prototype.push === scenario.originalPush ? 'CLEAN' : 'OVERRIDDEN';
        },
        function(scenario) {
            return scenario.normalArray?.length ?? -1;
        }
    ],

    trigger: function() {
        this.overrideResults = [];
        this.typeConfusionResults = [];

        // ==========================================
        // ATAQUE 1: Sobrescrever push com comportamento malicioso
        // ==========================================
        const testArr1 = [...this.targetArray];
        const originalPush = Array.prototype.push;

        try {
            Array.prototype.push = function(...items) {
                // Comportamento malicioso: adiciona mas também modifica length
                const len = this.length;
                for (let i = 0; i < items.length; i++) {
                    this[len + i] = items[i];
                }
                // Tenta setar length para valor ENORME
                Object.defineProperty(this, 'length', { value: 1000000 });
                return this.length;
            };

            testArr1.push(0xBB);
            this.overrideResults.push({
                test: 'PUSH_OVERRIDE',
                newLength: testArr1.length,
                lastElement: testArr1[testArr1.length - 1],
                accessBeyond: (() => {
                    try { return testArr1[20]; } catch(e) { return 'ERROR'; }
                })(),
                success: true
            });
        } catch (e) {
            this.overrideResults.push({ test: 'PUSH_OVERRIDE', error: e.message, success: false });
        } finally {
            Array.prototype.push = originalPush;
        }

        // ==========================================
        // ATAQUE 2: Sobrescrever slice para retornar array maior
        // ==========================================
        const testArr2 = [...this.targetArray];
        const originalSlice = Array.prototype.slice;

        try {
            Array.prototype.slice = function(start, end) {
                const result = originalSlice.call(this, start, end);
                // Tenta expandir o resultado
                result.length = 1000000;
                return result;
            };

            const sliced = testArr2.slice(0, 5);
            this.overrideResults.push({
                test: 'SLICE_OVERRIDE',
                sliceLength: sliced.length,
                accessBeyond: sliced[20],
                success: true
            });
        } catch (e) {
            this.overrideResults.push({ test: 'SLICE_OVERRIDE', error: e.message, success: false });
        } finally {
            Array.prototype.slice = originalSlice;
        }

        // ==========================================
        // ATAQUE 3: Sobrescrever map para retornar tipos diferentes
        // ==========================================
        const testArr3 = [...this.targetArray];
        const originalMap = Array.prototype.map;

        try {
            let callCount = 0;
            Array.prototype.map = function(callback, thisArg) {
                const result = originalMap.call(this, function(...args) {
                    callCount++;
                    // Alterna entre tipos diferentes
                    if (callCount === 1) return 1;
                    if (callCount === 2) return 'string';
                    if (callCount === 3) return {};
                    return callback.apply(this, args);
                }, thisArg);
                return result;
            };

            const mapped = testArr3.map(x => x * 2);
            this.typeConfusionResults.push({
                test: 'MAP_TYPE_CONFUSION',
                mappedLength: mapped.length,
                types: mapped.slice(0, 5).map(v => typeof v),
                success: true
            });
        } catch (e) {
            this.typeConfusionResults.push({ test: 'MAP_TYPE_CONFUSION', error: e.message, success: false });
        } finally {
            Array.prototype.map = originalMap;
        }

        // ==========================================
        // ATAQUE 4: Sobrescrever indexOf para retornar índices OOB
        // ==========================================
        const testArr4 = [...this.targetArray];
        const originalIndexOf = Array.prototype.indexOf;

        try {
            Array.prototype.indexOf = function(searchElement, fromIndex) {
                // Sempre retorna índice OOB
                return this.length + 1000;
            };

            const idx = testArr4.indexOf(0xAAAAAAAA);
            this.overrideResults.push({
                test: 'INDEXOF_OOB_INDEX',
                returnedIndex: idx,
                arrayLength: testArr4.length,
                success: true
            });
        } catch (e) {
            this.overrideResults.push({ test: 'INDEXOF_OOB_INDEX', error: e.message, success: false });
        } finally {
            Array.prototype.indexOf = originalIndexOf;
        }

        // ==========================================
        // ATAQUE 5: Symbol.species para controlar construção
        // ==========================================
        try {
            class MaliciousArray extends Array {
                static get [Symbol.species]() {
                    return function() {
                        const arr = [];
                        Object.defineProperty(arr, 'length', { value: 1000000 });
                        return arr;
                    };
                }
            }

            const malicious = new MaliciousArray(5);
            malicious.fill(0xCCCCCCCC);

            const mapped = malicious.map(x => x * 2);
            this.overrideResults.push({
                test: 'SYMBOL_SPECIES',
                mappedLength: mapped?.length,
                mappedType: mapped?.constructor?.name,
                success: true
            });
        } catch (e) {
            this.overrideResults.push({ test: 'SYMBOL_SPECIES', error: e.message, success: false });
        }

        // Restaura tudo
        Array.prototype.push = this.originalPush;
        Array.prototype.slice = this.originalSlice;
        Array.prototype.splice = this.originalSplice;
        Array.prototype.map = this.originalMap;
        Array.prototype.indexOf = this.originalIndexOf;

        if (typeof gc === 'function') gc();
    },

    cleanup: function() {
        // Garante restauração
        Array.prototype.push = this.originalPush || Array.prototype.push;
        Array.prototype.slice = this.originalSlice || Array.prototype.slice;
        Array.prototype.splice = this.originalSplice || Array.prototype.splice;
        Array.prototype.map = this.originalMap || Array.prototype.map;
        Array.prototype.indexOf = this.originalIndexOf || Array.prototype.indexOf;

        this.targetArray = null;
        this.normalArray = null;
    },

    customValidator: function(baseResults, afterResults) {
        // Verifica se prototype foi restaurado
        if (afterResults[2] === 'OVERRIDDEN') {
            return {
                anomaly: true,
                reason: '⚠️ PROTOTYPE PERSISTENTE: Array.prototype.push continua sobrescrito após cleanup!'
            };
        }

        // Verifica push override
        if (this.overrideResults) {
            for (const r of this.overrideResults) {
                if (r.success && r.newLength && r.newLength > 100) {
                    return {
                        anomaly: true,
                        reason: `💥 PUSH LENGTH CORRUPTION: push alterou length para ${r.newLength} (${r.test})`
                    };
                }
                if (r.success && r.sliceLength && r.sliceLength > 100) {
                    return {
                        anomaly: true,
                        reason: `🏆 SLICE LENGTH CORRUPTION: slice retornou length ${r.sliceLength}`
                    };
                }
            }
        }

        // Verifica map type confusion
        if (this.typeConfusionResults) {
            for (const r of this.typeConfusionResults) {
                if (r.success && r.types) {
                    const uniqueTypes = new Set(r.types);
                    if (uniqueTypes.size > 2) {
                        return {
                            anomaly: true,
                            reason: `💥 MAP TYPE CONFUSION: map retornou ${uniqueTypes.size} tipos diferentes: ${[...uniqueTypes].join(', ')}`
                        };
                    }
                }
            }
        }

        return { anomaly: false, reason: '' };
    }
};
